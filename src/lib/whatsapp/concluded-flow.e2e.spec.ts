import assert from 'node:assert/strict'

import { handleFluxoConcluido } from './concluded-flow.runtime.js'

async function run(): Promise<void> {
  const numero = '5599999999999'

  {
    const mensagens: string[] = []
    let acaoCalls = 0

    const result = await handleFluxoConcluido({
      numero,
      texto: '2',
      contextoAtual: { aguardando_acao_edital_id: 'abc' },
      responder: async (m: string) => { mensagens.push(m) },
      resolverAcaoEdital: async () => {
        acaoCalls += 1
        return 'acao executada'
      },
      resolverDetalheEdital: async () => 'nao deveria chamar',
      resolverMaisResultados: async () => 'nao deveria chamar',
      resolverRefinamento: async () => 'nao deveria chamar',
    })

    assert.equal(result.handled, true)
    assert.equal(acaoCalls, 1)
    assert.equal(mensagens[0], 'acao executada')
  }

  {
    const mensagens: string[] = []
    let detalheIndice = 0

    const result = await handleFluxoConcluido({
      numero,
      texto: 'edital 3',
      contextoAtual: {},
      responder: async (m: string) => { mensagens.push(m) },
      resolverAcaoEdital: async () => 'nao deveria chamar',
      resolverDetalheEdital: async (_n: string, indice: number) => {
        detalheIndice = indice
        return 'detalhe 3'
      },
      resolverMaisResultados: async () => 'nao deveria chamar',
      resolverRefinamento: async () => 'nao deveria chamar',
    })

    assert.equal(result.handled, true)
    assert.equal(detalheIndice, 3)
    assert.equal(mensagens[0], 'detalhe 3')
  }

  {
    const mensagens: string[] = []

    const result = await handleFluxoConcluido({
      numero,
      texto: 'esses resultados nao sao o que pedi',
      contextoAtual: {},
      responder: async (m: string) => { mensagens.push(m) },
      resolverAcaoEdital: async () => 'nao deveria chamar',
      resolverDetalheEdital: async () => 'nao deveria chamar',
      resolverMaisResultados: async () => 'nao deveria chamar',
      resolverRefinamento: async () => 'nao deveria chamar',
    })

    assert.equal(result.handled, true)
    assert.ok(mensagens[0].includes('nao foram o que voce esperava'))
  }

  {
    const mensagens: string[] = []
    let maisCalls = 0

    const result = await handleFluxoConcluido({
      numero,
      texto: 'mostrar mais',
      contextoAtual: {},
      responder: async (m: string) => { mensagens.push(m) },
      resolverAcaoEdital: async () => 'nao deveria chamar',
      resolverDetalheEdital: async () => 'nao deveria chamar',
      resolverMaisResultados: async () => {
        maisCalls += 1
        return 'pagina 2'
      },
      resolverRefinamento: async () => 'nao deveria chamar',
    })

    assert.equal(result.handled, true)
    assert.equal(maisCalls, 1)
    assert.equal(mensagens[0], 'pagina 2')
  }

  {
    const mensagens: string[] = []
    let refinCalls = 0

    const result = await handleFluxoConcluido({
      numero,
      texto: 'e em sp?',
      contextoAtual: { ultimos_filtros: { termos: ['consultoria'] } },
      responder: async (m: string) => { mensagens.push(m) },
      resolverAcaoEdital: async () => 'nao deveria chamar',
      resolverDetalheEdital: async () => 'nao deveria chamar',
      resolverMaisResultados: async () => 'nao deveria chamar',
      resolverRefinamento: async () => {
        refinCalls += 1
        return 'refinado'
      },
    })

    assert.equal(result.handled, true)
    assert.equal(refinCalls, 1)
    assert.equal(mensagens[0], 'refinado')
  }

  {
    const mensagens: string[] = []

    const result = await handleFluxoConcluido({
      numero,
      texto: 'bom dia, tudo bem?',
      contextoAtual: {},
      responder: async (m: string) => { mensagens.push(m) },
      resolverAcaoEdital: async () => 'nao deveria chamar',
      resolverDetalheEdital: async () => 'nao deveria chamar',
      resolverMaisResultados: async () => 'nao deveria chamar',
      resolverRefinamento: async () => 'nao deveria chamar',
    })

    assert.equal(result.handled, false)
    assert.equal(mensagens.length, 0)
  }

  console.log('concluded-flow-e2e: OK (6/6)')
}

run()

