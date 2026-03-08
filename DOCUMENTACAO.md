# LicitaIA — Documentação Técnica Completa

> Plataforma de monitoramento inteligente de licitações públicas via WhatsApp, com IA para matching automático de editais do PNCP.

---

## Sumário

1. [Visão Geral](#visão-geral)
2. [Stack Tecnológica](#stack-tecnológica)
3. [Arquitetura do Sistema](#arquitetura-do-sistema)
4. [Banco de Dados (Supabase)](#banco-de-dados)
5. [API Routes](#api-routes)
6. [Bot WhatsApp](#bot-whatsapp)
7. [Engine de IA](#engine-de-ia)
8. [Cron Jobs](#cron-jobs)
9. [Variáveis de Ambiente](#variáveis-de-ambiente)
10. [Setup Local](#setup-local)
11. [Deploy (Vercel)](#deploy-vercel)
12. [Próximos Passos](#próximos-passos)

---

## Visão Geral

O **LicitaIA** é um SaaS B2B que monitora o Portal Nacional de Contratações Públicas (PNCP) e notifica empresas via WhatsApp sobre editais compatíveis com seu perfil, usando inteligência artificial para calcular o score de compatibilidade.

### Fluxo principal

```
PNCP (editais) → Sync diário → Supabase → IA analisa matches → WhatsApp notifica empresa
                                               ↑
                                    Perfil da empresa (cadastrado via bot)
```

### Modelo de negócio

- Usuário cadastra empresa via WhatsApp (onboarding conversacional)
- Bot envia alertas automáticos de editais compatíveis (score ≥ 80)
- Planos: Básico (alertas) / Pro (gerador de proposta) — monetização via AbacatePay

---

## Stack Tecnológica

| Camada | Tecnologia | Observação |
|--------|-----------|------------|
| Framework | Next.js 15 (App Router) | TypeScript, Tailwind CSS |
| Banco de dados | Supabase (PostgreSQL) | Auth + DB + RLS |
| IA — Assistente | Cerebras `llama3.1-8b` | Gratuito, NLP e classificação |
| IA — Matcher | Cerebras `llama3.1-70b` | Gratuito, scoring de editais |
| WhatsApp | Meta WhatsApp Cloud API | v22.0 |
| Deploy | Vercel | Hobby plan + cron jobs |
| Monetização | AbacatePay | Integração pendente |

---

## Arquitetura do Sistema

```
src/
├── app/
│   ├── api/
│   │   ├── whatsapp/
│   │   │   ├── webhook/route.ts      ← Recebe mensagens (GET verificação + POST mensagens)
│   │   │   ├── lembretes/route.ts    ← Cron: envia lembretes de prazo (diário 9h UTC)
│   │   │   └── relatorio/route.ts   ← Cron: relatório semanal (segunda 8h UTC)
│   │   ├── pncp/
│   │   │   └── sync/route.ts         ← Cron: sincroniza editais do PNCP (diário 6h UTC)
│   │   ├── ai/
│   │   │   ├── process/route.ts      ← Cron: processa matches IA (diário 7h UTC)
│   │   │   └── proposta/route.ts     ← Gera rascunho de proposta técnica
│   │   ├── abacatepay/
│   │   │   └── webhook/route.ts      ← Recebe eventos de pagamento
│   │   └── auth/
│   │       └── callback/route.ts     ← OAuth Supabase
│   └── (pages)
│
├── lib/
│   ├── ai/
│   │   ├── assistant.ts              ← NLP: intenção, filtros, diálogo (Cerebras 8b)
│   │   └── matcher.ts                ← Score de compatibilidade edital × empresa (Cerebras 70b)
│   ├── pncp/
│   │   └── client.ts                 ← Cliente API PNCP (busca + paginação)
│   ├── supabase/
│   │   ├── server.ts                 ← Clientes: createClient (RLS) + createAdminClient (service_role)
│   │   └── client.ts                 ← Cliente browser
│   └── whatsapp/
│       ├── client.ts                 ← Meta Cloud API: enviarMensagem, marcarComoLido, enviarAlerta
│       └── handlers/
│           ├── onboarding.ts         ← Fluxo de cadastro em etapas
│           ├── consulta.ts           ← Busca manual de editais + detalhes + ações
│           ├── favoritos.ts          ← Seguir edital + listar + lembretes de prazo
│           ├── alerta.ts             ← Envio de alertas proativos de matches
│           └── ajuda.ts              ← Planos, pausar/ativar alertas, suporte
│
└── types/
    └── index.ts                      ← Todos os tipos TypeScript do projeto
```

---

## Banco de Dados

### Tabelas

#### `usuarios`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | Identificador |
| `whatsapp` | TEXT UNIQUE | Número no formato `5511999999999` |
| `nome` | TEXT | Nome do usuário |
| `email` | TEXT | Email (opcional) |
| `alertas_pausados` | BOOLEAN | Se true, não recebe notificações |
| `created_at` | TIMESTAMPTZ | Data de criação |

#### `perfil_empresa`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | Identificador |
| `usuario_id` | UUID FK | Referência a `usuarios` |
| `razao_social` | TEXT | Razão social |
| `cnpj` | TEXT | CNPJ |
| `descricao` | TEXT | Descrição do negócio (usada pela IA) |
| `palavras_chave` | TEXT[] | Tags de interesse |
| `segmentos` | TEXT[] | Segmentos de atuação |
| `uf_interesse` | TEXT[] | UFs monitoradas (ex: `['SP', 'MG']`) |
| `valor_min` | NUMERIC | Valor mínimo de interesse |
| `valor_max` | NUMERIC | Valor máximo de interesse |
| `municipio_sede` | TEXT | Cidade sede (melhora score geográfico) |
| `uf_sede` | VARCHAR(2) | UF sede (melhora score geográfico) |
| `porte_empresa` | TEXT | MEI \| ME \| EPP \| Médio \| Grande |

#### `editais_pncp`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | Identificador interno |
| `pncp_id` | TEXT UNIQUE | ID no PNCP |
| `numero_controle_pncp` | TEXT | Número de controle |
| `nome_orgao` | TEXT | Nome do órgão licitante |
| `uf_orgao` | VARCHAR(2) | UF do órgão |
| `municipio_orgao` | TEXT | Município do órgão |
| `objeto` | TEXT | Descrição do objeto licitado |
| `modalidade` | TEXT | Pregão, Dispensa, Concorrência etc. |
| `valor_estimado` | NUMERIC | Valor estimado da contratação |
| `data_encerramento` | TIMESTAMPTZ | Prazo final das propostas |
| `processado_ia` | BOOLEAN | Se já foi analisado pela IA |

#### `matches_editais`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | Identificador |
| `usuario_id` | UUID FK | Usuário |
| `edital_id` | UUID FK | Edital |
| `score` | INTEGER | Compatibilidade 0–100 |
| `justificativa` | TEXT | Explicação da IA |
| `pontos_fortes` | TEXT[] | Vantagens do edital |
| `riscos` | TEXT[] | Pontos de atenção |
| `recomendacao` | TEXT | PARTICIPAR \| AVALIAR \| IGNORAR |
| `status` | TEXT | novo \| visualizado \| proposta_gerada \| descartado |
| `notificado` | BOOLEAN | Se já foi notificado por WhatsApp |

#### `editais_seguidos`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | Identificador |
| `usuario_id` | UUID FK | Usuário que segue |
| `edital_id` | UUID FK | Edital seguido |
| `lembrete_72h_enviado` | BOOLEAN | Lembrete de 72h já enviado |
| `lembrete_24h_enviado` | BOOLEAN | Lembrete de 24h já enviado |

#### `conversas`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | Identificador |
| `numero_whatsapp` | TEXT | Número do usuário |
| `etapa` | TEXT | Etapa atual do onboarding |
| `contexto_json` | JSONB | Estado da conversa (ver abaixo) |

#### `assinaturas`
Gerencia planos dos usuários (integração futura AbacatePay).

---

### Contexto da Conversa (JSONB)

```typescript
interface ContextoConversa {
  nome?: string                    // Nome coletado no onboarding
  descricao?: string               // Descrição da empresa
  uf_interesse?: string[]          // UFs de interesse
  valor_min?: number | null        // Faixa de valor mínima
  valor_max?: number | null        // Faixa de valor máxima
  ultima_busca?: Array<{           // Última lista de editais enviada
    id: string
    indice: number
    nome_orgao: string
    objeto: string
    link: string
  }>
  aguardando_acao_edital_id?: string  // Aguardando escolha do menu (1/2/3/4)
  ultimos_filtros?: FiltrosConsulta   // Filtros da última busca (para refinamentos)
}
```

---

## API Routes

### `POST /api/whatsapp/webhook`
Recebe mensagens da Meta WhatsApp Cloud API. Roteia para o handler correto conforme a intenção.

**Proteção:** nenhuma (Meta valida via assinatura de webhook)

### `GET /api/whatsapp/webhook`
Verificação do webhook Meta. Valida `hub.verify_token` contra `WHATSAPP_VERIFY_TOKEN`.

### `POST /api/pncp/sync`
Sincroniza editais do PNCP para o banco Supabase.

**Proteção:** header `Authorization: Bearer {CRON_SECRET}`

**Comportamento:**
- Busca editais dos últimos 30 dias
- Modalidades: Pregão Eletrônico, Dispensa, Concorrência
- Paginação automática até esgotar resultados
- Upsert por `pncp_id` (evita duplicatas)

### `POST /api/ai/process`
Processa matches IA para todos os perfis com editais não processados.

**Proteção:** header `Authorization: Bearer {CRON_SECRET}`

**Comportamento:**
- Para cada perfil ativo, analisa editais com `processado_ia = false`
- Score ≥ 80 → envia alerta via WhatsApp
- Salva resultado em `matches_editais`

### `POST /api/whatsapp/lembretes`
Envia lembretes de prazo para editais seguidos.

**Proteção:** header `Authorization: Bearer {CRON_SECRET}`

**Comportamento:**
- Verifica editais com prazo em 72h ± 12h → envia lembrete 72h
- Verifica editais com prazo em 24h ± 12h → envia lembrete 24h
- Flags `lembrete_72h_enviado` e `lembrete_24h_enviado` evitam reenvio

### `POST /api/whatsapp/relatorio`
Envia relatório semanal de oportunidades.

**Proteção:** header `Authorization: Bearer {CRON_SECRET}`

**Comportamento:**
- Busca matches com score ≥ 65 dos últimos 7 dias por usuário
- Envia digest formatado via WhatsApp
- Rate limit: 500ms entre envios

---

## Bot WhatsApp

### Onboarding (etapas)

```
[Nova mensagem] → inicio → nome → descricao_empresa → estados → faixa_valor → concluido
```

| Etapa | Dado coletado | Exemplo de resposta aceita |
|-------|--------------|---------------------------|
| `inicio` | Boas-vindas | Qualquer mensagem |
| `nome` | Nome do responsável | "João Silva" |
| `descricao_empresa` | Descrição livre | "Empresa de TI especializada em..." |
| `estados` | UFs de interesse | "SP, RJ, MG" / "São Paulo e Minas" |
| `faixa_valor` | Faixa de valores | "100k a 500k" / "acima de 50 mil" |

### Comandos disponíveis

| Comando | Ação |
|---------|------|
| `menu` / `ajuda` / `help` | Exibe menu de ajuda |
| `suporte` | Informações de contato |
| `mudar perfil` / `alterar perfil` | Reinicia o onboarding |
| `pausar` / `parar alertas` | Para envio de alertas automáticos |
| `ativar` / `retomar alertas` | Reativa alertas automáticos |
| `planos` / `assinar` / `meu plano` | Exibe planos e assinatura atual |
| `meus editais` / `favoritos` | Lista editais que está seguindo |

### Busca de editais (linguagem natural)

O usuário pode buscar editais livremente. Exemplos:

```
"editais de TI em São Paulo"
"licitações de obra acima de 200 mil em MG"
"pregões de consultoria com prazo até 7 dias"
"exclua pavimentação"
```

**Filtros extraídos automaticamente pela IA:**
- `termos[]` — palavras-chave do objeto
- `ufs[]` — estados filtrados
- `prazo_min_dias` / `prazo_max_dias` — urgência
- `valor_min` / `valor_max` — faixa de valor
- `modalidade` — tipo de licitação
- `excluir[]` — termos a excluir do objeto

### Refinamento contextual

Após uma busca, o usuário pode refinar sem repetir tudo:

```
"e em SP?"          → adiciona SP aos filtros anteriores
"só acima de 100k"  → atualiza valor_min
"exclua reforma"    → adiciona à lista de exclusão
```

### Menu pós-detalhe de edital

Quando o usuário pede detalhes de um edital (`"edital 3"`, `"item 2"`, `"3"`), o bot exibe:

```
1️⃣ Ver compatibilidade com minha empresa
2️⃣ Ver editais similares
3️⃣ Voltar à lista anterior
4️⃣ Seguir este edital (receber lembrete de prazo)
```

---

## Engine de IA

### Assistente (`assistant.ts`) — Cerebras `llama3.1-8b`

Responsável por:

1. **`identificarIntencao(texto, etapa)`** → `'onboarding' | 'consulta' | 'comando' | 'duvida'`
2. **`extrairFiltrosConsulta(texto)`** → `FiltrosConsulta` (com Zod validation)
3. **`extrairFiltrosRefinamento(texto, filtrosAnteriores)`** → merge inteligente de filtros
4. **`respostaDuvida(texto)`** → resposta rica sobre licitações, PNCP, LicitaIA
5. **`respostaMenu()`** → menu formatado de comandos

### Matcher (`matcher.ts`) — Cerebras `llama3.1-70b`

Responsável por:

1. **`analisarCompatibilidade(edital, perfil)`** → `ResultadoMatch` com score 0–100

**Critérios de scoring:**
- Alinhamento do objeto com a descrição da empresa
- Compatibilidade geográfica (mesma UF/cidade = bônus)
- Faixa de valor vs capacidade inferida
- Modalidade vs experiência
- Prazo de proposta (urgência)
- Requisitos de habilitação vs porte da empresa
- Palavras-chave de exclusão

---

## Cron Jobs

| Horário (UTC) | Rota | Função |
|--------------|------|--------|
| 6h diário | `/api/pncp/sync` | Busca novos editais no PNCP |
| 7h diário | `/api/ai/process` | Gera matches IA por perfil |
| 9h diário | `/api/whatsapp/lembretes` | Avisos de prazo 72h/24h |
| 8h segunda | `/api/whatsapp/relatorio` | Digest semanal de oportunidades |

> Configurado em `vercel.json`. Todos os crons são protegidos por `CRON_SECRET`.

---

## Variáveis de Ambiente

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # Usado no createAdminClient (bypass RLS)

# Cerebras (IA — gratuito)
CEREBRAS_API_KEY=                # https://cloud.cerebras.ai

# Meta WhatsApp Cloud API
WHATSAPP_PHONE_NUMBER_ID=        # ID do número de telefone no Meta
WHATSAPP_BUSINESS_ACCOUNT_ID=    # ID da conta WhatsApp Business
WHATSAPP_ACCESS_TOKEN=           # Token de acesso (permanente via System User)
WHATSAPP_VERIFY_TOKEN=           # Token de verificação do webhook (string livre)

# Segurança
CRON_SECRET=                     # Protege as rotas de cron (Bearer token)

# AbacatePay (monetização — pendente)
ABACATEPAY_API_KEY=
ABACATEPAY_WEBHOOK_SECRET=

# App
NEXT_PUBLIC_APP_URL=             # URL base da aplicação
```

> Gerar `CRON_SECRET`: `openssl rand -base64 32`

---

## Setup Local

```bash
# 1. Clonar e instalar dependências
cd "C:/CLAUDE/IA LICITACOES/app"
npm install

# 2. Copiar variáveis de ambiente
cp .env.example .env.local
# Preencher os valores em .env.local

# 3. Rodar em desenvolvimento
npm run dev

# 4. Verificar tipos TypeScript
npx tsc --noEmit
```

### SQL inicial (Supabase)

Execute no SQL Editor do Supabase Dashboard:

```sql
-- Tabela de editais seguidos (favoritos + lembretes)
CREATE TABLE IF NOT EXISTS editais_seguidos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  edital_id UUID REFERENCES editais_pncp(id) ON DELETE CASCADE,
  lembrete_72h_enviado BOOLEAN DEFAULT FALSE,
  lembrete_24h_enviado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(usuario_id, edital_id)
);

ALTER TABLE editais_seguidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuários veem seus favoritos" ON editais_seguidos
  FOR ALL USING (auth.uid() = usuario_id);

-- Colunas de scoring geográfico no perfil
ALTER TABLE perfil_empresa ADD COLUMN IF NOT EXISTS municipio_sede TEXT;
ALTER TABLE perfil_empresa ADD COLUMN IF NOT EXISTS uf_sede VARCHAR(2);
ALTER TABLE perfil_empresa ADD COLUMN IF NOT EXISTS porte_empresa TEXT;
```

---

## Deploy (Vercel)

```bash
# Login (necessário uma vez)
npx vercel login

# Adicionar variáveis de ambiente
npx vercel env add WHATSAPP_PHONE_NUMBER_ID production
npx vercel env add WHATSAPP_ACCESS_TOKEN production
npx vercel env add WHATSAPP_VERIFY_TOKEN production
npx vercel env add CEREBRAS_API_KEY production
npx vercel env add CRON_SECRET production
# (repetir para todas as variáveis)

# Deploy em produção
npx vercel --prod
```

**URL de produção:** `https://licitai-gamma.vercel.app`

### Configurar webhook Meta (após deploy)

1. Meta for Developers → seu app → WhatsApp → Configuração
2. URL de callback: `https://licitai-gamma.vercel.app/api/whatsapp/webhook`
3. Token de verificação: valor de `WHATSAPP_VERIFY_TOKEN`
4. Assinar campo: `messages`

> **Token permanente:** Para produção, criar System User no Meta Business Manager e gerar token com permissão `whatsapp_business_messaging`. O token temporário expira em ~24h.

---

## Próximos Passos

### Prioritários
- [ ] **Número WhatsApp produção** — Registrar chip brasileiro no Meta (token permanente)
- [ ] **Token permanente Meta** — Meta Business Manager → System Users → gerar token
- [ ] **Dashboard UI** — Listar matches com score, detalhes, ações

### Funcionalidades planejadas
- [ ] **AbacatePay** — Integração de monetização (planos Básico/Pro)
- [ ] **Gerador de Proposta** — IA gera rascunho de proposta técnica com base no edital
- [ ] **Histórico de participações** — Usuário registra se participou e o resultado
- [ ] **Análise de mercado** — Relatório de concorrência por segmento/UF

### Melhorias técnicas
- [ ] **RLS completo** — Revisar políticas para todas as tabelas
- [ ] **Rate limiting** — Proteger webhook contra spam
- [ ] **Testes automatizados** — Cobertura dos handlers críticos
- [ ] **Métricas** — Tracking de uso, conversões, churn

---

## Observações técnicas importantes

### Número brasileiro no Meta Cloud API
A Meta envia o `from` de números brasileiros no formato antigo de 8 dígitos (ex: `556392021086`), mas exige o formato de 9 dígitos no envio (ex: `5563992021086`). O `normalizarNumero()` em `client.ts` faz essa conversão automaticamente.

### Cerebras como alternativa gratuita ao OpenAI
O projeto usa o SDK oficial da OpenAI com `baseURL` apontando para `https://api.cerebras.ai/v1`. Isso permite trocar de provedor apenas alterando a `baseURL` e a `apiKey`.

### Supabase Admin Client
O `createAdminClient()` usa a `SUPABASE_SERVICE_ROLE_KEY` e ignora RLS. Usado exclusivamente em rotas de servidor (API routes, crons). Nunca expor no cliente browser.

### Crons no Vercel Hobby Plan
O plano Hobby limita crons a **uma execução por dia**. Por isso o cron de lembretes roda diariamente às 9h UTC com janela de ±12h, em vez de rodar de hora em hora.

---

## Atualizações Recentes (06/03/2026)

### Robustez Conversacional (WhatsApp)

Foram adicionadas regras de resiliência para o estado de clarificação no bot:

- Detecção de respostas fracas (`sim`, `ok`, `isso`, mensagens muito curtas)
- Controle de tentativas em clarificação pendente (`tentativas` no `contexto_json`)
- Limpeza de clarificação quando o usuário muda para comando global (`menu`, `ajuda`, `planos`, etc.)
- Bypass por troca brusca de assunto durante clarificação
- Detecção de resposta contraditória (ex.: `acima de X e abaixo de Y`, `em SP mas não em SP`)

Arquivos principais:

- `src/lib/whatsapp/conversation-state.ts`
- `src/app/api/whatsapp/webhook/route.ts`
- `src/types/index.ts`

### Testes Conversacionais

Foi criado um pacote de testes focado em comportamento de conversa (sem depender de provedores externos):

- Unitários de regras de estado: `src/lib/whatsapp/conversation-state.spec.ts`
- Fluxos E2E multi-turn: `src/lib/whatsapp/conversation-e2e.spec.ts`
- Stress/chaos test: `src/lib/whatsapp/conversation-stress.spec.ts`

Scripts adicionados no `package.json`:

- `npm run test:conversation`
- `npm run test:conversation:e2e`
- `npm run test:conversation:stress`
- `npm run test:conversation:all`

### Relatório de Cobertura por Intenção

O stress test gera automaticamente um relatório em Markdown:

- `reports/conversation-coverage.md`

O relatório resume:

- Total de cenários
- Sucesso/falha
- Cobertura por intenção (`consulta` e `duvida`)
- Tabela de resultados por cenário
- Escopo de stress validado

---

## Atualizacoes Recentes (06/03/2026 - rodada 2)

### Robustez Conversacional adicional (WhatsApp)

Novas regras incorporadas no motor de clarificacao:

- Normalizacao com compressao de espacos para reduzir ruido de entrada.
- Expansao de comandos globais reconhecidos durante clarificacao (ex.: `meu plano`, `retomar alertas`, `favoritos`, `meus editais`).
- Deteccao de mudanca brusca de assunto para temas de sistema/produto (`deploy`, `vercel`, `gateway`, `pagamento`, `landing page`).
- Deteccao de ruido/spam textual:
  - repeticao de palavras (ex.: `ok ok ok ok`)
  - pontuacao extrema (ex.: `!!!!!!!!`)
  - caracteres repetidos (ex.: `aaaaaaa`)
- Deteccao de multiplos comandos na mesma mensagem (ex.: `menu ajuda planos`) com orientacao para envio de um comando por vez.

Arquivos atualizados:

- `src/lib/whatsapp/conversation-state.ts`
- `src/lib/whatsapp/conversation-state.runtime.js`
- `src/lib/whatsapp/conversation-state.spec.ts`
- `src/lib/whatsapp/conversation-e2e.spec.ts`
- `src/lib/whatsapp/conversation-stress.spec.ts`

### Cobertura de stress atualizada

Relatorio regenerado em:

- `reports/conversation-coverage.md`

Status atual:

- Total: 24 cenarios
- Pass: 24
- Fail: 0
- Cobertura por intencao: `consulta` (18), `duvida` (6)
- Cobertura por categoria:
  - `clarificacao-base` (8)
  - `perfil` (2)
  - `ambiguidades` (3)
  - `contradicao` (2)
  - `mudanca-assunto` (4)
  - `spam-comandos` (2)
  - `ruido` (3)

### Validacao executada

- `npm run test:conversation:all` -> OK
- `npx tsc --noEmit` -> OK
- `npm run lint` -> sem erros (apenas warnings pre-existentes)

---

## Atualizacoes Recentes (06/03/2026 - rodada 3)

### Evolucao de qualidade semantica na clarificacao

Foi adicionada uma nova camada para evitar falso "resolve" em respostas vagas:

- Deteccao de resposta vaga/generica (ex.: `tanto faz`, `qualquer edital`, `sem preferencia`, `indiferente`).
- Fluxo progressivo:
  - primeira ocorrencia -> `reprompt_keep`
  - repeticao com tentativas >= 1 -> `reprompt_clear`

Com isso, o bot exige contexto minimo antes de prosseguir, melhorando qualidade de resposta e naturalidade do dialogo.

Arquivo principal:

- `src/lib/whatsapp/conversation-state.ts`

### Testes adicionais e stress expandido

Novidades de validacao:

- `conversation-state.spec.ts`: ampliado para `26/26`
- `conversation-e2e.spec.ts`: ampliado para `5 fluxos`
- `conversation-stress.spec.ts`: ampliado para `27/27` com nova categoria `vaguidade`
- Novo teste de caos randômico: `conversation-chaos.spec.ts` com 500 mensagens sinteticas

Scripts atualizados:

- `npm run test:conversation:chaos`
- `npm run test:conversation:all` (inclui chaos)

### Cobertura atual

Relatorio regenerado:

- `reports/conversation-coverage.md`

Resumo:

- Total: 27 cenarios
- Pass: 27
- Fail: 0
- Por intencao: `consulta` (21), `duvida` (6)
- Categoria adicional: `vaguidade` (3 cenarios)

### Validacao executada

- `npm run test:conversation:all` -> OK
- `npx tsc --noEmit` -> OK
- `npm run lint` -> sem erros (warnings pre-existentes)

---

## Atualizacoes Recentes (06/03/2026 - rodada 4 / Sprint 1)

### Webhook E2E com persistencia mockada

Foi criada uma camada isolada para o fluxo de clarificacao pendente do webhook, permitindo teste ponta-a-ponta sem dependencias externas.

Arquivos:

- `src/lib/whatsapp/clarification-flow.ts` (modulo testavel)
- `src/lib/whatsapp/clarification-flow.runtime.js` (espelho runtime)
- `src/lib/whatsapp/clarification-flow.e2e.spec.ts` (E2E com mock em memoria)

Com isso, validamos comportamento de:

- `reprompt_keep` com incremento de tentativas
- `resolve` com composicao de texto e resposta final
- `bypass_clear` com limpeza de pendencia e continuidade do fluxo

### Refatoracao do webhook principal

`/api/whatsapp/webhook` agora delega a decisao de clarificacao pendente para o modulo dedicado, reduzindo acoplamento e facilitando manutencao.

Arquivo atualizado:

- `src/app/api/whatsapp/webhook/route.ts`

### Regressao automatizada (suite unica)

Scripts novos/atualizados no `package.json`:

- `npm run test:conversation:flow:e2e`
- `npm run test:conversation:all` (inclui flow:e2e)
- `npm run test:conversation:regression` (all + `tsc --noEmit`)

### CI de cobertura conversacional

Workflow adicionado:

- `.github/workflows/conversation-regression.yml`

Executa em `push`/`pull_request` (paths de WhatsApp/webhook):

- install (`npm ci`)
- regressao (`npm run test:conversation:regression`)
- lint (`npm run lint`)

### Status de validacao da rodada

- `test:conversation:regression`: OK
- `lint`: sem erros (warnings pre-existentes)

---

## Atualizacoes Recentes (06/03/2026 - rodada 5 / Sprint 1)

### E2E do fluxo pos-concluido do webhook

Foi adicionada uma segunda camada testavel para o roteamento quando a conversa ja esta em etapa `concluido`.

Novo modulo:

- `src/lib/whatsapp/concluded-flow.ts`
- `src/lib/whatsapp/concluded-flow.runtime.js`

Cenarios cobertos pelo fluxo:

- acao pos-detalhe (`1/2/3/4` quando `aguardando_acao_edital_id` existe)
- pedido de detalhe de edital por indice
- reclamacao de resultados
- paginacao (`mostrar mais`)
- refinamento contextual com `ultimos_filtros`

### Teste E2E dedicado

Novo teste:

- `src/lib/whatsapp/concluded-flow.e2e.spec.ts`

Status:

- `concluded-flow-e2e: OK (6/6)`

### Integracao no webhook

`/api/whatsapp/webhook` passou a delegar o bloco de atalhos pos-conclusao para `handleFluxoConcluido`, reduzindo complexidade do handler principal.

Arquivo atualizado:

- `src/app/api/whatsapp/webhook/route.ts`

### Scripts de regressao atualizados

`package.json` atualizado com:

- `npm run test:conversation:concluded:e2e`
- `npm run test:conversation:all` (inclui concluded:e2e)
- `npm run test:conversation:regression` (all + typecheck)

### Validacao da rodada

- `npm run test:conversation:regression` -> OK
- `npm run lint` -> sem erros (warnings legados)

---

## Atualizacoes Recentes (06/03/2026 - rodada 6 / Sprint 1)

### Extracao do nucleo de intencao e contexto

Foi criado um novo orquestrador para concentrar:

- determinacao de intencao (com regra de nao voltar para onboarding em etapa `concluido`)
- inferencia de `perfil_comunicacao`
- atualizacao de `objetivo_atual`
- disparo de clarificacao quando consulta/duvida vem ambigua

Arquivos novos:

- `src/lib/whatsapp/intent-context-flow.ts`
- `src/lib/whatsapp/intent-context-flow.runtime.js`
- `src/lib/whatsapp/intent-context-flow.e2e.spec.ts`

### Integracao no webhook

A rota principal passou a delegar tambem o bloco de intencao/contexto para o novo modulo, reduzindo ainda mais a complexidade do handler HTTP.

Arquivo atualizado:

- `src/app/api/whatsapp/webhook/route.ts`

### Regressao e scripts

`package.json` atualizado com:

- `npm run test:conversation:intent:e2e`
- `npm run test:conversation:all` (inclui intent:e2e)
- `npm run test:conversation:regression` (all + tsc)

### Validacao da rodada

- `intent-context-flow-e2e: OK (4/4)`
- `npm run test:conversation:regression` -> OK
- `npm run lint` -> sem erros (warnings legados)

---

## Atualizacoes Recentes (06/03/2026 - rodada 7 / Sprint 1)

### Webhook 100% modular no core conversacional

Foi extraido o bloco final de despacho por intencao para modulo dedicado, removendo o `switch` direto da rota.

Arquivos novos:

- `src/lib/whatsapp/dispatch-flow.ts`
- `src/lib/whatsapp/dispatch-flow.runtime.js`
- `src/lib/whatsapp/dispatch-flow.e2e.spec.ts`

### Integracao no webhook

A rota `/api/whatsapp/webhook` agora orquestra quatro modulos de fluxo:

- `handleClarificacaoPendente`
- `handleFluxoConcluido`
- `handleIntentoContexto`
- `handleDispatchPorIntencao`

Arquivo atualizado:

- `src/app/api/whatsapp/webhook/route.ts`

### Novos scripts de teste

`package.json` atualizado com:

- `npm run test:conversation:dispatch:e2e`
- `npm run test:conversation:all` (inclui dispatch:e2e)
- `npm run test:conversation:regression`

### Validacao da rodada

- `dispatch-flow-e2e: OK (4/4)`
- `npm run test:conversation:regression` -> OK
- `npm run lint` -> sem erros (warnings legados)

---

## Atualizacoes Recentes (06/03/2026 - rodada 8 / Sprint 1)

### E2E unificado de pipeline completo do webhook

Foi implementado um orquestrador unico para executar o pipeline conversacional completo em ordem, com teste ponta a ponta em memoria.

Arquivos novos:

- `src/lib/whatsapp/webhook-pipeline.ts`
- `src/lib/whatsapp/webhook-pipeline.runtime.js`
- `src/lib/whatsapp/webhook-pipeline.e2e.spec.ts`

### Integracao na rota

`/api/whatsapp/webhook` passou a chamar o pipeline unificado (`executarPipelineWebhook`) em vez de coordenar manualmente cada etapa.

Arquivo atualizado:

- `src/app/api/whatsapp/webhook/route.ts`

### Etapas cobertas pelo pipeline

- clarificacao pendente
- atalhos de etapa concluida
- intencao/contexto/clarificacao
- despacho final por intencao
- fallback defensivo de resposta

### Scripts atualizados

`package.json` atualizado com:

- `npm run test:conversation:webhook:e2e`
- `npm run test:conversation:all` (inclui webhook:e2e)
- `npm run test:conversation:regression`

### Validacao da rodada

- `webhook-pipeline-e2e: OK (5/5)`
- `npm run test:conversation:regression` -> OK
- `npm run lint` -> sem erros (warnings legados)

---

## Atualizacoes Recentes (06/03/2026 - rodada 9 / Sprint 2)

### Inicio do Sprint 2: memoria persistente por usuario

Foi adicionada uma camada de memoria no `contexto_json` para reter preferencias conversacionais entre mensagens.

Novo tipo no contexto:

- `memoria_usuario` (UFs, segmentos, faixa de valor, estilo de resposta, ultima intencao e topicos recentes)

Arquivo atualizado:

- `src/types/index.ts`

### Motor de memoria

Novos arquivos:

- `src/lib/whatsapp/memory-flow.ts`
- `src/lib/whatsapp/memory-flow.runtime.js`
- `src/lib/whatsapp/memory-flow.e2e.spec.ts`

Capacidades implementadas:

- extracao de UFs mencionadas na conversa
- extracao de segmentos preferidos
- extracao de faixa de valor (`acima de`, `abaixo de`, `entre X e Y`, inclusive `k`/`mil`/`mi`)
- preferencia de estilo de resposta (`direto` vs `detalhado`)
- rastreamento de topicos recentes e ultima intencao

### Integracao no pipeline do webhook

A memoria agora e atualizada automaticamente dentro do pipeline unificado, apos resolucao de intencao/contexto.

Arquivo atualizado:

- `src/lib/whatsapp/webhook-pipeline.ts`
- `src/lib/whatsapp/webhook-pipeline.runtime.js`

### Scripts atualizados

`package.json` recebeu:

- `npm run test:conversation:memory:e2e`
- `npm run test:conversation:all` (inclui memory:e2e)
- `npm run test:conversation:regression`

### Validacao da rodada

- `memory-flow-e2e: OK (4/4)`
- `webhook-pipeline-e2e: OK (5/5)`
- `npm run test:conversation:regression` -> OK
- `npm run lint` -> sem erros (warnings legados)

---

## Hotfix (06/03/2026 - rodada 10)

### Correcao de qualidade da busca manual no WhatsApp

Foram aplicadas correcoes para evitar filtros excessivamente restritivos quando o usuario envia consultas como:

- `consultoria em TO acima de 100k`

Ajustes realizados:

- sanitizacao de `termos` extraidos pela IA (remove ruido como `quero`, `edital`, etc.)
- bloqueio de `modalidade` e `tipo_orgao` inferidos sem mencao explicita no texto do usuario
- deduplicacao de termos/exclusoes antes da busca

Arquivo atualizado:

- `src/lib/ai/assistant.ts`

### Correcao de texto quebrado no resumo de filtros

Ajustados rotulos no resumo para evitar exibicao com caracteres corrompidos (ex.: `orgao`, `valor min`, `valor max`, `urgencia`).

Arquivo atualizado:

- `src/lib/whatsapp/handlers/consulta.ts`

### Validacao

- `npm run test:conversation:regression` -> OK
- `npx tsc --noEmit` -> OK

## 2026-03-06 - Hotfix cron PNCP
- Causa: Vercel Cron executa requisicao GET, mas a rota /api/pncp/sync aceitava apenas POST.
- Correcao: rota passou a aceitar GET e POST com a mesma autenticacao por CRON_SECRET e mesma rotina de sincronizacao.
- Impacto: sincronizacao automatica diaria volta a alimentar editais abertos para o bot do WhatsApp.


## 2026-03-06 - Hotfix qualidade de busca WhatsApp
- Busca de editais agora filtra por data/hora atual (data_encerramento >= now), evitando itens ja encerrados no mesmo dia.
- Sanitizacao de termos da consulta agora remove termos numericos/comparativos de valor (ex.: 'acima de 100k') para nao poluir o segmento.
- Ajustes de mensagens no handler de consulta para reduzir textos com encoding inconsistente.


## 2026-03-06 - Hotfix relevancia TI e encoding
- Busca por termo curto 'ti' deixou de usar ilike %ti% (que causava falso positivo em palavras como 'atividade').
- Mapeamento de sinonimos para TI na query: tecnologia, informatica, software, sistema, digital.
- Respostas de detalhe e compatibilidade convertidas para formato ASCII para evitar caracteres quebrados no WhatsApp.


## 2026-03-06 - Melhoria semantica de busca (WhatsApp)
- Expansao de termos por dominio (obra, reforma, engenharia, arquitetura, saude, medicamento, alimenticio, administrativo, TI).
- Inclusao de pontuacao de aderencia para ranquear e filtrar resultados por relevancia de objeto.
- Similaridade de edital ajustada para extrair termos relevantes do objeto e evitar palavras genericas.
- Fallback inteligente: quando nao houver resultados na UF solicitada, o bot busca os mesmos termos em outros estados e informa ao usuario.


## 2026-03-06 - Fase 1/2 busca de alta relevancia (aplicada)
- Codigo da consulta WhatsApp passou a tentar RPC uscar_editais_semantico no Supabase antes do fallback SQL atual.
- Criado script SQL: pp/sql/2026-03-06_search_semantic_upgrade.sql.
- Script adiciona extensoes (unaccent, pg_trgm), indices de FTS/trigram e funcao public.buscar_editais_semantico(...).
- Resultado esperado: melhor matching para termos como obra/reforma/medicamentos e menor dependencia de ilike literal.


## 2026-03-06 - Hotfix comando nacional + plural
- Frase de refinamento como 'buscar em todo brasil' agora limpa filtro de UFs (ufs=[]) em vez de virar segmento.
- Stopwords de consulta/refinamento incluem varia��es de 'todo brasil' para evitar ru�do em termos (	odo, rasil, 
acional).
- Normalizacao de plural na busca semantica (ex.: obras -> obra, medicamentos -> medicamento).


## 2026-03-06 - Hardening busca WhatsApp (rodada final)
- `src/lib/whatsapp/handlers/consulta.ts`:
  - reforco de `STOPWORDS_SEMANTICAS` para evitar ruido em comandos como "todo brasil".
  - `termosParaBusca()` refeito com normalizacao, singular/plural e expansao semantica por sinonimos.
  - persistencia de contexto mesmo em busca sem resultado (`salvarUltimaBusca` com lista vazia + filtros).
  - telemetria opcional em `bot_busca_logs` (nao bloqueante).
  - fallback nacional preservado e rastreado.
  - normalizacao de filtros de modalidade/orgao no fallback SQL para evitar mismatch por acento.
- `src/lib/whatsapp/concluded-flow.ts`:
  - refinamento contextual ampliado para frases como "buscar em todo brasil", "ampliar", "nacional".
- `src/lib/ai/assistant.ts`:
  - refinamento nacional (`ufs=[]`) ao detectar intencao de ampliar para Brasil.
- `src/lib/whatsapp/client.ts`:
  - mensagens reescritas em ASCII para eliminar caracteres corrompidos no WhatsApp.

### Validacao executada
- `cmd /c npx tsc --noEmit` -> OK
- `npm run test:conversation:webhook:e2e` -> OK (5/5)
- `npm run test:conversation:stress` -> OK (27/27)
- `npm run test:conversation:chaos` -> OK (500/500)
- `npm run test:conversation:concluded:e2e` -> OK (6/6)
- `npm run test:conversation:intent:e2e` -> OK (4/4)

- Script opcional de telemetria criado: \\sql/2026-03-06_bot_busca_logs.sql\\.

## 2026-03-06 - Regra de consulta generica (UX WhatsApp)
- Em consultas/refinamentos com termos genericos demais, o bot nao responde mais "nao encontrei".
- Agora ele pede refinamento guiado com formato que entende e exemplos prontos.
- Implementado em `src/lib/whatsapp/handlers/consulta.ts` via:
  - `buscaGenericaDemais(...)`
  - `mensagemRefinamentoBuscaGenerica()`
- Aplicado tanto em busca inicial quanto em refinamento contextual.
- Validacao:
  - `cmd /c npx tsc --noEmit` -> OK
  - `npm run test:conversation:webhook:e2e` -> OK (5/5)

## 2026-03-06 - Desambiguacao de categoria ampla + taxonomia PNCP
- `src/lib/whatsapp/handlers/consulta.ts`:
  - novo detector `detectarPedidoAmplo(...)` para termos macro/genericos (ex.: saude, obra, alimentos, papelaria, projeto, consultoria, ti).
  - antes de buscar, o bot pede refinamento com subtipos e formato de mensagem esperado.
  - mensagem guiada via `mensagemDesambiguacaoAmpla(...)`.
  - comportamento aplicado em consulta inicial e refinamento contextual.
- novo SQL: `sql/2026-03-06_taxonomia_pncp_analise.sql`
  - funcao `public.relatorio_taxonomia_pncp(dias, limite)` para mapear padrao de termos por categoria e UF com base em historico PNCP.
  - uso sugerido: `select * from public.relatorio_taxonomia_pncp(365, 20);`

### Validacao
- `cmd /c npx tsc --noEmit` -> OK
- `npm run test:conversation:webhook:e2e` -> OK (5/5)
- `npm run test:conversation:stress` -> OK (27/27)

## 2026-03-06 - Correcao de link oficial no WhatsApp
- Causa raiz observada no dialogo: varios editais chegaram com `link_sistema_origem` vazio, entao o detalhe exibia "Nao disponivel".
- Solucao aplicada no codigo:
  - novo helper `src/lib/pncp/links.ts` para resolver link oficial com fallback robusto:
    1. usa `link_sistema_origem` se valido
    2. monta URL PNCP por `cnpj_orgao/ano_compra/sequencial_compra`
    3. fallback por busca com `numero_controle_pncp`
    4. fallback final para pagina de editais PNCP
  - `src/app/api/pncp/sync/route.ts` passa a salvar `link_sistema_origem` via `resolverLinkEditalPNCP(...)`
  - `src/lib/whatsapp/handlers/consulta.ts` (detalhe edital) passa a usar `resolverLinkEditalDB(...)`
  - `src/lib/whatsapp/handlers/favoritos.ts` (lembretes) passa a usar `resolverLinkEditalDB(...)`
- Script SQL criado para backfill de registros antigos sem link:
  - `sql/2026-03-06_backfill_links_editais.sql`

### Validacao
- `cmd /c npx tsc --noEmit` -> OK
- `npm run test:conversation:webhook:e2e` -> OK (5/5)
- `npm run test:conversation:stress` -> OK (27/27)

## 2026-03-07 - Hotfix parser UF + termos compostos
- `src/lib/ai/assistant.ts`:
  - removida associacao direta `para -> PA` para eliminar falso positivo de UF (preposicao "para").
  - deteccao de PA agora exige contexto explicito ("estado do para", "no para", "em para").
- `src/lib/whatsapp/handlers/consulta.ts`:
  - `termosParaBusca()` reforcado para termos compostos, quebrando em tokens uteis e mantendo singular/plural + sinonimos.
  - melhora recall para buscas como "construcao civil", "execucao de obras", etc.

### Validacao
- `cmd /c npx tsc --noEmit` -> OK
- `npm run test:conversation:webhook:e2e` -> OK (5/5)
- `npm run test:conversation:stress` -> OK (27/27)

## 2026-03-07 - Melhoria de linguagem (acentos, maiusculas, emojis)
- `src/lib/whatsapp/client.ts`:
  - adicionado `embelezarTextoMensagem(...)` no envio de WhatsApp.
  - corrige termos comuns sem acento (não, você, dúvida, órgão, análise, até).
  - aplica capitalizacao inicial por linha (sem quebrar bullets/listas).
  - adiciona emoji padrão 🤖 quando a resposta não possui nenhum emoji.
- mensagens de alerta proativo revisadas com acentuação e emojis legíveis.

### Validacao
- `cmd /c npx tsc --noEmit` -> OK
- `npm run test:conversation:webhook:e2e` -> OK (5/5)

## 2026-03-07 - Rodada de linguagem humanizada (WhatsApp)
- Ajuste do tom conversacional em clarificacoes (`conversation-state.ts`) com frases mais naturais, acentuacao e emoji inicial.
- `src/lib/whatsapp/client.ts` ganhou `embelezarTextoMensagem(...)` para padronizar:
  - acentos em termos comuns (não, você, dúvida, órgão, análise, até, serviços, licitação etc.)
  - capitalização inicial de linhas
  - emoji padrão 🤖 quando a resposta vier sem emoji
- Objetivo: melhorar percepção de atendimento humano sem depender de ajuste manual em cada handler.

### Validacao
- `cmd /c npx tsc --noEmit` -> OK
- `npm run test:conversation:webhook:e2e` -> OK (5/5)

## 2026-03-07 - Correcoes de refinamento semantico (execucao de obras e regioes)
- src/lib/ai/assistant.ts:
  - corrigida deteccao de regioes (Norte/Nordeste/Centro-Oeste/Sudeste/Sul) para expandir UFs corretamente.
  - exclusoes (excluir) agora so sao aplicadas quando a mensagem realmente pedir exclusao (sem, exceto, 	irando, 
ao quero, etc.).
  - termos ruidosos removidos da extra��o: qualquer, alor, execucao, nomes de regioes e derivados.
  - refinamento contextual preserva exclusao apenas quando o usuario pedir explicitamente.
- src/lib/whatsapp/handlers/consulta.ts:
  - stopwords semanticas ampliadas com qualquer, alor, execucao para reduzir falso negativo por sobre-filtro.
- src/lib/whatsapp/concluded-flow.ts:
  - refinamentos curtos (ex.: civil) agora sao tratados como continuidade de filtro, evitando loop de pergunta generica.

### Impacto esperado
- Menos respostas "Nao localizei" por ruido de linguagem natural.
- Melhor entendimento de pedidos por regiao (ex.: "norte do Brasil").
- Menor chance de carregar "excluindo" indevido entre mensagens.

## 2026-03-07 - Fortalecimento geral de geografia (plano sistemico)
- src/lib/ai/assistant.ts:
  - parser geografico agora prioriza deteccao deterministica do texto do usuario para UFs e regioes, reduzindo dependencia de "hallucinacao" do modelo.
  - cobertura explicita de todas as regioes: Norte, Nordeste, Centro-Oeste, Sudeste e Sul.
  - escopo nacional ("todo Brasil", "nacional", "Brasil inteiro") agora zera filtro de UF por regra.
  - limpeza semantica bloqueia termos de escopo/geografia no campo de segmento (ex.: "norte do brasil", "qualquer valor").
- src/lib/whatsapp/handlers/consulta.ts:
  - fallback lexical recebeu stopwords de geografia/escopo para nao transformar regiao em segmento tecnico.

### Objetivo
- Corrigir de forma geral a interpretacao geografica e evitar consertos pontuais por frase especifica.

## 2026-03-07 - Sprint de classificador hierarquico (macro -> subtipo)
- src/lib/whatsapp/handlers/consulta.ts:
  - criado dicionario de aliases por macro (ALIASES_MACRO) para captar linguagem natural variada (ex.: "execucao de obras", "construcao civil", "hospitalar", "merenda", "informatica").
  - novo detector deterministico detectarMacroNoTexto(...) para inferir macro por score de ocorrencias no texto original.
  - novo enriquecimento enriquecerTermosPorMacro(...) que expande consultas macro/genericas com sementes semanticas antes da busca.
  - detectarPedidoAmplo(...) agora considera contexto do texto original, reduzindo falso negativo na desambiguacao.
  - aplicado enriquecimento em handleConsulta(...) e handleRefinamento(...) antes da busca.

### Impacto esperado
- melhor entendimento para pedidos amplos sem formato perfeito.
- menor chance de "nao localizei" por perda semantica em termos macro.
- desambiguacao mais coerente para nichos amplos (obra, saude, alimentos, ti, consultoria, projeto).

## 2026-03-07 - Cobertura ampliada + fallback ao vivo PNCP (consolidado)
- src/lib/whatsapp/handlers/consulta.ts:
  - implementado fallback hibrido: quando a busca local retorna zero, o bot consulta PNCP em tempo real, faz upsert no Supabase e reexecuta a busca.
  - novo pipeline uscarPNCPAoVivoEPopularBase(...) com limites de seguranca e deduplicacao por 
umeroControlePNCP.
  - novos controles de runtime:
    - PNCP_LIVE_DIAS_ATRAS (fallback default para 180 dias se ausente)
    - PNCP_LIVE_MAX_PAGINAS (fallback default para 8 paginas se ausente)
  - telemetria de busca passou a registrar origem pncp_live.
- src/app/api/pncp/sync/route.ts:
  - defaults de sincronizacao ampliados para cobertura:
    - diasAtras: 90 (antes 7)
    - maxPaginas: 30 (antes 12)

### Resultado pr�tico
- maior chance de encontrar editais com publicacao antiga e prazo ainda aberto.
- menor dependencia exclusiva do snapshot local.
- comportamento consolidado mesmo sem rodar sincronizacao manual antes do teste.
