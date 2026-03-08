import { handleClarificacaoPendente } from './clarification-flow.runtime.js'
import { handleFluxoConcluido } from './concluded-flow.runtime.js'
import { handleIntentoContexto } from './intent-context-flow.runtime.js'
import { handleDispatchPorIntencao } from './dispatch-flow.runtime.js'
import { atualizarMemoriaConversa } from './memory-flow.runtime.js'

export async function executarPipelineWebhook(input) {
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

  if (etapaAtual === 'concluido' && contextoAtual.aguardando_clarificacao?.ativa) {
    const resultadoClarificacao = await handleClarificacaoPendente({
      numero,
      texto,
      contextoAtual,
      atualizarContextoConversa,
      responder,
      resolverConsulta,
      resolverDuvida: (textoComposto, contexto) => resolverDuvida(textoComposto, contexto),
    })

    contextoAtual = resultadoClarificacao.contextoAtual
    if (resultadoClarificacao.handled) {
      return { handled: true, contextoAtual }
    }
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

