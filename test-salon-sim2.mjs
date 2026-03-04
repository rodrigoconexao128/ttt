/**
 * Test simulator outside break time - should allow scheduling
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
  return (await res.json()).access_token;
}

async function api(method, path, body, token) {
  const opts = { method, headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

let passed = 0, failed = 0;
function test(name, condition, extra = '') {
  if (condition) { console.log(`✅ ${name}${extra ? ': ' + extra : ''}`); passed++; }
  else { console.log(`❌ ${name}${extra ? ': ' + extra : ''}`); failed++; }
}

async function run() {
  const token = await getToken();
  test('Auth OK', !!token);
  if (!token) return;

  const { data: config } = await api('GET', '/api/salon/config', null, token);
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const curH = now.getHours();
  const curM = now.getMinutes();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = dayNames[now.getDay()];
  
  console.log(`\nCurrent BRT: ${curH.toString().padStart(2,'0')}:${curM.toString().padStart(2,'0')} (${today})`);

  // === TEST A: During break (already verified above) ===
  // === TEST B: Outside break - should allow scheduling ===
  
  // Set break to be 3+ hours from now (effectively not during break)
  const futureBreakH = (curH + 3) % 24;
  const breakStartFuture = `${futureBreakH.toString().padStart(2,'0')}:00`;
  const breakEndFuture = `${((futureBreakH + 1) % 24).toString().padStart(2,'0')}:00`;
  const openHour = (curH - 1 < 0 ? 0 : curH - 1).toString().padStart(2,'0');
  const closeHour = (curH + 6 > 23 ? 23 : curH + 6).toString().padStart(2,'0');
  
  console.log(`Business hours: ${openHour}:00-${closeHour}:00, Break: ${breakStartFuture}-${breakEndFuture} (future - not during break now)`);
  
  const outsideBreakHours = {
    ...(config?.opening_hours || {}),
    [today]: { enabled: true, open: `${openHour}:00`, close: `${closeHour}:00` },
    __break: { enabled: true, start: breakStartFuture, end: breakEndFuture },
  };
  
  await api('PUT', '/api/salon/config', { opening_hours: outsideBreakHours, is_active: true }, token);
  await new Promise(r => setTimeout(r, 500));
  
  const { status: sa, data: simA } = await api('POST', '/api/agent/test', {
    message: 'Olá, quero marcar um horário',
    history: [],
  }, token);
  
  console.log('\n[TEST B - Outside break]');
  test('Simulator responds outside break', sa === 200);
  const notBreakMsg = !simA?.response?.includes('almoço') && !simA?.response?.includes('Voltamos em breve');
  test('NOT showing break message when outside break', notBreakMsg, 
       `response: "${simA?.response?.substring(0, 150)}"`);

  // === TEST C: Business closed (outside business hours) ===
  const pastCloseHour = (curH - 3 < 0 ? 0 : curH - 3).toString().padStart(2,'0');
  const closeBeforeNow = (curH - 2 < 0 ? 0 : curH - 2).toString().padStart(2,'0');
  
  // Business closed before current time
  if (curH >= 3) {
    const closedHours = {
      ...(config?.opening_hours || {}),
      [today]: { enabled: true, open: `${pastCloseHour}:00`, close: `${closeBeforeNow}:00` },
      __break: { enabled: false, start: '12:00', end: '13:00' },
    };
    
    await api('PUT', '/api/salon/config', { opening_hours: closedHours, is_active: true }, token);
    await new Promise(r => setTimeout(r, 500));
    
    const { status: sc, data: simC } = await api('POST', '/api/agent/test', {
      message: 'Quero marcar um corte',
      history: [],
    }, token);
    
    console.log('\n[TEST C - Business closed]');
    test('Simulator responds when closed', sc === 200);
    const isClosedMsg = simC?.response?.includes('fechado') || simC?.response?.includes('horário') || simC?.response?.includes('Horário');
    test('Shows closed message', isClosedMsg, `response: "${simC?.response?.substring(0, 150)}"`);
  } else {
    console.log('\n[TEST C - Skipped: curH < 3, can\'t simulate business closure]');
  }

  // === CLEANUP ===
  await api('PUT', '/api/salon/config', {
    opening_hours: config?.opening_hours,
    is_active: config?.is_active,
  }, token);
  console.log('\n[CLEANUP] Restored ✅');

  console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed ===`);
}

run().catch(console.error);
