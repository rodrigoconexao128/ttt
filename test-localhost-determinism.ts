/**
 * TESTE DE DETERMINISMO VIA LOCALHOST
 * Testa o endpoint /api/agent/test diretamente 20 vezes
 */

const LOCALHOST_URL = 'http://localhost:5000';
const USER_EMAIL = 'rodrigo4@gmail.com';
const USER_PASSWORD = 'Ibira2019!';

interface TestResult {
  run: number;
  response: string;
  timestamp: string;
}

async function login(): Promise<string> {
  console.log('🔐 Fazendo login...');
  
  const response = await fetch(`${LOCALHOST_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: USER_EMAIL,
      password: USER_PASSWORD
    })
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Login failed: ${response.status} - ${text}`);
  }
  
  // Extrair cookie de sessão
  const cookies = response.headers.get('set-cookie');
  if (!cookies) {
    throw new Error('No session cookie received');
  }
  
  // Extrair apenas o valor do cookie de sessão
  const sessionMatch = cookies.match(/connect\.sid=([^;]+)/);
  if (!sessionMatch) {
    throw new Error('Session cookie not found in response');
  }
  
  console.log('✅ Login OK');
  return `connect.sid=${sessionMatch[1]}`;
}

async function testSimulator(cookie: string, message: string): Promise<string> {
  const response = await fetch(`${LOCALHOST_URL}/api/agent/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie
    },
    body: JSON.stringify({
      message,
      history: [] // Sem histórico - teste limpo
    })
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Simulator failed: ${response.status} - ${text}`);
  }
  
  const data = await response.json();
  return data.response || data.text || '';
}

async function run20Tests() {
  console.log('═'.repeat(80));
  console.log('🧪 TESTE DE DETERMINISMO - LOCALHOST (20 execuções)');
  console.log('═'.repeat(80));
  console.log(`📍 URL: ${LOCALHOST_URL}`);
  console.log(`👤 Usuário: ${USER_EMAIL}`);
  console.log(`📨 Mensagem: "Oi"`);
  console.log('═'.repeat(80));
  
  // 1. Login
  const cookie = await login();
  
  // 2. Executar 20 testes
  const results: TestResult[] = [];
  const MESSAGE = 'Oi';
  
  for (let i = 1; i <= 20; i++) {
    const timestamp = new Date().toISOString();
    console.log(`\n🔄 Teste ${i}/20...`);
    
    try {
      const response = await testSimulator(cookie, MESSAGE);
      results.push({ run: i, response, timestamp });
      console.log(`✅ ${i}: ${response.substring(0, 60)}...`);
    } catch (error) {
      console.error(`❌ ${i} ERRO:`, error);
      results.push({ run: i, response: `ERRO: ${error}`, timestamp });
    }
    
    // Pequena pausa
    await new Promise(r => setTimeout(r, 500));
  }
  
  // 3. Análise
  console.log('\n' + '═'.repeat(80));
  console.log('📊 ANÁLISE DE RESULTADOS');
  console.log('═'.repeat(80));
  
  const uniqueResponses = new Set(results.map(r => r.response));
  
  console.log(`\n📈 Total: ${results.length}`);
  console.log(`🔢 Respostas únicas: ${uniqueResponses.size}`);
  
  if (uniqueResponses.size === 1) {
    console.log('\n✅ ✅ ✅ PERFEITO! TODAS 20 RESPOSTAS IDÊNTICAS! ✅ ✅ ✅');
    console.log('\n📝 Resposta:');
    console.log('-'.repeat(60));
    console.log(results[0].response);
    console.log('-'.repeat(60));
  } else {
    console.log(`\n⚠️ VARIAÇÃO! ${uniqueResponses.size} respostas diferentes:`);
    
    let counter = 1;
    for (const response of uniqueResponses) {
      const runs = results.filter(r => r.response === response).map(r => r.run);
      console.log(`\n📄 Variação ${counter} (testes: ${runs.join(', ')}):`);
      console.log('-'.repeat(60));
      console.log(response);
      console.log('-'.repeat(60));
      counter++;
    }
  }
  
  return uniqueResponses.size === 1;
}

run20Tests()
  .then(success => {
    if (success) {
      console.log('\n🎉 LOCALHOST DETERMINÍSTICO!');
      process.exit(0);
    } else {
      console.log('\n❌ LOCALHOST COM VARIAÇÃO - PROBLEMA NO CÓDIGO');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Erro fatal:', err);
    process.exit(1);
  });
