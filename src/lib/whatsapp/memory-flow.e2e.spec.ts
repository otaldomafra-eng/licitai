import assert from 'node:assert/strict'

import { atualizarMemoriaConversa } from './memory-flow.runtime.js'

type Ctx = {
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

async function run(): Promise<void> {
  const numero = '5599999999999'
  let estado: Ctx = {}

  const atualizar = async (_n: string, patch: Partial<Ctx>) => {
    estado = { ...estado, ...patch }
    return estado
  }

  await atualizarMemoriaConversa({
    numero,
    texto: 'quero consultoria em TO acima de 100k',
    intencao: 'consulta',
    contextoAtual: estado,
    atualizarContextoConversa: atualizar,
  })

  assert.deepEqual(estado.memoria_usuario?.ufs_preferidas, ['TO'])
  assert.ok(estado.memoria_usuario?.segmentos_preferidos?.includes('consultoria'))
  assert.equal(estado.memoria_usuario?.valor_min_preferido, 100000)
  assert.equal(estado.memoria_usuario?.ultima_intencao, 'consulta')

  await atualizarMemoriaConversa({
    numero,
    texto: 'tambem em GO e MG',
    intencao: 'consulta',
    contextoAtual: estado,
    atualizarContextoConversa: atualizar,
  })

  assert.ok(estado.memoria_usuario?.ufs_preferidas?.includes('GO'))
  assert.ok(estado.memoria_usuario?.ufs_preferidas?.includes('MG'))

  await atualizarMemoriaConversa({
    numero,
    texto: 'responda de forma curta e objetiva',
    intencao: 'duvida',
    contextoAtual: estado,
    atualizarContextoConversa: atualizar,
  })

  assert.equal(estado.memoria_usuario?.estilo_resposta, 'direto')

  await atualizarMemoriaConversa({
    numero,
    texto: 'agora quero explicacao detalhada',
    intencao: 'duvida',
    contextoAtual: estado,
    atualizarContextoConversa: atualizar,
  })

  assert.equal(estado.memoria_usuario?.estilo_resposta, 'detalhado')
  assert.ok((estado.memoria_usuario?.topicos_recentes?.length ?? 0) >= 1)

  console.log('memory-flow-e2e: OK (4/4)')
}

run()
