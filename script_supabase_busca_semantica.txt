-- 2026-03-06_search_semantic_upgrade.sql
-- Objetivo: melhorar cobertura/relevancia de busca de editais para o bot WhatsApp.

create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- Wrapper imutavel para permitir uso em indices de expressao.
-- Observacao: se o dicionario unaccent for alterado, e preciso reindexar.
create or replace function public.unaccent_immutable(text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select unaccent('public.unaccent', $1)
$$;

-- Indices para full-text + fuzzy.
create index if not exists idx_editais_pncp_data_encerramento
  on public.editais_pncp (data_encerramento);

create index if not exists idx_editais_pncp_objeto_fts
  on public.editais_pncp
  using gin (to_tsvector('portuguese', public.unaccent_immutable(coalesce(objeto, ''))));

create index if not exists idx_editais_pncp_objeto_trgm
  on public.editais_pncp
  using gin ((public.unaccent_immutable(lower(coalesce(objeto, '')))) gin_trgm_ops);

create or replace function public.buscar_editais_semantico(
  p_termos text[] default '{}',
  p_ufs text[] default '{}',
  p_excluir text[] default '{}',
  p_valor_min numeric default null,
  p_valor_max numeric default null,
  p_modalidade text default null,
  p_tipo_orgao text default null,
  p_prazo_min_dias integer default null,
  p_prazo_max_dias integer default null,
  p_offset integer default 0,
  p_limite integer default 5
)
returns setof public.editais_pncp
language plpgsql
stable
as $$
declare
  v_termos text[];
  v_busca text;
  v_data_min timestamptz;
  v_data_max timestamptz;
begin
  v_termos := coalesce(p_termos, '{}');
  v_busca := trim(array_to_string(v_termos, ' '));

  v_data_min := now();
  if p_prazo_min_dias is not null then
    v_data_min := greatest(v_data_min, now() + (p_prazo_min_dias || ' days')::interval);
  end if;

  v_data_max := null;
  if p_prazo_max_dias is not null then
    v_data_max := now() + (p_prazo_max_dias || ' days')::interval;
  end if;

  return query
  with base as (
    select e.*,
      unaccent(lower(coalesce(e.objeto, ''))) as objeto_norm,
      case
        when v_busca = '' then 0::real
        else ts_rank(
          to_tsvector('portuguese', unaccent(coalesce(e.objeto, ''))),
          websearch_to_tsquery('portuguese', unaccent(v_busca))
        )
      end as score_fts,
      case
        when v_busca = '' then 0::real
        else similarity(unaccent(lower(coalesce(e.objeto, ''))), unaccent(lower(v_busca)))
      end as score_trgm
    from public.editais_pncp e
    where e.data_encerramento >= v_data_min
      and (v_data_max is null or e.data_encerramento <= v_data_max)
      and (coalesce(array_length(p_ufs, 1), 0) = 0 or e.uf_orgao = any(p_ufs))
      and (p_valor_min is null or coalesce(e.valor_estimado, 0) >= p_valor_min)
      and (p_valor_max is null or coalesce(e.valor_estimado, 0) <= p_valor_max)
      and (p_modalidade is null or unaccent(lower(coalesce(e.modalidade, ''))) like '%' || unaccent(lower(p_modalidade)) || '%')
      and (
        p_tipo_orgao is null
        or unaccent(lower(coalesce(e.nome_orgao, ''))) like '%' || unaccent(lower(p_tipo_orgao)) || '%'
      )
      and (
        coalesce(array_length(p_excluir, 1), 0) = 0
        or not exists (
          select 1
          from unnest(p_excluir) ex
          where ex is not null
            and ex <> ''
            and unaccent(lower(coalesce(e.objeto, ''))) like '%' || unaccent(lower(ex)) || '%'
        )
      )
      and (
        v_busca = ''
        or to_tsvector('portuguese', unaccent(coalesce(e.objeto, ''))) @@ websearch_to_tsquery('portuguese', unaccent(v_busca))
        or exists (
          select 1
          from unnest(v_termos) t
          where t is not null
            and t <> ''
            and unaccent(lower(coalesce(e.objeto, ''))) like '%' || unaccent(lower(t)) || '%'
        )
      )
  ),
  ranqueado as (
    select b.*,
      (
        (b.score_fts * 10)
        + (b.score_trgm * 4)
        + coalesce((
          select count(*)::real
          from unnest(v_termos) t
          where t is not null
            and t <> ''
            and b.objeto_norm like '%' || unaccent(lower(t)) || '%'
        ), 0)
      ) as score_final
    from base b
  )
  select r.*
  from ranqueado r
  order by r.score_final desc, r.data_publicacao desc nulls last
  offset greatest(p_offset, 0)
  limit greatest(p_limite, 1);
end;
$$;

comment on function public.buscar_editais_semantico is
'Busca semantica de editais com FTS + trigram + ranking de aderencia para WhatsApp.';
