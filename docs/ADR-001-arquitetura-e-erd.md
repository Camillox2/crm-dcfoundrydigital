# ADR-001 — Decisão de Stack, Arquitetura e Modelo Relacional (DC Foundry Digital CRM)

## 1. Decisão de Stack: React 19 + Vite 6 (SPA/PWA) vs Next.js App Router
- **Decisão**: Utilizamos **React 19 + Vite 6 + TypeScript** para `apps/web` e **Fastify 5 + Socket.IO** para `apps/api`.
- **Justificativa Técnica**:
  1. **Orçamento de Memória na VPS (1 vCPU / 4 GB RAM — Hostinger KVM 1)**: Com Vite, o build de produção gera assets estáticos servidos diretamente pelo **Caddy** (~25 MB de RAM), eliminando um servidor Node SSR dedicado para o frontend (~350 MB de RAM). Isso preserva memória para o PostgreSQL 16 + `pgvector`, Redis 7, API Fastify e o Worker do Baileys + IA.
  2. **Tempo Real e Offline-First (PWA)**: O CRM é intensivo em WebSockets (Inbox WhatsApp multi-sessão), Drag-and-Drop (`@dnd-kit`) e cache offline (Workbox + Background Sync), cenários onde uma SPA pura evita sobrecarga de hidratação RSC e simplifica o Service Worker.
  3. **Rotas Públicas por Token**: As páginas públicas de assinatura de contrato (`/assinar/:token`) e aceite de orçamento (`/proposta/:token`) não devem ser indexadas por buscadores (contêm dados contratuais privados), portanto não necessitam de SSR para SEO.

## 2. ORM e Banco de Dados: PostgreSQL 16 + `pgvector` + `btree_gist` + Drizzle ORM
- **Substituição do `crm_records` JSONB**: Todas as entidades passam a ter tabelas relacionais fortemente tipadas, chaves estrangeiras, índices compostos, busca vetorial HNSW (`pgvector`) e constraint de exclusão `EXCLUDE USING gist` em `equipment_reservations` para impedir sobreposição de reservas do mesmo patrimônio.
