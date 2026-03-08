-- Observabilidade opcional da busca conversacional
create table if not exists public.bot_busca_logs (
  id uuid primary key default gen_random_uuid(),
  numero_whatsapp text not null,
  consulta_texto text not null,
  filtros_json jsonb not null,
  total_resultados integer not null default 0,
  origem_busca text not null check (origem_busca in ('rpc_semantico','fallback_sql','nao_encontrado')),
  criado_em timestamptz not null default now()
);

create index if not exists idx_bot_busca_logs_criado_em
  on public.bot_busca_logs (criado_em desc);

create index if not exists idx_bot_busca_logs_origem
  on public.bot_busca_logs (origem_busca);
