import knex from 'knex';
const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

async function check() {
  const media = await db('agent_media_library').select('*');
  console.log('=== MÍDIA NO BANCO ===');
  console.log(JSON.stringify(media, null, 2));
  await db.destroy();
}

check().catch(console.error);