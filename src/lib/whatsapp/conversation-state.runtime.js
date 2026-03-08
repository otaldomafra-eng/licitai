function normalizar(texto) {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
}

export function inferirPerfilComunicacao(texto, atual) {
  const t = normalizar(texto)
  if (/^[1-4]$/.test(t) || /^(menu|ajuda|help|edital\s+\d+|mostrar mais|mais|ok|blz|valeu)$/.test(t) || t.length <= 18) return 'direto'
  if (/(por favor|poderia|gostaria|quero entender|me explica|duvida|duvidas)/.test(t) || (t.includes('?') && t.length > 28)) return 'consultivo'
  return atual ?? 'consultivo'
}

export function detectarClarificacaoNecessaria(texto, intencao) {
  const t = normalizar(texto)

  if (intencao === 'duvida') {
    if (/^(oi|ola|bom dia|boa tarde|boa noite|ajuda|me ajuda|duvida|duvidas)$/.test(t)) {
      return {
        tipo: 'duvida',
        baseUsuario: texto,
        pergunta: 'Posso te ajudar. Sua duvida e sobre como usar o sistema, sobre planos, ou sobre um edital especifico?',
      }
    }

    if (/^(como funciona\??|nao entendi\??)$/.test(t)) {
      return {
        tipo: 'duvida',
        baseUsuario: texto,
        pergunta: 'Perfeito. Voce quer entender o uso do bot, os planos, ou como analisar um edital especifico?',
      }
    }

    return null
  }

  const palavras = t.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  const stopwords = new Set([
    'buscar', 'busca', 'quero', 'queria', 'gostaria', 'edital', 'editais', 'licitacao', 'licitacoes',
    'mostrar', 'mostra', 'me', 'para', 'com', 'sem', 'de', 'do', 'da', 'em', 'no', 'na', 'por', 'favor',
  ])
  const termosReais = palavras.filter((p) => p.length > 2 && !stopwords.has(p))
  const temUF = /\b(ac|al|am|ap|ba|ce|df|es|go|ma|mg|ms|mt|pa|pb|pe|pi|pr|rj|rn|ro|rr|rs|sc|se|sp|to)\b/.test(t)
  const temValorOuPrazo = /\d/.test(t) || /(acima|abaixo|entre|ate|prazo|urgente|dias)/.test(t)

  if (termosReais.length <= 1 && !temUF && !temValorOuPrazo) {
    return {
      tipo: 'consulta',
      baseUsuario: texto,
      pergunta: 'Para eu buscar melhor: qual segmento e UF voce quer priorizar? Exemplo: "consultoria em TO".',
    }
  }

  return null
}

export function ehComandoGlobalDuranteClarificacao(texto) {
  const t = normalizar(texto)
  return /^(menu|ajuda|help|suporte|planos|assinar|upgrade|meu plano|mudar perfil|alterar perfil|novo perfil|pausar|parar|parar alertas|ativar|retomar|retomar alertas|cancelar|favoritos|meus editais|editais salvos|seguindo)$/.test(t)
}

export function respostaClarificacaoFraca(texto) {
  const t = normalizar(texto)
  if (!t) return true
  if (/^(sim|nao|n|s|ok|blz|isso|essa|esse|talvez|sei la|sla)$/.test(t)) return true
  if (t.length <= 3) return true
  return false
}

function detectarMudancaAssuntoDuranteClarificacao(texto, tipo) {
  const t = normalizar(texto)
  const temaSistema = /(como funciona|plano|planos|preco|assinatura|suporte|ajuda|upgrade|cancelar|gateway|pagamento|landing page|site|deploy|vercel)/.test(t)
  const temaConsulta = /(edital|licitacao|licitacoes|pregao|dispensa|concorrencia|mostrar mais|engenharia|consultoria|ti\b|obra)/.test(t)
  if (tipo === 'consulta' && temaSistema) return true
  if (tipo === 'duvida' && temaConsulta) return true
  return false
}

function respostaClarificacaoContraditoria(texto) {
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

function mensagemRuidosaOuSpam(texto) {
  const t = normalizar(texto)
  if (!t) return true

  const repeticaoExcessiva = /(\b\w+\b)(?:\s+\1){3,}/.test(t)
  const pontuacaoExcessiva = /[!?.,]{6,}/.test(t)
  const caracteresRepetidos = /(.)\1{5,}/.test(t)

  return repeticaoExcessiva || pontuacaoExcessiva || caracteresRepetidos
}

function respostaVagaGenerica(texto) {
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

function contemMultiplosComandosGlobais(texto) {
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

export function montarMensagemClarificada(baseUsuario, respostaUsuario) {
  return `${baseUsuario}. ${respostaUsuario}`
}

export function decidirClarificacaoPendente(texto, pendencia) {
  if (contemMultiplosComandosGlobais(texto)) {
    return {
      kind: 'reprompt_clear',
      mensagem: 'Recebi varios comandos na mesma mensagem. Envie apenas um comando por vez (ex: menu) ou uma frase unica com seu objetivo.',
    }
  }

  if (ehComandoGlobalDuranteClarificacao(texto)) return { kind: 'bypass_clear' }
  if (detectarMudancaAssuntoDuranteClarificacao(texto, pendencia.tipo)) return { kind: 'bypass_clear' }

  if (mensagemRuidosaOuSpam(texto)) {
    const tentativas = pendencia.tentativas ?? 0
    if (tentativas >= 1) {
      return {
        kind: 'reprompt_clear',
        mensagem: 'A mensagem veio com muito ruido. Vamos recomecar com uma unica frase objetiva para eu te ajudar melhor.',
      }
    }

    return {
      kind: 'reprompt_keep',
      tentativas: tentativas + 1,
      mensagem: 'Percebi ruido na mensagem. Reenvie em uma frase simples com o objetivo principal.',
    }
  }

  if (respostaVagaGenerica(texto)) {
    const tentativas = pendencia.tentativas ?? 0
    if (tentativas >= 1) {
      return {
        kind: 'reprompt_clear',
        mensagem: 'Ainda ficou generico demais. Vamos recomecar com uma frase contendo segmento, UF e faixa de valor aproximada.',
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
      mensagem: 'Percebi criterios conflitantes. Escolha so uma direcao principal para eu buscar melhor.',
    }
  }

  if (respostaClarificacaoFraca(texto)) {
    const tentativas = pendencia.tentativas ?? 0
    if (tentativas >= 1) {
      return {
        kind: 'reprompt_clear',
        mensagem: 'Preciso de um pouco mais de contexto para te ajudar com qualidade. Pode descrever em uma frase objetiva o que voce busca?',
      }
    }

    return {
      kind: 'reprompt_keep',
      tentativas: tentativas + 1,
      mensagem: 'Entendi. Para eu acertar melhor, me diga em uma frase: segmento + UF + faixa de valor (se tiver).',
    }
  }

  return { kind: 'resolve', textoComposto: montarMensagemClarificada(pendencia.base_usuario, texto) }
}
