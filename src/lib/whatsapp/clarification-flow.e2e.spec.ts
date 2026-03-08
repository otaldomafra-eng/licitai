import assert from 'node:assert/strict'

import { handleClarificacaoPendente } from './clarification-flow.runtime.js'

type Contexto = {
  aguardando_clarificacao?: {
    ativa: boolean
    tipo: 'consulta' | 'duvida'
    pergunta: string
    base_usuario: string
    criado_em: string
    tentativas?: number
  } | null
}

function baseContexto(tipo: 'consulta' | 'duvida' = 'consulta'): Contexto {
  return {
    aguardando_clarificacao: {
      ativa: true,
      tipo,
      pergunta: 'Qual segmento e UF?',
      base_usuario: 'quero edital',
      criado_em: new Date().toISOString(),
      tentativas: 0,
    },
  }
}

async function run(): Promise<void> {
  const numero = '5599999999999'

  {
    let estado = baseContexto('consulta')
    const mensagens: string[] = []

    const result = await handleClarificacaoPendente({
      numero,
      texto: 'ok',
      contextoAtual: estado,
      atualizarContextoConversa: async (_numero: string, patch: Partial<Contexto>) => {
        estado = { ...estado, ...patch }
        return estado
      },
      responder: async (m: string) => {
        mensagens.push(m)
      },
      resolverConsulta: async () => 'nao deveria chamar',
      resolverDuvida: async () => 'nao deveria chamar',
    })

    assert.equal(result.handled, true)
    assert.equal(mensagens.length, 1)
    assert.equal(estado.aguardando_clarificacao?.tentativas, 1)
  }

  {
    let estado = baseContexto('consulta')
    const mensagens: string[] = []
    let consultaChamadas = 0

    const result = await handleClarificacaoPendente({
      numero,
      texto: 'consultoria em TO acima de 100k',
      contextoAtual: estado,
      atualizarContextoConversa: async (_numero: string, patch: Partial<Contexto>) => {
        estado = { ...estado, ...patch }
        return estado
      },
      responder: async (m: string) => {
        mensagens.push(m)
      },
      resolverConsulta: async (_n: string, textoComposto: string) => {
        consultaChamadas += 1
        assert.ok(textoComposto.includes('quero edital. consultoria em TO acima de 100k'))
        return 'resultado consulta'
      },
      resolverDuvida: async () => 'nao deveria chamar',
    })

    assert.equal(result.handled, true)
    assert.equal(consultaChamadas, 1)
    assert.equal(estado.aguardando_clarificacao, null)
    assert.equal(mensagens[0], 'resultado consulta')
  }

  {
    let estado = baseContexto('duvida')
    const mensagens: string[] = []
    let duvidaChamadas = 0

    const result = await handleClarificacaoPendente({
      numero,
      texto: 'quero edital em SP',
      contextoAtual: estado,
      atualizarContextoConversa: async (_numero: string, patch: Partial<Contexto>) => {
        estado = { ...estado, ...patch }
        return estado
      },
      responder: async (m: string) => {
        mensagens.push(m)
      },
      resolverConsulta: async () => 'nao deveria chamar',
      resolverDuvida: async () => {
        duvidaChamadas += 1
        return 'nao deveria chamar'
      },
    })

    assert.equal(result.handled, false)
    assert.equal(duvidaChamadas, 0)
    assert.equal(mensagens.length, 0)
    assert.equal(estado.aguardando_clarificacao, null)
  }

  console.log('clarification-flow-e2e: OK (3/3)')
}

run()
