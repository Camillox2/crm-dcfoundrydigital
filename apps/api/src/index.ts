import { buildApiServer } from './app.js';

async function start() {
  const { app } = await buildApiServer();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`🚀 DC Foundry Digital CRM API rodando em http://localhost:${port}`);
}

start().catch((err) => {
  console.error('Erro fatal ao iniciar API:', err);
  process.exit(1);
});
