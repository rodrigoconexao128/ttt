// Script para verificar estrutura de dados do Kill Switch
import { db } from "./server/db";
import { resellers, resellerClients, users } from "./shared/schema";
import { eq, inArray } from "drizzle-orm";

async function checkKillSwitchStructure() {
  console.log("=== VERIFICAÇÃO DA ESTRUTURA DO KILL SWITCH ===\n");

  // 1. Buscar o reseller
  const [reseller] = await db.select().from(resellers).limit(1);
  
  if (!reseller) {
    console.log("❌ Nenhum reseller encontrado!");
    process.exit(1);
  }
  
  console.log("1. RESELLER ENCONTRADO:");
  console.log(`   ID: ${reseller.id}`);
  console.log(`   userId: ${reseller.userId}`);
  console.log(`   companyName: ${reseller.companyName}`);
  console.log(`   resellerStatus: ${reseller.resellerStatus}`);
  console.log(`   isActive: ${reseller.isActive}`);
  
  // 2. Buscar clientes do reseller
  console.log("\n2. CLIENTES DO RESELLER:");
  const clients = await db.select()
    .from(resellerClients)
    .where(eq(resellerClients.resellerId, reseller.id));
  
  console.log(`   Total: ${clients.length} clientes`);
  
  let clientesComResellerId = 0;
  let clientesSemResellerId = 0;
  
  for (const client of clients) {
    // Buscar o usuário correspondente
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, client.userId));
    
    if (user) {
      const hasResellerId = !!user.resellerId;
      console.log(`\n   → ${user.email}`);
      console.log(`     userId: ${user.id}`);
      console.log(`     user.resellerId: ${user.resellerId || 'NULL ⚠️'}`);
      console.log(`     client.status: ${client.status}`);
      console.log(`     isFreeClient: ${client.isFreeClient}`);
      
      if (hasResellerId) {
        clientesComResellerId++;
        if (user.resellerId === reseller.id) {
          console.log(`     ✅ Kill Switch ATIVO para este cliente`);
        } else {
          console.log(`     ⚠️ resellerId DIFERENTE do reseller atual!`);
        }
      } else {
        clientesSemResellerId++;
        console.log(`     ❌ Kill Switch NÃO funcionará (sem resellerId)`);
      }
    }
  }
  
  console.log("\n\n=== RESUMO ===");
  console.log(`✅ Clientes com resellerId: ${clientesComResellerId}`);
  console.log(`❌ Clientes sem resellerId: ${clientesSemResellerId}`);
  
  if (clientesSemResellerId > 0) {
    console.log(`\n⚠️ ATENÇÃO: ${clientesSemResellerId} cliente(s) não serão bloqueados pelo Kill Switch!`);
    console.log("   Esses clientes precisam ter o campo resellerId atualizado no registro de users.");
  }
  
  // 3. Testar se o Kill Switch está configurado corretamente
  console.log("\n\n=== TESTE DE KILL SWITCH ===");
  console.log(`Status atual do reseller: ${reseller.resellerStatus}`);
  
  if (reseller.resellerStatus === 'blocked') {
    console.log("⛔ O reseller está BLOQUEADO!");
    console.log("   → Todos os clientes com resellerId definido serão bloqueados");
  } else if (reseller.resellerStatus === 'active' || reseller.resellerStatus === null) {
    console.log("✅ O reseller está ATIVO");
    console.log("   → Clientes podem acessar normalmente");
    console.log("\n💡 Para testar o Kill Switch:");
    console.log(`   1. Execute: UPDATE resellers SET reseller_status = 'blocked' WHERE id = '${reseller.id}'`);
    console.log("   2. Logue como um cliente do reseller");
    console.log("   3. Verifique se o acesso é negado");
    console.log(`   4. Restaure: UPDATE resellers SET reseller_status = 'active' WHERE id = '${reseller.id}'`);
  }
  
  process.exit(0);
}

checkKillSwitchStructure().catch(err => {
  console.error("ERRO:", err);
  process.exit(1);
});
