import type { ContextoConversa, IntencaoMensagem } from '@/types'

type ResponderFn = (mensagem: string) => Promise<void>
type ResolverOnboardingFn = (numero: string, texto: string) => Promise<string>
type ResolverComandoFn = (numero: string, texto: string, contexto?: ContextoConversa) => Promise<string>
type ResolverConsultaFn = (numero: string, texto: string) => Promise<string>
type ResolverDuvidaFn = (texto: string, contexto?: ContextoConversa) => Promise<string>

export interface HandleDispatchInput {
  numero: string
  texto: string
  intencao: IntencaoMensagem
  contextoAtual: ContextoConversa
  responder: ResponderFn
  resolverOnboarding: ResolverOnboardingFn
  resolverComando: ResolverComandoFn
  resolverConsulta: ResolverConsultaFn
  resolverDuvida: ResolverDuvidaFn
}

export async function handleDispatchPorIntencao(input: HandleDispatchInput): Promise<void> {
  const {
    numero,
    texto,
    intencao,
    contextoAtual,
    responder,
    resolverOnboarding,
    resolverComando,
    resolverConsulta,
    resolverDuvida,
  } = input

  let resposta: string

  switch (intencao) {
    case 'onboarding':
      resposta = await resolverOnboarding(numero, texto)
      break
    case 'comando':
      resposta = await resolverComando(numero, texto, contextoAtual ?? undefined)
      break
    case 'consulta':
      resposta = await resolverConsulta(numero, texto)
      break
    case 'duvida':
    default:
      resposta = await resolverDuvida(texto, contextoAtual ?? undefined)
      break
  }

  await responder(resposta)
}
