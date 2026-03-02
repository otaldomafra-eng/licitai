/**
 * consulta.ts — Handler de consulta manual de editais via WhatsApp
 *
 * Fase 3: Usuário pergunta sobre licitações específicas ou categorias.
 * Busca em editais_pncp e responde com lista formatada.
 */

import { createAdminClient } from '@/lib/supabase/server'
import type { EditalDB } from '@/types'

const MAX_RESULTADOS = 5

/** Formata um edital resumido para mensagem WhatsApp */
function formatarEditalResumido(edital: EditalDB, indice: number): string {
    const valor = edital.valor_estimado
        ? edital.valor_estimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : 'Valor não informado'

    const encerramento = edital.data_encerramento
        ? new Date(edital.data_encerramento).toLocaleDateString('pt-BR')
        : 'Prazo não informado'

    return [
        `*${indice}. ${edital.nome_orgao}*`,
        `📋 ${edital.objeto.substring(0, 120)}${edital.objeto.length > 120 ? '...' : ''}`,
        `💰 ${valor} | 📅 Encerra: ${encerramento}`,
        `📍 ${edital.municipio_orgao ?? ''} - ${edital.uf_orgao ?? ''}`,
    ].join('\n')
}

/**
 * Busca editais relacionados à consulta do usuário.
 * Usa pesquisa textual simples (ILIKE) em objeto e nome_orgao.
 */
export async function handleConsulta(
    _numero: string,
    texto: string
): Promise<string> {
    const supabase = createAdminClient()

    // Extrai termos relevantes (remove palavras comuns de busca)
    const stopwords = ['busca', 'procura', 'quero', 'ver', 'licitação', 'licitacoes', 'edital', 'editais', 'de', 'do', 'para', 'em']
    const termos = texto
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2 && !stopwords.includes(t))

    if (termos.length === 0) {
        return [
            '🔍 Para buscar licitações, me diga o que está procurando.',
            '',
            '_Ex: "licitações de TI em SP", "pregão para limpeza", "software prefeitura"_',
        ].join('\n')
    }

    const termoBusca = termos.slice(0, 3).join(' ')

    try {
        const { data: editais, error } = await supabase
            .from('editais_pncp')
            .select('*')
            .eq('status', 'Recebendo Proposta')
            .ilike('objeto', `%${termoBusca}%`)
            .order('data_publicacao', { ascending: false })
            .limit(MAX_RESULTADOS)

        if (error) throw new Error(error.message)

        if (!editais || editais.length === 0) {
            return [
                `🔍 Não encontrei editais ativos para _"${termoBusca}"_.`,
                '',
                '💡 *Dicas:*',
                '• Tente termos mais simples (ex: "TI", "software", "limpeza")',
                '• Os alertas automáticos às 7h cobrem muito mais editais',
                '',
                '_Seus alertas automáticos estão ativos e monitorando novidades._',
            ].join('\n')
        }

        const lista = (editais as EditalDB[])
            .map((e, i) => formatarEditalResumido(e, i + 1))
            .join('\n\n')

        return [
            `🔍 *${editais.length} edital(is) encontrado(s) para "${termoBusca}":*`,
            '',
            lista,
            '',
            '_Para mais detalhes de um edital, responda com o número (ex: "1")_',
        ].join('\n')
    } catch (err) {
        console.error('[Consulta] Erro na busca:', err instanceof Error ? err.message : err)
        return [
            '⚠️ Não consegui buscar os editais agora. Tente novamente em instantes.',
            '',
            '_Seus alertas automáticos continuam ativos!_',
        ].join('\n')
    }
}
