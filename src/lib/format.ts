import type { Category, Fuel } from './db'

export const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const num = (v: number, d = 0) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })

export const dateBR = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export const today = () => {
  const d = new Date()
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 10)
}

/** Converte "1.234,56" ou "1234.56" em número. */
export const parseNum = (s: string): number | undefined => {
  const t = s.trim()
  if (!t) return undefined
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(norm)
  return Number.isFinite(n) ? n : undefined
}

export const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: 'combustivel', label: 'Combustível', icon: '⛽' },
  { id: 'manutencao', label: 'Manutenção', icon: '🔧' },
  { id: 'pneus', label: 'Pneus', icon: '🛞' },
  { id: 'lavagem', label: 'Lavagem', icon: '🧽' },
  { id: 'estacionamento', label: 'Estacionar', icon: '🅿️' },
  { id: 'pedagio', label: 'Pedágio', icon: '🛣️' },
  { id: 'seguro', label: 'Seguro', icon: '🛡️' },
  { id: 'ipva', label: 'IPVA', icon: '🏛️' },
  { id: 'licenciamento', label: 'Licenciamento', icon: '📄' },
  { id: 'multa', label: 'Multa', icon: '🚨' },
  { id: 'financiamento', label: 'Financiamento', icon: '🏦' },
  { id: 'outros', label: 'Outros', icon: '📦' },
]

export const catInfo = (c: Category) => CATEGORIES.find((x) => x.id === c)!

export const FUELS: { id: Fuel; label: string }[] = [
  { id: 'flex', label: 'Flex (gasolina/etanol)' },
  { id: 'gasolina', label: 'Gasolina' },
  { id: 'etanol', label: 'Etanol' },
  { id: 'diesel', label: 'Diesel' },
  { id: 'gnv', label: 'GNV' },
  { id: 'eletrico', label: 'Elétrico' },
]

export const fuelLabel = (f?: Fuel) => FUELS.find((x) => x.id === f)?.label ?? ''
