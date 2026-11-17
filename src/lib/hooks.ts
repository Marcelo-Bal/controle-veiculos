import { useLiveQuery } from 'dexie-react-hooks'
import { alive, db } from './db'

export const useVehicles = () =>
  useLiveQuery(async () => alive(await db.vehicles.toArray()).sort((a, b) => a.name.localeCompare(b.name)), [])

export const useDrivers = () =>
  useLiveQuery(async () => alive(await db.drivers.toArray()).sort((a, b) => a.name.localeCompare(b.name)), [])

export const useExpenses = () =>
  useLiveQuery(
    async () =>
      alive(await db.expenses.toArray()).sort(
        (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
      ),
    [],
  )
