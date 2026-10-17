# DC Foundry Digital CRM

Workspace com a identidade do site DC Foundry Digital: azul, ondas suaves, Foundry original, vetores animados e navegação responsiva.

## Nesta revisão

- Visão geral sem dados fictícios, com indicadores derivados das oportunidades cadastradas.
- Cadastro, leitura e avanço de oportunidades pela API, com persistência PostgreSQL e escopo de acesso por usuário/equipe.
- Foundry flutuante com prioridades baseadas no funil, atalhos, pausa e sugestões que podem ser silenciadas.
- Avatares com foto quando a integração Baileys fornecer uma URL disponível; fallback para iniciais.
- Marketing & Ads aguardando o script que será configurado depois.
- Login sem contas/senhas de demonstração ou entrada automática quando a API falha.
- Migrações e seed de configuração sem clientes, contratos, faturas ou artigos de exemplo.

## Prévia local

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @dcfoundry/web dev --host 127.0.0.1 --port 5175
```

Em desenvolvimento, o login oferece **Visualizar interface local**. Esse modo não cria uma sessão de API e não salva dados. O botão é excluído do build de produção. A API de desenvolvimento usa a porta 4001; pode configurar `CRM_API_URL` para outro backend.

## VPS e banco limpo

Siga [docs/VPS.md](docs/VPS.md) para configurar domínio, segredos, banco e o primeiro administrador. O seed inicializa apenas papéis e etapas comerciais. O reset de dados existentes exige identificação exata do banco e backup antes de limpar; não roda no deploy nem automaticamente ao iniciar.

## Integrações que ainda exigem configuração

Pareamento do worker Baileys, script do Ads, IA generativa, blog, pagamentos e assinatura de contratos precisam de suas respectivas integrações. As telas indicam esses estados. O adaptador de fotos do WhatsApp está em `apps/worker/src/contact-photos.ts`; ele deve ser associado a uma sessão já pareada e aos contatos autorizados.

## Validação

```sh
corepack pnpm -r run typecheck
corepack pnpm test
corepack pnpm --filter @dcfoundry/web build
```

O workflow de CI está configurado com PostgreSQL descartável e pgvector para testar migrações, seed vazio, persistência, acesso por proprietário e reset com backup, além do container da API e da configuração do Caddy. O Actions não iniciou nesta entrega por bloqueio de cobrança da conta. A validação local passou com 24 testes, incluindo banco PGlite descartável, typecheck e build web. Docker/Compose, instalação e provedores do seu VPS ainda devem ser conferidos após a configuração real.
