/**
 * Filtra pares de perguntas/respostas relevantes para vendas AgenteZap
 * Foca em: menções a agentezap, plano, R$99, R$49, whatsapp, ia, bot, funciona, etc.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'rodrigo-conversations.json'), 'utf8'));

const SALES_KEYWORDS = [
  'agentezap', 'agente zap', 'plano', 'r$99', 'r$49', 'r$199', '99/mês', '99 reais',
  'whatsapp', 'ia ', 'inteligência artificial', 'bot', 'automação', 'automatizar',
  'funciona', 'assinar', 'assinatura', 'contratar', 'link', 'conta', 'testar',
  'suporte', 'preço', 'valor', 'como funciona', 'configurar', 'atendimento automatico',
  'quero saber', 'interesse', 'vendas', 'qualificação', 'follow', 'lead',
  'ilimitado', 'mensagem automatica', 'robô', 'chatbot'
];

function isRelevant(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return SALES_KEYWORDS.some(kw => t.includes(kw));
}

const allPairs = data.allPairs || [];

// Filter: at least one of question/answer is relevant
const relevantPairs = allPairs.filter(p =>
  isRelevant(p.question) || isRelevant(p.answer)
);

// Group by question patterns (deduplicate similar questions)
const grouped = {};
for (const p of relevantPairs) {
  // Use first 80 chars as key to group similar questions
  const key = p.question.slice(0, 80).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!grouped[key]) {
    grouped[key] = [];
  }
  grouped[key].push(p);
}

console.log(`Total pares relevantes: ${relevantPairs.length}`);
console.log(`Grupos de perguntas: ${Object.keys(grouped).length}`);
console.log('\n');

// Show all unique relevant pairs
const uniquePairs = Object.values(grouped).map(group => {
  // Pick the best manual reply if available
  const manual = group.filter(p => !p.answer_is_ai);
  const best = manual.length > 0 ? manual[0] : group[0];
  return {
    question: best.question,
    answer: best.answer,
    answer_type: best.answer_is_ai ? 'AI' : 'MANUAL',
    all_answers: group.map(p => ({
      answer: p.answer,
      type: p.answer_is_ai ? 'AI' : 'MANUAL'
    }))
  };
});

// Sort: manual first
uniquePairs.sort((a, b) => (a.answer_type === 'MANUAL' ? -1 : 1));

console.log('=== PARES RELEVANTES PARA CALIBRAR PROMPT ===\n');
uniquePairs.forEach((p, i) => {
  console.log(`--- ${i + 1}. [${p.answer_type}] ---`);
  console.log(`❓ ${p.question}`);
  if (p.all_answers.length > 1) {
    console.log(`💬 Respostas encontradas (${p.all_answers.length}):`);
    p.all_answers.slice(0, 3).forEach((a, j) => {
      console.log(`  [${j + 1}] (${a.type}): ${a.answer.slice(0, 300)}`);
    });
  } else {
    console.log(`💬 ${p.answer}`);
  }
  console.log('');
});

fs.writeFileSync(
  path.join(__dirname, 'rodrigo-sales-pairs.json'),
  JSON.stringify(uniquePairs, null, 2),
  'utf8'
);
console.log(`\n✅ Salvo em rodrigo-sales-pairs.json (${uniquePairs.length} pares únicos)`);
