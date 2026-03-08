export async function handleFluxoConcluido(input) {
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
    const resposta = await resolverAcaoEdital(numero, textoTrimmed)
    await responder(resposta)
    return { handled: true }
  }

  const indiceDetalhe = detectarPedidoDetalhe(texto)
  if (indiceDetalhe !== null) {
    const resposta = await resolverDetalheEdital(numero, indiceDetalhe)
    await responder(resposta)
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

function detectarReclamacao(texto) {
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

function detectarRefinamento(texto) {
  const t = texto.toLowerCase().trim()
  if (t.length > 80) return false

  const patterns = [
    /^(e |tambem |tb |agora |so |somente )/,
    /^(refina|filtra|muda|troca|altera)\b/,
    /^(sem |exclua |exclui |tira |tirando )\w/,
    /^(acima|abaixo|entre|ate|mais de|menos de)\s+r?\$?\s*\d/i,
    /^(so|somente)\s+(acima|abaixo|em|de|por|pregao|dispensa|concorrencia)/i,
    /^e\s+(em\s+)?[a-z]{2}(\s|$)/i,
    /^(em|no|na)\s+[a-z\s]{3,20}(\s*\?)?$/i,
  ]

  return patterns.some((p) => p.test(t))
}

function detectarMaisResultados(texto) {
  const t = texto.toLowerCase().trim()
  return [
    'mostrar mais', 'mais resultados', 'mais', 'proxima pagina', 'proxima pagina',
    'proxima', 'proxima', 'continuar', 'ver mais', 'mais editais',
  ].includes(t)
}

function detectarPedidoDetalhe(texto) {
  const t = texto.trim()

  const p1 = t.match(/^(?:edital|item)\s+(\d+)$/i)
  if (p1) return parseInt(p1[1], 10)

  const p2 = t.match(/(?:detalh\w*|informa\w*|sobre)[^0-9]*?(\d+)\s*$/i)
  if (p2) return parseInt(p2[1], 10)

  const p3 = t.match(/^([1-9])$/)
  if (p3) return parseInt(p3[1], 10)

  return null
}

function mensagemReclamacaoResultados() {
  return [
    'Entendi que os resultados nao foram o que voce esperava.',
    '',
    'Tente descrever com mais detalhes o que esta buscando:',
    '* _"Projetos de engenharia civil em Tocantins"_',
    '* _"Consultoria ambiental acima de R$ 200 mil"_',
    '* _"Servicos de TI para prefeituras com prazo acima de 7 dias"_',
    '',
    '_Quanto mais especifico, melhor o resultado!_',
  ].join('\n')
}

