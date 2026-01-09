// Script para verificar a estrutura de dados dos clientes do reseller
import { db } from "./server/db";
import { resellers, resellerClients, users } from "./shared/schema";
import { eq } from "drizzle-orm";

async function checkResellerClientsStructure() {
  console.log("=== VERIFICANDO ESTRUTURA DE DADOS DO RESELLER ===\n");

  // 1. Buscar o reseller
  const resellerData = await db.select().from(resellers).limit(1);
  
  if (resellerData.length === 0) {
    console.log("❌ Nenhum reseller encontrado!");
    process.exit(1);
  }
  
  const reseller = resellerData[0];
  console.log("1. RESELLER:");
  console.log(`   ID: ${reseller.id}`);
  console.log(`   userId: ${reseller.userId}`);
  console.log(`   companyName: ${reseller.companyName}`);
  console.log(`   resellerStatus: ${reseller.resellerStatus}`);
  console.log(`   isActive: ${reseller.isActive}`);
  
  // 2. Buscar clientes do reseller
  console.log("\n2. CLIENTES DO RESELLER:");
  const clientsData = await db.select()
    .from(resellerClients)
    .where(eq(resellerClients.resellerId, reseller.id));
  
  for (const client of clientsData) {
    console.log(`\n   Cliente ID: ${client.id}`);
    console.log(`   userId: ${client.userId}`);
    console.log(`   status: ${client.status}`);
    
    // Verificar se o usuário tem resellerId
    const [userData] = await db.select()
      .from(users)
      .where(eq(users.id, client.userId));
    
    if (userData) {
      console.log(`   → user.email: ${userData.email}`);
      console.log(`   → user.resellerId: ${userData.resellerId || 'NULL ⚠️'}`);
      
      if (!userData.resellerId) {
        console.log(`   ⚠️ PROBLEMA: Cliente não tem resellerId no registro de usuário!`);
        console.log(`   → O Kill Switch NÃO será acionado para este usuário`);
      }
    }
  }
  
  console.log("\n=== VERIFICAÇÃO CONCLUÍDA ===");
  process.exit(0);
}

checkResellerClientsStructure().catch(err => {
  console.error("ERRO:", err);
  process.exit(1);
});
