// ============================================
// TIPOS: API PNCP
// ============================================
export interface EditalPNCP {
  numeroControlePNCP: string
  anoCompra: number
  sequencialCompra: number
  orgaoEntidade: {
    cnpj: string
    razaoSocial: string
  }
  unidadeOrgao: {
    ufNome: string
    ufSigla: string
    municipioNome: string
    nomeUnidade: string
    codigoUnidade: string
  }
  objetoCompra: string
  modalidadeNome: string
  modoDisputaNome: string
  valorTotalEstimado: number | null
  situacaoCompraNome: string
  dataPublicacaoPncp: string
  dataAberturaProposta: string
  dataEncerramentoProposta: string
  linkSistemaOrigem: string
}

export interface RespostaPNCP {
  data: EditalPNCP[]
  totalRegistros: number
  totalPaginas: number
  numeroPagina: number
  tamanhoPagina: number
}

// ============================================
// TIPOS: BANCO DE DADOS (Supabase)
// ============================================
export interface PerfilEmpresa {
  id: string
  usuario_id: string
  razao_social: string | null
  cnpj: string | null
  descricao: string
  palavras_chave: string[]
  segmentos: string[]
  uf_interesse: string[]
  valor_min: number | null
  valor_max: number | null
  municipio_sede?: string | null
  uf_sede?: string | null
  porte_empresa?: string | null
}

export interface EditalDB {
  id: string
  pncp_id: string
  numero_controle_pncp: string
  ano_compra: number
  sequencial_compra: number
  cnpj_orgao: string
  nome_orgao: string
  uf_orgao: string
  municipio_orgao: string
  objeto: string
  modalidade: string
  modo_disputa: string
  valor_estimado: number | null
  status: string
  data_publicacao: string
  data_abertura_proposta: string
  data_encerramento: string
  link_sistema_origem: string
  processado_ia: boolean
  created_at: string
}

// ============================================
// TIPOS: RESULTADO DA IA
// ============================================
export interface ResultadoMatch {
  score: number
  justificativa: string
  pontos_fortes: string[]
  riscos: string[]
  recomendacao: 'PARTICIPAR' | 'AVALIAR' | 'IGNORAR'
}

export interface MatchEdital {
  id: string
  usuario_id: string
  edital_id: string
  score: number
  justificativa: string
  pontos_fortes: string[]
  riscos: string[]
  status: 'novo' | 'visualizado' | 'proposta_gerada' | 'descartado'
  proposta_rascunho: string | null
  notificado: boolean
  created_at: string
  editais_pncp?: EditalDB
}

// ============================================
// TIPOS: WHATSAPP / CONVERSA
// ============================================

export type EtapaOnboarding =
  | 'inicio'
  | 'nome'
  | 'descricao_empresa'
  | 'estados'
  | 'faixa_valor'
  | 'concluido'

export interface FiltrosConsulta {
  termos: string[]
  ufs: string[]
  prazo_min_dias: number | null
  prazo_max_dias: number | null
  valor_min: number | null
  valor_max: number | null
  modalidade: string | null
  tipo_orgao: string | null
  excluir: string[]
}

export interface MemoriaUsuarioConversa {
  ufs_preferidas?: string[]
  segmentos_preferidos?: string[]
  valor_min_preferido?: number | null
  valor_max_preferido?: number | null
  estilo_resposta?: 'direto' | 'detalhado'
  ultima_intencao?: 'onboarding' | 'consulta' | 'comando' | 'duvida'
  topicos_recentes?: string[]
  atualizado_em?: string
}

export interface ContextoConversa {
  nome?: string
  descricao?: string
  uf_interesse?: string[]
  valor_min?: number | null
  valor_max?: number | null
  razao_social?: string | null
  ultima_busca?: Array<{
    id: string
    indice: number
    nome_orgao: string
    objeto: string
    link: string
    valor_estimado?: number | null
    data_encerramento?: string | null
    modalidade?: string | null
    uf_orgao?: string | null
  }>
  aguardando_acao_edital_id?: string
  ultimos_filtros?: FiltrosConsulta
  ultimo_offset_busca?: number
  historico_mensagens?: Array<{
    role: 'user' | 'assistant'
    texto: string
    at: string
  }>
  objetivo_atual?: 'consulta' | 'duvida' | 'comando'
  perfil_comunicacao?: 'direto' | 'consultivo'
  aguardando_clarificacao?: {
    ativa: boolean
    tipo: 'consulta' | 'duvida'
    pergunta: string
    base_usuario: string
    criado_em: string
    tentativas?: number
  } | null
  memoria_usuario?: MemoriaUsuarioConversa
}

export interface ConversaDB {
  id: string
  numero_whatsapp: string
  etapa: EtapaOnboarding
  contexto_json: ContextoConversa
  updated_at: string
}

export interface MensagemWhatsApp {
  numero: string
  texto: string
  messageId: string
  fromMe: boolean
  isGroup: boolean
  timestamp: number
}

export type IntencaoMensagem = 'onboarding' | 'consulta' | 'comando' | 'duvida'

// ============================================
// TIPOS: EVOLUTION API WEBHOOK
// ============================================

export interface EvolutionMessageKey {
  remoteJid: string
  fromMe: boolean
  id: string
  participant?: string
}

export interface EvolutionMessageContent {
  conversation?: string
  extendedTextMessage?: { text: string }
  imageMessage?: { caption?: string }
  audioMessage?: object
  documentMessage?: object
}

export interface EvolutionMessageData {
  key: EvolutionMessageKey
  message?: EvolutionMessageContent
  messageTimestamp: number
  pushName?: string
}

export interface PayloadWebhookEvolution {
  event: string
  instance: string
  data: EvolutionMessageData
}
