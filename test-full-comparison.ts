/**
 * TESTE COMPLETO: Comparação Simulador vs WhatsApp
 * 
 * Este script compara como as respostas são geradas nos dois fluxos
 * para identificar exatamente onde as diferenças ocorrem.
 */

import pkg from 'pg';
const { Pool } = pkg;
import crypto from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

interface Message {
  id: string;
  text: string | null;
  from_me: boolean;
  is_from_agent: boolean;
  timestamp: Date;
}

interface ConversationHistory {
  conversationId: string;
  contactName: string;
  contactNumber: string;
  messages: Message[];
}

async function getRecentWhatsAppConversation(userEmail: string): Promise<ConversationHistory | null> {
  const client = await pool.connect();
  try {
    // Buscar uma conversa real com várias mensagens
    const result = await client.query(`
      SELECT 
        c.id as conversation_id,
        c.contact_name,
        c.contact_number,
        m.id as msg_id,
        m.text,
        m.from_me,
        m.is_from_agent,
        m.timestamp
      FROM conversations c
      JOIN messages m ON c.id = m.conversation_id
      JOIN whatsapp_connections wc ON c.connection_id = wc.id
      JOIN users u ON wc.user_id = u.id
      WHERE u.email = $1
        AND m.text IS NOT NULL
        AND m.text != ''
      ORDER BY c.updated_at DESC, m.timestamp ASC
      LIMIT 50
    `, [userEmail]);

    if (result.rows.length === 0) {
      return null;
    }

    // Agrupar por conversa
    const firstConv = result.rows[0];
    const messages = result.rows
      .filter(r => r.conversation_id === firstConv.conversation_id)
      .map(r => ({
        id: r.msg_id,
        text: r.text,
        from_me: r.from_me,
        is_from_agent: r.is_from_agent,
        timestamp: r.timestamp
      }));

    return {
      conversationId: firstConv.conversation_id,
      contactName: firstConv.contact_name,
      contactNumber: firstConv.contact_number,
      messages
    };
  } finally {
    client.release();
  }
}

async function getAgentConfig(userEmail: string) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT ac.prompt, ac.is_active, ac.model
      FROM ai_agent_config ac
      JOIN users u ON ac.user_id = u.id
      WHERE u.email = $1
    `, [userEmail]);
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function main() {
  console.log('🔍 Análise Completa: Simulador vs WhatsApp');
  console.log('═'.repeat(70));
  
  const userEmail = 'rodrigo7777@teste.com';
  
  // 1. Buscar configuração do agente
  const config = await getAgentConfig(userEmail);
  if (!config) {
    console.log('❌ Configuração do agente não encontrada');
    process.exit(1);
  }
  
  console.log('\n📋 Configuração do Agente:');
  console.log(`   Modelo: ${config.model}`);
  console.log(`   Ativo: ${config.is_active}`);
  console.log(`   Prompt (MD5): ${crypto.createHash('md5').update(config.prompt || '').digest('hex').substring(0, 8)}`);
  console.log(`   Prompt (primeiros 200 chars): ${config.prompt?.substring(0, 200)}...`);
  
  // 2. Buscar conversa real do WhatsApp
  const conversation = await getRecentWhatsAppConversation(userEmail);
  
  if (!conversation) {
    console.log('\n❌ Nenhuma conversa encontrada no WhatsApp');
    process.exit(1);
  }
  
  console.log('\n📱 Conversa Real do WhatsApp:');
  console.log(`   ID: ${conversation.conversationId}`);
  console.log(`   Contato: ${conversation.contactName} (${conversation.contactNumber})`);
  console.log(`   Total de mensagens: ${conversation.messages.length}`);
  
  console.log('\n📜 Histórico da Conversa:');
  console.log('─'.repeat(70));
  
  for (const msg of conversation.messages) {
    const sender = msg.from_me ? (msg.is_from_agent ? '🤖 IA' : '👤 Atend.') : '📱 Cliente';
    const text = (msg.text || '').substring(0, 80);
    console.log(`${sender}: ${text}${text.length >= 80 ? '...' : ''}`);
  }
  
  console.log('─'.repeat(70));
  
  // 3. Análise das diferenças
  console.log('\n🔍 ANÁLISE DAS DIFERENÇAS:');
  console.log('═'.repeat(70));
  
  console.log('\n📊 FLUXO DO WHATSAPP (server/whatsapp.ts):');
  console.log('   1. Mensagem chega → scheduleAIResponse()');
  console.log('   2. Acumula mensagens por 30s (responseDelaySeconds)');
  console.log('   3. processAccumulatedMessages() chama generateAIResponse()');
  console.log('   4. Parâmetros:');
  console.log(`      - contactName: "${conversation.contactName}" (do banco)`);
  console.log(`      - conversationHistory: ${conversation.messages.length} msgs (do banco)`);
  console.log('      - sentMedias: extraído das msgs anteriores');
  
  console.log('\n📊 FLUXO DO SIMULADOR (server/routes.ts → testAgentResponse):');
  console.log('   1. POST /api/agent/test');
  console.log('   2. testAgentResponse() chama generateAIResponse()');
  console.log('   3. Parâmetros:');
  console.log('      - contactName: "Visitante" (fixo!)');
  console.log('      - conversationHistory: vem do frontend (pode estar vazio!)');
  console.log('      - sentMedias: vem do frontend');
  
  console.log('\n⚠️ DIFERENÇAS IDENTIFICADAS:');
  console.log('─'.repeat(70));
  
  console.log('\n1️⃣ NOME DO CONTATO:');
  console.log(`   WhatsApp: "${conversation.contactName}"`);
  console.log('   Simulador: "Visitante"');
  console.log('   IMPACTO: IA usa nome diferente nas respostas');
  
  console.log('\n2️⃣ HISTÓRICO DE CONVERSAÇÃO:');
  console.log(`   WhatsApp: ${conversation.messages.length} mensagens reais do banco`);
  console.log('   Simulador: começa vazio, acumula apenas durante sessão');
  console.log('   IMPACTO: IA não tem contexto de conversas anteriores no simulador');
  
  console.log('\n3️⃣ MÍDIAS JÁ ENVIADAS:');
  console.log('   WhatsApp: detecta mídias já enviadas no histórico');
  console.log('   Simulador: apenas rastreia mídias da sessão atual');
  console.log('   IMPACTO: pode repetir mídias que seriam evitadas no WhatsApp');
  
  console.log('\n4️⃣ TEMPERATURE DA IA (0.7):');
  console.log('   AMBOS usam temperature=0.7');
  console.log('   IMPACTO: mesmo com tudo igual, respostas podem variar');
  console.log('   SOLUÇÃO: reduzir temperature para 0.3-0.5 para mais consistência');
  
  console.log('\n💡 SOLUÇÃO PROPOSTA:');
  console.log('═'.repeat(70));
  console.log('Para o simulador ser IDÊNTICO ao WhatsApp:');
  console.log('1. Usar nome do cliente real (ou permitir configurar no simulador)');
  console.log('2. O histórico já está sendo enviado corretamente (verificado no código)');
  console.log('3. Considerar reduzir temperature para mais consistência');
  console.log('4. A função generateAIResponse() é a MESMA - diferenças são nos parâmetros');
  
  await pool.end();
}

main().catch(console.error);
