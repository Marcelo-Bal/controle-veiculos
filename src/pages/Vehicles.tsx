import { Link } from 'react-router-dom'
import { Empty, PageHeader } from '../components/Field'
import { useExpenses, useVehicles } from '../lib/hooks'
import { brl, fuelLabel, num } from '../lib/format'

export default function Vehicles() {
  const vehicles = useVehicles()
  const expenses = useExpenses()
  if (!vehicles) return null
  return (
    <>
      <PageHeader title="Veículos" action={<Link className="btn primary" to="/veiculos/novo">+ Novo</Link>} />
      {vehicles.length === 0 ? (
        <Empty
          icon="🚗"
          text="Nenhum veículo cadastrado ainda. Comece cadastrando o primeiro."
          action={<Link className="btn primary" to="/veiculos/novo">Cadastrar veículo</Link>}
        />
      ) : (
        <div className="cards">
          {vehicles.map((v) => {
            const ex = (expenses ?? []).filter((e) => e.vehicleId === v.id)
            const total = ex.reduce((s, e) => s + e.amount, 0)
            const km = Math.max(v.initialOdometer ?? 0, ...ex.map((e) => e.odometer ?? 0))
            return (
              <Link key={v.id} to={`/veiculos/${v.id}`} className="card link">
                <div className="cardtitle">{v.name}</div>
                <div className="muted">
                  {[v.brand, v.model, v.year].filter(Boolean).join(' ')} · {v.plate || 'sem placa'}
                </div>
                <div className="stats">
                  <div><span className="muted">Combustível</span>{fuelLabel(v.fuel)}</div>
                  <div><span className="muted">Hodômetro</span>{km ? `${num(km)} km` : '—'}</div>
                  <div><span className="muted">Total gasto</span>{brl(total)}</div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
