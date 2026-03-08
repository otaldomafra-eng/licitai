import type { EditalDB, EditalPNCP } from '@/types'

type LinkInput = {
  linkSistemaOrigem?: string | null
  numeroControlePNCP?: string | null
  cnpjOrgao?: string | null
  anoCompra?: number | null
  sequencialCompra?: number | null
}

function limparDigitos(v?: string | null): string {
  return (v ?? '').replace(/\D/g, '')
}

function construirDoTriplo(cnpj?: string | null, ano?: number | null, sequencial?: number | null): string | null {
  const c = limparDigitos(cnpj)
  if (!c || !ano || !sequencial) return null
  return `https://pncp.gov.br/app/editais/${c}/${ano}/${sequencial}`
}

function construirPorBusca(numeroControle?: string | null): string | null {
  if (!numeroControle) return null
  return `https://pncp.gov.br/app/editais?q=${encodeURIComponent(numeroControle)}`
}

export function resolverLinkEdital(input: LinkInput): string {
  const linkDireto = (input.linkSistemaOrigem ?? '').trim()
  if (/^https?:\/\//i.test(linkDireto)) return linkDireto

  const linkTriplo = construirDoTriplo(input.cnpjOrgao, input.anoCompra, input.sequencialCompra)
  if (linkTriplo) return linkTriplo

  const linkBusca = construirPorBusca(input.numeroControlePNCP)
  if (linkBusca) return linkBusca

  return 'https://pncp.gov.br/app/editais'
}

export function resolverLinkEditalDB(edital: Partial<EditalDB>): string {
  return resolverLinkEdital({
    linkSistemaOrigem: edital.link_sistema_origem ?? null,
    numeroControlePNCP: edital.numero_controle_pncp ?? null,
    cnpjOrgao: edital.cnpj_orgao ?? null,
    anoCompra: edital.ano_compra ?? null,
    sequencialCompra: edital.sequencial_compra ?? null,
  })
}

export function resolverLinkEditalPNCP(edital: Partial<EditalPNCP>): string {
  return resolverLinkEdital({
    linkSistemaOrigem: edital.linkSistemaOrigem ?? null,
    numeroControlePNCP: edital.numeroControlePNCP ?? null,
    cnpjOrgao: edital.orgaoEntidade?.cnpj ?? null,
    anoCompra: edital.anoCompra ?? null,
    sequencialCompra: edital.sequencialCompra ?? null,
  })
}
