# DC Foundry Digital CRM — VPS de 4 GB

## Estado e recursos

Os itens 1 a 10 usam migrations 0006–0015, tabelas PostgreSQL com colunas específicas, versões e auditoria. As antigas tabelas genéricas de documentos foram migradas; `workspace_documents` e `workspace_document_versions` agora são **views de leitura**, sem armazenamento JSON de registros. Conversas internas têm mensagens em tabelas filhas. Faça backup antes de migrar uma instalação existente. Migrations anteriores não devem ser editadas.

Continuam os sete papéis e os escopos próprio/equipe/todos. A integração autenticada de métricas Ads permanece em `POST /api/v1/integrations/ads/metrics`. A migration não remove nem renomeia `ai_usage_events`; preserve a aba e a instrumentação de `feat/ai-usage` quando essa branch for integrada. O reset preserva essa tabela, caso exista.

O Compose limita PostgreSQL a 512 MB, Redis a 128 MB, API a 384 MB, worker a **384 MB** e Caddy a 96 MB: 1.504 MB no total. API e worker usam heap de 256 MB. Não há portas novas. PostgreSQL/Redis/API continuam em loopback; Caddy usa as portas 80/443 já previstas. O outro CRM deve ter seus próprios containers, volumes e credenciais. Se suas portas do host já estiverem ocupadas, ajuste apenas o mapeamento existente antes de iniciar, sem expor banco ou Redis publicamente.

A suíte usa Baileys, Gemini, SMTP, push e Google simulados. Ela não confirma pareamento, cota, entregas reais, credenciais ou deploy no seu VPS.

## Instalação limpa

Requisitos: Docker/Compose, Node 22 atualizado, Corepack/pnpm 10.6, domínio do CRM com DNS para a VPS. O domínio público do site continua sendo dcfoundrydigital.com; use um subdomínio próprio para o CRM.

1. Copie `.env.example` para `.env`, fora do Git. Preencha os valores básicos da tabela abaixo.
2. Na raiz do repositório:

```sh
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @dcfoundry/web build
docker compose --env-file .env -f infra/docker-compose.yml up -d postgres redis
docker compose --env-file .env -f infra/docker-compose.yml build api worker
docker compose --env-file .env -f infra/docker-compose.yml run --rm api node --import tsx packages/db/src/migrate.ts
docker compose --env-file .env -f infra/docker-compose.yml run --rm api node --import tsx packages/db/src/seed.ts
docker compose --env-file .env -f infra/docker-compose.yml run --rm api node --import tsx apps/api/src/bootstrap-admin.ts
docker compose --env-file .env -f infra/docker-compose.yml --profile whatsapp up -d api worker caddy
```

O seed cria os papéis e o funil com sete etapas, sem clientes, campanhas, contratos ou posts fictícios. O administrador é criado separadamente. Remova `CRM_ADMIN_PASSWORD` do ambiente depois do bootstrap. A senha não é impressa nem sobrescreve uma conta existente.

Verifique `docker compose --env-file .env -f infra/docker-compose.yml ps`, `docker stats`, a saúde `https://SEU_CRM/api/v1/health` e o login pelo domínio. A sessão JWT dura 15 minutos e fica em memória no navegador; entre novamente quando expirar.

## Variáveis para configurar na VPS

Valores vazios em `.env.example` são intencionais. Não coloque segredos em `NEXT_PUBLIC_*`, no Git, no navegador ou em capturas de tela.

| Grupo | Variáveis | Como configurar |
| --- | --- | --- |
| Origem | `CRM_DOMAIN`, `WEB_URL`, `API_URL`, `PORT=4000` | Domínio do CRM, origens HTTPS e porta interna. `CRM_DOMAIN` não inclui protocolo. |
| Proxy | `CRM_TRUST_PROXY=1` | Somente com a API atrás do único Caddy previsto; necessário para evidência correta do IP. |
| PostgreSQL | `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `CRM_DB_POOL_SIZE=10` | URI com host `postgres` no Compose, senha própria e caracteres especiais codificados. Não configure fallback para outro CRM. |
| Autenticação | `JWT_ACCESS_SECRET`, `ENCRYPTION_MASTER_KEY_HEX` | Segredos diferentes: JWT com 64+ caracteres e chave AES com 32 bytes em hexadecimal. Gere cada um separadamente, por exemplo com `openssl rand -hex 32`. Preserve a chave AES junto aos backups. |
| Administrador inicial | `CRM_ADMIN_EMAIL`, `CRM_ADMIN_NAME`, `CRM_ADMIN_PASSWORD` | Senha com 12+ caracteres; remover após criar a conta. |
| Redis e WhatsApp | `REDIS_URL=redis://redis:6379`, `WHATSAPP_SESSION_DIR=/data/whatsapp`, `WHATSAPP_MAX_SESSIONS=1` | Worker usa filas Redis e uma sessão por padrão. |
| Arquivos | `CRM_UPLOAD_DIR=/data/uploads` | Mesmo volume na API e no worker. |
| Foundry | `GEMINI_API_KEY`, `GEMINI_MODELS` | Somente no servidor. Até dez IDs separados por vírgula; sem lista, há descoberta de modelos disponíveis. |
| E-mail | `SMTP_HOST`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | 465 usa TLS implícito; outras portas exigem STARTTLS. Remetente autorizado no provedor. |
| Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Gere par próprio com `pnpm --filter @dcfoundry/api exec web-push generate-vapid-keys`. Subject: seu contato mailto ou HTTPS. |
| Site → CRM | `CRM_SITE_INGEST_TOKEN`, `CRM_SITE_OWNER_ID`, `CRM_SITE_URL=https://dcfoundrydigital.com` | Token com 32+ caracteres e UUID de usuário ativo responsável pelos contatos. Token usado pelo backend do site. |
| Métricas Ads | `CRM_ADS_INGEST_TOKEN` | Token com 32+ caracteres para o script futuro; não é o OAuth das conversões. |
| Blog | `BLOG_SITE_WEBHOOK_URL=https://dcfoundrydigital.com/api/blog/revalidate`, `BLOG_REVALIDATE_SECRET` | Mesmo segredo no site e CRM, com 32+ caracteres. |
| Conversões offline | `CRM_ADS_OFFLINE_ENABLED=false`, `CRM_ADS_VALIDATE_ONLY=true` | Começam desativadas e em validação, sem registrar conversões comerciais reais. |
| Conta/destinos de conversão | `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, `GOOGLE_ADS_PROPOSAL_ACTION_ID`, `GOOGLE_ADS_PAYMENT_ACTION_ID` | IDs de conta com dez dígitos, sem hífens, e IDs das ações UPLOAD_CLICKS já criadas/configuradas por você. |
| OAuth Data Manager | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` | Projeto Google Cloud com Data Manager API habilitada e autorização no escopo `https://www.googleapis.com/auth/datamanager`. Conta com acesso ao destino. |

As variáveis introduzidas nesta portabilidade são as de sessões/arquivos, proxy, SMTP e conversões offline. As chaves Gemini, VAPID e tokens de site/Ads/blog já previstos continuam sendo necessários para cada integração.

## Conectar o site na Vercel

No projeto do **site**, configure:

- `CRM_CHAT_BACKEND_URL=https://SEU_CRM` e `CRM_SITE_INGEST_TOKEN` igual ao da VPS: chat e formulário de contato.
- `BLOG_BACKEND_URL=https://SEU_CRM` e `BLOG_REVALIDATE_SECRET` igual ao da VPS: blog, revalidação e descoberta.
- As origens devem ser HTTPS. Nenhum token pode ter prefixo `NEXT_PUBLIC_`.

O adaptador do site mantém o Foundry original. Sem `CRM_CHAT_BACKEND_URL`, o provedor anterior continua sendo usado. Após configurar, valide o fluxo completo com um contato de teste identificado: formulário/chat → lead no CRM → resposta humana de volta ao chat. Não basta verificar HTTP 200. A primeira mensagem do visitante cria o lead; abrir o widget e receber saudação não cria lead. O cookie necessário do chat é HttpOnly, SameSite=Lax e Secure em produção, com validade de 14 dias. Limpar o histórico encerra o link de conversa.

UTMs são capturadas da URL do formulário/chat. O GCLID só é enviado à integração quando a opção de medição da campanha foi autorizada. Recusa não impede o atendimento. Não há inferência de venda a partir de clique, mensagem ou visita.

## WhatsApp, mídia e recuperação — itens 1 e 2

Abra **WhatsApp → Conectar** e escolha QR code ou código de pareamento. No telefone, use **Aparelhos conectados**. O código pede telefone E.164 com + e DDI; QR e código expiram na API após 60 segundos e só aparecem para quem tem permissão de gerenciar a sessão.

A sessão fica no volume `whatsapp_sessions`, montado **somente no worker** em `/data/whatsapp`. Preserve esse volume; não use `docker compose down -v` ao atualizar. Reinício restaura sessões habilitadas e tenta reconectar com espera progressiva. Desconectar pausa sem apagar as credenciais; para revogar o dispositivo, use o telefone. Trocar de provedor invalida a geração anterior e limpa códigos/status; não mantém `connected_meta`. A seleção Meta apenas desliga Baileys, não implementa uma integração Meta.

O histórico chega em lotes limitados, sem cópia completa na RAM. Por padrão só associa contatos conhecidos. A opção de criar contatos históricos é explícita. Um LID sem telefone não vira número. Contatos são encontrados por telefone E.164/JID dentro do escopo. A cobertura depende do telefone; porcentagem do provedor não garante todo o histórico. Sincronizar solicita até 50 mensagens anteriores.

O chat permite texto, emoji, imagem, áudio e documento de até 16 MB. Mostra fila, envio, entrega e leitura separadamente. Outbox PostgreSQL retoma comandos após queda do Redis e IDs evitam duplicação. SSE exige autenticação; mensagens, anexos e fotos respeitam o escopo do lead. Fotos são consultadas na sessão ativa com cache limitado em memória por geração; foto privada usa iniciais. Arquivos ficam em `crm_uploads`, não são servidos diretamente pelo Caddy e exigem autorização em cada leitura. Mídia histórica não é baixada automaticamente.

## Uma Foundry IA — item 3

Em **Foundry IA → Base de conhecimento**, cadastre fatos reais sobre os serviços. Público `public` pode ser usado com visitantes/clientes; `internal` fica no chat da equipe. **Orientações** define tom e procedimento para a mesma IA no chat interno, site e WhatsApp.

Teste os cenários em **Agente & laboratório**, depois ative cada canal. Começam desativados. O laboratório nunca envia mensagens, agenda ou modifica leads reais. Os modelos são tentados em fallback, sem nomes repetidos, até dez entradas. Disponibilidade e cota são do Google; nenhum nome implica gratuidade ou acesso garantido.

A Foundry qualifica tipo de projeto, objetivo, orçamento informado, prazo, decisão e urgência com evidência na mensagem. Não inventa preço, prazo ou resultado. Solicitação de pessoa humana, informação sem base ou falha do provedor encaminha e pausa. Mensagens históricas não acionam respostas. O resumo está na ficha e em `POST /api/v1/leads/:id/ai-summary`.

Assumir atendimento ou enviar resposta humana pausa o contato e invalida respostas pendentes. Retomar exige a revisão atual. O worker verifica o controle no Redis antes do envio. Uma entrega já iniciada no provedor não pode ser desfeita. Sem heartbeat da API, a chave global da automação expira.

## Funil, anexos e tags — item 4

Padrão: Novo, Qualificado, Reunião, Proposta, Negociação, Ganho e Perdido. Quem tem `pipeline:manage` configura nomes, ordem, cores, SLA e marcadores de ganho/perda. Há controle de versão; uma etapa usada por lead ativo ou arquivado não pode ser removida.

Arraste cards no computador ou escolha a etapa na ficha pelo celular. Tags e anexos permanecem ao arquivar/restaurar. Arquivamento pausa a Foundry. Anexos têm limite de 16 MB, hash SHA-256 e acesso autorizado.

## Identidade e contratos — item 5

Em **Configurações**, preencha nome, documento, endereço, e-mail, telefone e representante da contratada. CPF é aceito; CNPJ numérico ou alfanumérico também. Não há obrigação de CNPJ. Documentos e tokens sensíveis são criptografados com a chave AES. Não há exigência de nota fiscal de pessoa jurídica; cobranças têm campo opcional de recibo.

Na proposta versionada, preencha cliente PF/PJ, documento, endereço, serviço, escopo, valor e pagamento. Após aceitar, gere o contrato da versão exata. Valor, entrada e parcelamento vêm da proposta aceita. Modelos: site/landing page, sistema/app, tráfego/marketing e manutenção/suporte. Todos começam com **modelo, revisar com advogado**. Revise cláusulas, exclusões, entregáveis, revisões, terceiros, garantia/SLA e condições antes de enviar.

Contrato emitido tem texto imutável e SHA-256. Mudança comercial exige revisão da proposta e novo contrato. Link de assinatura dura sete dias e pode ser renovado por pessoa autorizada. Cliente e contratada assinam separadamente com consentimento, nome e documento; evidências incluem IP, UTC, hash do documento e hash de evidência. O mecanismo não certifica identidade civil. Envio por SMTP ou WhatsApp exige ação explícita. SMTP aceito não é entrega nem leitura. Não use um link real para teste de assinatura.

Referências de validação e contexto: [Receita — dígito verificador do CNPJ](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf), [MP 2.200-2](https://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm), [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm).

## Portal, solicitações e agenda — itens 6 e 7

A emissão do portal completo exige acesso a todos os documentos comerciais, financeiros e de atendimento (nos papéis atuais, administração/gestão). Outros perfis continuam com as solicitações permitidas, sem usar um link público para ampliar seu acesso financeiro.

Em **Portal & solicitações**, escolha o lead e gere um link pessoal de 30 dias. Exibe somente propostas enviadas, contratos, cobranças/recibos e solicitações daquele contato. O cliente aceita a versão enviada, abre ajustes/suporte/manutenção e responde pela linha do tempo. A equipe muda status com controle de versão. Revogar bloqueia novos acessos.

**Agenda & tarefas** mantém tarefas e acrescenta eventos, reuniões e follow-ups vinculados ao lead. Reservas do mesmo responsável não podem se sobrepor. Editar, concluir ou cancelar mantém versões. Em **Disponibilidade para a Foundry**, configure dias, horários e duração; começa desativada, com fuso de Brasília. A IA só agenda data/hora explicitamente pedidas, dentro da disponibilidade e sem conflito; só confirma após persistir. Cadastre o link de videoconferência manualmente quando necessário.

## Notificações e SLA humano — itens 8 e 9

O sino traz novos leads, atendimento humano, WhatsApp desconectado e reuniões nos próximos 15 minutos. Heartbeat ausente por 90 segundos retira o estado conectado; o worker tenta reconectar. A central mostra apenas alertas da pessoa autenticada.

Push é opcional: ative pelo sino e autorize no navegador. HTTPS é obrigatório fora de localhost. Inscrições 404/410 são removidas; falhas têm até cinco tentativas. A carga traz avisos genéricos sem nomes ou mensagens de clientes. Sair da conta remove a inscrição do navegador. [Referência Web Push](https://github.com/web-push-libs/web-push).

O painel mede ciclos dos últimos 30 dias: primeira entrada pendente até uma resposta **humana enviada**. Foundry, fila, falha e histórico não encerram a espera. Meta vem do SLA da etapa. Mostra mediana, percentil 90, espera e atrasos. Até 10 mil mensagens, com sinalização de amostra limitada. Conversas do site ficam em **Chat do site**, com resposta humana e controle da Foundry.

## Importação, atribuição, Ads e PWA — item 10

**Funil → Importar CSV** aceita até 500 linhas/1 MB e aspas, separadores vírgula/ponto e vírgula e campos com múltiplas linhas. Cabeçalhos obrigatórios: nome, empresa, telefone. Há prévia, erros por linha e confirmação; arquivo alterado exige nova prévia. Telefone é normalizado e contatos existentes no escopo são preservados. Repetir o mesmo lote não duplica. Opcionais e exemplo estão na tela.

A ficha mantém UTM/GCLID e escolha de consentimento, com versão e auditoria. Atualizar a ficha comum não apaga a atribuição. Dados de formulário e chat podem trazer o objeto `attribution` validado. GCLID não é retido pela nova captura sem concessão.

**Marketing & Ads** recebe métricas pelo endpoint autenticado existente; nenhum script altera campanhas ou orçamento. Para conversões offline, selecione proposta aceita ou pagamento confirmado, informe a data/hora real e confirme a evidência. IDs de transação evitam duplicação. Não há upload automático por clique ou estágio do funil.

O envio usa **Data Manager API**, indicada para novas integrações. OAuth precisa do escopo datamanager e acesso ao destino. Comece com `CRM_ADS_OFFLINE_ENABLED=true` e `CRM_ADS_VALIDATE_ONLY=true` após configurar credenciais: apenas valida. Para enviar de fato, altere o modo no servidor e confirme o envio comercial na tela. Consentimento concedido é conferido novamente antes do transporte. Não são enviados CPF, nomes, e-mails ou telefones: o payload usa GCLID, valor, data e identificador de transação.

A fila distingue validação, aceite do provedor, processamento, rejeição e falha parcial. Diagnóstico começa após 30 minutos, com espera progressiva; pode levar até 24 horas. Aceitação HTTP não comprova atribuição em anúncios. [Importar com Data Manager](https://developers.google.com/data-manager/api/devguides/events/google-ads/offline), [diagnósticos](https://developers.google.com/data-manager/api/devguides/diagnostics). A restrição atual do endpoint legado está na [documentação do Google Ads](https://developers.google.com/google-ads/api/docs/conversions/upload-offline).

O CRM é instalável quando o navegador oferece a opção de app. O service worker guarda somente ícones, fonte e página offline genérica. **Não guarda APIs, contratos, portais ou dados autenticados.** Sem internet não salva alterações. Push e instalação não exigem portas novas.

## Blog e indexação

Em **Blog & conteúdo → Novo artigo**, salve o rascunho, revise a prévia e publique ou agende. Há editor, capa PNG/JPG/WebP até 2 MB, texto alternativo, autor, categoria, tags, SEO e versões. Arquivar/voltar a rascunho retira do feed. URL já publicada é preservada.

Feed: `/api/blog/posts`; detalhe: `/api/blog/posts/slug`. O outbox persiste e repete notificações ao webhook do site após falhas. Artigos agendados entram conforme o relógio do banco. Revalidação entregue ao site não confirma indexação por buscador. O site mantém sitemap, RSS, metadados e integração de revalidação/IndexNow. Comunidade, comentários e contas do blog legado continuam independentes desse feed.

## Atualização, backup e recuperação

Faça backup do PostgreSQL e dos volumes `whatsapp_sessions` e `crm_uploads`, guardando também a chave AES de modo privado. Atualize a main, instale dependências, compile o web, rode migrations e seed e reconstrua/reinicie API e worker. Não execute reset durante upgrade comum.

Para limpar **somente esta instalação**, o comando exige nome exato do banco e confirmação explícita e salva backup antes da transação. Preserva usuários, papéis, sessões, configurações e a tabela de uso da IA, caso exista:

```sh
docker compose --env-file .env -f infra/docker-compose.yml run --rm \
  -v "$PWD/backups:/backups" -e CRM_BACKUP_DIRECTORY=/backups \
  api node --import tsx packages/db/src/reset-data.ts \
  --database dcfoundry_crm --confirm-clear-business-data
```

O backup contém dados privados, fica fora do Git e deve ter acesso restrito. Não há CASCADE: dependência inesperada aborta a limpeza. O banco do Grupo YR não participa de nenhum comando desta instalação.

## Verificação antes de produção

```sh
corepack pnpm lint
corepack pnpm -r run typecheck
corepack pnpm -r run build
corepack pnpm test
```

O teste PostgreSQL por socket exige `CRM_TEST_DATABASE_URL` apontando para um banco **descartável com sufixo _ci** já migrado/seedado; nunca use banco de negócio. Demais integrações usam PostgreSQL WASM isolado, sem ler DATABASE_URL. Em produção, confirme pareamento real, envio/recebimento, mídia, histórico, handoff, reservas, contrato de teste, push autorizado e integração do site. Não marque esses passos como feitos só porque a build passou.
