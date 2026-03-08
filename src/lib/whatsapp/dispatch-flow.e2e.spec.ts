import assert from 'node:assert/strict'

import { handleDispatchPorIntencao } from './dispatch-flow.runtime.js'

async function run(): Promise<void> {
  const numero = '5599999999999'
  const texto = 'mensagem teste'
  const contexto = { objetivo_atual: 'duvida' as const }

  {
    const mensagens: string[] = []
    let onboardingCalls = 0

    await handleDispatchPorIntencao({
      numero,
      texto,
      intencao: 'onboarding',
      contextoAtual: contexto,
      responder: async (m: string) => mensagens.push(m),
      resolverOnboarding: async () => {
        onboardingCalls += 1
        return 'onboarding ok'
      },
      resolverComando: async () => 'nao deveria chamar',
      resolverConsulta: async () => 'nao deveria chamar',
      resolverDuvida: async () => 'nao deveria chamar',
    })

    assert.equal(onboardingCalls, 1)
    assert.equal(mensagens[0], 'onboarding ok')
  }

  {
    const mensagens: string[] = []
    let comandoCalls = 0

    await handleDispatchPorIntencao({
      numero,
      texto,
      intencao: 'comando',
      contextoAtual: contexto,
      responder: async (m: string) => mensagens.push(m),
      resolverOnboarding: async () => 'nao deveria chamar',
      resolverComando: async (_n: string, _t: string, ctx?: unknown) => {
        comandoCalls += 1
        assert.ok(ctx)
        return 'comando ok'
      },
      resolverConsulta: async () => 'nao deveria chamar',
      resolverDuvida: async () => 'nao deveria chamar',
    })

    assert.equal(comandoCalls, 1)
    assert.equal(mensagens[0], 'comando ok')
  }

  {
    const mensagens: string[] = []
    let consultaCalls = 0

    await handleDispatchPorIntencao({
      numero,
      texto,
      intencao: 'consulta',
      contextoAtual: contexto,
      responder: async (m: string) => mensagens.push(m),
      resolverOnboarding: async () => 'nao deveria chamar',
      resolverComando: async () => 'nao deveria chamar',
      resolverConsulta: async () => {
        consultaCalls += 1
        return 'consulta ok'
      },
      resolverDuvida: async () => 'nao deveria chamar',
    })

    assert.equal(consultaCalls, 1)
    assert.equal(mensagens[0], 'consulta ok')
  }

  {
    const mensagens: string[] = []
    let duvidaCalls = 0

    await handleDispatchPorIntencao({
      numero,
      texto,
      intencao: 'duvida',
      contextoAtual: contexto,
      responder: async (m: string) => mensagens.push(m),
      resolverOnboarding: async () => 'nao deveria chamar',
      resolverComando: async () => 'nao deveria chamar',
      resolverConsulta: async () => 'nao deveria chamar',
      resolverDuvida: async () => {
        duvidaCalls += 1
        return 'duvida ok'
      },
    })

    assert.equal(duvidaCalls, 1)
    assert.equal(mensagens[0], 'duvida ok')
  }

  console.log('dispatch-flow-e2e: OK (4/4)')
}

run()
