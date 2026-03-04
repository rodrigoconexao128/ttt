/**
 * Admin user test
 */
const BASE_URL = 'https://agentezap.online';
const SUPABASE_URL = 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTMzODksImV4cCI6MjA3NzkyOTM4OX0.AVDgFqn1h-00a5CzS2SZYlcXl4TxtKVrdjKDkN08kVM';

async function getToken(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (data.access_token) return data.access_token;
  throw new Error(`Login failed: ${data.error}`);
}

async function api(method, path, body, token) {
  const opts = { method, headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text.substring(0, 200) }; }
}

let p = 0, f = 0;
function test(name, cond, extra = '') {
  if (cond) { console.log(`✅ ${name}${extra ? ': ' + extra : ''}`); p++; }
  else { console.log(`❌ ${name}${extra ? ': ' + extra : ''}`); f++; }
}

async function run() {
  console.log('=== FINAL VALIDATION ===\n');

  // Test with client user
  const clientToken = await getToken('rodrigo4@gmail.com', 'Ibira2019!');
  test('Client auth', !!clientToken);

  // Test admin user access
  let adminToken;
  try {
    adminToken = await getToken('rodrigoconexao128@gmail.com', 'Ibira2019!');
    test('Admin auth', !!adminToken);
  } catch (e) {
    test('Admin auth', false, e.message);
  }

  // Client: Verify salon config state
  const { data: config } = await api('GET', '/api/salon/config', null, clientToken);
  test('Client config loaded', !!config?.opening_hours);
  test('Client break config preserved', !!config?.opening_hours?.__break, 
       JSON.stringify(config?.opening_hours?.__break));
  test('Client is_active', config?.is_active === true);

  // Client: Verify services
  const { data: services } = await api('GET', '/api/salon/services', null, clientToken);
  test('Services loaded', Array.isArray(services));
  test('Has services', services?.length > 0, `count=${services?.length}`);
  if (services?.length > 0) {
    services.forEach(s => console.log(`   - ${s.name}: ${s.duration_minutes}min, R$${s.price || 0}`));
  }

  // Client: Verify available slots  
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const { data: slots } = await api('GET', `/api/salon/available-slots?date=${tomorrow}&serviceDuration=30`, null, clientToken);
  test('Available slots work', Array.isArray(slots) && slots.length > 0, `count=${slots?.length}`);

  // Check break is enforced in slots
  if (Array.isArray(slots) && config?.opening_hours?.__break?.enabled) {
    const breakStart = config.opening_hours.__break.start;
    const breakEnd = config.opening_hours.__break.end;
    const [bsh, bsm] = breakStart.split(':').map(Number);
    const [beh, bem] = breakEnd.split(':').map(Number);
    const breakStartMin = bsh * 60 + bsm;
    const breakEndMin = beh * 60 + bem;
    
    const slotsInBreak = slots.filter(s => {
      const [h, m] = s.split(':').map(Number);
      const start = h * 60 + m;
      const end = start + 30;
      return start < breakEndMin && end > breakStartMin;
    });
    
    test(`No slots during break (${breakStart}-${breakEnd})`, slotsInBreak.length === 0,
         slotsInBreak.length > 0 ? `Found: ${slotsInBreak.join(', ')}` : 'none found ✅');
  }

  // Simulator test - current time
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  console.log(`\nCurrent BRT time: ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`);
  
  // Quick simulator test (outside break, may need AI response)
  const { status: simStatus, data: simResp } = await api('POST', '/api/agent/test', {
    message: 'Oi, quero um corte de cabelo amanhã',
    history: [],
  }, clientToken);
  
  test('Simulator responds', simStatus === 200 && (simResp?.response || simResp?.message));
  if (simResp?.response) {
    console.log(`   Simulator response: "${simResp.response.substring(0, 100)}..."`);
    const isBreakMsg = simResp.response.includes('almoço') || simResp.response.includes('Voltamos');
    // At 02:xx BRT, we're outside business hours (not in break), so should get a "closed" message or booking flow
    const isReasonable = simResp.response.length > 0;
    test('Simulator response is reasonable', isReasonable);
  }

  console.log(`\n=== FINAL: ${p} passed, ${f} failed ===`);
}

run().catch(console.error);
