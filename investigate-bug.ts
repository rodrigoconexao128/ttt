/**
 * INVESTIGAÇÃO: Bug nas respostas do WhatsApp
 * Cliente: +55 31 8782-8689
 * Problemas reportados:
 * 1. "(mensagem de voz) (mensagem de voz)" duplicado
 * 2. ".online/)" aparece sem sentido
 * 3. Texto cortado/juntado errado
 */

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    // Buscar usuário rodrigo4@gmail.com
    const userResult = await client.query(`
      SELECT id, email FROM users WHERE email = 'rodrigo4@gmail.com'
    `);
    console.log('👤 Usuário:', userResult.rows[0]);
    const userId = userResult.rows[0]?.id;
    
    if (!userId) {
      console.log('❌ Usuário não encontrado');
      return;
    }
    
    // Buscar conversa com +55 31 8782-8689
    const convResult = await client.query(`
      SELECT c.id, c.contact_name, c.contact_number 
      FROM conversations c
      JOIN whatsapp_connections wc ON c.connection_id = wc.id
      WHERE wc.user_id = $1 AND c.contact_number LIKE '%318782%'
      LIMIT 1
    `, [userId]);
    console.log('💬 Conversa:', convResult.rows[0]);
    const convId = convResult.rows[0]?.id;
    
    if (!convId) {
      console.log('❌ Conversa não encontrada');
      return;
    }
    
    // Buscar TODAS as mensagens desta conversa
    const msgResult = await client.query(`
      SELECT id, text, from_me, is_from_agent, timestamp, media_type, media_caption
      FROM messages 
      WHERE conversation_id = $1
      ORDER BY timestamp ASC
    `, [convId]);
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📜 HISTÓRICO COMPLETO DA CONVERSA');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    for (const msg of msgResult.rows) {
      const sender = msg.from_me ? (msg.is_from_agent ? '🤖 IA' : '👤 Atend.') : '📱 Cliente';
      const time = new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const media = msg.media_type ? ` [${msg.media_type.toUpperCase()}]` : '';
      const text = msg.text || '(sem texto)';
      
      console.log(`[${time}] ${sender}${media}:`);
      console.log(`   "${text}"`);
      if (msg.media_caption) {
        console.log(`   Caption: "${msg.media_caption}"`);
      }
      console.log('');
    }
    
    // Análise específica dos problemas
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🔍 ANÁLISE DE PROBLEMAS');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    // Buscar mensagens problemáticas
    const problemMsgs = msgResult.rows.filter(m => 
      (m.text && m.text.includes('(mensagem de voz)')) ||
      (m.text && m.text.includes('.online/)')) ||
      (m.text && m.text.includes('online/.'))
    );
    
    if (problemMsgs.length > 0) {
      console.log('⚠️ MENSAGENS COM PROBLEMAS DETECTADOS:\n');
      for (const msg of problemMsgs) {
        console.log(`ID: ${msg.id}`);
        console.log(`Texto completo: "${msg.text}"`);
        console.log('---');
      }
    } else {
      console.log('✅ Nenhuma mensagem com padrões problemáticos encontrada no banco');
    }
    
    // Verificar mensagens da IA
    const aiMessages = msgResult.rows.filter(m => m.is_from_agent);
    console.log(`\n📊 Total de mensagens da IA: ${aiMessages.length}`);
    
    for (const msg of aiMessages) {
      const time = new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      console.log(`\n[${time}] 🤖 Resposta da IA:`);
      console.log(`"${msg.text}"`);
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
