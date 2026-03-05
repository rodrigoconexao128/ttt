/**
 * TESTE REAL: Simula o comportamento exato do sistema AgenteZap
 * 
 * Cenário: Conta rodrigo4@gmail.com
 * - fetchHistoryOnFirstResponse pode estar ativo ou não
 * - Em ambos os casos, a IA deve manter continuidade
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { db } from './server/db';
import { aiAgentConfig, systemConfig, messages as messagesTable, conversations } from './shared/schema';
import { eq, desc } from 'drizzle-orm';
import { generateAIResponse } from './server/aiAgent';
import type { Message } from './shared/schema';

const USER_ID = 'cb9213c3-fde3-479e-a4aa-344171c59735'; // rodrigo4@gmail.com

async function getApiKey(): Promise<string> {
  const config = await db.select().from(systemConfig).where(eq(systemConfig.chave, 'mistral_api_key')).limit(1);
  return config[0]?.valor || '';
}

async function getAgentConfigInfo() {
  const configs = await db.select().from(aiAgentConfig).where(eq(aiAgentConfig.userId, USER_ID));
  return configs[0];
}

// Simular histórico de mensagens como viria do banco de dados
function criarHistoricoSimulado(mensagens: Array<{ fromMe: boolean; text: string; isFromAgent?: boolean }>): Message[] {
  return mensagens.map((m, i) => ({
    id: `msg-${i}`,
    conversationId: 'test-conv',
    messageId: `whatsapp-${i}`,
    fromMe: m.fromMe,
    text: m.text,
    timestamp: new Date(Date.now() - (mensagens.length - i) * 60000), // Mensagens espaçadas por 1 minuto
    status: 'delivered',
    isFromAgent: m.isFromAgent ?? m.fromMe, // Se fromMe e não especificado, assume que é do agente
    mediaType: null,
    mediaUrl: null,
    mediaMimeType: null,
    mediaDuration: null,
    mediaCaption: null,
  })) as Message[];
}

interface TestCase {
  nome: string;
  historico: Array<{ fromMe: boolean; text: string; isFromAgent?: boolean }>;
  novaMensagem: string;
  naoDeveConter: string[];
  deveConterUmDe?: string[];
}

const TESTES: TestCase[] = [
  {
    nome: "1. Cliente manda OI após já ter conversado",
    historico: [
      { fromMe: false, text: "Oi" },
      { fromMe: true, text: "Oi! Tudo bem? Sou o Rodrigo da AgenteZap. Me conta: o que você faz hoje? Vendas, atendimento ou qualificação?", isFromAgent: true },
      { fromMe: false, text: "Vendas" },
      { fromMe: true, text: "Perfeito! Trabalha com vendas então. Nosso plano é R$ 99/mês ilimitado e já inclui IA, Follow-up, Notificador e mais.", isFromAgent: true },
    ],
    novaMensagem: "Oi",
    naoDeveConter: ["o que você faz", "me conta", "vendas, atendimento ou qualificação"],
    deveConterUmDe: ["ajudar", "algo", "posso", "?"],
  },
  {
    nome: "2. Cliente repete pergunta sobre preço",
    historico: [
      { fromMe: false, text: "Quanto custa?" },
      { fromMe: true, text: "O plano é R$ 99/mês, ilimitado!", isFromAgent: true },
      { fromMe: false, text: "Entendi" },
      { fromMe: true, text: "Quer saber mais detalhes?", isFromAgent: true },
    ],
    novaMensagem: "Qual o preço mesmo?",
    naoDeveConter: [],
    deveConterUmDe: ["99", "r$", "como", "disse", "mencionei"],
  },
  {
    nome: "3. Cliente manda 'tudo bem?' no meio da conversa",
    historico: [
      { fromMe: false, text: "Oi" },
      { fromMe: true, text: "Oi! Rodrigo da AgenteZap. O que você faz hoje?", isFromAgent: true },
      { fromMe: false, text: "Atendimento" },
      { fromMe: true, text: "Legal! Nossa IA pode responder seus clientes 24h.", isFromAgent: true },
    ],
    novaMensagem: "Tudo bem?",
    naoDeveConter: ["o que você faz", "vendas, atendimento"],
    deveConterUmDe: ["bem", "tudo", "ajudar", "algo"],
  },
  {
    nome: "4. Cliente responde 'sim' a uma pergunta",
    historico: [
      { fromMe: false, text: "Como funciona?" },
      { fromMe: true, text: "A IA responde seus clientes automaticamente 24h. Quer ver uma demonstração?", isFromAgent: true },
    ],
    novaMensagem: "Sim",
    naoDeveConter: ["o que você faz"],
    deveConterUmDe: ["então", "vou", "mostrar", "demo", "funciona", "exemplo"],
  },
  {
    nome: "5. Cliente manda emoji 👍",
    historico: [
      { fromMe: false, text: "Quero saber sobre o plano" },
      { fromMe: true, text: "O plano é R$ 99/mês com IA, Follow-up e mais!", isFromAgent: true },
    ],
    novaMensagem: "👍",
    naoDeveConter: ["o que você faz"],
    // Aceita resposta que avança a conversa (oferece cadastro, pergunta algo, etc)
    deveConterUmDe: ["gostou", "dúvida", "ajudar", "começar", "interesse", "mais", "quer", "cadastro", "criar", "conta", "perfeito", "testar"],
  },
  {
    nome: "6. Múltiplas mensagens do cliente (acumuladas)",
    historico: [
      { fromMe: false, text: "Oi" },
      { fromMe: true, text: "Oi! Rodrigo da AgenteZap. O que você faz?", isFromAgent: true },
    ],
    novaMensagem: "Trabalho com vendas\n\nPelo WhatsApp\n\nPreciso responder mais rápido",
    naoDeveConter: ["o que você faz"],
    deveConterUmDe: ["vendas", "whatsapp", "rápido", "ia", "ajudar", "automático"],
  },
  {
    nome: "7. Cliente volta ao assunto após desvio",
    historico: [
      { fromMe: false, text: "Quanto custa?" },
      { fromMe: true, text: "R$ 99/mês!", isFromAgent: true },
      { fromMe: false, text: "Vocês têm site?" },
      { fromMe: true, text: "Sim! agentezap.com", isFromAgent: true },
      { fromMe: false, text: "Achei caro" },
    ],
    novaMensagem: "E se eu pagar anual?",
    naoDeveConter: ["o que você faz"],
    deveConterUmDe: ["anual", "desconto", "preço", "valor", "pagamento", "mensal"],
  },
  {
    nome: "8. Evitar loop - não repetir resposta inicial",
    historico: [
      { fromMe: false, text: "Oi" },
      { fromMe: true, text: "Oi! Tudo bem? Sou o Rodrigo da AgenteZap. Me conta: o que você faz hoje? Vendas, atendimento ou qualificação?", isFromAgent: true },
    ],
    novaMensagem: "Oi",
    naoDeveConter: ["o que você faz", "vendas, atendimento ou qualificação", "me conta"],
    deveConterUmDe: ["ajudar", "posso", "algo"],
  },
];

async function executarTeste(teste: TestCase, contactName?: string): Promise<{ passou: boolean; motivo: string; resposta: string }> {
  const historico = criarHistoricoSimulado(teste.historico);
  
  try {
    const result = await generateAIResponse(
      USER_ID,
      historico,
      teste.novaMensagem,
      {
        contactName: contactName || 'Cliente',
        sentMedias: [],
      }
    );
    
    if (!result?.text) {
      return { passou: false, motivo: "Sem resposta da IA", resposta: "" };
    }
    
    const respostaLower = result.text.toLowerCase();
    
    // Verificar se contém algo proibido
    for (const proibido of teste.naoDeveConter) {
      if (respostaLower.includes(proibido.toLowerCase())) {
        return { 
          passou: false, 
          motivo: `Contém texto proibido: "${proibido}"`, 
          resposta: result.text 
        };
      }
    }
    
    // Verificar se contém pelo menos um termo esperado
    if (teste.deveConterUmDe && teste.deveConterUmDe.length > 0) {
      const contemUm = teste.deveConterUmDe.some(t => respostaLower.includes(t.toLowerCase()));
      if (!contemUm) {
        return { 
          passou: false, 
          motivo: `Não contém nenhum termo esperado: ${teste.deveConterUmDe.join(', ')}`, 
          resposta: result.text 
        };
      }
    }
    
    return { passou: true, motivo: "", resposta: result.text };
    
  } catch (error: any) {
    return { passou: false, motivo: `Erro: ${error.message}`, resposta: "" };
  }
}

async function main() {
  console.log('\n' + '═'.repeat(80));
  console.log('🧪 TESTE REAL DE CONTINUIDADE - AgenteZap (rodrigo4@gmail.com)');
  console.log('═'.repeat(80));
  
  // Verificar configuração do agente
  const config = await getAgentConfigInfo();
  if (!config) {
    console.log('❌ Configuração do agente não encontrada!');
    process.exit(1);
  }
  
  console.log(`\n📋 Configuração do Agente:`);
  console.log(`   ✅ Agente Ativo: ${config.isActive}`);
  console.log(`   📜 Memória (fetchHistoryOnFirstResponse): ${config.fetchHistoryOnFirstResponse ? 'ATIVO' : 'DESATIVADO'}`);
  console.log(`   📝 Prompt: ${config.prompt?.substring(0, 100)}...`);
  console.log(`   🤖 Model: ${config.model}`);
  
  console.log(`\n🎯 Testando com memória ${config.fetchHistoryOnFirstResponse ? 'ATIVA' : 'DESATIVADA'}...`);
  console.log(`   (Em ambos os casos, a IA deve manter continuidade no histórico que ela tem)`);
  
  let passaram = 0;
  let falharam = 0;
  const falhas: { nome: string; motivo: string; resposta: string }[] = [];
  
  for (const teste of TESTES) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`🎯 ${teste.nome}`);
    
    const resultado = await executarTeste(teste);
    
    if (resultado.passou) {
      passaram++;
      console.log(`✅ PASSOU`);
      console.log(`   Resposta: "${resultado.resposta.substring(0, 80)}..."`);
    } else {
      falharam++;
      console.log(`❌ FALHOU: ${resultado.motivo}`);
      console.log(`   Resposta: "${resultado.resposta}"`);
      falhas.push({ nome: teste.nome, motivo: resultado.motivo, resposta: resultado.resposta });
    }
    
    // Delay para evitar rate limit
    await new Promise(r => setTimeout(r, 1500));
  }
  
  // Relatório Final
  console.log('\n' + '═'.repeat(80));
  console.log('📊 RELATÓRIO FINAL');
  console.log('═'.repeat(80));
  
  const percentual = Math.round((passaram / TESTES.length) * 100);
  console.log(`\n✅ Passaram: ${passaram}/${TESTES.length} (${percentual}%)`);
  console.log(`❌ Falharam: ${falharam}/${TESTES.length}`);
  
  if (falhas.length > 0) {
    console.log(`\n⚠️ DETALHES DAS FALHAS:`);
    for (const f of falhas) {
      console.log(`\n   📍 ${f.nome}`);
      console.log(`      Motivo: ${f.motivo}`);
      if (f.resposta) console.log(`      Resposta: "${f.resposta.substring(0, 100)}..."`);
    }
  }
  
  console.log('\n' + '═'.repeat(80));
  
  if (percentual >= 90) {
    console.log('🎉 EXCELENTE! Sistema de continuidade funcionando corretamente!');
  } else if (percentual >= 70) {
    console.log('⚠️ BOM, mas precisa de ajustes');
  } else {
    console.log('❌ PROBLEMA CRÍTICO - Necessária correção imediata');
  }
  
  console.log('');
}

main().catch(console.error).finally(() => process.exit(0));
