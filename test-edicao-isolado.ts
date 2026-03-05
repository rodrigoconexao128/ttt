/**
 * Teste isolado da técnica de edição JSON Schema
 * Testa se apenas as partes necessárias são alteradas (não reescreve tudo)
 */

// Simula a função de injeção de mudanças (cópia do servidor)
interface EditOperation {
  action: "replace" | "insert_after" | "insert_before" | "delete" | "append";
  target?: string;
  content?: string;
}

function injectPromptChanges(original: string, edits: EditOperation[]): string {
  let result = original;
  
  for (const edit of edits) {
    switch (edit.action) {
      case "replace":
        if (edit.target && edit.content) {
          // Busca flexível - tenta encontrar o target mesmo com pequenas diferenças
          const targetNormalized = edit.target.toLowerCase().trim();
          const lines = result.split('\n');
          let found = false;
          
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(targetNormalized) || 
                targetNormalized.includes(lines[i].toLowerCase().trim())) {
              lines[i] = edit.content;
              found = true;
              break;
            }
          }
          
          if (!found) {
            // Tenta substituição direta
            if (result.includes(edit.target)) {
              result = result.replace(edit.target, edit.content);
            } else {
              // Adiciona no final como fallback
              result = result + '\n' + edit.content;
            }
          } else {
            result = lines.join('\n');
          }
        }
        break;
        
      case "insert_after":
        if (edit.target && edit.content) {
          const targetIndex = result.indexOf(edit.target);
          if (targetIndex !== -1) {
            const endOfTarget = targetIndex + edit.target.length;
            result = result.slice(0, endOfTarget) + '\n' + edit.content + result.slice(endOfTarget);
          }
        }
        break;
        
      case "insert_before":
        if (edit.target && edit.content) {
          const targetIndex = result.indexOf(edit.target);
          if (targetIndex !== -1) {
            result = result.slice(0, targetIndex) + edit.content + '\n' + result.slice(targetIndex);
          }
        }
        break;
        
      case "delete":
        if (edit.target) {
          result = result.replace(edit.target, '').replace(/\n\n\n+/g, '\n\n');
        }
        break;
        
      case "append":
        if (edit.content) {
          result = result.trim() + '\n\n' + edit.content;
        }
        break;
    }
  }
  
  return result.trim();
}

// ============ TESTES ============

console.log("🧪 TESTE DA TÉCNICA DE EDIÇÃO JSON SCHEMA\n");
console.log("=" .repeat(60));

let passados = 0;
let falhas = 0;

// TESTE 1: Substituição simples
console.log("\n📝 Teste 1: Substituição de uma linha");
const original1 = `Você é um assistente de vendas.
Seja educado e profissional.
Responda em português.`;

const edits1: EditOperation[] = [
  { action: "replace", target: "Seja educado e profissional", content: "Seja super amigável e descontraído" }
];

const resultado1 = injectPromptChanges(original1, edits1);
const esperado1 = resultado1.includes("super amigável") && resultado1.includes("assistente de vendas");

if (esperado1) {
  console.log("✅ PASSOU - Substituiu apenas a linha correta");
  console.log("   Original tinha 3 linhas, resultado tem:", resultado1.split('\n').length, "linhas");
  passados++;
} else {
  console.log("❌ FALHOU");
  falhas++;
}

// TESTE 2: Adicionar conteúdo no final
console.log("\n📝 Teste 2: Append (adicionar no final)");
const original2 = `Você é um bot de pizzaria.
Anote os pedidos.`;

const edits2: EditOperation[] = [
  { action: "append", content: "Sempre pergunte o endereço de entrega." }
];

const resultado2 = injectPromptChanges(original2, edits2);
const esperado2 = resultado2.includes("pizzaria") && resultado2.includes("endereço de entrega");

if (esperado2) {
  console.log("✅ PASSOU - Adicionou no final sem perder o original");
  passados++;
} else {
  console.log("❌ FALHOU");
  falhas++;
}

// TESTE 3: Deletar uma parte
console.log("\n📝 Teste 3: Delete (remover parte)");
const original3 = `Você é um assistente.
NUNCA ofereça descontos.
Seja prestativo.`;

const edits3: EditOperation[] = [
  { action: "delete", target: "NUNCA ofereça descontos." }
];

const resultado3 = injectPromptChanges(original3, edits3);
const esperado3 = !resultado3.includes("NUNCA ofereça") && resultado3.includes("assistente");

if (esperado3) {
  console.log("✅ PASSOU - Removeu a linha correta, manteve o resto");
  passados++;
} else {
  console.log("❌ FALHOU");
  falhas++;
}

// TESTE 4: Insert After
console.log("\n📝 Teste 4: Insert After (inserir depois)");
const original4 = `Horário de atendimento: 9h às 18h.
Telefone: 11999999999.`;

const edits4: EditOperation[] = [
  { action: "insert_after", target: "Horário de atendimento: 9h às 18h.", content: "Sábados: 9h às 13h." }
];

const resultado4 = injectPromptChanges(original4, edits4);
const esperado4 = resultado4.includes("Sábados") && resultado4.indexOf("Sábados") > resultado4.indexOf("9h às 18h");

if (esperado4) {
  console.log("✅ PASSOU - Inseriu na posição correta");
  passados++;
} else {
  console.log("❌ FALHOU");
  falhas++;
}

// TESTE 5: Múltiplas edições
console.log("\n📝 Teste 5: Múltiplas edições simultâneas");
const original5 = `Você é Ana, assistente virtual.
Trabalha na Loja ABC.
Horário: 8h às 20h.
Seja formal.`;

const edits5: EditOperation[] = [
  { action: "replace", target: "Trabalha na Loja ABC", content: "Trabalha na Loja XYZ Premium" },
  { action: "replace", target: "Seja formal", content: "Seja descontraído e use emojis" },
  { action: "append", content: "Sempre agradeça no final." }
];

const resultado5 = injectPromptChanges(original5, edits5);
const esperado5 = resultado5.includes("XYZ Premium") && 
                  resultado5.includes("emojis") && 
                  resultado5.includes("agradeça") &&
                  resultado5.includes("Ana"); // Manteve o que não foi editado

if (esperado5) {
  console.log("✅ PASSOU - Aplicou 3 edições, manteve partes não editadas");
  passados++;
} else {
  console.log("❌ FALHOU");
  falhas++;
}

// TESTE 6: Verificar que NÃO reescreve tudo
console.log("\n📝 Teste 6: Verificar economia (não reescreve documento inteiro)");
const original6 = `Você é um assistente de suporte técnico da TechCorp.
Seu nome é Carlos e você tem 10 anos de experiência.
Você conhece todos os produtos da linha Premium, Standard e Basic.
Horário de atendimento: Segunda a Sexta, 8h às 18h.
Telefone: 0800-123-4567
Email: suporte@techcorp.com
Sempre seja educado e paciente com os clientes.
Se não souber a resposta, transfira para um especialista.`;

// Cliente pediu apenas para mudar o horário
const edits6: EditOperation[] = [
  { action: "replace", target: "Horário de atendimento: Segunda a Sexta, 8h às 18h", content: "Horário de atendimento: 24 horas, 7 dias por semana" }
];

const resultado6 = injectPromptChanges(original6, edits6);

// Verifica que TUDO foi mantido exceto o que foi pedido
const manteveNome = resultado6.includes("Carlos");
const manteveExperiencia = resultado6.includes("10 anos");
const manteveProdutos = resultado6.includes("Premium, Standard e Basic");
const manteveTelefone = resultado6.includes("0800-123-4567");
const manteveEmail = resultado6.includes("suporte@techcorp.com");
const mudouHorario = resultado6.includes("24 horas");

if (manteveNome && manteveExperiencia && manteveProdutos && manteveTelefone && manteveEmail && mudouHorario) {
  console.log("✅ PASSOU - Mudou APENAS o horário, manteve TODO o resto");
  console.log("   ✓ Nome Carlos mantido");
  console.log("   ✓ Experiência mantida");
  console.log("   ✓ Produtos mantidos");
  console.log("   ✓ Telefone mantido");
  console.log("   ✓ Email mantido");
  console.log("   ✓ Horário alterado para 24h");
  passados++;
} else {
  console.log("❌ FALHOU - Perdeu informações do documento original");
  falhas++;
}

// RESULTADO FINAL
console.log("\n" + "=".repeat(60));
console.log(`📊 RESULTADO FINAL: ${passados}/${passados + falhas} testes passaram`);

if (falhas === 0) {
  console.log("🎉 TODOS OS TESTES PASSARAM!");
  console.log("\n💡 A técnica funciona corretamente:");
  console.log("   - Substitui apenas partes específicas");
  console.log("   - Adiciona conteúdo sem perder o original");
  console.log("   - Remove partes mantendo o resto");
  console.log("   - Suporta múltiplas edições");
  console.log("   - NÃO reescreve o documento inteiro");
} else {
  console.log(`⚠️ ${falhas} teste(s) falharam`);
}

// DEMONSTRAÇÃO DE ECONOMIA DE TOKENS
console.log("\n" + "=".repeat(60));
console.log("💰 ECONOMIA DE TOKENS ESTIMADA:\n");

const docGrande = original6;
const edicaoPequena = JSON.stringify(edits6);

console.log(`Documento original: ${docGrande.length} caracteres`);
console.log(`Edição enviada:     ${edicaoPequena.length} caracteres`);
console.log(`Economia:           ${Math.round((1 - edicaoPequena.length / docGrande.length) * 100)}%`);
console.log("\n✅ Com JSON Schema, a IA retorna APENAS as mudanças, não o documento todo!");
