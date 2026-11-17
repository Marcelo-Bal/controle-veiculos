import { Link } from 'react-router-dom'
import { Empty, PageHeader } from '../components/Field'
import { useDrivers } from '../lib/hooks'
import { dateBR, today } from '../lib/format'

export default function Drivers() {
  const drivers = useDrivers()
  if (!drivers) return null
  const t = today()
  return (
    <>
      <PageHeader title="Condutores" action={<Link className="btn primary" to="/condutores/novo">+ Novo</Link>} />
      {drivers.length === 0 ? (
        <Empty
          icon="🪪"
          text="Cadastre quem dirige os veículos para saber quem fez cada despesa e acompanhar a validade da CNH."
          action={<Link className="btn primary" to="/condutores/novo">Cadastrar condutor</Link>}
        />
      ) : (
        <div className="list card">
          {drivers.map((d) => {
            const expired = d.cnhExpiry && d.cnhExpiry < t
            return (
              <Link key={d.id} to={`/condutores/${d.id}`} className="item">
                <div className="itemicon">🪪</div>
                <div className="grow">
                  <div className="itemtitle">{d.name}</div>
                  <div className="muted">
                    {d.cnhCategory ? `CNH ${d.cnhCategory}` : 'CNH não informada'}
                    {d.cnhExpiry && ` · validade ${dateBR(d.cnhExpiry)}`}
                  </div>
                </div>
                {expired && <span className="badge red">Vencida</span>}
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
