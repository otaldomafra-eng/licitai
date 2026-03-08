import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

const cerebras = new OpenAI({
  apiKey: process.env.CEREBRAS_API_KEY,
  baseURL: 'https://api.cerebras.ai/v1',
})

export async function POST(req: Request) {
  // Autentica o usuário via sessão (não é cron — é chamada do browser)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })

  const { match_id } = await req.json()
  if (!match_id) return NextResponse.json({ erro: 'match_id obrigatório' }, { status: 400 })

  const admin = createAdminClient()

  // Busca o match com dados do edital e perfil
  const { data: match, error: errMatch } = await admin
    .from('matches_editais')
    .select(`
      *,
      editais_pncp ( objeto, nome_orgao, uf_orgao, modalidade, valor_estimado, data_encerramento ),
      perfil_empresa: usuario_id ( descricao, razao_social, segmentos )
    `)
    .eq('id', match_id)
    .eq('usuario_id', user.id)
    .single()

  if (errMatch || !match) {
    return NextResponse.json({ erro: 'Match não encontrado' }, { status: 404 })
  }

  if (match.score < 80) {
    return NextResponse.json({ erro: 'Score insuficiente para gerar proposta' }, { status: 403 })
  }

  const edital = match.editais_pncp as Record<string, unknown>
  const perfil = match.perfil_empresa as Record<string, unknown>

  const prompt = `Você é um especialista em licitações públicas brasileiras.

Gere um esboço estruturado de proposta comercial para a seguinte licitação:

## EDITAL
Órgão: ${edital.nome_orgao}
UF: ${edital.uf_orgao}
Objeto: ${edital.objeto}
Modalidade: ${edital.modalidade}
Valor estimado: ${edital.valor_estimado ? `R$ ${Number(edital.valor_estimado).toLocaleString('pt-BR')}` : 'Não informado'}

## EMPRESA PROPONENTE
${perfil.razao_social ?? 'Empresa Proponente'}
Descrição: ${perfil.descricao}

## ANÁLISE DA IA
Score de compatibilidade: ${match.score}%
Justificativa: ${match.justificativa}
Pontos fortes: ${match.pontos_fortes?.join(', ')}

---

Gere o esboço com as seguintes seções:

1. **Apresentação da Empresa** (2 parágrafos destacando experiência relevante)
2. **Compreensão do Objeto** (como a empresa entende o que está sendo licitado)
3. **Solução Proposta** (abordagem técnica resumida)
4. **Diferenciais Competitivos** (3 a 5 pontos que destacam a empresa)
5. **Próximos Passos** (o que o gestor deve fazer antes de submeter a proposta)

Use linguagem formal e profissional. Inclua alertas sobre campos que o usuário precisará personalizar com dados reais da empresa.`

  const response = await cerebras.chat.completions.create({
    model: 'llama3.1-70b',
    max_tokens: 2048,
    temperature: 0.7,
    messages: [{ role: 'user', content: prompt }],
  })

  const rascunho = response.choices[0]?.message?.content ?? ''

  // Salva o rascunho e atualiza o status
  await admin
    .from('matches_editais')
    .update({ proposta_rascunho: rascunho, status: 'proposta_gerada' })
    .eq('id', match_id)

  return NextResponse.json({ sucesso: true, rascunho })
}
