/**
 * Script para corrigir pagamento PIX pendente e criar cliente de revenda
 * 
 * Problema: Cliente pagou R$ 49,99 via PIX mas não foi criado devido a bug no webhook
 * 
 * Dados do caso:
 * - Payment ID: 4d10a9de-c5fb-4a18-a06a-b04a64eec052
 * - MP Payment ID: 141271592895
 * - Cliente: Clínica Fisioli (clinicafisioli@gmail.com)
 * - Revendedor: pr.primitiva@yahoo.com.br
 */

import { storage } from "./server/storage";
import { resellerService } from "./server/resellerService";

async function fixResellerPayment() {
  const paymentId = "4d10a9de-c5fb-4a18-a06a-b04a64eec052";
  
  console.log("🔧 Iniciando correção do pagamento pendente...\n");
  
  // 1. Verificar pagamento
  const payment = await storage.getResellerPayment(paymentId);
  
  if (!payment) {
    console.error("❌ Pagamento não encontrado!");
    return;
  }
  
  console.log("📋 Dados do pagamento:");
  console.log("  - ID:", payment.id);
  console.log("  - Reseller ID:", payment.resellerId);
  console.log("  - Status:", payment.status);
  console.log("  - MP Payment ID:", payment.mpPaymentId);
  
  if (payment.status !== "pending") {
    console.log("⚠️ Pagamento não está pendente. Status atual:", payment.status);
    return;
  }
  
  // 2. Verificar se cliente já existe
  const statusData = JSON.parse(payment.statusDetail || "{}");
  const clientData = statusData.clientData;
  
  if (!clientData) {
    console.error("❌ Dados do cliente não encontrados no pagamento!");
    return;
  }
  
  console.log("\n📋 Dados do cliente:");
  console.log("  - Nome:", clientData.name);
  console.log("  - Email:", clientData.email);
  console.log("  - Phone:", clientData.phone);
  console.log("  - Preço:", clientData.clientPrice);
  
  // Verificar se email já existe
  const existingUser = await storage.getUserByEmail(clientData.email);
  if (existingUser) {
    console.log("⚠️ ATENÇÃO: Já existe um usuário com este email!");
    console.log("  - User ID:", existingUser.id);
    console.log("  - Nome:", existingUser.name);
    return;
  }
  
  // 3. Confirmar criação do cliente
  console.log("\n🚀 Processando criação do cliente...\n");
  
  try {
    const result = await resellerService.confirmPixPayment(paymentId);
    
    if (result.success) {
      console.log("✅ SUCESSO! Cliente criado com sucesso:");
      console.log("  - Client ID:", result.clientId);
      console.log("  - User ID:", result.userId);
    } else {
      console.error("❌ ERRO ao criar cliente:", result.error);
    }
  } catch (error: any) {
    console.error("❌ ERRO CRÍTICO:", error.message);
  }
}

// Executar
fixResellerPayment()
  .then(() => {
    console.log("\n✨ Script finalizado!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Erro fatal:", error);
    process.exit(1);
  });
