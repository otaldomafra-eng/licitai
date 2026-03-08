import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

type CoberturaCategoria = {
  categoria: string
  total: number
}

function autenticar(req: Request): boolean {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const CATEGORIAS: Array<{ nome: string; termos: string[] }> = [
  { nome: 'obras_engenharia', termos: ['obra', 'obras', 'engenharia', 'construcao', 'reforma', 'pavimentacao', 'infraestrutura'] },
  { nome: 'saude_medicamentos', termos: ['saude', 'hospitalar', 'medicamento', 'medicamentos', 'farmaceutico', 'insumo hospitalar'] },
  { nome: 'ti_tecnologia', termos: ['ti', 'tecnologia', 'informatica', 'software', 'sistema', 'dados', 'cloud'] },
  { nome: 'alimentacao', termos: ['alimenticio', 'alimentacao', 'generos alimenticios', 'merenda', 'alimentos'] },
  { nome: 'administrativo', termos: ['expediente', 'escritorio', 'papelaria', 'suprimentos', 'material de escritorio'] },
]

export async function GET(req: Request) {
  if (!autenticar(req)) {
    return NextResponse.json({ erro: 'Nao autorizado' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const agoraIso = new Date().toISOString()

  const { data, error } = await supabase
    .from('editais_pncp')
    .select('uf_orgao,objeto,data_encerramento', { count: 'exact' })
    .gte('data_encerramento', agoraIso)
    .limit(20000)

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Array<{ uf_orgao: string | null; objeto: string | null; data_encerramento: string | null }>

  const porUf: Record<string, number> = {}
  const porCategoria: Record<string, number> = {}

  for (const c of CATEGORIAS) porCategoria[c.nome] = 0

  for (const row of rows) {
    const uf = (row.uf_orgao ?? 'NA').toUpperCase()
    porUf[uf] = (porUf[uf] ?? 0) + 1

    const objeto = normalizar(row.objeto ?? '')
    for (const c of CATEGORIAS) {
      if (c.termos.some((t) => objeto.includes(t))) {
        porCategoria[c.nome] += 1
      }
    }
  }

  const rankingUf = Object.entries(porUf)
    .map(([uf, total]) => ({ uf, total }))
    .sort((a, b) => b.total - a.total)

  const rankingCategoria: CoberturaCategoria[] = Object.entries(porCategoria)
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({
    sucesso: true,
    referencia_utc: agoraIso,
    total_abertos_amostrados: rows.length,
    por_uf: rankingUf,
    por_categoria: rankingCategoria,
  })
}
