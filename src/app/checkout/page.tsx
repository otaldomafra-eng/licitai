/**
 * checkout/page.tsx — Página de planos e upgrade (link enviado via WhatsApp)
 *
 * Página minimal sem autenticação — o usuário acessa via link no WhatsApp.
 * O WhatsApp number é passado via query string para vincular a assinatura.
 */

import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Planos — LicitaIA',
    description: 'Escolha o plano ideal para monitorar licitações públicas com IA.',
}

const PLANOS = [
    {
        id: 'gratis',
        nome: 'Grátis',
        preco: 'R$ 0',
        periodo: '/mês',
        descricao: 'Para começar a explorar',
        recursos: ['3 alertas por mês', '10 consultas por mês', 'Suporte via WhatsApp'],
        destaque: false,
        cta: null,
    },
    {
        id: 'basico',
        nome: 'Básico',
        preco: 'R$ 97',
        periodo: '/mês',
        descricao: 'Para quem participa ativamente',
        recursos: ['30 alertas por mês', 'Consultas ilimitadas', 'Filtros avançados', 'Suporte prioritário'],
        destaque: true,
        cta: 'Assinar Básico',
    },
    {
        id: 'pro',
        nome: 'Pro',
        preco: 'R$ 297',
        periodo: '/mês',
        descricao: 'Para equipes e heavy users',
        recursos: ['Alertas ilimitados', 'Multi-perfil (até 5)', 'Análise detalhada por edital', 'Suporte 24h'],
        destaque: false,
        cta: 'Assinar Pro',
    },
]

export default function CheckoutPage({
    searchParams,
}: {
    searchParams: Promise<{ numero?: string; plano?: string }>
}) {
    return (
        <main className="checkout-container">
            <header className="checkout-header">
                <h1>🤖 LicitaIA</h1>
                <p>Encontre licitações compatíveis com seu negócio — via WhatsApp</p>
            </header>

            <section className="planos-grid">
                {PLANOS.map((plano) => (
                    <article key={plano.id} className={`plano-card ${plano.destaque ? 'destaque' : ''}`}>
                        {plano.destaque && <span className="badge-popular">Mais popular</span>}

                        <div className="plano-header">
                            <h2>{plano.nome}</h2>
                            <div className="preco">
                                <span className="valor">{plano.preco}</span>
                                <span className="periodo">{plano.periodo}</span>
                            </div>
                            <p className="descricao">{plano.descricao}</p>
                        </div>

                        <ul className="recursos">
                            {plano.recursos.map((r) => (
                                <li key={r}>✅ {r}</li>
                            ))}
                        </ul>

                        {plano.cta ? (
                            <a
                                href={`/api/abacatepay/checkout?plano=${plano.id}`}
                                className="btn-assinar"
                            >
                                {plano.cta}
                            </a>
                        ) : (
                            <span className="btn-gratis">Plano atual</span>
                        )}
                    </article>
                ))}
            </section>

            <footer className="checkout-footer">
                <p>💳 Pagamento via PIX — ativação imediata</p>
                <p>🔒 Seguro e criptografado · Cancele quando quiser</p>
            </footer>

            <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #0f172a;
          color: #e2e8f0;
          min-height: 100vh;
        }

        .checkout-container {
          max-width: 1000px;
          margin: 0 auto;
          padding: 2rem 1rem;
        }

        .checkout-header {
          text-align: center;
          margin-bottom: 3rem;
        }

        .checkout-header h1 {
          font-size: 2.5rem;
          font-weight: 800;
          background: linear-gradient(135deg, #25D366, #128C7E);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 0.5rem;
        }

        .checkout-header p {
          color: #94a3b8;
          font-size: 1.1rem;
        }

        .planos-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.5rem;
          margin-bottom: 3rem;
        }

        .plano-card {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 1rem;
          padding: 2rem;
          position: relative;
          transition: transform 0.2s, border-color 0.2s;
        }

        .plano-card:hover {
          transform: translateY(-4px);
        }

        .plano-card.destaque {
          border-color: #25D366;
          box-shadow: 0 0 30px rgba(37, 211, 102, 0.15);
        }

        .badge-popular {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #25D366, #128C7E);
          color: white;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 0.25rem 1rem;
          border-radius: 9999px;
          white-space: nowrap;
        }

        .plano-header { margin-bottom: 1.5rem; }

        .plano-header h2 {
          font-size: 1.25rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }

        .preco {
          display: flex;
          align-items: baseline;
          gap: 0.25rem;
          margin-bottom: 0.5rem;
        }

        .valor {
          font-size: 2.25rem;
          font-weight: 800;
          color: #f8fafc;
        }

        .periodo { color: #64748b; }

        .descricao { color: #94a3b8; font-size: 0.875rem; }

        .recursos {
          list-style: none;
          margin-bottom: 2rem;
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
        }

        .recursos li { font-size: 0.9rem; color: #cbd5e1; }

        .btn-assinar {
          display: block;
          width: 100%;
          background: linear-gradient(135deg, #25D366, #128C7E);
          color: white;
          font-weight: 700;
          text-align: center;
          padding: 0.875rem;
          border-radius: 0.75rem;
          text-decoration: none;
          transition: opacity 0.2s;
        }

        .btn-assinar:hover { opacity: 0.9; }

        .btn-gratis {
          display: block;
          width: 100%;
          background: #1e293b;
          border: 1px solid #475569;
          color: #64748b;
          font-weight: 600;
          text-align: center;
          padding: 0.875rem;
          border-radius: 0.75rem;
        }

        .checkout-footer {
          text-align: center;
          color: #475569;
          font-size: 0.875rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        @media (max-width: 640px) {
          .checkout-header h1 { font-size: 1.75rem; }
          .valor { font-size: 1.75rem; }
        }
      `}</style>
        </main>
    )
}
