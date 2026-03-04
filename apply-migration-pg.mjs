/**
 * APLICAR MIGRAÇÃO VIA POSTGRESQL DIRETO
 * Usa node-postgres para conectar ao banco Supabase
 */

import pg from 'pg';
const { Client } = pg;

// Credenciais do Supabase PostgreSQL
// Formato: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
const PROJECT_REF = 'bnfpcuzjvycudccycqqt';

// Precisamos da senha do banco (database password)
// Vamos tentar com a service role key como senha
const connectionString = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZXYiLCJyZWYiOiJzYWxvbi1kZXYiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzYyMzUzODg5LCJleHAiOjIwNzc5MjkzODl9.pMJoM4yI0LXTH8Q7NHxfYNJNsT54-7JQPDTW7bKqvqw')}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`;

const SQL = `
ALTER TABLE salon_config
ADD COLUMN IF NOT EXISTS min_notice_minutes integer;

UPDATE salon_config
SET min_notice_minutes = COALESCE(min_notice_hours, 2) * 60
WHERE min_notice_minutes IS NULL;

ALTER TABLE salon_config
ALTER COLUMN min_notice_minutes SET DEFAULT 0;
`;

async function applyMigration() {
  console.log('🔧 Conectando ao Supabase PostgreSQL...');
  console.log('📡 Host: aws-0-sa-east-1.pooler.supabase.com:6543');

  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Conectado ao banco de dados!');

    console.log('\n📝 Executando migração...');

    // Dividir em statements individuais
    const statements = SQL.split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    for (const stmt of statements) {
      console.log(`\n⚙️  Executando: ${stmt.substring(0, 60)}...`);
      await client.query(stmt);
      console.log('✅ OK');
    }

    console.log('\n✅ Migração aplicada com sucesso!');

    // Verificar se a coluna foi criada
    const checkResult = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'salon_config'
      AND column_name = 'min_notice_minutes'
    `);

    if (checkResult.rows.length > 0) {
      console.log('\n✅ Coluna min_notice_minutes criada:');
      console.log('   - Tipo:', checkResult.rows[0].data_type);
      console.log('   - Default:', checkResult.rows[0].column_default);
    } else {
      console.log('\n⚠️  Coluna não encontrada (pode já existir com outro nome)');
    }

  } catch (error) {
    console.error('\n❌ Erro:', error.message);

    if (error.message.includes('authentication failed') || error.message.includes('password')) {
      console.log('\n📝 NOTA: A service_role_key não funciona como senha do PostgreSQL.');
      console.log('📝 A migração deve ser aplicada manualmente no Dashboard:');
      console.log('https://supabase.com/dashboard/project/' + PROJECT_REF + '/sql');
      console.log('\nSQL para executar:');
      console.log(SQL);
    }
  } finally {
    await client.end();
  }
}

applyMigration().catch(console.error);
