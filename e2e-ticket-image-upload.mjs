import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://agentezap.online';
const EMAIL = 'rodrigo4@gmail.com';
const PASSWORD = 'Ibira2019!';

let token = '';
let cookie = '';

async function req(method, url, { json, form, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (cookie) h['Cookie'] = cookie;

  let body;
  if (json) {
    h['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }

  const res = await fetch(`${BASE}${url}`, { method, headers: h, body, redirect: 'manual' });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

function makeTinyPng() {
  // 10x10 png (already used in repo)
  const p = path.resolve('test_image.png');
  if (fs.existsSync(p)) return p;
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAQAAACEN29AAAAAOUlEQVR42mP8//8/AxJgYGBg+A8EwDiqGJgY/v//PwMDA8O/f/8MDAwM/4mBgYHhPwMDAwPDf2AAAO8mCwWm6iQJAAAAAElFTkSuQmCC';
  const out = path.resolve('tmp-ticket-test.png');
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  return out;
}

async function main() {
  console.log('1) Login...');
  const login = await req('POST', '/api/auth/signin', { json: { email: EMAIL, password: PASSWORD } });
  console.log('login status', login.status);
  if (login.status !== 200) {
    console.log(login.data);
    process.exit(1);
  }
  token = login.data?.session?.access_token || '';

  console.log('2) Create ticket...');
  const unique = Date.now();
  const create = await req('POST', '/api/tickets', { json: { subject: `E2E Upload ${unique}`, description: 'Teste E2E upload imagem', priority: 'medium' } });
  console.log('create status', create.status);
  if (![200, 201].includes(create.status)) {
    console.log(create.data);
    process.exit(1);
  }
  const ticketId = create.data?.id || create.data?.ticket?.id;
  console.log('ticketId', ticketId);

  console.log('3) Send image attachment...');
  const imgPath = makeTinyPng();
  const blob = new Blob([fs.readFileSync(imgPath)], { type: 'image/png' });
  const form = new FormData();
  form.append('body', `Imagem E2E ${unique}`);
  form.append('attachments', blob, `test-${unique}.png`);
  const send = await req('POST', `/api/tickets/${ticketId}/messages`, { form });
  console.log('send status', send.status);
  if (![200, 201].includes(send.status)) {
    console.log(send.data);
    process.exit(1);
  }

  console.log('4) Fetch messages and verify image url...');
  const msgs = await req('GET', `/api/tickets/${ticketId}/messages`);
  console.log('messages status', msgs.status);
  if (msgs.status !== 200) {
    console.log(msgs.data);
    process.exit(1);
  }
  const arr = Array.isArray(msgs.data) ? msgs.data : (msgs.data?.items || msgs.data?.messages || []);
  const withAttachment = arr.find(m => Array.isArray(m.attachments) && m.attachments.length > 0);
  if (!withAttachment) {
    console.error('No attachment found in ticket messages');
    process.exit(1);
  }
  const url = withAttachment.attachments[0]?.url || withAttachment.attachments[0]?.storageUrl;
  console.log('attachment url:', url);
  if (!url) {
    console.error('Attachment URL missing');
    process.exit(1);
  }

  const fileRes = await fetch(url, { method: 'GET' });
  console.log('attachment http status', fileRes.status, 'content-type', fileRes.headers.get('content-type'));
  if (fileRes.status !== 200) {
    console.error('Attachment URL not reachable');
    process.exit(1);
  }

  console.log('\n✅ E2E ticket image upload validated successfully');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
