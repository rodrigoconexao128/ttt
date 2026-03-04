import fs from 'fs';
import path from 'path';
import os from 'os';

const configPath = path.join(os.homedir(), '.railway', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const token = config.user?.token;

async function check(name, serviceId) {
  const resp = await fetch('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query { deployments(first: 3, input: { serviceId: "${serviceId}", environmentId: "ae4fcb07-80c5-457b-a0e4-64faccecde44" }) { edges { node { id status createdAt } } } }`
    })
  });
  const data = await resp.json();
  for (const e of data.data.deployments.edges) {
    console.log(`${name}: ${e.node.id.substring(0,8)} ${e.node.status} ${e.node.createdAt}`);
  }
}

await check('WORKER', '5c181da5-0dd2-4883-8838-4e85604f2941');
console.log('---');
await check('PROXY', '8a3c5692-67d5-4886-a756-18c39f6b2afd');
