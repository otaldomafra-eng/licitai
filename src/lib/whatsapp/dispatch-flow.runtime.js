export async function handleDispatchPorIntencao(input) {
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

  let resposta

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
