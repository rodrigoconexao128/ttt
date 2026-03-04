/**
 * Full production test suite for salon feature
 */

const BASE_URL = 'https://agentezap.online';
const SUPABASE_URL = 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTMzODksImV4cCI6MjA3NzkyOTM4OX0.AVDgFqn1h-00a5CzS2SZYlcXl4TxtKVrdjKDkN08kVM';

let authToken = null;

async function getToken() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: 'rodrigo4@gmail.com', password: 'Ibira2019!' }),
  });
  const data = await res.json();
  return data.access_token;
}

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${authToken}`, 'Accept': 'application/json' },
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

let passed = 0;
let failed = 0;

function test(name, condition, extra = '') {
  if (condition) {
    console.log(`✅ ${name}${extra ? ' - ' + extra : ''}`);
    passed++;
  } else {
    console.log(`❌ ${name}${extra ? ' - ' + extra : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== PRODUCTION SALON TEST SUITE ===\n');

  // Auth
  authToken = await getToken();
  test('Authentication', !!authToken);
  if (!authToken) return;

  // ═══ TEST 1: GET CONFIG ═══
  const { status: s1, data: config } = await api('GET', '/api/salon/config');
  test('GET /api/salon/config returns 200', s1 === 200);
  test('Config has opening_hours', !!config?.opening_hours);
  test('Config has __break field', config?.opening_hours?.hasOwnProperty('__break'));
  const originalConfig = config; // Save for restore

  // ═══ TEST 2: BREAK PERSISTENCE (ENABLE) ═══
  console.log('\n--- TEST: Break Persistence ---');
  const withBreak = { ...config?.opening_hours, __break: { enabled: true, start: '12:00', end: '13:00' } };
  const { data: saved1 } = await api('PUT', '/api/salon/config', { opening_hours: withBreak });
  const { data: verify1 } = await api('GET', '/api/salon/config');
  test('Save break enabled=true', verify1?.opening_hours?.__break?.enabled === true, 
       `saved: ${JSON.stringify(verify1?.opening_hours?.__break)}`);

  // ═══ TEST 3: BREAK PERSISTENCE (DISABLE) ═══
  const withBreakDisabled = { ...withBreak, __break: { enabled: false, start: '12:00', end: '13:00' } };
  await api('PUT', '/api/salon/config', { opening_hours: withBreakDisabled });
  const { data: verify2 } = await api('GET', '/api/salon/config');
  test('Save break enabled=false', verify2?.opening_hours?.__break?.enabled === false,
       `saved: ${JSON.stringify(verify2?.opening_hours?.__break)}`);

  // ═══ TEST 4: BREAK PRESERVED WHEN SAVING OTHER FIELDS ═══
  console.log('\n--- TEST: Break Preserved on Partial Update ---');
  // Re-enable break
  await api('PUT', '/api/salon/config', { opening_hours: withBreak });
  // Save only slot_duration (not opening_hours)
  const { data: verify3 } = await api('PUT', '/api/salon/config', { slot_duration: 45 });
  const { data: verify3b } = await api('GET', '/api/salon/config');
  test('Break preserved after slot_duration update', verify3b?.opening_hours?.__break?.enabled === true,
       `__break: ${JSON.stringify(verify3b?.opening_hours?.__break)}`);
  // Restore slot_duration
  await api('PUT', '/api/salon/config', { slot_duration: config?.slot_duration || 30 });

  // ═══ TEST 5: AVAILABLE SLOTS WITH BREAK ═══
  console.log('\n--- TEST: Slot Availability ---');
  // Make sure break is enabled 12:00-13:00
  await api('PUT', '/api/salon/config', { opening_hours: withBreak });

  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const { status: s5, data: slots } = await api('GET', `/api/salon/available-slots?date=${tomorrow}&serviceDuration=30`);
  test('GET available-slots returns 200', s5 === 200);
  test('Slots is array', Array.isArray(slots));

  if (Array.isArray(slots)) {
    test('Has available slots', slots.length > 0, `count: ${slots.length}`);
    
    const breakSlots = slots.filter(s => {
      const [h, m] = s.split(':').map(Number);
      const mins = h * 60 + m;
      // 12:00 to 12:59 should be blocked (overlap with 12:00-13:00 break)
      return mins >= 12 * 60 && mins < 13 * 60;
    });
    test('No slots during break (12:00-13:00)', breakSlots.length === 0, 
         breakSlots.length > 0 ? `Found: ${breakSlots.join(', ')}` : 'none');

    // Check 11:30 is available (ends at 12:00, no overlap with break start)
    const has1130 = slots.includes('11:30');
    const has1300 = slots.includes('13:00');
    test('11:30 slot available (ends at break start)', has1130);
    test('13:00 slot available (starts at break end)', has1300);
  }

  // ═══ TEST 6: SERVICES ═══
  console.log('\n--- TEST: Services CRUD ---');
  const { status: s6, data: services } = await api('GET', '/api/salon/services');
  test('GET /api/salon/services returns 200', s6 === 200);
  test('Services is array', Array.isArray(services));

  if (Array.isArray(services)) {
    // Create a test service
    const { status: s6c, data: newService } = await api('POST', '/api/salon/services', {
      name: 'Test Service Delete Me',
      duration_minutes: 60,
      price: '50',
      is_active: true,
      color: '#6366f1',
    });
    test('Create service', s6c === 201 || s6c === 200, `id: ${newService?.id}`);

    if (newService?.id) {
      // Update service
      const { status: s6u, data: updated } = await api('PUT', `/api/salon/services/${newService.id}`, {
        name: 'Test Service Delete Me Updated',
        duration_minutes: 75,
        price: '60',
        is_active: true,
        color: '#6366f1',
      });
      test('Update service', s6u === 200, `duration: ${updated?.duration_minutes}`);
      test('Service duration updated', updated?.duration_minutes === 75);

      // Verify persistence
      const { data: services2 } = await api('GET', '/api/salon/services');
      const found = services2?.find(s => s.id === newService.id);
      test('Service duration persisted', found?.duration_minutes === 75, `actual: ${found?.duration_minutes}`);

      // Delete test service
      const { status: s6d } = await api('DELETE', `/api/salon/services/${newService.id}`);
      test('Delete service', s6d === 200);
    }
  }

  // ═══ TEST 7: SIMULATOR - BREAK BLOCKING ═══
  console.log('\n--- TEST: Simulator Break Blocking ---');
  // The simulator calls /api/agent/test which calls generateSalonResponse
  // Break check happens at the START of generateSalonResponse
  // Currently time is 02:33 BRT (outside business hours + outside break)
  // We can't test "during break" directly unless we modify the break window to current time
  
  // Set break to current time + 5min to simulate being in break
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const curH = now.getHours();
  const curM = now.getMinutes();
  
  // Set break window to cover current time
  const breakStart = `${curH.toString().padStart(2,'0')}:${(curM - 1 < 0 ? 59 : curM - 1).toString().padStart(2,'0')}`;
  const breakEnd = `${curH.toString().padStart(2,'0')}:${(curM + 2 > 59 ? 59 : curM + 2).toString().padStart(2,'0')}`;
  
  // Also need business hours to cover current time
  const openHour = (curH - 1 < 0 ? 0 : curH - 1).toString().padStart(2,'0');
  const closeHour = (curH + 2 > 23 ? 23 : curH + 2).toString().padStart(2,'0');
  
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = dayNames[now.getDay()];
  
  const testOpeningHours = {
    ...(withBreak),
    [today]: { enabled: true, open: `${openHour}:00`, close: `${closeHour}:00` },
    __break: { enabled: true, start: breakStart, end: breakEnd },
  };
  
  await api('PUT', '/api/salon/config', { opening_hours: testOpeningHours, is_active: true });
  
  console.log(`  Break window set to: ${breakStart}-${breakEnd} on ${today} (business hours: ${openHour}:00-${closeHour}:00)`);
  
  // Test simulator with break enabled
  const { status: s7, data: simResp } = await api('POST', '/api/agent/test', {
    message: 'Olá, quero marcar um horário',
    history: [],
  });
  
  test('Simulator responds', s7 === 200 || !!simResp?.message);
  if (simResp?.message) {
    const isBreakMsg = simResp.message.includes('almoço') || simResp.message.includes('almoço') || simResp.message.includes('lunch') || simResp.message.includes('Voltamos') || simResp.message.includes('intervalo');
    test('Simulator blocks during break (returns break message)', isBreakMsg, 
         `response: "${simResp?.message?.substring(0, 100)}"`);
  } else if (simResp?.text) {
    const isBreakMsg = simResp.text.includes('almoço') || simResp.text.includes('Voltamos') || simResp.text.includes('intervalo');
    test('Simulator blocks during break (returns break message)', isBreakMsg, 
         `response: "${simResp?.text?.substring(0, 100)}"`);
  }

  // ═══ CLEANUP ═══
  console.log('\n--- CLEANUP ---');
  await api('PUT', '/api/salon/config', {
    opening_hours: originalConfig?.opening_hours,
    is_active: originalConfig?.is_active,
    slot_duration: originalConfig?.slot_duration,
  });
  console.log('Original config restored ✅');

  // ═══ SUMMARY ═══
  console.log('\n=== SUMMARY ===');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  if (failed === 0) console.log('\n🎉 ALL TESTS PASSED!');
  else console.log('\n⚠️ Some tests failed - see details above');
}

runTests().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
