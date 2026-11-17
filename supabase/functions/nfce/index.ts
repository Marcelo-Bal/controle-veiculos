// Supabase Edge Function "nfce"
// Recebe o conteúdo do QR code de uma NFC-e, busca a página pública da SEFAZ e devolve os dados em JSON.
// Só acessa portais oficiais (*.gov.br), para não virar um proxy aberto.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
const text = (html: string) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
const num = (s?: string) => {
  if (!s) return undefined
  const m = s.match(/-?[\d.]*\d,\d+|-?\d+(?:\.\d+)?/)
  if (!m) return undefined
  const v = m[0].includes(',') ? Number(m[0].replace(/\./g, '').replace(',', '.')) : Number(m[0])
  return Number.isFinite(v) ? v : undefined
}
const byClass = (html: string, cls: string) => {
  const re = new RegExp(`<(\\w+)[^>]*class=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([\\s\\S]*?)</\\1>`, 'i')
  const m = html.match(re)
  return m ? text(m[2]) : undefined
}

export function parse(html: string) {
  const emitente =
    text(html.match(/id=["']u20["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '') || byClass(html, 'txtTopo') || undefined
  const all = text(html)
  const cnpj = all.match(/CNPJ:?\s*([\d./-]{14,18})/)?.[1]?.replace(/\D/g, '')
  const em = all.match(/Emiss[ãa]o:?\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?/)
  const data = em ? `${em[3]}-${em[2]}-${em[1]}` : undefined
  const hora = em?.[4]

  // endereço: o segundo bloco "text" do cabeçalho
  const texts = [...html.matchAll(/<div[^>]*class=["']text["'][^>]*>([\s\S]*?)<\/div>/gi)].map((m) => text(m[1]))
  const endereco = texts.find((t) => !/CNPJ/i.test(t))

  const itens = html
    .split(/<tr[^>]*id=["']Item\s*\+?\s*\d+["'][^>]*>/i)
    .slice(1)
    .map((chunk) => {
      const c = chunk.split(/<\/tr>/i)[0]
      return {
        descricao: byClass(c, 'txtTit') ?? '',
        codigo: byClass(c, 'RCod')?.match(/:\s*([^\s)]+)/)?.[1],
        quantidade: num(byClass(c, 'Rqtd')?.replace(/Qtde\.?:?/i, '')),
        unidade: byClass(c, 'RUN')?.replace(/UN:?/i, '').trim(),
        valorUnitario: num(byClass(c, 'RvlUnit')?.replace(/Vl\.?\s*Unit\.?:?/i, '')),
        valorTotal: num(byClass(c, 'valor')),
      }
    })
    .filter((i) => i.descricao)

  // totais: pares "label / totalNumb" dentro de #totalNota
  const totalBlock = html.match(/id=["']totalNota["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] ?? html
  const pairs = [...totalBlock.matchAll(/<label[^>]*>([\s\S]*?)<\/label>\s*<span[^>]*totalNumb[^>]*>([\s\S]*?)<\/span>/gi)].map(
    (m) => [text(m[1]), num(text(m[2]))] as const,
  )
  const find = (re: RegExp) => pairs.find(([l]) => re.test(l))?.[1]
  const total =
    find(/a pagar/i) ??
    find(/valor total/i) ??
    num(byClass(html, 'totalNumb txtMax')) ??
    (itens.length ? itens.reduce((s, i) => s + (i.valorTotal ?? 0), 0) : undefined)
  const desconto = find(/desconto/i)
  const chave = all.match(/(\d{4}\s?){11}/)?.[0]?.replace(/\s/g, '')

  return { emitente, cnpj, endereco, data, hora, total, desconto, chave, itens }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { qr } = await req.json()
    if (typeof qr !== 'string' || qr.length > 600) return json({ erro: 'QR code inválido' }, 400)

    let url: URL
    if (/^https?:\/\//i.test(qr.trim())) {
      url = new URL(qr.trim())
      if (!url.hostname.endsWith('.gov.br')) return json({ erro: 'Este QR code não é de um portal da SEFAZ' }, 400)
      // RS: o endereço antigo redireciona para o portal SVRS
      if (/sefaz\.rs\.gov\.br$/i.test(url.hostname) && url.searchParams.get('p'))
        url = new URL(`https://dfe-portal.svrs.rs.gov.br/Dfe/QrCodeNFce?p=${encodeURIComponent(url.searchParams.get('p')!)}`)
    } else if (/^\d{44}\|/.test(qr.trim())) {
      url = new URL(`https://dfe-portal.svrs.rs.gov.br/Dfe/QrCodeNFce?p=${encodeURIComponent(qr.trim())}`)
    } else {
      return json({ erro: 'Formato de QR code não reconhecido' }, 400)
    }

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15000)
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    }).finally(() => clearTimeout(timer))
    if (!res.ok) return json({ erro: `A SEFAZ respondeu com erro ${res.status}`, url: url.href }, 502)
    const buf = new Uint8Array(await res.arrayBuffer())
    const ctype = res.headers.get('content-type') ?? ''
    let html = new TextDecoder(/iso-8859-1|latin1|windows-1252/i.test(ctype) ? 'windows-1252' : 'utf-8').decode(buf)
    if (html.includes('�') && !/1252|8859/.test(ctype)) html = new TextDecoder('windows-1252').decode(buf)

    const nota = parse(html)
    if (!nota.itens.length && !nota.total)
      return json({ erro: 'Não consegui ler os dados da nota na página da SEFAZ', url: url.href }, 422)
    return json({ ...nota, url: url.href })
  } catch (e) {
    const msg = (e as Error).name === 'AbortError' ? 'A SEFAZ demorou demais para responder' : (e as Error).message
    return json({ erro: msg }, 500)
  }
})
