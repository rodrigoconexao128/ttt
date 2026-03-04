import fs from 'fs';
import path from 'path';

const cfg = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, '.railway', 'config.json'), 'utf8'));
const token = cfg.user.token;

async function checkDeploy(serviceId, name) {
  const r = await fetch('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query { deployments(first:1, input:{serviceId:"${serviceId}", environmentId:"ae4fcb07-80c5-457b-a0e4-64faccecde44"}) { edges { node { id status } } } }`
    })
  });
  const d = await r.json();
  const status = d.data?.deployments?.edges?.[0]?.node?.status || 'UNKNOWN';
  console.log(`${name}: ${status}`);
  return status;
}

const [proxy, worker] = await Promise.all([
  checkDeploy('8a3c5692-67d5-4886-a756-18c39f6b2afd', 'PROXY'),
  checkDeploy('5c181da5-0dd2-4883-8838-4e85604f2941', 'WORKER'),
]);

if (proxy === 'SUCCESS' && worker === 'SUCCESS') {
  console.log('\n✅ Both services deployed successfully!');
} else {
  console.log('\n⏳ Waiting for deploys to finish...');
}
