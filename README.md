# DC Foundry Digital CRM

Workspace com a identidade do site DC Foundry Digital: azul, ondas suaves, Foundry original, vetores animados e navegação responsiva.

## Nesta revisão

- Visão geral sem dados fictícios, com indicadores derivados das oportunidades cadastradas.
- Contatos com busca, edição, avanço no funil, arquivamento e restauração, com persistência PostgreSQL e escopo por usuário/equipe.
- Agenda com tarefas, datas, prioridades, conclusão e reabertura.
- Propostas com escopo, investimento, condições, etapas, impressão/PDF pelo navegador e histórico de versões. Aceite registrado manualmente.
- Financeiro com cobranças, vencimentos, filtros e baixas manuais. Não movimenta dinheiro.
- Blog com editor Markdown seguro, capa enviada pelo CRM, resumo, autor, categoria, tags, SEO, prévia, rascunho, publicação/agendamento, duplicação, versões e recuperação de texto não salvo na aba.
- Feed público compatível com o site e fila persistente de atualização de cache/IndexNow pelo webhook já existente. Publicação não garante indexação ou posição de busca.
- WhatsApp com seleção de contato, mensagem personalizada, respostas prontas e abertura do aplicativo para envio manual.
- Marketing com cadastro de métricas diárias, CSV, importação atualizável e endpoint autenticado para o script que será adicionado depois.
- Foundry com chat Gemini, descoberta de modelos e fallback configurável, base de conhecimento, orientações e histórico. Depende da chave no servidor.
- Foundry flutuante com prioridades do funil, tarefas, cobranças e conteúdo em preparação.
- Auditoria persistente, filtros, detalhes e CSV. Registros versionados têm proteção contra edição concorrente.
- Avatares com foto quando a integração Baileys fornecer uma URL disponível; fallback para iniciais.
- Login sem contas/senhas de demonstração ou entrada automática quando a API falha.
- Migrações e seed de configuração sem clientes, contratos, faturas ou artigos de exemplo.

## Prévia local

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @dcfoundry/web dev --host 127.0.0.1 --port 5175
```

Em desenvolvimento, o login oferece **Visualizar interface local**, normalmente somente leitura. Um executor opcional de revisão em loopback pode fornecer uma sessão para um banco isolado; essa rota não é registrada pela API deste repositório. O botão é excluído do build de produção. Para usar dados reais localmente, configure o banco, crie o administrador e entre normalmente. A API de desenvolvimento usa a porta 4001; pode configurar `CRM_API_URL` para outro backend.

## VPS e banco limpo

Siga [docs/VPS.md](docs/VPS.md) para configurar domínio, segredos, banco e o primeiro administrador. O seed inicializa apenas papéis e etapas comerciais. O reset de dados existentes exige identificação exata do banco e backup antes de limpar; não roda no deploy nem automaticamente ao iniciar.

## Integrações que ainda exigem configuração

O pareamento Baileys ainda exige um gerenciador de sessão no VPS; a tela permite atendimento manual enquanto isso. O adaptador de fotos está em `apps/worker/src/contact-photos.ts`. Configure `GEMINI_API_KEY` para o chat, a conexão do feed/webhook para o blog público e o token de recebimento para o futuro script Ads. Pagamento efetivo e assinatura eletrônica não são simulados; o CRM registra o acompanhamento manual.

## Validação

```sh
corepack pnpm -r run typecheck
corepack pnpm test
corepack pnpm --filter @dcfoundry/web build
```

O workflow usa PostgreSQL descartável e pgvector para verificar migrações, seed vazio, persistência, permissões, publicação, versões, importação e reset com backup. A validação local usa banco PGlite descartável; Docker/Compose e os provedores exigem validação no VPS real. O GitHub Actions estava impedido de iniciar por bloqueio de cobrança da conta na revisão anterior.
