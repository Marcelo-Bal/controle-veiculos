/**
 * Leitura de documentos (CRLV e CNH) no próprio aparelho: o texto é extraído do PDF
 * (CRLV-e / CNH-e exportados do app Carteira Digital de Trânsito) ou de uma foto, com OCR.
 * Nenhuma imagem sai do aparelho.
 */
import type { Fuel } from './db'

type Progress = (pct: number, label: string) => void

const base = () => new URL('./', location.href).href

async function ocrImage(src: Blob | HTMLCanvasElement, onProgress?: Progress) {
  const { createWorker } = await import('tesseract.js')
  onProgress?.(5, 'Preparando a leitura…')
  const worker = await createWorker('por', 1, {
    workerPath: base() + 'ocr/worker.min.js',
    corePath: base() + 'ocr/',
    langPath: base() + 'ocr/',
    gzip: true,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(20 + Math.round(m.progress * 80), 'Lendo o documento…')
      else if (m.status.includes('loading')) onProgress?.(5 + Math.round(m.progress * 15), 'Preparando a leitura…')
    },
  })
  try {
    const { data } = await worker.recognize(src)
    return data.text
  } finally {
    await worker.terminate()
  }
}

/** Reduz fotos muito grandes (celulares geram 12+ MP), o que deixa o OCR mais rápido e estável. */
async function shrink(file: Blob, max = 2200): Promise<Blob | HTMLCanvasElement> {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    if (scale === 1) return file
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale)
    c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return c
  } catch {
    return file
  }
}

async function pdfText(file: File, onProgress?: Progress) {
  onProgress?.(10, 'Abrindo o PDF…')
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  let text = ''
  const pages = Math.min(doc.numPages, 3)
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    for (const it of tc.items as { str?: string; hasEOL?: boolean }[]) text += (it.str ?? '') + (it.hasEOL ? '\n' : ' ')
    text += '\n'
  }
  if (text.replace(/\s/g, '').length > 40) return text
  // PDF escaneado (só imagem): renderiza a 1ª página e usa OCR
  const page = await doc.getPage(1)
  const vp = page.getViewport({ scale: 2.5 })
  const c = document.createElement('canvas')
  c.width = vp.width
  c.height = vp.height
  await page.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise
  return ocrImage(c, onProgress)
}

export async function readDocument(file: File, onProgress?: Progress): Promise<string> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return pdfText(file, onProgress)
  return ocrImage(await shrink(file), onProgress)
}

// ------------------------------------------------------------------ utilidades
const norm = (t: string) =>
  t
    .toUpperCase()
    .replace(/[“”"']/g, '')
    .replace(/[ \t]+/g, ' ')

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b([a-zà-ú])/g, (m) => m.toUpperCase())
    .replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase())

const allDates = (t: string) =>
  [...t.matchAll(/\b(\d{2})[/.-](\d{2})[/.-](\d{4})\b/g)]
    .map((m) => ({ iso: `${m[3]}-${m[2]}-${m[1]}`, idx: m.index! }))
    .filter((d) => {
      const [y, mo, da] = d.iso.split('-').map(Number)
      return y > 1900 && y < 2100 && mo >= 1 && mo <= 12 && da >= 1 && da <= 31
    })

export const cpfValido = (cpf: string) => {
  const c = cpf.replace(/\D/g, '')
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

export const renavamValido = (r: string) => {
  const c = r.replace(/\D/g, '').padStart(11, '0')
  if (c.length !== 11 || /^0+$/.test(c)) return false
  const w = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const s = w.reduce((acc, wi, i) => acc + Number(c[i]) * wi, 0)
  let d = 11 - (s % 11)
  if (d >= 10) d = 0
  return d === Number(c[10])
}

// ------------------------------------------------------------------ CRLV
export interface CrlvData {
  plate?: string
  renavam?: string
  chassis?: string
  brand?: string
  model?: string
  year?: number
  color?: string
  fuel?: Fuel
}

const BRANDS: Record<string, string> = {
  CHEV: 'Chevrolet', GM: 'Chevrolet', CHEVROLET: 'Chevrolet', VW: 'Volkswagen', VOLKSWAGEN: 'Volkswagen', FIAT: 'Fiat',
  FORD: 'Ford', HONDA: 'Honda', HYUNDAI: 'Hyundai', RENAULT: 'Renault', TOYOTA: 'Toyota', JEEP: 'Jeep', NISSAN: 'Nissan',
  PEUGEOT: 'Peugeot', CITROEN: 'Citroën', 'M.BENZ': 'Mercedes-Benz', MBENZ: 'Mercedes-Benz', MMC: 'Mitsubishi',
  MITSUBISHI: 'Mitsubishi', KIA: 'Kia', BMW: 'BMW', AUDI: 'Audi', 'CAOA CHERY': 'Caoa Chery', CHERY: 'Chery', VOLVO: 'Volvo',
  YAMAHA: 'Yamaha', SUZUKI: 'Suzuki', BYD: 'BYD', GWM: 'GWM', RAM: 'RAM', 'LR': 'Land Rover', 'LAND ROVER': 'Land Rover',
}
const COLORS = ['BRANCA', 'PRATA', 'PRETA', 'CINZA', 'VERMELHA', 'AZUL', 'VERDE', 'AMARELA', 'BEGE', 'MARROM', 'DOURADA', 'LARANJA', 'ROXA', 'VINHO', 'ROSA', 'FANTASIA']

export function parseCrlv(raw: string): CrlvData {
  const t = norm(raw)
  const flat = t.replace(/\s+/g, ' ')
  const d: CrlvData = {}

  const PLATE = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/
  const plate = flat.match(/\b([A-Z]{3})[ -]?(\d[A-Z0-9]\d{2})\b/)
  if (plate) d.plate = plate[1] + plate[2]
  else {
    // OCR às vezes insere um caractere a mais: tenta o texto logo após "PLACA"
    const tok = flat.match(/PLACA\s*[:-]?\s*([A-Z0-9-]{7,10})\b/)?.[1]?.replace(/[^A-Z0-9]/g, '')
    const tryFix = (x: string, n: number): string | undefined => {
      if (PLATE.test(x)) return x
      if (n === 0 || x.length <= 7) return undefined
      // as 3 letras iniciais costumam sair certas: tenta remover primeiro depois delas
      const order = [...Array(x.length).keys()].sort((a, b) => (a < 3 ? 1 : 0) - (b < 3 ? 1 : 0) || a - b)
      for (const i of order) {
        const r = tryFix(x.slice(0, i) + x.slice(i + 1), n - 1)
        if (r) return r
      }
    }
    if (tok) d.plate = tryFix(tok, 2)
  }

  const nums = [...flat.matchAll(/\b(\d{9,11})\b/g)].map((m) => m[1])
  const nearRenavam = flat.match(/RENAVAM\D{0,60}?(\d{9,11})\b/)?.[1]
  d.renavam = [nearRenavam, ...nums].find((n) => n && renavamValido(n))

  const vin = [...flat.matchAll(/\b([A-HJ-NPR-Z0-9]{17})\b/g)].map((m) => m[1]).find((v) => /[A-Z]/.test(v) && /\d{4}/.test(v))
  if (vin) d.chassis = vin

  const fab = flat.match(/FABRICA\w*\D{0,30}?((?:19|20)\d{2})\D{0,40}?MODELO\D{0,20}?((?:19|20)\d{2})/)
  // par "ano fabricação / ano modelo": dois anos seguidos, o segundo igual ou 1 a mais
  const pair = [...flat.matchAll(/\b((?:19|20)\d{2})(?=\s*\/?\s*((?:19|20)\d{2})\b)/g)].find(
    (m) => +m[2] - +m[1] >= 0 && +m[2] - +m[1] <= 1,
  )
  const yModel = fab?.[2] ?? pair?.[2]
  if (yModel) d.year = Number(yModel)

  // Marca/modelo: "CHEV/ONIX 10MT LT2", "VW/GOL 1.0L MC4", "I/TOYOTA COROLLA"
  const mm =
    flat.match(/VERS[AÃ]O\s*[:-]?\s*((?:I\/)?[A-Z.]{2,12}\s?\/\s?[A-Z0-9][A-Z0-9 .,-]{1,40}?)(?=\s+(?:ESP[EÉ]CIE|PLACA|CHASSI|COR|CATEG|COMBUST|ANO|CAPAC|POT|LOCAL|DATA|CPF|NOME|$))/)?.[1] ??
    flat.match(/\b((?:I\/)?(?:CHEV|VW|FIAT|FORD|HONDA|HYUNDAI|RENAULT|TOYOTA|JEEP|NISSAN|PEUGEOT|CITROEN|M\.BENZ|MMC|KIA|BMW|AUDI|CAOA CHERY|CHERY|VOLVO|YAMAHA|SUZUKI|BYD|GWM|RAM|LR)\s?\/\s?[A-Z0-9][A-Z0-9 .,-]{1,30}?)(?=\s+[A-Z]{4,}\s|$)/)?.[1]
  if (mm) {
    const [b, ...rest] = mm.replace(/^I\//, '').split('/')
    const key = b.trim()
    d.brand = BRANDS[key] ?? titleCase(key)
    d.model = rest.join('/').trim()
  }

  d.color = COLORS.find((c) => new RegExp(`\\b${c}\\b`).test(flat))
  if (d.color) d.color = titleCase(d.color)

  if (/ALCOOL\s*\/\s*GASOLINA|GASOLINA\s*\/\s*ALCOOL|FLEX/.test(flat)) d.fuel = 'flex'
  else if (/DIESEL/.test(flat)) d.fuel = 'diesel'
  else if (/EL[EÉ]TRIC/.test(flat)) d.fuel = 'eletrico'
  else if (/GAS NATURAL|GNV/.test(flat)) d.fuel = 'gnv'
  else if (/COMBUST\w*\s*[:-]?\s*ALCOOL/.test(flat)) d.fuel = 'etanol'
  else if (/GASOLINA/.test(flat)) d.fuel = 'gasolina'
  return d
}

// ------------------------------------------------------------------ CNH
export interface CnhData {
  name?: string
  cpf?: string
  cnhNumber?: string
  cnhCategory?: string
  cnhExpiry?: string
}

const LABELS = /\b(DOC|DATA|CPF|FILIA|PERMISS|ACC|CAT|N[º°O]?\s*REGISTRO|REGISTRO|VALIDADE|HABILITA|IDENTIDADE|NACIONALIDADE|LOCAL|ASSINATURA|OBSERV|1[ªA] HAB|REPUBLICA|MINIST|DEPARTAMENTO|CARTEIRA)\b/

export function parseCnh(raw: string): CnhData {
  const t = norm(raw)
  const flat = t.replace(/\s+/g, ' ')
  const d: CnhData = {}

  const cpf = [...flat.matchAll(/\b(\d{3}\s?\.?\s?\d{3}\s?\.?\s?\d{3}\s?-?\s?\d{2})\b/g)].map((m) => m[1].replace(/\D/g, '')).find(cpfValido)
  if (cpf) d.cpf = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')

  const reg =
    flat.match(/REGISTRO\D{0,40}?(\d{9,11})\b/)?.[1] ??
    [...flat.matchAll(/\b(\d{11})\b/g)].map((m) => m[1]).find((n) => n !== cpf)
  if (reg) d.cnhNumber = reg

  const catIdx = flat.search(/CAT\.?\s*HAB/)
  if (catIdx >= 0) {
    const after = flat.slice(catIdx).replace(/^CAT\.?\s*HAB\w*\.?/, '').slice(0, 80)
    const cat = after.match(/(?:^|[^A-Z])(ACC|AB|AC|AD|AE|A|B|C|D|E)(?![A-Z])/)?.[1]
    if (cat) d.cnhCategory = cat
  }

  // a validade é sempre a data mais distante impressa na CNH
  d.cnhExpiry = allDates(flat).map((x) => x.iso).sort().pop()

  // Nome: linha após o rótulo "NOME"
  const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean)
  const li = lines.findIndex((l) => /\bNOME\b/.test(l) && !/SOCIAL/.test(l))
  const cands: string[] = []
  if (li >= 0) {
    const sameLine = lines[li].replace(/.*?\bNOME(?: E SOBRENOME)?\b\s*[:-]?\s*/, '')
    cands.push(sameLine, lines[li + 1] ?? '', lines[li + 2] ?? '')
  }
  const inline = flat.match(/\bNOME(?: E SOBRENOME)?\s*[:-]?\s*([A-ZÀ-Ú][A-ZÀ-Ú ]{5,60})/)?.[1]
  if (inline) cands.push(inline)
  for (const c of cands) {
    const name = c.split(LABELS)[0].replace(/[^A-ZÀ-Ú ]/g, ' ').replace(/\s+/g, ' ').trim()
    if (name.split(' ').length >= 2 && name.length >= 6) {
      d.name = titleCase(name)
      break
    }
  }
  return d
}
