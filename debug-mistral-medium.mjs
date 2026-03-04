import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';

async function resolveKey() {
  if (process.env.MISTRAL_API_KEY) {
    console.log('✅ Key via env var');
    return process.env.MISTRAL_API_KEY;
  }
  if (!process.env.DATABASE_URL) return null;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT valor FROM system_config WHERE chave = 'mistral_api_key' LIMIT 1");
    const key = res.rows?.[0]?.valor || null;
    console.log('✅ Key via DB:', key ? `${key.slice(0,8)}...` : 'NÃO ENCONTRADA');
    return key;
  } finally {
    client.release();
    await pool.end();
  }
}

async function testModel(key, model) {
  console.log(`\n🧪 Testando modelo: ${model}`);
  const start = Date.now();
  try {
    const res = await fetch(MISTRAL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Responda só: OK' }],
        temperature: 0,
        max_tokens: 10
      })
    });
    const raw = await res.text();
    const elapsed = Date.now() - start;
    if (res.ok) {
      const data = JSON.parse(raw);
      const content = data?.choices?.[0]?.message?.content;
      console.log(`   ✅ Status ${res.status} | ${elapsed}ms | Resposta: "${content}"`);
    } else {
      console.log(`   ❌ Status ${res.status} | ${elapsed}ms | Erro: ${raw.slice(0, 200)}`);
    }
  } catch (err) {
    console.log(`   💥 Exceção: ${err.message}`);
  }
}

const key = await resolveKey();
if (!key) {
  console.error('❌ Sem API key!');
  process.exit(1);
}

// Testar os modelos que o sistema usa
await testModel(key, 'mistral-medium-latest');
await testModel(key, 'mistral-small-latest');

console.log('\n✅ Diagnóstico concluído');
