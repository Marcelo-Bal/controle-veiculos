import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Field, PageHeader } from '../components/Field'
import { db, newBase, remove, save, type Vehicle } from '../lib/db'
import { FUELS, parseNum } from '../lib/format'

const blank = (): Vehicle => ({ ...newBase(), name: '', brand: '', model: '', plate: '', fuel: 'flex' })

export default function VehicleForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const [v, setV] = useState<Vehicle | null>(id ? null : blank())
  const [odo, setOdo] = useState('')
  const [tank, setTank] = useState('')

  useEffect(() => {
    if (id)
      db.vehicles.get(id).then((r) => {
        if (!r) return nav('/veiculos')
        setV(r)
        setOdo(r.initialOdometer?.toString() ?? '')
        setTank(r.tankLiters?.toString() ?? '')
      })
  }, [id, nav])

  if (!v) return null
  const set = <K extends keyof Vehicle>(k: K, val: Vehicle[K]) => setV({ ...v, [k]: val })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    await save('vehicles', {
      ...v,
      plate: v.plate.toUpperCase().trim(),
      initialOdometer: parseNum(odo),
      tankLiters: parseNum(tank),
    })
    nav('/veiculos')
  }

  const del = async () => {
    const n = await db.expenses.where('vehicleId').equals(v.id).filter((e) => !e.deleted).count()
    const msg = n
      ? `Excluir "${v.name}" e as ${n} despesas dele?`
      : `Excluir "${v.name}"?`
    if (!confirm(msg)) return
    const ids = await db.expenses.where('vehicleId').equals(v.id).primaryKeys()
    for (const eid of ids) await remove('expenses', eid)
    await remove('vehicles', v.id)
    nav('/veiculos')
  }

  return (
    <form onSubmit={submit}>
      <PageHeader title={id ? 'Editar veículo' : 'Novo veículo'} />
      <div className="card form">
        <Field label="Apelido *" hint="Como a família chama o carro. Ex.: Onix da Ana">
          <input required value={v.name} onChange={(e) => set('name', e.target.value)} autoFocus={!id} />
        </Field>
        <div className="row">
          <Field label="Marca">
            <input value={v.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Chevrolet" />
          </Field>
          <Field label="Modelo">
            <input value={v.model} onChange={(e) => set('model', e.target.value)} placeholder="Onix 1.0" />
          </Field>
        </div>
        <div className="row">
          <Field label="Ano">
            <input inputMode="numeric" value={v.year ?? ''} onChange={(e) => set('year', parseNum(e.target.value))} />
          </Field>
          <Field label="Placa">
            <input value={v.plate} onChange={(e) => set('plate', e.target.value)} placeholder="ABC1D23" style={{ textTransform: 'uppercase' }} />
          </Field>
        </div>
        <div className="row">
          <Field label="Combustível">
            <select value={v.fuel} onChange={(e) => set('fuel', e.target.value as Vehicle['fuel'])}>
              {FUELS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </Field>
          <Field label="Tanque (litros)">
            <input inputMode="decimal" value={tank} onChange={(e) => setTank(e.target.value)} />
          </Field>
        </div>
        <Field label="Quilometragem atual" hint="Usada como ponto de partida para os cálculos de consumo">
          <input inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value)} />
        </Field>
        <details>
          <summary>Mais dados (Renavam, chassi, cor)</summary>
          <div className="row">
            <Field label="Renavam">
              <input inputMode="numeric" value={v.renavam ?? ''} onChange={(e) => set('renavam', e.target.value)} />
            </Field>
            <Field label="Cor">
              <input value={v.color ?? ''} onChange={(e) => set('color', e.target.value)} />
            </Field>
          </div>
          <Field label="Chassi">
            <input value={v.chassis ?? ''} onChange={(e) => set('chassis', e.target.value.toUpperCase())} />
          </Field>
          <Field label="Observações">
            <textarea value={v.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </details>
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
