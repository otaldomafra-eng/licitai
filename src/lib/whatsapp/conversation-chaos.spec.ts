import assert from 'node:assert/strict'

import {
    decidirClarificacaoPendente,
    detectarClarificacaoNecessaria,
} from './conversation-state.runtime.js'

type KindEsperado = 'bypass_clear' | 'reprompt_keep' | 'reprompt_clear' | 'resolve'

const TOKENS = [
    'menu', 'ajuda', 'planos', 'suporte', 'pausar', 'ativar', 'cancelar',
    'quero', 'edital', 'consultoria', 'engenharia', 'ti', 'obra', 'pregao',
    'SP', 'TO', 'MG', 'GO', 'acima', 'abaixo', '100k', '500k',
    'tanto faz', 'qualquer edital', 'ok', 'isso', 'sim',
    '!!!!', 'aaaaaa', 'deploy', 'vercel', 'gateway', 'pagamento',
]

function rand(max: number): number {
    return Math.floor(Math.random() * max)
}

function sampleMensagem(): string {
    const tamanho = 1 + rand(10)
    const partes: string[] = []
    for (let i = 0; i < tamanho; i += 1) {
        partes.push(TOKENS[rand(TOKENS.length)])
    }
    return partes.join(' ')
}

function run(): void {
    const clarificacao = detectarClarificacaoNecessaria('quero edital', 'consulta')
    assert.ok(clarificacao)

    const permitidos: KindEsperado[] = ['bypass_clear', 'reprompt_keep', 'reprompt_clear', 'resolve']
    const contagem: Record<KindEsperado, number> = {
        bypass_clear: 0,
        reprompt_keep: 0,
        reprompt_clear: 0,
        resolve: 0,
    }

    for (let i = 0; i < 500; i += 1) {
        const texto = sampleMensagem()
        const decisao = decidirClarificacaoPendente(texto, {
            ativa: true,
            tipo: clarificacao!.tipo,
            pergunta: clarificacao!.pergunta,
            base_usuario: clarificacao!.baseUsuario,
            criado_em: new Date().toISOString(),
            tentativas: i % 2,
        })

        assert.ok(permitidos.includes(decisao.kind as KindEsperado))
        contagem[decisao.kind as KindEsperado] += 1

        if ('mensagem' in decisao) {
            assert.ok(decisao.mensagem!.length > 10)
        }

        if ('tentativas' in decisao) {
            assert.ok(decisao.tentativas >= 1)
        }

        if ('textoComposto' in decisao) {
            assert.ok(decisao.textoComposto!.includes('.'))
        }
    }

    const total = Object.values(contagem).reduce((acc, n) => acc + n, 0)
    assert.equal(total, 500)
    console.log(`conversation-chaos: OK (500/500) -> ${JSON.stringify(contagem)}`)
}

run()

