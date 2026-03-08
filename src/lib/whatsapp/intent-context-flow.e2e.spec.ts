import assert from 'node:assert/strict'

import { handleIntentoContexto } from './intent-context-flow.runtime.js'

type Contexto = {
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
}

async function run(): Promise<void> {
  const numero = '5599999999999'

  {
    let estado: Contexto = {}
    const mensagens: string[] = []

    const result = await handleIntentoContexto({
      numero,
      texto: 'oi',
      etapaAtual: null,
      contextoAtual: estado,
      atualizarContextoConversa: async (_n: string, patch: Partial<Contexto>) => {
        estado = { ...estado, ...patch }
        return estado
      },
      identificarIntencao: async () => 'consulta',
      responder: async (m: string) => {
        mensagens.push(m)
      },
    })

    assert.equal(result.intencao, 'onboarding')
    assert.equal(result.handled, false)
    assert.equal(mensagens.length, 0)
  }

  {
    let estado: Contexto = { perfil_comunicacao: 'consultivo' }

    const result = await handleIntentoContexto({
      numero,
      texto: 'menu',
      etapaAtual: 'concluido',
      contextoAtual: estado,
      atualizarContextoConversa: async (_n: string, patch: Partial<Contexto>) => {
        estado = { ...estado, ...patch }
        return estado
      },
      identificarIntencao: async () => 'comando',
      responder: async () => {},
    })

    assert.equal(result.intencao, 'comando')
    assert.equal(estado.objetivo_atual, 'comando')
    assert.equal(estado.perfil_comunicacao, 'direto')
    assert.equal(result.handled, false)
  }

  {
    let estado: Contexto = {}

    const result = await handleIntentoContexto({
      numero,
      texto: 'como envio proposta no portal?',
      etapaAtual: 'concluido',
      contextoAtual: estado,
      atualizarContextoConversa: async (_n: string, patch: Partial<Contexto>) => {
        estado = { ...estado, ...patch }
        return estado
      },
      identificarIntencao: async () => 'onboarding',
      responder: async () => {},
    })

    assert.equal(result.intencao, 'duvida')
    assert.equal(estado.objetivo_atual, 'duvida')
    assert.equal(result.handled, false)
  }

  {
    let estado: Contexto = {}
    const mensagens: string[] = []

    const result = await handleIntentoContexto({
      numero,
      texto: 'quero edital',
      etapaAtual: 'concluido',
      contextoAtual: estado,
      atualizarContextoConversa: async (_n: string, patch: Partial<Contexto>) => {
        estado = { ...estado, ...patch }
        return estado
      },
      identificarIntencao: async () => 'consulta',
      responder: async (m: string) => {
        mensagens.push(m)
      },
    })

    assert.equal(result.intencao, 'consulta')
    assert.equal(result.handled, true)
    assert.ok(estado.aguardando_clarificacao?.ativa)
    assert.equal(estado.objetivo_atual, 'consulta')
    assert.equal(mensagens.length, 1)
    assert.ok(mensagens[0].includes('qual segmento e UF'))
  }

  console.log('intent-context-flow-e2e: OK (4/4)')
}

run()

