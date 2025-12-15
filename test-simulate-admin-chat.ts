import fetch from 'node-fetch';

const base = process.env.BASE_URL || 'http://localhost:8080';
const phone = '5511999999999';

async function postSim(phone: string, text?: string, image?: string) {
  const res = await fetch(`${base}/api/simulate/admin-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, text, image }),
  });
  return res.json();
}

async function run() {
  console.log('Sending image...');
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const r1 = await postSim(phone, 'Imagem do cardápio', image);
  console.log('R1:', r1);

  console.log('Sending trigger candidate...');
  const r2 = await postSim(phone, 'Quando o cliente pedir o cardápio');
  console.log('R2:', r2);

  console.log('Confirming...');
  const r3 = await postSim(phone, 'sim');
  console.log('R3:', r3);
}

run().catch(console.error);
