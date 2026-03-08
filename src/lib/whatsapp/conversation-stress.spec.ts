import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import {
    decidirClarificacaoPendente,
    detectarClarificacaoNecessaria,
    inferirPerfilComunicacao,
} from './conversation-state.runtime.js'

type Intencao = 'consulta' | 'duvida'
type Tipo = 'single' | 'multi' | 'sequence'
type Categoria =
    | 'clarificacao-base'
    | 'perfil'
    | 'ambiguidades'
    | 'contradicao'
    | 'mudanca-assunto'
    | 'spam-comandos'
    | 'ruido'
    | 'vaguidade'

type Scenario = {
    id: string
    tipo: Tipo
    categoria: Categoria
    intencao: Intencao
    entrada: string
    resposta?: string
    respostas?: string[]
    esperado: string
}

const LONGA_MENSAGEM = [
    'Estou buscando oportunidades na area de tecnologia para orgaos publicos, com foco em servicos de desenvolvimento,',
    'sustentacao, suporte e evolucao de sistemas, preferencialmente em TO e GO, mas posso avaliar outros estados,',
    'com faixa de valor de 200k ate 2M, desde que o prazo de entrega seja compativel e exista clareza no escopo.',
].join(' ')

const scenarios: Scenario[] = [
    { id: 'S1', tipo: 'single', categoria: 'clarificacao-base', intencao: 'consulta', entrada: 'quero edital', esperado: 'clarificacao' },
    { id: 'S2', tipo: 'single', categoria: 'clarificacao-base', intencao: 'consulta', entrada: 'engenharia em TO acima de 100k', esperado: 'sem_clarificacao' },
    { id: 'S3', tipo: 'single', categoria: 'clarificacao-base', intencao: 'duvida', entrada: 'ajuda', esperado: 'clarificacao' },
    { id: 'S4', tipo: 'single', categoria: 'clarificacao-base', intencao: 'duvida', entrada: 'como funciona?', esperado: 'clarificacao' },
    { id: 'S5', tipo: 'single', categoria: 'clarificacao-base', intencao: 'duvida', entrada: 'qual o prazo medio de encerramento?', esperado: 'sem_clarificacao' },
    { id: 'S6', tipo: 'single', categoria: 'clarificacao-base', intencao: 'consulta', entrada: 'TI', esperado: 'clarificacao' },
    { id: 'S7', tipo: 'single', categoria: 'clarificacao-base', intencao: 'consulta', entrada: 'consultoria para prefeitura em SP', esperado: 'sem_clarificacao' },
    { id: 'S8', tipo: 'single', categoria: 'clarificacao-base', intencao: 'consulta', entrada: LONGA_MENSAGEM, esperado: 'sem_clarificacao' },

    { id: 'M1', tipo: 'multi', categoria: 'ambiguidades', intencao: 'consulta', entrada: 'quero licitacao', resposta: 'ok', esperado: 'reprompt_keep' },
    { id: 'M2', tipo: 'multi', categoria: 'ambiguidades', intencao: 'consulta', entrada: 'quero licitacao', resposta: 'isso', esperado: 'reprompt_clear' },
    { id: 'M3', tipo: 'multi', categoria: 'ambiguidades', intencao: 'consulta', entrada: 'quero licitacao', resposta: 'consultoria em TO acima de 100k', esperado: 'resolve' },

    { id: 'M4', tipo: 'multi', categoria: 'mudanca-assunto', intencao: 'consulta', entrada: 'quero licitacao', resposta: 'menu', esperado: 'bypass_clear' },
    { id: 'M5', tipo: 'multi', categoria: 'mudanca-assunto', intencao: 'consulta', entrada: 'quero licitacao', resposta: 'como funciona o plano pro?', esperado: 'bypass_clear' },
    { id: 'M6', tipo: 'multi', categoria: 'mudanca-assunto', intencao: 'duvida', entrada: 'como funciona?', resposta: 'quero edital em SP', esperado: 'bypass_clear' },
    { id: 'M9', tipo: 'multi', categoria: 'mudanca-assunto', intencao: 'consulta', entrada: 'quero licitacao', resposta: 'vamos falar de deploy no vercel', esperado: 'bypass_clear' },

    { id: 'M7', tipo: 'multi', categoria: 'contradicao', intencao: 'consulta', entrada: 'quero licitacao', resposta: 'quero em sp mas nao em sp', esperado: 'reprompt_keep' },
    { id: 'M8', tipo: 'multi', categoria: 'contradicao', intencao: 'consulta', entrada: 'quero licitacao', resposta: 'acima de 500k e abaixo de 100k', esperado: 'reprompt_keep' },

    { id: 'R1', tipo: 'multi', categoria: 'ruido', intencao: 'consulta', entrada: 'quero licitacao', resposta: 'ok ok ok ok', esperado: 'reprompt_keep' },
    { id: 'R2', tipo: 'multi', categoria: 'ruido', intencao: 'consulta', entrada: 'quero licitacao', resposta: '!!!!!!!!!!', esperado: 'reprompt_keep' },
    { id: 'R3', tipo: 'multi', categoria: 'ruido', intencao: 'consulta', entrada: 'quero licitacao', resposta: 'aaaaaaa', esperado: 'reprompt_keep' },

    { id: 'V1', tipo: 'multi', categoria: 'vaguidade', intencao: 'consulta', entrada: 'quero licitacao', resposta: 'tanto faz', esperado: 'reprompt_keep' },
    { id: 'V2', tipo: 'multi', categoria: 'vaguidade', intencao: 'consulta', entrada: 'quero licitacao', resposta: 'qualquer edital', esperado: 'reprompt_keep' },
    { id: 'V3', tipo: 'multi', categoria: 'vaguidade', intencao: 'consulta', entrada: 'quero licitacao', resposta: 'qualquer coisa', esperado: 'reprompt_clear' },

    { id: 'Q1', tipo: 'sequence', categoria: 'spam-comandos', intencao: 'consulta', entrada: 'quero licitacao', respostas: ['menu','ajuda','planos','suporte','pausar','ativar','cancelar','help','menu','planos'], esperado: 'bypass_all' },
    { id: 'Q2', tipo: 'multi', categoria: 'spam-comandos', intencao: 'consulta', entrada: 'quero licitacao', resposta: 'menu ajuda planos', esperado: 'reprompt_clear' },

    { id: 'P1', tipo: 'single', categoria: 'perfil', intencao: 'duvida', entrada: 'menu', esperado: 'perfil_direto' },
    { id: 'P2', tipo: 'single', categoria: 'perfil', intencao: 'duvida', entrada: 'Poderia me explicar detalhadamente como interpretar o score?', esperado: 'perfil_consultivo' },
]

function runScenario(s: Scenario): { id: string; status: 'PASS' | 'FAIL'; detalhe: string; intencao: Intencao; categoria: Categoria } {
    try {
        if (s.tipo === 'single') {
            if (s.esperado === 'perfil_direto') {
                assert.equal(inferirPerfilComunicacao(s.entrada), 'direto')
            } else if (s.esperado === 'perfil_consultivo') {
                assert.equal(inferirPerfilComunicacao(s.entrada), 'consultivo')
            } else {
                const c = detectarClarificacaoNecessaria(s.entrada, s.intencao)
                if (s.esperado === 'clarificacao') assert.ok(c)
                if (s.esperado === 'sem_clarificacao') assert.equal(c, null)
            }
            return { id: s.id, status: 'PASS', detalhe: s.esperado, intencao: s.intencao, categoria: s.categoria }
        }

        const c = detectarClarificacaoNecessaria(s.entrada, s.intencao)
        assert.ok(c)

        if (s.tipo === 'multi') {
            const pendenciaBase = {
                ativa: true,
                tipo: c!.tipo,
                pergunta: c!.pergunta,
                base_usuario: c!.baseUsuario,
                criado_em: new Date().toISOString(),
                tentativas: s.esperado === 'reprompt_clear' ? 1 : 0,
            }

            const decisao = decidirClarificacaoPendente(s.resposta ?? '', pendenciaBase)
            assert.equal(decisao.kind, s.esperado)
            return { id: s.id, status: 'PASS', detalhe: decisao.kind, intencao: s.intencao, categoria: s.categoria }
        }

        const respostas = s.respostas ?? []
        assert.ok(respostas.length >= 10)

        for (const r of respostas) {
            const decisao = decidirClarificacaoPendente(r, {
                ativa: true,
                tipo: c!.tipo,
                pergunta: c!.pergunta,
                base_usuario: c!.baseUsuario,
                criado_em: new Date().toISOString(),
                tentativas: 0,
            })
            assert.equal(decisao.kind, 'bypass_clear')
        }

        return { id: s.id, status: 'PASS', detalhe: 'bypass_clear x10', intencao: s.intencao, categoria: s.categoria }
    } catch (err) {
        return {
            id: s.id,
            status: 'FAIL',
            detalhe: err instanceof Error ? err.message : String(err),
            intencao: s.intencao,
            categoria: s.categoria,
        }
    }
}

function gerarRelatorio(resultados: Array<{ id: string; status: 'PASS' | 'FAIL'; detalhe: string; intencao: Intencao; categoria: Categoria }>): string {
    const total = resultados.length
    const pass = resultados.filter((r) => r.status === 'PASS').length
    const fail = total - pass

    const porIntencao = {
        consulta: resultados.filter((r) => r.intencao === 'consulta'),
        duvida: resultados.filter((r) => r.intencao === 'duvida'),
    }

    const categorias: Categoria[] = [
        'clarificacao-base',
        'perfil',
        'ambiguidades',
        'contradicao',
        'mudanca-assunto',
        'spam-comandos',
        'ruido',
        'vaguidade',
    ]

    const linhas: string[] = []
    linhas.push('# Relatorio de Cobertura Conversacional')
    linhas.push('')
    linhas.push(`- Total de cenarios: **${total}**`)
    linhas.push(`- Sucesso: **${pass}**`)
    linhas.push(`- Falhas: **${fail}**`)
    linhas.push('')
    linhas.push('## Cobertura por intencao')
    linhas.push('')
    linhas.push(`- consulta: ${porIntencao.consulta.length} cenarios`)
    linhas.push(`- duvida: ${porIntencao.duvida.length} cenarios`)
    linhas.push('')
    linhas.push('## Cobertura por categoria')
    linhas.push('')
    for (const categoria of categorias) {
      linhas.push(`- ${categoria}: ${resultados.filter((r) => r.categoria === categoria).length} cenarios`)
    }
    linhas.push('')
    linhas.push('## Resultados')
    linhas.push('')
    linhas.push('| ID | Categoria | Intencao | Status | Detalhe |')
    linhas.push('|---|---|---|---|---|')
    for (const r of resultados) {
        linhas.push(`| ${r.id} | ${r.categoria} | ${r.intencao} | ${r.status} | ${r.detalhe.replace(/\|/g, '/') } |`)
    }
    linhas.push('')
    linhas.push('## Escopo de stress')
    linhas.push('')
    linhas.push('- mensagens longas e objetivas')
    linhas.push('- troca brusca de assunto durante clarificacao')
    linhas.push('- spam/comandos globais durante pendencia (10+ comandos)')
    linhas.push('- multiplos comandos na mesma mensagem')
    linhas.push('- ambiguidades sucessivas e resposta fraca repetida')
    linhas.push('- respostas contraditorias durante clarificacao')
    linhas.push('- ruido textual (repeticao, pontuacao extrema, caracteres repetidos)')
    linhas.push('- respostas vagas/genericas (ex.: "tanto faz", "qualquer edital")')

    return linhas.join('\n')
}

function run(): void {
    const resultados = scenarios.map(runScenario)

    const relatorio = gerarRelatorio(resultados)
    const target = resolve(process.cwd(), 'reports', 'conversation-coverage.md')
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, relatorio, 'utf8')

    const falhas = resultados.filter((r) => r.status === 'FAIL')
    if (falhas.length > 0) {
        console.error('conversation-stress: FAIL', falhas)
        process.exit(1)
    }

    console.log(`conversation-stress: OK (${resultados.length}/${resultados.length})`)
    console.log(`coverage-report: ${target}`)
}

run()
