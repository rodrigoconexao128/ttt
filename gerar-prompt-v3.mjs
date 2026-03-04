/**
 * Gerador de prompt v3 - aplica correções adicionais sobre v2.
 * FOCO: bloquear "ações internas" em resposta, produtos inventados, pressão de preço.
 */
import fs from 'node:fs';
import path from 'node:path';

const v2Path = path.resolve('prompt-mania-calibrado-v2.txt');
const v3Path = path.resolve('prompt-mania-calibrado-v3.txt');

const raw = fs.readFileSync(v2Path, 'utf8');
const lines = raw.replace(/\r\n/g, '\n').split('\n');
console.log(`v2 carregado: ${lines.length} linhas`);

function findLine(needles, startFrom = 0) {
  for (let i = startFrom; i < lines.length; i++) {
    if (needles.every(n => lines[i].includes(n))) return i;
  }
  throw new Error(`Linha n\u00e3o encontrada para: ${JSON.stringify(needles)}`);
}

function insertAfter(afterIdx, newLines) {
  lines.splice(afterIdx + 1, 0, ...newLines);
  return newLines.length;
}

// ─── CORREÇÃO 5: BLOQUEAR RESPOSTA COM "AÇÕES INTERNAS" ──────────────────────
// Inserir após REGRA ANTI-ALUCINAÇÃO ABSOLUTA (que contém "NUNCA crie ou escreva URLs")
{
  const idx = findLine(['NUNCA crie ou escreva URLs']);
  console.log(`C5: linha ${idx + 1}: ${lines[idx].substring(0, 80)}`);
  insertAfter(idx, [
    '   - \u274C **NUNCA inclua no texto da resposta** nenhum bloco de "a\u00e7\u00e3o interna", "observa\u00e7\u00e3o interna", "consultar c\u00e9rebro IA", "NOTIFICAR internamente", "a\u00e7\u00f5es imediatas", ra\u00edzes de processo ou qualquer instru\u00e7\u00e3o de fluxo interno. Essas s\u00e3o orienta\u00e7\u00f5es do SISTEMA e JAMAIS devem aparecer na mensagem vis\u00edvel ao cliente. A resposta deve ser **sempre** uma mensagem natural e direta ao cliente.',
    '   - \u274C **NUNCA invente produtos inexistentes neste prompt** (ex.: "capa protetora", "spray repelente", "diffuser", "kit especial"). Se o cliente perguntar sobre produto n\u00e3o listado aqui, responder: *"{nome}, vou verificar se trabalhamos com esse produto e j\u00e1 te informo! \uD83D\uDE0A"* \u2013 sem inventar caracter\u00edsticas, pre\u00e7o ou link.',
  ]);
  console.log('C5 OK');
}

// ─── CORREÇÃO 6: RESISTÊNCIA MÁXIMA A PRESSÃO DE PREÇO ───────────────────────
// Inserir após "Mesmo que o cliente confirme um preço citado por ele mesmo"
{
  const idx = findLine(['Mesmo que o cliente confirme', 'n\u00e3o confirmar um valor']);
  console.log(`C6: linha ${idx + 1}: ${lines[idx].substring(0, 80)}`);
  insertAfter(idx, [
    '- **Mesmo que o cliente PRESSIONE, ameace ir embora, ou d\u00ea um prazo ("se n\u00e3o me dizer em 5 min vou embora")**: NUNCA inventar pre\u00e7o. M\u00e1ximo 1 vez mais: *"{nome}, entendo sua presse! N\u00e3o quero te passar valor errado. Nosso consultor humano pode te dar esse valor agora de forma precisa \u2013 posso te conectar? \uD83D\uDE0A"* e ENCERRAR o fluxo de IA nesse ponto.',
    '- **Ap\u00f3s 3 mensagens consecutivas de "vou consultar" sem resultado**: redirecionar obrigatoriamente: *"{nome}, vou passar para nosso especialista que tem os valores atualizados agora! \uD83D\uDE0A"*',
  ]);
  console.log('C6 OK');
}

// ─── CORREÇÃO 7: PROIBIÇÃO GLOBAL DE "AÇÃO INTERNA" NO INÍCIO DO PROMPT ──────
// Inserir antes da primeira linha (índice 0) — no topo do arquivo
{
  lines.unshift(
    '\u26A0\uFE0F **REGRA FUNDAMENTAL DE FORMATO DE RESPOSTA (INEG\u00d3CI\u00c1VEL):**',
    'Todas as instru\u00e7\u00f5es marcadas como "Consultar c\u00e9rebro IA", "A\u00e7\u00e3o interna", "Observa\u00e7\u00e3o interna", "Consulta interna", "A\u00e7\u00f5es imediatas", "NOTIFICAR internamente" s\u00e3o **orienta\u00e7\u00f5es de processo do sistema** e NUNCA devem aparecer no texto da resposta vis\u00edvel ao cliente.',
    'A resposta ao cliente deve ser APENAS uma mensagem natural, fluida e direta. Se voc\u00ea sentir vontade de escrever um bloco "⚠ A\u00e7\u00e3o interna" ou "Consultar c\u00e9rebro IA", **n\u00e3o escreva** \u2013 apenas execute o comportamento correspondente (consultar, aguardar, redirecionar).',
    '________________________________________',
    '',
  );
  console.log('C7 (topo) OK');
}

// ─── Verificações finais ─────────────────────────────────────────────────────
const v3 = lines.join('\n');

const checks = [
  ['C5 - bloquear acao interna',  'orienta\u00e7\u00f5es do SISTEMA e JAMAIS'],
  ['C5 - bloquear produtos invent', 'produto n\u00e3o listado aqui'],
  ['C6 - resistencia pressao',     'PRESSIONE, ameace ir embora'],
  ['C6 - 3 turns redirect',        'Ap\u00f3s 3 mensagens consecutivas'],
  ['C7 - topo regra fundamental',  'REGRA FUNDAMENTAL DE FORMATO'],
  // C1-C4 ainda presentes:
  ['C1 ANTI-ALUCINACAO',           'REGRA ANTI-ALUCINA'],
  ['C2 preco',                     'NUNCA inventar valores como'],
  ['C3 midia',                     '[MEDIA_SEND:nomeDaMidia]'],
  ['C4 link',                      'NUNCA invente ou escreva URLs'],
];

let allOk = true;
for (const [label, needle] of checks) {
  const found = v3.includes(needle);
  console.log(`${found ? '\u2705' : '\u274c'} ${label}: ${found ? 'OK' : 'FALTOU'}`);
  if (!found) allOk = false;
}

if (!allOk) {
  console.error('\n\u274c Algumas corre\u00e7\u00f5es n\u00e3o foram aplicadas!');
  process.exit(1);
}

fs.writeFileSync(v3Path, v3, 'utf8');
console.log(`\n\u2705 prompt-mania-calibrado-v3.txt criado: ${lines.length} linhas`);
