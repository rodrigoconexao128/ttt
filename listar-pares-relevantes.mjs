import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'rodrigo-conversations.json'), 'utf8'));
const pairs = data.allPairs || [];

const SALES_KEYWORDS = [
  'agentezap', 'agente zap', 'plano', 'funciona', 'assinar', 'assinatura',
  'contratar', 'link', 'conta', 'testar', 'preco', 'preço', 'valor', 'quanto',
  'configurar', 'suporte', 'pagar', 'mensalidade', 'whatsapp', 'conectar',
  'automacao', 'automatizar', 'ilimitado', 'cancelar', 'teste', 'gratis', 'grátis',
  'instagram', 'facebook', 'numero', 'vários números', 'anual', '199', '599',
  'setup', 'implementacao', 'implementação', 'integracao', 'integração',
  'numero adicional', 'números', 'robô', 'bot', 'chatbot',
  'responde', 'mensagem', 'automático', 'funcionalidade', 'recurso'
];

function isRelevant(text) {
  if (!text) return false;
  const t = text.toLowerCase().normalize('NFD').replace(/\u0300-\u036f/g, '');
  return SALES_KEYWORDS.some(kw => t.includes(kw));
}

const relevant = pairs.filter(p =>
  (isRelevant(p.question) || isRelevant(p.answer)) &&
  p.question && p.question.length > 15 &&
  p.answer && p.answer.length > 10
);

const manuals = relevant.filter(p => !p.answer_is_ai);

// Deduplicate by first 60 chars of question
const seen = new Set();
const unique = [];
for (const p of manuals) {
  const key = p.question.slice(0, 60).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!seen.has(key)) {
    seen.add(key);
    unique.push(p);
  }
}

console.log('Total relevantes:', relevant.length, '| Manuais:', manuals.length, '| Únicos:', unique.length);
console.log('');

unique.slice(0, 60).forEach((p, i) => {
  console.log(`--- Q${i + 1} ---`);
  console.log('❓ ' + p.question.slice(0, 300));
  console.log('💬 ' + p.answer.slice(0, 300));
  console.log('');
});
