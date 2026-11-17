import { useState } from 'react'
import { Field } from './Field'
import { createFamily, joinFamily, signIn, signOut, signUp, syncNow, useSync } from '../lib/sync'

function useAction() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return { busy, err, run, setErr }
}

function Login() {
  const [mode, setMode] = useState<'entrar' | 'criar'>('entrar')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [info, setInfo] = useState('')
  const { busy, err, run } = useAction()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setInfo('')
    run(async () => {
      if (mode === 'entrar') await signIn(email.trim(), pass)
      else {
        const r = await signUp(email.trim(), pass)
        if (r.needsConfirmation)
          setInfo('Conta criada! Enviamos um link para o seu e-mail. Abra o link para confirmar e depois entre aqui.')
      }
    })
  }

  return (
    <form onSubmit={submit} className="form">
      <p className="muted">
        Entre com sua conta para ver os mesmos dados no celular e no computador, e dividir com a família.
      </p>
      <div className="seg">
        <button type="button" className={mode === 'entrar' ? 'on' : ''} onClick={() => setMode('entrar')}>Entrar</button>
        <button type="button" className={mode === 'criar' ? 'on' : ''} onClick={() => setMode('criar')}>Criar conta</button>
      </div>
      <Field label="E-mail">
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Senha" hint={mode === 'criar' ? 'Pelo menos 6 caracteres' : undefined}>
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
      </Field>
      {err && <p className="error">{err}</p>}
      {info && <p className="ok">{info}</p>}
      <button className="btn primary" disabled={busy}>
        {busy ? 'Aguarde…' : mode === 'entrar' ? 'Entrar' : 'Criar conta'}
      </button>
    </form>
  )
}

function ChooseFamily() {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const { busy, err, run } = useAction()
  return (
    <div className="form">
      <p className="muted">
        Os dados ficam numa <b>família</b>. Quem é o primeiro cria a família; os outros entram com o código de convite.
      </p>
      <form className="row end" onSubmit={(e) => { e.preventDefault(); run(() => createFamily(name.trim())) }}>
        <Field label="Criar uma família">
          <input required placeholder="Ex.: Família Silva" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <button className="btn primary" disabled={busy}>Criar</button>
      </form>
      <form className="row end" onSubmit={(e) => { e.preventDefault(); run(() => joinFamily(code)) }}>
        <Field label="Ou entrar com um código de convite">
          <input required placeholder="Ex.: A1B2C3D4" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </Field>
        <button className="btn" disabled={busy}>Entrar</button>
      </form>
      {err && <p className="error">{err}</p>}
      <p className="muted small">Os dados que já estão neste aparelho serão enviados para a família.</p>
    </div>
  )
}

const STATUS: Record<string, string> = {
  ok: '✅ Sincronizado',
  sincronizando: '🔄 Sincronizando…',
  offline: '📴 Sem internet. As alterações serão enviadas quando a conexão voltar.',
  erro: '⚠️ Erro na sincronização',
  desligado: '',
}

export default function Account() {
  const s = useSync()
  const { busy, run } = useAction()
  const [copied, setCopied] = useState(false)
  if (!s.ready) return <p className="muted">Carregando…</p>
  if (!s.email) return <Login />
  if (!s.family)
    return (
      <>
        <p className="muted">Conectado como <b>{s.email}</b></p>
        <ChooseFamily />
        <button className="btn" onClick={() => run(signOut)}>Sair</button>
      </>
    )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(s.family!.invite_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* sem permissão */ }
  }

  return (
    <div className="form">
      <div>
        <div className="cardtitle">👨‍👩‍👧 {s.family.name}</div>
        <div className="muted">Conectado como {s.email}</div>
      </div>
      <div className="invite">
        <div>
          <div className="muted small">Código de convite para a família</div>
          <div className="code">{s.family.invite_code}</div>
        </div>
        <button className="btn" onClick={copy}>{copied ? 'Copiado!' : 'Copiar'}</button>
      </div>
      <div>
        <div>{STATUS[s.status]}</div>
        {s.status === 'erro' && <div className="error small">{s.error}</div>}
        {s.pending > 0 && <div className="muted small">{s.pending} alteração(ões) aguardando envio</div>}
        {s.lastSync && (
          <div className="muted small">Última sincronização: {new Date(s.lastSync).toLocaleString('pt-BR')}</div>
        )}
      </div>
      <div className="actions left">
        <button className="btn" disabled={s.status === 'sincronizando'} onClick={() => syncNow()}>Sincronizar agora</button>
        <button
          className="btn danger"
          disabled={busy}
          onClick={() =>
            confirm('Sair da conta? Os dados serão removidos deste aparelho, mas continuam salvos na nuvem.') &&
            run(signOut)
          }
        >
          Sair
        </button>
      </div>
    </div>
  )
}
