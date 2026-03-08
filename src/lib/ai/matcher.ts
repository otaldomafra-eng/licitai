import OpenAI from 'openai'
import { z } from 'zod'
import type { EditalDB, PerfilEmpresa, ResultadoMatch } from '@/types'

const client = new OpenAI({
  apiKey: process.env.CEREBRAS_API_KEY,
  baseURL: 'https://api.cerebras.ai/v1',
})

const CEREBRAS_MODEL = 'gpt-oss-120b' // 120B params + 65k context — ideal para análise de compatibilidade

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

  const diasRestantes = edital.data_encerramento
    ? Math.max(0, Math.ceil((new Date(edital.data_encerramento).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null

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

  // Porte inferido pela faixa de valor (caso não informado)
  const porteEmpresa = perfil.porte_empresa ?? (() => {
    const max = perfil.valor_max
    const min = perfil.valor_min
    if (max && max <= 80000) return 'Microempresa (ME) ou MEI'
    if (max && max <= 500000) return 'Empresa de Pequeno Porte (EPP)'
    if (min && min >= 1000000) return 'Médio ou Grande porte'
    return 'Não determinado'
  })()

  // Proximidade geográfica
  const mesmaUF = edital.uf_orgao && perfil.uf_sede
    ? edital.uf_orgao === perfil.uf_sede
    : null
  const mesaCidade = edital.municipio_orgao && perfil.municipio_sede
    ? edital.municipio_orgao.toLowerCase().includes(perfil.municipio_sede.toLowerCase())
    : null

  const proximidade = mesaCidade
    ? `Mesma cidade (${edital.municipio_orgao}) — vantagem logística máxima`
    : mesmaUF === true
      ? `Mesmo estado (${edital.uf_orgao}) — vantagem logística moderada`
      : mesmaUF === false
        ? `Estado diferente (empresa: ${perfil.uf_sede}, edital: ${edital.uf_orgao}) — custo logístico adicional`
        : `Não determinado (sede da empresa não cadastrada)`

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
**Dias restantes para submissão:** ${diasRestantes !== null ? `${diasRestantes} dias` : 'Não informado'}
**PNCP ID:** ${edital.pncp_id}

---

## PERFIL DA EMPRESA

**Descrição do negócio:**
${perfil.descricao}

**Segmentos de atuação:** ${segmentos}
**Palavras-chave do negócio:** ${palavrasChave}
**UFs de interesse:** ${ufInteresse}
**Faixa de valor aceita:** ${restricaoValor}
**Porte da empresa:** ${porteEmpresa}
**Sede:** ${perfil.municipio_sede ?? 'Não informada'} - ${perfil.uf_sede ?? 'UF não informada'}
**Proximidade com o edital:** ${proximidade}

---

## SUA ANÁLISE

Avalie a compatibilidade entre o edital e o perfil da empresa considerando TODOS os critérios abaixo:

1. **Alinhamento de objeto:** O que é licitado corresponde ao que a empresa oferece? É o core business ou apenas tangencial?
2. **Capacidade técnica:** A empresa tem condições de atender os requisitos implícitos do edital?
3. **Abrangência geográfica:** A UF do edital é de interesse da empresa? A empresa opera nessa região?
4. **Compatibilidade de valor:** O valor está dentro da faixa aceitável? Valores muito abaixo do mínimo podem não compensar; acima do máximo podem indicar falta de capacidade.
5. **Competitividade:** É um mercado em que a empresa tem chance real de ganhar?
6. **Proximidade geográfica:** Mesma cidade → grande vantagem (conhecimento local, logística, relacionamento). Mesmo estado → vantagem moderada. Estado diferente → desvantagem que aumenta custos e complexidade operacional.
7. **Porte vs modalidade/valor:** Dispensa de até R$80k (obras) ou R$57k (serviços) são mais acessíveis para ME/EPP. Concorrências e pregões de alto valor exigem capacidade financeira e técnica maior. Avalie se o porte da empresa é compatível com a complexidade do edital.
8. **Urgência:** Editais com menos de 3 dias representam risco operacional — tempo insuficiente para preparar documentação, visita técnica e proposta competitiva. Penalize o score se o prazo for muito curto.

## FORMATO DE RESPOSTA

Responda APENAS com JSON válido, sem texto antes ou depois:

{
  "score": <número de 0 a 100 representando o percentual de compatibilidade>,
  "justificativa": "<2 a 3 frases explicando o score de forma objetiva, mencionando os fatores mais relevantes>",
  "pontos_fortes": ["<ponto forte 1>", "<ponto forte 2>", "<ponto forte 3>"],
  "riscos": ["<risco ou ponto de atenção 1>", "<risco 2>"],
  "recomendacao": "<PARTICIPAR se score >= 80, AVALIAR se 50-79, IGNORAR se < 50>"
}

Seja criterioso e realista. Um score alto (>80) significa que a empresa tem alta probabilidade de conseguir o contrato se apresentar uma boa proposta. Não infle scores — um score honesto é mais útil que um otimista.`
}

export async function analisarCompatibilidade(
  edital: EditalDB,
  perfil: PerfilEmpresa
): Promise<ResultadoMatch> {
  const prompt = construirPrompt(edital, perfil)

  const response = await client.chat.completions.create({
    model: CEREBRAS_MODEL,
    max_tokens: 1024,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  })

  const textoResposta = response.choices[0]?.message?.content ?? ''

  // Parse e validação com Zod — extrai JSON mesmo com texto antes/depois
  let dadosBrutos: unknown
  try {
    const match = textoResposta.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Sem JSON na resposta')
    dadosBrutos = JSON.parse(match[0])
  } catch {
    throw new Error(`IA retornou JSON inválido: ${textoResposta.substring(0, 200)}`)
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
