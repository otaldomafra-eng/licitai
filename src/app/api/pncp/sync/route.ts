import { NextResponse } from 'next/server'
import { buscarTodosEditais } from '@/lib/pncp/client'
import { createAdminClient } from '@/lib/supabase/server'
import type { EditalPNCP } from '@/types'

// Protege a rota — chamada apenas via Vercel Cron ou internamente
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
    nome_orgao: e.orgaoEntidade?.razaoSocial ?? 'Não informado',
    uf_orgao: e.unidadeOrgao?.ufNome ?? null,
    municipio_orgao: e.unidadeOrgao?.municipioNome ?? null,
    objeto: e.objetoCompra,
    modalidade: e.modalidadeNome ?? null,
    modo_disputa: e.modoDisputaNome ?? null,
    valor_estimado: e.valorTotalEstimado ?? null,
    status: e.situacaoCompraNome ?? 'Recebendo Proposta',
    data_publicacao: e.dataPublicacaoPncp ?? null,
    data_abertura_proposta: e.dataAberturaProposta ?? null,
    data_encerramento: e.dataEncerramentoProposta ?? null,
    link_sistema_origem: e.linkSistemaOrigem ?? null,
    processado_ia: false,
  }
}

export async function POST(req: Request) {
  if (!autenticarCron(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const inicio = Date.now()

  try {
    // Busca editais de Pregão Eletrônico dos últimos 30 dias
    const editais = await buscarTodosEditais({ diasAtras: 30 })

    if (!editais.length) {
      return NextResponse.json({ sucesso: true, sincronizados: 0, mensagem: 'Nenhum edital encontrado' })
    }

    // Processa em lotes de 100 para evitar timeout
    const LOTE = 100
    let totalInseridos = 0
    let totalIgnorados = 0

    for (let i = 0; i < editais.length; i += LOTE) {
      const lote = editais.slice(i, i + LOTE).map(mapearEdital)

      const { error, data: inseridos } = await supabase
        .from('editais_pncp')
        .upsert(lote, {
          onConflict: 'pncp_id',
          ignoreDuplicates: true, // não sobrescreve editais já processados pela IA
        })
        .select('id')

      if (error) {
        console.error('[PNCP Sync] Erro no upsert:', error)
        throw new Error(error.message)
      }

      const qtd = inseridos?.length ?? 0
      totalInseridos += qtd
      totalIgnorados += lote.length - qtd
    }

    const duracao = ((Date.now() - inicio) / 1000).toFixed(2)

    console.log(`[PNCP Sync] ${totalInseridos} inseridos, ${totalIgnorados} já existiam. ${duracao}s`)

    return NextResponse.json({
      sucesso: true,
      total_encontrados: editais.length,
      novos_inseridos: totalInseridos,
      ja_existiam: totalIgnorados,
      duracao_segundos: Number(duracao),
    })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[PNCP Sync] Falha:', mensagem)
    return NextResponse.json({ erro: mensagem }, { status: 500 })
  }
}
