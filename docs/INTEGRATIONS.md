# Site, CRM, blog e aquisição

Esta versão prepara o CRM para o VPS. A configuração de um receptor não instala um coletor no site. As conexões precisam ser configuradas nos dois servidores antes de exibir tráfego real ou receber formulários.

## Operação no CRM

- **Visão geral:** novas oportunidades e comparação com período anterior, pipeline atual, recebimentos, tarefas e pendências.
- **Relatórios & gráficos:** 7, 30 e 90 dias, séries diárias, distribuição do funil, origem informada, caixa, posição das cobranças, campanhas, calendário editorial e eventos de páginas. CSV e tabelas com valores exatos.
- **Projetos & entregas:** contato vinculado, cliente, etapa, datas, orçamento, progresso, stack, escopo, link, observações, versões e arquivamento.
- **Agenda & tarefas:** calendário mensal, filtro por dia/estado, tarefas atrasadas, conclusão e reabertura.
- **Site & SEO:** conexões, destinos por serviço, gerador de UTM, acesso a sitemap/robots/llms, verificação HTTP sob demanda e fila editorial.
- **Blog:** modelos de case/guia/checklist, filtros de estado e categoria, revisão de preparação editorial, campos SEO, upload, prévia, publicação e agendamento.

Os relatórios respeitam as permissões existentes e o escopo próprio/equipe/todos. Projetos usam as permissões de tarefas. Valores de posição atual são rotulados e não viram histórico de conversão. Recebimentos são registros manuais; o CRM não executa pagamentos. O limite de leitura analítica é de 10 mil registros por fonte; a interface avisa quando o resultado for parcial.

## 1. Blog do CRM no site

O feed público existente continua em `GET /api/blog/posts` e `GET /api/blog/posts/:slug`. O site deve apontar sua origem de conteúdo para o domínio HTTPS da API do CRM.

Configure `CRM_SITE_URL`, `BLOG_SITE_WEBHOOK_URL` e `BLOG_REVALIDATE_SECRET`. O segredo do webhook deve corresponder ao configurado no site. O CRM mantém uma fila persistente de atualização e novas tentativas. A ação **Reprocessar fila do blog** permite solicitar nova tentativa manualmente. O estado **Site atualizado** confirma a entrega do webhook, não a indexação.

As publicações entram no feed e podem ser incluídas no sitemap do site. IndexNow e os rastreadores decidem quando indexar. Não é necessário nem correto marcar um artigo como indexado só porque foi publicado.

## 2. Eventos do site

No `.env` do CRM, configure:

```dotenv
CRM_SITE_INGEST_TOKEN=SEU_TOKEN_ALEATORIO_DE_PELO_MENOS_32_CARACTERES
CRM_SITE_OWNER_ID=UUID_DO_USUARIO_RESPONSAVEL
```

O responsável precisa existir e estar ativo. Guarde o mesmo token **somente no backend do site**, nunca em variáveis `NEXT_PUBLIC_*`, JavaScript público ou links. O receptor não aceita credenciais no corpo nem IDs de responsáveis enviados pelo visitante.

O backend do site envia lotes de até 100 eventos:

```http
POST /api/v1/integrations/site/events
Authorization: Bearer TOKEN_CONFIGURADO
Content-Type: application/json
```

```json
{
  "items": [{
    "id": "UUID_UNICO_DO_EVENTO",
    "event": "page_view",
    "path": "/criacao-de-sites-curitiba",
    "source": "google",
    "medium": "cpc",
    "campaign": "sites-curitiba",
    "occurredAt": "DATA_HORA_ISO_UTC"
  }]
}
```

Use um UUID por evento e preserve o mesmo UUID nas tentativas seguintes. O receptor devolve `accepted` e `duplicates`. Aceita eventos dos últimos 90 dias e tolera até cinco minutos de diferença de relógio.

O caminho não aceita query string. Não envie telefone, e-mail, nomes, textos de mensagens ou campos do formulário como eventos. Envie apenas parâmetros de campanha previamente higienizados. Os campos desconhecidos são descartados.

Nomes reconhecidos nos indicadores:

| Indicador | Evento |
| --- | --- |
| Visualizações | `page_view` |
| Cliques de contato | nomes contendo `whatsapp`, ou `phone_click` / `contact_click` |
| Briefing concluído | `project_builder_submit` ou `project_studio_complete` |

São contagens de eventos recebidos, sem medir visitantes únicos. Cliques não confirmam conversa ou venda. Dias sem eventos não comprovam falta de visitas. O site precisa respeitar a preferência de privacidade do visitante e manter separadas a coleta operacional e as tags já existentes.

## 3. Formulários e briefing → oportunidade

O backend do site pode encaminhar um formulário validado para:

```http
POST /api/v1/integrations/site/leads
Authorization: Bearer TOKEN_CONFIGURADO
Content-Type: application/json
```

```json
{
  "id": "UUID_ESTAVEL_DO_ENVIO",
  "lead": {
    "name": "NOME_INFORMADO_PELO_CONTATO",
    "company": "EMPRESA_INFORMADA",
    "phone": "TELEFONE_INFORMADO",
    "scopeSummary": "RESUMO_DO_BRIEFING",
    "modality": "Projeto Fechado",
    "monthlyValue": 0,
    "campaign": "ORIGEM_OU_UTM_CAMPAIGN",
    "notes": "OBSERVACOES_FORNECIDAS",
    "highPriority": false
  }
}
```

O contrato é o mesmo do cadastro de contatos. Um envio novo retorna `201` com `id` da oportunidade e `duplicate: false`. Repetir o mesmo UUID retorna a oportunidade existente com `duplicate: true`. A criação e a confirmação do recebimento são transacionais.

O site deve gerar o UUID uma vez por envio, validar o formulário, usar as proteções de abuso já existentes, encaminhar pelo servidor e manter fila/repetição em caso de falha. Confirme a gravação antes de informar que o CRM recebeu. O WhatsApp continua disponível como alternativa de contato.

## 4. Google Ads

O script será configurado depois, conforme solicitado. O endpoint existente é `POST /api/v1/integrations/ads/metrics`, com `CRM_ADS_INGEST_TOKEN`. CSV e cadastro manual já podem alimentar os gráficos. Os valores do endpoint são em centavos; o CSV usa reais.

CTR = cliques ÷ impressões. CPC = investimento ÷ cliques. CPA = investimento ÷ conversões informadas. Sem denominador, a interface exibe `—`. Dias sem métricas aparecem como lacunas; valores zero recebidos continuam zero. As campanhas são agrupadas por conta e ID. Não há ROAS calculado sem atribuição comprovada de receita.

O gerador de UTM produz URLs para usar em campanhas, e-mails e redes sociais. Gerar um link não altera anúncios nem confirma a instalação do coletor.

## Atualizar uma instalação existente

Faça o backup normal da instalação e execute o comando de migração descrito em `VPS.md` antes de reiniciar a API. As migrações 0004/0005 adicionam projetos, origem de contatos, eventos e recibos de integração. Não apagam dados. O seed continua somente com configuração.

Não copie o banco usado na revisão local para produção. Os registros de revisão e as capturas ficam fora do repositório.
