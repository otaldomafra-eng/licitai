import type { EditalPNCP, RespostaPNCP } from '@/types'

const PNCP_BASE_URL = 'https://pncp.gov.br/api/pncp/v1'

// Modalidades PNCP:
// 1=Leilão Eletrônico, 2=Diálogo Competitivo, 3=Concurso,
// 4=Concorrência, 5=Concorrência Eletrônica, 6=Pregão Eletrônico,
// 7=Dispensa Eletrônica, 8=Credenciamento, 9=Pré-qualificação
export const MODALIDADES = {
  PREGAO_ELETRONICO: '6',
  DISPENSA_ELETRONICA: '7',
  CONCORRENCIA: '4',
  CONCORRENCIA_ELETRONICA: '5',
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
    situacao: '1', // 1 = Recebendo Proposta
    pagina: String(pagina),
    tamanhoPagina: String(tamanhoPagina),
  })

  if (uf) params.set('uf', uf)

  const url = `${PNCP_BASE_URL}/consultas/editais?${params}`

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    // Cache de 1 hora no Next.js para não sobrecarregar a API
    next: { revalidate: 3600 },
  })

  if (response.status === 404) {
    // PNCP retorna 404 quando não há resultados — tratamos como lista vazia
    return { data: [], totalRegistros: 0, totalPaginas: 0, numeroPagina: pagina, tamanhoPagina }
  }

  if (!response.ok) {
    throw new Error(`PNCP API erro ${response.status}: ${response.statusText}`)
  }

  return response.json() as Promise<RespostaPNCP>
}

// Busca todas as páginas disponíveis
export async function buscarTodosEditais(
  opcoes: Omit<OpcoesConsulta, 'pagina'> = {}
): Promise<EditalPNCP[]> {
  const todosEditais: EditalPNCP[] = []
  let pagina = 1

  while (true) {
    const dados = await buscarEditaisAtivos({ ...opcoes, pagina })

    if (!dados.data?.length) break

    todosEditais.push(...dados.data)

    if (pagina >= dados.totalPaginas) break
    pagina++

    // Rate limiting: aguarda 300ms entre páginas para não sobrecarregar PNCP
    await new Promise((r) => setTimeout(r, 300))
  }

  return todosEditais
}
