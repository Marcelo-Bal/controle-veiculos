import { useRef, useState } from 'react'
import { PageHeader } from '../components/Field'
import { db } from '../lib/db'
import { today } from '../lib/format'

export default function Settings() {
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')

  const exportar = async () => {
    const data = {
      app: 'controle-veiculos',
      versao: 1,
      exportadoEm: new Date().toISOString(),
      vehicles: await db.vehicles.toArray(),
      drivers: await db.drivers.toArray(),
      expenses: await db.expenses.toArray(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `backup-veiculos-${today()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importar = async (f: File) => {
    try {
      const data = JSON.parse(await f.text())
      if (data.app !== 'controle-veiculos') throw new Error()
      await db.transaction('rw', db.vehicles, db.drivers, db.expenses, async () => {
        await db.vehicles.bulkPut(data.vehicles ?? [])
        await db.drivers.bulkPut(data.drivers ?? [])
        await db.expenses.bulkPut(data.expenses ?? [])
      })
      setMsg(`Backup restaurado: ${data.vehicles?.length ?? 0} veículos, ${data.expenses?.length ?? 0} despesas.`)
    } catch {
      setMsg('Este arquivo não é um backup válido do app.')
    }
  }

  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="card form">
        <h3>☁️ Sincronização</h3>
        <p className="muted">
          Em breve: entre com sua conta para ver os mesmos dados no celular e no computador. Por enquanto, os
          dados ficam salvos neste aparelho.
        </p>
      </div>
      <div className="card form">
        <h3>💾 Cópia de segurança</h3>
        <p className="muted">Baixe um arquivo com todos os seus dados, ou restaure um arquivo baixado antes.</p>
        <div className="actions left">
          <button className="btn" onClick={exportar}>Baixar backup</button>
          <button className="btn" onClick={() => file.current?.click()}>Restaurar backup</button>
          <input
            ref={file}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])}
          />
        </div>
        {msg && <p>{msg}</p>}
      </div>
    </>
  )
}
