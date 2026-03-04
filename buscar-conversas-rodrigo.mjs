/**
 * Busca conversas reais do rodrigo4@gmail.com:
 * - Mensagens de clientes (incoming)
 * - Respostas manuais do operador
 * - Agrupa por padrão de pergunta/resposta
 */
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const USER_ID = 'cb9213c3-fde3-479e-a4aa-344171c59735';

const client = await pool.connect();
try {
  // 0) Schema das tabelas
  const convCols = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'conversations' ORDER BY ordinal_position
  `);
  console.log('Colunas conversations:', convCols.rows.map(r => r.column_name).join(', '));

  const msgColsRes = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'messages' ORDER BY ordinal_position
  `);
  console.log('Colunas messages:', msgColsRes.rows.map(r => r.column_name).join(', '));

  // 1) Buscar conexões do usuário
  const waCols = await client.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'whatsapp_connections' ORDER BY ordinal_position
  `);
  console.log('whatsapp_connections cols:', waCols.rows.map(r => r.column_name).join(', '));

  const connRes = await client.query(`
    SELECT id FROM whatsapp_connections WHERE user_id::text = $1
  `, [USER_ID]);
  console.log(`\nConexões WhatsApp: ${connRes.rows.length}`);
  if (connRes.rows.length === 0) {
    console.log('Sem conexões encontradas.');
    process.exit(0);
  }
  const connIds = connRes.rows.map(r => r.id);
  console.log('Connection IDs:', connIds);

  // 2) Buscar conversas das conexões
  const convRes = await client.query(`
    SELECT * FROM conversations WHERE connection_id = ANY($1::text[]) ORDER BY updated_at DESC
  `, [connIds]);

  console.log(`\nTotal de conversas: ${convRes.rows.length}`);
  if (convRes.rows.length > 0) {
    console.log('Sample conv keys:', Object.keys(convRes.rows[0]).join(', '));
  }

  // 2) Schema de messages
  const colRes = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'messages'
    ORDER BY ordinal_position
  `);
  console.log('\nColunas da tabela messages:');
  colRes.rows.forEach(r => console.log(` - ${r.column_name} (${r.data_type})`));

  if (convRes.rows.length === 0) {
    console.log('\nNenhuma conversa encontrada.');
    process.exit(0);
  }

  const convIds = convRes.rows.map(r => r.id);

  // 3) Buscar todas as mensagens dessas conversas
  const msgRes = await client.query(`
    SELECT m.*
    FROM messages m
    WHERE m.conversation_id = ANY($1::text[])
    ORDER BY m.conversation_id, m.created_at ASC
  `, [convIds]);

  console.log(`\nTotal de mensagens: ${msgRes.rows.length}`);

  // 4) Agrupar por conversa
  const convMap = {};
  for (const c of convRes.rows) {
    convMap[c.id] = c.contact_name || c.contact_number || c.id;
  }

  const byConv = {};
  for (const m of msgRes.rows) {
    const key = m.conversation_id;
    if (!byConv[key]) byConv[key] = { contact: convMap[key] || key, messages: [] };
    byConv[key].messages.push(m);
  }

  // Helper: detect sender type
  function isIncoming(m) {
    return m.from_me === false;
  }
  function isOutgoing(m) {
    return m.from_me === true;
  }
  function getBody(m) {
    return (m.text || m.body || m.content || m.payload || '').toString().slice(0, 600);
  }
  function isAI(m) {
    return m.is_from_agent === true;
  }

  // 5) Detectar pares pergunta→resposta manual (sender != 'ai' e != 'bot')
  const pairs = [];
  for (const [convId, data] of Object.entries(byConv)) {
    const msgs = data.messages;
    for (let i = 0; i < msgs.length - 1; i++) {
      const cur  = msgs[i];
      const next = msgs[i + 1];
      const clientMsg = isIncoming(cur);
      const replyMsg  = isOutgoing(next);
      if (clientMsg && replyMsg) {
        pairs.push({
          contact: data.contact,
          question: getBody(cur),
          answer: getBody(next),
          answer_sender: next.is_from_agent ? 'AI' : 'manual',
          answer_is_ai: isAI(next),
          question_at: cur.created_at,
          answer_at: next.created_at,
        });
      }
    }
  }

  console.log(`\nPares pergunta→resposta encontrados: ${pairs.length}`);

  // 6) Filtrar respostas manuais (is_ai = false ou sender != ai)
  const manual = pairs.filter(p => !p.answer_is_ai);
  const aiPairs = pairs.filter(p => p.answer_is_ai);
  console.log(`  Respostas manuais: ${manual.length}`);
  console.log(`  Respostas IA: ${aiPairs.length}`);

  // 7) Salvar resultado
  const output = {
    totalConversations: convRes.rows.length,
    totalMessages: msgRes.rows.length,
    totalPairs: pairs.length,
    manualPairs: manual.length,
    allPairs: pairs,
    sampleColumns: colRes.rows.map(r => r.column_name)
  };
  fs.writeFileSync(path.join(__dirname, 'rodrigo-conversations.json'), JSON.stringify(output, null, 2), 'utf8');
  console.log('\n✅ Salvo em rodrigo-conversations.json');

  // Print primeiros 20 pares
  console.log('\n=== PRIMEIROS 20 PARES PERGUNTA→RESPOSTA ===');
  pairs.slice(0, 20).forEach((p, i) => {
    console.log(`\n--- Pair ${i + 1} (${p.contact}) | sender: ${p.answer_sender} | is_ai: ${p.answer_is_ai} ---`);
    console.log(`❓ Cliente: ${p.question}`);
    console.log(`💬 Resposta: ${p.answer}`);
  });

} finally {
  client.release();
  await pool.end();
}
