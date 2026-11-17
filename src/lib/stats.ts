import type { Expense, Fuel, Reminder, Vehicle, Driver } from './db'
import { today } from './format'

// ---------------------------------------------------------------- consumo real
export interface Segment {
  vehicleId: string
  date: string // data do abastecimento que fechou o trecho
  km: number
  liters: number
  cost: number
  kml: number
  fuelType?: Fuel // definido quando todo o trecho usou o mesmo combustível
}

/**
 * Consumo real "tanque cheio a tanque cheio": entre dois abastecimentos com tanque
 * cheio, km rodados ÷ litros colocados depois do primeiro (incluindo o segundo).
 * Abastecimentos parciais no meio somam litros. Se faltar litros em algum, o trecho é descartado.
 */
export function segments(expenses: Expense[], vehicleId: string): Segment[] {
  const fuels = expenses
    .filter((e) => e.vehicleId === vehicleId && e.category === 'combustivel' && e.odometer)
    .sort((a, b) => a.odometer! - b.odometer! || a.date.localeCompare(b.date))
  const out: Segment[] = []
  let start: Expense | undefined
  let liters = 0
  let cost = 0
  let valid = true
  const types = new Set<Fuel | undefined>()
  for (const f of fuels) {
    if (!start) {
      if (f.fullTank) start = f
      continue
    }
    if (!f.liters) valid = false
    liters += f.liters ?? 0
    cost += f.amount
    types.add(f.fuelType)
    if (f.fullTank) {
      const km = f.odometer! - start.odometer!
      if (valid && km > 0 && liters > 0 && km / liters < 100)
        out.push({
          vehicleId,
          date: f.date,
          km,
          liters,
          cost,
          kml: km / liters,
          fuelType: types.size === 1 ? [...types][0] : undefined,
        })
      start = f
      liters = 0
      cost = 0
      valid = true
      types.clear()
    }
  }
  return out
}

// ---------------------------------------------------------------- períodos
export type PeriodId = 'mes' | 'mesant' | '3m' | '6m' | '12m' | 'ano' | 'tudo' | 'custom'

export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: 'mes', label: 'Este mês' },
  { id: 'mesant', label: 'Mês passado' },
  { id: '3m', label: 'Últimos 3 meses' },
  { id: '6m', label: 'Últimos 6 meses' },
  { id: '12m', label: 'Últimos 12 meses' },
  { id: 'ano', label: 'Este ano' },
  { id: 'tudo', label: 'Todo o período' },
  { id: 'custom', label: 'Personalizado' },
]

const iso = (d: Date) => {
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 10)
}

export function periodRange(p: PeriodId, custom?: { from: string; to: string }): { from: string; to: string } {
  const t = new Date()
  const y = t.getFullYear()
  const m = t.getMonth()
  switch (p) {
    case 'mes': return { from: iso(new Date(y, m, 1)), to: today() }
    case 'mesant': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) }
    case '3m': return { from: iso(new Date(y, m - 2, 1)), to: today() }
    case '6m': return { from: iso(new Date(y, m - 5, 1)), to: today() }
    case '12m': return { from: iso(new Date(y, m - 11, 1)), to: today() }
    case 'ano': return { from: `${y}-01-01`, to: today() }
    case 'tudo': return { from: '1900-01-01', to: '2999-12-31' }
    case 'custom': return custom ?? { from: '1900-01-01', to: '2999-12-31' }
  }
}

export const monthsBetween = (from: string, to: string) => {
  const [y1, m1] = from.split('-').map(Number)
  const [y2, m2] = to.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1) + 1
}

/** km rodados no período: do último hodômetro anterior ao período até o maior dentro dele. */
export function kmDriven(expenses: Expense[], vehicle: Vehicle, from: string, to: string) {
  const odos = expenses.filter((e) => e.vehicleId === vehicle.id && e.odometer)
  const inside = odos.filter((e) => e.date >= from && e.date <= to).map((e) => e.odometer!)
  if (!inside.length) return 0
  const before = odos.filter((e) => e.date < from).map((e) => e.odometer!)
  const base = before.length ? Math.max(...before) : Math.min(vehicle.initialOdometer ?? Infinity, ...inside)
  return Math.max(0, Math.max(...inside) - base)
}

export function currentOdometer(expenses: Expense[], vehicle: Vehicle) {
  return Math.max(
    vehicle.initialOdometer ?? 0,
    ...expenses.filter((e) => e.vehicleId === vehicle.id).map((e) => e.odometer ?? 0),
  )
}

// ---------------------------------------------------------------- lembretes
export type DueState = 'vencido' | 'proximo' | 'ok' | 'sem-dados'

export interface DueInfo {
  state: DueState
  nextKm?: number
  nextDate?: string
  kmLeft?: number
  daysLeft?: number
}

const addMonths = (isoDate: string, n: number) => {
  const [y, m, d] = isoDate.split('-').map(Number)
  return iso(new Date(y, m - 1 + n, d))
}
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

export function reminderDue(r: Reminder, odo: number): DueInfo {
  const info: DueInfo = { state: 'sem-dados' }
  const states: DueState[] = []
  if (r.everyKm && r.lastKm !== undefined) {
    info.nextKm = r.lastKm + r.everyKm
    info.kmLeft = info.nextKm - odo
    states.push(info.kmLeft <= 0 ? 'vencido' : info.kmLeft <= Math.min(1000, r.everyKm * 0.1) ? 'proximo' : 'ok')
  }
  if (r.everyMonths && r.lastDate) {
    info.nextDate = addMonths(r.lastDate, r.everyMonths)
    info.daysLeft = days(today(), info.nextDate)
    states.push(info.daysLeft <= 0 ? 'vencido' : info.daysLeft <= 30 ? 'proximo' : 'ok')
  }
  if (states.includes('vencido')) info.state = 'vencido'
  else if (states.includes('proximo')) info.state = 'proximo'
  else if (states.length) info.state = 'ok'
  return info
}

export interface Alert {
  key: string
  level: 'vencido' | 'proximo'
  title: string
  detail: string
  vehicleId?: string
  reminderId?: string
}

export function alerts(vehicles: Vehicle[], drivers: Driver[], expenses: Expense[]): Alert[] {
  const out: Alert[] = []
  const t = today()
  for (const v of vehicles) {
    const odo = currentOdometer(expenses, v)
    for (const r of v.reminders ?? []) {
      const d = reminderDue(r, odo)
      if (d.state !== 'vencido' && d.state !== 'proximo') continue
      const parts: string[] = []
      if (d.kmLeft !== undefined)
        parts.push(d.kmLeft <= 0 ? `passou ${Math.abs(d.kmLeft).toLocaleString('pt-BR')} km` : `faltam ${d.kmLeft.toLocaleString('pt-BR')} km`)
      if (d.daysLeft !== undefined)
        parts.push(d.daysLeft <= 0 ? `venceu há ${Math.abs(d.daysLeft)} dias` : `faltam ${d.daysLeft} dias`)
      out.push({ key: v.id + r.id, level: d.state, title: `${r.title} · ${v.name}`, detail: parts.join(' · '), vehicleId: v.id, reminderId: r.id })
    }
  }
  for (const dr of drivers) {
    if (!dr.cnhExpiry) continue
    const left = days(t, dr.cnhExpiry)
    if (left <= 30)
      out.push({
        key: 'cnh' + dr.id,
        level: left <= 0 ? 'vencido' : 'proximo',
        title: `CNH de ${dr.name}`,
        detail: left <= 0 ? `venceu há ${Math.abs(left)} dias` : `vence em ${left} dias`,
      })
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'vencido' ? -1 : 1))
}

export const REMINDER_PRESETS: Omit<Reminder, 'id' | 'lastKm' | 'lastDate'>[] = [
  { title: 'Troca de óleo e filtro', everyKm: 10000, everyMonths: 12 },
  { title: 'Rodízio e alinhamento', everyKm: 10000 },
  { title: 'Filtro de ar', everyKm: 15000, everyMonths: 12 },
  { title: 'Fluido de freio', everyMonths: 24 },
  { title: 'Correia dentada', everyKm: 50000, everyMonths: 48 },
  { title: 'Revisão geral', everyKm: 10000, everyMonths: 12 },
]
