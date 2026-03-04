import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function applyMigration() {
  console.log('🔧 Conectando ao Supabase...');
  try {
    await client.connect();
    console.log('✅ Conectado!');

    // Verificar estado atual
    const check = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'agent_media_library'
      ORDER BY ordinal_position
    `);
    console.log('\n📊 Colunas atuais de agent_media_library:');
    check.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type} (default: ${r.column_default})`));

    // 1. Adicionar coluna flow_items
    console.log('\n⚙️ Adicionando coluna flow_items...');
    await client.query(`ALTER TABLE agent_media_library ADD COLUMN IF NOT EXISTS flow_items JSONB`);
    console.log('✅ flow_items adicionado!');

    // 2. Alterar default de storage_url
    console.log('\n⚙️ Atualizando default de storage_url...');
    await client.query(`ALTER TABLE agent_media_library ALTER COLUMN storage_url SET DEFAULT ''`);
    console.log("✅ storage_url default atualizado para ''");

    // 3. Criar índice para fluxos
    console.log('\n⚙️ Criando índice para fluxos...');
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_media_flow_type ON agent_media_library(user_id, media_type) WHERE media_type = 'flow'`);
      console.log('✅ Índice criado!');
    } catch (idxErr) {
      console.log('⚠️ Índice já existe ou erro:', idxErr.message);
    }

    // Verificar resultado
    const verify = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'agent_media_library'
      AND column_name IN ('flow_items', 'storage_url')
      ORDER BY column_name
    `);
    
    console.log('\n📊 Verificação final:');
    verify.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type} (default: ${r.column_default})`));
    
    const flowItemsExists = verify.rows.some(r => r.column_name === 'flow_items');
    if (flowItemsExists) {
      console.log('\n✅✅✅ MIGRAÇÃO 0087 APLICADA COM SUCESSO!');
    } else {
      console.log('\n❌ FALHA: flow_items não foi criado!');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Erro geral:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration().catch(console.error);
