/**
 * SCRIPT DE TESTE ABRANGENTE - 100 Edições + 100 Testes de Simulador
 * 
 * Este script testa:
 * 1. Persistência de edições no banco
 * 2. Extração correta de primeira mensagem verbatim
 * 3. Respostas do simulador após cada edição
 * 4. Edge cases e cenários negativos
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';
const TEST_EMAIL = 'testevalidacao2026@teste.com';
const TEST_PASSWORD = 'Teste2026!';

// Prompt problemático do Jefersonlv26 (com múltiplos textos entre aspas)
const PROMPT_PROBLEMATICO = `**Safelock** - atendente de proteção veicular. Tom direto, técnico mas acessível.

**REGRAS:**
• **Primeira mensagem:** Envie **primeiro** o vídeo de boas-vindas (link ou anexo). Em seguida, **aguarde a resposta do cliente** (ex: "Oi", "Tudo bem?"). **Somente após a interação inicial**, envie **exatamente** o texto abaixo para apresentação inicial, **sem exibir instruções ou notas técnicas** (ex: "Use exatamente..."). Envie **apenas** o texto com psicologia reversa:
  "Oi! Eu sou a Ana. Nosso bloqueador é instalado estrategicamente e só o condutor terá acesso à informação — mas não é para todo mundo. O veículo fica totalmente bloqueado (nem ligação direta funciona) e a ignição só desbloqueia com o sensor discreto, que cabe no bolso. A instalação é única, **sem mensalidade**, e você paga **apenas R$149** no ato. Atendemos **São Paulo capital e Grande São Paulo**. Se quiser saber mais, é só pedir!"
• **Após a primeira mensagem (e somente após o cliente responder)**, explique detalhes adicionais **apenas se o cliente solicitar**, seguindo o tom da Ana. Exemplo: "O sistema é projetado para garantir segurança máxima: o bloqueador é instalado em um ponto estratégico do veículo, e apenas o condutor autorizado terá acesso à informação. A ignição só desbloqueia com o sensor discreto, que cabe no bolso e é fácil de usar."
• Destaque benefícios adicionais, **após a primeira mensagem**, se relevante: proteção 24h, instalação rápida e discreta.
• **Em mensagens seguintes**, informe proativamente que a instalação é feita no endereço do cliente por técnicos profissionais (São Paulo capital e Grande São Paulo). **Destaque o valor (R$149)** e reforce que **não há mensalidade**, usando psicologia reversa (ex: "Poucos clientes topam investir nessa segurança extra"). **Adicione, se relevante:** "Você pode parcelar em até 3x no cartão de crédito e só paga após a instalação."
• Ofereça suporte para problemas técnicos e **reforce a exclusividade do serviço** (ex: "Esse bloqueio é para quem realmente prioriza segurança — nosso suporte está sempre à disposição").
• Use emojis com moderação (max 1 por mensagem) e adote um tom natural como no exemplo da Ana

**NÃO FAZER:**
• Citar preços ou formas de pagamento **apenas após a primeira mensagem**, sempre destacando o valor único (R$149), a ausência de mensalidade e a possibilidade de parcelamento em até 3x no cartão de crédito. **Reforce que o pagamento só é feito após a instalação.**
• Prometer prazos sem consulta à equipe
• Usar linguagem muito técnica
• Ignorar dúvidas sobre instalação
• **Alterar o modelo da primeira mensagem (ex: mudar nome "Ana", estrutura, pontuação ou adicionar/remover informações)**`;

interface TestResult {
  testId: number;
  testName: string;
  editRequest: string;
  expectedKeyword?: string;
  actualResponse?: string;
  simulatorResponse?: string;
  editPersisted: boolean;
  responseCorrect: boolean;
  passed: boolean;
  errorMessage?: string;
}

let sessionCookie = '';
let userId = '';

// Lista de 100 edições para testar
const EDIT_TESTS = [
  // Testes básicos de adição
  { edit: 'Adicione a palavra TESTE1 no início do prompt', keyword: 'TESTE1' },
  { edit: 'Adicione a frase "Atendimento 24h" após a primeira mensagem', keyword: 'Atendimento 24h' },
  { edit: 'Mude o nome da atendente de Ana para Maria', keyword: 'Maria' },
  { edit: 'Adicione um emoji 🚗 após o nome Safelock', keyword: '🚗' },
  { edit: 'Mude o valor de R$149 para R$199', keyword: 'R$199' },
  
  // Testes de formatação
  { edit: 'Coloque a primeira mensagem em negrito', keyword: '**Oi!' },
  { edit: 'Adicione quebras de linha na primeira mensagem', keyword: '\n' },
  { edit: 'Remova todos os emojis do prompt', keyword: '', negativeTest: true, notExpected: '🚗' },
  { edit: 'Adicione itálico no texto sobre instalação', keyword: '_instalação_' },
  { edit: 'Mude a estrutura para lista com bullets', keyword: '•' },
  
  // Testes de remoção
  { edit: 'Remova a menção a São Paulo', keyword: '', negativeTest: true, notExpected: 'São Paulo' },
  { edit: 'Remova o texto sobre parcelamento', keyword: '', negativeTest: true, notExpected: 'parcelar' },
  { edit: 'Readicione São Paulo ao texto', keyword: 'São Paulo' },
  { edit: 'Readicione informação de parcelamento em 3x', keyword: 'parcel' },
  
  // Testes de substituição
  { edit: 'Substitua "proteção veicular" por "segurança automotiva"', keyword: 'segurança automotiva' },
  { edit: 'Mude o tom para mais informal e descontraído', keyword: '' }, // Verificação manual
  { edit: 'Torne o texto mais vendedor e persuasivo', keyword: '' },
  { edit: 'Adicione urgência com "oferta por tempo limitado"', keyword: 'tempo limitado' },
  { edit: 'Remova a urgência e mantenha tom neutro', keyword: '', negativeTest: true, notExpected: 'tempo limitado' },
  
  // Testes de edge cases - primeira mensagem
  { edit: 'Mude a primeira mensagem para: "Olá! Sou a Carolina, da Safelock."', keyword: 'Carolina' },
  { edit: 'Adicione o número de telefone 11999999999 na primeira mensagem', keyword: '11999999999' },
  { edit: 'Volte o nome para Ana na primeira mensagem', keyword: 'Ana' },
  { edit: 'Adicione emoji de carro 🚙 na primeira mensagem', keyword: '🚙' },
  { edit: 'Remova o emoji de carro da primeira mensagem', keyword: '', negativeTest: true, notExpected: '🚙' },
  
  // Testes de estrutura complexa
  { edit: 'Adicione uma seção de FAQ com 3 perguntas frequentes', keyword: 'FAQ' },
  { edit: 'Crie uma lista de benefícios em tópicos', keyword: 'benefícios' },
  { edit: 'Adicione depoimento de cliente fictício', keyword: 'depoimento' },
  { edit: 'Remova o depoimento', keyword: '', negativeTest: true, notExpected: 'depoimento' },
  { edit: 'Adicione seção de garantia de 30 dias', keyword: 'garantia' },
  
  // Testes de persistência
  { edit: 'PERSIST_TEST_001: Adicione esta marcação no início', keyword: 'PERSIST_TEST_001' },
  { edit: 'PERSIST_TEST_002: Adicione segunda marcação', keyword: 'PERSIST_TEST_002' },
  { edit: 'PERSIST_TEST_003: Adicione terceira marcação', keyword: 'PERSIST_TEST_003' },
  { edit: 'Remova PERSIST_TEST_001 mas mantenha os outros', keyword: 'PERSIST_TEST_002' },
  { edit: 'Verifique se PERSIST_TEST_003 ainda existe', keyword: 'PERSIST_TEST_003' },
  
  // Testes de conflito
  { edit: 'Mude o valor para R$99', keyword: 'R$99' },
  { edit: 'Agora mude o valor para R$199', keyword: 'R$199' },
  { edit: 'Mude novamente para R$149 (valor original)', keyword: 'R$149' },
  { edit: 'Adicione que o valor é promocional', keyword: 'promocional' },
  { edit: 'Remova a palavra promocional', keyword: '', negativeTest: true, notExpected: 'promocional' },
  
  // Testes de caracteres especiais
  { edit: 'Adicione símbolo de porcentagem 10% de desconto', keyword: '10%' },
  { edit: 'Adicione aspas duplas "garantia total"', keyword: '"garantia total"' },
  { edit: 'Adicione aspas simples \'atendimento vip\'', keyword: "atendimento vip" },
  { edit: 'Adicione asteriscos para negrito **destaque**', keyword: '**destaque**' },
  { edit: 'Adicione underscores para itálico _importante_', keyword: '_importante_' },
  
  // Testes de comprimento
  { edit: 'Torne a primeira mensagem mais curta (máximo 100 caracteres)', keyword: 'Oi!' },
  { edit: 'Expanda a primeira mensagem com mais detalhes sobre segurança', keyword: 'segurança' },
  { edit: 'Adicione um parágrafo longo sobre a história da empresa', keyword: 'história' },
  { edit: 'Remova o parágrafo da história', keyword: '', negativeTest: true, notExpected: 'história' },
  { edit: 'Mantenha o prompt conciso e direto', keyword: '' },
  
  // Testes de idioma/tom
  { edit: 'Adicione gírias paulistanas como "mano", "firmeza"', keyword: 'firmeza' },
  { edit: 'Remova as gírias e use linguagem formal', keyword: '', negativeTest: true, notExpected: 'firmeza' },
  { edit: 'Use linguagem técnica sobre o produto', keyword: 'técnic' },
  { edit: 'Simplifique para linguagem leiga', keyword: '' },
  { edit: 'Adicione termos de confiança como "garantido", "comprovado"', keyword: 'garantido' },
  
  // Testes de múltiplas alterações
  { edit: 'Mude nome para Pedro E valor para R$250', keyword: 'Pedro' },
  { edit: 'Adicione WhatsApp E Instagram nos contatos', keyword: 'WhatsApp' },
  { edit: 'Remova Pedro e coloque novamente Ana', keyword: 'Ana' },
  { edit: 'Mude valor de volta para R$149', keyword: 'R$149' },
  { edit: 'Adicione email de contato safelock@email.com', keyword: 'safelock@email.com' },
  
  // Testes de validação de primeira mensagem
  { edit: 'Mude APENAS a primeira mensagem para incluir promoção', keyword: 'promoção' },
  { edit: 'A primeira mensagem deve começar com Bom dia', keyword: 'Bom dia' },
  { edit: 'A primeira mensagem deve ter saudação dinâmica', keyword: 'saudação' },
  { edit: 'Volte para primeira mensagem começando com Oi', keyword: 'Oi!' },
  { edit: 'Adicione nome do cliente na primeira mensagem {NOME}', keyword: '{NOME}' },
  
  // Testes de stress
  { edit: 'Adicione 10 emojis diferentes: 🚗🔒💰✅🎯📞💪🏆⭐🔥', keyword: '🚗' },
  { edit: 'Remova todos os 10 emojis', keyword: '', negativeTest: true, notExpected: '🏆' },
  { edit: 'Adicione texto muito longo com 500 palavras sobre segurança veicular', keyword: 'segurança veicular' },
  { edit: 'Reduza o prompt para no máximo 200 palavras', keyword: '' },
  { edit: 'Otimize o prompt para conversão máxima', keyword: '' },
  
  // Testes de recuperação
  { edit: 'BACKUP_MARKER_XYZ123', keyword: 'BACKUP_MARKER_XYZ123' },
  { edit: 'Faça 5 alterações aleatórias no prompt', keyword: '' },
  { edit: 'Verifique se BACKUP_MARKER_XYZ123 ainda existe', keyword: 'BACKUP_MARKER_XYZ123' },
  { edit: 'Remova BACKUP_MARKER_XYZ123', keyword: '', negativeTest: true, notExpected: 'BACKUP_MARKER_XYZ123' },
  { edit: 'Restaure o prompt para o formato padrão Safelock', keyword: 'Safelock' },
  
  // Testes finais de integridade
  { edit: 'FINAL_TEST_001: Teste de integridade 1', keyword: 'FINAL_TEST_001' },
  { edit: 'FINAL_TEST_002: Teste de integridade 2', keyword: 'FINAL_TEST_002' },
  { edit: 'FINAL_TEST_003: Teste de integridade 3', keyword: 'FINAL_TEST_003' },
  { edit: 'Verifique que todos os FINAL_TEST existem', keyword: 'FINAL_TEST' },
  { edit: 'Limpe os marcadores de teste e finalize', keyword: 'Safelock' },
  
  // Últimos 20 testes - Edge cases extremos
  { edit: 'Adicione HTML <b>teste</b> no prompt', keyword: '<b>teste</b>' },
  { edit: 'Adicione código JavaScript alert("test")', keyword: 'alert' },
  { edit: 'Remova qualquer código potencialmente perigoso', keyword: '', negativeTest: true, notExpected: 'alert' },
  { edit: 'Adicione URL https://safelock.com.br', keyword: 'https://safelock.com.br' },
  { edit: 'Adicione número formatado (11) 99999-9999', keyword: '(11) 99999-9999' },
  { edit: 'Adicione CPF mascarado ***.***.***-**', keyword: '***.***.***-**' },
  { edit: 'Remova dados sensíveis do prompt', keyword: '', negativeTest: true, notExpected: '***.***.***-**' },
  { edit: 'Adicione data de validade 31/12/2026', keyword: '31/12/2026' },
  { edit: 'Adicione horário de funcionamento 09h às 18h', keyword: '09h às 18h' },
  { edit: 'Mude para 24 horas de atendimento', keyword: '24 horas' },
  
  // Testes de prompt com múltiplos textos entre aspas (o bug original)
  { edit: 'A primeira mensagem deve ser exatamente: "Olá! Sou a assistente virtual da Safelock."', keyword: 'assistente virtual' },
  { edit: 'Adicione exemplo de resposta: "Obrigado pelo contato!"', keyword: 'Obrigado pelo contato' },
  { edit: 'Adicione outro exemplo: "Posso ajudar com mais alguma coisa?"', keyword: 'Posso ajudar' },
  { edit: 'Verifique que a PRIMEIRA mensagem ainda é sobre assistente virtual', keyword: 'assistente virtual' },
  { edit: 'Mude primeira mensagem de volta para Ana da Safelock', keyword: 'Ana' },
  { edit: 'Restaure o prompt original completo do Safelock', keyword: 'bloqueador é instalado estrategicamente' },
  { edit: 'Confirme que o prompt está funcionando corretamente', keyword: 'Safelock' },
  { edit: 'Teste final de persistência: MARKER_FINAL_100', keyword: 'MARKER_FINAL_100' },
  { edit: 'Remova MARKER_FINAL_100 e finalize testes', keyword: 'Safelock' },
  { edit: 'Prompt final pronto para produção', keyword: 'Safelock' },
];

async function login(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    
    const data = await response.json() as any;
    
    if (data.user) {
      userId = data.user.id;
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        sessionCookie = setCookie.split(';')[0];
      }
      console.log('✅ Login bem-sucedido, userId:', userId);
      return true;
    }
    console.log('❌ Login falhou:', data);
    return false;
  } catch (error) {
    console.log('❌ Erro no login:', error);
    return false;
  }
}

async function setInitialPrompt(): Promise<boolean> {
  try {
    // Primeiro, criar ou atualizar o ai_agent_config
    const response = await fetch(`${BASE_URL}/api/agent-config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify({
        prompt: PROMPT_PROBLEMATICO,
        is_active: true,
      }),
    });
    
    const data = await response.json() as any;
    console.log('✅ Prompt inicial configurado');
    return true;
  } catch (error) {
    console.log('❌ Erro ao configurar prompt inicial:', error);
    return false;
  }
}

async function editPrompt(editRequest: string): Promise<{ success: boolean; newPrompt?: string; error?: string }> {
  try {
    const response = await fetch(`${BASE_URL}/api/agent-config/edit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify({
        editRequest,
        configType: 'ai_agent_config',
      }),
    });
    
    const data = await response.json() as any;
    
    if (data.success || data.newPrompt) {
      return { success: true, newPrompt: data.newPrompt };
    }
    return { success: false, error: data.error || 'Unknown error' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function testSimulator(message: string = 'oi'): Promise<{ success: boolean; response?: string; error?: string }> {
  try {
    const response = await fetch(`${BASE_URL}/api/simulator/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify({
        message,
        conversationHistory: [],
      }),
    });
    
    const data = await response.json() as any;
    
    if (data.response) {
      return { success: true, response: data.response };
    }
    return { success: false, error: data.error || 'No response' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function getPromptFromDB(): Promise<string | null> {
  try {
    const response = await fetch(`${BASE_URL}/api/agent-config`, {
      headers: { 'Cookie': sessionCookie },
    });
    
    const data = await response.json() as any;
    return data.prompt || null;
  } catch {
    return null;
  }
}

async function runTests(): Promise<void> {
  console.log('🚀 Iniciando testes abrangentes...\n');
  console.log('=' .repeat(80));
  
  // Login
  const loggedIn = await login();
  if (!loggedIn) {
    console.log('❌ Falha no login. Abortando testes.');
    return;
  }
  
  // Configurar prompt inicial
  const promptSet = await setInitialPrompt();
  if (!promptSet) {
    console.log('❌ Falha ao configurar prompt inicial. Abortando testes.');
    return;
  }
  
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;
  
  console.log(`\n📊 Executando ${EDIT_TESTS.length} testes de edição...\n`);
  
  for (let i = 0; i < EDIT_TESTS.length; i++) {
    const test = EDIT_TESTS[i];
    const testId = i + 1;
    
    console.log(`\n[${testId}/${EDIT_TESTS.length}] Testando: "${test.edit.substring(0, 50)}..."`);
    
    // 1. Fazer a edição
    const editResult = await editPrompt(test.edit);
    
    // 2. Verificar persistência no banco
    const promptFromDB = await getPromptFromDB();
    let editPersisted = false;
    
    if (test.negativeTest && test.notExpected) {
      editPersisted = promptFromDB ? !promptFromDB.includes(test.notExpected) : false;
    } else if (test.keyword) {
      editPersisted = promptFromDB ? promptFromDB.includes(test.keyword) : false;
    } else {
      editPersisted = editResult.success;
    }
    
    // 3. Testar simulador
    const simResult = await testSimulator('oi');
    
    // 4. Verificar se resposta do simulador não contém instruções ou exemplos
    let responseCorrect = true;
    if (simResult.response) {
      // Verificar se não está vazando instruções
      const badPatterns = [
        'Use exatamente',
        'Exemplo:',
        'O sistema é projetado',
        '**Primeira mensagem:**',
        '**REGRAS:**',
      ];
      
      for (const pattern of badPatterns) {
        if (simResult.response.includes(pattern)) {
          responseCorrect = false;
          break;
        }
      }
      
      // Para primeira mensagem, verificar se contém saudação (Oi, Olá, etc.)
      if (responseCorrect && simResult.response.length > 50) {
        const hasGreeting = /^(Oi|Olá|Bom dia|Boa tarde|Boa noite|Olá!)/i.test(simResult.response);
        responseCorrect = hasGreeting;
      }
    }
    
    const testPassed = editResult.success && editPersisted && responseCorrect;
    
    if (testPassed) {
      passed++;
      console.log(`  ✅ PASSOU`);
    } else {
      failed++;
      console.log(`  ❌ FALHOU`);
      if (!editResult.success) console.log(`     - Edição falhou: ${editResult.error}`);
      if (!editPersisted) console.log(`     - Não persistiu no banco`);
      if (!responseCorrect) console.log(`     - Resposta do simulador incorreta`);
    }
    
    results.push({
      testId,
      testName: test.edit,
      editRequest: test.edit,
      expectedKeyword: test.keyword,
      actualResponse: editResult.newPrompt?.substring(0, 100),
      simulatorResponse: simResult.response?.substring(0, 100),
      editPersisted,
      responseCorrect,
      passed: testPassed,
      errorMessage: editResult.error,
    });
    
    // Delay entre testes para não sobrecarregar
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Sumário final
  console.log('\n' + '=' .repeat(80));
  console.log('\n📊 SUMÁRIO DOS TESTES:\n');
  console.log(`Total de testes: ${EDIT_TESTS.length}`);
  console.log(`✅ Passou: ${passed} (${((passed / EDIT_TESTS.length) * 100).toFixed(1)}%)`);
  console.log(`❌ Falhou: ${failed} (${((failed / EDIT_TESTS.length) * 100).toFixed(1)}%)`);
  
  // Listar falhas
  const failures = results.filter(r => !r.passed);
  if (failures.length > 0) {
    console.log('\n❌ Testes que falharam:');
    failures.forEach(f => {
      console.log(`  [${f.testId}] ${f.testName.substring(0, 60)}...`);
      if (f.errorMessage) console.log(`      Erro: ${f.errorMessage}`);
    });
  }
  
  console.log('\n' + '=' .repeat(80));
  console.log('🏁 Testes concluídos!\n');
}

// Executar
runTests().catch(console.error);
