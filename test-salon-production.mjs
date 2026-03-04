/**
 * Production API test for salon
 */

const BASE_URL = 'https://agentezap.online';

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'rodrigo4@gmail.com', password: 'Ibira2019!' }),
  });
  const setCookie = res.headers.get('set-cookie');
  const data = await res.json();
  console.log('[LOGIN] status:', res.status);
  if (data.user) console.log('[LOGIN] user:', data.user.email);
  else console.log('[LOGIN] error:', data.message);
  return { cookie: setCookie, user: data.user };
}

async function getSalonConfig(cookie) {
  const res = await fetch(`${BASE_URL}/api/salon/config`, {
    headers: { 'Cookie': cookie },
  });
  console.log('[SALON CONFIG] status:', res.status);
  return await res.json();
}

async function putSalonConfig(cookie, body) {
  const res = await fetch(`${BASE_URL}/api/salon/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
    body: JSON.stringify(body),
  });
  console.log('[SALON CONFIG PUT] status:', res.status);
  return await res.json();
}

async function getAvailableSlots(cookie, date, serviceDuration = 30) {
  const res = await fetch(`${BASE_URL}/api/salon/available-slots?date=${date}&serviceDuration=${serviceDuration}`, {
    headers: { 'Cookie': cookie },
  });
  console.log('[SLOTS] status:', res.status, 'for date:', date);
  return await res.json();
}

async function runTests() {
  console.log('=== PRODUCTION API TESTS ===\n');

  // 1. Login
  const { cookie, user } = await login();
  if (!cookie || !user) {
    console.error('Login failed, aborting');
    return;
  }
  console.log('Session obtained ✅\n');

  // 2. Get salon config
  const config = await getSalonConfig(cookie);
  console.log('[CONFIG] is_active:', config?.is_active);
  console.log('[CONFIG] __break:', JSON.stringify(config?.opening_hours?.__break));
  console.log('[CONFIG] slot_duration:', config?.slot_duration);
  console.log();

  // 3. Test persistence: save with break enabled
  const testBreak = { enabled: true, start: '12:00', end: '13:00' };
  const newHours = {
    ...(config?.opening_hours || {}),
    __break: testBreak,
  };
  
  console.log('[TEST 1] Saving break = enabled...');
  const saved1 = await putSalonConfig(cookie, { opening_hours: newHours });
  console.log('[SAVED] __break:', JSON.stringify(saved1?.opening_hours?.__break));
  
  const config2 = await getSalonConfig(cookie);
  const pass1 = config2?.opening_hours?.__break?.enabled === true;
  console.log('[VERIFY] Persistence:', pass1 ? '✅ PASS' : '❌ FAIL');
  console.log();

  // 4. Test break disabled
  console.log('[TEST 2] Disabling break...');
  const disabledHours = { ...(config2?.opening_hours || {}), __break: { enabled: false, start: '12:00', end: '13:00' } };
  const saved2 = await putSalonConfig(cookie, { opening_hours: disabledHours });
  console.log('[SAVED] __break.enabled:', saved2?.opening_hours?.__break?.enabled);
  
  const config3 = await getSalonConfig(cookie);
  const pass2 = config3?.opening_hours?.__break?.enabled === false;
  console.log('[VERIFY] Disable persistence:', pass2 ? '✅ PASS' : '❌ FAIL');
  console.log();

  // 5. Test slot availability
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  
  // Re-enable break for slot test
  const reenabledHours = { ...(config3?.opening_hours || {}), __break: { enabled: true, start: '12:00', end: '13:00' } };
  await putSalonConfig(cookie, { opening_hours: reenabledHours });
  
  console.log('[TEST 3] Checking slot availability with break enabled...');
  const slots = await getAvailableSlots(cookie, tomorrow, 30);
  
  if (Array.isArray(slots)) {
    const breakSlots = slots.filter(s => {
      const [h, m] = s.split(':').map(Number);
      const mins = h * 60 + m;
      return mins >= 12 * 60 && mins < 13 * 60;
    });
    console.log('[SLOTS] Total:', slots.length);
    console.log('[SLOTS] During break (12:00-13:00):', breakSlots);
    console.log('[TEST 3]', breakSlots.length === 0 ? '✅ PASS - No slots during break' : '❌ FAIL - Slots during break!');
  } else {
    console.log('[SLOTS] Unexpected response:', JSON.stringify(slots).substring(0, 200));
  }
  console.log();

  // Cleanup: Restore original
  if (config?.opening_hours) {
    await putSalonConfig(cookie, { opening_hours: config.opening_hours, is_active: config.is_active });
    console.log('[CLEANUP] Restored original config ✅');
  }

  console.log('\n=== PRODUCTION TESTS COMPLETE ===');
}

runTests().catch(console.error);
