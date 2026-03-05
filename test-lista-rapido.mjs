/**
 * TESTE SIMPLIFICADO: Lista Truncada - 3 Testes Rápidos
 */

import { Mistral } from '@mistralai/mistralai';

const MISTRAL_API_KEY = 'EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF';

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

console.log('🧪 TESTE: 3 Técnicas para Lista Completa\n');

const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });
const pergunta = "o que tem no pack?";
const itemCount = 71;

// TESTE 1: System com template
console.log('📊 TESTE 1: System Message com Template PRÉ-FORMATADO');
const t1Start = Date.now();
const r1 = await mistral.chat.complete({
  model: 'mistral-small-latest',
  messages: [
    {
      role: "system",
      content: `Você é Lucas da Objetivo Milionário.

QUANDO perguntar sobre pack, responda EXATAMENTE:

"Olá! 😊 Aqui está tudo:

${listContent}

Quer saber mais sobre alguma?"`
    },
    { role: "user", content: pergunta }
  ],
  temperature: 0.0,
  maxTokens: 8000
});
const resp1 = r1.choices[0].message.content;
const items1 = (resp1.match(/^\d{1,3}\.\s*/gm) || []).length;
console.log(`✅ ${items1}/71 itens em ${Date.now() - t1Start}ms`);
console.log(`${resp1.substring(0, 200)}...${resp1.substring(resp1.length - 100)}\n`);

// TESTE 2: Lista na user message
console.log('📊 TESTE 2: Lista INJETADA na User Message');
const t2Start = Date.now();
const r2 = await mistral.chat.complete({
  model: 'mistral-small-latest',
  messages: [
    {
      role: "system",
      content: `Você é Lucas. Quando pedir lista, COPIE exatamente o que enviar.`
    },
    {
      role: "user",
      content: `Cliente: "${pergunta}"

Copie esta lista COMPLETA (71 itens):

${listContent}`
    }
  ],
  temperature: 0.0,
  maxTokens: 8000
});
const resp2 = r2.choices[0].message.content;
const items2 = (resp2.match(/^\d{1,3}\.\s*/gm) || []).length;
console.log(`✅ ${items2}/71 itens em ${Date.now() - t2Start}ms`);
console.log(`${resp2.substring(0, 200)}...${resp2.substring(resp2.length - 100)}\n`);

// TESTE 3: Temperature 0.3
console.log('📊 TESTE 3: Temperature 0.3 (mais criativo)');
const t3Start = Date.now();
const r3 = await mistral.chat.complete({
  model: 'mistral-small-latest',
  messages: [
    {
      role: "system",
      content: `Você é Lucas. COPIE listas completas quando pedir.`
    },
    {
      role: "user",
      content: `"${pergunta}"\n\nCopie:\n\n${listContent}`
    }
  ],
  temperature: 0.3,
  maxTokens: 8000
});
const resp3 = r3.choices[0].message.content;
const items3 = (resp3.match(/^\d{1,3}\.\s*/gm) || []).length;
console.log(`✅ ${items3}/71 itens em ${Date.now() - t3Start}ms`);
console.log(`${resp3.substring(0, 200)}...${resp3.substring(resp3.length - 100)}\n`);

// Resumo
console.log('══════════════════════════════════════');
console.log('📊 RESUMO:');
console.log(`TESTE 1: ${items1}/71 (${(items1/71*100).toFixed(1)}%) ${items1 >= 64 ? '✅' : '❌'}`);
console.log(`TESTE 2: ${items2}/71 (${(items2/71*100).toFixed(1)}%) ${items2 >= 64 ? '✅' : '❌'}`);
console.log(`TESTE 3: ${items3}/71 (${(items3/71*100).toFixed(1)}%) ${items3 >= 64 ? '✅' : '❌'}`);
console.log('══════════════════════════════════════');

const melhor = [
  { nome: 'TESTE 1 (System Template)', itens: items1 },
  { nome: 'TESTE 2 (User Message)', itens: items2 },
  { nome: 'TESTE 3 (Temp 0.3)', itens: items3 }
].reduce((p, c) => c.itens > p.itens ? c : p);

console.log(`\n🏆 MELHOR: ${melhor.nome} - ${melhor.itens}/71 itens\n`);

if (melhor.itens >= 64) {
  console.log('✅ SOLUÇÃO ENCONTRADA! Implementar no aiAgent.ts');
} else {
  console.log('❌ NENHUM PASSOU. Testar:');
  console.log('   - mistral-large-latest');
  console.log('   - Dividir em múltiplas messages');
}
