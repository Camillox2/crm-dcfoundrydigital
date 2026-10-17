# Instalar em um VPS novo

## WhatsApp persistente — portabilidade do item 1

Rode as migrations antes de atualizar API e worker. A migration `0006_whatsapp_sessions.sql` cria tabelas específicas para sessões, identidades, mensagens e o outbox. Não altera os sete papéis, métricas Ads ou dados de Uso da IA.

```sh
docker compose --env-file .env -f infra/docker-compose.yml --profile whatsapp up -d --build api worker
```

Na tela **WhatsApp → Conectar**, escolha QR ou código e use **Aparelhos conectados** no telefone. O código exige E.164 com `+` e DDI. QR e código expiram em 60 segundos na API e só são disponibilizados a usuários autenticados no escopo da sessão. O código, o QR e as credenciais não entram nos logs.

A sessão fica no volume `whatsapp_sessions`, montado somente no worker em `/data/whatsapp`. Preserve e faça backup privado desse volume; não use `docker compose down -v` em uma atualização. O worker restaura sessões habilitadas após reinício e tenta reconectar com espera progressiva. **Desconectar** pausa a sessão sem apagar o volume. Para revogar o aparelho, use o WhatsApp no telefone.

`WHATSAPP_SESSION_DIR=/data/whatsapp`, `WHATSAPP_MAX_SESSIONS=1` e `REDIS_URL=redis://redis:6379` são as variáveis deste item. API e worker se comunicam por filas Redis. O outbox PostgreSQL permite retomar comandos após indisponibilidade do Redis; IDs de evento e de mensagem evitam duplicação. Cada troca de provedor invalida eventos anteriores e limpa o status e os códigos de pareamento. A opção Meta apenas desconecta Baileys; não implementa uma integração Meta.

O histórico é recebido em lotes limitados, sem manter uma cópia completa na RAM. Por padrão, importa mensagens de contatos conhecidos; marque **Criar contatos também a partir do histórico recebido** para incluir contatos novos identificáveis pelo telefone. Um LID sem telefone não vira número. A cobertura depende do telefone: a porcentagem informa o progresso devolvido pelo provedor, não garante todo o histórico. **Sincronizar** solicita até 50 mensagens anteriores à mais antiga já recebida.

Limites do Compose: PostgreSQL 512 MB, Redis 128 MB, API 384 MB, worker 384 MB e Caddy 96 MB (1.504 MB no total). Não foram adicionadas portas. O worker usa heap de 256 MB e uma sessão por padrão. Os limites precisam ser acompanhados com `docker stats` após o pareamento real. Os testes usam socket Baileys simulado e PostgreSQL descartável; não pareiam um telefone real.

### Chat e mídia — item 2

A migration `0007_whatsapp_media.sql` adiciona mídia, recibos e uploads tipados. **WhatsApp → Conversas ao vivo** permite escolher um lead, enviar texto, emoji, imagem, áudio ou documento de até 16 MB. O envio entra no outbox antes de ir ao worker. A tela mostra separadamente fila, envio, entrega e leitura; não confunde fila com entrega. O mesmo identificador de mensagem é reutilizado nas tentativas do worker.

API e worker montam `crm_uploads` em `CRM_UPLOAD_DIR=/data/uploads`; preserve esse volume. Os arquivos não são servidos pelo Caddy. A API confere a permissão e o escopo do contato em cada leitura, não usa nome recebido do cliente como caminho e responde com cache privado desabilitado. Documentos são baixados como anexo. Mídia recebida que expirou ou ultrapassou o limite continua identificada no histórico, sem inventar um arquivo. Mídia histórica não é baixada automaticamente.

As atualizações passam por SSE autenticado na mesma API, sem porta nova. Fotos são consultadas no socket ativo com cache limitado em memória e separado por geração da sessão; trocar de provedor invalida o resultado anterior. Fotos privadas ou indisponíveis usam iniciais. Nenhuma variável adicional além de `CRM_UPLOAD_DIR` é necessária neste item.

### Foundry compartilhada — item 3

Após a migration `0008_foundry_agent.sql`, a base de conhecimento e as orientações têm tabelas e versões próprias; os registros anteriores são migrados sem apagar o histórico. **Foundry IA → Base de conhecimento** define serviços e informações factuais. O público `public` pode ser usado com clientes e equipe; `internal` é restrito ao chat interno. **Orientações** controla o tom e o procedimento da mesma Foundry, não cria um segundo agente.

Configure `GEMINI_API_KEY` somente no servidor. `GEMINI_MODELS` aceita até dez IDs separados por vírgula; nomes repetidos são descartados. Sem lista, o provedor descobre modelos de texto disponíveis. Disponibilidade e cota são decididas pelo provedor; o sistema não presume acesso gratuito pelo nome de um modelo. Não há variável com preço comercial da agência: cadastre somente condições reais na base.

Em **Agente & laboratório**, teste os cenários e depois ative as respostas automáticas no WhatsApp. Começa desativada. O laboratório registra apenas a execução de teste; não envia mensagens, agenda reuniões nem cria ou modifica leads reais. O teste automatizado percorre os dez modelos com respostas Gemini simuladas.

Na conversa, **Assumir atendimento** pausa a Foundry e invalida respostas pendentes. Enviar uma resposta humana também assume o atendimento. **Retomar Foundry** exige a revisão atual do controle; uma aba antiga não retoma uma pausa mais recente. O worker verifica a revisão no Redis antes da entrega. Uma mensagem cuja entrega já começou no provedor não pode ser desfeita. A chave global da automação expira sem heartbeat da API. O perfil precisa manter acesso ao lead para usar esses controles ou o resumo.

O agente extrai tipo de projeto, objetivo, orçamento informado, prazo, decisão e urgência somente quando há trecho de evidência no contato. Pedido de pessoa humana, resposta sem formato válido, preço sem base ou falha do provedor encaminham a conversa e pausam a automação. Mensagens históricas nunca acionam respostas automáticas. Reuniões só serão confirmadas após persistência na agenda do item 7.

### Funil e ficha do lead — item 4

A migration `0009_pipeline_lead_files.sql` amplia o funil preservando as etapas já usadas nos contatos. O padrão tem Novo, Qualificado, Reunião, Proposta, Negociação, Ganho e Perdido. Perfis com `pipeline:manage` podem ajustar a configuração no próprio funil. Há controle de versão para impedir sobreposição entre duas telas; uma etapa usada por contato ativo ou arquivado não pode ser removida. Os relatórios consideram os marcadores configurados de ganho e perda.

No computador, arraste o card; no celular, abra a ficha e escolha a etapa. A ficha também aceita até 15 tags e anexos de até 16 MB. Arquivar não exclui documentos nem tags. Restaurar preserva os vínculos. O arquivamento pausa a Foundry; retome-a explicitamente quando necessário. Os anexos ficam no mesmo `crm_uploads`, com hash SHA-256 e leitura autenticada por lead. Não há variável nova neste item.

### Propostas e contratos de serviços — item 5

A migration `0010_agency_service_contracts.sql` migra as propostas para tabelas próprias com versões. Em **Configurações**, cadastre nome, documento (CPF ou CNPJ numérico/alfanumérico válido), endereço, e-mail, telefone e representante. Os documentos são criptografados com `ENCRYPTION_MASTER_KEY_HEX`; preserve essa chave junto ao backup. Não existe exigência de CNPJ nem emissão obrigatória de nota fiscal. Cobranças possuem somente recibo opcional.

Em **Propostas & contratos**, preencha o cliente, seu documento e endereço, escopo, tipo de serviço, valor e pagamento. Após o aceite da proposta, gere um dos quatro modelos de prestação de serviços. Valor e parcelamento vêm da versão aceita. Revise o documento marcado **modelo, revisar com advogado**, antes de compartilhar. Alterações comerciais exigem uma nova versão da proposta e outro contrato; o texto de um contrato emitido é imutável.

O link público dura sete dias e pode ser renovado por um usuário autorizado. A assinatura registra consentimento, nome, hash do documento, hash de evidência, IP e horário. Ambas as partes assinam separadamente. Esse mecanismo não certifica uma identidade civil. Configure `API_URL` com a origem HTTPS pública e `CRM_TRUST_PROXY=1` somente quando a API estiver atrás do único proxy Caddy previsto no Compose. Para e-mail, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `SMTP_FROM`. Porta 465 usa TLS implícito; demais portas exigem STARTTLS. A fila registra aceitação pelo SMTP separada de leitura/entrega. O envio por WhatsApp exige sessão pareada e contato no escopo. Os botões de envio exigem ação explícita do operador.

Requisitos: Node.js 22 atualizado, Corepack/pnpm 10.6, Docker com Compose e um domínio apontado para o servidor. Esta revisão não executa deploy no VPS.

### Portal e solicitações — item 6

A migration `0011_client_portal.sql` adiciona links pessoais de 30 dias, solicitações e linha do tempo. Abra **Portal & solicitações**, escolha o lead e gere o link. Ele mostra apenas documentos vinculados a esse lead, nunca rascunhos de propostas nem conversas internas. O cliente pode aceitar a versão enviada e abrir ou responder solicitações de ajuste, suporte e manutenção. A equipe altera o status com controle de versão. O aceite guarda o nome, IP e versão sem atribuir a ação a um funcionário. Revogar o link bloqueia os próximos acessos. Não há variável nova neste item; links devem usar a mesma origem HTTPS do CRM.

### Agenda e reservas pela Foundry — item 7

A migration `0012_agency_calendar.sql` cria compromissos e versões em tabelas próprias. **Agenda & tarefas** mantém as tarefas anteriores e acrescenta reuniões, follow-ups e eventos vinculados ao lead. Conflitos de horário do mesmo responsável são bloqueados dentro da transação. Concluir ou cancelar preserva o histórico.

Cada responsável configura dias, horário e duração em **Disponibilidade para a Foundry**; começa desativada. O fuso das reservas automáticas é Brasília. A Foundry exige data completa e horário informados pelo cliente, recusa horários ocupados e só confirma após gravar a reserva. O laboratório continua sem agendar. Não há integração de videoconferência automática: informe o link no compromisso. Não há variável nova.

### Central e push — item 8

A migration `0013_notifications.sql` registra alertas duráveis de novos leads, atendimento humano, queda do WhatsApp e compromissos nos próximos 15 minutos. Heartbeat ausente por 90 segundos retira o estado conectado; a reconexão continua no worker. O sino mostra apenas notificações da pessoa autenticada.

Configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` para push. Gere um par próprio com `pnpm --filter @dcfoundry/api exec web-push generate-vapid-keys` no servidor e preserve a chave privada. O operador ativa notificações pelo sino e autoriza no navegador; a central funciona mesmo sem push. Requer HTTPS (localhost serve para desenvolvimento). Inscrições expiradas (404/410) são removidas, falhas têm até cinco tentativas e a carga contém somente avisos genéricos, sem nomes ou mensagens de clientes. Aceitação pelo provedor push não significa leitura. Sair da conta remove a inscrição deste navegador. Nenhuma porta nova é necessária.

### Chat do site e SLA humano — item 9

A migration `0014_website_chat_sla.sql` cria sessões e mensagens tipadas para visitantes. O site chama o CRM pelo backend; o navegador nunca recebe o segredo de integração. Configure no CRM `CRM_SITE_INGEST_TOKEN` (32 caracteres ou mais) e `CRM_SITE_OWNER_ID` com um usuário ativo. No Vercel do site, configure `CRM_CHAT_BACKEND_URL=https://SEU_CRM` e o mesmo `CRM_SITE_INGEST_TOKEN`. O adaptador mantém o mascote original e usa um cookie necessário HttpOnly, SameSite=Lax e Secure em produção, válido por 14 dias. Sem a URL, o provedor anterior do site continua em uso.

Ative **Foundry IA → Agente & laboratório → Ativar respostas no site**. A base e as orientações são as mesmas do WhatsApp; conhecimento interno não vai para visitantes. Abrir o widget não cria lead: a primeira mensagem cria o contato anônimo. A conversa fica em **Chat do site**, com atualização periódica e resposta humana que pausa a Foundry. Limpar o histórico encerra o link da conversa. Há limites por visitante, conversa, hora e tamanho; o histórico público é limitado. Imagens no adaptador orientam o envio pelo WhatsApp.

O painel mede ciclos de atendimento dos últimos 30 dias: primeira mensagem pendente até uma resposta humana efetivamente enviada. Respostas da Foundry, fila, falhas e mensagens históricas não encerram a espera. A meta vem do SLA da etapa do funil. A amostra tem limite de 10 mil mensagens e sinaliza quando o alcança. Uma mensagem recebida não é uma venda nem uma conversão comercial.

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

## Publicar no blog pelo CRM

1. Abra **Blog & conteúdo → Novo artigo**.
2. Preencha título, resumo e texto. O editor oferece títulos, negrito, listas e links; HTML digitado é tratado como texto.
3. Envie capa PNG/JPG/WebP de até 2 MB ou informe uma URL HTTPS e descreva a imagem.
4. Ajuste autor, categoria, tags e os campos de SEO. Salve o rascunho e abra **Prévia**.
5. Clique em **Publicar artigo** ou escolha um horário futuro e clique em **Agendar artigo**. O feed só expõe artigos publicados ou com agendamento vencido.

O feed fica em `https://SEU_CRM/api/blog/posts`; o detalhe em `/api/blog/posts/slug`. Arquivar ou voltar para rascunho retira o conteúdo do feed. URLs de artigos já publicados são preservadas. Alterações anteriores ficam em **Versões** e só substituem a atual após revisão e novo salvamento. Texto ainda não salvo pode ser recuperado na mesma aba e conta.

No projeto Vercel do site, configure `BLOG_BACKEND_URL=https://SEU_CRM` para o feed e o mesmo `BLOG_REVALIDATE_SECRET` do CRM. No VPS, configure `BLOG_SITE_WEBHOOK_URL=https://dcfoundrydigital.com/api/blog/revalidate`, `CRM_SITE_URL=https://dcfoundrydigital.com` e `API_URL=https://SEU_CRM`. O segredo deve ter pelo menos 32 caracteres. A fila persiste no PostgreSQL e tenta novamente a cada ciclo de 30 segundos com espera progressiva após falhas. Agendamentos são filtrados pelo relógio do banco; a notificação do site entra na fila para a data prevista. O cache público também se renova em até 60 segundos.

O site já possui sitemap, RSS, metadados de artigo e webhook de revalidação/IndexNow. A resposta da sincronização indica entrega ao site, não confirmação de indexação pelos buscadores. Nenhuma variável de produção ou origem do site foi alterada nesta revisão. A comunidade, comentários, curtidas e contas do blog legado continuam sendo uma integração independente; este feed cobre os artigos.

O volume `crm_uploads` preserva capas em `/data/uploads`. Faça backup desse volume e do PostgreSQL. Não limpe o volume durante um upgrade normal.

## Usar os demais módulos

- **Visão geral:** agenda com tarefas, prioridade, prazo, conclusão e reabertura. O Foundry considera registros reais disponíveis para seu perfil.
- **Funil & leads:** cadastre, busque, edite, avance, arquive e restaure contatos. Vincule um contato ao criar tarefas, propostas e cobranças.
- **Propostas & contratos:** cadastre escopo e condições, registre o andamento e imprima/salve PDF pelo navegador. Aceite é manual, sem assinatura eletrônica.
- **Financeiro:** cadastre cobranças, filtre recebidas/em aberto/vencidas e registre a baixa manual com data. Nenhuma transação financeira é executada.
- **WhatsApp:** prepare mensagens, use modelos com `{nome}` e `{empresa}` e abra o aplicativo. O envio final é feito por você. Pareamento automático continua dependendo do worker Baileys.
- **Marketing:** adicione métricas ou importe até 500 linhas CSV por lote. Baixe o modelo na tela. Conta, campanha e data identificam uma métrica; importar novamente atualiza o registro. O lote é transacional. O script futuro envia JSON para `/api/v1/integrations/ads/metrics` com Bearer `CRM_ADS_INGEST_TOKEN` e `ownerId` de um usuário ativo. CSV usa reais na coluna `cost`; JSON usa `costCents`.
- **Foundry IA:** cadastre conhecimento e orientações. Configure `GEMINI_API_KEY` no servidor; opcionalmente informe modelos em `GEMINI_MODELS`, separados por vírgula. Sem lista, o servidor descobre modelos de texto disponíveis na API. Uma falha pode tentar o modelo seguinte; ausência de chave ou erro do provedor é informado. O conteúdo enviado e a base autorizada são compartilhados com o provedor para a resposta. Não há garantia de gratuidade por nome de modelo.
- **Auditoria:** consulte histórico persistente, filtre por ação/pessoa, abra detalhes e exporte a página em CSV. Não há edição ou exclusão de registros pela tela.

## Atualizar uma instalação existente

Faça backup do PostgreSQL e do volume de imagens. Atualize o código, rode `db:migrate` e `db:seed`, reconstrua web/API e reinicie os serviços. A migração `0003_workspace_modules.sql` adiciona os módulos; não apaga os dados existentes. Não rode `db:reset-data` durante um upgrade comum. O seed continua sem inserir dados de negócio.

## Escopo funcional desta revisão

Todos os módulos de acompanhamento descritos acima têm ações persistentes. As conexões externas continuam exigindo os dados reais de configuração: Baileys pareado, chave Gemini, origem/feed do blog e script Ads. Pagamento efetivo e assinatura eletrônica permanecem fora do acompanhamento manual desta revisão.

O workflow está configurado para validar Docker, Caddy, migrações, persistência e reset com PostgreSQL descartável. O GitHub Actions estava bloqueado por cobrança da conta na revisão anterior. A suíte local inclui autenticação, permissões, CRUD, feed, versões, importação e reset com backup em PGlite. Docker/Compose e provedores reais exigem verificação após configuração. Nenhum banco de produção foi limpo; a prévia desta revisão usa um banco local separado.
