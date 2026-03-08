import { detectarClarificacaoNecessaria, inferirPerfilComunicacao } from './conversation-state.runtime.js'

export async function handleIntentoContexto(input) {
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

  const perfilComunicacao = inferirPerfilComunicacao(texto, contextoAtual.perfil_comunicacao)
  const objetivoAtual =
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
