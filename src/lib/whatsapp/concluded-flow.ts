import type { ContextoConversa } from '@/types'

type ResponderFn = (mensagem: string) => Promise<void>
type ResolverAcaoFn = (numero: string, acao: '1' | '2' | '3' | '4') => Promise<string>
type ResolverDetalheFn = (numero: string, indice: number) => Promise<string>
type ResolverMaisFn = (numero: string) => Promise<string>
type ResolverRefinamentoFn = (numero: string, texto: string) => Promise<string>

export interface HandleFluxoConcluidoInput {
  numero: string
  texto: string
  contextoAtual: ContextoConversa
  responder: ResponderFn
  resolverAcaoEdital: ResolverAcaoFn
  resolverDetalheEdital: ResolverDetalheFn
  resolverMaisResultados: ResolverMaisFn
  resolverRefinamento: ResolverRefinamentoFn
}

export interface HandleFluxoConcluidoOutput {
  handled: boolean
}

function detectarReclamacao(texto: string): boolean {
  const t = texto.toLowerCase()
  return [
    /nao (sao|e|foi|eram) (o que|editais|resultado)/,
    /nao (era|queria|esperava|pedi|solicitei)/,
    /nada (a ver|relacionado)/,
    /mas (esses|essas|eles|elas) nao/,
    /(resultado|edital)(s)? (errado|incorreto|diferente|irrelevante)(s)?/,
    /nao (encontrou|achou|trouxe) o que/,
    /diferente(s)? do que (pedi|queria|solicitei)/,
    /nao (e|foi) isso/,
    /nao (e|foi) (bem|exatamente) (isso|o que)/,
  ].some((p) => p.test(t))
}

function detectarRefinamento(texto: string): boolean {
  const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  if (t.length > 80) return false

  const patterns = [
    /^(e |tambem |tb |agora |so |somente )/,
    /^(refina|filtra|muda|troca|altera)\b/,
    /^(buscar|busca|busque)\s+(em|no|na|nos|nas)\s+\w+/i,
    /^(amplia|ampliar|nacional)\b/i,
    /^(sem |exclua |exclui |tira |tirando )\w/,
    /^(acima|abaixo|entre|ate|mais de|menos de)\s+r?\$?\s*\d/i,
    /^(so|somente)\s+(acima|abaixo|em|de|por|pregao|dispensa|concorrencia)/i,
    /^e\s+(em\s+)?[a-z]{2}(\s|$)/i,
    /^(em|no|na|nos|nas)\s+[a-z\s]{2,20}(\s*\?)?$/i,
    /^(agora\s+)?(em|no|na|pro|pra)\s+\w+/i,
  ]

  const comandoOuSaudacao = /^(menu|ajuda|help|suporte|planos|assinar|upgrade|meu plano|pausar|ativar|mudar perfil|oi|ola|hey|hello|hi|bom dia|boa tarde|boa noite)$/i
  const refinamentoCurto = /^[a-z]{4,}(?:\s+[a-z]{2,}){0,2}$/i.test(t)

  return patterns.some((p) => p.test(t)) || (refinamentoCurto && !comandoOuSaudacao.test(t))
}

function detectarSaudacao(texto: string): boolean {
  const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  return /^(oi|ola|hey|hello|hi|bom dia|boa tarde|boa noite|e ai|eai|fala|salve)$/i.test(t)
}

function respostaSaudacao(): string {
  return [
    '👋 Olá! Como posso te ajudar?',
    '',
    'Você pode:',
    '• Descrever o edital que procura (ex: _"obras em SP acima de 100k"_)',
    '• Responder *menu* para ver todas as opções',
    '• Responder *meus editais* para ver alertas recentes',
  ].join('\n')
}

function detectarMaisResultados(texto: string): boolean {
  const t = texto.toLowerCase().trim()
  return [
    'mostrar mais', 'mais resultados', 'mais', 'proxima pagina', 'proxima pagina',
    'proxima', 'proxima', 'continuar', 'ver mais', 'mais editais',
  ].includes(t)
}

function detectarPedidoDetalhe(texto: string): number | null {
  const t = texto.trim()

  const p1 = t.match(/^(?:edital|item)\s+(\d+)$/i)
  if (p1) return parseInt(p1[1], 10)

  const p2 = t.match(/(?:detalh\w*|informa\w*|sobre)[^0-9]*?(\d+)\s*$/i)
  if (p2) return parseInt(p2[1], 10)

  const p3 = t.match(/^([1-9])$/)
  if (p3) return parseInt(p3[1], 10)

  return null
}

function mensagemReclamacaoResultados(): string {
  return [
    '🤔 Entendi que os resultados não foram o que você esperava.',
    '',
    'Tente descrever com mais detalhes o que está buscando:',
    '* _"Projetos de engenharia civil em Tocantins"_',
    '* _"Consultoria ambiental acima de R$ 200 mil"_',
    '* _"Serviços de TI para prefeituras com prazo acima de 7 dias"_',
    '',
    '_Quanto mais específico, melhor o resultado!_ 🎯',
  ].join('\n')
}

export async function handleFluxoConcluido(
  input: HandleFluxoConcluidoInput
): Promise<HandleFluxoConcluidoOutput> {
  const {
    numero,
    texto,
    contextoAtual,
    responder,
    resolverAcaoEdital,
    resolverDetalheEdital,
    resolverMaisResultados,
    resolverRefinamento,
  } = input

  const textoTrimmed = texto.trim()

  if (/^[1234]$/.test(textoTrimmed) && contextoAtual?.aguardando_acao_edital_id) {
    const resposta = await resolverAcaoEdital(numero, textoTrimmed as '1' | '2' | '3' | '4')
    await responder(resposta)
    return { handled: true }
  }

  const indiceDetalhe = detectarPedidoDetalhe(texto)
  if (indiceDetalhe !== null) {
    const resposta = await resolverDetalheEdital(numero, indiceDetalhe)
    await responder(resposta)
    return { handled: true }
  }

  if (detectarSaudacao(texto)) {
    await responder(respostaSaudacao())
    return { handled: true }
  }

  if (detectarReclamacao(texto)) {
    await responder(mensagemReclamacaoResultados())
    return { handled: true }
  }

  if (detectarMaisResultados(texto)) {
    const resposta = await resolverMaisResultados(numero)
    await responder(resposta)
    return { handled: true }
  }

  if (detectarRefinamento(texto) && contextoAtual?.ultimos_filtros) {
    const resposta = await resolverRefinamento(numero, texto)
    await responder(resposta)
    return { handled: true }
  }

  return { handled: false }
}


