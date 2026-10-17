# Portabilidade DC Foundry Digital — verificação em 17/10/2026

## Entregas

| Item | Migration | Cobertura principal |
| --- | --- | --- |
| 1 | 0006 e 0016 | Baileys simulado, QR/código, restauração, backoff, logout, dono exclusivo, limite de envio, histórico e geração de sessão |
| 2 | 0007 | API → outbox → worker simulado → recibos, SSE real, anexos privados e fotos |
| 3 | 0008 | Base compartilhada, qualificação com evidência, handoff, pausa durante geração, laboratório isolado e dez modelos |
| 4 | 0009 | Sete etapas, configuração/versionamento, tags, anexos e arquivar/restaurar |
| 5 | 0010 | CPF/CNPJ, proposta aceita, contratos imutáveis, evidências de assinatura e SMTP simulado |
| 6 | 0011 | Portal isolado por contato, aceite de versão, revogação e linha do tempo |
| 7 | 0012 | Agenda com escopo, versões, conflitos e reserva pela Foundry após persistência |
| 8 | 0013 | Central, queda do WhatsApp, lembretes e push simulado com inscrições expiradas |
| 9 | 0014 | Chat anônimo, atendimento humano, base única e SLA que exclui Foundry/fila/falha |
| 10 | 0015 | CSV, atribuição/consentimento, Data Manager simulada, diagnóstico parcial, PWA e migração dos documentos genéricos |

O schema e a instrumentação da branch futura de uso da IA não são removidos. O teste de upgrade também preserva uma tabela ai_usage_events preexistente. A branch feat/ai-usage ainda não estava disponível no remoto durante esta verificação; sua integração continua independente.

## Verificações executadas

- Lint do CRM, typecheck dos pacotes e build de API, worker e web.
- Suíte de 69 testes, sem pulados, incluindo a integração PostgreSQL por socket em banco descartável *_ci.
- Upgrade de históricos para conversas tipadas, sem duplicar aliases nem perder a pausa da Foundry; mensagens novas também criam o vínculo nativo.
- Recuperação 515 sem perda das credenciais, logout 401 com novo QR, encerramento 440 sem disputa e reset restrito ao UUID.
- API → gerenciador de sessão → Baileys simulado → eventos → PostgreSQL, com QR protegido, código de pareamento, contatos por E.164/JID, limite 429 e rejeição de gerações antigas.
- Migração de todos os módulos/versões antigos para colunas nativas, incluindo mensagens de conversas.
- Login local de revisão, reunião fictícia, portal e solicitação em 320 px; agenda em 390 px sem overflow lateral.
- Formulário do site → lead do CRM; mensagem no site → Foundry; resposta humana no CRM → visitante, com pausa do agente.
- Console sem erros nas telas examinadas; Chrome sem erros de instalabilidade do PWA.
- Typecheck/build Next.js do adaptador do site; ícones PWA reutilizados da identidade original.
- Limites de memória e fronteira de portas do Compose validados por teste de configuração.

Os provedores foram simulados e os registros da revisão são fictícios. A referência Grupo YR permaneceu somente em leitura. Não foram limpos bancos de negócio nem enviadas mensagens reais. A limpeza com backup só foi executada no banco descartável de integração.

## O que exige a VPS

Docker não está instalado no computador da verificação; os containers não foram executados aqui. O deploy da VPS, pareamento de telefone, credenciais Gemini/SMTP/VAPID/OAuth e o recebimento real de dados continuam dependendo da configuração descrita em [VPS.md](VPS.md). Build e testes locais não comprovam essas conexões.

No site, o adaptador só usa o CRM quando CRM_CHAT_BACKEND_URL e o token privado forem configurados. Não aponta produção para o banco local de revisão. A fila offline começa desativada e em validação; nenhum resultado comercial real foi enviado ao Google.
