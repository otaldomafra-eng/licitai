import { NextResponse } from 'next/server'
import { buscarTodosEditais, MODALIDADES } from '@/lib/pncp/client'
import { resolverLinkEditalPNCP } from '@/lib/pncp/links'
import { createAdminClient } from '@/lib/supabase/server'
import type { EditalPNCP } from '@/types'

function autenticarCron(req: Request): boolean {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

function mapearEdital(e: EditalPNCP) {
  return {
    pncp_id: e.numeroControlePNCP,
    numero_controle_pncp: e.numeroControlePNCP,
    ano_compra: e.anoCompra,
    sequencial_compra: e.sequencialCompra,
    cnpj_orgao: e.orgaoEntidade?.cnpj ?? null,
    nome_orgao: e.orgaoEntidade?.razaoSocial ?? 'Nao informado',
    uf_orgao: e.unidadeOrgao?.ufSigla ?? null,
    municipio_orgao: e.unidadeOrgao?.municipioNome ?? null,
    objeto: e.objetoCompra,
    modalidade: e.modalidadeNome ?? null,
    modo_disputa: e.modoDisputaNome ?? null,
    valor_estimado: e.valorTotalEstimado ?? null,
    status: 'Recebendo Proposta',
    data_publicacao: e.dataPublicacaoPncp ?? null,
    data_abertura_proposta: e.dataAberturaProposta ?? null,
    data_encerramento: e.dataEncerramentoProposta ?? null,
    link_sistema_origem: resolverLinkEditalPNCP(e),
  }
}

const MODALIDADES_SYNC_PADRAO = [
  { codigo: MODALIDADES.PREGAO_ELETRONICO, nome: 'Pregao Eletronico' },
  { codigo: MODALIDADES.DISPENSA_LICITACAO, nome: 'Dispensa de Licitacao' },
  { codigo: MODALIDADES.CONCORRENCIA_ELETRONICA, nome: 'Concorrencia Eletronica' },
  { codigo: MODALIDADES.CONCORRENCIA_PRESENCIAL, nome: 'Concorrencia Presencial' },
  { codigo: MODALIDADES.INEXIGIBILIDADE, nome: 'Inexigibilidade' },
  { codigo: MODALIDADES.CREDENCIAMENTO, nome: 'Credenciamento' },
]

function parseIntSeguro(v: string | null | undefined, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.floor(n))
}

function resolverModalidades(req: Request): Array<{ codigo: string; nome: string }> {
  const url = new URL(req.url)
  const codigos = (url.searchParams.get('modalidades') ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

  if (codigos.length === 0) return MODALIDADES_SYNC_PADRAO

  return codigos.map((codigo) => {
    const match = MODALIDADES_SYNC_PADRAO.find((m) => m.codigo === codigo)
    return match ?? { codigo, nome: `Modalidade ${codigo}` }
  })
}

export async function GET(req: Request) {
  if (!autenticarCron(req)) {
    return NextResponse.json({ erro: 'Nao autorizado' }, { status: 401 })
  }

  return executarSincronizacao(req)
}

export async function POST(req: Request) {
  if (!autenticarCron(req)) {
    return NextResponse.json({ erro: 'Nao autorizado' }, { status: 401 })
  }

  return executarSincronizacao(req)
}

async function executarSincronizacao(req: Request) {
  const supabase = createAdminClient()
  const inicio = Date.now()
  const resumo: Record<string, { encontrados: number; inseridos: number }> = {}

  const url = new URL(req.url)
  const diasAtras = parseIntSeguro(url.searchParams.get('diasAtras') ?? process.env.PNCP_SYNC_DIAS_ATRAS, 90)
  const maxPaginas = parseIntSeguro(url.searchParams.get('maxPaginas') ?? process.env.PNCP_SYNC_MAX_PAGINAS, 30)
  const modalidades = resolverModalidades(req)

  let totalEncontrados = 0
  let totalInseridos = 0
  let totalIgnorados = 0

  try {
    for (const { codigo, nome } of modalidades) {
      console.log(`[PNCP Sync] Buscando ${nome} (codigo ${codigo})...`)

      let editais: EditalPNCP[]
      try {
        editais = await buscarTodosEditais({ diasAtras, modalidade: codigo, maxPaginas })
      } catch (err) {
        console.error(`[PNCP Sync] Erro ao buscar ${nome}:`, err instanceof Error ? err.message : err)
        resumo[nome] = { encontrados: 0, inseridos: 0 }
        continue
      }

      if (!editais.length) {
        console.log(`[PNCP Sync] Nenhum edital encontrado para ${nome}`)
        resumo[nome] = { encontrados: 0, inseridos: 0 }
        continue
      }

      totalEncontrados += editais.length

      const LOTE = 100
      let inseridosModalidade = 0

      for (let i = 0; i < editais.length; i += LOTE) {
        const lote = editais.slice(i, i + LOTE).map(mapearEdital)

        const { error, data: inseridos } = await supabase
          .from('editais_pncp')
          .upsert(lote, {
            onConflict: 'pncp_id',
            ignoreDuplicates: false,
          })
          .select('id')

        if (error) {
          console.error(`[PNCP Sync] Erro no upsert (${nome}):`, error)
          throw new Error(error.message)
        }

        const qtd = inseridos?.length ?? 0
        inseridosModalidade += qtd
        totalIgnorados += lote.length - qtd
      }

      totalInseridos += inseridosModalidade
      resumo[nome] = { encontrados: editais.length, inseridos: inseridosModalidade }
      console.log(`[PNCP Sync] ${nome}: ${editais.length} encontrados, ${inseridosModalidade} inseridos/atualizados`)
    }

    const duracao = ((Date.now() - inicio) / 1000).toFixed(2)
    console.log(`[PNCP Sync] Total: ${totalInseridos} inseridos/atualizados, ${totalIgnorados} sem alteracao. ${duracao}s`)

    return NextResponse.json({
      sucesso: true,
      dias_atras: diasAtras,
      max_paginas: maxPaginas,
      modalidades: modalidades.map((m) => m.codigo),
      total_encontrados: totalEncontrados,
      novos_inseridos: totalInseridos,
      ja_existiam: totalIgnorados,
      por_modalidade: resumo,
      duracao_segundos: Number(duracao),
    })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[PNCP Sync] Falha:', mensagem)
    return NextResponse.json({ erro: mensagem }, { status: 500 })
  }
}
