import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty, PageHeader } from '../components/Field'
import { useDrivers, useExpenses, useVehicles } from '../lib/hooks'
import { CATEGORIES, brl, catInfo, dateBR, num } from '../lib/format'

export default function Expenses() {
  const vehicles = useVehicles()
  const drivers = useDrivers()
  const expenses = useExpenses()
  const [vf, setVf] = useState('')
  const [cf, setCf] = useState('')
  const [month, setMonth] = useState('')

  if (!expenses || !vehicles) return null
  const vName = (id: string) => vehicles.find((v) => v.id === id)?.name ?? '—'
  const dName = (id?: string) => drivers?.find((d) => d.id === id)?.name
  const list = expenses.filter(
    (e) => (!vf || e.vehicleId === vf) && (!cf || e.category === cf) && (!month || e.date.startsWith(month)),
  )
  const total = list.reduce((s, e) => s + e.amount, 0)

  return (
    <>
      <PageHeader title="Despesas" action={<Link className="btn primary" to="/despesas/nova">+ Nova</Link>} />
      {expenses.length === 0 ? (
        <Empty
          icon="💰"
          text="Nenhuma despesa lançada ainda."
          action={<Link className="btn primary" to="/despesas/nova">Lançar a primeira</Link>}
        />
      ) : (
        <>
          <div className="filters">
            <select value={vf} onChange={(e) => setVf(e.target.value)}>
              <option value="">Todos os veículos</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <select value={cf} onChange={(e) => setCf(e.target.value)}>
              <option value="">Todas as categorias</option>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div className="totalbar">
            <span>{list.length} lançamento{list.length === 1 ? '' : 's'}</span>
            <b>{brl(total)}</b>
          </div>
          <div className="list card">
            {list.map((e) => {
              const c = catInfo(e.category)
              const extra = [
                vName(e.vehicleId),
                e.liters ? `${num(e.liters, 2)} L` : '',
                e.odometer ? `${num(e.odometer)} km` : '',
                dName(e.driverId),
              ].filter(Boolean).join(' · ')
              return (
                <Link key={e.id} to={`/despesas/${e.id}`} className="item">
                  <div className="itemicon">{c.icon}</div>
                  <div className="grow">
                    <div className="itemtitle">{e.description || e.supplier || c.label}</div>
                    <div className="muted">{extra}</div>
                  </div>
                  <div className="right">
                    <div className="itemtitle">{brl(e.amount)}</div>
                    <div className="muted">{dateBR(e.date)}</div>
                  </div>
                </Link>
              )
            })}
            {list.length === 0 && <p className="muted pad">Nenhuma despesa com esses filtros.</p>}
          </div>
        </>
      )}
    </>
  )
}
