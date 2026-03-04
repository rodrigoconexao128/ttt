/**
 * Debug admin auth and simulator
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
  console.log(`Auth for ${email}: status=${res.status}, keys=${Object.keys(data).join(',')}`);
  if (!data.access_token && data.error) {
    console.log(`Error: ${data.error}: ${data.error_description}`);
  }
  return data.access_token;
}

async function run() {
  // Test admin login
  const adminToken = await getToken('rodrigoconexao128@gmail.com', 'Ibira2019!');
  console.log('Admin token:', adminToken ? '✅ got token' : '❌ no token');
  
  // Test client simulator
  const clientToken = await getToken('rodrigo4@gmail.com', 'Ibira2019!');
  
  if (clientToken) {
    const res = await fetch(`${BASE_URL}/api/agent/test`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${clientToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ message: 'Oi, quero um corte amanhã', history: [] }),
    });
    console.log('\nSimulator status:', res.status);
    const text = await res.text();
    console.log('Simulator raw response (500 chars):', text.substring(0, 500));
    try {
      const data = JSON.parse(text);
      console.log('Response keys:', Object.keys(data));
      if (data.response) console.log('response:', data.response.substring(0, 200));
      if (data.message) console.log('message:', data.message.substring(0, 200));
      if (data.text) console.log('text:', data.text.substring(0, 200));
      if (data.limitReached) console.log('LIMIT REACHED:', data.message);
    } catch (e) {
      console.log('Not JSON');
    }
  }
}

run().catch(console.error);
