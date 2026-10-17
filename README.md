# DC Foundry Digital CRM

Plataforma corporativa completa de **CRM Comercial, Propostas e Contratos de Engenharia de Software & Squads Dedicadas, Atendimento WhatsApp Multi-Sessão com Agente de IA RAG (`pgvector`) e Atribuição de Marketing Google Ads (Conversões Offline)**.

Desenvolvido por **Vitor Henrique Camillo — DC Foundry Digital** (`dcfoundrydigital.com`).

---

## Arquitetura do Monorepo

```text
crm-dcfoundrydigital/
├─ apps/
│  ├─ web/            # React 19 + Vite 6 + Framer Motion + Lucide SVG (PWA Responsivo)
│  ├─ api/            # Node 22 + Fastify 5 + Socket.IO + RBAC + Audit Log Imutável
│  └─ worker/         # Baileys Multi-Sessão, Agente IA RAG, BullMQ Jobs
├─ packages/
│  ├─ db/             # Drizzle ORM + PostgreSQL 16 + pgvector + btree_gist + Operações & Migração
│  ├─ ui/             # Design System DC Foundry Digital (Tokens, DcLogo, FoundryArchitectureArt)
│  ├─ shared/         # Matriz RBAC (7 papéis + own/team/all), AES-256-GCM LGPD, Zod Schemas
│  ├─ ai/             # Motor de Qualificação, Horário Comercial, RAG 768-d e Handoff Humano
│  └─ tracking/       # Captura UTM/gclid/gbraid/wbraid e Google Ads Offline Conversions
├─ infra/             # Docker Compose otimizado para VPS 1 vCPU / 4 GB RAM + Caddy HTTPS
├─ docs/              # ADRs e Manual de Conformidade LGPD
└─ tests/             # Suíte automatizada Vitest cobrindo todas as 7 fases
```

## Credenciais de Demonstração (Ambiente Local)

| Perfil RBAC | E-mail | Senha | Permissões Principais |
|---|---|---|---|
| **Admin (Total)** | `vitor@dcfoundrydigital.com` | `DcFoundry#2026` | Acesso total (`all`) a Contratos, Financeiro, Marketing Ads, Audit Log e IA |
| **Vendedor** | `vendedor@dcfoundrydigital.com` | `Vendedor#2026` | Escopo `own` em Leads e Propostas (`contract:approve` bloqueado com 403) |
| **Operações / Delivery** | `logistica@dcfoundrydigital.com` | `Logistica#2026` | Gestão de Alocação de Squads, Ambientes Cloud e Sprints |

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
