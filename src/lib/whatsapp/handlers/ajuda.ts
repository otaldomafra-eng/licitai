/**
 * ajuda.ts — Handler de comandos de suporte/configuração via WhatsApp
 *
 * Fase 4: Comandos do menu (planos, pausar, mudar perfil, etc.)
 * A maior parte já está inline no webhook, este módulo centraliza
 * respostas de suporte e integração com AbacatePay.
 */

import { createAdminClient } from '@/lib/supabase/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://licitaia.com.br'

/**
 * Retorna o status atual da assinatura do usuário pelo número WhatsApp.
 */
export async function consultarPlano(numero: string): Promise<string> {
    const supabase = createAdminClient()

    // Busca usuário pelo WhatsApp
    const { data: usuario } = await supabase
        .from('usuarios')
        .select('id')
        .eq('whatsapp', numero)
        .maybeSingle()

    if (!usuario) {
        return [
            '❓ Não encontrei seu cadastro.',
            '',
            '_Envie *oi* para iniciar o cadastro gratuito._',
        ].join('\n')
    }

    // Busca assinatura ativa
    const { data: assinatura } = await supabase
        .from('assinaturas')
        .select('plano, status, validade')
        .eq('usuario_id', usuario.id)
        .eq('status', 'ativo')
        .maybeSingle()

    if (!assinatura) {
        return [
            '🆓 *Plano atual: Grátis*',
            '• 3 alertas/mês',
            '• 10 consultas/mês',
            '',
            `💳 Para fazer upgrade: ${APP_URL}/checkout`,
        ].join('\n')
    }

    const validade = assinatura.validade
        ? new Date(assinatura.validade).toLocaleDateString('pt-BR')
        : 'Vitalício'

    const nomesPlano: Record<string, string> = {
        basico: '⭐ Básico',
        pro: '🚀 Pro',
    }

    return [
        `${nomesPlano[assinatura.plano] ?? assinatura.plano} *— Ativo até ${validade}*`,
        '',
        '_Obrigado por assinar o LicitaIA!_',
    ].join('\n')
}

/**
 * Pausa ou retoma alertas de um usuário.
 */
export async function alternarAlertas(numero: string, pausar: boolean): Promise<string> {
    const supabase = createAdminClient()

    const { error } = await supabase
        .from('usuarios')
        .update({ alertas_pausados: pausar })
        .eq('whatsapp', numero)

    if (error) {
        console.error('[Ajuda] Erro ao alterar alertas:', error.message)
        return '⚠️ Não consegui alterar seus alertas. Tente novamente.'
    }

    if (pausar) {
        return [
            '⏸️ *Alertas pausados.*',
            '',
            '_Você não receberá notificações por 7 dias._',
            '_Responda *ativar* para retomar a qualquer momento._',
        ].join('\n')
    }

    return [
        '▶️ *Alertas reativados!*',
        '',
        '_Você voltará a receber notificações de novos editais compatíveis._',
    ].join('\n')
}

/**
 * Resposta de suporte humano.
 */
export function respostaSuporte(): string {
    return [
        '🆘 *Suporte LicitaIA*',
        '',
        'Para falar com nossa equipe:',
        `📧 suporte@licitaia.com.br`,
        `🌐 ${APP_URL}/suporte`,
        '',
        '_Respondemos em até 24h úteis._',
    ].join('\n')
}
