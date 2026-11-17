import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Empty, Field, PageHeader } from '../components/Field'
import { db, newBase, remove, save, type Category, type Expense } from '../lib/db'
import { CATEGORIES, FUELS, brl, num, parseNum, today } from '../lib/format'
import { useDrivers, useExpenses, useVehicles } from '../lib/hooks'
import Scanner from '../components/Scanner'
import { consultarNota, nomePorCnpj, notaParaDespesa, parseScan } from '../lib/nfe'

const LAST = 'ultimo-lancamento'
const getLast = (): { vehicleId?: string; driverId?: string } => {
  try {
    return JSON.parse(localStorage.getItem(LAST) || '{}')
  } catch {
    return {}
  }
}

const fmt = (n?: number, d = 2) => (n === undefined ? '' : num(n, d))

export default function ExpenseForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const vehicles = useVehicles()
  const drivers = useDrivers()
  const all = useExpenses()
  const [e, setE] = useState<Expense | null>(null)
  const [amount, setAmount] = useState('')
  const [liters, setLiters] = useState('')
  const [price, setPrice] = useState('')
  const [odo, setOdo] = useState('')
  const [params] = useSearchParams()
  const [scanning, setScanning] = useState(params.get('scan') === '1')
  const [lookup, setLookup] = useState<{ state: 'buscando' | 'ok' | 'parcial' | 'erro'; msg: string; aviso?: string; url?: string } | null>(null)

  useEffect(() => {
    if (id) {
      db.expenses.get(id).then((r) => {
        if (!r) return nav('/despesas')
        setE(r)
        setAmount(fmt(r.amount))
        setLiters(fmt(r.liters, 3).replace(/0+$/, '').replace(/,$/, ''))
        setPrice(fmt(r.pricePerLiter, 3))
        setOdo(r.odometer?.toString() ?? '')
      })
    } else if (vehicles && !e) {
      const last = getLast()
      const vehicleId = vehicles.find((v) => v.id === last.vehicleId)?.id ?? vehicles[0]?.id ?? ''
      setE({
        ...newBase(),
        vehicleId,
        driverId: last.driverId,
        category: 'combustivel',
        date: today(),
        amount: 0,
        fullTank: true,
        fuelType: undefined,
      })
    }
  }, [id, nav, vehicles, e])

  const vehicle = vehicles?.find((v) => v.id === e?.vehicleId)
  const lastOdo = useMemo(() => {
    if (!e || !all) return undefined
    const prev = all.filter((x) => x.vehicleId === e.vehicleId && x.id !== e.id && x.odometer && x.date <= e.date)
    return Math.max(vehicle?.initialOdometer ?? 0, ...prev.map((x) => x.odometer!)) || undefined
  }, [all, e, vehicle])

  const onScan = useCallback(
    async (text: string) => {
      setScanning(false)
      const sc = parseScan(text)
      if (!sc) {
        setLookup({ state: 'erro', msg: 'Esse código não parece ser de uma nota fiscal. Tente de novo, mais perto do QR code.' })
        return
      }
      const dup = all?.find((x) => x.invoiceKey === sc.info.chave && x.id !== e?.id)
      if (dup) {
        setLookup({ state: 'erro', msg: `Essa nota já foi lançada em ${dup.date.split('-').reverse().join('/')} (${brl(dup.amount)}).` })
        return
      }
      setE((cur) => (cur ? { ...cur, invoiceKey: sc.info.chave } : cur))
      const fill = (f: ReturnType<typeof notaParaDespesa>) => {
        setE((cur) =>
          cur
            ? {
                ...cur,
                category: f.category,
                date: f.date ?? cur.date,
                supplier: f.supplier ?? cur.supplier,
                description: f.description ?? cur.description,
                fuelType: f.fuelType ?? cur.fuelType,
                invoiceKey: sc.info.chave,
              }
            : cur,
        )
        if (f.amount) setAmount(num(f.amount, 2))
        if (f.liters) setLiters(num(f.liters, 3).replace(/0+$/, '').replace(/,$/, ''))
        if (f.pricePerLiter) setPrice(num(f.pricePerLiter, 3))
      }

      if (sc.qr && sc.info.modelo === '65') {
        setLookup({ state: 'buscando', msg: 'Buscando a nota na SEFAZ…' })
        try {
          const nota = await consultarNota(sc.qr)
          const f = notaParaDespesa(nota, e?.category ?? 'combustivel')
          fill(f)
          setLookup({
            state: 'ok',
            msg: `Nota de ${nota.emitente ?? 'estabelecimento'}${nota.data ? `, ${nota.data.split('-').reverse().join('/')}` : ''}. Confira os dados, informe o hodômetro e salve.`,
            aviso: f.aviso,
            url: nota.url,
          })
          return
        } catch (err) {
          const nome = await nomePorCnpj(sc.info.cnpj)
          const dia = sc.offline?.dia
          fill({
            category: e?.category ?? 'combustivel',
            supplier: nome,
            amount: sc.offline?.total,
            date: dia ? `${sc.info.ano}-${String(sc.info.mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}` : undefined,
          })
          setLookup({
            state: 'parcial',
            msg: `Não consegui buscar os detalhes na SEFAZ (${(err as Error).message}). Preenchi o que a nota informa${nome ? `: ${nome}` : ''}. Complete o valor e os litros.`,
            url: /^https?:/i.test(sc.raw) ? sc.raw : undefined,
          })
          return
        }
      }
      // NF-e (código de barras do DANFE): a SEFAZ não libera os itens sem certificado digital
      const nome = await nomePorCnpj(sc.info.cnpj)
      fill({ category: e?.category ?? 'manutencao', supplier: nome })
      setLookup({
        state: 'parcial',
        msg: `Nota fiscal eletrônica (NF-e) nº ${sc.info.numero}${nome ? ` de ${nome}` : ''}. Nesse tipo de nota a SEFAZ só libera os itens com certificado digital, então preencha o valor e a data.`,
      })
    },
    [all, e?.id, e?.category],
  )

  if (!vehicles || !e) return null
  if (vehicles.length === 0)
    return (
      <Empty
        icon="🚗"
        text="Antes de lançar despesas, cadastre pelo menos um veículo."
        action={<Link className="btn primary" to="/veiculos/novo">Cadastrar veículo</Link>}
      />
    )

  const set = <K extends keyof Expense>(k: K, val: Expense[K]) => setE({ ...e, [k]: val })
  const isFuel = e.category === 'combustivel'
  const fuelOptions = vehicle?.fuel === 'flex' ? FUELS.filter((f) => ['gasolina', 'etanol', 'gnv'].includes(f.id)) : FUELS.filter((f) => f.id !== 'flex')

  // Preenche o terceiro valor quando dois de (valor, litros, preço/litro) estão informados
  const onFuelChange = (field: 'amount' | 'liters' | 'price', val: string) => {
    const a = field === 'amount' ? parseNum(val) : parseNum(amount)
    const l = field === 'liters' ? parseNum(val) : parseNum(liters)
    const p = field === 'price' ? parseNum(val) : parseNum(price)
    if (field === 'amount') setAmount(val)
    if (field === 'liters') setLiters(val)
    if (field === 'price') setPrice(val)
    if (!isFuel) return
    if (field !== 'price' && a && l) setPrice(num(a / l, 3))
    else if (field === 'price' && p && l) setAmount(num(p * l, 2))
  }

  const odoN = parseNum(odo)
  const odoWarn = odoN !== undefined && lastOdo !== undefined && odoN < lastOdo

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const a = parseNum(amount)
    if (!a || a <= 0) return alert('Informe o valor da despesa.')
    const rec: Expense = {
      ...e,
      amount: a,
      odometer: odoN,
      liters: isFuel ? parseNum(liters) : undefined,
      pricePerLiter: isFuel ? parseNum(price) : undefined,
      fullTank: isFuel ? e.fullTank : undefined,
      fuelType: isFuel ? e.fuelType ?? (vehicle?.fuel === 'flex' ? 'gasolina' : vehicle?.fuel) : undefined,
    }
    await save('expenses', rec)
    localStorage.setItem(LAST, JSON.stringify({ vehicleId: rec.vehicleId, driverId: rec.driverId }))
    nav('/despesas')
  }

  const del = async () => {
    if (!confirm('Excluir esta despesa?')) return
    await remove('expenses', e.id)
    nav('/despesas')
  }

  return (
    <form onSubmit={submit}>
      <PageHeader title={id ? 'Editar despesa' : 'Nova despesa'} />
      {scanning && (
        <Scanner
          title="Ler nota fiscal"
          hint="Aponte para o QR code da nota (cupom) ou para o código de barras da NF-e."
          onResult={onScan}
          onClose={() => setScanning(false)}
        />
      )}
      <div className="card form">
        <button type="button" className="btn block scanmain" onClick={() => { setLookup(null); setScanning(true) }}>
          📷 Ler QR code da nota fiscal
        </button>
        {lookup && (
          <div className={'notabox' + (lookup.state === 'ok' || lookup.state === 'buscando' ? '' : ' warn')}>
            <span>{lookup.state === 'buscando' ? '🔄 ' : lookup.state === 'ok' ? '✅ ' : '⚠️ '}{lookup.msg}</span>
            {lookup.aviso && <span className="small">{lookup.aviso}</span>}
            {lookup.url && (
              <a className="small" href={lookup.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
                Ver a nota no site da SEFAZ
              </a>
            )}
          </div>
        )}
        {e.invoiceKey && !lookup && <div className="muted small">🧾 Despesa ligada a uma nota fiscal</div>}
        <div className="catgrid">
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.id}
              className={'cat' + (e.category === c.id ? ' on' : '')}
              onClick={() => set('category', c.id as Category)}
            >
              <span className="caticon">{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>

        <div className="row">
          <Field label="Veículo">
            <select value={e.vehicleId} onChange={(x) => set('vehicleId', x.target.value)}>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Data">
            <input type="date" required value={e.date} onChange={(x) => set('date', x.target.value)} />
          </Field>
        </div>

        {isFuel && (
          <div className="row three">
            <Field label="Litros">
              <input inputMode="decimal" value={liters} onChange={(x) => onFuelChange('liters', x.target.value)} />
            </Field>
            <Field label="R$ / litro">
              <input inputMode="decimal" value={price} onChange={(x) => onFuelChange('price', x.target.value)} />
            </Field>
            <Field label="Tipo">
              <select
                value={e.fuelType ?? (vehicle?.fuel === 'flex' ? 'gasolina' : vehicle?.fuel)}
                onChange={(x) => set('fuelType', x.target.value as Expense['fuelType'])}
              >
                {fuelOptions.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </Field>
          </div>
        )}

        <div className="row">
          <Field label="Valor total (R$) *">
            <input
              inputMode="decimal"
              required
              className="big"
              value={amount}
              placeholder="0,00"
              onChange={(x) => onFuelChange('amount', x.target.value)}
              onBlur={() => { const a = parseNum(amount); if (a) setAmount(num(a, 2)) }}
            />
          </Field>
          <Field
            label={isFuel ? 'Hodômetro (km) *' : 'Hodômetro (km)'}
            hint={odoWarn ? `⚠️ Menor que o último registro (${num(lastOdo!)} km)` : lastOdo ? `Último: ${num(lastOdo)} km` : undefined}
          >
            <input inputMode="numeric" required={isFuel} value={odo} onChange={(x) => setOdo(x.target.value)} />
          </Field>
        </div>

        {isFuel && (
          <label className="check">
            <input type="checkbox" checked={!!e.fullTank} onChange={(x) => set('fullTank', x.target.checked)} />
            <span>
              <b>Encheu o tanque</b>
              <span className="hint">Marque quando completar o tanque. É assim que o app calcula o consumo real.</span>
            </span>
          </label>
        )}

        <div className="row">
          <Field label={isFuel ? 'Posto' : 'Fornecedor / local'}>
            <input value={e.supplier ?? ''} onChange={(x) => set('supplier', x.target.value)} />
          </Field>
          <Field label="Condutor">
            <select value={e.driverId ?? ''} onChange={(x) => set('driverId', x.target.value || undefined)}>
              <option value="">—</option>
              {(drivers ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Descrição">
          <textarea
            value={e.description ?? ''}
            onChange={(x) => set('description', x.target.value)}
            placeholder={e.category === 'manutencao' ? 'Ex.: troca de óleo e filtro' : ''}
          />
        </Field>
        {isFuel && parseNum(amount) && parseNum(liters) ? (
          <p className="muted small">
            {num(parseNum(liters)!, 2)} L × {brl(parseNum(amount)! / parseNum(liters)!)} = {brl(parseNum(amount)!)}
          </p>
        ) : null}
      </div>
      <div className="actions">
        {id && <button type="button" className="btn danger" onClick={del}>Excluir</button>}
        <span className="grow" />
        <button type="button" className="btn" onClick={() => nav(-1)}>Cancelar</button>
        <button className="btn primary">Salvar</button>
      </div>
    </form>
  )
}
