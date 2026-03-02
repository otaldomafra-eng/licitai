import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { EditalDB, PerfilEmpresa, ResultadoMatch } from '@/types'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Schema de validação da resposta da IA
const SchemaRespostaIA = z.object({
  score: z.number().min(0).max(100),
  justificativa: z.string().min(10),
  pontos_fortes: z.array(z.string()),
  riscos: z.array(z.string()),
  recomendacao: z.enum(['PARTICIPAR', 'AVALIAR', 'IGNORAR']),
})

function construirPrompt(edital: EditalDB, perfil: PerfilEmpresa): string {
  const valorFormatado = edital.valor_estimado
    ? `R$ ${edital.valor_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : 'Não informado'

  const dataEnc = edital.data_encerramento
    ? new Date(edital.data_encerramento).toLocaleDateString('pt-BR')
    : 'Não informado'

  const ufInteresse =
    perfil.uf_interesse?.length > 0
      ? perfil.uf_interesse.join(', ')
      : 'Todo o Brasil'

  const palavrasChave =
    perfil.palavras_chave?.length > 0
      ? perfil.palavras_chave.join(', ')
      : 'Não informadas'

  const segmentos =
    perfil.segmentos?.length > 0 ? perfil.segmentos.join(', ') : 'Não informados'

  const restricaoValor = (() => {
    if (perfil.valor_min && perfil.valor_max)
      return `Entre ${perfil.valor_min.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} e ${perfil.valor_max.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    if (perfil.valor_min)
      return `Mínimo ${perfil.valor_min.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    if (perfil.valor_max)
      return `Máximo ${perfil.valor_max.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    return 'Sem restrição'
  })()

  return `Você é um especialista sênior em licitações públicas brasileiras com 20 anos de experiência.

Sua tarefa é analisar se o edital abaixo é relevante para a empresa descrita e retornar um JSON estruturado.

## EDITAL LICITAÇÃO PÚBLICA

**Órgão Contratante:** ${edital.nome_orgao}
**UF:** ${edital.uf_orgao} | **Município:** ${edital.municipio_orgao}
**Modalidade:** ${edital.modalidade}
**Objeto (o que está sendo licitado):**
${edital.objeto}

**Valor Estimado:** ${valorFormatado}
**Data de Encerramento:** ${dataEnc}
**PNCP ID:** ${edital.pncp_id}

---

## PERFIL DA EMPRESA

**Descrição do negócio:**
${perfil.descricao}

**Segmentos de atuação:** ${segmentos}
**Palavras-chave do negócio:** ${palavrasChave}
**UFs de interesse:** ${ufInteresse}
**Faixa de valor aceita:** ${restricaoValor}

---

## SUA ANÁLISE

Avalie a compatibilidade entre o edital e o perfil da empresa considerando:

1. **Alinhamento de objeto:** O que é licitado corresponde ao que a empresa oferece?
2. **Capacidade técnica:** A empresa tem condições de atender os requisitos implícitos?
3. **Abrangência geográfica:** A UF do edital é de interesse da empresa?
4. **Compatibilidade de valor:** O valor está dentro da faixa aceitável?
5. **Competitividade:** É um mercado em que a empresa tem chance real?

## FORMATO DE RESPOSTA

Responda APENAS com JSON válido, sem texto antes ou depois:

{
  "score": <número de 0 a 100 representando o percentual de compatibilidade>,
  "justificativa": "<2 a 3 frases explicando o score de forma objetiva>",
  "pontos_fortes": ["<ponto forte 1>", "<ponto forte 2>", "<ponto forte 3>"],
  "riscos": ["<risco ou ponto de atenção 1>", "<risco 2>"],
  "recomendacao": "<PARTICIPAR se score >= 80, AVALIAR se 50-79, IGNORAR se < 50>"
}

Seja criterioso. Um score alto (>80) significa que a empresa tem alta probabilidade de conseguir o contrato se apresentar uma boa proposta.`
}

export async function analisarCompatibilidade(
  edital: EditalDB,
  perfil: PerfilEmpresa
): Promise<ResultadoMatch> {
  const prompt = construirPrompt(edital, perfil)

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  // Extrai o texto da resposta
  const conteudo = message.content[0]
  if (conteudo.type !== 'text') {
    throw new Error('Resposta inesperada da IA: tipo não é texto')
  }

  // Parse e validação com Zod
  let dadosBrutos: unknown
  try {
    // Remove possíveis blocos de código markdown antes do parse
    const textoLimpo = conteudo.text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    dadosBrutos = JSON.parse(textoLimpo)
  } catch {
    throw new Error(`IA retornou JSON inválido: ${conteudo.text.substring(0, 200)}`)
  }

  const resultado = SchemaRespostaIA.safeParse(dadosBrutos)
  if (!resultado.success) {
    throw new Error(`Estrutura de resposta inválida: ${resultado.error.message}`)
  }

  return resultado.data
}

// Processa um lote de editais para um único usuário
export async function processarLoteEditais(
  editais: EditalDB[],
  perfil: PerfilEmpresa,
  onProgresso?: (atual: number, total: number) => void
): Promise<Array<{ edital_id: string; resultado: ResultadoMatch | null; erro?: string }>> {
  const resultados = []

  for (let i = 0; i < editais.length; i++) {
    const edital = editais[i]
    onProgresso?.(i + 1, editais.length)

    try {
      const resultado = await analisarCompatibilidade(edital, perfil)
      resultados.push({ edital_id: edital.id, resultado })

      // Rate limiting: 500ms entre chamadas para respeitar limites da API
      if (i < editais.length - 1) {
        await new Promise((r) => setTimeout(r, 500))
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido'
      console.error(`[Matcher] Erro no edital ${edital.pncp_id}:`, mensagem)
      resultados.push({ edital_id: edital.id, resultado: null, erro: mensagem })
    }
  }

  return resultados
}
