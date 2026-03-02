'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO',
]

const SEGMENTOS_OPCOES = [
  'Tecnologia da Informação', 'Infraestrutura e Obras', 'Serviços de Limpeza',
  'Segurança Patrimonial', 'Consultoria e Assessoria', 'Saúde e Medicamentos',
  'Material de Escritório', 'Equipamentos e Mobiliário', 'Transporte e Logística',
  'Treinamento e Capacitação', 'Engenharia e Arquitetura', 'Comunicação e Marketing',
]

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [etapa, setEtapa] = useState(1)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Formulário
  const [razaoSocial, setRazaoSocial] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [descricao, setDescricao] = useState('')
  const [segmentos, setSegmentos] = useState<string[]>([])
  const [palavrasChave, setPalavrasChave] = useState('')
  const [ufsInteresse, setUfsInteresse] = useState<string[]>([])
  const [valorMin, setValorMin] = useState('')
  const [valorMax, setValorMax] = useState('')

  function toggleSegmento(seg: string) {
    setSegmentos((prev) =>
      prev.includes(seg) ? prev.filter((s) => s !== seg) : [...prev, seg]
    )
  }

  function toggleUF(uf: string) {
    setUfsInteresse((prev) =>
      prev.includes(uf) ? prev.filter((u) => u !== uf) : [...prev, uf]
    )
  }

  async function salvarPerfil() {
    setCarregando(true)
    setErro(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const palavrasArray = palavrasChave
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)

    const { error } = await supabase.from('perfil_empresa').upsert({
      usuario_id: user.id,
      razao_social: razaoSocial || null,
      cnpj: cnpj || null,
      descricao,
      segmentos,
      palavras_chave: palavrasArray,
      uf_interesse: ufsInteresse,
      valor_min: valorMin ? Number(valorMin) : null,
      valor_max: valorMax ? Number(valorMax) : null,
    }, { onConflict: 'usuario_id' })

    if (error) {
      setErro('Erro ao salvar perfil. Tente novamente.')
      setCarregando(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">L</span>
            </div>
            <span className="text-white font-semibold text-xl">LicitaIA</span>
          </div>
          <p className="text-slate-400 text-sm">Configure seu perfil para receber editais relevantes</p>
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-6">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`h-1 flex-1 rounded-full transition-colors ${
                n <= etapa ? 'bg-blue-500' : 'bg-slate-800'
              }`}
            />
          ))}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">

          {/* Etapa 1: Dados da empresa */}
          {etapa === 1 && (
            <div>
              <h2 className="text-white font-semibold text-lg mb-1">Dados da empresa</h2>
              <p className="text-slate-400 text-sm mb-6">Informações básicas do seu negócio</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">
                    Razão Social <span className="text-slate-500">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={razaoSocial}
                    onChange={(e) => setRazaoSocial(e.target.value)}
                    placeholder="Minha Empresa LTDA"
                    className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">
                    CNPJ <span className="text-slate-500">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">
                    Descreva o que sua empresa faz <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    placeholder="Ex: Desenvolvemos sistemas de gestão para prefeituras, incluindo ERP, portais de transparência e aplicativos de atendimento ao cidadão. Também prestamos suporte técnico e treinamento..."
                    className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                  <p className="text-slate-500 text-xs mt-1">
                    Seja detalhado — a IA usa esta descrição para encontrar editais compatíveis.
                  </p>
                </div>
              </div>

              <button
                onClick={() => { if (descricao.trim().length > 20) setEtapa(2) }}
                disabled={descricao.trim().length <= 20}
                className="mt-6 w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
              >
                Próximo →
              </button>
            </div>
          )}

          {/* Etapa 2: Segmentos e palavras-chave */}
          {etapa === 2 && (
            <div>
              <h2 className="text-white font-semibold text-lg mb-1">Segmentos de atuação</h2>
              <p className="text-slate-400 text-sm mb-6">Selecione as áreas em que sua empresa compete</p>

              <div className="flex flex-wrap gap-2 mb-6">
                {SEGMENTOS_OPCOES.map((seg) => (
                  <button
                    key={seg}
                    onClick={() => toggleSegmento(seg)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      segmentos.includes(seg)
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {seg}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1.5">
                  Palavras-chave adicionais <span className="text-slate-500">(separadas por vírgula)</span>
                </label>
                <input
                  type="text"
                  value={palavrasChave}
                  onChange={(e) => setPalavrasChave(e.target.value)}
                  placeholder="software, licença, suporte técnico, cloud, SaaS"
                  className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setEtapa(1)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
                >
                  ← Voltar
                </button>
                <button
                  onClick={() => setEtapa(3)}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
                >
                  Próximo →
                </button>
              </div>
            </div>
          )}

          {/* Etapa 3: UF e valores */}
          {etapa === 3 && (
            <div>
              <h2 className="text-white font-semibold text-lg mb-1">Abrangência e valores</h2>
              <p className="text-slate-400 text-sm mb-6">
                Filtre por localização e faixa de valor dos contratos
              </p>

              <div className="mb-6">
                <label className="block text-slate-300 text-sm font-medium mb-2">
                  Estados de interesse{' '}
                  <span className="text-slate-500">(deixe vazio para todo o Brasil)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {UFS.map((uf) => (
                    <button
                      key={uf}
                      onClick={() => toggleUF(uf)}
                      className={`w-10 h-8 rounded text-xs font-medium border transition-colors ${
                        ufsInteresse.includes(uf)
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {uf}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">
                    Valor mínimo (R$)
                  </label>
                  <input
                    type="number"
                    value={valorMin}
                    onChange={(e) => setValorMin(e.target.value)}
                    placeholder="50000"
                    className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">
                    Valor máximo (R$)
                  </label>
                  <input
                    type="number"
                    value={valorMax}
                    onChange={(e) => setValorMax(e.target.value)}
                    placeholder="5000000"
                    className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {erro && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
                  {erro}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setEtapa(2)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
                >
                  ← Voltar
                </button>
                <button
                  onClick={salvarPerfil}
                  disabled={carregando}
                  className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
                >
                  {carregando ? 'Salvando...' : 'Concluir e ir para o Dashboard'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
