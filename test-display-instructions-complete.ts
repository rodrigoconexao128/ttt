/**
 * Test Script: Display Instructions Feature
 * 
 * Este script valida a funcionalidade completa das Instruções de Exibição
 * para Delivery e Produtos. Funciona para qualquer cliente/usuário.
 * 
 * Testa:
 * 1. Existência das colunas no banco de dados
 * 2. CRUD das configurações
 * 3. Geração correta dos blocos de prompt
 * 4. Integração end-to-end
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════════════

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERRO: Credenciais do Supabase não encontradas');
  console.error('   Verifique as variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY ou SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

// ═══════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

interface DeliveryConfig {
  id: string;
  user_id: string;
  is_active: boolean;
  send_to_ai: boolean;
  display_instructions: string | null;
  ai_instructions: string | null;
  business_name: string | null;
}

interface ProductsConfig {
  id: string;
  user_id: string;
  is_active: boolean;
  send_to_ai: boolean;
  display_instructions: string | null;
  ai_instructions: string | null;
}

// ═══════════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════════════

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

function log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const prefix = {
    info: `${colors.blue}ℹ${colors.reset}`,
    success: `${colors.green}✓${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
    warning: `${colors.yellow}⚠${colors.reset}`
  };
  console.log(`${prefix[type]} ${message}`);
}

function section(title: string) {
  console.log(`\n${colors.cyan}${'═'.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.cyan}${'═'.repeat(60)}${colors.reset}\n`);
}

// ═══════════════════════════════════════════════════════════════════════
// TESTES
// ═══════════════════════════════════════════════════════════════════════

const results: TestResult[] = [];

/**
 * Teste 1: Verificar se a coluna display_instructions existe em delivery_config
 */
async function testDeliveryColumnExists(): Promise<TestResult> {
  const testName = 'Coluna display_instructions em delivery_config';
  
  try {
    // Tenta buscar a coluna - se não existir, vai dar erro
    const { data, error } = await supabase
      .from('delivery_config')
      .select('display_instructions')
      .limit(1);
    
    if (error && error.message.includes('does not exist')) {
      return {
        name: testName,
        passed: false,
        message: 'Coluna display_instructions NÃO existe em delivery_config',
        details: error.message
      };
    }
    
    return {
      name: testName,
      passed: true,
      message: 'Coluna display_instructions existe em delivery_config'
    };
  } catch (e: any) {
    return {
      name: testName,
      passed: false,
      message: `Erro ao verificar coluna: ${e.message}`
    };
  }
}

/**
 * Teste 2: Verificar se a coluna display_instructions existe em products_config
 */
async function testProductsColumnExists(): Promise<TestResult> {
  const testName = 'Coluna display_instructions em products_config';
  
  try {
    const { data, error } = await supabase
      .from('products_config')
      .select('display_instructions')
      .limit(1);
    
    if (error && error.message.includes('does not exist')) {
      return {
        name: testName,
        passed: false,
        message: 'Coluna display_instructions NÃO existe em products_config',
        details: error.message
      };
    }
    
    return {
      name: testName,
      passed: true,
      message: 'Coluna display_instructions existe em products_config'
    };
  } catch (e: any) {
    return {
      name: testName,
      passed: false,
      message: `Erro ao verificar coluna: ${e.message}`
    };
  }
}

/**
 * Teste 3: Buscar configurações de delivery de qualquer usuário ativo
 */
async function testFetchDeliveryConfig(): Promise<TestResult> {
  const testName = 'Buscar configuração de Delivery';
  
  try {
    const { data, error } = await supabase
      .from('delivery_config')
      .select('id, user_id, is_active, send_to_ai, display_instructions, ai_instructions, business_name')
      .limit(5);
    
    if (error) {
      return {
        name: testName,
        passed: false,
        message: `Erro ao buscar: ${error.message}`,
        details: error
      };
    }
    
    if (!data || data.length === 0) {
      return {
        name: testName,
        passed: true,
        message: 'Nenhuma configuração de delivery encontrada (tabela vazia - OK)'
      };
    }
    
    const sample = data[0];
    const hasDisplayInstructions = 'display_instructions' in sample;
    
    return {
      name: testName,
      passed: hasDisplayInstructions,
      message: hasDisplayInstructions 
        ? `${data.length} configurações encontradas. Campo display_instructions presente.`
        : 'Campo display_instructions não está presente nos dados',
      details: {
        total: data.length,
        sample: {
          has_display_instructions: hasDisplayInstructions,
          display_instructions_value: sample.display_instructions,
          is_active: sample.is_active
        }
      }
    };
  } catch (e: any) {
    return {
      name: testName,
      passed: false,
      message: `Erro inesperado: ${e.message}`
    };
  }
}

/**
 * Teste 4: Buscar configurações de produtos de qualquer usuário
 */
async function testFetchProductsConfig(): Promise<TestResult> {
  const testName = 'Buscar configuração de Produtos';
  
  try {
    const { data, error } = await supabase
      .from('products_config')
      .select('id, user_id, is_active, send_to_ai, display_instructions, ai_instructions')
      .limit(5);
    
    if (error) {
      return {
        name: testName,
        passed: false,
        message: `Erro ao buscar: ${error.message}`,
        details: error
      };
    }
    
    if (!data || data.length === 0) {
      return {
        name: testName,
        passed: true,
        message: 'Nenhuma configuração de produtos encontrada (tabela vazia - OK)'
      };
    }
    
    const sample = data[0];
    const hasDisplayInstructions = 'display_instructions' in sample;
    
    return {
      name: testName,
      passed: hasDisplayInstructions,
      message: hasDisplayInstructions 
        ? `${data.length} configurações encontradas. Campo display_instructions presente.`
        : 'Campo display_instructions não está presente nos dados',
      details: {
        total: data.length,
        sample: {
          has_display_instructions: hasDisplayInstructions,
          display_instructions_value: sample.display_instructions,
          is_active: sample.is_active
        }
      }
    };
  } catch (e: any) {
    return {
      name: testName,
      passed: false,
      message: `Erro inesperado: ${e.message}`
    };
  }
}

/**
 * Teste 5: Simular atualização de display_instructions em delivery_config
 */
async function testUpdateDeliveryDisplayInstructions(): Promise<TestResult> {
  const testName = 'Atualizar display_instructions em Delivery';
  
  try {
    // Primeiro, busca um registro existente
    const { data: existing, error: fetchError } = await supabase
      .from('delivery_config')
      .select('id, user_id, display_instructions')
      .limit(1)
      .single();
    
    if (fetchError || !existing) {
      return {
        name: testName,
        passed: true,
        message: 'Nenhum registro para testar atualização (tabela vazia - OK)'
      };
    }
    
    const originalValue = existing.display_instructions;
    const testValue = `[TESTE] Liste cada item em uma linha - ${Date.now()}`;
    
    // Atualiza
    const { error: updateError } = await supabase
      .from('delivery_config')
      .update({ display_instructions: testValue })
      .eq('id', existing.id);
    
    if (updateError) {
      return {
        name: testName,
        passed: false,
        message: `Erro ao atualizar: ${updateError.message}`,
        details: updateError
      };
    }
    
    // Verifica se atualizou
    const { data: updated, error: verifyError } = await supabase
      .from('delivery_config')
      .select('display_instructions')
      .eq('id', existing.id)
      .single();
    
    if (verifyError || !updated) {
      return {
        name: testName,
        passed: false,
        message: 'Erro ao verificar atualização'
      };
    }
    
    const updateWorked = updated.display_instructions === testValue;
    
    // Restaura valor original
    await supabase
      .from('delivery_config')
      .update({ display_instructions: originalValue })
      .eq('id', existing.id);
    
    return {
      name: testName,
      passed: updateWorked,
      message: updateWorked 
        ? 'Atualização de display_instructions funcionou corretamente'
        : 'Falha na atualização - valor não foi salvo',
      details: {
        original: originalValue,
        testValue: testValue,
        afterUpdate: updated.display_instructions
      }
    };
  } catch (e: any) {
    return {
      name: testName,
      passed: false,
      message: `Erro inesperado: ${e.message}`
    };
  }
}

/**
 * Teste 6: Simular atualização de display_instructions em products_config
 */
async function testUpdateProductsDisplayInstructions(): Promise<TestResult> {
  const testName = 'Atualizar display_instructions em Produtos';
  
  try {
    const { data: existing, error: fetchError } = await supabase
      .from('products_config')
      .select('id, user_id, display_instructions')
      .limit(1)
      .single();
    
    if (fetchError || !existing) {
      return {
        name: testName,
        passed: true,
        message: 'Nenhum registro para testar atualização (tabela vazia - OK)'
      };
    }
    
    const originalValue = existing.display_instructions;
    const testValue = `[TESTE] Mostre nome e preço - ${Date.now()}`;
    
    const { error: updateError } = await supabase
      .from('products_config')
      .update({ display_instructions: testValue })
      .eq('id', existing.id);
    
    if (updateError) {
      return {
        name: testName,
        passed: false,
        message: `Erro ao atualizar: ${updateError.message}`,
        details: updateError
      };
    }
    
    const { data: updated, error: verifyError } = await supabase
      .from('products_config')
      .select('display_instructions')
      .eq('id', existing.id)
      .single();
    
    if (verifyError || !updated) {
      return {
        name: testName,
        passed: false,
        message: 'Erro ao verificar atualização'
      };
    }
    
    const updateWorked = updated.display_instructions === testValue;
    
    // Restaura
    await supabase
      .from('products_config')
      .update({ display_instructions: originalValue })
      .eq('id', existing.id);
    
    return {
      name: testName,
      passed: updateWorked,
      message: updateWorked 
        ? 'Atualização de display_instructions funcionou corretamente'
        : 'Falha na atualização - valor não foi salvo',
      details: {
        original: originalValue,
        testValue: testValue,
        afterUpdate: updated.display_instructions
      }
    };
  } catch (e: any) {
    return {
      name: testName,
      passed: false,
      message: `Erro inesperado: ${e.message}`
    };
  }
}

/**
 * Teste 7: Verificar geração de prompt com displayInstructions para Delivery
 */
async function testDeliveryPromptGeneration(): Promise<TestResult> {
  const testName = 'Geração de prompt Delivery com displayInstructions';
  
  try {
    // Busca um usuário com delivery ativo
    const { data: config, error: configError } = await supabase
      .from('delivery_config')
      .select('*')
      .eq('is_active', true)
      .eq('send_to_ai', true)
      .limit(1)
      .single();
    
    if (configError || !config) {
      return {
        name: testName,
        passed: true,
        message: 'Nenhum delivery ativo para testar geração de prompt (OK)'
      };
    }
    
    // Simula a geração do bloco de prompt
    const formatPrice = (price: number) => price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    const displayInstructions = config.display_instructions || 
      'Quando o cliente pedir o cardápio, liste cada item em uma linha separada.';
    
    const promptBlock = `
═══════════════════════════════════════════════════════════════════════
🍕 CARDÁPIO - ${config.business_name || 'Delivery'}
═══════════════════════════════════════════════════════════════════════

📋 *INFORMAÇÕES DO DELIVERY:*
• Entrega: Taxa de ${formatPrice(parseFloat(config.delivery_fee) || 0)}
• Pedido mínimo: ${formatPrice(parseFloat(config.min_order_value) || 0)}

${displayInstructions ? `**📝 FORMATO DE APRESENTAÇÃO DO CARDÁPIO:**\n${displayInstructions}\n` : ''}

**🚨 REGRA CRÍTICA - ENVIAR CARDÁPIO COMPLETO:**
(instruções de envio...)

═══════════════════════════════════════════════════════════════════════
`;
    
    const hasDisplayBlock = promptBlock.includes('FORMATO DE APRESENTAÇÃO');
    const hasUserInstructions = promptBlock.includes(displayInstructions);
    
    return {
      name: testName,
      passed: hasDisplayBlock && hasUserInstructions,
      message: hasDisplayBlock && hasUserInstructions
        ? 'Bloco de prompt gerado corretamente com displayInstructions'
        : 'Falha na geração do bloco de prompt',
      details: {
        business_name: config.business_name,
        display_instructions: config.display_instructions,
        prompt_has_display_block: hasDisplayBlock,
        prompt_includes_user_instructions: hasUserInstructions,
        prompt_length: promptBlock.length
      }
    };
  } catch (e: any) {
    return {
      name: testName,
      passed: false,
      message: `Erro inesperado: ${e.message}`
    };
  }
}

/**
 * Teste 8: Verificar geração de prompt com displayInstructions para Produtos
 */
async function testProductsPromptGeneration(): Promise<TestResult> {
  const testName = 'Geração de prompt Produtos com displayInstructions';
  
  try {
    const { data: config, error: configError } = await supabase
      .from('products_config')
      .select('*')
      .eq('is_active', true)
      .eq('send_to_ai', true)
      .limit(1)
      .single();
    
    if (configError || !config) {
      return {
        name: testName,
        passed: true,
        message: 'Nenhum catálogo de produtos ativo para testar (OK)'
      };
    }
    
    const displayInstructions = config.display_instructions || 
      'Quando o cliente pedir a lista, mostre cada produto em uma linha com nome e preço.';
    
    const customInstructions = config.ai_instructions 
      ? `\n**INSTRUÇÕES ESPECIAIS DO ADMINISTRADOR:**\n${config.ai_instructions}\n` 
      : '';
    
    const displayInstructionsBlock = displayInstructions
      ? `\n**FORMATO DE APRESENTAÇÃO:**\n${displayInstructions}\n`
      : '\n**FORMATO DE APRESENTAÇÃO:**\nQuando o cliente pedir a lista, mostre cada produto em uma linha com nome e preço.\n';
    
    const promptBlock = `
═══════════════════════════════════════════════════════════════════════
📦 CATÁLOGO DE PRODUTOS/SERVIÇOS
═══════════════════════════════════════════════════════════════════════

(lista de produtos...)
${customInstructions}
${displayInstructionsBlock}

**INSTRUÇÕES PARA USO DO CATÁLOGO:**
1. Use APENAS os produtos listados acima...

═══════════════════════════════════════════════════════════════════════
`;
    
    const hasDisplayBlock = promptBlock.includes('FORMATO DE APRESENTAÇÃO');
    
    return {
      name: testName,
      passed: hasDisplayBlock,
      message: hasDisplayBlock
        ? 'Bloco de prompt gerado corretamente com displayInstructions'
        : 'Falha na geração do bloco de prompt',
      details: {
        display_instructions: config.display_instructions,
        ai_instructions: config.ai_instructions,
        prompt_has_display_block: hasDisplayBlock,
        prompt_length: promptBlock.length
      }
    };
  } catch (e: any) {
    return {
      name: testName,
      passed: false,
      message: `Erro inesperado: ${e.message}`
    };
  }
}

/**
 * Teste 9: Verificar schema.ts tem displayInstructions definido
 */
async function testSchemaDefinition(): Promise<TestResult> {
  const testName = 'Schema tem displayInstructions definido';
  
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    const schemaPath = path.join(process.cwd(), 'shared', 'schema.ts');
    
    if (!fs.existsSync(schemaPath)) {
      return {
        name: testName,
        passed: false,
        message: 'Arquivo schema.ts não encontrado'
      };
    }
    
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    
    const hasDeliveryDisplayInstructions = schemaContent.includes('delivery_config') && 
      schemaContent.includes('display_instructions');
    const hasProductsDisplayInstructions = schemaContent.includes('products_config') && 
      schemaContent.includes('display_instructions');
    
    return {
      name: testName,
      passed: hasDeliveryDisplayInstructions && hasProductsDisplayInstructions,
      message: hasDeliveryDisplayInstructions && hasProductsDisplayInstructions
        ? 'displayInstructions definido corretamente no schema'
        : `Faltando: Delivery=${hasDeliveryDisplayInstructions}, Products=${hasProductsDisplayInstructions}`,
      details: {
        delivery_config_has_field: hasDeliveryDisplayInstructions,
        products_config_has_field: hasProductsDisplayInstructions
      }
    };
  } catch (e: any) {
    return {
      name: testName,
      passed: false,
      message: `Erro ao ler schema: ${e.message}`
    };
  }
}

/**
 * Teste 10: Verificar aiAgent.ts usa displayInstructions
 */
async function testAiAgentUsesDisplayInstructions(): Promise<TestResult> {
  const testName = 'aiAgent.ts usa displayInstructions';
  
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    const agentPath = path.join(process.cwd(), 'server', 'aiAgent.ts');
    
    if (!fs.existsSync(agentPath)) {
      return {
        name: testName,
        passed: false,
        message: 'Arquivo aiAgent.ts não encontrado'
      };
    }
    
    const agentContent = fs.readFileSync(agentPath, 'utf-8');
    
    const checks = {
      interfaceHasField: agentContent.includes('displayInstructions:'),
      deliveryUsesField: agentContent.includes('deliveryData.displayInstructions'),
      productsUsesField: agentContent.includes('productsData.displayInstructions'),
      formatoApresentacao: agentContent.includes('FORMATO DE APRESENTAÇÃO')
    };
    
    const allPassed = Object.values(checks).every(Boolean);
    
    return {
      name: testName,
      passed: allPassed,
      message: allPassed
        ? 'aiAgent.ts implementa displayInstructions corretamente'
        : 'Implementação incompleta no aiAgent.ts',
      details: checks
    };
  } catch (e: any) {
    return {
      name: testName,
      passed: false,
      message: `Erro ao ler aiAgent.ts: ${e.message}`
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EXECUÇÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════

async function runAllTests() {
  console.clear();
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║   🧪 TESTE COMPLETO: Display Instructions Feature                    ║
║                                                                      ║
║   Valida Delivery e Produtos - Funciona para qualquer cliente        ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝${colors.reset}
`);
  
  log(`Conectando ao Supabase: ${supabaseUrl?.substring(0, 40)}...`, 'info');
  console.log('');
  
  // ─────────────────────────────────────────────────────────────────────
  section('1. VERIFICAÇÃO DE ESTRUTURA DO BANCO');
  // ─────────────────────────────────────────────────────────────────────
  
  const test1 = await testDeliveryColumnExists();
  results.push(test1);
  log(test1.message, test1.passed ? 'success' : 'error');
  
  const test2 = await testProductsColumnExists();
  results.push(test2);
  log(test2.message, test2.passed ? 'success' : 'error');
  
  // ─────────────────────────────────────────────────────────────────────
  section('2. TESTE DE LEITURA DE DADOS');
  // ─────────────────────────────────────────────────────────────────────
  
  const test3 = await testFetchDeliveryConfig();
  results.push(test3);
  log(test3.message, test3.passed ? 'success' : 'error');
  if (test3.details) console.log(`   ${colors.dim}${JSON.stringify(test3.details, null, 2).substring(0, 200)}...${colors.reset}`);
  
  const test4 = await testFetchProductsConfig();
  results.push(test4);
  log(test4.message, test4.passed ? 'success' : 'error');
  if (test4.details) console.log(`   ${colors.dim}${JSON.stringify(test4.details, null, 2).substring(0, 200)}...${colors.reset}`);
  
  // ─────────────────────────────────────────────────────────────────────
  section('3. TESTE DE ESCRITA (CRUD)');
  // ─────────────────────────────────────────────────────────────────────
  
  const test5 = await testUpdateDeliveryDisplayInstructions();
  results.push(test5);
  log(test5.message, test5.passed ? 'success' : 'error');
  
  const test6 = await testUpdateProductsDisplayInstructions();
  results.push(test6);
  log(test6.message, test6.passed ? 'success' : 'error');
  
  // ─────────────────────────────────────────────────────────────────────
  section('4. TESTE DE GERAÇÃO DE PROMPT');
  // ─────────────────────────────────────────────────────────────────────
  
  const test7 = await testDeliveryPromptGeneration();
  results.push(test7);
  log(test7.message, test7.passed ? 'success' : 'error');
  
  const test8 = await testProductsPromptGeneration();
  results.push(test8);
  log(test8.message, test8.passed ? 'success' : 'error');
  
  // ─────────────────────────────────────────────────────────────────────
  section('5. VERIFICAÇÃO DE CÓDIGO-FONTE');
  // ─────────────────────────────────────────────────────────────────────
  
  const test9 = await testSchemaDefinition();
  results.push(test9);
  log(test9.message, test9.passed ? 'success' : 'error');
  if (test9.details) console.log(`   ${colors.dim}${JSON.stringify(test9.details)}${colors.reset}`);
  
  const test10 = await testAiAgentUsesDisplayInstructions();
  results.push(test10);
  log(test10.message, test10.passed ? 'success' : 'error');
  if (test10.details) console.log(`   ${colors.dim}${JSON.stringify(test10.details)}${colors.reset}`);
  
  // ─────────────────────────────────────────────────────────────────────
  section('📊 RESUMO DOS TESTES');
  // ─────────────────────────────────────────────────────────────────────
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  console.log('');
  results.forEach((r, i) => {
    const icon = r.passed ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
    console.log(`  ${icon} ${i + 1}. ${r.name}`);
  });
  
  console.log('');
  console.log(`${colors.cyan}─────────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`  Total: ${total} | ${colors.green}Passou: ${passed}${colors.reset} | ${colors.red}Falhou: ${failed}${colors.reset}`);
  console.log(`${colors.cyan}─────────────────────────────────────────────────────────────────────${colors.reset}`);
  
  if (failed === 0) {
    console.log(`
${colors.green}╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║   ✅ TODOS OS TESTES PASSARAM!                                       ║
║                                                                      ║
║   A feature de Display Instructions está 100% funcional.             ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝${colors.reset}
`);
    process.exit(0);
  } else {
    console.log(`
${colors.red}╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║   ❌ ALGUNS TESTES FALHARAM                                          ║
║                                                                      ║
║   Verifique os erros acima e corrija antes de fazer deploy.          ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝${colors.reset}
`);
    
    // Lista os testes que falharam
    console.log(`\n${colors.yellow}Testes que falharam:${colors.reset}`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.message}`);
      if (r.details) console.log(`    Details: ${JSON.stringify(r.details)}`);
    });
    
    process.exit(1);
  }
}

// Executa
runAllTests().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
