# Instalar em um VPS novo

Requisitos: Node.js 22 atualizado, Corepack/pnpm 10.6, Docker com Compose e um domínio apontado para o servidor. Esta revisão não executa deploy no VPS.

## O que inicia limpo

O seed cria somente os sete papéis de acesso, um pipeline comercial e suas quatro etapas. Não insere clientes, produtos, contratos, faturas, campanhas ou artigos. O administrador é criado por um comando separado. Contas e senhas de demonstração existem apenas em fixtures dos testes; a API não as carrega. O frontend de produção não oferece o botão de prévia local.

## Configurar e iniciar

1. Copie `.env.example` para `.env` e mantenha o arquivo somente no servidor. Preencha:
   - `CRM_DOMAIN`: seu domínio, sem protocolo.
   - `WEB_URL` e `API_URL`: origem HTTPS desse domínio.
   - `POSTGRES_PASSWORD`: senha forte própria. Atualize a mesma senha na URI `DATABASE_URL`, cujo host dentro do Compose deve ser `postgres`. Codifique caracteres especiais na URI.
   - `JWT_ACCESS_SECRET`: segredo aleatório com pelo menos 64 caracteres. Pode gerar com `openssl rand -hex 32`.
   - `ENCRYPTION_MASTER_KEY_HEX`: outra chave aleatória de 32 bytes em hexadecimal. Não reutilize o exemplo.
   - `CRM_ADMIN_EMAIL`, `CRM_ADMIN_NAME`, `CRM_ADMIN_PASSWORD`: seu primeiro administrador; a senha precisa de pelo menos 12 caracteres.
2. Na raiz do repositório:

```sh
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @dcfoundry/web build
docker compose --env-file .env -f infra/docker-compose.yml up -d postgres redis
docker compose --env-file .env -f infra/docker-compose.yml build api
docker compose --env-file .env -f infra/docker-compose.yml run --rm api node --import tsx packages/db/src/migrate.ts
docker compose --env-file .env -f infra/docker-compose.yml run --rm api node --import tsx packages/db/src/seed.ts
docker compose --env-file .env -f infra/docker-compose.yml run --rm api node --import tsx apps/api/src/bootstrap-admin.ts
```

3. Remova `CRM_ADMIN_PASSWORD` do `.env` depois da criação. O comando não imprime a senha nem sobrescreve um usuário existente. O hash fica no banco.
4. Inicie a aplicação:

```sh
docker compose --env-file .env -f infra/docker-compose.yml up -d api caddy
docker compose --env-file .env -f infra/docker-compose.yml ps
```

Entre pelo domínio com o administrador criado. Caddy usa `CRM_DOMAIN` para o site e para HTTPS automático quando o DNS e as portas 80/443 estiverem acessíveis. API, PostgreSQL e Redis são publicados apenas no loopback do host. A sessão de acesso usa JWT em memória e expira em 15 minutos; nesta revisão é necessário entrar novamente após expirar.

## Limpar dados de negócio existentes

Para um VPS novo, não é necessário reset: a inicialização já vem vazia. Para uma instalação existente deste CRM, o comando exige o nome exato do banco e cria um backup JSON antes de limpar os dados. Preserva usuários, permissões, sessões e configuração do pipeline. Não usa banco alternativo nem `CASCADE`; se houver dependências inesperadas, a transação aborta.

```sh
docker compose --env-file .env -f infra/docker-compose.yml run --rm \
  -v "$PWD/backups:/backups" -e CRM_BACKUP_DIRECTORY=/backups \
  api node --import tsx packages/db/src/reset-data.ts \
  --database dcfoundry_crm --confirm-clear-business-data
```

O nome deve corresponder ao banco de `DATABASE_URL`. O diretório de backup contém dados privados e fica fora do Git. Sem `DATABASE_URL`, o comando não executa a limpeza.

## Google Ads: configurar depois

O módulo Marketing & Ads começa aguardando sua integração. Nenhum script altera campanhas, orçamento, anúncios ou conversões nesta revisão. Quando você adicionar seu script, a integração deve autenticar o recebimento, informar conta, moeda, período e fuso e importar métricas sem confundir cliques de WhatsApp com vendas. O pacote `@dcfoundry/tracking` mantém os cálculos de atribuição existentes. Referência: [relatórios do Google Ads Scripts](https://developers.google.com/google-ads/scripts/docs/concepts/reports).

## Baileys e fotos de contatos

O worker de sessão WhatsApp ainda precisa ser configurado e pareado; ele não sobe no Compose padrão. Não existe conexão ou foto simulada. `apps/worker/src/contact-photos.ts` oferece um adaptador testado para o método `profilePictureUrl` de um socket já pareado. Ele usa cache, admite foto ausente/privada e mantém a foto anterior em falhas temporárias. As iniciais são usadas se a foto não puder ser mostrada.

Ao conectar seu gerenciador Baileys, use uma instância desse adaptador por sessão e grave o resultado no contato correspondente:

```ts
const syncPhoto = createContactPhotoSync(sock, async (update) => {
  await pool.query('UPDATE workspace_leads SET avatar_url=$1, avatar_checked_at=$2 WHERE id=$3', [
    update.photoUrl,
    update.checkedAt,
    update.leadId,
  ]);
});
await syncPhoto(lead.id, lead.phone);
```

Associe apenas contatos pertencentes à sessão/organização autorizada. Não tente obter fotos que o WhatsApp não disponibilize. O frontend mostra `avatarUrl` retornado pela API sem enviar referrer. Referência: [projeto Baileys](https://github.com/WhiskeySockets/Baileys).

## Escopo funcional desta revisão

Cadastro e leitura persistente de oportunidades, avanço de etapa com permissões, prioridades do Foundry derivadas dos registros, navegação e estados vazios estão implementados. Pareamento WhatsApp, editor do blog, pagamentos, assinatura de contratos, IA generativa e recebimento do script Ads continuam dependendo das respectivas integrações. As telas mostram isso explicitamente. Docker, migrações, persistência e reset são verificados no CI com um PostgreSQL descartável; o VPS e seus provedores ainda exigem validação depois da configuração real.
