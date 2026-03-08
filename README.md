# 🏛️ LicitAI - Assistente de Licitações via WhatsApp

**LicitAI** é um projeto desenvolvido para fornecer consultas rápidas, análise de contexto e fluxo de diálogo avançado sobre licitações diretamente via WhatsApp. Construído com as mais modernas tecnologias de desenvolvimento web e Inteligência Artificial.

---

## 🚀 Sobre o Projeto

O LicitAI foi criado para otimizar o acesso à informação pública, respondendo a dúvidas complexas sobre licitações de forma natural e interativa pelo WhatsApp. Ele usa um pipeline robusto para compreender intenções, gerenciar estado de conversas complexas, memorizar interações e oferecer resoluções precisas.

## 🛠️ Tecnologias Utilizadas

Este projeto foi construído (bootstrapped) utilizando [Next.js](https://nextjs.org), juntamente com um ecossistema poderoso:

- **Framework:** [Next.js 16](https://nextjs.org) (App Router)
- **Linguagem:** TypeScript
- **Inteligência Artificial:** 
  - [OpenAI](https://openai.com) (Para fluxos de conversa avançados)
  - [Groq](https://groq.com) (Inferência rápida e eficiente de LLMs)
- **Banco de Dados / BaaS:** [Supabase](https://supabase.com) (Persistência e Busca Semântica)
- **Mensageria:** [Meta WhatsApp API / Twilio](https://www.twilio.com/) (Webhooks e envio de mensagens)
- **Validação de Dados:** [Zod](https://zod.dev/)
- **Estilização:** [Tailwind CSS 4](https://tailwindcss.com/)

---

## 💻 Estrutura Principal do Projeto

O código-fonte foca na modularidade operacional do bot de WhatsApp, abrigado principalmente no diretório `src/lib/whatsapp/`:

- **`handlers/`**: Controladores de endpoints e formatadores de mensagens.
- **`webhook-pipeline`**: O core de recebimento e validação das mensagens do WhatsApp.
- **Fluxos Específicos**:
  - `clarification-flow` (Para resolução de ambiguidades)
  - `concluded-flow` (Para conclusão de interações)
  - `dispatch-flow` (Para tomada de decisão e roteamento)
  - `intent-context-flow` (Para extração de intenções do usuário)
  - `memory-flow` (Para gestão do contexto histórico da conversa)

---

## ⚙️ Como Rodar Localmente

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/otaldomafra-eng/licitai.git
   cd licitai/app
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   # ou yarn install / pnpm install
   ```

3. **Configure as Variáveis de Ambiente:**
   Copie o arquivo `.env.example` para `.env.local` e preencha as chaves da OpenAI, Groq, Supabase e credenciais do WhatsApp Meta API:
   ```bash
   cp .env.example .env.local
   ```

4. **Inicie o Servidor de Desenvolvimento:**
   ```bash
   npm run dev
   ```

5. **Acesse o App:**
   Abra [http://localhost:3000](http://localhost:3000) no seu navegador ou configure seu túnel (ex: Ngrok) para apontar para a rota `/api/whatsapp/webhook`.

---

## 🧪 Testes

A aplicação possui uma suíte extensa de testes focados na conversação e fluxos de estado. Para executar os testes da API de conversação:

```bash
# Rodar todos os testes de conversação (unitários e e2e)
npm run test:conversation:all

# Rodar testes de stress/caos
npm run test:conversation:stress
npm run test:conversation:chaos
```

---

## 📄 Licença

Este projeto é de uso restrito / privado. Todos os direitos reservados.
