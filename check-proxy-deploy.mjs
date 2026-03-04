import fs from 'fs';
import path from 'path';
import os from 'os';

const configPath = path.join(os.homedir(), '.railway', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const token = config.user?.token;

const resp = await fetch('https://backboard.railway.app/graphql/v2', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `query { deployments(first: 2, input: { serviceId: "5c181da5-0dd2-4883-8838-4e85604f2941", environmentId: "ae4fcb07-80c5-457b-a0e4-64faccecde44" }) { edges { node { id status createdAt } } } }`
  })
});
const data = await resp.json();
data.data.deployments.edges.forEach(e => console.log('WORKER:', e.node.id.slice(0, 8), e.node.status, e.node.createdAt));

// Also check Proxy
const resp2 = await fetch('https://backboard.railway.app/graphql/v2', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `query { deployments(first: 2, input: { serviceId: "8a3c5692-67d5-4886-a756-18c39f6b2afd", environmentId: "ae4fcb07-80c5-457b-a0e4-64faccecde44" }) { edges { node { id status createdAt } } } }`
  })
});
const data2 = await resp2.json();
data2.data.deployments.edges.forEach(e => console.log('PROXY:', e.node.id.slice(0, 8), e.node.status, e.node.createdAt));
