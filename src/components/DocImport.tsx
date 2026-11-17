import { useRef, useState } from 'react'
import { readDocument } from '../lib/docread'

/**
 * Botão "Preencher pelo documento": tira foto ou escolhe PDF/foto, lê o texto no aparelho
 * e devolve o texto para quem chamou interpretar.
 */
export default function DocImport({
  label,
  help,
  onText,
}: {
  label: string
  help: string
  onText: (text: string) => void
}) {
  const cam = useRef<HTMLInputElement>(null)
  const pick = useRef<HTMLInputElement>(null)
  const [prog, setProg] = useState<{ pct: number; label: string } | null>(null)
  const [err, setErr] = useState('')

  const run = async (f?: File) => {
    if (!f) return
    setErr('')
    setProg({ pct: 2, label: 'Abrindo…' })
    try {
      const text = await readDocument(f, (pct, label) => setProg({ pct, label }))
      onText(text)
    } catch (e) {
      console.error(e)
      setErr('Não consegui ler esse arquivo. Tente uma foto mais nítida, ou o PDF do documento digital.')
    } finally {
      setProg(null)
      if (cam.current) cam.current.value = ''
      if (pick.current) pick.current.value = ''
    }
  }

  return (
    <div className="docimport">
      <div className="cardtitle small-title">{label}</div>
      <p className="muted small">{help}</p>
      {prog ? (
        <div>
          <div className="muted small">{prog.label} {prog.pct}%</div>
          <div className="hbar-track"><div className="hbar-fill" style={{ width: `${prog.pct}%` }} /></div>
        </div>
      ) : (
        <div className="actions left">
          <button type="button" className="btn" onClick={() => cam.current?.click()}>📷 Tirar foto</button>
          <button type="button" className="btn" onClick={() => pick.current?.click()}>📄 Escolher PDF ou foto</button>
        </div>
      )}
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => run(e.target.files?.[0])} />
      <input ref={pick} type="file" accept="image/*,application/pdf" hidden onChange={(e) => run(e.target.files?.[0])} />
      {err && <p className="error small">{err}</p>}
    </div>
  )
}
