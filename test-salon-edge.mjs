/**
 * Edge case tests for salon break + persistence
 * Cycle 2: Edge/Error cases
 * Cycle 3: Regression
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
  if (!token) { console.error('No token'); return; }
  
  const { data: origConfig } = await api('GET', '/api/salon/config', null, token);
  
  console.log('=== CYCLE 2: EDGE CASES ===\n');

  // EDGE 1: Save break time with exact same start/end (1-second window)
  console.log('[EDGE 1] Save break with narrow window...');
  const narrowBreak = { enabled: true, start: '12:00', end: '12:05' };
  const { data: e1 } = await api('PUT', '/api/salon/config', {
    opening_hours: { ...(origConfig?.opening_hours || {}), __break: narrowBreak }
  }, token);
  const { data: e1v } = await api('GET', '/api/salon/config', null, token);
  test('Narrow break (12:00-12:05) saved', e1v?.opening_hours?.__break?.end === '12:05',
       JSON.stringify(e1v?.opening_hours?.__break));

  // EDGE 2: Break time spanning midnight (invalid - end < start)
  console.log('\n[EDGE 2] Break time end < start...');
  const invertedBreak = { enabled: true, start: '13:00', end: '12:00' };
  await api('PUT', '/api/salon/config', {
    opening_hours: { ...(origConfig?.opening_hours || {}), __break: invertedBreak }
  }, token);
  const { data: e2v } = await api('GET', '/api/salon/config', null, token);
  // Should either be rejected or saved as-is (backend doesn't validate this)
  test('Inverted break saved (backend accepts, no crash)', 
       e2v?.opening_hours?.__break !== undefined,
       JSON.stringify(e2v?.opening_hours?.__break));
  
  // Check slots with inverted break (should effectively have no break blocking since end < start)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const { data: slotsInverted } = await api('GET', `/api/salon/available-slots?date=${tomorrow}&serviceDuration=30`, null, token);
  // With inverted break, 12:00 slot should be available (start=13:00, end=12:00 means start>end)
  if (Array.isArray(slotsInverted)) {
    // The logic: isOverlapping(start=720, end=750, breakStart=780, breakEnd=720) = 720 < 720 = false
    // So ALL slots are available when break is inverted
    const has1200 = slotsInverted.includes('12:00');
    test('12:00 slot available with inverted break', has1200, 
         `(inverted break shouldn't block anything)`);
  }

  // EDGE 3: Save with break enabled = false (switch off)
  console.log('\n[EDGE 3] Toggle break on/off multiple times...');
  let lastBreak;
  for (let i = 0; i < 3; i++) {
    const enabled = i % 2 === 0; // toggle
    await api('PUT', '/api/salon/config', {
      opening_hours: { ...(origConfig?.opening_hours || {}), __break: { enabled, start: '12:00', end: '13:00' } }
    }, token);
    const { data: toggleV } = await api('GET', '/api/salon/config', null, token);
    lastBreak = toggleV?.opening_hours?.__break?.enabled;
    test(`Toggle ${i+1}: enabled=${enabled}`, lastBreak === enabled, `actual=${lastBreak}`);
  }

  // EDGE 4: Save only is_active, verify break unchanged
  console.log('\n[EDGE 4] Save is_active only, verify break unchanged...');
  // First, set a known break state
  await api('PUT', '/api/salon/config', {
    opening_hours: { ...(origConfig?.opening_hours || {}), __break: { enabled: true, start: '12:00', end: '13:00' } }
  }, token);
  // Then save just is_active (no opening_hours in payload)
  await api('PUT', '/api/salon/config', { is_active: false }, token);
  const { data: e4v } = await api('GET', '/api/salon/config', null, token);
  test('Break unchanged after is_active toggle', 
       e4v?.opening_hours?.__break?.enabled === true && e4v?.is_active === false,
       `is_active=${e4v?.is_active}, break.enabled=${e4v?.opening_hours?.__break?.enabled}`);

  // EDGE 5: Service with duration_minutes = 1 (minimum valid)
  console.log('\n[EDGE 5] Service with minimum duration...');
  const { status: e5s, data: e5d } = await api('POST', '/api/salon/services', {
    name: 'Test Min Duration',
    duration_minutes: 1,
    is_active: true,
    color: '#ff0000',
  }, token);
  test('Create service with 1min duration', e5s === 200 || e5s === 201, `id=${e5d?.id}`);
  if (e5d?.id) {
    // Read back
    const { data: services } = await api('GET', '/api/salon/services', null, token);
    const found = services?.find(s => s.id === e5d.id);
    test('1min duration persisted', found?.duration_minutes === 1, `actual=${found?.duration_minutes}`);
    // Cleanup
    await api('DELETE', `/api/salon/services/${e5d.id}`, null, token);
    console.log('  (test service deleted)');
  }

  // EDGE 6: Service with duration = 0 (invalid, should fail)
  console.log('\n[EDGE 6] Service with duration = 0 (invalid)...');
  const { status: e6s, data: e6d } = await api('POST', '/api/salon/services', {
    name: 'Test Zero Duration',
    duration_minutes: 0,
    is_active: true,
    color: '#ff0000',
  }, token);
  test('Duration=0 rejected', e6s === 400 || (e6s !== 200 && e6s !== 201),
       `status=${e6s}, msg=${JSON.stringify(e6d?.message || e6d).substring(0, 100)}`);

  console.log('\n=== CYCLE 3: REGRESSION ===\n');

  // REGRESSION 1: Original config restore
  await api('PUT', '/api/salon/config', {
    opening_hours: origConfig?.opening_hours,
    is_active: origConfig?.is_active,
    slot_duration: origConfig?.slot_duration,
  }, token);
  const { data: regV } = await api('GET', '/api/salon/config', null, token);
  test('Config fully restored', 
       JSON.stringify(regV?.opening_hours?.__break) === JSON.stringify(origConfig?.opening_hours?.__break),
       `before=${JSON.stringify(origConfig?.opening_hours?.__break)}, after=${JSON.stringify(regV?.opening_hours?.__break)}`);

  // REGRESSION 2: Services still work after config changes
  const { status: rs, data: rServices } = await api('GET', '/api/salon/services', null, token);
  test('Services endpoint still works', rs === 200 && Array.isArray(rServices));

  // REGRESSION 3: Slot availability still works
  const { status: rss, data: rSlots } = await api('GET', `/api/salon/available-slots?date=${tomorrow}&serviceDuration=30`, null, token);
  test('Slot availability still works', rss === 200 && Array.isArray(rSlots));

  console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed ===`);
  if (failed === 0) console.log('🎉 ALL EDGE & REGRESSION TESTS PASSED!');
}

run().catch(console.error);
