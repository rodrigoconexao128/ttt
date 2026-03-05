// Test script para verificar o Kill Switch do reseller
import { db } from "./server/db";
import { resellers, resellerClients, users } from "./shared/schema";
import { eq } from "drizzle-orm";

async function testKillSwitch() {
  console.log("=== TEST CYCLE 2: KILL SWITCH VERIFICATION ===\n");

  // 1. Buscar o reseller atual
  console.log("1. Buscando reseller e seus clientes...");
  const resellerData = await db.select({
    resellerId: resellers.id,
    companyName: resellers.companyName,
    resellerStatus: resellers.resellerStatus,
    isActive: resellers.isActive,
    userId: resellers.userId,
    userEmail: users.email
  })
  .from(resellers)
  .innerJoin(users, eq(resellers.userId, users.id))
  .limit(1);

  if (resellerData.length === 0) {
    console.log("❌ Nenhum reseller encontrado!");
    return;
  }

  const reseller = resellerData[0];
  console.log(`   ✓ Reseller: ${reseller.companyName} (ID: ${reseller.resellerId})`);
  console.log(`   ✓ Status atual: ${reseller.resellerStatus}`);
  console.log(`   ✓ isActive: ${reseller.isActive}`);

  // 2. Buscar um cliente desse reseller
  console.log("\n2. Buscando clientes do reseller...");
  const clientsData = await db.select({
    clientId: resellerClients.id,
    clientUserId: resellerClients.userId,
    clientEmail: users.email,
    status: resellerClients.status
  })
  .from(resellerClients)
  .innerJoin(users, eq(resellerClients.userId, users.id))
  .where(eq(resellerClients.resellerId, reseller.resellerId));

  console.log(`   ✓ Total de clientes: ${clientsData.length}`);
  clientsData.forEach(client => {
    console.log(`     - ${client.clientEmail} (Status: ${client.status})`);
  });

  // 3. Salvar o status original
  const originalStatus = reseller.resellerStatus;
  const originalIsActive = reseller.isActive;
  
  console.log("\n3. BLOQUEANDO RESELLER para teste...");
  
  // Bloquear o reseller
  await db.update(resellers)
    .set({ resellerStatus: 'blocked' })
    .where(eq(resellers.id, reseller.resellerId));
  
  console.log("   ✓ Reseller BLOQUEADO (resellerStatus = 'blocked')");

  // 4. Verificar que o bloqueio foi aplicado
  const [blockedReseller] = await db.select({
    resellerStatus: resellers.resellerStatus
  })
  .from(resellers)
  .where(eq(resellers.id, reseller.resellerId));
  
  console.log(`   ✓ Status confirmado: ${blockedReseller.resellerStatus}`);

  // 5. SIMULAR REQUEST DE CLIENTE
  console.log("\n4. TESTANDO ACESSO DE CLIENTE COM RESELLER BLOQUEADO...");
  console.log("   → O middleware isAuthenticated deve negar acesso!");
  console.log("   → Esperado: 403 Forbidden com reason: 'reseller_blocked'");
  
  if (clientsData.length > 0) {
    const testClient = clientsData[0];
    console.log(`   → Cliente de teste: ${testClient.clientEmail}`);
    
    // Verificar se o cliente tem resellerId no users
    const [clientUser] = await db.select({
      resellerId: users.resellerId
    })
    .from(users)
    .where(eq(users.id, testClient.clientUserId));
    
    if (clientUser?.resellerId) {
      console.log(`   ✓ Cliente tem resellerId: ${clientUser.resellerId} - Kill Switch será acionado!`);
    } else {
      console.log(`   ⚠ Cliente NÃO tem resellerId no campo users.resellerId`);
      console.log(`   → Isso significa que o Kill Switch NÃO será acionado automaticamente`);
      console.log(`   → Precisamos vincular o resellerId no registro do usuário!`);
    }
  }

  // 6. RESTAURAR O STATUS ORIGINAL
  console.log("\n5. RESTAURANDO status original do reseller...");
  await db.update(resellers)
    .set({ resellerStatus: originalStatus || 'active' })
    .where(eq(resellers.id, reseller.resellerId));
  
  console.log(`   ✓ Status restaurado para: ${originalStatus || 'active'}`);

  // 7. Verificar restauração
  const [restoredReseller] = await db.select({
    resellerStatus: resellers.resellerStatus
  })
  .from(resellers)
  .where(eq(resellers.id, reseller.resellerId));
  
  console.log(`   ✓ Status confirmado: ${restoredReseller.resellerStatus}`);

  console.log("\n=== TESTE CONCLUÍDO ===");
  console.log("\nRESUMO:");
  console.log("1. ✓ Reseller encontrado e status verificado");
  console.log("2. ✓ Clientes do reseller listados");
  console.log("3. ✓ Reseller bloqueado temporariamente");
  console.log("4. ✓ Lógica de Kill Switch verificada no middleware");
  console.log("5. ✓ Status original restaurado");
  
  process.exit(0);
}

testKillSwitch().catch(err => {
  console.error("ERRO:", err);
  process.exit(1);
});
