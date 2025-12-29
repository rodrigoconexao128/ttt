import dotenv from 'dotenv';
dotenv.config();

import pkg from 'pg';
const { Client } = pkg;

async function checkDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to database\n');
    
    // Verificar se a tabela existe
    const tables = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'system_config'
      );
    `);
    console.log('📊 Table system_config exists:', tables.rows[0].exists);
    
    if (tables.rows[0].exists) {
      // Buscar todas as configs
      const configs = await client.query(`
        SELECT chave, valor FROM system_config;
      `);
      
      console.log(`\n📋 Found ${configs.rows.length} config(s):\n`);
      
      for (const row of configs.rows) {
        if (row.chave === 'mistral_api_key') {
          console.log(`  🔑 ${row.chave}: ${row.valor ? row.valor.substring(0, 10) + '...' + row.valor.substring(row.valor.length - 5) : 'NULL'}`);
        } else {
          console.log(`  📌 ${row.chave}: ${row.valor?.substring(0, 30) || 'NULL'}...`);
        }
      }
      
      // Buscar especificamente mistral_api_key
      const mistralKey = await client.query(`
        SELECT valor FROM system_config WHERE chave = 'mistral_api_key';
      `);
      
      if (mistralKey.rows.length > 0) {
        console.log(`\n✅ MISTRAL KEY FOUND IN DATABASE`);
        console.log(`   Length: ${mistralKey.rows[0].valor?.length || 0} characters`);
        
        // Comparar com ENV
        if (process.env.MISTRAL_API_KEY === mistralKey.rows[0].valor) {
          console.log(`   ✅ MATCHES .env file`);
        } else {
          console.log(`   ⚠️  DIFFERENT from .env file!`);
          console.log(`   ENV: ${process.env.MISTRAL_API_KEY?.substring(0, 10)}...`);
          console.log(`   DB:  ${mistralKey.rows[0].valor?.substring(0, 10)}...`);
        }
      } else {
        console.log(`\n❌ MISTRAL KEY NOT FOUND IN DATABASE`);
        console.log(`   You may need to insert it:`);
        console.log(`   INSERT INTO system_config (chave, valor) VALUES ('mistral_api_key', '${process.env.MISTRAL_API_KEY}');`);
      }
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkDatabase();
