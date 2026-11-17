import { useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { TABLES, changes, db, getMeta, setMeta, type Base, type Tbl } from './db'
import { supabase } from './supabase'

export interface Family {
  id: string
  name: string
  invite_code: string
}

export interface SyncState {
  ready: boolean
  email?: string
  family?: Family
  status: 'desligado' | 'sincronizando' | 'ok' | 'offline' | 'erro'
  lastSync?: string
  error?: string
  pending: number
}

let state: SyncState = { ready: false, status: 'desligado', pending: 0 }
const listeners = new Set<() => void>()
const setState = (p: Partial<SyncState>) => {
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}
export const useSync = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  )

// ---------------------------------------------------------------------------
type Row = { id: string; family_id: string; data: Record<string, unknown>; updated_at: string; deleted: boolean; server_updated_at: string }

const t = (iso: string) => Date.parse(iso)
const PAGE = 1000

async function countPending() {
  let n = 0
  for (const tb of TABLES) n += await db[tb].where('synced').equals(0).count()
  setState({ pending: n })
  return n
}

async function pull(tb: Tbl, familyId: string) {
  let since = (await getMeta(`pull:${familyId}:${tb}`)) ?? '1970-01-01T00:00:00Z'
  for (;;) {
    const { data, error } = await supabase
      .from(tb)
      .select('*')
      .eq('family_id', familyId)
      .gt('server_updated_at', since)
      .order('server_updated_at')
      .limit(PAGE)
    if (error) throw error
    const rows = (data ?? []) as Row[]
    if (!rows.length) break
    await db.transaction('rw', db[tb], async () => {
      for (const r of rows) {
        const local = (await db[tb].get(r.id)) as Base | undefined
        // Alteração local ainda não enviada e mais nova que a da nuvem: mantém a local
        if (local && local.synced === 0 && t(local.updatedAt) > t(r.updated_at)) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db[tb] as any).put({ ...r.data, id: r.id, updatedAt: r.updated_at, deleted: r.deleted ? 1 : 0, synced: 1 })
      }
    })
    since = rows[rows.length - 1].server_updated_at
    await setMeta(`pull:${familyId}:${tb}`, since)
    if (rows.length < PAGE) break
  }
}

async function push(tb: Tbl, familyId: string) {
  const pending = (await db[tb].where('synced').equals(0).toArray()) as Base[]
  for (let i = 0; i < pending.length; i += 500) {
    const chunk = pending.slice(i, i + 500)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const rows = chunk.map(({ synced: _s, ...data }) => ({
      id: data.id,
      family_id: familyId,
      data,
      updated_at: data.updatedAt,
      deleted: !!data.deleted,
    }))
    const { error } = await supabase.from(tb).upsert(rows)
    if (error) throw error
    await db.transaction('rw', db[tb], async () => {
      for (const r of chunk) {
        const cur = (await db[tb].get(r.id)) as Base | undefined
        if (cur && cur.updatedAt === r.updatedAt) await db[tb].update(r.id, { synced: 1 })
      }
    })
  }
}

let running: Promise<void> | null = null
let again = false

export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      do {
        again = false
        const fam = state.family
        if (!fam || !state.email) {
          await countPending()
          return
        }
        if (!navigator.onLine) {
          setState({ status: 'offline' })
          await countPending()
          return
        }
        setState({ status: 'sincronizando', error: undefined })
        for (const tb of TABLES) await pull(tb, fam.id)
        for (const tb of TABLES) await push(tb, fam.id)
        await countPending()
        setState({ status: 'ok', lastSync: new Date().toISOString() })
      } while (again)
    } catch (e) {
      console.error(e)
      setState({ status: navigator.onLine ? 'erro' : 'offline', error: (e as Error).message })
    } finally {
      running = null
    }
  })()
  return running
}

let timer: number | undefined
const soon = (ms = 1500) => {
  clearTimeout(timer)
  timer = window.setTimeout(() => void syncNow(), ms)
}

// ---------------------------------------------------------------------------
async function loadFamily(session: Session | null) {
  if (!session) {
    setState({ ready: true, email: undefined, family: undefined, status: 'desligado' })
    await countPending()
    return
  }
  const { data, error } = await supabase.from('families').select('id, name, invite_code').limit(1)
  if (error) {
    setState({ ready: true, email: session.user.email, status: 'erro', error: error.message })
    return
  }
  const family = (data?.[0] as Family | undefined) ?? undefined
  setState({ ready: true, email: session.user.email, family, status: family ? 'ok' : 'desligado' })
  if (family) soon(0)
}

export function startSync() {
  supabase.auth.getSession().then(({ data }) => loadFamily(data.session))
  supabase.auth.onAuthStateChange((ev, session) => {
    if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'USER_UPDATED')
      setTimeout(() => loadFamily(session), 0)
  })
  changes.addEventListener('change', () => {
    void countPending()
    soon()
  })
  window.addEventListener('online', () => soon(0))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && soon(0))
  window.setInterval(() => document.visibilityState === 'visible' && void syncNow(), 60_000)
  void countPending()
}

// ---------------------------------------------------------------------------
const ptErrors: [RegExp, string][] = [
  [/Invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/User already registered/i, 'Este e-mail já tem conta. Use "Entrar".'],
  [/Password should be at least/i, 'A senha precisa ter pelo menos 6 caracteres.'],
  [/Email not confirmed/i, 'Confirme o e-mail pelo link que enviamos e tente de novo.'],
  [/Unable to validate email|invalid format/i, 'E-mail inválido.'],
  [/rate limit/i, 'Muitas tentativas. Aguarde um minuto e tente de novo.'],
  [/Failed to fetch|NetworkError/i, 'Sem conexão com a internet.'],
]
export const errPt = (m: string) => ptErrors.find(([r]) => r.test(m))?.[1] ?? m

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(errPt(error.message))
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: location.href.split('#')[0] },
  })
  if (error) throw new Error(errPt(error.message))
  return { needsConfirmation: !data.session }
}

export async function createFamily(name: string) {
  const { data, error } = await supabase.rpc('create_family', { fname: name })
  if (error) throw new Error(errPt(error.message))
  setState({ family: data as Family })
  await syncNow()
}

export async function joinFamily(code: string) {
  const { data, error } = await supabase.rpc('join_family', { code })
  if (error) throw new Error(errPt(error.message))
  setState({ family: data as Family })
  await syncNow()
}

/** Sai da conta e apaga a cópia local (os dados continuam na nuvem). */
export async function signOut() {
  await syncNow()
  await supabase.auth.signOut()
  await db.transaction('rw', [db.vehicles, db.drivers, db.expenses, db.meta], async () => {
    for (const tb of TABLES) await db[tb].clear()
    await db.meta.clear()
  })
  localStorage.removeItem('ultimo-lancamento')
}
