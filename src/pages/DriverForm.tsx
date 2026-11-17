import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Field, PageHeader } from '../components/Field'
import { db, newBase, remove, save, type Driver } from '../lib/db'
import DocImport from '../components/DocImport'
import { parseCnh } from '../lib/docread'

export default function DriverForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const [d, setD] = useState<Driver | null>(id ? null : { ...newBase(), name: '' })
  const [docMsg, setDocMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (id) db.drivers.get(id).then((r) => (r ? setD(r) : nav('/condutores')))
  }, [id, nav])

  if (!d) return null
  const set = <K extends keyof Driver>(k: K, val: Driver[K]) => setD({ ...d, [k]: val })

  const fromCnh = (text: string) => {
    const c = parseCnh(text)
    const found: string[] = []
    const next = { ...d }
    if (c.name) { next.name = c.name; found.push('nome') }
    if (c.cpf) { next.cpf = c.cpf; found.push('CPF') }
    if (c.cnhNumber) { next.cnhNumber = c.cnhNumber; found.push('nº da CNH') }
    if (c.cnhCategory) { next.cnhCategory = c.cnhCategory; found.push('categoria') }
    if (c.cnhExpiry) { next.cnhExpiry = c.cnhExpiry; found.push('validade') }
    setD(next)
    setDocMsg(
      found.length
        ? { ok: true, text: `Preenchido pela CNH: ${found.join(', ')}. Confira se está tudo certo antes de salvar.` }
        : { ok: false, text: 'Não reconheci os dados da CNH nessa imagem. Tente uma foto mais próxima, reta e bem iluminada, ou o PDF da CNH digital.' },
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    await save('drivers', d)
    nav('/condutores')
  }
  const del = async () => {
    if (!confirm(`Excluir "${d.name}"? As despesas dele continuam salvas.`)) return
    await remove('drivers', d.id)
    nav('/condutores')
  }

  return (
    <form onSubmit={submit}>
      <PageHeader title={id ? 'Editar condutor' : 'Novo condutor'} />
      <div className="card form">
        <DocImport
          label="🪪 Preencher pela CNH"
          help="Tire uma foto da CNH aberta (lado dos dados) ou escolha o PDF da CNH digital. A leitura é feita no seu aparelho."
          onText={fromCnh}
        />
        {docMsg && <div className={'notabox' + (docMsg.ok ? '' : ' warn')}>{docMsg.ok ? '✅ ' : '⚠️ '}{docMsg.text}</div>}
        <Field label="Nome *">
          <input required value={d.name} onChange={(e) => set('name', e.target.value)} autoFocus={!id} />
        </Field>
        <div className="row">
          <Field label="CPF">
            <input inputMode="numeric" value={d.cpf ?? ''} onChange={(e) => set('cpf', e.target.value)} />
          </Field>
          <Field label="Telefone">
            <input inputMode="tel" value={d.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </div>
        <div className="row">
          <Field label="Nº da CNH">
            <input inputMode="numeric" value={d.cnhNumber ?? ''} onChange={(e) => set('cnhNumber', e.target.value)} />
          </Field>
          <Field label="Categoria">
            <select value={d.cnhCategory ?? ''} onChange={(e) => set('cnhCategory', e.target.value || undefined)}>
              <option value="">—</option>
              {['A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Validade da CNH">
          <input type="date" value={d.cnhExpiry ?? ''} onChange={(e) => set('cnhExpiry', e.target.value || undefined)} />
        </Field>
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
