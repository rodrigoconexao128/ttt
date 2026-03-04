/**
 * Test simulator API response format
 */
const BASE_URL = 'https://agentezap.online';
const SUPABASE_URL = 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTMzODksImV4cCI6MjA3NzkyOTM4OX0.AVDgFqn1h-00a5CzS2SZYlcXl4TxtKVrdjKDkN08kVM';

async function getToken() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: 'rodrigo4@gmail.com', password: 'Ibira2019!' }),
  });
  const data = await res.json();
  return data.access_token;
}

async function api(method, path, body, token) {
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

async function run() {
  const token = await getToken();
  if (!token) { console.error('No token'); return; }

  // Set up break to cover current time
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const curH = now.getHours();
  const curM = now.getMinutes();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = dayNames[now.getDay()];
  
  const breakStart = `${curH.toString().padStart(2,'0')}:${(curM).toString().padStart(2,'0')}`;
  const breakEnd = `${(curH + 2 > 23 ? 23 : curH + 2).toString().padStart(2,'0')}:${(curM).toString().padStart(2,'0')}`;
  const openHour = (curH - 1 < 0 ? 0 : curH - 1).toString().padStart(2,'0');
  const closeHour = (curH + 4 > 23 ? 23 : curH + 4).toString().padStart(2,'0');
  
  console.log(`Current BRT: ${curH}:${curM} (${today})`);
  console.log(`Business hours: ${openHour}:00-${closeHour}:00, Break: ${breakStart}-${breakEnd}`);

  // Get current config
  const { data: config } = await api('GET', '/api/salon/config', null, token);
  
  // Update with break covering current time
  const newOpeningHours = {
    ...(config?.opening_hours || {}),
    [today]: { enabled: true, open: `${openHour}:00`, close: `${closeHour}:00` },
    __break: { enabled: true, start: breakStart, end: breakEnd },
  };
  
  await api('PUT', '/api/salon/config', { opening_hours: newOpeningHours, is_active: true }, token);
  console.log('Config updated for break test');

  // Wait 1 second for config to propagate
  await new Promise(r => setTimeout(r, 1000));

  // Test simulator
  console.log('\nTesting /api/agent/test...');
  const { status, data } = await api('POST', '/api/agent/test', {
    message: 'Olá, quero marcar um horário',
    history: [],
  }, token);
  
  console.log('Status:', status);
  console.log('Response keys:', Object.keys(data || {}));
  console.log('Full response:', JSON.stringify(data, null, 2).substring(0, 1000));

  // Restore original config
  await api('PUT', '/api/salon/config', {
    opening_hours: config?.opening_hours,
    is_active: config?.is_active,
  }, token);
  console.log('\nConfig restored');
}

run().catch(console.error);
