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
  score: number           // 0 a 100
  justificativa: string   // Texto explicando o match
  pontos_fortes: string[] // Por que é uma boa oportunidade
  riscos: string[]        // Pontos de atenção
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
  // join com editais_pncp
  editais_pncp?: EditalDB
}

// ============================================
// TIPOS: WHATSAPP / CONVERSA
// ============================================

export type EtapaOnboarding =
  | 'inicio'
  | 'descricao_empresa'
  | 'estados'
  | 'faixa_valor'
  | 'concluido'

export interface ContextoConversa {
  descricao?: string
  uf_interesse?: string[]
  valor_min?: number | null
  valor_max?: number | null
  razao_social?: string | null
}

export interface ConversaDB {
  id: string
  numero_whatsapp: string
  etapa: EtapaOnboarding
  contexto_json: ContextoConversa
  updated_at: string
}

// Payload normalizado após parsing do webhook Evolution API
export interface MensagemWhatsApp {
  numero: string       // ex: '5511999999999'
  texto: string        // conteúdo da mensagem
  messageId: string    // ID original da mensagem
  fromMe: boolean      // true se enviado pelo próprio bot
  isGroup: boolean     // true se mensagem de grupo
  timestamp: number
}

// Intenção identificada pela IA
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
