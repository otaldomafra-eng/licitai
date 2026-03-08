import { handleClarificacaoPendente } from '@/lib/whatsapp/clarification-flow'
import { handleFluxoConcluido } from '@/lib/whatsapp/concluded-flow'
import { handleIntentoContexto } from '@/lib/whatsapp/intent-context-flow'
import { handleDispatchPorIntencao } from '@/lib/whatsapp/dispatch-flow'
import { atualizarMemoriaConversa } from '@/lib/whatsapp/memory-flow'
import type { ContextoConversa, EtapaOnboarding, IntencaoMensagem } from '@/types'

type AtualizarContextoFn = (
  numero: string,
  patch: Partial<ContextoConversa>
) => Promise<ContextoConversa | null>

type ResponderFn = (mensagem: string) => Promise<void>
type IdentificarIntencaoFn = (texto: string, etapaAtual: EtapaOnboarding | null) => Promise<IntencaoMensagem>
type ResolverConsultaFn = (numero: string, texto: string) => Promise<string>
type ResolverDuvidaFn = (texto: string, contexto?: ContextoConversa) => Promise<string>
type ResolverAcaoFn = (numero: string, acao: '1' | '2' | '3' | '4') => Promise<string>
type ResolverDetalheFn = (numero: string, indice: number) => Promise<string>
type ResolverMaisFn = (numero: string) => Promise<string>
type ResolverRefinamentoFn = (numero: string, texto: string) => Promise<string>
type ResolverOnboardingFn = (numero: string, texto: string) => Promise<string>
type ResolverComandoFn = (numero: string, texto: string, contexto?: ContextoConversa) => Promise<string>

export interface ExecutarPipelineWebhookInput {
  numero: string
  texto: string
  etapaAtual: EtapaOnboarding | null
  contextoAtual: ContextoConversa
  atualizarContextoConversa: AtualizarContextoFn
  responder: ResponderFn
  identificarIntencao: IdentificarIntencaoFn
  resolverConsulta: ResolverConsultaFn
  resolverDuvida: ResolverDuvidaFn
  resolverAcaoEdital: ResolverAcaoFn
  resolverDetalheEdital: ResolverDetalheFn
  resolverMaisResultados: ResolverMaisFn
  resolverRefinamento: ResolverRefinamentoFn
  resolverOnboarding: ResolverOnboardingFn
  resolverComando: ResolverComandoFn
}

export interface ExecutarPipelineWebhookOutput {
  handled: boolean
  intencao?: IntencaoMensagem
  contextoAtual: ContextoConversa
}

export async function executarPipelineWebhook(
  input: ExecutarPipelineWebhookInput
): Promise<ExecutarPipelineWebhookOutput> {
  const {
    numero,
    texto,
    etapaAtual,
    atualizarContextoConversa,
    responder,
    identificarIntencao,
    resolverConsulta,
    resolverDuvida,
    resolverAcaoEdital,
    resolverDetalheEdital,
    resolverMaisResultados,
    resolverRefinamento,
    resolverOnboarding,
    resolverComando,
  } = input

  let contextoAtual = input.contextoAtual

  // Limpa estado de clarificação antigo se existir (fluxo desabilitado)
  if (etapaAtual === 'concluido' && contextoAtual.aguardando_clarificacao?.ativa) {
    contextoAtual =
      (await atualizarContextoConversa(numero, { aguardando_clarificacao: null })) ??
      { ...contextoAtual, aguardando_clarificacao: null }
  }

  if (etapaAtual === 'concluido') {
    const resultadoFluxoConcluido = await handleFluxoConcluido({
      numero,
      texto,
      contextoAtual,
      responder,
      resolverAcaoEdital,
      resolverDetalheEdital,
      resolverMaisResultados,
      resolverRefinamento,
    })

    if (resultadoFluxoConcluido.handled) {
      return { handled: true, contextoAtual }
    }
  }

  const resultadoIntentoContexto = await handleIntentoContexto({
    numero,
    texto,
    etapaAtual,
    contextoAtual,
    atualizarContextoConversa,
    identificarIntencao,
    responder,
  })

  const intencao = resultadoIntentoContexto.intencao
  contextoAtual = resultadoIntentoContexto.contextoAtual

  contextoAtual = await atualizarMemoriaConversa({
    numero,
    texto,
    intencao,
    contextoAtual,
    atualizarContextoConversa,
  })

  if (resultadoIntentoContexto.handled) {
    return { handled: true, intencao, contextoAtual }
  }

  await handleDispatchPorIntencao({
    numero,
    texto,
    intencao,
    contextoAtual,
    responder,
    resolverOnboarding,
    resolverComando,
    resolverConsulta,
    resolverDuvida,
  })

  return { handled: true, intencao, contextoAtual }
}

