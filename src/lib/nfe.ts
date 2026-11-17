import type { Category, Fuel } from './db'
import { supabase } from './supabase'

export interface ChaveInfo {
  chave: string
  uf: string
  ano: number
  mes: number
  cnpj: string
  modelo: '55' | '65' | string // 55 = NF-e, 65 = NFC-e
  serie: number
  numero: number
}

const UF: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO', '21': 'MA', '22': 'PI',
  '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES',
  '33': 'RJ', '35': 'SP', '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
}

/** Dígito verificador da chave (módulo 11). */
const dvOk = (c: string) => {
  let sum = 0
  let w = 2
  for (let i = 42; i >= 0; i--) {
    sum += Number(c[i]) * w
    w = w === 9 ? 2 : w + 1
  }
  const r = sum % 11
  return (r < 2 ? 0 : 11 - r) === Number(c[43])
}

export function parseChave(raw: string): ChaveInfo | null {
  const c = raw.replace(/\D/g, '')
  if (c.length !== 44 || !dvOk(c)) return null
  return {
    chave: c,
    uf: UF[c.slice(0, 2)] ?? c.slice(0, 2),
    ano: 2000 + Number(c.slice(2, 4)),
    mes: Number(c.slice(4, 6)),
    cnpj: c.slice(6, 20),
    modelo: c.slice(20, 22),
    serie: Number(c.slice(22, 25)),
    numero: Number(c.slice(25, 34)),
  }
}

export interface Scanned {
  raw: string
  info: ChaveInfo
  /** Conteúdo que dá para consultar na SEFAZ (QR code da NFC-e). */
  qr?: string
  /** QR de nota emitida em contingência traz o dia e o valor. */
  offline?: { dia?: number; total?: number }
}

/** Interpreta o que foi lido: URL do QR da NFC-e, o parâmetro "p" ou a chave de 44 dígitos (código de barras da NF-e). */
export function parseScan(raw: string): Scanned | null {
  const s = raw.trim()
  let p: string | undefined
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s)
      p = u.searchParams.get('p') ?? undefined
      const ch = u.searchParams.get('chNFe')
      if (!p && ch) {
        const info = parseChave(ch)
        return info ? { raw: s, info, qr: s } : null
      }
    } catch {
      return null
    }
  } else if (/^\d{44}\|/.test(s)) p = s
  if (p) {
    const parts = p.split('|')
    const info = parseChave(parts[0])
    if (!info) return null
    // contingência (versão 2): chave|2|tpAmb|dia|vNF|digVal|idCSC|hash
    const offline = parts.length >= 8 ? { dia: Number(parts[3]) || undefined, total: Number(parts[4]) || undefined } : undefined
    return { raw: s, info, qr: /^https?:/i.test(s) ? s : p, offline }
  }
  const info = parseChave(s)
  return info ? { raw: s, info } : null
}

export interface NotaItem {
  descricao: string
  quantidade?: number
  unidade?: string
  valorUnitario?: number
  valorTotal?: number
}

export interface Nota {
  emitente?: string
  cnpj?: string
  endereco?: string
  data?: string
  total?: number
  desconto?: number
  itens: NotaItem[]
  url?: string
}

export async function consultarNota(qr: string): Promise<Nota> {
  const { data, error } = await supabase.functions.invoke('nfce', { body: { qr } })
  if (error) {
    let msg = 'Não foi possível consultar a SEFAZ agora.'
    try {
      const body = await (error as { context?: Response }).context?.json()
      if (body?.erro) msg = body.erro
    } catch { /* ignora */ }
    throw new Error(msg)
  }
  if (data?.erro) throw new Error(data.erro)
  return data as Nota
}

/** Nome da empresa pelo CNPJ (BrasilAPI, gratuita). */
export async function nomePorCnpj(cnpj: string): Promise<string | undefined> {
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)
    if (!r.ok) return undefined
    const d = await r.json()
    return d.nome_fantasia || d.razao_social || undefined
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------- classificação
const FUEL_RE: [RegExp, Fuel][] = [
  [/\bGNV\b|GAS NATURAL/i, 'gnv'],
  [/DIESEL|\bS-?10\b|\bS-?500\b/i, 'diesel'],
  [/ETANOL|ALCOOL|ÁLCOOL|\bETH\b/i, 'etanol'],
  [/GASOLINA|\bGAS\.?\s*(C|COMUM|ADIT|PREM)/i, 'gasolina'],
]
export const fuelOf = (desc: string): Fuel | undefined => FUEL_RE.find(([re]) => re.test(desc))?.[1]

const CAT_RE: [RegExp, Category][] = [
  [/PNEU/i, 'pneus'],
  [/LAVAGEM|LAVA ?JATO|POLIMENTO|HIGIENIZA/i, 'lavagem'],
  [/OLEO|ÓLEO|LUBRIF|FILTRO|PASTILHA|FREIO|BATERIA|AMORTEC|VELA|CORREIA|ALINHAMENTO|BALANCEAMENTO|REVIS|ARLA/i, 'manutencao'],
  [/ESTACION/i, 'estacionamento'],
  [/PED[AÁ]GIO/i, 'pedagio'],
]
export const categoryOf = (desc: string): Category | undefined => CAT_RE.find(([re]) => re.test(desc))?.[1]

export interface Preenchimento {
  category: Category
  date?: string
  amount?: number
  supplier?: string
  liters?: number
  pricePerLiter?: number
  fuelType?: Fuel
  description?: string
  aviso?: string
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Converte a nota numa despesa: combustível conta só os itens de combustível; o resto vira aviso. */
export function notaParaDespesa(n: Nota, atual: Category): Preenchimento {
  const fuelItems = n.itens.filter((i) => fuelOf(i.descricao))
  const base = { date: n.data, supplier: n.emitente }
  if (fuelItems.length) {
    const liters = fuelItems.reduce((s, i) => s + (i.quantidade ?? 0), 0)
    const amount = fuelItems.reduce((s, i) => s + (i.valorTotal ?? 0), 0)
    const outros = n.itens.filter((i) => !fuelOf(i.descricao))
    const outrosTotal = outros.reduce((s, i) => s + (i.valorTotal ?? 0), 0)
    return {
      ...base,
      category: 'combustivel',
      amount: Math.round(amount * 100) / 100,
      liters: Math.round(liters * 1000) / 1000,
      pricePerLiter: fuelItems.length === 1 ? fuelItems[0].valorUnitario : liters ? amount / liters : undefined,
      fuelType: fuelOf(fuelItems[0].descricao),
      description: fuelItems.length > 1 ? fuelItems.map((i) => i.descricao).join(', ') : undefined,
      aviso: outros.length
        ? `A nota também tem ${outros.length} item(ns) que não são combustível (${brl(outrosTotal)}: ${outros.map((i) => i.descricao).join(', ')}). Eles não foram incluídos.`
        : undefined,
    }
  }
  const cats = n.itens.map((i) => categoryOf(i.descricao)).filter(Boolean) as Category[]
  return {
    ...base,
    category: cats[0] ?? atual,
    amount: n.total,
    description: n.itens.map((i) => i.descricao).join(', ').slice(0, 300),
  }
}
