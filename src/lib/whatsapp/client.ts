/**
 * client.ts - Abstração sobre a Meta WhatsApp Cloud API
 *
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api
 * Endpoint: https://graph.facebook.com/v22.0/{phone-number-id}/messages
 */

import type { MatchEdital, EditalDB } from '@/types'

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!
const META_BASE = 'https://graph.facebook.com/v22.0'

function embelezarTextoMensagem(texto: string): string {
  const correcoes: Array<[RegExp, string]> = [
    [/\bNao\b/g, 'Não'],
    [/\bnao\b/g, 'não'],
    [/\bVoce\b/g, 'Você'],
    [/\bvoce\b/g, 'você'],
    [/\bDuvida\b/g, 'Dúvida'],
    [/\bduvida\b/g, 'dúvida'],
    [/\bDuvidas\b/g, 'Dúvidas'],
    [/\bduvidas\b/g, 'dúvidas'],
    [/\bEspecifico\b/g, 'Específico'],
    [/\bespecifico\b/g, 'específico'],
    [/\bOrgao\b/g, 'Órgão'],
    [/\borgao\b/g, 'órgão'],
    [/\bOrgaos\b/g, 'Órgãos'],
    [/\borgaos\b/g, 'órgãos'],
    [/\bAnalise\b/g, 'Análise'],
    [/\banalise\b/g, 'análise'],
    [/\bAte\b/g, 'Até'],
    [/\bate\b/g, 'até'],
  ]

  let t = texto
  for (const [pattern, replacement] of correcoes) {
    t = t.replace(pattern, replacement)
  }

  const linhas = t.split('\n').map((linha) => {
    if (!linha) return linha
    if (/^[•*_\-\d]/.test(linha.trimStart())) return linha
    return linha.replace(/^(\s*)([a-zà-ÿ])/i, (_m, sp, ch) => `${sp}${String(ch).toUpperCase()}`)
  })

  t = linhas.join('\n')

  const temEmoji = /[\u{1F300}-\u{1FAFF}]/u.test(t)
  if (!temEmoji && t.trim().length > 0) {
    t = `🤖 ${t}`
  }

  return t
}

/**
 * Normaliza número para formato Meta API (somente dígitos com DDI 55, sem +)
 * Converte formato antigo de 8 dígitos para 9 dígitos no Brasil.
 */
function normalizarNumero(numero: string): string {
  const limpo = numero.replace(/\D/g, '')
  const comDDI = limpo.startsWith('55') ? limpo : `55${limpo}`

  // Brasil: 55 + DDD(2) + número(8) => 12; inserir 9 após DDD.
  if (comDDI.length === 12) {
    return comDDI.slice(0, 4) + '9' + comDDI.slice(4)
  }

  return comDDI
}

function formatarValor(valor: number | null): string {
  if (!valor) return 'Não informado'
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(dataISO: string | null): string {
  if (!dataISO) return 'Não informado'
  try {
    return new Date(dataISO).toLocaleDateString('pt-BR')
  } catch {
    return dataISO
  }
}

async function chamarMetaAPI(path: string, body: unknown): Promise<unknown> {
  const url = `${META_BASE}/${path}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const texto = await res.text().catch(() => res.statusText)
    throw new Error(`[Meta API] ${res.status} ${path}: ${texto}`)
  }

  return res.json()
}

const WHATSAPP_MAX_CHARS = 4000 // margem de segurança (limite real: 4096)

function dividirMensagem(texto: string): string[] {
  if (texto.length <= WHATSAPP_MAX_CHARS) return [texto]

  const partes: string[] = []
  let restante = texto

  while (restante.length > WHATSAPP_MAX_CHARS) {
    let corte = restante.lastIndexOf('\n\n', WHATSAPP_MAX_CHARS)
    if (corte <= 0) corte = restante.lastIndexOf('\n', WHATSAPP_MAX_CHARS)
    if (corte <= 0) corte = WHATSAPP_MAX_CHARS

    partes.push(restante.slice(0, corte).trimEnd())
    restante = restante.slice(corte).trimStart()
  }

  if (restante.length > 0) partes.push(restante)
  return partes
}

export async function enviarMensagem(numero: string, texto: string): Promise<void> {
  const to = normalizarNumero(numero)
  const textoFinal = embelezarTextoMensagem(texto)
  const partes = dividirMensagem(textoFinal)

  for (const parte of partes) {
    await chamarMetaAPI(`${PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: parte, preview_url: false },
    })
  }
}

export async function enviarAlerta(
  numero: string,
  match: Pick<MatchEdital, 'score' | 'justificativa' | 'pontos_fortes' | 'riscos'>,
  edital: Pick<EditalDB, 'nome_orgao' | 'objeto' | 'valor_estimado' | 'data_encerramento' | 'link_sistema_origem'>
): Promise<void> {
  const pontosFortes = match.pontos_fortes
    .slice(0, 3)
    .map((p) => `✅ ${p}`)
    .join('\n')

  const riscos = match.riscos
    .slice(0, 2)
    .map((r) => `⚠️ ${r}`)
    .join('\n')

  const mensagem = [
    '🔔 *Novo edital compatível*',
    '',
    `Órgão: ${edital.nome_orgao}`,
    `Objeto: ${edital.objeto.substring(0, 200)}${edital.objeto.length > 200 ? '...' : ''}`,
    `Valor: ${formatarValor(edital.valor_estimado)}`,
    `Encerra: ${formatarData(edital.data_encerramento)}`,
    `Compatibilidade: ${match.score}%`,
    '',
    pontosFortes || '',
    riscos || '',
    '',
    'Responda:',
    '1) Mais detalhes',
    '2) Ignorar edital',
    '3) Link do PNCP',
  ]
    .filter((l) => l !== '')
    .join('\n')

  await enviarMensagem(numero, mensagem)
}

export async function marcarComoLido(_numero: string, messageId: string): Promise<void> {
  await chamarMetaAPI(`${PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  }).catch(() => {})
}

export async function aguardar(ms = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
