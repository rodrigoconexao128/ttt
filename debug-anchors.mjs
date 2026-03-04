import fs from 'node:fs';
const content = fs.readFileSync('prompt-mania-calibrado-v1.txt', 'utf8').replace(/\r\n/g, '\n');
const lines = content.split('\n');

// Lines 71, 72, 73, 77
for (const n of [71,72,73,77]) {
  const line = lines[n-1];
  console.log(`L${n}: ${JSON.stringify(line)}`);
  console.log(`  hex: ${Buffer.from(line).toString('hex')}`);
}

const a3 = '- Se o cliente trocar de produto no meio da conversa, cancelar mídia pendente e reiniciar qualificação.';
console.log('\nAnchor3 found:', content.includes(a3));

// Try partial anchors
const partials = [
  'cancelar m',
  'cancelar mi',
  'cancelar mídia',
  'cancelar m\u00eddia',
  'reiniciar qualifica',
  'reiniciar qualifica\u00e7\u00e3o',
];
for (const p of partials) {
  console.log(`  "${p}" found: ${content.includes(p)}`);
}

// Check line 72 emoji
const line72 = lines[71];
const emojiMatch = line72?.includes('😊');
console.log('\nL72 has emoji 😊:', emojiMatch);
const a2single = '*"{nome}, para não te passar valor incorreto, vou confirmar agora e já volto com o preço exato';
console.log('Anchor2 partial found:', content.includes(a2single));
