/**
 * ROTA DE TESTE — remover antes do deploy em produção
 * Testa o mecanismo de busca com filtros NLP sem precisar do WhatsApp
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { extrairFiltrosConsulta } from '@/lib/ai/assistant'
import type { EditalDB, FiltrosConsulta } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'

async function buscarComFiltros(
    supabase: SupabaseClient,
    filtros: FiltrosConsulta,
    limite = 5
): Promise<EditalDB[]> {
    let query = supabase
        .from('editais_pncp')
        .select('id, nome_orgao, objeto, uf_orgao, municipio_orgao, valor_estimado, data_encerramento, modalidade, status')
        .eq('status', 'Recebendo Proposta')

    if (filtros.ufs.length > 0) query = query.in('uf_orgao', filtros.ufs)

    if (filtros.termos.length > 0) {
        query = query.or(filtros.termos.map((t) => `objeto.ilike.%${t}%`).join(','))
    }

    if (filtros.valor_min !== null) query = query.gte('valor_estimado', filtros.valor_min)
    if (filtros.valor_max !== null) query = query.lte('valor_estimado', filtros.valor_max)

    if (filtros.prazo_min_dias !== null) {
        const d = new Date(); d.setDate(d.getDate() + filtros.prazo_min_dias)
        query = query.gte('data_encerramento', d.toISOString())
    }
    if (filtros.prazo_max_dias !== null) {
        const d = new Date(); d.setDate(d.getDate() + filtros.prazo_max_dias)
        query = query.lte('data_encerramento', d.toISOString())
    }

    if (filtros.modalidade) query = query.ilike('modalidade', `%${filtros.modalidade}%`)
    if (filtros.tipo_orgao) {
        const orgaoMap: Record<string, string> = {
            prefeitura: 'Prefeitura', municipal: 'Prefeitura',
            federal: 'União', estadual: 'Estado',
            universidade: 'Universidade', autarquia: 'Autarquia',
        }
        query = query.ilike('nome_orgao', `%${orgaoMap[filtros.tipo_orgao.toLowerCase()] ?? filtros.tipo_orgao}%`)
    }

    const { data, error } = await query.order('data_publicacao', { ascending: false }).limit(limite)
    if (error) throw new Error(error.message)
    return (data as EditalDB[]) ?? []
}

export async function GET(req: Request) {
    const url = new URL(req.url)
    const q = url.searchParams.get('q')

    if (!q) {
        return NextResponse.json({ erro: 'Informe ?q=sua+consulta' }, { status: 400 })
    }

    // — Diagnóstico Supabase —
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '(não definida)'
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ definida' : '✗ ausente'
    const cerebrasKey = process.env.CEREBRAS_API_KEY ? '✓ definida' : '✗ ausente'

    // Testa conexão Supabase básica
    let supabaseStatus = 'ok'
    let supabaseContagem = 0
    const supabase = createAdminClient()
    try {
        const { count, error } = await supabase
            .from('editais_pncp')
            .select('*', { count: 'exact', head: true })
        if (error) supabaseStatus = `erro: ${error.message}`
        else supabaseContagem = count ?? 0
    } catch (e) {
        supabaseStatus = `fetch failed: ${e instanceof Error ? e.message : String(e)}`
    }

    // Extrai filtros via IA
    const filtros = await extrairFiltrosConsulta(q)

    // Se Supabase falhou, retorna diagnóstico
    if (supabaseStatus !== 'ok') {
        return NextResponse.json({
            diagnostico: {
                supabase_url: supabaseUrl,
                supabase_key: supabaseKey,
                cerebras_key: cerebrasKey,
                supabase_status: supabaseStatus,
            },
            filtros_extraidos: filtros,
            erro: 'Não foi possível conectar ao Supabase',
        }, { status: 500 })
    }

    // Busca com filtros completos
    let editais = await buscarComFiltros(supabase, filtros)

    // Relaxamento progressivo
    const tentativas: string[] = ['completo']

    if (editais.length === 0 && (filtros.prazo_min_dias || filtros.prazo_max_dias)) {
        editais = await buscarComFiltros(supabase, { ...filtros, prazo_min_dias: null, prazo_max_dias: null })
        tentativas.push('sem_prazo')
    }
    if (editais.length === 0 && (filtros.valor_min || filtros.valor_max)) {
        editais = await buscarComFiltros(supabase, { ...filtros, prazo_min_dias: null, prazo_max_dias: null, valor_min: null, valor_max: null })
        tentativas.push('sem_valor')
    }
    if (editais.length === 0) {
        editais = await buscarComFiltros(supabase, { ...filtros, prazo_min_dias: null, prazo_max_dias: null, valor_min: null, valor_max: null, modalidade: null, tipo_orgao: null })
        tentativas.push('apenas_termos_e_uf')
    }
    if (editais.length === 0 && filtros.ufs.length > 0) {
        editais = await buscarComFiltros(supabase, { ...filtros, ufs: [], prazo_min_dias: null, prazo_max_dias: null, valor_min: null, valor_max: null, modalidade: null, tipo_orgao: null })
        tentativas.push('apenas_termos')
    }

    return NextResponse.json({
        consulta: q,
        filtros_extraidos: filtros,
        tentativa_usada: tentativas[tentativas.length - 1],
        total_resultados: editais.length,
        resultados: editais.map((e) => ({
            orgao: e.nome_orgao,
            uf: e.uf_orgao,
            municipio: e.municipio_orgao,
            objeto: e.objeto?.substring(0, 150),
            valor: e.valor_estimado,
            modalidade: e.modalidade,
            encerramento: e.data_encerramento,
        })),
    })
}
