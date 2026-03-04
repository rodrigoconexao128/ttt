/**
 * Script de teste para diagnóstico do corte de lista das 71 categorias
 * Cliente: lmcoriolano@hotmail.com (Objetivo Milionário)
 * Problema: A lista completa das categorias está sendo cortada
 */

// Simulação da função splitMessageHumanLike
function splitMessageHumanLike(message: string, maxChars: number = 400): string[] {
  // Se maxChars = 0, retorna mensagem completa sem divisão
  if (maxChars === 0) {
    return [message];
  }
  
  // Mensagem pequena - retorna diretamente
  if (message.length <= maxChars) {
    return [message];
  }
  
  const MAX_CHARS = maxChars;
  const finalParts: string[] = [];
  
  // FASE 1: Dividir por parágrafos duplos (quebras de seção)
  const sections = message.split('\n\n').filter(s => s.trim());
  
  // FASE 2: Processar cada seção, quebrando em partes menores se necessário
  for (const section of sections) {
    const sectionParts = splitSectionIntoChunks(section, MAX_CHARS);
    finalParts.push(...sectionParts);
  }
  
  // FASE 3: Agrupar partes pequenas respeitando o limite
  const optimizedParts: string[] = [];
  let currentBuffer = '';
  
  for (const part of finalParts) {
    const separator = currentBuffer ? '\n\n' : '';
    const combined = currentBuffer + separator + part;
    
    if (combined.length <= MAX_CHARS) {
      currentBuffer = combined;
    } else {
      if (currentBuffer.trim()) {
        optimizedParts.push(currentBuffer.trim());
      }
      currentBuffer = part;
    }
  }
  
  // Adicionar último buffer
  if (currentBuffer.trim()) {
    optimizedParts.push(currentBuffer.trim());
  }
  
  return optimizedParts.length > 0 ? optimizedParts : [message];
}

// Função auxiliar para dividir uma seção em chunks menores
function splitSectionIntoChunks(section: string, maxChars: number): string[] {
  if (section.length <= maxChars) {
    return [section];
  }
  
  const chunks: string[] = [];
  const lines = section.split('\n').filter(l => l.trim());
  
  if (lines.length > 1) {
    let currentChunk = '';
    for (const line of lines) {
      const separator = currentChunk ? '\n' : '';
      if ((currentChunk + separator + line).length <= maxChars) {
        currentChunk = currentChunk + separator + line;
      } else {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        if (line.length > maxChars) {
          const subChunks = splitTextBySentences(line, maxChars);
          chunks.push(...subChunks);
          currentChunk = '';
        } else {
          currentChunk = line;
        }
      }
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    return chunks;
  }
  
  return splitTextBySentences(section, maxChars);
}

function splitTextBySentences(text: string, maxChars: number): string[] {
  const urlPlaceholder = '§URL_DOT§';
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const protectedUrls: string[] = [];
  
  let protectedText = text.replace(urlRegex, (match) => {
    const index = protectedUrls.length;
    protectedUrls.push(match);
    return `§URL_${index}§`;
  });
  
  const sentencePattern = /[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g;
  const sentences = protectedText.match(sentencePattern) || [protectedText];
  
  const restoredSentences = sentences.map(sentence => {
    let restored = sentence;
    protectedUrls.forEach((url, index) => {
      restored = restored.replace(`§URL_${index}§`, url);
    });
    return restored;
  });
  
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of restoredSentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;
    
    const combined = currentChunk ? currentChunk + ' ' + trimmedSentence : trimmedSentence;
    
    if (combined.length <= maxChars) {
      currentChunk = combined;
    } else {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      
      if (trimmedSentence.length > maxChars) {
        const wordChunks = splitByWords(trimmedSentence, maxChars);
        chunks.push(...wordChunks);
        currentChunk = '';
      } else {
        currentChunk = trimmedSentence;
      }
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [text];
}

function splitByWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const word of words) {
    if (!word) continue;
    
    const combined = currentChunk ? currentChunk + ' ' + word : word;
    
    if (combined.length <= maxChars) {
      currentChunk = combined;
    } else {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      
      if (word.length > maxChars) {
        if (word.match(/^https?:\/\//i)) {
          currentChunk = word;
        } else {
          let remaining = word;
          while (remaining.length > maxChars) {
            chunks.push(remaining.substring(0, maxChars));
            remaining = remaining.substring(maxChars);
          }
          currentChunk = remaining;
        }
      } else {
        currentChunk = word;
      }
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [text];
}

// ==============================================================
// TESTE: Lista das 71 categorias que o cliente reportou estar cortando
// ==============================================================

const listaCompleta71Categorias = `1. 🎨 Carrosséis no Canva
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

// ==============================================================
// EXECUTAR TESTES
// ==============================================================

console.log("=".repeat(80));
console.log("DIAGNÓSTICO DO CORTE DE MENSAGEM - Cliente: Objetivo Milionário");
console.log("=".repeat(80));
console.log(`\n📝 Tamanho total da lista: ${listaCompleta71Categorias.length} caracteres`);
console.log(`📝 Limite configurado (message_split_chars): 400 caracteres\n`);

// Teste 1: Com limite de 400 chars
console.log("📊 TESTE 1: Dividindo com limite de 400 chars");
console.log("-".repeat(50));
const parts400 = splitMessageHumanLike(listaCompleta71Categorias, 400);
console.log(`Total de partes: ${parts400.length}`);
parts400.forEach((part, i) => {
  console.log(`\n--- PARTE ${i + 1}/${parts400.length} (${part.length} chars) ---`);
  console.log(part);
});

console.log("\n" + "=".repeat(80));
console.log("📊 TESTE 2: Verificando se a lista completa está presente");
console.log("-".repeat(50));

// Verificar se todas as 71 categorias estão presentes
const allContent = parts400.join('\n\n');
let foundAll = true;
for (let i = 1; i <= 71; i++) {
  const searchNum = `${i}.`;
  if (!allContent.includes(searchNum)) {
    console.log(`❌ Categoria ${i} NÃO encontrada!`);
    foundAll = false;
  }
}

if (foundAll) {
  console.log("✅ Todas as 71 categorias estão presentes nas partes divididas!");
} else {
  console.log("❌ PROBLEMA: Algumas categorias estão faltando!");
}

console.log("\n" + "=".repeat(80));
console.log("📊 TESTE 3: Verificando última categoria (71)");
console.log("-".repeat(50));
const lastPart = parts400[parts400.length - 1];
console.log("Última parte:");
console.log(lastPart);

if (lastPart.includes("71.")) {
  console.log("\n✅ Categoria 71 encontrada na última parte!");
} else {
  console.log("\n❌ Categoria 71 NÃO encontrada na última parte!");
}

// Teste 4: Simulação completa como seria na resposta da IA
console.log("\n" + "=".repeat(80));
console.log("📊 TESTE 4: Simulação de resposta completa da IA");
console.log("-".repeat(50));

const respostaIA = `Claro! Aqui está a lista completa das 71 categorias do Superpack Objetivo Milionário:

${listaCompleta71Categorias}

E muito mais! 🚀

Bônus:
🔄️ Atualizações Garantidas
💬 Suporte Prioritário
🎁 5 Categorias Bônus

Quer saber mais sobre alguma categoria específica?`;

console.log(`\n📝 Tamanho total da resposta: ${respostaIA.length} caracteres`);

const partsResposta = splitMessageHumanLike(respostaIA, 400);
console.log(`Total de partes: ${partsResposta.length}`);

console.log("\n📱 SIMULAÇÃO DE COMO APARECERIA NO CHAT:");
partsResposta.forEach((part, i) => {
  console.log(`\n[BOLHA ${i + 1}/${partsResposta.length}] (${part.length} chars)`);
  console.log("┌" + "─".repeat(60) + "┐");
  const lines = part.split('\n');
  lines.forEach(line => {
    console.log(`│ ${line.padEnd(58)} │`);
  });
  console.log("└" + "─".repeat(60) + "┘");
});
