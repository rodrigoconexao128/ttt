const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function createTable() {
  const client = await pool.connect();
  try {
    // Check if table exists
    const check = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'conversation_scheduled_messages'
      );
    `);
    
    if (check.rows[0].exists) {
      console.log('Table conversation_scheduled_messages already exists');
      return;
    }
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_scheduled_messages (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id VARCHAR REFERENCES conversations(id) ON DELETE CASCADE,
        user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
        contact_number TEXT NOT NULL,
        text TEXT NOT NULL,
        scheduled_for TIMESTAMP NOT NULL,
        use_ai BOOLEAN DEFAULT false,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'scheduled',
        created_at TIMESTAMP DEFAULT NOW(),
        executed_at TIMESTAMP,
        error_reason TEXT
      );
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conv_sched_msgs_conv ON conversation_scheduled_messages(conversation_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conv_sched_msgs_user ON conversation_scheduled_messages(user_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conv_sched_msgs_status ON conversation_scheduled_messages(status);
    `);
    
    console.log('Table conversation_scheduled_messages created successfully!');
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

createTable().catch(console.error);
