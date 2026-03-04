/**
 * Test script for salon API - runs directly with Node.js
 * Tests: login → get config → save break → reload → verify
 */

const BASE_URL = 'http://localhost:5000';

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'rodrigo4@gmail.com', password: 'Ibira2019!' }),
  });
  const setCookie = res.headers.get('set-cookie');
  const data = await res.json();
  console.log('[LOGIN] status:', res.status, 'user:', data.user?.email || data.message);
  return { cookie: setCookie, user: data.user };
}

async function getSalonConfig(cookie) {
  const res = await fetch(`${BASE_URL}/api/salon/config`, {
    headers: { 'Cookie': cookie },
  });
  const data = await res.json();
  return data;
}

async function putSalonConfig(cookie, body) {
  const res = await fetch(`${BASE_URL}/api/salon/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
    body: JSON.stringify(body),
  });
  return await res.json();
}

async function runTests() {
  try {
    // 1. LOGIN
    const { cookie, user } = await login();
    if (!cookie) { console.error('[ERROR] No session cookie returned'); return; }
    console.log('[LOGIN] ✅ Cookie obtained');

    // 2. GET INITIAL CONFIG
    const config1 = await getSalonConfig(cookie);
    console.log('[CONFIG GET 1] opening_hours.__break:', JSON.stringify(config1?.opening_hours?.__break));

    // 3. SAVE WITH BREAK ENABLED
    const testBreak = { enabled: true, start: '12:00', end: '13:00' };
    const openingHoursWithBreak = {
      ...(config1?.opening_hours || {}),
      __break: testBreak,
    };
    // Remove existing __break before spread to avoid duplication
    delete openingHoursWithBreak.__break;
    Object.assign(openingHoursWithBreak, { __break: testBreak });

    const saveResult = await putSalonConfig(cookie, {
      opening_hours: openingHoursWithBreak,
      is_active: true,
    });
    console.log('[CONFIG PUT] result.__break:', JSON.stringify(saveResult?.opening_hours?.__break));

    // 4. RELOAD AND VERIFY
    const config2 = await getSalonConfig(cookie);
    console.log('[CONFIG GET 2] opening_hours.__break:', JSON.stringify(config2?.opening_hours?.__break));

    const breakPersisted = config2?.opening_hours?.__break?.enabled === true;
    console.log('\n=== TEST RESULT ===');
    console.log('Break persistence:', breakPersisted ? '✅ PASS' : '❌ FAIL');

    // 5. SAVE WITH BREAK DISABLED (simulate disabling)
    const openingHoursDisabled = {
      ...(config2?.opening_hours || {}),
      __break: { enabled: false, start: '12:00', end: '13:00' },
    };
    const saveResult2 = await putSalonConfig(cookie, {
      opening_hours: openingHoursDisabled,
    });
    console.log('[CONFIG PUT 2 - disable break] result.__break:', JSON.stringify(saveResult2?.opening_hours?.__break));

    // 6. RE-ENABLE AND SAVE
    const openingHoursReEnabled = {
      ...(saveResult2?.opening_hours || {}),
      __break: { enabled: true, start: '11:30', end: '13:30' },
    };
    const saveResult3 = await putSalonConfig(cookie, {
      opening_hours: openingHoursReEnabled,
    });
    console.log('[CONFIG PUT 3 - re-enable] result.__break:', JSON.stringify(saveResult3?.opening_hours?.__break));

    // 7. VERIFY SLOT BLOCKING (check available slots during break time)
    const today = new Date().toISOString().split('T')[0];
    const slotsRes = await fetch(`${BASE_URL}/api/salon/available-slots?date=${today}&serviceDuration=30`, {
      headers: { 'Cookie': cookie },
    });
    const slots = await slotsRes.json();
    console.log('\n[AVAILABLE SLOTS] total:', slots.length);
    
    const duringBreakSlots = slots.filter(s => {
      const [h, m] = s.split(':').map(Number);
      const mins = h * 60 + m;
      // check if slot + 30min overlaps with 11:30-13:30
      return mins < 13 * 60 + 30 && (mins + 30) > 11 * 60 + 30;
    });
    console.log('[SLOTS during break 11:30-13:30]:', duringBreakSlots);
    console.log('Break blocking:', duringBreakSlots.length === 0 ? '✅ PASS' : '❌ FAIL - slots exist during break!');

    console.log('\n=== ALL TESTS DONE ===');
  } catch (err) {
    console.error('[ERROR]', err);
  }
}

runTests();
