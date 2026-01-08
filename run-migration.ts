import 'dotenv/config';
import { pool } from './server/db';

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Starting migration...');

    // Add auto_reactivate_minutes to ai_agent_config
    await client.query(`
      ALTER TABLE ai_agent_config 
      ADD COLUMN IF NOT EXISTS auto_reactivate_minutes integer DEFAULT NULL
    `);
    console.log('✅ Added auto_reactivate_minutes to ai_agent_config');

    // Add fields to agent_disabled_conversations
    await client.query(`
      ALTER TABLE agent_disabled_conversations 
      ADD COLUMN IF NOT EXISTS owner_last_reply_at timestamp DEFAULT NOW()
    `);
    console.log('✅ Added owner_last_reply_at');

    await client.query(`
      ALTER TABLE agent_disabled_conversations 
      ADD COLUMN IF NOT EXISTS auto_reactivate_after_minutes integer DEFAULT NULL
    `);
    console.log('✅ Added auto_reactivate_after_minutes');

    await client.query(`
      ALTER TABLE agent_disabled_conversations 
      ADD COLUMN IF NOT EXISTS client_has_pending_message boolean DEFAULT false
    `);
    console.log('✅ Added client_has_pending_message');

    await client.query(`
      ALTER TABLE agent_disabled_conversations 
      ADD COLUMN IF NOT EXISTS client_last_message_at timestamp DEFAULT NULL
    `);
    console.log('✅ Added client_last_message_at');

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

runMigration();
