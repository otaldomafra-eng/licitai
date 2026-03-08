-- 2026-03-06_taxonomia_pncp_analise.sql
-- Objetivo: extrair padroes de nomenclatura de editais (atuais + historico)
-- para refinar NLP e busca do bot.

create or replace function public.norm_text_simple(p_text text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select translate(
    lower(p_text),
    'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  )
$$;

create or replace function public.relatorio_taxonomia_pncp(
  p_dias integer default 365,
  p_limite integer default 25
)
returns table (
  secao text,
  categoria text,
  termo text,
  total bigint
)
language sql
stable
as $$
with base as (
  select
    coalesce(objeto, '') as objeto,
    coalesce(uf_orgao, 'NA') as uf,
    coalesce(data_publicacao, now()) as dt
  from public.editais_pncp
  where coalesce(data_publicacao, now()) >= now() - make_interval(days => greatest(p_dias, 1))
),
categorizado as (
  select
    objeto,
    uf,
    case
      when public.norm_text_simple(objeto) ~ '(medicament|hospital|farmac|saude|clinic)' then 'saude_medicamentos'
      when public.norm_text_simple(objeto) ~ '(engenharia|obra|reforma|construc|paviment|infraestrutura)' then 'obras_engenharia'
      when public.norm_text_simple(objeto) ~ '(software|sistema|informatica|tecnologia|dados|rede|cloud)' then 'ti_tecnologia'
      when public.norm_text_simple(objeto) ~ '(alimento|merenda|genero aliment|nutricao|cesta)' then 'alimentacao'
      when public.norm_text_simple(objeto) ~ '(expediente|papelaria|escritorio|suprimento|impress)' then 'administrativo'
      else 'outros'
    end as categoria
  from base
),
tokens as (
  select
    c.categoria,
    c.uf,
    regexp_replace(tok, '[^a-z0-9]', '', 'g') as termo
  from categorizado c,
  lateral regexp_split_to_table(public.norm_text_simple(c.objeto), '\\s+') tok
),
filtrado as (
  select categoria, uf, termo
  from tokens
  where length(termo) >= 4
    and termo not in (
      'para','com','sem','pela','pelo','das','dos','nas','nos','uma','mais','entre',
      'contratacao','empresa','prestacao','servico','servicos','fornecimento','aquisicao',
      'processo','licitacao','edital','objeto','necessidades','atender','municipio','secretaria',
      'registro','precos','termo','referencia','publicacao','aviso','extrato'
    )
),
rank_categoria as (
  select
    categoria,
    termo,
    count(*)::bigint as total,
    row_number() over (partition by categoria order by count(*) desc, termo asc) as rn
  from filtrado
  group by categoria, termo
),
rank_uf as (
  select
    uf,
    count(*)::bigint as total,
    row_number() over (order by count(*) desc, uf asc) as rn
  from categorizado
  group by uf
)
select
  'top_termos_categoria'::text as secao,
  categoria,
  termo,
  total
from rank_categoria
where rn <= greatest(p_limite, 1)

union all

select
  'top_ufs'::text as secao,
  'geral'::text as categoria,
  uf as termo,
  total
from rank_uf
where rn <= greatest(10, least(p_limite, 27))

order by secao, categoria, total desc, termo asc;
$$;

comment on function public.relatorio_taxonomia_pncp(integer, integer) is
'Relatorio de taxonomia de editais PNCP por categoria e UF para evolucao do NLP do bot.';

-- Exemplo de uso:
-- select * from public.relatorio_taxonomia_pncp(365, 20);
