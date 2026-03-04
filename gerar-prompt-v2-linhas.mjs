/**
 * Gerador de prompt v2 usando inserção por linha (não string replace).
 * Mais robusto contra problemas de encoding.
 */
import fs from 'node:fs';
import path from 'node:path';

const v1Path = path.resolve('prompt-mania-calibrado-v1.txt');
const v2Path = path.resolve('prompt-mania-calibrado-v2.txt');

const raw = fs.readFileSync(v1Path, 'utf8');
// Normalizar line endings
const lines = raw.replace(/\r\n/g, '\n').split('\n');

console.log(`v1 carregado: ${lines.length} linhas`);

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Encontra o índice (0-based) da linha que contém todas as substrings de `needles`.
 * Lança erro se não encontrar.
 */
function findLine(needles, startFrom = 0) {
  for (let i = startFrom; i < lines.length; i++) {
    if (needles.every(n => lines[i].includes(n))) return i;
  }
  throw new Error(`Linha não encontrada para: ${JSON.stringify(needles)}`);
}

/**
 * Insere `newLines` APÓS a linha no índice `afterIdx`.
 * Retorna o novo offset (+linhas inseridas).
 */
function insertAfter(afterIdx, newLines) {
  lines.splice(afterIdx + 1, 0, ...newLines);
  return newLines.length;
}

// ─── CORREÇÃO 1: REGRA ANTI-ALUCINAÇÃO ABSOLUTA ─────────────────────────────
// Inserir como item "3." após a linha que tem "Bloquear qualquer menção a preços de colchões"
{
  const idx = findLine(['Bloquear qualquer', 'pre', 'cama']);
  console.log(`C1: linha ${idx + 1}: ${lines[idx]}`);
  insertAfter(idx, [
    '',
    '3. \uD83D\uDD12 **REGRA ANTI-ALUCINA\u00C7\u00C3O ABSOLUTA (todos os produtos, sem exce\u00E7\u00E3o):**',
    '   - \u274C **NUNCA invente, estime, exemplifique ou calcule pre\u00E7os** que N\u00C3O estejam escritos literalmente neste prompt. Frases como "geralmente R$ 25\u2013R$ 40", "em m\u00E9dia R$ 12", "R$ 129,90" ou "5% de desconto PIX" \u2013 se n\u00E3o estiverem neste texto \u2013 s\u00E3o **terminantemente proibidas**.',
    '   - \u274C **NUNCA escreva tokens [MEDIA_SEND:...]** em suas respostas. O envio de m\u00EDdia \u00E9 feito pelo sistema automaticamente. O agente deve apenas confirmar: *"Vou te enviar as fotos agora! \uD83D\uDE0A"* \u2013 nunca incluir o token no texto.',
    '   - \u274C **NUNCA crie ou escreva URLs** que n\u00E3o estejam listadas explicitamente neste prompt. Se a URL n\u00E3o constar aqui, responda: *"{nome}, vou localizar o link correto agora \uD83D\uDE0A"*',
    '   - \u274C **NUNCA ofe\u00E7a cupons, brindes, descontos ou promo\u00E7\u00F5es** que n\u00E3o estejam escritas neste prompt.',
    '   - **Para qualquer valor N\u00C3O listado neste prompt (incluindo len\u00E7\u00F3is, fronhas, toalhas, edredons, cabeceiras, protetores, cobre-leitos, fretes estimados):** responder SEMPRE: *"{nome}, vou consultar o valor exato agora e j\u00E1 te informo! \uD83D\uDE0A"* \u2013 **sem estimativas, sem exemplos, sem c\u00E1lculos aproximados.**',
  ]);
  console.log('C1 OK');
}

// ─── CORREÇÃO 2: REFORÇO ANTI-ALUCINAÇÃO PREÇO ──────────────────────────────
// Inserir após a linha que contém "vou confirmar agora e já volto com o preço exato"
{
  const idx = findLine(['vou confirmar agora', 'volto com o pre']);
  console.log(`C2: linha ${idx + 1}: ${lines[idx]}`);
  insertAfter(idx, [
    '',
    '\u26A0 **ATEN\u00C7\u00C3O CR\u00CDTICA \u2013 PRE\u00C7O:**',
    '- O "c\u00E9rebro IA" **N\u00C3O gera pre\u00E7os v\u00E1lidos** \u2013 ele apenas verifica se a qualifica\u00E7\u00E3o est\u00E1 completa. Qualquer n\u00FAmero inventado pela IA \u00E9 uma alucina\u00E7\u00E3o proibida.',
    '- Produtos **SEM tabela de pre\u00E7os neste prompt** (len\u00E7\u00F3is, fronhas, toalhas, edredons, cabeceiras, protetores, cobre-leitos): SEMPRE responder *"{nome}, vou consultar o valor exato e j\u00E1 te informo! \uD83D\uDE0A"* \u2013 **NUNCA inventar valores como "R$129,90", "R$12 de frete", "R$25\u2013R$40"**.',
    '- Mesmo que o cliente confirme um pre\u00E7o citado por ele mesmo, **n\u00E3o confirmar um valor que n\u00E3o esteja neste prompt**.',
  ]);
  console.log('C2 OK');
}

// ─── CORREÇÃO 3: REFORÇO ANTI-ALUCINAÇÃO MÍDIA ───────────────────────────────
// Inserir após a linha que contém "cancelar" e "pendente" e "reiniciar"
{
  const idx = findLine(['cancelar', 'pendente', 'reiniciar']);
  console.log(`C3: linha ${idx + 1}: ${lines[idx]}`);
  insertAfter(idx, [
    '',
    '\u26A0 **ATEN\u00C7\u00C3O CR\u00CDTICA \u2013 M\u00CDDIA:**',
    '- **NUNCA escreva** `[MEDIA_SEND:nomeDaMidia]` em suas respostas. Esse token \u00E9 usado **somente pelo sistema internamente**. O agente deve apenas dizer: *"Vou te enviar as fotos agora! \uD83D\uDE0A"* e aguardar o sistema enviar.',
    '- A autoriza\u00E7\u00E3o expl\u00EDcita do cliente deve ser: o cliente dizer palavras como *"pode enviar"*, *"manda a foto"*, *"quero ver"* \u2013 **e o produto + tamanho + modelo j\u00E1 confirmados**. Somente ap\u00F3s isso o agente diz que vai enviar (sem o token).',
  ]);
  console.log('C3 OK');
}

// ─── CORREÇÃO 4: REFORÇO ANTI-ALUCINAÇÃO LINK ────────────────────────────────
// Inserir após a linha que contém "te envio sim" e "produto, tamanho e modelo"
{
  const idx = findLine(['te envio sim', 'tamanho e modelo']);
  console.log(`C4: linha ${idx + 1}: ${lines[idx]}`);
  insertAfter(idx, [
    '',
    '\u26A0 **ATEN\u00C7\u00C3O CR\u00CDTICA \u2013 LINK:**',
    '- **NUNCA invente ou escreva URLs**. Os \u00DANICOS links permitidos neste prompt s\u00E3o os listados nas se\u00E7\u00F5es de envio de link (Google Drive) abaixo. Qualquer outra URL \u00E9 **terminantemente proibida**.',
    '- Se o link correto n\u00E3o estiver neste prompt, responder: *"{nome}, vou localizar o link correto agora e te envio em breve \uD83D\uDE0A"*',
  ]);
  console.log('C4 OK');
}

// ─── Verificações finais ─────────────────────────────────────────────────────
const v2 = lines.join('\n');

const checks = [
  ['REGRA ANTI-ALUCINACAO', 'REGRA ANTI-ALUCINA'],
  ['ATENÇÃO CRÍTICA PREÇO', 'NUNCA inventar valores como'],
  ['ATENÇÃO CRÍTICA MÍDIA', '[MEDIA_SEND:nomeDaMidia]'],
  ['ATENÇÃO CRÍTICA LINK',  'NUNCA invente ou escreva URLs'],
];

let allOk = true;
for (const [label, needle] of checks) {
  const found = v2.includes(needle);
  console.log(`${found ? '✅' : '❌'} ${label}: ${found ? 'OK' : 'FALTOU'}`);
  if (!found) allOk = false;
}

if (!allOk) {
  console.error('\n❌ Algumas correções não foram aplicadas!');
  process.exit(1);
}

fs.writeFileSync(v2Path, v2, 'utf8');
console.log(`\n✅ prompt-mania-calibrado-v2.txt criado: ${lines.length} linhas`);
