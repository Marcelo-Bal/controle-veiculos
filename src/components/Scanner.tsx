import { useEffect, useRef, useState } from 'react'

type Controls = { stop: () => void }

async function makeReader() {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ])
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128])
  hints.set(DecodeHintType.TRY_HARDER, true)
  return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 })
}

/**
 * Leitor de QR code / código de barras pela câmera, por foto ou digitando.
 * Chama onResult com o texto lido.
 */
export default function Scanner({
  title,
  hint,
  onResult,
  onClose,
}: {
  title: string
  hint: string
  onResult: (text: string) => void
  onClose: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState('')
  const [manual, setManual] = useState('')
  const [busy, setBusy] = useState(false)
  const done = useRef(false)

  useEffect(() => {
    let controls: Controls | undefined
    let cancelled = false
    ;(async () => {
      try {
        const reader = await makeReader()
        if (cancelled || !video.current) return
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } },
          video.current,
          (res) => {
            if (res && !done.current) {
              done.current = true
              navigator.vibrate?.(60)
              controls?.stop()
              onResult(res.getText())
            }
          },
        )
        if (cancelled) controls.stop()
      } catch (e) {
        const n = (e as Error).name
        setErr(
          n === 'NotAllowedError'
            ? 'O acesso à câmera foi negado. Libere a câmera nas permissões do navegador, ou use "Escolher foto".'
            : n === 'NotFoundError'
              ? 'Nenhuma câmera encontrada neste aparelho. Use "Escolher foto" ou digite o código.'
              : 'Não foi possível abrir a câmera. Use "Escolher foto" ou digite o código.',
        )
      }
    })()
    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [onResult])

  const fromPhoto = async (f: File) => {
    setBusy(true)
    setErr('')
    const url = URL.createObjectURL(f)
    try {
      const reader = await makeReader()
      const res = await reader.decodeFromImageUrl(url)
      done.current = true
      onResult(res.getText())
    } catch {
      setErr('Não encontrei um QR code nessa foto. Tente uma foto mais próxima, bem iluminada e sem tremer.')
    } finally {
      URL.revokeObjectURL(url)
      setBusy(false)
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-box">
        <div className="pagehead">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button type="button" className="btn" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="camera">
          <video ref={video} muted playsInline />
          <div className="aim" />
        </div>
        <p className="muted small">{hint}</p>
        {err && <p className="error">{err}</p>}
        <div className="actions left">
          <button type="button" className="btn" disabled={busy} onClick={() => file.current?.click()}>
            🖼️ {busy ? 'Lendo…' : 'Escolher foto'}
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && fromPhoto(e.target.files[0])} />
        </div>
        <form
          className="row end"
          onSubmit={(e) => {
            e.preventDefault()
            if (manual.trim()) onResult(manual.trim())
          }}
        >
          <label className="field">
            <span className="label">Ou digite a chave de acesso (44 números)</span>
            <input inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="4326 1112 3456 …" />
          </label>
          <button className="btn">OK</button>
        </form>
      </div>
    </div>
  )
}
