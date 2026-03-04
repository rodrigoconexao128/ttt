/**
 * Test isCurrentlyInBreak and isSalonOpen functions
 * Simulates what happens in the AI service during simulator testing
 */

function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function isCurrentlyInBreak(openingHours) {
  const breakConfig = openingHours?.['__break'];
  if (!breakConfig || !breakConfig.enabled) {
    return { isDuringBreak: false, message: '', breakStart: '12:00', breakEnd: '13:00' };
  }

  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentHour = brazilTime.getHours();
  const currentMinute = brazilTime.getMinutes();
  const currentMinutes = currentHour * 60 + currentMinute;

  const [bStartH, bStartM] = breakConfig.start.split(':').map(Number);
  const [bEndH, bEndM] = breakConfig.end.split(':').map(Number);
  const breakStartMin = bStartH * 60 + bStartM;
  const breakEndMin = bEndH * 60 + bEndM;

  const isDuringBreak = currentMinutes >= breakStartMin && currentMinutes < breakEndMin;
  const message = isDuringBreak
    ? `Estamos no horário de almoço (${breakConfig.start} às ${breakConfig.end}). Voltamos em breve! 🍽️`
    : '';

  return { isDuringBreak, message, breakStart: breakConfig.start, breakEnd: breakConfig.end };
}

function isSalonOpen(openingHours) {
  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDay = dayNames[brazilTime.getDay()];
  const currentHour = brazilTime.getHours().toString().padStart(2, '0');
  const currentMinute = brazilTime.getMinutes().toString().padStart(2, '0');
  const currentTime = `${currentHour}:${currentMinute}`;

  if (!openingHours || Object.keys(openingHours).length === 0) {
    return { isOpen: true, isDuringBreak: false, currentDay, currentTime, message: '' };
  }
  const todayHours = openingHours[currentDay];
  if (!todayHours || !todayHours.enabled) {
    return { isOpen: false, isDuringBreak: false, currentDay, currentTime, message: `Estamos fechados hoje.` };
  }
  const openTime = todayHours.open || '09:00';
  const closeTime = todayHours.close || '19:00';
  const currentMinutes = parseInt(currentHour) * 60 + parseInt(currentMinute);
  const openMinutes = parseInt(openTime.split(':')[0]) * 60 + parseInt(openTime.split(':')[1] || '0');
  const closeMinutes = parseInt(closeTime.split(':')[0]) * 60 + parseInt(closeTime.split(':')[1] || '0');
  const isOpenHours = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  if (!isOpenHours) {
    return { isOpen: false, isDuringBreak: false, currentDay, currentTime, message: `Nosso horário hoje é das ${openTime} às ${closeTime}.` };
  }
  const breakStatus = isCurrentlyInBreak(openingHours);
  if (breakStatus.isDuringBreak) {
    return { isOpen: false, isDuringBreak: true, currentDay, currentTime, message: breakStatus.message };
  }
  return { isOpen: true, isDuringBreak: false, currentDay, currentTime, message: '' };
}

const openingHours = {
  monday: { enabled: true, open: '09:00', close: '19:00' },
  tuesday: { enabled: true, open: '09:00', close: '19:00' },
  wednesday: { enabled: true, open: '09:00', close: '19:00' },
  thursday: { enabled: true, open: '09:00', close: '19:00' },
  friday: { enabled: true, open: '09:00', close: '19:00' },
  saturday: { enabled: true, open: '09:00', close: '17:00' },
  sunday: { enabled: false, open: '09:00', close: '17:00' },
  __break: { enabled: true, start: '12:00', end: '13:00' },
};

const brazilNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
const currentH = brazilNow.getHours();
const currentM = brazilNow.getMinutes();
const currentTimeStr = `${currentH.toString().padStart(2,'0')}:${currentM.toString().padStart(2,'0')}`;

console.log('=== BREAK TIME & OPEN STATUS TEST ===\n');
console.log(`Current Brazil time: ${currentTimeStr}`);

// Test 1: Current time
const breakResult = isCurrentlyInBreak(openingHours);
const openResult = isSalonOpen(openingHours);
console.log('\n[CURRENT STATE]');
console.log('isCurrentlyInBreak:', JSON.stringify(breakResult));
console.log('isSalonOpen:', JSON.stringify(openResult));

// Test 2: Simulate various times
const testTimes = [
  { h: 8, m: 0, desc: '08:00 (before open)' },
  { h: 9, m: 0, desc: '09:00 (opening)' },
  { h: 11, m: 30, desc: '11:30 (before lunch)' },
  { h: 12, m: 0, desc: '12:00 (start of lunch)' },
  { h: 12, m: 30, desc: '12:30 (during lunch)' },
  { h: 13, m: 0, desc: '13:00 (lunch end)' },
  { h: 14, m: 0, desc: '14:00 (afternoon)' },
  { h: 19, m: 0, desc: '19:00 (closing)' },
];

console.log('\n[SIMULATED TIMES - Friday]');

function mockBreakCheck(openingHours, testH, testM) {
  const breakConfig = openingHours?.['__break'];
  if (!breakConfig || !breakConfig.enabled) return { isDuringBreak: false };
  
  const currentMinutes = testH * 60 + testM;
  const [bStartH, bStartM] = breakConfig.start.split(':').map(Number);
  const [bEndH, bEndM] = breakConfig.end.split(':').map(Number);
  const breakStartMin = bStartH * 60 + bStartM;
  const breakEndMin = bEndH * 60 + bEndM;
  
  return { isDuringBreak: currentMinutes >= breakStartMin && currentMinutes < breakEndMin };
}

function mockOpenCheck(openingHours, testH, testM, dayName = 'friday') {
  const todayHours = openingHours[dayName];
  if (!todayHours || !todayHours.enabled) return { isOpen: false, reason: 'closed day' };
  
  const currentMinutes = testH * 60 + testM;
  const openMin = timeToMinutes(todayHours.open);
  const closeMin = timeToMinutes(todayHours.close);
  
  if (currentMinutes < openMin || currentMinutes >= closeMin) {
    return { isOpen: false, reason: 'outside hours' };
  }
  
  const breakStatus = mockBreakCheck(openingHours, testH, testM);
  if (breakStatus.isDuringBreak) {
    return { isOpen: false, reason: 'lunch break' };
  }
  
  return { isOpen: true, reason: 'open' };
}

for (const { h, m, desc } of testTimes) {
  const openStatus = mockOpenCheck(openingHours, h, m);
  const breakStatus = mockBreakCheck(openingHours, h, m);
  
  const expected = {
    '08:00': { isOpen: false, isDuringBreak: false },
    '09:00': { isOpen: true, isDuringBreak: false },
    '11:30': { isOpen: true, isDuringBreak: false },
    '12:00': { isOpen: false, isDuringBreak: true },
    '12:30': { isOpen: false, isDuringBreak: true },
    '13:00': { isOpen: true, isDuringBreak: false },
    '14:00': { isOpen: true, isDuringBreak: false },
    '19:00': { isOpen: false, isDuringBreak: false },
  };
  
  const timeKey = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
  const exp = expected[timeKey];
  const openOk = exp ? openStatus.isOpen === exp.isOpen : '?';
  const breakOk = exp ? breakStatus.isDuringBreak === exp.isDuringBreak : '?';
  
  console.log(`${timeKey} (${desc}):`);
  console.log(`  isOpen=${openStatus.isOpen} [${openStatus.reason}] ${openOk === true ? '✅' : openOk === false ? '❌' : '?'}`);
  console.log(`  isDuringBreak=${breakStatus.isDuringBreak} ${breakOk === true ? '✅' : breakOk === false ? '❌' : '?'}`);
}

console.log('\n=== TEST COMPLETE ===');
