/**
 * TESTE JB ELÉTRICA - DIRETO DO BANCO
 * Busca o prompt do Supabase e testa cenários
 */

import { Mistral } from '@mistralai/mistralai';
import postgres from 'postgres';

const MISTRAL_API_KEY = 'EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF';
const USER_ID_JB = 'd4a1d307-3d78-4bfe-8ab7-c4a0c3ccbb1c';

// Conexão Supabase
const sql = postgres('postgresql://postgres.bnfpcuzjvycudccycqqt:ProjetoWegui12345!@aws-0-sa-east-1.pooler.supabase.com:6543/postgres');

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

async function getPromptFromDB(): Promise<string> {
  const result = await sql`
    SELECT prompt_content 
    FROM prompt_versions 
    WHERE user_id = ${USER_ID_JB} 
      AND is_current = true 
    ORDER BY created_at DESC 
    LIMIT 1
  `;
  
  if (result.length === 0) {
    throw new Error('Prompt não encontrado');
  }
  
  return result[0].prompt_content;
}

async function testCenario(nome: string, mensagens: string[], prompt: string): Promise<void> {
  console.log('\n' + '═'.repeat(80));
  console.log(`🧪 CENÁRIO: ${nome}`);
  console.log('═'.repeat(80));

  const client = new Mistral({
    apiKey: MISTRAL_API_KEY
  });

  const messages: Message[] = [];

  for (let i = 0; i < mensagens.length; i++) {
    const userMsg = mensagens[i];
    
    console.log(`\n👤 CLIENTE: ${userMsg}`);
    
    messages.push({ role: 'user', content: userMsg });

    try {
      const response = await client.chat.complete({
        model: 'mistral-small-latest',
        maxTokens: 500,
        messages: [
          { role: 'system', content: prompt },
          ...messages.filter(m => m.role !== 'system')
        ]
      });

      const assistantMsg = response.choices?.[0]?.message?.content || '';

      messages.push({ role: 'assistant', content: assistantMsg });
      
      console.log(`🤖 AGENTE: ${assistantMsg}`);
      
      // Análise da resposta
      if (i === mensagens.length - 1) {
        console.log('\n📊 ANÁLISE:');
        analyzeResponse(nome, userMsg, assistantMsg);
      }
      
      // Pequena pausa
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ ERRO:`, error);
      break;
    }
  }
}

function analyzeResponse(cenario: string, pergunta: string, resposta: string): void {
  const respostaLower = resposta.toLowerCase();
  
  if (cenario.includes('LUZ DE TRILHO')) {
    // Cenário de serviço NÃO cadastrado
    if (respostaLower.includes('jennifer') || respostaLower.includes('jenifer')) {
      console.log('✅ CORRETO: Transferiu para Jennifer');
    } else {
      console.log('❌ ERRO: NÃO transferiu para Jennifer');
    }
    
    if (respostaLower.includes('r$') || respostaLower.includes('150')) {
      console.log('❌ ERRO: Inventou preço (não deveria)');
    } else {
      console.log('✅ CORRETO: Não inventou preço');
    }
    
    if (respostaLower.includes('agendar')) {
      console.log('❌ ERRO: Perguntou sobre agendamento (não deveria)');
    } else {
      console.log('✅ CORRETO: Não perguntou sobre agendamento');
    }
  }
  
  if (cenario.includes('TOMADA')) {
    // Cenário de serviço cadastrado
    if (respostaLower.includes('r$') && respostaLower.includes('55')) {
      console.log('✅ CORRETO: Informou preço correto (R$ 55,00)');
    } else {
      console.log('❌ ERRO: Não informou preço de R$ 55,00');
    }
    
    if (pergunta.toLowerCase().includes('sim') && respostaLower.includes('qual serviço')) {
      console.log('❌ ERRO: Perguntou serviço novamente após confirmação');
    } else if (pergunta.toLowerCase().includes('sim')) {
      console.log('✅ CORRETO: Não repetiu pergunta de serviço');
    }
  }
  
  if (cenario.includes('INSTALAR UMA TOMADA')) {
    // Cenário específico do problema reportado
    if (respostaLower.includes('r$') && respostaLower.includes('55')) {
      console.log('✅ CORRETO: "Instalar tomada" = R$ 55,00');
    } else if (respostaLower.includes('visita')) {
      console.log('❌ ERRO: Interpretou "instalar tomada" como visita técnica');
    } else {
      console.log('❌ ERRO: Resposta incorreta para "instalar tomada"');
    }
  }
}

async function runAllTests() {
  console.log('🚀 INICIANDO TESTES - JB ELÉTRICA (DIRETO DO BANCO)');
  console.log(`👤 User ID: ${USER_ID_JB}`);
  
  try {
    console.log('\n📦 Buscando prompt do Supabase...');
    const prompt = await getPromptFromDB();
    console.log(`✅ Prompt carregado! (${prompt.length} caracteres)`);
    
    // Ver se tem a regra de interpretação
    if (prompt.includes('REGRA DE INTERPRETAÇÃO - TOMADAS')) {
      console.log('✅ Prompt contém regra de interpretação de tomadas');
    } else {
      console.log('⚠️  Prompt NÃO contém regra de interpretação de tomadas');
    }
    
    console.log('\n' + '═'.repeat(80));
    
    // CENÁRIO 1: Serviço cadastrado (TOMADA)
    await testCenario('CENÁRIO 1 - TOMADA SIMPLES (VALOR: R$ 55)', [
      'Olá! Tenho interesse e queria mais informações, por favor.',
      'Qual o valor para instalar uma tomada simples?',
      'sim'
    ], prompt);
    
    // CENÁRIO 2: Serviço NÃO cadastrado (LUZ DE TRILHO)
    await testCenario('CENÁRIO 2 - LUZ DE TRILHO (NÃO CADASTRADO)', [
      'Oi, bom dia!',
      'Qual o valor para trocar essa luz comum para uma luz de trilho?'
    ], prompt);
    
    // CENÁRIO 3: Cliente novo pedindo INSTALAR UMA TOMADA
    await testCenario('CENÁRIO 3 - NOVO CLIENTE + INSTALAR UMA TOMADA', [
      'Olá',
      'não',
      'Rodrigo',
      'Preciso instalar uma tomada'
    ], prompt);
    
    console.log('\n' + '═'.repeat(80));
    console.log('✅ TESTES CONCLUÍDOS');
    console.log('═'.repeat(80));
    
  } catch (error) {
    console.error('❌ ERRO GERAL:', error);
  } finally {
    await sql.end();
  }
}

// Executar
runAllTests().catch(console.error);
