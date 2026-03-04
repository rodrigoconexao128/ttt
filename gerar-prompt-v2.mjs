import fs from 'node:fs';
import path from 'node:path';

const v1Path = path.resolve('prompt-mania-calibrado-v1.txt');
const v2Path = path.resolve('prompt-mania-calibrado-v2.txt');

let content = fs.readFileSync(v1Path, 'utf8');
// Normalizar line endings para evitar problema \r\n vs \n
content = content.replace(/\r\n/g, '\n');

// ══════════════════════════════════════════════════════
// CORREÇÃO 1: REGRA ANTI-ALUCINAÇÃO GLOBAL
// Inserir após REGRA ZERO, item 2
// ══════════════════════════════════════════════════════
const REGRA_ZERO_ANCHOR = '2. **Bloquear qualquer menção a preços de colchões/camas** sem validação total (ver regras específicas).';
const REGRA_ANTI_ALUCINACAO = `2. **Bloquear qualquer menção a preços de colchões/camas** sem validação total (ver regras específicas).

3. 🔒 **REGRA ANTI-ALUCINAÇÃO ABSOLUTA (todos os produtos, sem exceção):**
   - ❌ **NUNCA invente, estime, exemplifique ou calcule preços** que NÃO estejam escritos literalmente neste prompt. Frases como "geralmente R$ 25–R$ 40", "em média R$ 12", "R$ 129,90" ou "5% de desconto PIX" – se não estiverem neste texto – são **terminantemente proibidas**.
   - ❌ **NUNCA escreva tokens [MEDIA_SEND:...]** em suas respostas. O envio de mídia é feito pelo sistema automaticamente. O agente deve apenas confirmar: *"Vou te enviar as fotos agora! 😊"* – nunca incluir o token no texto.
   - ❌ **NUNCA crie ou escreva URLs** que não estejam listadas explicitamente neste prompt. Se a URL não constar aqui, responda: *"{nome}, vou localizar o link correto agora 😊"*
   - ❌ **NUNCA ofereça cupons, brindes, descontos ou promoções** que não estejam escritas neste prompt.
   - **Para qualquer valor NÃO listado neste prompt (incluindo lençóis, fronhas, toalhas, edredons, cabeceiras, protetores, cobre-leitos, fretes estimados):** responder SEMPRE: *"{nome}, vou consultar o valor exato agora e já te informo! 😊"* – **sem estimativas, sem exemplos, sem cálculos approximados.**`;

content = content.replace(REGRA_ZERO_ANCHOR, REGRA_ANTI_ALUCINACAO);

// ══════════════════════════════════════════════════════
// CORREÇÃO 2: BLOQUEIO CRÍTICO PREÇO – reforçar que cérebro IA não valida
// ══════════════════════════════════════════════════════
const PRECO_ANCHOR = '- Se qualquer item falhar, **não enviar preço** e responder:\n   *"{nome}, para não te passar valor incorreto, vou confirmar agora e já volto com o preço exato 😊"*';
const PRECO_REFORCO = `- Se qualquer item falhar, **não enviar preço** e responder:
   *"{nome}, para não te passar valor incorreto, vou confirmar agora e já volto com o preço exato 😊"*

⚠ **ATENÇÃO CRÍTICA – PREÇO:**
- O "cérebro IA" **NÃO gera preços válidos** – ele apenas verifica se a qualificação está completa. Qualquer número inventado pela IA é uma alucinação proibida.
- Produtos **SEM tabela de preços neste prompt** (lençóis, fronhas, toalhas, edredons, cabeceiras, protetores, cobre-leitos): SEMPRE responder *"{nome}, vou consultar o valor exato e já te informo! 😊"* – **NUNCA inventar valores como "R$129,90", "R$12 de frete", "R$25–R$40"**.
- Mesmo que o cliente confirme um preço citado por ele mesmo, **não confirmar um valor que não esteja neste prompt**.`;

content = content.replace(PRECO_ANCHOR, PRECO_REFORCO);

// ══════════════════════════════════════════════════════
// CORREÇÃO 3: BLOQUEIO CRÍTICO MÍDIA – proibir token [MEDIA_SEND]
// ══════════════════════════════════════════════════════
const MIDIA_ANCHOR = '- Se o cliente trocar de produto no meio da conversa, cancelar mídia pendente e reiniciar qualificação.';
const MIDIA_REFORCO = `- Se o cliente trocar de produto no meio da conversa, cancelar mídia pendente e reiniciar qualificação.

⚠ **ATENÇÃO CRÍTICA – MÍDIA:**
- **NUNCA escreva** \`[MEDIA_SEND:nomeDaMidia]\` em suas respostas. Esse token é usado **somente pelo sistema internamente**. O agente deve apenas dizer: *"Vou te enviar as fotos agora! 😊"* e aguardar o sistema enviar.
- A autorização explícita do cliente deve ser: o cliente dizer palavras como *"pode enviar"*, *"manda a foto"*, *"quero ver"* – **e o produto + tamanho + modelo já confirmados**. Somente após isso o agente diz que vai enviar (sem o token).`;

content = content.replace(MIDIA_ANCHOR, MIDIA_REFORCO);

// ══════════════════════════════════════════════════════
// CORREÇÃO 4: BLOQUEIO CRÍTICO LINK – proibir URLs inventadas
// ══════════════════════════════════════════════════════
const LINK_ANCHOR = '- Se cliente pedir link antes da qualificação, responder:\n   *"{nome}, te envio sim 😊 Antes preciso só confirmar produto, tamanho e modelo para mandar o link certo."*';
const LINK_REFORCO = `- Se cliente pedir link antes da qualificação, responder:
   *"{nome}, te envio sim 😊 Antes preciso só confirmar produto, tamanho e modelo para mandar o link certo."*

⚠ **ATENÇÃO CRÍTICA – LINK:**
- **NUNCA invente ou escreva URLs**. Os ÚNICOS links permitidos neste prompt são os listados nas seções de envio de link (Google Drive) abaixo. Qualquer outra URL é **terminantemente proibida**.
- Se o link correto não estiver neste prompt, responder: *"{nome}, vou localizar o link correto agora e te envio em breve 😊"*`;

content = content.replace(LINK_ANCHOR, LINK_REFORCO);

// ══════════════════════════════════════════════════════
// Verificar se todas as substituições foram aplicadas
// ══════════════════════════════════════════════════════
const checks = [
  ['REGRA ANTI-ALUCINAÇÃO ABSOLUTA', '✅ Correção 1 aplicada'],
  ['cérebro IA NÃO gera preços válidos', '✅ Correção 2 aplicada'],
  ['NUNCA escreva `[MEDIA_SEND:', '✅ Correção 3 aplicada'],
  ['NUNCA invente ou escreva URLs', '✅ Correção 4 aplicada'],
];

let allOk = true;
for (const [needle, label] of checks) {
  if (content.includes(needle)) {
    console.log(label);
  } else {
    console.error(`❌ FALHOU: ${label}`);
    allOk = false;
  }
}

if (!allOk) {
  console.error('❌ Algumas correções não foram aplicadas. Verificar ancoras.');
  process.exit(1);
}

fs.writeFileSync(v2Path, content, 'utf8');
console.log(`\n✅ prompt-mania-calibrado-v2.txt criado com sucesso!`);
console.log(`   Tamanho: ${content.length} chars | ${content.split('\n').length} linhas`);
