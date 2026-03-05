/**
 * TESTE DE COMPARAÇÃO: SIMULADOR vs WHATSAPP
 * 
 * Este script compara o fluxo do simulador com o fluxo do WhatsApp real
 * para identificar diferenças nas respostas.
 */

import { storage } from './server/storage';
import { testAgentResponse } from './server/aiAgent';
import { generateAIResponse, type Message } from './server/aiAgent';
import { pool } from './server/db';

// Cores para o terminal
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';

async function main() {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}   🔬 TESTE DE COMPARAÇÃO: SIMULADOR vs WHATSAPP REAL   ${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`);

  try {
    // 1. BUSCAR CONFIGURAÇÃO DO AGENTE E CONVERSAS REAIS
    
    // Buscar o user_id do agente configurado (AgenteZap - rodrigo7777)
    const agentResult = await pool.query(`
      SELECT user_id, prompt, model, is_active, message_split_chars 
      FROM ai_agent_config 
      WHERE user_id = 'b1529055-527b-42d6-9990-ea7908175f63'
      LIMIT 1
    `);
    
    if (agentResult.rows.length === 0) {
      console.log(`${RED}❌ Nenhum agente ativo encontrado${RESET}`);
      process.exit(1);
    }
    
    const agentConfig = agentResult.rows[0];
    const userId = agentConfig.user_id;
    
    console.log(`${GREEN}✅ Agente encontrado:${RESET}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Model: ${agentConfig.model}`);
    console.log(`   Prompt (150 chars): ${agentConfig.prompt?.substring(0, 150)}...`);
    console.log(`   Split chars: ${agentConfig.message_split_chars}\n`);
    
    // 2. BUSCAR UMA CONVERSA REAL COM HISTÓRICO
    const convResult = await pool.query(`
      SELECT c.id, c.contact_number, c.contact_name, c.connection_id
      FROM conversations c
      JOIN whatsapp_connections wc ON wc.id = c.connection_id
      WHERE wc.user_id = $1
      ORDER BY c.last_message_time DESC
      LIMIT 1
    `, [userId]);
    
    let realHistory: Message[] = [];
    let realContactName = 'Visitante';
    
    if (convResult.rows.length > 0) {
      const conv = convResult.rows[0];
      realContactName = conv.contact_name || 'Cliente Real';
      
      console.log(`${GREEN}✅ Conversa real encontrada:${RESET}`);
      console.log(`   ID: ${conv.id}`);
      console.log(`   Número: ${conv.contact_number}`);
      console.log(`   Nome: ${realContactName}\n`);
      
      // Buscar histórico da conversa
      realHistory = await storage.getMessagesByConversationId(conv.id);
      console.log(`   ${realHistory.length} mensagens no histórico\n`);
      
      // Mostrar últimas mensagens
      console.log(`${YELLOW}📜 HISTÓRICO DA CONVERSA REAL:${RESET}`);
      const lastMsgs = realHistory.slice(-8);
      for (const msg of lastMsgs) {
        const from = msg.fromMe ? `${BLUE}AGENTE${RESET}` : `${GREEN}CLIENTE${RESET}`;
        console.log(`   [${from}] ${(msg.text || '(mídia)').substring(0, 80)}`);
      }
      console.log('');
    } else {
      console.log(`${YELLOW}⚠️ Nenhuma conversa real encontrada, usando histórico vazio${RESET}\n`);
    }

    // 3. MENSAGEM DE TESTE
    const testMessage = "Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.";
    
    console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}  📝 MENSAGEM DE TESTE: "${testMessage}"${RESET}`);
    console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`);

    // 4. TESTE DO SIMULADOR (SEM histórico, nome "Visitante")
    console.log(`${BOLD}${YELLOW}🧪 TESTE 1: SIMULADOR (sem histórico, nome "Visitante")${RESET}`);
    console.log(`${'─'.repeat(60)}`);
    
    const simulatorResult = await testAgentResponse(
      userId,
      testMessage,
      undefined, // sem custom prompt
      [], // sem histórico
      [] // sem mídias enviadas
    );
    
    console.log(`${GREEN}📤 Resposta do SIMULADOR:${RESET}`);
    console.log(`   ${simulatorResult.text?.substring(0, 500)}${simulatorResult.text && simulatorResult.text.length > 500 ? '...' : ''}\n`);

    // 5. TESTE DO WHATSAPP REAL (COM histórico, nome real)
    console.log(`${BOLD}${BLUE}🔵 TESTE 2: WHATSAPP REAL (com histórico, nome real)${RESET}`);
    console.log(`${'─'.repeat(60)}`);
    
    const whatsappResult = await generateAIResponse(
      userId,
      realHistory.slice(-10), // últimas 10 mensagens
      testMessage,
      {
        contactName: realContactName,
        sentMedias: [],
      }
    );
    
    console.log(`${GREEN}📤 Resposta do WHATSAPP REAL:${RESET}`);
    console.log(`   ${whatsappResult?.text?.substring(0, 500)}${whatsappResult?.text && whatsappResult.text.length > 500 ? '...' : ''}\n`);

    // 6. TESTE 3: SIMULADOR COM HISTÓRICO (para comparar)
    console.log(`${BOLD}${CYAN}🔷 TESTE 3: SIMULADOR COM HISTÓRICO (para comparar)${RESET}`);
    console.log(`${'─'.repeat(60)}`);
    
    const simulatorWithHistoryResult = await testAgentResponse(
      userId,
      testMessage,
      undefined,
      realHistory.slice(-10), // mesmo histórico
      []
    );
    
    console.log(`${GREEN}📤 Resposta do SIMULADOR COM HISTÓRICO:${RESET}`);
    console.log(`   ${simulatorWithHistoryResult.text?.substring(0, 500)}${simulatorWithHistoryResult.text && simulatorWithHistoryResult.text.length > 500 ? '...' : ''}\n`);

    // 7. ANÁLISE DAS DIFERENÇAS
    console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}   📊 ANÁLISE DAS DIFERENÇAS   ${RESET}`);
    console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`);
    
    const sim1 = simulatorResult.text || '';
    const whatsapp = whatsappResult?.text || '';
    const sim2 = simulatorWithHistoryResult.text || '';
    
    console.log(`${YELLOW}📏 TAMANHOS:${RESET}`);
    console.log(`   Simulador sem histórico: ${sim1.length} chars`);
    console.log(`   WhatsApp real: ${whatsapp.length} chars`);
    console.log(`   Simulador com histórico: ${sim2.length} chars\n`);
    
    // Verificar se contém nome
    console.log(`${YELLOW}👤 USO DE NOME:${RESET}`);
    console.log(`   Simulador sem histórico contém "Visitante": ${sim1.includes('Visitante')}`);
    console.log(`   WhatsApp contém nome real ("${realContactName}"): ${whatsapp.includes(realContactName)}`);
    console.log(`   Simulador com histórico contém "Visitante": ${sim2.includes('Visitante')}\n`);
    
    // Verificar saudação
    const saudacoes = ['Bom dia', 'Boa tarde', 'Boa noite', 'Olá', 'Oi'];
    console.log(`${YELLOW}👋 SAUDAÇÃO:${RESET}`);
    const simSaudacao = saudacoes.find(s => sim1.toLowerCase().includes(s.toLowerCase()));
    const whatsappSaudacao = saudacoes.find(s => whatsapp.toLowerCase().includes(s.toLowerCase()));
    console.log(`   Simulador: ${simSaudacao || 'nenhuma'}`);
    console.log(`   WhatsApp: ${whatsappSaudacao || 'nenhuma'}\n`);
    
    // Verificar se menciona preço correto
    console.log(`${YELLOW}💰 PREÇO MENCIONADO:${RESET}`);
    console.log(`   Simulador contém R$49: ${sim1.includes('R$49') || sim1.includes('R$ 49')}`);
    console.log(`   WhatsApp contém R$49: ${whatsapp.includes('R$49') || whatsapp.includes('R$ 49')}\n`);
    
    // CONCLUSÃO
    console.log(`${BOLD}${RED}═══════════════════════════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}${RED}   🔍 POSSÍVEIS CAUSAS DE DIFERENÇA:   ${RESET}`);
    console.log(`${BOLD}${RED}═══════════════════════════════════════════════════════════════${RESET}\n`);
    
    if (sim1 !== sim2) {
      console.log(`${RED}1. HISTÓRICO FAZ DIFERENÇA:${RESET}`);
      console.log(`   - Simulador SEM histórico gera resposta diferente`);
      console.log(`   - O contexto das mensagens anteriores MUDA a resposta\n`);
    }
    
    if (sim2 !== whatsapp) {
      console.log(`${RED}2. MESMO COM HISTÓRICO, RESPOSTAS DIFERENTES:${RESET}`);
      console.log(`   - Pode ser o NOME (Visitante vs nome real)`);
      console.log(`   - Pode ser variação natural da IA (temperature > 0)`);
      console.log(`   - Pode haver diferença no processamento das mensagens\n`);
    }
    
    console.log(`${GREEN}✅ TESTE CONCLUÍDO${RESET}\n`);

  } catch (error) {
    console.error(`${RED}❌ Erro:${RESET}`, error);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
