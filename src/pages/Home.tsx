import type { Expense } from '../lib/db'
import { Link } from 'react-router-dom'
import { Empty } from '../components/Field'
import { useDrivers, useExpenses, useVehicles } from '../lib/hooks'
import { alerts, currentOdometer } from '../lib/stats'
import { save } from '../lib/db'
import { brl, catInfo, dateBR, today } from '../lib/format'
import { useSync } from '../lib/sync'

export default function Home() {
  const vehicles = useVehicles()
  const expenses = useExpenses()
  const sync = useSync()
  const drivers = useDrivers()
  if (!vehicles || !expenses) return null
  const banner =
    sync.ready && !sync.family ? (
      <Link to="/ajustes" className="banner">
        <span>☁️ Entre na sua conta para usar os mesmos dados no celular e no computador.</span>
        <b>Entrar ›</b>
      </Link>
    ) : null

  if (vehicles.length === 0)
    return (
      <div className="welcome">
        {banner}
        <h1>Bem-vindo! 👋</h1>
        <p>Aqui você controla os gastos, o consumo e as manutenções dos veículos da família.</p>
        <ol className="steps">
          <li>Cadastre seus veículos</li>
          <li>Cadastre quem dirige (opcional)</li>
          <li>Lance cada abastecimento e despesa</li>
        </ol>
        <Link className="btn primary big" to="/veiculos/novo">Cadastrar o primeiro veículo</Link>
      </div>
    )

  const ym = today().slice(0, 7)
  const lastYm = (() => {
    const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)) - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()
  const sum = (pred: (e: Expense) => boolean) =>
    expenses.filter(pred).reduce((s, e) => s + e.amount, 0)
  const thisMonth = sum((e) => e.date.startsWith(ym))
  const prevMonth = sum((e) => e.date.startsWith(lastYm))
  const year = sum((e) => e.date.startsWith(ym.slice(0, 4)))
  const monthName = new Date().toLocaleDateString('pt-BR', { month: 'long' })

  return (
    <>
      {banner}
      <div className="hero">
        <div className="muted">Gasto em {monthName}</div>
        <div className="heroval">{brl(thisMonth)}</div>
        <div className="muted small">
          Mês anterior: {brl(prevMonth)} · No ano: {brl(year)}
        </div>
        <Link className="btn primary big" to="/despesas/nova">+ Lançar despesa</Link>
      </div>

      {(() => {
        const list = alerts(vehicles, drivers ?? [], expenses)
        if (!list.length) return null
        const done = async (vehicleId: string, reminderId: string) => {
          const v = vehicles.find((x) => x.id === vehicleId)!
          const odo = currentOdometer(expenses, v)
          await save('vehicles', {
            ...v,
            reminders: (v.reminders ?? []).map((r) => (r.id === reminderId ? { ...r, lastKm: odo || r.lastKm, lastDate: today() } : r)),
          })
        }
        return (
          <>
            <h2>🔔 Avisos</h2>
            <div className="card list">
              {list.map((a) => (
                <div key={a.key} className="alert">
                  <span className={'badge ' + (a.level === 'vencido' ? 'red' : 'amber')}>{a.level === 'vencido' ? 'Vencido' : 'Em breve'}</span>
                  <div className="grow">
                    <div className="itemtitle">{a.title}</div>
                    <div className="muted">{a.detail}</div>
                  </div>
                  {a.reminderId && (
                    <button className="btn" onClick={() => confirm(`Marcar "${a.title}" como feito hoje?`) && done(a.vehicleId!, a.reminderId!)}>Feito</button>
                  )}
                </div>
              ))}
            </div>
          </>
        )
      })()}

      <h2>Por veículo neste mês</h2>
      <div className="cards">
        {vehicles.map((v) => (
          <Link key={v.id} to={`/despesas`} className="card link small-card">
            <div className="cardtitle">🚗 {v.name}</div>
            <div className="cardval">{brl(sum((e) => e.vehicleId === v.id && e.date.startsWith(ym)))}</div>
          </Link>
        ))}
      </div>

      <h2>Últimos lançamentos</h2>
      {expenses.length === 0 ? (
        <Empty icon="💰" text="Nenhuma despesa ainda." />
      ) : (
        <div className="list card">
          {expenses.slice(0, 6).map((e) => {
            const c = catInfo(e.category)
            return (
              <Link key={e.id} to={`/despesas/${e.id}`} className="item">
                <div className="itemicon">{c.icon}</div>
                <div className="grow">
                  <div className="itemtitle">{e.description || e.supplier || c.label}</div>
                  <div className="muted">{vehicles.find((v) => v.id === e.vehicleId)?.name}</div>
                </div>
                <div className="right">
                  <div className="itemtitle">{brl(e.amount)}</div>
                  <div className="muted">{dateBR(e.date)}</div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
