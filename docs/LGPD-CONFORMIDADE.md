# Manual de Conformidade LGPD e Segurança — DC Foundry Digital CRM

## 1. Proteção de Dados Sensíveis de Saúde (Art. 11 da LGPD)
- Dados clínicos do paciente (diagnóstico, mobilidade, prescrição de oxigênio, urgência de alta hospitalar) ficam isolados na tabela `patient_health_profiles`, criptografados em repouso na aplicação com **AES-256-GCM** (`encryptSensitiveField`) antes de persistir no PostgreSQL.
- Credenciais de sessão do `@whiskeysockets/baileys` (`whatsapp_auth_credentials`) também são criptografadas com **AES-256-GCM** no PostgreSQL, eliminando pastas locais vulneráveis em disco.

## 2. Minimização de Dados Enviados ao LLM (Art. 6º, III da LGPD)
- Todo texto recebido via WhatsApp passa pelo filtro `maskPiiForLlm()` antes de ser enviado ao provedor de IA (Gemini / Ollama), mascarando CPF, CNPJ, telefone e e-mail.
- O cliente recebe aviso transparente no primeiro contato automatizado informando que interage com o assistente virtual do **DC Foundry Digital CRM** e que pode solicitar atendente humano a qualquer momento.

## 3. Aviso sobre WhatsApp (Baileys vs Cloud API Oficial)
- O `@whiskeysockets/baileys` opera sobre o protocolo Web multi-dispositivo (não oficial), sujeito a risco de desconexão ou bloqueio pelo WhatsApp caso utilizado para disparos massivos não solicitados.
- A coluna `provider_type` (`baileys` | `cloud_api`) na tabela `whatsapp_sessions` abstrai o adaptador de envio/recebimento para permitir migração transparente para a **WhatsApp Cloud API oficial (Meta)** sem alterar regras de negócio, IA ou Inbox.
