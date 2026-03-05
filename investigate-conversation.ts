/**
 * Investigar conversa específica do WhatsApp
 */

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();
  
  try {
    // Buscar conversa do número +55 31 8782-8689 para o usuário rodrigo4@gmail.com
    const result = await client.query(`
      SELECT 
        m.id,
        m.text,
        m.from_me,
        m.is_from_agent,
        m.timestamp,
        m.media_type,
        m.media_url,
        c.contact_name,
        c.contact_number
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      JOIN whatsapp_connections wc ON c.connection_id = wc.id
      JOIN users u ON wc.user_id = u.id
      WHERE u.email = 'rodrigo4@gmail.com'
        AND c.contact_number LIKE '%318782%'
      ORDER BY m.timestamp DESC
      LIMIT 30
    `);
    
    console.log('📱 Conversa com +55 31 8782-8689:');
    console.log('═'.repeat(80));
    
    // Inverter para ordem cronológica
    const messages = result.rows.reverse();
    
    for (const msg of messages) {
      const sender = msg.from_me ? (msg.is_from_agent ? '🤖 IA' : '👤 Humano') : '📱 Cliente';
      const time = new Date(msg.timestamp).toLocaleTimeString('pt-BR');
      const text = (msg.text || '').substring(0, 120);
      const media = msg.media_type ? ` [${msg.media_type}]` : '';
      
      console.log(`\n[${time}] ${sender}${media}:`);
      console.log(`  "${text}${text.length >= 120 ? '...' : ''}"`);
      
      // Detectar problemas
      if (msg.text?.includes('(mensagem de voz)')) {
        console.log('  ⚠️ PROBLEMA: Contém "(mensagem de voz)"');
      }
      if (msg.text?.includes('online/.')) {
        console.log('  ⚠️ PROBLEMA: Contém "online/." (link quebrado)');
      }
      if (msg.text?.includes('online/).')) {
        console.log('  ⚠️ PROBLEMA: Contém "online/)." (link quebrado)');
      }
    }
    
    console.log('\n' + '═'.repeat(80));
    console.log('Total de mensagens:', messages.length);
    
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
