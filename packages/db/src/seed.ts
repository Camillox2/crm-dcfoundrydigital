import { createDatabaseConnection } from './client.js';
import { roles, products, equipmentUnits, pipelines, pipelineStages } from './schema.js';
import { INITIAL_ROLES_SEED, INITIAL_EQUIPMENT_CATALOG_SEED } from './index.js';

async function runSeed() {
  console.log('🌱 Iniciando seed do DC Foundry Digital CRM...');
  const { db, pool, activeTarget } = await createDatabaseConnection();
  console.log(`📡 Conectado ao banco (${activeTarget})`);

  try {
    for (const r of INITIAL_ROLES_SEED) {
      await db
        .insert(roles)
        .values(r)
        .onConflictDoNothing({ target: roles.slug });
    }

    const [rentalPipeline] = await db
      .insert(pipelines)
      .values({
        name: 'Locação Home Care',
        slug: 'locacao-home-care',
        isDefault: true,
      })
      .returning();

    if (rentalPipeline) {
      await db.insert(pipelineStages).values([
        { pipelineId: rentalPipeline.id, name: 'Novo Contato (WhatsApp/Ads)', position: 1, slaMinutes: 10, colorHex: '#1D5FAE' },
        { pipelineId: rentalPipeline.id, name: 'Qualificado pela IA', position: 2, slaMinutes: 20, colorHex: '#12847B' },
        { pipelineId: rentalPipeline.id, name: 'Orçamento Enviado', position: 3, slaMinutes: 60, colorHex: '#1A4D85' },
        { pipelineId: rentalPipeline.id, name: 'Aguardando Assinatura', position: 4, slaMinutes: 120, colorHex: '#0F766E' },
        { pipelineId: rentalPipeline.id, name: 'Contrato Ativo / Entregue', position: 5, slaMinutes: 0, colorHex: '#0F766E', isWon: true },
      ]);
    }

    for (const item of INITIAL_EQUIPMENT_CATALOG_SEED) {
      const [insertedProduct] = await db
        .insert(products)
        .values({
          sku: item.sku,
          name: item.name,
          category: item.category,
          salePriceCents: item.salePriceCents,
          dailyRentalCents: item.dailyRentalCents,
          weeklyRentalCents: item.weeklyRentalCents,
          monthlyRentalCents: item.monthlyRentalCents,
          depositCautionCents: item.depositCautionCents,
        })
        .onConflictDoNothing({ target: products.sku })
        .returning();

      if (insertedProduct) {
        for (const unit of item.units) {
          await db
            .insert(equipmentUnits)
            .values({
              productId: insertedProduct.id,
              serialNumber: unit.serialNumber,
              assetTag: unit.assetTag,
              status: unit.status,
            })
            .onConflictDoNothing({ target: equipmentUnits.serialNumber });
        }
      }
    }

    console.log('✅ Seed concluído com sucesso!');
  } finally {
    await pool.end();
  }
}

runSeed().catch((err) => {
  console.error('❌ Erro ao executar seed:', err);
  process.exit(1);
});
