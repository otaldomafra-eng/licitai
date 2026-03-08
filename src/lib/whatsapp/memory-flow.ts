import type { ContextoConversa, IntencaoMensagem, MemoriaUsuarioConversa } from '@/types'

type AtualizarContextoFn = (
  numero: string,
  patch: Partial<ContextoConversa>
) => Promise<ContextoConversa | null>

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

const SEGMENTOS = [
  'consultoria', 'engenharia', 'tecnologia', 'ti', 'software', 'ambiental',
  'saude', 'limpeza', 'seguranca', 'transporte', 'alimentacao', 'manutencao',
  'obras', 'construcao',
]

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function uniqueMerge(atual: string[] = [], novos: string[] = [], limit = 8): string[] {
  const s = new Set<string>([...atual, ...novos])
  return Array.from(s).slice(0, limit)
}

function extrairUFs(texto: string): string[] {
  const t = normalizar(texto).toUpperCase()
  return UFS.filter((uf) => new RegExp(`\\b${uf}\\b`).test(t))
}

function extrairSegmentos(texto: string): string[] {
  const t = normalizar(texto)
  return SEGMENTOS.filter((s) => new RegExp(`\\b${s}\\b`).test(t))
}

function extrairEstiloResposta(texto: string): MemoriaUsuarioConversa['estilo_resposta'] | undefined {
  const t = normalizar(texto)
  if (/(curto|curta|objetivo|objetiva|direto|rapido|rapida|resumo)/.test(t)) return 'direto'
  if (/(detalhado|detalhada|explica melhor|completo|passo a passo|aprofundado)/.test(t)) return 'detalhado'
  return undefined
}

function parseValor(token: string): number | null {
  const t = normalizar(token).replace(/r\$/g, '').replace(/\./g, '').replace(/,/g, '.')
  const n = parseFloat(t.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n)) return null

  if (/(mi|milhao|milhoes)/.test(t) || /\\d+m(\\s|$)/.test(t)) return Math.round(n * 1_000_000)
  if (/(k|mil)/.test(t)) return Math.round(n * 1_000)
  return Math.round(n)
}

function extrairFaixaValor(texto: string): { min?: number | null; max?: number | null } {
  const t = normalizar(texto)

  const entre = t.match(/entre\s+([\d.,\s\w$]+?)\s+e\s+([\d.,\s\w$]+)/)
  if (entre) {
    const a = parseValor(entre[1])
    const b = parseValor(entre[2])
    if (a !== null && b !== null) {
      return { min: Math.min(a, b), max: Math.max(a, b) }
    }
  }

  const acima = t.match(/(acima de|mais de)\s+([\d.,\s\w$]+)/)
  if (acima) {
    const n = parseValor(acima[2])
    if (n !== null) return { min: n }
  }

  const abaixo = t.match(/(abaixo de|menos de|ate)\s+([\d.,\s\w$]+)/)
  if (abaixo) {
    const n = parseValor(abaixo[2])
    if (n !== null) return { max: n }
  }

  return {}
}

function extrairTopico(texto: string, intencao: IntencaoMensagem): string | null {
  const segmentos = extrairSegmentos(texto)
  if (segmentos.length > 0) return segmentos[0]
  if (intencao === 'consulta') return 'busca'
  if (intencao === 'duvida') return 'duvida'
  if (intencao === 'comando') return 'comando'
  return 'onboarding'
}

function montarMemoriaAtualizada(
  texto: string,
  intencao: IntencaoMensagem,
  atual?: MemoriaUsuarioConversa
): MemoriaUsuarioConversa {
  const ufsNovas = extrairUFs(texto)
  const segmentosNovos = extrairSegmentos(texto)
  const faixa = extrairFaixaValor(texto)
  const estilo = extrairEstiloResposta(texto)
  const topico = extrairTopico(texto, intencao)

  const topicos = uniqueMerge(atual?.topicos_recentes ?? [], topico ? [topico] : [], 10)

  return {
    ...atual,
    ufs_preferidas: uniqueMerge(atual?.ufs_preferidas ?? [], ufsNovas),
    segmentos_preferidos: uniqueMerge(atual?.segmentos_preferidos ?? [], segmentosNovos),
    valor_min_preferido: faixa.min ?? atual?.valor_min_preferido ?? null,
    valor_max_preferido: faixa.max ?? atual?.valor_max_preferido ?? null,
    estilo_resposta: estilo ?? atual?.estilo_resposta,
    ultima_intencao: intencao,
    topicos_recentes: topicos,
    atualizado_em: new Date().toISOString(),
  }
}

function memoriaMudou(a?: MemoriaUsuarioConversa, b?: MemoriaUsuarioConversa): boolean {
  return JSON.stringify(a ?? {}) !== JSON.stringify(b ?? {})
}

export async function atualizarMemoriaConversa(input: {
  numero: string
  texto: string
  intencao: IntencaoMensagem
  contextoAtual: ContextoConversa
  atualizarContextoConversa: AtualizarContextoFn
}): Promise<ContextoConversa> {
  const { numero, texto, intencao, atualizarContextoConversa } = input
  let contextoAtual = input.contextoAtual

  const proximaMemoria = montarMemoriaAtualizada(texto, intencao, contextoAtual.memoria_usuario)
  if (!memoriaMudou(contextoAtual.memoria_usuario, proximaMemoria)) {
    return contextoAtual
  }

  contextoAtual =
    (await atualizarContextoConversa(numero, { memoria_usuario: proximaMemoria })) ??
    { ...contextoAtual, memoria_usuario: proximaMemoria }

  return contextoAtual
}



