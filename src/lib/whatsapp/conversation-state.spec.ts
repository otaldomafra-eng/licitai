import assert from 'node:assert/strict'

import {
    decidirClarificacaoPendente,
    detectarClarificacaoNecessaria,
    ehComandoGlobalDuranteClarificacao,
    inferirPerfilComunicacao,
    montarMensagemClarificada,
    respostaClarificacaoFraca,
} from './conversation-state.runtime.js'

function run(): void {
    const c1 = detectarClarificacaoNecessaria('quero licitacao', 'consulta')
    assert.ok(c1)
    assert.equal(c1?.tipo, 'consulta')

    const c2 = detectarClarificacaoNecessaria('engenharia em TO acima de 100k', 'consulta')
    assert.equal(c2, null)

    const c3 = detectarClarificacaoNecessaria('ajuda', 'duvida')
    assert.ok(c3)
    assert.equal(c3?.tipo, 'duvida')

    const c4 = detectarClarificacaoNecessaria('como funciona?', 'duvida')
    assert.ok(c4)
    assert.equal(c4?.tipo, 'duvida')

    assert.equal(inferirPerfilComunicacao('menu'), 'direto')
    assert.equal(inferirPerfilComunicacao('Poderia me explicar como funciona a analise de compatibilidade?'), 'consultivo')
    assert.equal(inferirPerfilComunicacao('entendido, vou verificar isso depois', 'direto'), 'direto')

    assert.equal(ehComandoGlobalDuranteClarificacao('menu'), true)
    assert.equal(ehComandoGlobalDuranteClarificacao('suporte'), true)
    assert.equal(ehComandoGlobalDuranteClarificacao('meu plano'), true)
    assert.equal(ehComandoGlobalDuranteClarificacao('retomar alertas'), true)
    assert.equal(ehComandoGlobalDuranteClarificacao('engenharia em TO'), false)

    assert.equal(respostaClarificacaoFraca('sim'), true)
    assert.equal(respostaClarificacaoFraca('ok'), true)
    assert.equal(respostaClarificacaoFraca('to'), true)
    assert.equal(respostaClarificacaoFraca('consultoria em TO para prefeitura'), false)

    const d1 = decidirClarificacaoPendente('menu', {
        ativa: true,
        tipo: 'consulta',
        pergunta: 'x',
        base_usuario: 'quero licitacao',
        criado_em: new Date().toISOString(),
        tentativas: 0,
    })
    assert.equal(d1.kind, 'bypass_clear')

    const d2 = decidirClarificacaoPendente('ok', {
        ativa: true,
        tipo: 'consulta',
        pergunta: 'x',
        base_usuario: 'quero licitacao',
        criado_em: new Date().toISOString(),
        tentativas: 0,
    })
    assert.equal(d2.kind, 'reprompt_keep')

    const d3 = decidirClarificacaoPendente('isso', {
        ativa: true,
        tipo: 'consulta',
        pergunta: 'x',
        base_usuario: 'quero licitacao',
        criado_em: new Date().toISOString(),
        tentativas: 1,
    })
    assert.equal(d3.kind, 'reprompt_clear')

    const d4 = decidirClarificacaoPendente('consultoria em TO acima de 100k', {
        ativa: true,
        tipo: 'consulta',
        pergunta: 'x',
        base_usuario: 'quero licitacao',
        criado_em: new Date().toISOString(),
        tentativas: 1,
    })
    assert.equal(d4.kind, 'resolve')

    const d5 = decidirClarificacaoPendente('menu ajuda planos', {
        ativa: true,
        tipo: 'consulta',
        pergunta: 'x',
        base_usuario: 'quero licitacao',
        criado_em: new Date().toISOString(),
        tentativas: 0,
    })
    assert.equal(d5.kind, 'reprompt_clear')

    const d6 = decidirClarificacaoPendente('ok ok ok ok', {
        ativa: true,
        tipo: 'consulta',
        pergunta: 'x',
        base_usuario: 'quero licitacao',
        criado_em: new Date().toISOString(),
        tentativas: 0,
    })
    assert.equal(d6.kind, 'reprompt_keep')

    const d7 = decidirClarificacaoPendente('tanto faz', {
        ativa: true,
        tipo: 'consulta',
        pergunta: 'x',
        base_usuario: 'quero licitacao',
        criado_em: new Date().toISOString(),
        tentativas: 0,
    })
    assert.equal(d7.kind, 'reprompt_keep')

    const d8 = decidirClarificacaoPendente('qualquer edital', {
        ativa: true,
        tipo: 'consulta',
        pergunta: 'x',
        base_usuario: 'quero licitacao',
        criado_em: new Date().toISOString(),
        tentativas: 1,
    })
    assert.equal(d8.kind, 'reprompt_clear')

    assert.equal(
        montarMensagemClarificada('quero licitacao', 'consultoria em TO'),
        'quero licitacao. consultoria em TO'
    )

    console.log('conversation-state: OK (26/26)')
}

run()
