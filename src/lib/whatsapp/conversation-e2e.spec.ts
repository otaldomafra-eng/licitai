import assert from 'node:assert/strict'

import {
    decidirClarificacaoPendente,
    detectarClarificacaoNecessaria,
} from './conversation-state.runtime.js'

type Pendencia = {
    ativa: boolean
    tipo: 'consulta' | 'duvida'
    pergunta: string
    base_usuario: string
    criado_em: string
    tentativas?: number
}

function simularFluxoConsultaAmbigua(): void {
    const primeira = 'quero licitacao'
    const clarificacao = detectarClarificacaoNecessaria(primeira, 'consulta')
    assert.ok(clarificacao)

    const pendencia: Pendencia = {
        ativa: true,
        tipo: clarificacao!.tipo as Pendencia['tipo'],
        pergunta: clarificacao!.pergunta,
        base_usuario: clarificacao!.baseUsuario,
        criado_em: new Date().toISOString(),
        tentativas: 0,
    }

    const r1 = decidirClarificacaoPendente('ok', pendencia)
    assert.equal(r1.kind, 'reprompt_keep')
    if (r1.kind === 'reprompt_keep') {
        pendencia.tentativas = r1.tentativas
    }

    const r2 = decidirClarificacaoPendente('consultoria em TO acima de 100k', pendencia)
    assert.equal(r2.kind, 'resolve')
    if (r2.kind === 'resolve') {
        assert.equal(r2.textoComposto, 'quero licitacao. consultoria em TO acima de 100k')
    }
}

function simularFluxoInterrompidoPorComando(): void {
    const clarificacao = detectarClarificacaoNecessaria('como funciona?', 'duvida')
    assert.ok(clarificacao)

    const pendencia: Pendencia = {
        ativa: true,
        tipo: clarificacao!.tipo as Pendencia['tipo'],
        pergunta: clarificacao!.pergunta,
        base_usuario: clarificacao!.baseUsuario,
        criado_em: new Date().toISOString(),
        tentativas: 0,
    }

    const r = decidirClarificacaoPendente('menu', pendencia)
    assert.equal(r.kind, 'bypass_clear')
}

function simularFluxoFalhaDeClarificacao(): void {
    const clarificacao = detectarClarificacaoNecessaria('quero edital', 'consulta')
    assert.ok(clarificacao)

    const pendencia: Pendencia = {
        ativa: true,
        tipo: clarificacao!.tipo as Pendencia['tipo'],
        pergunta: clarificacao!.pergunta,
        base_usuario: clarificacao!.baseUsuario,
        criado_em: new Date().toISOString(),
        tentativas: 0,
    }

    const r1 = decidirClarificacaoPendente('sim', pendencia)
    assert.equal(r1.kind, 'reprompt_keep')
    if (r1.kind === 'reprompt_keep') pendencia.tentativas = r1.tentativas

    const r2 = decidirClarificacaoPendente('isso', pendencia)
    assert.equal(r2.kind, 'reprompt_clear')
}

function simularFluxoSpamComandosMesmaMensagem(): void {
    const clarificacao = detectarClarificacaoNecessaria('quero edital', 'consulta')
    assert.ok(clarificacao)

    const pendencia: Pendencia = {
        ativa: true,
        tipo: clarificacao!.tipo as Pendencia['tipo'],
        pergunta: clarificacao!.pergunta,
        base_usuario: clarificacao!.baseUsuario,
        criado_em: new Date().toISOString(),
        tentativas: 0,
    }

    const r = decidirClarificacaoPendente('menu ajuda planos', pendencia)
    assert.equal(r.kind, 'reprompt_clear')
}

function simularFluxoVagoAteResolver(): void {
    const clarificacao = detectarClarificacaoNecessaria('quero edital', 'consulta')
    assert.ok(clarificacao)

    const pendencia: Pendencia = {
        ativa: true,
        tipo: clarificacao!.tipo as Pendencia['tipo'],
        pergunta: clarificacao!.pergunta,
        base_usuario: clarificacao!.baseUsuario,
        criado_em: new Date().toISOString(),
        tentativas: 0,
    }

    const r1 = decidirClarificacaoPendente('tanto faz', pendencia)
    assert.equal(r1.kind, 'reprompt_keep')
    if (r1.kind === 'reprompt_keep') pendencia.tentativas = r1.tentativas

    const r2 = decidirClarificacaoPendente('consultoria em GO acima de 300k', pendencia)
    assert.equal(r2.kind, 'resolve')
}

function run(): void {
    simularFluxoConsultaAmbigua()
    simularFluxoInterrompidoPorComando()
    simularFluxoFalhaDeClarificacao()
    simularFluxoSpamComandosMesmaMensagem()
    simularFluxoVagoAteResolver()
    console.log('conversation-e2e: OK (5 fluxos)')
}

run()
