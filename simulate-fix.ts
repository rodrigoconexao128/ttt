
import { generateSystemPrompt, PromptContext } from './server/promptTemplates';
import { BusinessAgentConfig } from '@db/schema';

// --- MOCK CONSTANTS ---
const SAMPLEMIX_LEGACY_PROMPT = `
🎹 Produza mais rápido, com mais qualidade e sem perder tempo procurando timbres.
Com o SAMPLEMIX, você tem acesso a um pack premium...
(Imagine todo o texto que o usuário enviou aqui)
...Me diga o seu melhor e-mail para receber o acesso.

INSTRUÇÕES CRÍTICAS DE FORMATAÇÃO:
Por favor, mantenha cada item em uma linha separada!
`;

const RODRIGO_LEGACY_PROMPT = ``; // Rodrigo usa o padrão, sem formatação extra

// --- MOCK CONFIGURATION (Business/Advanced Mode) ---
// Ambos usam o modo 'Business' ativado
const baseBusinessConfig: any = {
  id: 'business-123',
  agentName: 'Atendente Virtual',
  agentRole: 'Assistente',
  companyName: 'Minha Empresa',
  productsServices: [{ name: 'Produto X', description: 'Descrição X' }],
  isActive: true, // MODO AVANÇADO ATIVO
  toneOfVoice: 'Profissional',
  communicationStyle: 'Direto',
  formalityLevel: 5,
  emojiUsage: 'moderado',
  maxResponseLength: 200,
  useCustomerName: true,
  offerNextSteps: true
};

// --- SIMULATION FUNCTION ---
function simulate(userName: string, legacyPrompt: string, businessConfig: any) {
  console.log(`\n\n═══════════════════════════════════════════════════════════`);
  console.log(`🧪 SIMULAÇÃO PARA: ${userName}`);
  console.log(`═══════════════════════════════════════════════════════════`);
  
  // O "Fix" que eu implementei no aiAgent.ts faz exatamente isso:
  // Pega o legacyPrompt (do banco) e passa como 'customInstructions'
  const context: PromptContext = {
    customerName: 'Cliente Teste',
    customInstructions: legacyPrompt // <--- AQUI ESTÁ A MÁGICA
  };

  const finalPrompt = generateSystemPrompt(businessConfig, context);
  
  // Vamos verificar se as instruções personalizadas foram injetadas
  if (finalPrompt.includes('INSTRUÇÕES PERSONALIZADAS (DO CLIENTE)')) {
    console.log('✅ SEÇÃO DE INSTRUÇÕES ENCONTRADA NO PROMPT FINAL');
    
    // Extrair o conteúdo dessa seção para mostrar
    const match = finalPrompt.match(/INSTRUÇÕES PERSONALIZADAS \(DO CLIENTE\)\n════+\n([\s\S]*?)════+/);
    if (match && match[1].trim().length > 0) {
      console.log('\n📝 CONTEÚDO INJETADO (O QUE A IA VAI LER):');
      console.log('---------------------------------------------------');
      console.log(match[1].trim().substring(0, 150) + '...');
      console.log('---------------------------------------------------');
      console.log('✅ A IA receberá suas regras de formatação!');
    } else {
      console.log('\nℹ️ Nenhuma instrução personalizada injetada (Comportamento Padrão).');
    }
  } else {
    console.error('❌ ERRO: Seção de instruções não encontrada.');
  }
}

// --- RUN SIMULATIONS ---
console.log('Iniciando simulação do "Search & Replace Fix"...');

// 1. Simular Samplemixaudio (que editou o prompt)
simulate('Samplemixaudio@gmail.com', SAMPLEMIX_LEGACY_PROMPT, baseBusinessConfig);

// 2. Simular Rodrigo (que não editou/quer padrão)
simulate('rodrigo4@gmail.com', RODRIGO_LEGACY_PROMPT, baseBusinessConfig);
