const baseUrl = process.env.BASE_URL ?? 'https://agentezap.online';
const message =
  process.argv.slice(2).join(' ').trim() ||
  'Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.';

async function main() {
  // /api/agent/test usa isAuthenticated (Bearer token), não cookie de admin.
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Missing TEST_EMAIL/TEST_PASSWORD. Example:\n' +
        '  $env:TEST_EMAIL="you@example.com"; $env:TEST_PASSWORD="..."; node scripts/test-agent-prod.mjs\n'
    );
  }

  const loginData = { email, password };

  const signinRes = await fetch(`${baseUrl}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(loginData),
  });

  console.log('signin.status', signinRes.status);
  const signinRaw = await signinRes.text();
  if (!signinRes.ok) {
    throw new Error(`Signin failed: ${signinRaw}`);
  }

  const signinJson = JSON.parse(signinRaw);
  const accessToken = signinJson?.session?.access_token;
  if (!accessToken) {
    throw new Error(`No session.access_token in signin response: ${signinRaw}`);
  }

  const testRes = await fetch(`${baseUrl}/api/agent/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message }),
  });

  console.log('test.status', testRes.status);
  const raw = await testRes.text();

  try {
    const json = JSON.parse(raw);
    console.log('test.json', JSON.stringify(json));
  } catch {
    console.log('test.raw', raw);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
