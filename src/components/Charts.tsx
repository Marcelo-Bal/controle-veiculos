import { useEffect, useRef, useState } from 'react'

/** Gráficos simples em SVG, uma única série (cor --series-1). */

interface Tip { x: number; y: number; title: string; value: string }

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null
  return (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }}>
      <div className="viz-tip-title">{tip.title}</div>
      <div className="viz-tip-val">{tip.value}</div>
    </div>
  )
}

const niceMax = (v: number) => {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}

const H = 220
const PAD = { l: 56, r: 12, t: 12, b: 28 }

/** Largura real do contêiner, para o texto do gráfico não encolher no celular. */
function useWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [w, setW] = useState(640)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return w
}

export function BarChart({
  data,
  fmt,
  fmtAxis = fmt,
  label,
}: {
  data: { label: string; full: string; value: number }[]
  fmt: (v: number) => string
  fmtAxis?: (v: number) => string
  label: string
}) {
  const [tip, setTip] = useState<Tip | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const W = useWidth(box)
  const max = niceMax(Math.max(...data.map((d) => d.value)))
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const step = iw / data.length
  const bw = Math.max(4, Math.min(36, step - 2))
  const y = (v: number) => PAD.t + ih - (v / max) * ih
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
  const show = (i: number, ev: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    setHover(i)
    setTip({ x: ev.clientX - r.left, y: ev.clientY - r.top, title: data[i].full, value: fmt(data[i].value) })
  }
  const labelEvery = Math.ceil(data.length / Math.max(3, Math.floor(W / 70)))
  return (
    <div className="viz" ref={box} onPointerLeave={() => { setTip(null); setHover(null) }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="viz-grid" />
            <text x={PAD.l - 6} y={y(t)} className="viz-axis" textAnchor="end" dominantBaseline="middle">{fmtAxis(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD.l + i * step + (step - bw) / 2
          const h = Math.max(0, PAD.t + ih - y(d.value))
          const r = Math.min(4, bw / 2, h)
          return (
            <g key={i}>
              {h > 0 && (
                <path
                  className={'viz-bar' + (hover === i ? ' on' : '')}
                  d={`M${x},${PAD.t + ih} V${PAD.t + ih - h + r} Q${x},${PAD.t + ih - h} ${x + r},${PAD.t + ih - h} H${x + bw - r} Q${x + bw},${PAD.t + ih - h} ${x + bw},${PAD.t + ih - h + r} V${PAD.t + ih} Z`}
                />
              )}
              {i % labelEvery === 0 && (
                <text x={x + bw / 2} y={H - 8} className="viz-axis" textAnchor="middle">{d.label}</text>
              )}
              <rect
                x={PAD.l + i * step} y={PAD.t} width={step} height={ih} fill="transparent"
                onPointerMove={(ev) => show(i, ev)} onPointerDown={(ev) => show(i, ev)}
              />
            </g>
          )
        })}
        <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} className="viz-base" />
      </svg>
      <Tooltip tip={tip} />
    </div>
  )
}

export function LineChart({
  data,
  fmt,
  label,
  avg,
}: {
  data: { label: string; full: string; value: number; note?: string }[]
  fmt: (v: number) => string
  label: string
  avg?: number
}) {
  const [tip, setTip] = useState<Tip | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const W = useWidth(box)
  const vals = data.map((d) => d.value)
  const lo = Math.max(0, Math.floor(Math.min(...vals) * 0.9))
  const hi = Math.ceil(Math.max(...vals) * 1.08)
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw)
  const y = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo || 1)) * ih
  const ticks = [0, 0.5, 1].map((f) => lo + f * (hi - lo))
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join(' ')
  const onMove = (ev: React.PointerEvent<SVGRectElement>) => {
    const svg = (ev.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
    const px = ((ev.clientX - svg.left) / svg.width) * W
    let best = 0
    data.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i })
    const r = box.current!.getBoundingClientRect()
    setHover(best)
    const d = data[best]
    setTip({ x: ev.clientX - r.left, y: ev.clientY - r.top, title: d.full, value: fmt(d.value) + (d.note ? ` · ${d.note}` : '') })
  }
  const labelEvery = Math.ceil(data.length / Math.max(3, Math.floor(W / 90)))
  return (
    <div className="viz" ref={box} onPointerLeave={() => { setTip(null); setHover(null) }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="viz-grid" />
            <text x={PAD.l - 6} y={y(t)} className="viz-axis" textAnchor="end" dominantBaseline="middle">{fmt(t)}</text>
          </g>
        ))}
        {avg !== undefined && <line x1={PAD.l} x2={W - PAD.r} y1={y(avg)} y2={y(avg)} className="viz-avg" />}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} className="viz-cross" />}
        <path d={path} className="viz-line" />
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.value)} r={hover === i ? 6 : 4} className="viz-dot" />
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={'l' + i} x={x(i)} y={H - 8} className="viz-axis" textAnchor="middle">{d.label}</text>
          ) : null,
        )}
        <rect x={PAD.l} y={PAD.t} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} />
      </svg>
      {avg !== undefined && (
        <div className="viz-legend"><span><span className="sw-line" />média {fmt(avg)}</span></div>
      )}
      <Tooltip tip={tip} />
    </div>
  )
}

/** Barras horizontais em HTML (rótulo + valor sempre visíveis: servem também como tabela). */
export function HBars({ rows, fmt }: { rows: { label: string; value: number; extra?: string }[]; fmt: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div className="hbar" key={r.label}>
          <div className="hbar-head">
            <span>{r.label}</span>
            <span><b>{fmt(r.value)}</b>{r.extra && <span className="muted"> · {r.extra}</span>}</span>
          </div>
          <div className="hbar-track"><div className="hbar-fill" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  )
}
