/**
 * Production test using Supabase auth token (Bearer auth)
 */

const BASE_URL = 'https://agentezap.online';
const SUPABASE_URL = 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTMzODksImV4cCI6MjA3NzkyOTM4OX0.AVDgFqn1h-00a5CzS2SZYlcXl4TxtKVrdjKDkN08kVM';

async function loginSupabase() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email: 'rodrigo4@gmail.com', password: 'Ibira2019!' }),
  });
  const data = await res.json();
  console.log('[SUPABASE LOGIN] status:', res.status);
  if (data.access_token) {
    console.log('[SUPABASE LOGIN] Got access_token ✅');
    return data.access_token;
  }
  console.error('[SUPABASE LOGIN] Error:', data.error || data.message);
  return null;
}

async function loginApp(token) {
  // Use Supabase token to login to app
  const res = await fetch(`${BASE_URL}/api/auth/supabase-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  const cookie = res.headers.get('set-cookie');
  const data = await res.json().catch(() => ({}));
  console.log('[APP LOGIN] status:', res.status, 'cookie:', !!cookie);
  return cookie;
}

async function apiGet(cookie, path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 
      'Cookie': cookie,
      'Accept': 'application/json',
    },
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text.substring(0, 200) };
  }
}

async function apiPut(cookie, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json',
      'Cookie': cookie,
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text.substring(0, 200) };
  }
}

async function runTests() {
  console.log('=== PRODUCTION API TESTS ===\n');

  // 1. Get Supabase token
  const sbToken = await loginSupabase();
  if (!sbToken) return;

  // 2. Try to login to the app using the token in a session
  // The app uses Supabase sessions - let's try the session approach
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: sbToken }),
  });
  console.log('[APP LOGIN attempt 1] status:', res.status);
  
  // Try direct session
  const res2 = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: {
      'Authorization': `Bearer ${sbToken}`,
      'Accept': 'application/json',
    },
  });
  console.log('[SESSION via Bearer] status:', res2.status);
  const sessData = await res2.json().catch(() => ({}));
  console.log('[SESSION data]:', JSON.stringify(sessData).substring(0, 200));

  // 3. Try the salon config with Bearer auth
  const configRes = await fetch(`${BASE_URL}/api/salon/config`, {
    headers: {
      'Authorization': `Bearer ${sbToken}`,
      'Accept': 'application/json',
    },
  });
  console.log('[CONFIG via Bearer] status:', configRes.status);
  const configText = await configRes.text();
  try {
    const configData = JSON.parse(configText);
    console.log('[CONFIG] is_active:', configData?.is_active);
    console.log('[CONFIG] __break:', JSON.stringify(configData?.opening_hours?.__break));
  } catch {
    console.log('[CONFIG] Non-JSON response:', configText.substring(0, 200));
  }

  console.log('\n=== DONE ===');
}

runTests().catch(console.error);
