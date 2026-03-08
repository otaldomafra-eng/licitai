import assert from 'node:assert/strict'

import { executarPipelineWebhook } from './webhook-pipeline.runtime.js'

type Ctx = {
  perfil_comunicacao?: 'direto' | 'consultivo'
  objetivo_atual?: 'consulta' | 'duvida' | 'comando'
  aguardando_clarificacao?: {
    ativa: boolean
    tipo: 'consulta' | 'duvida'
    pergunta: string
    base_usuario: string
    criado_em: string
    tentativas?: number
  } | null
  aguardando_acao_edital_id?: string
  ultimos_filtros?: Record<string, unknown>
  memoria_usuario?: {
    ufs_preferidas?: string[]
    segmentos_preferidos?: string[]
    valor_min_preferido?: number | null
    valor_max_preferido?: number | null
    estilo_resposta?: 'direto' | 'detalhado'
    ultima_intencao?: 'onboarding' | 'consulta' | 'comando' | 'duvida'
    topicos_recentes?: string[]
    atualizado_em?: string
  }
}

function depsBase(estadoRef: { estado: Ctx }, mensagens: string[]) {
  const calls = {
    identificar: 0,
    onboarding: 0,
    comando: 0,
    consulta: 0,
    duvida: 0,
    acao: 0,
    detalhe: 0,
    mais: 0,
    refinamento: 0,
  }

  return {
    calls,
    atualizarContextoConversa: async (_n: string, patch: Partial<Ctx>) => {
      estadoRef.estado = { ...estadoRef.estado, ...patch }
      return estadoRef.estado
    },
    responder: async (m: string) => {
      mensagens.push(m)
    },
    identificarIntencao: async () => {
      calls.identificar += 1
      return 'duvida' as const
    },
    resolverConsulta: async () => {
      calls.consulta += 1
      return 'consulta resposta'
    },
    resolverDuvida: async () => {
      calls.duvida += 1
      return 'duvida resposta'
    },
    resolverAcaoEdital: async () => {
      calls.acao += 1
      return 'acao resposta'
    },
    resolverDetalheEdital: async () => {
      calls.detalhe += 1
      return 'detalhe resposta'
    },
    resolverMaisResultados: async () => {
      calls.mais += 1
      return 'mais resposta'
    },
    resolverRefinamento: async () => {
      calls.refinamento += 1
      return 'refinamento resposta'
    },
    resolverOnboarding: async () => {
      calls.onboarding += 1
      return 'onboarding resposta'
    },
    resolverComando: async () => {
      calls.comando += 1
      return 'comando resposta'
    },
  }
}

async function run(): Promise<void> {
  const numero = '5599999999999'

  {
    const estadoRef = {
      estado: {
        aguardando_clarificacao: {
          ativa: true,
          tipo: 'consulta' as const,
          pergunta: 'Qual segmento?',
          base_usuario: 'quero edital',
          criado_em: new Date().toISOString(),
          tentativas: 0,
        },
      },
    }
    const mensagens: string[] = []
    const deps = depsBase(estadoRef, mensagens)

    const result = await executarPipelineWebhook({
      numero,
      texto: 'ok',
      etapaAtual: 'concluido',
      contextoAtual: estadoRef.estado,
      ...deps,
    })

    assert.equal(result.handled, true)
    assert.equal(mensagens.length, 1)
    assert.equal(estadoRef.estado.aguardando_clarificacao?.tentativas, 1)
    assert.equal(deps.calls.identificar, 0)
  }

  {
    const estadoRef = { estado: {} as Ctx }
    const mensagens: string[] = []
    const deps = depsBase(estadoRef, mensagens)

    const result = await executarPipelineWebhook({
      numero,
      texto: 'mostrar mais',
      etapaAtual: 'concluido',
      contextoAtual: estadoRef.estado,
      ...deps,
    })

    assert.equal(result.handled, true)
    assert.equal(deps.calls.mais, 1)
    assert.equal(mensagens[0], 'mais resposta')
    assert.equal(deps.calls.identificar, 0)
  }

  {
    const estadoRef = { estado: {} as Ctx }
    const mensagens: string[] = []
    const deps = depsBase(estadoRef, mensagens)

    const result = await executarPipelineWebhook({
      numero,
      texto: 'quero edital',
      etapaAtual: 'concluido',
      contextoAtual: estadoRef.estado,
      ...deps,
      identificarIntencao: async () => {
        deps.calls.identificar += 1
        return 'consulta' as const
      },
    })

    assert.equal(result.handled, true)
    assert.equal(result.intencao, 'consulta')
    assert.equal(mensagens.length, 1)
    assert.ok(mensagens[0].includes('qual segmento e UF'))
    assert.equal(deps.calls.consulta, 0)
  }

  {
    const estadoRef = { estado: {} as Ctx }
    const mensagens: string[] = []
    const deps = depsBase(estadoRef, mensagens)

    const result = await executarPipelineWebhook({
      numero,
      texto: 'como usar os filtros avancados?',
      etapaAtual: 'concluido',
      contextoAtual: estadoRef.estado,
      ...deps,
      identificarIntencao: async () => {
        deps.calls.identificar += 1
        return 'duvida' as const
      },
    })

    assert.equal(result.handled, true)
    assert.equal(result.intencao, 'duvida')
    assert.equal(deps.calls.duvida, 1)
    assert.equal(mensagens[0], 'duvida resposta')
    assert.equal(estadoRef.estado.memoria_usuario?.ultima_intencao, 'duvida')
  }

  {
    const estadoRef = { estado: {} as Ctx }
    const mensagens: string[] = []
    const deps = depsBase(estadoRef, mensagens)

    const result = await executarPipelineWebhook({
      numero,
      texto: 'oi',
      etapaAtual: null,
      contextoAtual: estadoRef.estado,
      ...deps,
    })

    assert.equal(result.handled, true)
    assert.equal(result.intencao, 'onboarding')
    assert.equal(deps.calls.onboarding, 1)
    assert.equal(mensagens[0], 'onboarding resposta')
  }

  console.log('webhook-pipeline-e2e: OK (5/5)')
}

run()

