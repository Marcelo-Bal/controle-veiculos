import Dexie, { type EntityTable } from 'dexie'

/** Campos comuns, preparados para a sincronização com a nuvem. */
export interface Base {
  id: string
  createdAt: string
  updatedAt: string
  deleted?: 0 | 1
}

export type Fuel = 'gasolina' | 'etanol' | 'diesel' | 'gnv' | 'eletrico' | 'flex'

export interface Vehicle extends Base {
  name: string // apelido, ex.: "Carro da Ana"
  brand: string
  model: string
  year?: number
  plate: string
  renavam?: string
  chassis?: string
  color?: string
  fuel: Fuel
  tankLiters?: number
  initialOdometer?: number
  notes?: string
}

export interface Driver extends Base {
  name: string
  cpf?: string
  cnhNumber?: string
  cnhCategory?: string
  cnhExpiry?: string // AAAA-MM-DD
  phone?: string
}

export type Category =
  | 'combustivel'
  | 'manutencao'
  | 'pneus'
  | 'lavagem'
  | 'estacionamento'
  | 'pedagio'
  | 'seguro'
  | 'ipva'
  | 'licenciamento'
  | 'multa'
  | 'financiamento'
  | 'outros'

export interface Expense extends Base {
  vehicleId: string
  driverId?: string
  category: Category
  date: string // AAAA-MM-DD
  amount: number // R$
  odometer?: number // km no momento da despesa
  description?: string
  supplier?: string // posto, oficina...
  // combustível
  fuelType?: Fuel
  liters?: number
  pricePerLiter?: number
  fullTank?: boolean
  // nota fiscal (etapa 3)
  invoiceKey?: string
}

export const db = new Dexie('controle-veiculos') as Dexie & {
  vehicles: EntityTable<Vehicle, 'id'>
  drivers: EntityTable<Driver, 'id'>
  expenses: EntityTable<Expense, 'id'>
}

db.version(1).stores({
  vehicles: 'id, updatedAt, deleted',
  drivers: 'id, updatedAt, deleted',
  expenses: 'id, vehicleId, driverId, category, date, updatedAt, deleted, [vehicleId+date]',
})

const now = () => new Date().toISOString()

export function newBase(): Base {
  const t = now()
  return { id: crypto.randomUUID(), createdAt: t, updatedAt: t, deleted: 0 }
}

type Tbl = 'vehicles' | 'drivers' | 'expenses'

export async function save<T extends Base>(table: Tbl, rec: T) {
  const r = { ...rec, updatedAt: now() }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db[table] as any).put(r)
  return r
}

export async function remove(table: Tbl, id: string) {
  // exclusão "suave": mantém o registro marcado, para a sincronização propagar
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db[table] as any).update(id, { deleted: 1, updatedAt: now() })
}

export const alive = <T extends Base>(rows: T[]) => rows.filter((r) => !r.deleted)
