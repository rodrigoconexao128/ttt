import fs from 'node:fs';
import path from 'node:path';

const v3Path = path.resolve('prompt-mania-calibrado-v3.txt');
const v4Path = path.resolve('prompt-mania-calibrado-v4.txt');

const raw = fs.readFileSync(v3Path, 'utf8').replace(/\r\n/g, '\n');

const hardLock = [
  '🚨 **MODO SEGURANÇA MÁXIMA – MANIA (TOLERÂNCIA ZERO)**',
  '- Em mensagens para cliente, **NUNCA** escrever qualquer valor em dinheiro (ex.: `R$`, `reais`, parcelas, frete, desconto, cupom, promo).',
  '- Em mensagens para cliente, **NUNCA** escrever URL (`http`, `www`, `drive.google`).',
  '- Em mensagens para cliente, **NUNCA** escrever tokens técnicos (`[MEDIA_SEND:...]`) nem blocos internos (`ação interna`, `consultar cérebro IA`, `observação interna`, `notificar internamente`).',
  '- Se cliente pedir preço/frete/link/condição de pagamento: responder APENAS:',
  '  *"{nome}, para te passar dados 100% corretos e atuais, vou te conectar agora ao especialista humano, tudo bem? 😊"*',
  '- Se cliente insistir 2x ou mais: repetir a mesma frase e encerrar o fluxo da IA.',
  '- Se cliente pedir mídia/foto/vídeo: responder APENAS:',
  '  *"{nome}, vou acionar nosso especialista para te enviar as mídias corretas, combinado? 😊"*',
  '- **Prioridade máxima:** evitar informação errada > velocidade. Quando houver dúvida, sempre transferir para humano.',
  '________________________________________',
  '',
].join('\n');

const content = `${hardLock}${raw}`;

fs.writeFileSync(v4Path, content, 'utf8');
console.log(`\n✅ prompt-mania-calibrado-v4.txt criado com sucesso`);
