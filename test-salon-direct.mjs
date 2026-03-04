/**
 * Direct DB test via Supabase REST API
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bnfpcuzjvycudccycqqt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjM1MzM4OSwiZXhwIjoyMDc3OTI5Mzg5fQ.EIfKg_UwNVTtSiXa5L6eVYfl6_zlJU1m7EGP0jXa0us';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findUserId(email) {
  // Try profiles table first
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', email)
    .single();
  if (!error && data) return data.id;
  
  // Try users table
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', email)
    .single();
  if (!userError && userData) return userData.id;
  
  return null;
}

async function runTests() {
  console.log('=== SALON PERSISTENCE TEST ===\n');

  // 1. Find userId
  let userId = await findUserId('rodrigo4@gmail.com');
  
  if (!userId) {
    // Try by looking in salon_config
    const { data: configs } = await supabase.from('salon_config').select('user_id').limit(5);
    console.log('Sample user_ids in salon_config:', configs?.map(c => c.user_id));
    
    // Check auth.users
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers({ perPage: 50 });
    if (!authError) {
      const user = authData.users.find(u => u.email === 'rodrigo4@gmail.com');
      if (user) userId = user.id;
      console.log('Auth users found:', authData.users.length);
      console.log('Sample emails:', authData.users.slice(0, 5).map(u => u.email));
    }
  }
  
  if (!userId) {
    console.error('❌ Could not find user');
    return;
  }
  console.log('✅ userId:', userId);

  // 2. Get current salon config
  const { data: config, error: configError } = await supabase
    .from('salon_config')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (configError && configError.code !== 'PGRST116') {
    console.error('Config error:', configError);
    return;
  }
  
  console.log('\n[CURRENT CONFIG]');
  console.log('- id:', config?.id);
  console.log('- is_active:', config?.is_active);
  console.log('- slot_duration:', config?.slot_duration);
  console.log('- opening_hours.__break:', JSON.stringify(config?.opening_hours?.__break));
  console.log('- Full opening_hours keys:', Object.keys(config?.opening_hours || {}));

  // 3. Test saving break time
  console.log('\n[TEST 1] Setting break to enabled=true, 12:00-13:00...');
  const newOpeningHours = {
    ...(config?.opening_hours || {
      monday: { enabled: true, open: '09:00', close: '19:00' },
      tuesday: { enabled: true, open: '09:00', close: '19:00' },
    }),
    __break: { enabled: true, start: '12:00', end: '13:00' },
  };
  
  const updatePayload = {
    opening_hours: newOpeningHours,
    updated_at: new Date().toISOString(),
  };
  
  let saved1;
  if (config) {
    const { data, error } = await supabase
      .from('salon_config')
      .update(updatePayload)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) { console.error('Update error:', error); return; }
    saved1 = data;
  } else {
    const { data, error } = await supabase
      .from('salon_config')
      .insert({ ...updatePayload, user_id: userId, is_active: false, slot_duration: 30, buffer_between: 10, max_advance_days: 30 })
      .select()
      .single();
    if (error) { console.error('Insert error:', error); return; }
    saved1 = data;
  }
  
  console.log('- Saved __break:', JSON.stringify(saved1?.opening_hours?.__break));

  // 4. Verify read back
  const { data: config2 } = await supabase
    .from('salon_config')
    .select('opening_hours, is_active, slot_duration, min_notice_minutes')
    .eq('user_id', userId)
    .single();
  
  console.log('\n[READ BACK]');
  console.log('- __break:', JSON.stringify(config2?.opening_hours?.__break));
  console.log('- min_notice_minutes column exists:', config2?.min_notice_minutes !== undefined ? '✅' : '❌ missing');
  
  const test1Pass = config2?.opening_hours?.__break?.enabled === true;
  console.log('- Persistence test:', test1Pass ? '✅ PASS' : '❌ FAIL');

  // 5. Test slot_duration save
  console.log('\n[TEST 2] Saving slot_duration=45...');
  const { data: saved2, error: err2 } = await supabase
    .from('salon_config')
    .update({ slot_duration: 45, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('slot_duration, opening_hours')
    .single();
  
  if (err2) console.error('Error:', err2);
  else {
    console.log('- slot_duration saved:', saved2?.slot_duration);
    console.log('- __break still there:', JSON.stringify(saved2?.opening_hours?.__break));
    console.log('- slot_duration test:', saved2?.slot_duration === 45 ? '✅ PASS' : '❌ FAIL');
  }

  // 6. Check services
  const { data: services } = await supabase
    .from('scheduling_services')
    .select('id, name, duration_minutes, price')
    .eq('user_id', userId);
  
  console.log('\n[SERVICES]');
  console.log('- Count:', services?.length || 0);
  services?.forEach(s => console.log(`  • ${s.name}: ${s.duration_minutes}min`));

  // 7. Restore
  if (config) {
    await supabase.from('salon_config').update({
      opening_hours: config.opening_hours,
      is_active: config.is_active,
      slot_duration: config.slot_duration,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
    console.log('\n[CLEANUP] Restored original config ✅');
  }

  console.log('\n=== ALL TESTS DONE ===');
}

runTests().catch(console.error);
