/**
 * TESTE MISTRAL AI - Verificar se o modelo está gerando tags de mídia
 * quando recebe o prompt completo com o bloco de mídias
 */

import { Mistral } from '@mistralai/mistralai';
import dotenv from 'dotenv';

dotenv.config();

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY! });

// Mídias do rodrigo4@gmail.com (simulando o bloco gerado)
const mediaPromptBlock = `

╔══════════════════════════════════════════════════════════════════════════════╗
║  🚨🚨🚨 PRIORIDADE MÁXIMA - SISTEMA DE MÍDIAS 🚨🚨🚨                         ║
║  VOCÊ TEM ARQUIVOS DE ÁUDIO/VÍDEO/IMAGEM PARA ENVIAR!                        ║
║  ENVIAR MÍDIAS É MAIS IMPORTANTE QUE TEXTO LONGO!                            ║
╚══════════════════════════════════════════════════════════════════════════════╝

⚠️⚠️⚠️ INSTRUÇÃO CRÍTICA - LEIA E OBEDEÇA! ⚠️⚠️⚠️

VOCÊ TEM ARQUIVOS PRONTOS PARA ENVIAR! Use-os SEMPRE que aplicável.
Um áudio/vídeo vale mais que mil palavras de texto.

🎯 QUANDO VER UM GATILHO ABAIXO, ENVIE A MÍDIA IMEDIATAMENTE!
🎯 Não fique só falando - ENVIE o arquivo usando a tag!
🎯 A tag DEVE estar na sua resposta: [MEDIA:NOME] ou [ENVIAR_MIDIA:NOME]

📁 SEUS ARQUIVOS DISPONÍVEIS:

┌─────────────────────────────────────────────────────────────────────────────┐
│ 🎤 ÁUDIO: MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR                │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🎯 GATILHO: ENVIAR APENAS QUANDO: Cliente envia a PRIMEIRA mensagem      │
│ 🔑 KEYWORDS: primeira, mensagem, oi, olá, bom dia                          │
│                                                                             │
│ ✅ PARA ENVIAR ESTE ARQUIVO, INCLUA NA SUA RESPOSTA:                        │
│    [MEDIA:MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR]              │
│                                                                             │
│ 📝 EXEMPLO: "Oi! [MEDIA:MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR]"│
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ 🎤 ÁUDIO: COMO_FUNCIONA                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🎯 GATILHO: Cliente explica qual é o NEGÓCIO dele                         │
│ 🔑 KEYWORDS: vendas, loja, corretor, clínica, negócio                      │
│                                                                             │
│ ✅ PARA ENVIAR ESTE ARQUIVO, INCLUA NA SUA RESPOSTA:                        │
│    [MEDIA:COMO_FUNCIONA]                                                    │
│                                                                             │
│ 📝 EXEMPLO: "Deixa eu te mostrar! [MEDIA:COMO_FUNCIONA]"                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ 🎥 VÍDEO: DETALHES_DO_SISTEMA                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🎯 GATILHO: Cliente pede para VER o sistema, quer DEMONSTRAÇÃO            │
│ 🔑 KEYWORDS: sistema, demonstração, mostra, vídeo                          │
│                                                                             │
│ ✅ PARA ENVIAR ESTE ARQUIVO, INCLUA NA SUA RESPOSTA:                        │
│    [MEDIA:DETALHES_DO_SISTEMA]                                             │
│                                                                             │
│ 📝 EXEMPLO: "Aqui está! [MEDIA:DETALHES_DO_SISTEMA]"                       │
└─────────────────────────────────────────────────────────────────────────────┘

🔴 REGRA #1 - TAG É OBRIGATÓRIA PARA ENVIAR:
   → Inclua [MEDIA:NOME] ou [ENVIAR_MIDIA:NOME] na sua resposta
   → Sem a tag = arquivo NÃO é enviado = cliente não recebe nada!

🔴 REGRA #2 - PRIORIZE ENVIAR MÍDIA SOBRE TEXTO:
   → Se o gatilho for detectado, ENVIE A MÍDIA primeiro!
   → Um áudio de 30s explica melhor que 5 parágrafos de texto
`;

const systemPrompt = `Você é Rodrigo, especialista da AgenteZap.

${mediaPromptBlock}

Seja natural e humano nas respostas.
`;

async function testMistralMediaGeneration() {
  console.log('\n🧪 TESTANDO GERAÇÃO DE TAGS PELO MISTRAL AI\n');
  console.log('═'.repeat(70));
  
  const testCases = [
    {
      name: 'Cliente envia primeira mensagem (oi)',
      message: 'oi',
      expectedTag: 'MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR',
    },
    {
      name: 'Cliente pergunta "como funciona"',
      message: 'como funciona?',
      expectedTag: 'COMO_FUNCIONA',
    },
    {
      name: 'Cliente quer ver o sistema',
      message: 'mostra o sistema pra mim',
      expectedTag: 'DETALHES_DO_SISTEMA',
    },
  ];
  
  for (const test of testCases) {
    console.log(`\n📝 Teste: ${test.name}`);
    console.log(`   Mensagem do cliente: "${test.message}"`);
    
    try {
      const response = await mistral.chat.complete({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: test.message }
        ],
        temperature: 0.3,
        maxTokens: 500,
      });
      
      const agentResponse = response.choices?.[0]?.message?.content || '';
      console.log(`   🤖 Resposta do agente:\n      "${agentResponse}"\n`);
      
      // Verificar se a tag esperada está presente
      const hasExpectedTag = agentResponse.includes(`[MEDIA:${test.expectedTag}]`) || 
                            agentResponse.includes(`[ENVIAR_MIDIA:${test.expectedTag}]`);
      
      if (hasExpectedTag) {
        console.log(`   ✅ TAG DETECTADA: ${test.expectedTag}`);
      } else {
        console.log(`   ❌ TAG NÃO GERADA! Esperava: ${test.expectedTag}`);
        console.log(`   ⚠️  PROBLEMA: Mistral não está seguindo instruções de mídia!`);
      }
      
    } catch (error) {
      console.error(`   ❌ Erro ao chamar Mistral:`, error);
    }
    
    console.log('   ' + '-'.repeat(68));
  }
  
  console.log('\n' + '═'.repeat(70));
  console.log('\n💡 CONCLUSÃO:');
  console.log('Se as tags NÃO foram geradas, o problema é:');
  console.log('1. O Mistral não está seguindo as instruções de mídia');
  console.log('2. O bloco de mídias precisa ser reformulado');
  console.log('3. Ou o prompt do cliente está sobrescrevendo as instruções\n');
}

testMistralMediaGeneration().catch(console.error);
