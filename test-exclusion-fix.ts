/**
 * Teste para verificar correção da lógica de exclusão
 * Verifica se números com diferentes formatos são corretamente identificados
 */

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres.bnfpcuzjvycudccycqqt:agentezap1safa@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Função de normalização do código corrigido
function normalizePhoneForComparison(phoneNumber: string): string[] {
  const cleanNumber = phoneNumber.replace(/\D/g, "");
  const variations: string[] = [cleanNumber];
  
  // Se começa com 55 (Brasil), adicionar versão sem 55
  if (cleanNumber.startsWith('55') && cleanNumber.length >= 12) {
    variations.push(cleanNumber.substring(2)); // Remove 55
  }
  
  // Se não começa com 55, adicionar versão com 55
  if (!cleanNumber.startsWith('55') && cleanNumber.length >= 10) {
    variations.push('55' + cleanNumber);
  }
  
  // Para números com DDD (2 dígitos) + número (8 ou 9 dígitos)
  // Adicionar versão apenas com número local (sem DDD)
  if (cleanNumber.length >= 10 && cleanNumber.length <= 11) {
    variations.push(cleanNumber.substring(2)); // Remove DDD
  }
  
  // Se já é número com código do país, adicionar sem código do país e sem DDD
  if (cleanNumber.startsWith('55') && cleanNumber.length >= 12) {
    const withoutCountry = cleanNumber.substring(2);
    if (withoutCountry.length >= 10) {
      variations.push(withoutCountry.substring(2)); // Apenas número local
    }
  }
  
  return [...new Set(variations)]; // Remove duplicados
}

async function testExclusionLogic() {
  console.log("🧪 TESTE DE CORREÇÃO DA LÓGICA DE EXCLUSÃO");
  console.log("==========================================\n");
  
  const userId = "cb9213c3-fde3-479e-a4aa-344171c59735"; // rodrigo4@gmail.com
  
  // Número na lista de exclusão: 17991956944
  // Número que chega do WhatsApp: 5517991956944
  
  const storedNumber = "17991956944";
  const incomingNumber = "5517991956944";
  
  console.log(`📋 Número armazenado na exclusion_list: ${storedNumber}`);
  console.log(`📱 Número que chega do WhatsApp: ${incomingNumber}`);
  console.log("");
  
  // Teste 1: Verificar variações do número
  console.log("TESTE 1: Variações do número incoming");
  console.log("--------------------------------------");
  const variations = normalizePhoneForComparison(incomingNumber);
  console.log(`Variações geradas: [${variations.join(", ")}]`);
  
  const hasMatch = variations.includes(storedNumber);
  console.log(`✅ Contém número armazenado (${storedNumber})? ${hasMatch ? "SIM ✓" : "NÃO ✗"}`);
  console.log("");
  
  // Teste 2: Verificar no banco de dados
  console.log("TESTE 2: Verificação no banco de dados");
  console.log("--------------------------------------");
  
  const placeholders = variations.map((_, i) => `$${i + 3}`).join(", ");
  const query = `
    SELECT id, phone_number, is_active, exclude_from_followup
    FROM exclusion_list 
    WHERE user_id = $1 
    AND is_active = $2
    AND phone_number IN (${placeholders})
  `;
  
  const params = [userId, true, ...variations];
  
  try {
    const result = await pool.query(query, params);
    
    if (result.rows.length > 0) {
      console.log(`✅ ENCONTRADO! Número ${incomingNumber} está na lista de exclusão`);
      console.log(`   - ID: ${result.rows[0].id}`);
      console.log(`   - Número armazenado: ${result.rows[0].phone_number}`);
      console.log(`   - is_active: ${result.rows[0].is_active}`);
      console.log(`   - exclude_from_followup: ${result.rows[0].exclude_from_followup}`);
    } else {
      console.log(`❌ NÃO ENCONTRADO! Número ${incomingNumber} NÃO está na lista de exclusão`);
    }
    console.log("");
    
    // Teste 3: Verificar exclusion_config
    console.log("TESTE 3: Configuração de exclusão do usuário");
    console.log("---------------------------------------------");
    
    const configResult = await pool.query(
      `SELECT is_enabled, followup_exclusion_enabled FROM exclusion_config WHERE user_id = $1`,
      [userId]
    );
    
    if (configResult.rows.length > 0) {
      const config = configResult.rows[0];
      console.log(`✅ Configuração encontrada:`);
      console.log(`   - Lista de exclusão ativada: ${config.is_enabled ? "SIM ✓" : "NÃO ✗"}`);
      console.log(`   - Exclusão de follow-up ativada: ${config.followup_exclusion_enabled ? "SIM ✓" : "NÃO ✗"}`);
    } else {
      console.log(`⚠️ Nenhuma configuração encontrada para o usuário`);
    }
    console.log("");
    
    // Teste 4: Simulação completa da lógica isNumberExcluded
    console.log("TESTE 4: Simulação da função isNumberExcluded");
    console.log("---------------------------------------------");
    
    // Verificar config
    if (!configResult.rows.length || !configResult.rows[0].is_enabled) {
      console.log(`❌ RESULTADO: false (lista de exclusão desativada)`);
    } else {
      // Verificar número
      if (result.rows.length > 0) {
        console.log(`✅ RESULTADO: true (número ESTÁ excluído, IA não deve responder)`);
      } else {
        console.log(`❌ RESULTADO: false (número não está na lista)`);
      }
    }
    console.log("");
    
    // Teste 5: Testar outros formatos de número
    console.log("TESTE 5: Testar diferentes formatos de número");
    console.log("---------------------------------------------");
    
    const testNumbers = [
      "5517991956944",    // Com código do país
      "17991956944",      // Sem código do país (DDD + número)
      "991956944",        // Apenas número local
      "+55 17 99195-6944", // Formatado
      "55 (17) 99195-6944" // Outro formato
    ];
    
    for (const num of testNumbers) {
      const vars = normalizePhoneForComparison(num);
      const found = vars.includes(storedNumber);
      console.log(`${found ? "✅" : "❌"} "${num}" -> variações: [${vars.join(", ")}] -> Match: ${found ? "SIM" : "NÃO"}`);
    }
    
    console.log("\n==========================================");
    console.log("🎉 TESTE CONCLUÍDO!");
    console.log("==========================================");
    
    // Resultado final
    const finalResult = configResult.rows.length > 0 && 
                       configResult.rows[0].is_enabled && 
                       result.rows.length > 0;
    
    if (finalResult) {
      console.log("\n✅ A CORREÇÃO ESTÁ FUNCIONANDO!");
      console.log("   O número 17991956944 na lista de exclusão será encontrado");
      console.log("   quando mensagem chegar de 5517991956944 do WhatsApp.");
    } else {
      console.log("\n❌ VERIFICAR: Algo ainda não está correto");
    }
    
  } catch (error) {
    console.error("Erro:", error);
  } finally {
    await pool.end();
  }
}

testExclusionLogic();
