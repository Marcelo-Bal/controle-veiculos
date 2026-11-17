import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, HBars, LineChart } from '../components/Charts'
import { Empty, PageHeader } from '../components/Field'
import { useExpenses, useVehicles } from '../lib/hooks'
import { CATEGORIES, brl, dateBR, fuelLabel, num, today } from '../lib/format'
import { PERIODS, kmDriven, monthsBetween, periodRange, segments, type PeriodId } from '../lib/stats'

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const brl0 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const brlShort = (v: number) => (v >= 1000 ? `R$ ${num(v / 1000, v >= 10000 ? 0 : 1)} mil` : brl0(v))

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-val">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

export default function Reports() {
  const vehicles = useVehicles()
  const all = useExpenses()
  const [vf, setVf] = useState('')
  const [period, setPeriod] = useState<PeriodId>('12m')
  const [custom, setCustom] = useState({ from: today().slice(0, 8) + '01', to: today() })

  const r = useMemo(() => {
    if (!vehicles || !all) return null
    const { from, to } = periodRange(period, custom)
    const vs = vehicles.filter((v) => !vf || v.id === vf)
    const vIds = new Set(vs.map((v) => v.id))
    const ex = all.filter((e) => vIds.has(e.vehicleId))
    const inP = ex.filter((e) => e.date >= from && e.date <= to)
    const total = inP.reduce((s, e) => s + e.amount, 0)
    const km = vs.reduce((s, v) => s + kmDriven(ex, v, from, to), 0)
    const fuel = inP.filter((e) => e.category === 'combustivel')
    const fuelCost = fuel.reduce((s, e) => s + e.amount, 0)
    const fuelLit = fuel.filter((e) => e.liters).reduce((s, e) => s + e.liters!, 0)
    const fuelCostWithLit = fuel.filter((e) => e.liters).reduce((s, e) => s + e.amount, 0)

    const segs = vs.flatMap((v) => segments(ex, v.id)).filter((s) => s.date >= from && s.date <= to)
    segs.sort((a, b) => a.date.localeCompare(b.date))
    const segKm = segs.reduce((s, x) => s + x.km, 0)
    const segL = segs.reduce((s, x) => s + x.liters, 0)

    // por combustível (útil para carros flex: etanol x gasolina)
    const byFuel = new Map<string, { km: number; l: number; cost: number }>()
    for (const s of segs) {
      if (!s.fuelType) continue
      const a = byFuel.get(s.fuelType) ?? { km: 0, l: 0, cost: 0 }
      a.km += s.km; a.l += s.liters; a.cost += s.cost
      byFuel.set(s.fuelType, a)
    }

    // meses do período (no máximo 24 barras)
    const lastMonth = to > today() ? today().slice(0, 7) : to.slice(0, 7)
    const firstData = inP.length ? inP.map((e) => e.date).sort()[0].slice(0, 7) : lastMonth
    const firstMonth = from < '2000' ? firstData : from.slice(0, 7)
    const nMonths = Math.min(24, monthsBetween(firstMonth, lastMonth))
    const [ly, lm] = lastMonth.split('-').map(Number)
    const months = Array.from({ length: nMonths }, (_, i) => {
      const d = new Date(ly, lm - nMonths + i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      return {
        label: MONTHS[d.getMonth()],
        full: `${MONTHS[d.getMonth()]}/${d.getFullYear()}`,
        value: inP.filter((e) => e.date.startsWith(key)).reduce((s, e) => s + e.amount, 0),
      }
    })
    const periodMonths = from < '2000' ? Math.max(1, monthsBetween(firstData, lastMonth)) : Math.max(1, monthsBetween(from, lastMonth))

    const byCat = CATEGORIES.map((c) => {
      const items = inP.filter((e) => e.category === c.id)
      const v = items.reduce((s, e) => s + e.amount, 0)
      return { label: `${c.icon} ${c.label}`, value: v, extra: total ? `${num((v / total) * 100)}%` : undefined, n: items.length }
    }).filter((x) => x.value > 0).sort((a, b) => b.value - a.value)

    const byVehicle = vs.map((v) => {
      const t = inP.filter((e) => e.vehicleId === v.id).reduce((s, e) => s + e.amount, 0)
      const k = kmDriven(ex, v, from, to)
      return { label: `🚗 ${v.name}`, value: t, extra: k ? `${brl(t / k)}/km` : undefined }
    }).filter((x) => x.value > 0).sort((a, b) => b.value - a.value)

    const kmlByVehicle = vs.map((v) => {
      const sv = segs.filter((x) => x.vehicleId === v.id)
      const k = sv.reduce((a, x) => a + x.km, 0)
      const l = sv.reduce((a, x) => a + x.liters, 0)
      return { label: `🚗 ${v.name}`, value: l ? k / l : 0, extra: l ? `${sv.length} trechos` : undefined }
    }).filter((x) => x.value > 0)
    const multi = kmlByVehicle.length > 1

    return { multi, kmlByVehicle, total, km, fuelCost, fuelLit, fuelCostWithLit, segs, segKm, segL, byFuel, months, periodMonths, byCat, byVehicle, count: inP.length }
  }, [vehicles, all, vf, period, custom])

  if (!vehicles || !all || !r) return null
  if (!all.length)
    return (
      <>
        <PageHeader title="Relatórios" />
        <Empty icon="📊" text="Os relatórios aparecem depois que você lançar algumas despesas." action={<Link className="btn primary" to="/despesas/nova">Lançar despesa</Link>} />
      </>
    )

  const avgKml = r.segL && !r.multi ? r.segKm / r.segL : undefined
  return (
    <>
      <PageHeader title="Relatórios" />
      <div className="filters">
        <select value={vf} onChange={(e) => setVf(e.target.value)}>
          <option value="">Todos os veículos</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)}>
          {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        {period === 'custom' && (
          <div className="row">
            <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="De" />
            <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="Até" />
          </div>
        )}
      </div>

      <div className="kpis">
        <Kpi label="Total gasto" value={brl(r.total)} sub={`${r.count} lançamento${r.count === 1 ? '' : 's'}`} />
        <Kpi label="Média por mês" value={brl(r.total / r.periodMonths)} sub={`${r.periodMonths} ${r.periodMonths === 1 ? 'mês' : 'meses'}`} />
        <Kpi label="Custo por km" value={r.km ? brl(r.total / r.km) : '—'} sub={r.km ? `${num(r.km)} km rodados` : 'informe o hodômetro'} />
        <Kpi
          label="Consumo médio real"
          value={avgKml ? `${num(avgKml, 1)} km/l` : '—'}
          sub={
            r.multi
              ? 'escolha um veículo'
              : avgKml
                ? `${r.segs.length} trecho${r.segs.length === 1 ? '' : 's'} de tanque cheio`
                : 'precisa de 2 tanques cheios'
          }
        />
        <Kpi label="Combustível" value={brl(r.fuelCost)} sub={r.total ? `${num((r.fuelCost / r.total) * 100)}% do total` : undefined} />
        <Kpi label="Litros abastecidos" value={r.fuelLit ? `${num(r.fuelLit, 1)} L` : '—'} />
        <Kpi label="Preço médio do litro" value={r.fuelLit ? brl(r.fuelCostWithLit / r.fuelLit) : '—'} />
        <Kpi label="Combustível por km" value={r.segKm ? brl(r.segs.reduce((s, x) => s + x.cost, 0) / r.segKm) : '—'} />
      </div>

      {r.months.length > 1 && (
        <div className="card">
          <h3>Gasto por mês</h3>
          <BarChart data={r.months} fmt={brl} fmtAxis={brlShort} label="Gasto total por mês" />
        </div>
      )}

      {r.multi && (
        <div className="card">
          <h3>Consumo real por veículo (km/l)</h3>
          <HBars rows={r.kmlByVehicle} fmt={(v) => `${num(v, 1)} km/l`} />
          <p className="muted small">Escolha um veículo no filtro acima para ver a evolução do consumo e a comparação entre combustíveis.</p>
        </div>
      )}

      {r.segs.length > 0 && !r.multi && (
        <div className="card">
          <h3>Consumo real (km/l)</h3>
          {r.segs.length > 1 ? (
            <LineChart
              label="Consumo real por abastecimento"
              avg={avgKml}
              fmt={(v) => `${num(v, 1)}`}
              data={r.segs.map((s) => ({
                label: dateBR(s.date).slice(0, 5),
                full: `${dateBR(s.date)} · ${vehicles.find((v) => v.id === s.vehicleId)?.name}`,
                value: s.kml,
                note: `${num(s.km)} km / ${num(s.liters, 1)} L${s.fuelType ? ' · ' + fuelLabel(s.fuelType) : ''}`,
              }))}
            />
          ) : (
            <p className="muted">Um trecho calculado: {num(r.segs[0].kml, 1)} km/l. Com mais abastecimentos aparece o gráfico.</p>
          )}
          {r.byFuel.size > 1 && (
            <div className="fuelcmp">
              {[...r.byFuel].map(([f, a]) => (
                <div key={f} className="kpi">
                  <div className="kpi-label">{fuelLabel(f as never)}</div>
                  <div className="kpi-val">{num(a.km / a.l, 1)} km/l</div>
                  <div className="kpi-sub">{brl(a.cost / a.km)}/km</div>
                </div>
              ))}
            </div>
          )}
          {r.byFuel.size > 1 && (() => {
            const arr = [...r.byFuel].map(([f, a]) => ({ f, ckm: a.cost / a.km }))
            arr.sort((a, b) => a.ckm - b.ckm)
            return <p className="muted small">💡 Com base nos seus abastecimentos, <b>{fuelLabel(arr[0].f as never)}</b> saiu mais barato por km rodado.</p>
          })()}
        </div>
      )}

      {r.byCat.length > 0 && (
        <div className="card">
          <h3>Por categoria</h3>
          <HBars rows={r.byCat} fmt={brl} />
        </div>
      )}

      {r.byVehicle.length > 1 && (
        <div className="card">
          <h3>Por veículo</h3>
          <HBars rows={r.byVehicle} fmt={brl} />
        </div>
      )}
    </>
  )
}
