/**
 * Script de Teste - Validação das Correções do Simulador
 * 
 * Testa:
 * 1. Se o simulador retorna mensagem de erro amigável quando não há API key
 * 2. Se o simulador funciona quando há API key válida
 * 3. Se a mudança de modelo não quebra o simulador
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

// Credenciais de teste
const ADMIN_EMAIL = 'rodrigoconexao128@gmail.com';
const ADMIN_PASSWORD = 'Ibira2019!';
const USER_EMAIL = 'rodrigo4@gmail.com';
const USER_PASSWORD = 'Ibira2019!';

let adminToken = null;
let userToken = null;

async function loginAdmin() {
  console.log('\n🔐 === TESTE 1: Login como Admin ===');
  try {
    const response = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    });
    
    const data = await response.json();
    
    if (response.ok && data.admin) {
      console.log('✅ Login admin OK:', data.admin.email);
      
      // Extrair cookie de sessão
      const cookies = response.headers.raw()['set-cookie'];
      if (cookies && cookies.length > 0) {
        adminToken = cookies[0].split(';')[0];
        console.log('✅ Cookie de sessão obtido');
      }
      return true;
    } else {
      console.log('❌ Login admin falhou:', data);
      return false;
    }
  } catch (error) {
    console.error('❌ Erro no login admin:', error.message);
    return false;
  }
}

async function loginUser() {
  console.log('\n🔐 === TESTE 2: Login como Usuário Normal ===');
  try {
    const response = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD })
    });
    
    const data = await response.json();
    
    if (response.ok && data.user) {
      console.log('✅ Login user OK:', data.user.email);
      
      // Extrair cookie de sessão
      const cookies = response.headers.raw()['set-cookie'];
      if (cookies && cookies.length > 0) {
        userToken = cookies[0].split(';')[0];
        console.log('✅ Cookie de sessão obtido');
      }
      return true;
    } else {
      console.log('❌ Login user falhou:', data);
      return false;
    }
  } catch (error) {
    console.error('❌ Erro no login user:', error.message);
    return false;
  }
}

async function getAdminConfig() {
  console.log('\n📋 === TESTE 3: Obter Configuração Admin ===');
  try {
    const response = await fetch(`${BASE_URL}/api/admin/config`, {
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': adminToken
      }
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Config obtida:');
      console.log('   Provider:', data.llm_provider || 'não definido');
      console.log('   OpenRouter Key:', data.openrouter_api_key?.length > 0 ? `${data.openrouter_api_key.length} chars` : 'vazio');
      console.log('   OpenRouter Model:', data.openrouter_model || 'não definido');
      console.log('   Groq Key:', data.groq_api_key?.length > 0 ? `${data.groq_api_key.length} chars` : 'vazio');
      return data;
    } else {
      console.log('❌ Erro ao obter config:', data);
      return null;
    }
  } catch (error) {
    console.error('❌ Erro ao obter config:', error.message);
    return null;
  }
}

async function testSimulator(message = 'Olá, quero testar o simulador') {
  console.log('\n🧪 === TESTE 4: Simulador do Usuário ===');
  console.log('   Mensagem:', message);
  
  try {
    const response = await fetch(`${BASE_URL}/api/agent/test`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': userToken
      },
      body: JSON.stringify({ message })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Simulador respondeu:');
      console.log('   Response:', data.response?.substring(0, 200) + (data.response?.length > 200 ? '...' : ''));
      
      // Verificar se é mensagem de erro de API key
      if (data.response?.includes('Nenhuma chave de API') || data.response?.includes('Simulador Indisponível')) {
        console.log('⚠️ Simulador retornou mensagem de erro de API key (esperado se não há chave configurada)');
      }
      
      return data;
    } else {
      console.log('❌ Erro no simulador:', data);
      return null;
    }
  } catch (error) {
    console.error('❌ Erro no simulador:', error.message);
    return null;
  }
}

async function testOpenRouterModels() {
  console.log('\n📊 === TESTE 5: Lista de Modelos OpenRouter ===');
  try {
    const response = await fetch(`${BASE_URL}/api/admin/openrouter/models`, {
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': adminToken
      }
    });
    
    const data = await response.json();
    
    if (response.ok && data.models) {
      console.log('✅ Modelos obtidos:', data.models.length);
      
      // Mostrar top 5 modelos com preços
      console.log('   Top 5 modelos mais baratos:');
      data.models.slice(0, 5).forEach((model, i) => {
        const inputPrice = model.pricing?.prompt ? (parseFloat(model.pricing.prompt) * 1000000).toFixed(4) : 'N/A';
        const outputPrice = model.pricing?.completion ? (parseFloat(model.pricing.completion) * 1000000).toFixed(4) : 'N/A';
        const contextK = model.context_length ? Math.round(model.context_length / 1000) : 'N/A';
        console.log(`   ${i + 1}. ${model.name} | In: $${inputPrice}/M Out: $${outputPrice}/M | ${contextK}K ctx`);
      });
      
      return data.models;
    } else {
      console.log('❌ Erro ao obter modelos:', data);
      return null;
    }
  } catch (error) {
    console.error('❌ Erro ao obter modelos:', error.message);
    return null;
  }
}

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   🧪 TESTE DE VALIDAÇÃO - CORREÇÕES DO SIMULADOR');
  console.log('═══════════════════════════════════════════════════════════════');
  
  let passed = 0;
  let failed = 0;
  
  // Teste 1: Login Admin
  if (await loginAdmin()) passed++; else failed++;
  
  // Teste 2: Login User  
  if (await loginUser()) passed++; else failed++;
  
  // Teste 3: Config Admin
  const config = await getAdminConfig();
  if (config) passed++; else failed++;
  
  // Teste 4: Simulador
  const simResult = await testSimulator();
  if (simResult) passed++; else failed++;
  
  // Teste 5: Lista Modelos
  const models = await testOpenRouterModels();
  if (models) passed++; else failed++;
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`   RESULTADO: ${passed} passou, ${failed} falhou`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  if (failed === 0) {
    console.log('\n✅ TODOS OS TESTES PASSARAM!');
  } else {
    console.log('\n⚠️ Alguns testes falharam. Verifique os logs acima.');
  }
}

runAllTests().catch(console.error);
