/**
 * TESTE: IA Cliente vs IA Agente - Problema de Lista Truncada
 * 
 * OBJETIVO: Descobrir porque o Mistral trunca listas quando prompt é muito grande
 * 
 * CENÁRIO:
 * - Cliente lmcoriolano@hotmail.com (Lucas Coriolano - Objetivo Milionário)
 * - Prompt: ~36K chars (MUITO GRANDE)
 * - Lista: 71 categorias no prompt
 * - Pergunta: "o que tem no pack?"
 * - PROBLEMA: Mistral retorna apenas 8-17 itens ao invés de 71
 * 
 * HIPÓTESES A TESTAR:
 * 1. Prompt grande confunde a IA (36K chars)
 * 2. Instruções importantes estão no MEIO do prompt (perdidas)
 * 3. maxTokens não é o problema (já está em 8000)
 * 4. Temperature=0.0 pode estar limitando criatividade
 * 5. Posição da lista no prompt importa
 */

import { Mistral } from '@mistralai/mistralai';

const MISTRAL_API_KEY = 'EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF';

// Prompt completo do cliente (obtido do Supabase)
const fullPrompt = `Você é o Lucas, Atendimento e Suporte.

Você trabalha para a empresa Objetivo Milionário.

Sobre a empresa: A Objetivo Milionário se destaca na forma como entregamos o conteúdo. O nosso produto tem mais de 17TB de arquivos completos, desde Ferramentas até Designs e muito mais.

Setor de atuação: Marketing

Público-alvo: Pessoas interessadas em iniciar no marketing, que estejam em busca de ferramentas, que não sabem como começar, que querem ajuda para vender e procuram ferramentas de valor, qualquer tipo de pessoa.

Produtos/Serviços oferecidos:

Superpack Objetivo Milionário: O Maior Pack de Marketing Digital do Brasil
✅ Mais de 71 categorias organizadas
✅ Mais de 17TB de materiais
✅ Acesso imediato na Área de Membros
✅ Atualizações e bônus exclusivos
🔥 O Superpack Objetivo Milionário é único: não é só um pack, é a chave para você dominar o Marketing Digital, economizar tempo e ter acesso a tudo que precisa em um só lugar.
(Pack é avaliado em mais de R$ 27.000)

[... prompt muito grande - cortado para economizar tokens ...]

REGRA IMPORTANTE:

Sempre que o cliente perguntar sobre o conteúdo do Pack, envie TODAS as 71 categorias:

1. 🎨 Carrosséis no Canva
2. ☁️ Drive Plus
3. 🔗 Links Úteis
4. 💼 5.000 Logos
5. 📚 3.000 PLRs PT-BR
6. 🐾 Dance Pets
7. 🤖 Ferramentas IA
8. 🎬 Mundo dos Filmes
9. 🐀 Drive BlackRat
10. 🍔 Saas Completos - IFood, Delivery e etc
11. 💾 Super Drive
12. 🔊 Sound Effects
13. 💰 Objetivo Milionário
14. ✔️ Checklist Milionário
15. 📊 Pack Planilhas
16. 💬 Ferramentas WhatsApp
17. 📸 Bots Instagram
18. 🌐 Páginas Figma
19. 🎮 PlayBox
20. 📲 Templates Link na BIO
21. 🤖 Pack Bot
22. 🚀 Superpack 7TB
23. 🚗 Gestor de Tráfego
24. 🐒 Pack Studio Monkey
25. 🎨 Templates Elementor
26. 🎨 Pack Design
27. 🚀 Superpack 2.0
28. 📄 677 Modelos de Páginas
29. ⏳ Pack Typebot
30. 🎓 Pack Cursos
31. 🔔 Gerador de Notificações
32. 🏢 Fornecedores
33. 🔧 Elementor PRO + Plugins
34. 🎨 Pack de Artes Criativos
35. 🖥️ Superpack Adobe (Todos os 17 Softwares Adobe)
36. 🖌️ Pack Canva Design
37. 🇬🇧 3.000 PLRs Inglês
38. 💎 Vídeos Lifestyles Milionário
39. 👥 Área e Membros MembersFlix
40. 🛒 Página de Vendas
41. 📡 Streamings
42. 🛠️ Ferramentas PRO
43. 🖌️ Artes Photoshop e Canva
44. 🖤 Vídeos Dark Money
45. 💎 Pack Canva Premium
46. 🎟️ Painel Rifa
47. 💥 Sistema de Raspadinha
48. 💻 Programação
49. 📱 Painel SMM
50. ⚡ Zona Hacker
51. 🎰 Dono de Casino
52. 📺 Dono de IPTV
53. 🎯 Pack de Leads
54. 🔍 Motores de Busca
55. 📲 APKs
56. 🎁 Bônus
57. 💵 Dono de Casino
58. ✅ IPTV Liberado
59. 🎮 Jogos
60. 🔥 Conteúdo Hot
61. 🔄 Outros
62. 🤝 Seja meu Sócio
63. 🗃️ Puxar Dados
64. 💡 Métodos
65. 🌐 Sites Ocultos
66. 🎁 Bônus - MDS - Método Disparo Simplificado
67. 🎁 Bônus - Grupo de Networking
68. 🎁 Bônus - Como vender na DFG
69. 🎁 Bônus - Como vender na Desapego
70. 🎁 Bônus - Como vender na GGMax
71. 🎁 Bônus - Painel de IAs

E muito mais! 🚀`;

const listContent = `1. 🎨 Carrosséis no Canva
2. ☁️ Drive Plus
3. 🔗 Links Úteis
4. 💼 5.000 Logos
5. 📚 3.000 PLRs PT-BR
6. 🐾 Dance Pets
7. 🤖 Ferramentas IA
8. 🎬 Mundo dos Filmes
9. 🐀 Drive BlackRat
10. 🍔 Saas Completos - IFood, Delivery e etc
11. 💾 Super Drive
12. 🔊 Sound Effects
13. 💰 Objetivo Milionário
14. ✔️ Checklist Milionário
15. 📊 Pack Planilhas
16. 💬 Ferramentas WhatsApp
17. 📸 Bots Instagram
18. 🌐 Páginas Figma
19. 🎮 PlayBox
20. 📲 Templates Link na BIO
21. 🤖 Pack Bot
22. 🚀 Superpack 7TB
23. 🚗 Gestor de Tráfego
24. 🐒 Pack Studio Monkey
25. 🎨 Templates Elementor
26. 🎨 Pack Design
27. 🚀 Superpack 2.0
28. 📄 677 Modelos de Páginas
29. ⏳ Pack Typebot
30. 🎓 Pack Cursos
31. 🔔 Gerador de Notificações
32. 🏢 Fornecedores
33. 🔧 Elementor PRO + Plugins
34. 🎨 Pack de Artes Criativos
35. 🖥️ Superpack Adobe (Todos os 17 Softwares Adobe)
36. 🖌️ Pack Canva Design
37. 🇬🇧 3.000 PLRs Inglês
38. 💎 Vídeos Lifestyles Milionário
39. 👥 Área e Membros MembersFlix
40. 🛒 Página de Vendas
41. 📡 Streamings
42. 🛠️ Ferramentas PRO
43. 🖌️ Artes Photoshop e Canva
44. 🖤 Vídeos Dark Money
45. 💎 Pack Canva Premium
46. 🎟️ Painel Rifa
47. 💥 Sistema de Raspadinha
48. 💻 Programação
49. 📱 Painel SMM
50. ⚡ Zona Hacker
51. 🎰 Dono de Casino
52. 📺 Dono de IPTV
53. 🎯 Pack de Leads
54. 🔍 Motores de Busca
55. 📲 APKs
56. 🎁 Bônus
57. 💵 Dono de Casino
58. ✅ IPTV Liberado
59. 🎮 Jogos
60. 🔥 Conteúdo Hot
61. 🔄 Outros
62. 🤝 Seja meu Sócio
63. 🗃️ Puxar Dados
64. 💡 Métodos
65. 🌐 Sites Ocultos
66. 🎁 Bônus - MDS - Método Disparo Simplificado
67. 🎁 Bônus - Grupo de Networking
68. 🎁 Bônus - Como vender na DFG
69. 🎁 Bônus - Como vender na Desapego
70. 🎁 Bônus - Como vender na GGMax
71. 🎁 Bônus - Painel de IAs`;

console.log('═══════════════════════════════════════════════════════════════');
console.log('🧪 TESTE: IA Cliente vs IA Agente - Debug Lista Truncada');
console.log('═══════════════════════════════════════════════════════════════\n');

const model = 'mistral-small-latest';
const pergunta = "o que tem no pack?";
const itemCount = 71;

const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });

console.log('═══════════════════════════════════════════════════════════════');
console.log('🧪 TESTE 1: System Message com Lista PRÉ-FORMATADA (template)');
console.log('─────────────────────────────────────────────────────────────\n');

const messages1 = [
  {
    role: "system",
    content: `Você é Lucas, assistente de vendas da Objetivo Milionário.

QUANDO O CLIENTE PERGUNTAR SOBRE O CONTEÚDO DO PACK, RESPONDA EXATAMENTE:

"Olá! 😊 Aqui está tudo que tem no Superpack Objetivo Milionário:

${listContent}

E muito mais! 🚀

Quer que eu explique melhor alguma categoria específica?"`
  },
  {
    role: "user",
    content: pergunta
  }
];

console.log(`📤 Enviando para Mistral AI...`);
console.log(`   - Model: ${model}`);
console.log(`   - MaxTokens: 8000`);
console.log(`   - Temperature: 0.0\n`);

const startTime1 = Date.now();
const response1 = await mistral.chat.complete({
  model: model,
  messages: messages1,
  temperature: 0.0,
  maxTokens: 8000,
  randomSeed: 42
});

const duration1 = Date.now() - startTime1;
const resposta1 = response1.choices[0].message.content;
const itemsReturned1 = (resposta1.match(/^\d{1,3}\.\s*/gm) || []).length;

console.log(`✅ Resposta recebida em ${duration1}ms`);
console.log(`   - Tamanho: ${resposta1.length} chars`);
console.log(`   - Itens retornados: ${itemsReturned1}/${itemCount}\n`);

console.log(`📝 Resposta (primeiros 400 chars):`);
console.log(resposta1.substring(0, 400));
console.log('\n...\n');
console.log(`📝 Resposta (últimos 200 chars):`);
console.log(resposta1.substring(resposta1.length - 200));

const sucesso1 = itemsReturned1 >= itemCount * 0.9;
console.log(`\n${sucesso1 ? '✅' : '❌'} TESTE 1: ${sucesso1 ? 'PASSOU' : 'FALHOU'}`);
console.log(`   Taxa: ${((itemsReturned1 / itemCount) * 100).toFixed(1)}%\n`);

// TESTE 2: Lista na última user message (mais próxima da geração)
console.log('═══════════════════════════════════════════════════════════════');
console.log('📊 TESTE 2: Lista na ÚLTIMA user message (posição estratégica)');
console.log('─────────────────────────────────────────────────────────────\n');

const messages2 = [
  {
    role: "system",
    content: `Você é Lucas, assistente de vendas da Objetivo Milionário.

Quando o cliente perguntar sobre o pack, copie EXATAMENTE a lista fornecida na próxima mensagem.`
  },
  {
    role: "user",
    content: `O cliente perguntou: "${pergunta}"

Responda com saudação curta e depois copie esta lista COMPLETA (${itemCount} itens):

${listContent}

Depois pergunte se quer saber mais sobre alguma categoria.`
  }
];

console.log(`📤 Enviando para Mistral AI...\n`);

const startTime2 = Date.now();
const response2 = await mistral.chat.complete({
  model: model,
  messages: messages2,
  temperature: 0.0,
  maxTokens: 8000,
  randomSeed: 42
});

const duration2 = Date.now() - startTime2;
const resposta2 = response2.choices[0].message.content;
const itemsReturned2 = (resposta2.match(/^\d{1,3}\.\s*/gm) || []).length;

console.log(`✅ Resposta recebida em ${duration2}ms`);
console.log(`   - Tamanho: ${resposta2.length} chars`);
console.log(`   - Itens retornados: ${itemsReturned2}/${itemCount}\n`);

console.log(`📝 Resposta (primeiros 400 chars):`);
console.log(resposta2.substring(0, 400));
console.log('\n...\n');
console.log(`📝 Resposta (últimos 200 chars):`);
console.log(resposta2.substring(resposta2.length - 200));

const sucesso2 = itemsReturned2 >= itemCount * 0.9;
console.log(`\n${sucesso2 ? '✅' : '❌'} TESTE 2: ${sucesso2 ? 'PASSOU' : 'FALHOU'}`);
console.log(`   Taxa: ${((itemsReturned2 / itemCount) * 100).toFixed(1)}%\n`);

// TESTE 3: Temperature MAIOR (0.3) para ver se ajuda
console.log('═══════════════════════════════════════════════════════════════');
console.log('📊 TESTE 3: Temperature 0.3 (ao invés de 0.0)');
console.log('─────────────────────────────────────────────────────────────\n');

const messages3 = [
  {
    role: "system",
    content: `Você é Lucas da Objetivo Milionário.

REGRA: Quando perguntarem sobre o pack, copie a lista completa sem pular nada.`
  },
  {
    role: "user",
    content: `Cliente: "${pergunta}"

Copie esta lista COMPLETA:

${listContent}`
  }
];

console.log(`📤 Enviando com temperature=0.3...\n`);

const startTime3 = Date.now();
const response3 = await mistral.chat.complete({
  model: model,
  messages: messages3,
  temperature: 0.3, // DIFERENTE!
  maxTokens: 8000,
  randomSeed: 42
});

const duration3 = Date.now() - startTime3;
const resposta3 = response3.choices[0].message.content;
const itemsReturned3 = (resposta3.match(/^\d{1,3}\.\s*/gm) || []).length;

console.log(`✅ Resposta recebida em ${duration3}ms`);
console.log(`   - Tamanho: ${resposta3.length} chars`);
console.log(`   - Itens retornados: ${itemsReturned3}/${itemCount}\n`);

console.log(`📝 Resposta (primeiros 400 chars):`);
console.log(resposta3.substring(0, 400));
console.log('\n...\n');
console.log(`📝 Resposta (últimos 200 chars):`);
console.log(resposta3.substring(resposta3.length - 200));

const sucesso3 = itemsReturned3 >= itemCount * 0.9;
console.log(`\n${sucesso3 ? '✅' : '❌'} TESTE 3: ${sucesso3 ? 'PASSOU' : 'FALHOU'}`);
console.log(`   Taxa: ${((itemsReturned3 / itemCount) * 100).toFixed(1)}%\n`);

// RESUMO FINAL
console.log('═══════════════════════════════════════════════════════════════');
console.log('📊 RESUMO DOS TESTES');
console.log('═══════════════════════════════════════════════════════════════\n');

const testes = [
  { nome: 'TESTE 1 (System com Template)', itens: itemsReturned1, sucesso: sucesso1, tempo: duration1 },
  { nome: 'TESTE 2 (Lista na User Message)', itens: itemsReturned2, sucesso: sucesso2, tempo: duration2 },
  { nome: 'TESTE 3 (Temperature 0.3)', itens: itemsReturned3, sucesso: sucesso3, tempo: duration3 }
];

testes.forEach((teste, i) => {
  const taxa = ((teste.itens / itemCount) * 100).toFixed(1);
  console.log(`${teste.sucesso ? '✅' : '❌'} ${teste.nome}`);
  console.log(`   Itens: ${teste.itens}/${itemCount} (${taxa}%)`);
  console.log(`   Tempo: ${teste.tempo}ms\n`);
});

const melhorTeste = testes.reduce((prev, curr) => 
  curr.itens > prev.itens ? curr : prev
);

console.log('═══════════════════════════════════════════════════════════════');
console.log(`🏆 MELHOR RESULTADO: ${melhorTeste.nome}`);
console.log(`   - ${melhorTeste.itens}/${itemCount} itens (${((melhorTeste.itens / itemCount) * 100).toFixed(1)}%)`);
console.log(`   - Tempo: ${melhorTeste.tempo}ms`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (melhorTeste.sucesso) {
  console.log('✅ SOLUÇÃO ENCONTRADA! Implementar esta abordagem no aiAgent.ts');
  console.log(`\n📝 INSTRUÇÕES PARA IMPLEMENTAÇÃO:`);
  console.log(`   1. Detectar pedido de lista`);
  console.log(`   2. Extrair lista do prompt`);
  console.log(`   3. Aplicar a técnica do ${melhorTeste.nome}`);
} else {
  console.log('⚠️ NENHUM TESTE PASSOU. Próximos passos:');
  console.log('   - Testar mistral-large-latest (modelo maior)');
  console.log('   - Dividir lista em 2-3 mensagens sequenciais');
  console.log('   - Usar function calling / tools');
}
const model = config.model || 'mistral-small-latest';

console.log(`✅ Configuração encontrada:`);
console.log(`   - User ID: ${config.user_id}`);
console.log(`   - Model: ${model}`);
console.log(`   - Prompt size: ${fullPrompt.length} chars`);
console.log(`   - Active: ${config.is_active}`);

// Passo 2: Buscar API Key do Mistral
console.log('\n📡 2. Buscando API Key do Mistral...');

const apiKeyResponse = await fetch(`${SUPABASE_URL}/rest/v1/system_config?chave=eq.mistral_api_key`, {
  headers: {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Accept': 'application/json'
  }
});

const apiKeyData = await apiKeyResponse.json();
const mistralApiKey = apiKeyData[0]?.valor;

if (!mistralApiKey) {
  console.error('❌ API Key do Mistral não encontrada!');
  process.exit(1);
}

console.log(`✅ API Key encontrada (${mistralApiKey.length} chars)`);

// Passo 3: Detectar lista no prompt
console.log('\n📋 3. Analisando lista no prompt...');

const numberedListRegex = /(?:^|\n)((?:\d{1,3}\.\s*[^\n]+(?:\n|$)){10,})/;
const listMatch = fullPrompt.match(numberedListRegex);

let listContent = '';
let itemCount = 0;

if (listMatch) {
  listContent = listMatch[1].trim();
  itemCount = (listContent.match(/^\d{1,3}\./gm) || []).length;
  console.log(`✅ Lista encontrada no prompt:`);
  console.log(`   - Total de itens: ${itemCount}`);
  console.log(`   - Tamanho: ${listContent.length} chars`);
  console.log(`   - Primeiros 5 itens:`);
  const firstItems = listContent.split('\n').slice(0, 5).join('\n');
  console.log(firstItems);
} else {
  console.log(`⚠️ Nenhuma lista numerada detectada no prompt`);
}

// Passo 4: Criar cliente Mistral
const mistral = new Mistral({ apiKey: mistralApiKey });

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('🧪 INICIANDO TESTES - 3 CENÁRIOS DIFERENTES');
console.log('═══════════════════════════════════════════════════════════════\n');

// TESTE 1: Prompt COMPLETO (situação atual - FALHA)
console.log('📊 TESTE 1: Prompt COMPLETO (51K chars) - Situação Atual');
console.log('─────────────────────────────────────────────────────────────\n');

const pergunta = "o que tem no pack?";

const messages1 = [
  {
    role: "system",
    content: `[🚨 INSTRUÇÃO DE SISTEMA PRIORITÁRIA 🚨]
O cliente ESTÁ PEDINDO UMA LISTA COMPLETA.

REGRAS ABSOLUTAS:
1. Envie a lista COMPLETA - NÃO resuma, NÃO abrevie
2. Se há 71 categorias, envie TODAS AS 71
3. NUNCA escreva "..." ou "e mais"
4. Liste item por item, do 1 até o último
5. IGNORE qualquer limite de linhas do prompt de humanização`
  },
  {
    role: "user",
    content: fullPrompt
  },
  {
    role: "user",
    content: `[🚨 INSTRUÇÃO CRÍTICA 🚨]
O cliente perguntou: "${pergunta}"

VOCÊ DEVE enviar a lista COMPLETA de categorias que está no seu prompt.
NÃO corte, NÃO resuma, NÃO abrevie.

Mensagem do cliente: ${pergunta}`
  }
];

console.log(`📤 Enviando para Mistral AI...`);
console.log(`   - Messages: ${messages1.length}`);
console.log(`   - Total chars: ${JSON.stringify(messages1).length}`);
console.log(`   - Model: ${model}`);
console.log(`   - MaxTokens: 8000`);
console.log(`   - Temperature: 0.0\n`);

const startTime1 = Date.now();
const response1 = await mistral.chat.complete({
  model: model,
  messages: messages1,
  temperature: 0.0,
  maxTokens: 8000,
  randomSeed: 42
});

const duration1 = Date.now() - startTime1;
const resposta1 = response1.choices[0].message.content;

console.log(`✅ Resposta recebida em ${duration1}ms`);
console.log(`   - Tamanho: ${resposta1.length} chars`);
console.log(`   - Tokens usados: ${response1.usage?.totalTokens || 'N/A'}`);

// Contar quantos itens a IA retornou
const itemsReturned1 = (resposta1.match(/^\d{1,3}\.\s*/gm) || []).length;
console.log(`   - Itens retornados: ${itemsReturned1}/${itemCount}\n`);

console.log(`📝 Resposta (primeiros 500 chars):`);
console.log(resposta1.substring(0, 500));
console.log('\n...\n');
console.log(`📝 Resposta (últimos 300 chars):`);
console.log(resposta1.substring(resposta1.length - 300));

const sucesso1 = itemsReturned1 >= itemCount * 0.9; // 90% dos itens
console.log(`\n${sucesso1 ? '✅' : '❌'} TESTE 1: ${sucesso1 ? 'PASSOU' : 'FALHOU'}`);
console.log(`   Esperado: ${itemCount} itens`);
console.log(`   Recebido: ${itemsReturned1} itens`);
console.log(`   Taxa: ${((itemsReturned1 / itemCount) * 100).toFixed(1)}%\n`);

// TESTE 2: Prompt REDUZIDO + Lista no FINAL (hipótese: prompt grande confunde)
console.log('═══════════════════════════════════════════════════════════════');
console.log('📊 TESTE 2: Prompt REDUZIDO + Lista INJETADA na mensagem');
console.log('─────────────────────────────────────────────────────────────\n');

// Criar versão resumida do prompt (primeiros 5000 chars)
const promptResumido = fullPrompt.substring(0, 5000);

const messages2 = [
  {
    role: "system",
    content: `Você é um assistente de vendas para Objetivo Milionário.
    
REGRA ABSOLUTA: Quando o cliente pedir lista/cardápio/categorias, copie EXATAMENTE a lista fornecida, item por item, SEM PULAR NADA.`
  },
  {
    role: "user",
    content: promptResumido
  },
  {
    role: "user",
    content: `O cliente perguntou: "${pergunta}"

Responda com esta lista COMPLETA:

${listContent}

INSTRUÇÕES:
1. Diga uma saudação curta
2. Copie a lista acima COMPLETA (todos os ${itemCount} itens)
3. Pergunte se quer saber mais sobre alguma categoria`
  }
];

console.log(`📤 Enviando para Mistral AI...`);
console.log(`   - Messages: ${messages2.length}`);
console.log(`   - Total chars: ${JSON.stringify(messages2).length}`);
console.log(`   - Prompt reduzido: ${promptResumido.length} chars`);
console.log(`   - Lista injetada: ${listContent.length} chars\n`);

const startTime2 = Date.now();
const response2 = await mistral.chat.complete({
  model: model,
  messages: messages2,
  temperature: 0.0,
  maxTokens: 8000,
  randomSeed: 42
});

const duration2 = Date.now() - startTime2;
const resposta2 = response2.choices[0].message.content;

console.log(`✅ Resposta recebida em ${duration2}ms`);
console.log(`   - Tamanho: ${resposta2.length} chars`);
console.log(`   - Tokens usados: ${response2.usage?.totalTokens || 'N/A'}`);

const itemsReturned2 = (resposta2.match(/^\d{1,3}\.\s*/gm) || []).length;
console.log(`   - Itens retornados: ${itemsReturned2}/${itemCount}\n`);

console.log(`📝 Resposta (primeiros 500 chars):`);
console.log(resposta2.substring(0, 500));
console.log('\n...\n');
console.log(`📝 Resposta (últimos 300 chars):`);
console.log(resposta2.substring(resposta2.length - 300));

const sucesso2 = itemsReturned2 >= itemCount * 0.9;
console.log(`\n${sucesso2 ? '✅' : '❌'} TESTE 2: ${sucesso2 ? 'PASSOU' : 'FALHOU'}`);
console.log(`   Esperado: ${itemCount} itens`);
console.log(`   Recebido: ${itemsReturned2} itens`);
console.log(`   Taxa: ${((itemsReturned2 / itemCount) * 100).toFixed(1)}%\n`);

// TESTE 3: Sistema message + Lista DIRETA (hipótese: system message tem mais peso)
console.log('═══════════════════════════════════════════════════════════════');
console.log('📊 TESTE 3: System Message com Lista PRÉ-FORMATADA');
console.log('─────────────────────────────────────────────────────────────\n');

const messages3 = [
  {
    role: "system",
    content: `Você é assistente para Objetivo Milionário.

Quando o cliente perguntar sobre categorias/pack/lista, responda EXATAMENTE:

"Olá! 😊 Aqui está tudo que tem no Superpack Objetivo Milionário:

${listContent}

Quer que eu explique melhor alguma categoria específica?"`
  },
  {
    role: "user",
    content: pergunta
  }
];

console.log(`📤 Enviando para Mistral AI...`);
console.log(`   - Messages: ${messages3.length}`);
console.log(`   - Total chars: ${JSON.stringify(messages3).length}`);
console.log(`   - Lista no system: ${listContent.length} chars\n`);

const startTime3 = Date.now();
const response3 = await mistral.chat.complete({
  model: model,
  messages: messages3,
  temperature: 0.0,
  maxTokens: 8000,
  randomSeed: 42
});

const duration3 = Date.now() - startTime3;
const resposta3 = response3.choices[0].message.content;

console.log(`✅ Resposta recebida em ${duration3}ms`);
console.log(`   - Tamanho: ${resposta3.length} chars`);
console.log(`   - Tokens usados: ${response3.usage?.totalTokens || 'N/A'}`);

const itemsReturned3 = (resposta3.match(/^\d{1,3}\.\s*/gm) || []).length;
console.log(`   - Itens retornados: ${itemsReturned3}/${itemCount}\n`);

console.log(`📝 Resposta (primeiros 500 chars):`);
console.log(resposta3.substring(0, 500));
console.log('\n...\n');
console.log(`📝 Resposta (últimos 300 chars):`);
console.log(resposta3.substring(resposta3.length - 300));

const sucesso3 = itemsReturned3 >= itemCount * 0.9;
console.log(`\n${sucesso3 ? '✅' : '❌'} TESTE 3: ${sucesso3 ? 'PASSOU' : 'FALHOU'}`);
console.log(`   Esperado: ${itemCount} itens`);
console.log(`   Recebido: ${itemsReturned3} itens`);
console.log(`   Taxa: ${((itemsReturned3 / itemCount) * 100).toFixed(1)}%\n`);

// RESUMO FINAL
console.log('═══════════════════════════════════════════════════════════════');
console.log('📊 RESUMO DOS TESTES');
console.log('═══════════════════════════════════════════════════════════════\n');

const testes = [
  { nome: 'TESTE 1 (Prompt Completo)', itens: itemsReturned1, sucesso: sucesso1, tempo: duration1 },
  { nome: 'TESTE 2 (Prompt Reduzido + Injeção)', itens: itemsReturned2, sucesso: sucesso2, tempo: duration2 },
  { nome: 'TESTE 3 (System Message Pré-formatado)', itens: itemsReturned3, sucesso: sucesso3, tempo: duration3 }
];

testes.forEach((teste, i) => {
  const taxa = ((teste.itens / itemCount) * 100).toFixed(1);
  console.log(`${teste.sucesso ? '✅' : '❌'} ${teste.nome}`);
  console.log(`   Itens: ${teste.itens}/${itemCount} (${taxa}%)`);
  console.log(`   Tempo: ${teste.tempo}ms\n`);
});

const melhorTeste = testes.reduce((prev, curr) => 
  curr.itens > prev.itens ? curr : prev
);

console.log('═══════════════════════════════════════════════════════════════');
console.log(`🏆 MELHOR RESULTADO: ${melhorTeste.nome}`);
console.log(`   - ${melhorTeste.itens}/${itemCount} itens (${((melhorTeste.itens / itemCount) * 100).toFixed(1)}%)`);
console.log(`   - Tempo: ${melhorTeste.tempo}ms`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (melhorTeste.sucesso) {
  console.log('✅ SOLUÇÃO ENCONTRADA! Implementar esta abordagem no código.');
} else {
  console.log('⚠️ NENHUM TESTE PASSOU. Investigar outras hipóteses:');
  console.log('   - Tentar temperature > 0');
  console.log('   - Tentar modelo diferente (mistral-large)');
  console.log('   - Dividir lista em múltiplas mensagens');
  console.log('   - Usar função/tool calling');
}
