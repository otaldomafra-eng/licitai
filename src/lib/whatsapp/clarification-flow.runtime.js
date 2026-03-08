import { decidirClarificacaoPendente } from './conversation-state.runtime.js'

export async function handleClarificacaoPendente(input) {
  const {
    numero,
    texto,
    atualizarContextoConversa,
    responder,
    resolverConsulta,
    resolverDuvida,
  } = input

  let contextoAtual = input.contextoAtual
  const pendencia = contextoAtual.aguardando_clarificacao

  if (!pendencia?.ativa) {
    return { handled: false, contextoAtual }
  }

  const decisao = decidirClarificacaoPendente(texto, pendencia)

  if (decisao.kind === 'bypass_clear') {
    contextoAtual =
      (await atualizarContextoConversa(numero, { aguardando_clarificacao: null })) ??
      { ...contextoAtual, aguardando_clarificacao: null }
    return { handled: false, contextoAtual }
  }

  if (decisao.kind === 'reprompt_keep') {
    contextoAtual =
      (await atualizarContextoConversa(numero, {
        aguardando_clarificacao: {
          ...pendencia,
          tentativas: decisao.tentativas,
        },
      })) ?? contextoAtual

    await responder(decisao.mensagem)
    return { handled: true, contextoAtual }
  }

  if (decisao.kind === 'reprompt_clear') {
    contextoAtual =
      (await atualizarContextoConversa(numero, { aguardando_clarificacao: null })) ??
      { ...contextoAtual, aguardando_clarificacao: null }

    await responder(decisao.mensagem)
    return { handled: true, contextoAtual }
  }

  contextoAtual =
    (await atualizarContextoConversa(numero, { aguardando_clarificacao: null })) ??
    { ...contextoAtual, aguardando_clarificacao: null }

  const resposta =
    pendencia.tipo === 'consulta'
      ? await resolverConsulta(numero, decisao.textoComposto)
      : await resolverDuvida(decisao.textoComposto, contextoAtual)

  await responder(resposta)
  return { handled: true, contextoAtual }
}
