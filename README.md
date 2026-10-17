# DC Foundry Digital CRM

Plataforma completa de **CRM Comercial, Locação e Venda de Equipamentos Hospitalares & Home Care, Atendimento WhatsApp Multi-Sessão com Agente de IA RAG (`pgvector`) e Atribuição de Marketing Google Ads (Conversões Offline)**.

Desenvolvido por **Vitor Henrique Camillo — DC Foundry Digital** (`dcfoundrydigital.com`).

---

## Arquitetura do Monorepo

```text
crm-dcfoundrydigital/
├─ apps/
│  ├─ web/            # React 19 + Vite 6 + Framer Motion + Lucide (PWA Mobile-First)
│  ├─ api/            # Node 22 + Fastify 5 + Socket.IO + RBAC + Audit Log Imutável
│  └─ worker/         # Baileys Multi-Sessão, Agente IA RAG, BullMQ Jobs
├─ packages/
│  ├─ db/             # Drizzle ORM + PostgreSQL 16 + pgvector + btree_gist + Seeds
│  ├─ ui/             # Design System DC Foundry Digital (Tokens, DcLogo, BedArt, Skeletons)
│  ├─ shared/         # Matriz RBAC (7 papéis + own/team/all), AES-256-GCM LGPD, Zod Schemas
│  ├─ ai/             # Abstração LLM (Gemini + Ollama fallback) e RAG
│  └─ tracking/       # Captura UTM/gclid/gbraid/wbraid e Google Ads Offline Conversions
├─ infra/             # Docker Compose otimizado para VPS 1 vCPU / 4 GB RAM + Caddy HTTPS
├─ docs/              # ADRs e Manual de Conformidade LGPD (Art. 11 Dados de Saúde)
└─ tests/             # Suíte automatizada Vitest + Supertest
```

## Credenciais de Demonstração (Ambiente Local)

| Perfil RBAC | E-mail | Senha | Permissões Principais |
|---|---|---|---|
| **Admin (Total)** | `vitor@dcfoundrydigital.com` | `DcFoundry#2026` | Acesso total (`all`) a Contratos, Financeiro, Marketing Ads, Audit Log e IA |
| **Vendedor** | `vendedor@dcfoundrydigital.com` | `Vendedor#2026` | Escopo `own` em Leads e Orçamentos (`contract:approve` bloqueado com 403) |
| **Logística** | `logistica@dcfoundrydigital.com` | `Logistica#2026` | Gestão de Entregas, Retiradas, Checklist com Fotos e Patrimônio |

## Como Rodar Localmente

```bash
# 1. Instalar dependências
corepack pnpm install

# 2. Rodar testes automatizados e verificação de tipos
corepack pnpm test
corepack pnpm -r run typecheck

# 3. Iniciar API (http://localhost:4000) e Web (http://localhost:5173)
corepack pnpm --filter @dcfoundry/api dev
corepack pnpm --filter @dcfoundry/web dev
```
