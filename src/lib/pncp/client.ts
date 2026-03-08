import type { EditalPNCP, RespostaPNCP } from '@/types'

// Nova API PNCP (migraÃ§Ã£o de /api/pncp/v1 â†’ /api/consulta)
const PNCP_BASE_URL = 'https://pncp.gov.br/api/consulta'

// Modalidades PNCP (atualizado em 2026):
// 1=LeilÃ£o EletrÃ´nico, 2=DiÃ¡logo Competitivo, 3=Concurso,
// 4=ConcorrÃªncia EletrÃ´nica, 5=ConcorrÃªncia Presencial,
// 6=PregÃ£o EletrÃ´nico, 7=PregÃ£o Presencial,
// 8=Dispensa de LicitaÃ§Ã£o, 9=Inexigibilidade, 12=Credenciamento
export const MODALIDADES = {
  LEILAO_ELETRONICO:       '1',
  DIALOGO_COMPETITIVO:     '2',
  CONCURSO:                '3',
  CONCORRENCIA_ELETRONICA: '4',
  CONCORRENCIA_PRESENCIAL: '5',
  PREGAO_ELETRONICO:       '6',
  PREGAO_PRESENCIAL:       '7',
  DISPENSA_LICITACAO:      '8',
  INEXIGIBILIDADE:         '9',
  CREDENCIAMENTO:          '12',
} as const

function formatarData(date: Date): string {
  return date.toISOString().split('T')[0].replace(/-/g, '')
}

function getDataInicial(diasAtras = 30): string {
  const d = new Date()
  d.setDate(d.getDate() - diasAtras)
  return formatarData(d)
}

function getDataAtual(): string {
  return formatarData(new Date())
}

interface OpcoesConsulta {
  pagina?: number
  tamanhoPagina?: number
  uf?: string
  modalidade?: string
  diasAtras?: number
  maxPaginas?: number  // limite de pÃ¡ginas por chamada (para respeitar timeout do Vercel)
}

export async function buscarEditaisAtivos(
  opcoes: OpcoesConsulta = {}
): Promise<RespostaPNCP> {
  const {
    pagina = 1,
    tamanhoPagina = 50,
    uf,
    modalidade = MODALIDADES.PREGAO_ELETRONICO,
    diasAtras = 30,
  } = opcoes

  const params = new URLSearchParams({
    dataInicial: getDataInicial(diasAtras),
    dataFinal: getDataAtual(),
    codigoModalidadeContratacao: modalidade,
    pagina: String(pagina),
    tamanhoPagina: String(Math.max(tamanhoPagina, 10)), // mÃ­nimo 10
  })

  if (uf) params.set('uf', uf)

  // /proposta retorna apenas editais com prazo de proposta em aberto
  const url = `${PNCP_BASE_URL}/v1/contratacoes/proposta?${params}`

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 3600 },
  })

  if (response.status === 404) {
    return { data: [], totalRegistros: 0, totalPaginas: 0, numeroPagina: pagina, tamanhoPagina }
  }

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`PNCP API erro ${response.status}: ${body.substring(0, 200)}`)
  }

  return response.json() as Promise<RespostaPNCP>
}

// Busca todas as pÃ¡ginas disponÃ­veis (com limite para respeitar timeout do Vercel)
export async function buscarTodosEditais(
  opcoes: Omit<OpcoesConsulta, 'pagina'> = {}
): Promise<EditalPNCP[]> {
  const { maxPaginas = 50, ...resto } = opcoes
  const todosEditais: EditalPNCP[] = []
  let pagina = 1

  while (true) {
    const dados = await buscarEditaisAtivos({ ...resto, pagina })

    if (!dados.data?.length) break

    todosEditais.push(...dados.data)

    if (pagina >= dados.totalPaginas) break
    if (pagina >= maxPaginas) {
      console.log(`[PNCP] Limite de ${maxPaginas} pÃ¡ginas atingido (${dados.totalPaginas} total disponÃ­veis)`)
      break
    }
    pagina++

    // Rate limiting: aguarda 150ms entre pÃ¡ginas
    await new Promise((r) => setTimeout(r, 150))
  }

  return todosEditais
}

