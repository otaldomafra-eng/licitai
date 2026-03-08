import { detectarClarificacaoNecessaria, inferirPerfilComunicacao } from '@/lib/whatsapp/conversation-state'
import type { ContextoConversa, EtapaOnboarding, IntencaoMensagem } from '@/types'

type AtualizarContextoFn = (
  numero: string,
  patch: Partial<ContextoConversa>
) => Promise<ContextoConversa | null>

type IdentificarIntencaoFn = (
  texto: string,
  etapaAtual: EtapaOnboarding | null
) => Promise<IntencaoMensagem>

type ResponderFn = (mensagem: string) => Promise<void>

export interface HandleIntentoContextoInput {
  numero: string
  texto: string
  etapaAtual: EtapaOnboarding | null
  contextoAtual: ContextoConversa
  atualizarContextoConversa: AtualizarContextoFn
  identificarIntencao: IdentificarIntencaoFn
  responder: ResponderFn
}

export interface HandleIntentoContextoOutput {
  handled: boolean
  intencao: IntencaoMensagem
  contextoAtual: ContextoConversa
}

export async function handleIntentoContexto(
  input: HandleIntentoContextoInput
): Promise<HandleIntentoContextoOutput> {
  const {
    numero,
    texto,
    etapaAtual,
    atualizarContextoConversa,
    identificarIntencao,
    responder,
  } = input

  let contextoAtual = input.contextoAtual

  const intencao =
    etapaAtual === null || etapaAtual === 'inicio'
      ? 'onboarding'
      : await identificarIntencao(texto, etapaAtual).then((i) =>
          i === 'onboarding' && etapaAtual === 'concluido' ? 'duvida' : i
        )

  const perfilComunicacao = inferirPerfilComunicacao(
    texto,
    contextoAtual.perfil_comunicacao
  )

  const objetivoAtual: ContextoConversa['objetivo_atual'] =
    intencao === 'consulta' || intencao === 'duvida' || intencao === 'comando'
      ? intencao
      : contextoAtual.objetivo_atual

  if (
    perfilComunicacao !== contextoAtual.perfil_comunicacao ||
    objetivoAtual !== contextoAtual.objetivo_atual
  ) {
    contextoAtual =
      (await atualizarContextoConversa(numero, {
        perfil_comunicacao: perfilComunicacao,
        objetivo_atual: objetivoAtual,
      })) ?? {
        ...contextoAtual,
        perfil_comunicacao: perfilComunicacao,
        objetivo_atual: objetivoAtual,
      }
  }

  if (etapaAtual === 'concluido' && (intencao === 'consulta' || intencao === 'duvida')) {
    const clarificacao = detectarClarificacaoNecessaria(texto, intencao)
    if (clarificacao) {
      contextoAtual =
        (await atualizarContextoConversa(numero, {
          aguardando_clarificacao: {
            ativa: true,
            tipo: clarificacao.tipo,
            pergunta: clarificacao.pergunta,
            base_usuario: clarificacao.baseUsuario,
            criado_em: new Date().toISOString(),
            tentativas: 0,
          },
          objetivo_atual: clarificacao.tipo,
        })) ?? contextoAtual

      await responder(clarificacao.pergunta)
      return { handled: true, intencao, contextoAtual }
    }
  }

  return { handled: false, intencao, contextoAtual }
}
