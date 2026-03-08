export type PerfilComunicacao = 'direto' | 'consultivo'
export type TipoClarificacao = 'consulta' | 'duvida'

export interface ResultadoClarificacao {
    tipo: TipoClarificacao
    pergunta: string
    baseUsuario: string
}

export interface EstadoClarificacao {
    ativa: boolean
    tipo: TipoClarificacao
    pergunta: string
    base_usuario: string
    criado_em: string
    tentativas?: number
}

export type DecisaoClarificacaoPendente =
    | { kind: 'bypass_clear' }
    | { kind: 'reprompt_keep'; mensagem: string; tentativas: number }
    | { kind: 'reprompt_clear'; mensagem: string }
    | { kind: 'resolve'; textoComposto: string }

function normalizar(texto: string): string {
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

export function inferirPerfilComunicacao(
    texto: string,
    atual?: PerfilComunicacao
): PerfilComunicacao {
    const t = normalizar(texto)

    if (/^[1-4]$/.test(t) || /^(menu|ajuda|help|edital\s+\d+|mostrar mais|mais|ok|blz|valeu)$/.test(t) || t.length <= 18) {
        return 'direto'
    }

    if (/(por favor|poderia|gostaria|quero entender|me explica|duvida|duvidas)/.test(t) || (t.includes('?') && t.length > 28)) {
        return 'consultivo'
    }

    return atual ?? 'consultivo'
}

export function detectarClarificacaoNecessaria(
    texto: string,
    intencao: TipoClarificacao
): ResultadoClarificacao | null {
    const t = normalizar(texto)

    // Clarificação desabilitada — o bot responde diretamente sem perguntas intermediárias
    return null
}

export function ehComandoGlobalDuranteClarificacao(texto: string): boolean {
    const t = normalizar(texto)
    return /^(menu|ajuda|help|suporte|planos|assinar|upgrade|meu plano|mudar perfil|alterar perfil|novo perfil|pausar|parar|parar alertas|ativar|retomar|retomar alertas|cancelar|favoritos|meus editais|editais salvos|seguindo)$/.test(t)
}

export function respostaClarificacaoFraca(texto: string): boolean {
    const t = normalizar(texto)
    if (!t) return true
    if (/^(sim|nao|n|s|ok|blz|isso|essa|esse|talvez|sei la|sla)$/.test(t)) return true
    if (t.length <= 3) return true
    return false
}

function detectarMudancaAssuntoDuranteClarificacao(texto: string, tipo: TipoClarificacao): boolean {
    const t = normalizar(texto)

    const temaSistema = /(como funciona|plano|planos|preco|assinatura|suporte|ajuda|upgrade|cancelar|gateway|pagamento|landing page|site|deploy|vercel)/.test(t)
    const temaConsulta = /(edital|licitacao|licitacoes|pregao|dispensa|concorrencia|mostrar mais|engenharia|consultoria|ti\b|obra)/.test(t)

    if (tipo === 'consulta' && temaSistema) return true
    if (tipo === 'duvida' && temaConsulta) return true

    return false
}

function respostaClarificacaoContraditoria(texto: string): boolean {
    const t = normalizar(texto)

    const contradicoes = [
        /\b(quero|preciso|busco)\b.*\bmas nao\b/,
        /\bcom\b.*\bsem\b/,
        /\bacima de\b.*\babaixo de\b/,
        /\bem\b\s+[a-z]{2}\b.*\bmas nao\b\s+[a-z]{2}\b/,
        /\bao mesmo tempo\b.*\bnao\b/,
    ]

    return contradicoes.some((r) => r.test(t))
}

function mensagemRuidosaOuSpam(texto: string): boolean {
    const t = normalizar(texto)
    if (!t) return true

    const repeticaoExcessiva = /(\b\w+\b)(?:\s+\1){3,}/.test(t)
    const pontuacaoExcessiva = /[!?.,]{6,}/.test(t)
    const caracteresRepetidos = /(.)\1{5,}/.test(t)

    return repeticaoExcessiva || pontuacaoExcessiva || caracteresRepetidos
}

function respostaVagaGenerica(texto: string): boolean {
    const t = normalizar(texto)
    if (!t) return true

    if (/^(qualquer coisa|qualquer um|qualquer uma|tanto faz|o que tiver|qualquer edital|como der|nao sei|sei nao|sem preferencia|indiferente)$/.test(t)) {
        return true
    }

    const termosVagos = /(qualquer|tanto faz|indiferente|sem preferencia|o que tiver|como der)/.test(t)
    const temUF = /\b(ac|al|am|ap|ba|ce|df|es|go|ma|mg|ms|mt|pa|pb|pe|pi|pr|rj|rn|ro|rr|rs|sc|se|sp|to)\b/.test(t)
    const temNumero = /\d/.test(t)

    if (termosVagos && !temUF && !temNumero) return true
    return false
}

function contemMultiplosComandosGlobais(texto: string): boolean {
    const t = normalizar(texto)
    const comandos = [
        'menu', 'ajuda', 'help', 'suporte', 'planos', 'assinar', 'upgrade', 'meu plano',
        'mudar perfil', 'alterar perfil', 'novo perfil', 'pausar', 'parar', 'parar alertas',
        'ativar', 'retomar', 'retomar alertas', 'cancelar', 'favoritos', 'meus editais',
        'editais salvos', 'seguindo',
    ]

    const encontrados = comandos.filter((cmd) => new RegExp(`\\b${cmd.replace(/\s+/g, '\\s+')}\\b`).test(t))
    return encontrados.length >= 2
}

export function montarMensagemClarificada(baseUsuario: string, respostaUsuario: string): string {
    return `${baseUsuario}. ${respostaUsuario}`
}

export function decidirClarificacaoPendente(
    texto: string,
    pendencia: EstadoClarificacao
): DecisaoClarificacaoPendente {
    if (contemMultiplosComandosGlobais(texto)) {
        return {
            kind: 'reprompt_clear',
            mensagem: 'Recebi vários comandos na mesma mensagem. Envie apenas um comando por vez (ex: menu) ou uma frase única com seu objetivo.',
        }
    }

    if (ehComandoGlobalDuranteClarificacao(texto)) {
        return { kind: 'bypass_clear' }
    }

    if (detectarMudancaAssuntoDuranteClarificacao(texto, pendencia.tipo)) {
        return { kind: 'bypass_clear' }
    }

    if (mensagemRuidosaOuSpam(texto)) {
        const tentativas = pendencia.tentativas ?? 0
        if (tentativas >= 1) {
            return {
                kind: 'reprompt_clear',
                mensagem: 'A mensagem veio com muito ruído. Vamos recomeçar com uma única frase objetiva para eu te ajudar melhor.',
            }
        }

        return {
            kind: 'reprompt_keep',
            tentativas: tentativas + 1,
            mensagem: 'Percebi ruído na mensagem. Reenvie em uma frase simples com o objetivo principal.',
        }
    }

    if (respostaVagaGenerica(texto)) {
        const tentativas = pendencia.tentativas ?? 0
        if (tentativas >= 1) {
            return {
                kind: 'reprompt_clear',
                mensagem: 'Ainda ficou genérico demais. Vamos recomeçar com uma frase contendo segmento, UF e faixa de valor aproximada.',
            }
        }

        return {
            kind: 'reprompt_keep',
            tentativas: tentativas + 1,
            mensagem: 'Para te ajudar de forma precisa, evite "tanto faz". Me diga ao menos segmento e UF de interesse.',
        }
    }

    if (respostaClarificacaoContraditoria(texto)) {
        const tentativas = pendencia.tentativas ?? 0
        if (tentativas >= 1) {
            return {
                kind: 'reprompt_clear',
                mensagem: 'Sua resposta ficou contraditoria. Vamos recomecar: envie uma frase simples com objetivo principal + UF + faixa de valor.',
            }
        }

        return {
            kind: 'reprompt_keep',
            tentativas: tentativas + 1,
            mensagem: 'Percebi critérios conflitantes. Escolha só uma direção principal para eu buscar melhor.',
        }
    }

    if (respostaClarificacaoFraca(texto)) {
        const tentativas = pendencia.tentativas ?? 0
        if (tentativas >= 1) {
            return {
                kind: 'reprompt_clear',
                mensagem: 'Preciso de um pouco mais de contexto para te ajudar com qualidade. Pode descrever em uma frase objetiva o que você busca?',
            }
        }

        return {
            kind: 'reprompt_keep',
            tentativas: tentativas + 1,
            mensagem: 'Entendi. Para eu acertar melhor, me diga em uma frase: segmento + UF + faixa de valor (se tiver).',
        }
    }

    return {
        kind: 'resolve',
        textoComposto: montarMensagemClarificada(pendencia.base_usuario, texto),
    }
}
