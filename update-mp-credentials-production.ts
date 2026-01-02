/**
 * Script para atualizar as credenciais do Mercado Pago para PRODUÇÃO
 * 
 * PROBLEMA: Erro "Card token service not found" ao tentar criar assinatura com card_token
 * CAUSA PROVÁVEL: Credenciais de TESTE estão sendo usadas no banco de dados
 * 
 * SOLUÇÃO: Este script atualiza as credenciais para PRODUÇÃO
 */

import { storage } from "./server/storage";
import "dotenv/config";

// Credenciais de PRODUÇÃO do Mercado Pago
// Fornecidas pelo usuário - Conta: Agentezap
const PRODUCTION_CREDENTIALS = {
  publicKey: "APP_USR-c6880571-f1e5-4c5b-adba-d78ec125d570",
  accessToken: "APP_USR-7853790746726235-122922-c063f3f0183988a1216419552a24f097-1105684259",
  clientId: "7853790746726235",
  clientSecret: "NDT5vcvhWXvFj8eBcJkjbwmddeDNOhNh",
  isTestMode: false
};

async function updateCredentials() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  ATUALIZAÇÃO DE CREDENCIAIS MERCADO PAGO - PRODUÇÃO");
  console.log("═══════════════════════════════════════════════════════════");
  console.log();
  
  try {
    // 1. Verificar credenciais atuais
    console.log("📋 Verificando credenciais atuais no banco de dados...\n");
    
    const currentConfigs = await storage.getSystemConfigs([
      "mercadopago_public_key",
      "mercadopago_access_token",
      "mercadopago_client_id",
      "mercadopago_client_secret",
      "mercadopago_test_mode"
    ]);
    
    const currentPublicKey = currentConfigs.get("mercadopago_public_key") || "NÃO CONFIGURADO";
    const currentAccessToken = currentConfigs.get("mercadopago_access_token") || "NÃO CONFIGURADO";
    const currentTestMode = currentConfigs.get("mercadopago_test_mode");
    
    console.log("Credenciais ATUAIS:");
    console.log("  - Public Key:", currentPublicKey.substring(0, 20) + "...");
    console.log("  - Access Token:", currentAccessToken.substring(0, 20) + "...");
    console.log("  - Test Mode:", currentTestMode);
    console.log();
    
    // Verificar se são credenciais de teste
    const isCurrentTest = currentPublicKey.startsWith("TEST-") || currentAccessToken.startsWith("TEST-");
    const isCurrentProd = currentPublicKey.startsWith("APP_USR-") || currentAccessToken.startsWith("APP_USR-");
    
    if (isCurrentTest) {
      console.log("⚠️  ALERTA: Credenciais ATUAIS são de TESTE!");
      console.log("   Isso explica o erro 'Card token service not found'");
      console.log();
    } else if (isCurrentProd) {
      console.log("✅ Credenciais ATUAIS são de PRODUÇÃO");
      console.log();
    }
    
    // 2. Atualizar para PRODUÇÃO
    console.log("═══════════════════════════════════════════════════════════");
    console.log("🔄 Atualizando credenciais para PRODUÇÃO...\n");
    
    await storage.updateSystemConfig("mercadopago_public_key", PRODUCTION_CREDENTIALS.publicKey);
    console.log("✅ mercadopago_public_key atualizado");
    
    await storage.updateSystemConfig("mercadopago_access_token", PRODUCTION_CREDENTIALS.accessToken);
    console.log("✅ mercadopago_access_token atualizado");
    
    await storage.updateSystemConfig("mercadopago_client_id", PRODUCTION_CREDENTIALS.clientId);
    console.log("✅ mercadopago_client_id atualizado");
    
    await storage.updateSystemConfig("mercadopago_client_secret", PRODUCTION_CREDENTIALS.clientSecret);
    console.log("✅ mercadopago_client_secret atualizado");
    
    await storage.updateSystemConfig("mercadopago_test_mode", "false");
    console.log("✅ mercadopago_test_mode = false (PRODUÇÃO)");
    
    console.log();
    console.log("═══════════════════════════════════════════════════════════");
    
    // 3. Verificar atualização
    console.log("📋 Verificando credenciais após atualização...\n");
    
    const newConfigs = await storage.getSystemConfigs([
      "mercadopago_public_key",
      "mercadopago_access_token",
      "mercadopago_test_mode"
    ]);
    
    const newPublicKey = newConfigs.get("mercadopago_public_key") || "";
    const newAccessToken = newConfigs.get("mercadopago_access_token") || "";
    const newTestMode = newConfigs.get("mercadopago_test_mode");
    
    console.log("Credenciais NOVAS:");
    console.log("  - Public Key:", newPublicKey.substring(0, 20) + "...");
    console.log("  - Access Token:", newAccessToken.substring(0, 20) + "...");
    console.log("  - Test Mode:", newTestMode);
    console.log();
    
    // Validar se são de produção
    if (newPublicKey.startsWith("APP_USR-") && newAccessToken.startsWith("APP_USR-") && newTestMode === "false") {
      console.log("═══════════════════════════════════════════════════════════");
      console.log("🎉 SUCESSO! Credenciais de PRODUÇÃO configuradas!");
      console.log("═══════════════════════════════════════════════════════════");
      console.log();
      console.log("📝 PRÓXIMOS PASSOS:");
      console.log("   1. Reinicie o servidor (npm run dev ou em produção)");
      console.log("   2. Teste uma assinatura com cartão de crédito real");
      console.log("   3. Checkout transparente deve funcionar sem redirect");
      console.log();
      console.log("⚠️  IMPORTANTE:");
      console.log("   - Use cartões REAIS para teste");
      console.log("   - Valores serão cobrados de verdade");
      console.log("   - Para testes sem cobrança, use Mercado Pago Sandbox");
      console.log();
    } else {
      console.log("❌ ERRO: Credenciais não foram atualizadas corretamente");
      console.log("   Verifique se o banco de dados está acessível");
    }
    
  } catch (error) {
    console.error("❌ Erro ao atualizar credenciais:", error);
    throw error;
  }
}

// Executar script
updateCredentials()
  .then(() => {
    console.log("Script finalizado com sucesso");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Falha no script:", error);
    process.exit(1);
  });
