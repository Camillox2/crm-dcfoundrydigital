# Portabilidade para agência e software house

Repositório de referência consultado somente em leitura. Nenhuma sessão, banco ou serviço da referência foi alterado.

1. WhatsApp: implementado — sessão persistente, QR/código, reconexão, histórico limitado, identidade por E.164/JID, outbox Redis e escopos. Testes unitários e PostgreSQL descartável passaram. Pareamento real depende do telefone na VPS.
2. Chat e mídia: implementado — envio idempotente, mídia privada em volume, emojis, recibos, SSE autenticado e fotos com cache em memória. Teste percorre API, outbox, Baileys simulado e confirmação de envio; conexão SSE real em loopback também verificada.
3. Foundry compartilhada, qualificação, resumo e laboratório: núcleo implementado e testado — base e orientações tipadas com versões, fatos com evidências, pausa por contato, controle da entrega pelo Redis, encaminhamento e até dez modelos. A integração de horários e confirmação da reunião será concluída no item 7.
4. Kanban configurável, tags e anexos: em implementação.
5. Configurações PF/PJ e contratos de serviços assináveis: pendente.
6. Portal e solicitações: pendente.
7. Agenda e reuniões: pendente.
8. Notificações e push: pendente.
9. SLA humano e chat do site: pendente.
10. Importação, atribuição, conversões offline e PWA: pendente.

Nenhum teste automatizado usa Baileys ou Gemini reais. Não há autorização implícita para enviar mensagens de teste a clientes. A branch `feat/ai-usage` ainda não está disponível no remote consultado; nenhum recurso de uso da IA foi removido. Antes de cada push, verificar alterações concorrentes na main.
