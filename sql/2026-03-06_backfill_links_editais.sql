-- 2026-03-06_backfill_links_editais.sql
-- Preenche link_sistema_origem para registros antigos com link nulo.

update public.editais_pncp
set link_sistema_origem =
  case
    when coalesce(link_sistema_origem, '') ~* '^https?://' then link_sistema_origem
    when coalesce(cnpj_orgao, '') <> '' and ano_compra is not null and sequencial_compra is not null
      then 'https://pncp.gov.br/app/editais/'
           || regexp_replace(cnpj_orgao, '\\D', '', 'g')
           || '/' || ano_compra::text
           || '/' || sequencial_compra::text
    when coalesce(numero_controle_pncp, '') <> ''
      then 'https://pncp.gov.br/app/editais?q=' || numero_controle_pncp
    else 'https://pncp.gov.br/app/editais'
  end
where coalesce(link_sistema_origem, '') = '';
