import fs from 'fs';
import path from 'path';

const BASE = 'https://agentezap.online';
const email = 'rodrigo4@gmail.com';
const password = 'Ibira2019!';

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

const login = await jsonFetch(`${BASE}/api/auth/signin`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password })
});

if (login.status !== 200 || !login.data?.session?.access_token) {
  console.error('LOGIN_FAILED', login.status, login.data);
  process.exit(1);
}

const token = login.data.session.access_token;
console.log('LOGIN_OK');

const create = await jsonFetch(`${BASE}/api/tickets`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ subject: `E2E image test ${Date.now()}`, description: 'criando ticket', priority: 'medium' })
});

if (create.status !== 201) {
  console.error('CREATE_FAILED', create.status, create.data);
  process.exit(1);
}

const ticketId = create.data.ticket.id;
console.log('TICKET_CREATED', ticketId);

const pngPath = path.resolve('test_image.png');
const buf = fs.readFileSync(pngPath);
const fd = new FormData();
fd.append('body', 'imagem e2e');
fd.append('attachments', new Blob([buf], { type: 'image/png' }), 'test_image.png');

const send = await fetch(`${BASE}/api/tickets/${ticketId}/messages`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
  body: fd
});

const sendText = await send.text();
let sendData;
try { sendData = JSON.parse(sendText); } catch { sendData = sendText; }
if (send.status !== 201) {
  console.error('SEND_FAILED', send.status, sendData);
  process.exit(1);
}
console.log('MESSAGE_SENT');

const msgs = await jsonFetch(`${BASE}/api/tickets/${ticketId}/messages`, {
  headers: { authorization: `Bearer ${token}` }
});

if (msgs.status !== 200) {
  console.error('FETCH_MSG_FAILED', msgs.status, msgs.data);
  process.exit(1);
}

const withAttach = (msgs.data.items || []).find(m => (m.attachments || []).length > 0);
if (!withAttach) {
  console.error('NO_ATTACHMENT_IN_MESSAGES');
  process.exit(1);
}

const att = withAttach.attachments[0];
console.log('ATTACHMENT_FOUND', { id: att.id, publicUrl: att.publicUrl, storageKey: att.storageKey, originalName: att.originalName });

if (!att.publicUrl) {
  console.error('NO_PUBLIC_URL');
  process.exit(2);
}

const imgRes = await fetch(att.publicUrl, { method: 'HEAD' });
console.log('PUBLIC_URL_HEAD', imgRes.status);
if (!imgRes.ok) {
  console.error('PUBLIC_URL_NOT_ACCESSIBLE');
  process.exit(3);
}

console.log('E2E_OK');
