import fs from 'fs';
import path from 'path';
import os from 'os';

const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.railway', 'config.json'), 'utf8'));
const token = cfg?.user?.token;
const serviceId = '8a3c5692-67d5-4886-a756-18c39f6b2afd'; // PROXY service
const envId = 'ae4fcb07-80c5-457b-a0e4-64faccecde44';

async function getLogs() {
  const query = `query { deployments(first: 1, input: { serviceId: "${serviceId}", environmentId: "${envId}" }) { edges { node { id status } } } }`;
  const r = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const d = await r.json();
  const deployId = d.data.deployments.edges[0].node.id;
  console.log('Latest deploy:', deployId, d.data.deployments.edges[0].node.status);
  
  const logQuery = `query { deploymentLogs(deploymentId: "${deployId}", limit: 200) { message timestamp severity } }`;
  const lr = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: logQuery })
  });
  const ld = await lr.json();
  if (ld.data?.deploymentLogs) {
    const relevant = ld.data.deploymentLogs.filter(l => 
      /qr|error|fail|disconnect|connect.*whatsapp|socket.*close|reconn|start.*connection|pairing/i.test(l.message || '')
    );
    console.log(`\n=== ${relevant.length} relevant logs (of ${ld.data.deploymentLogs.length} total) ===\n`);
    relevant.slice(-60).forEach(l => {
      const ts = l.timestamp ? l.timestamp.substring(11, 19) : '';
      console.log(`${ts} [${l.severity}] ${(l.message || '').substring(0, 300)}`);
    });
    
    // Also show last 30 logs for context
    console.log('\n=== Last 30 logs ===\n');
    ld.data.deploymentLogs.slice(-30).forEach(l => {
      const ts = l.timestamp ? l.timestamp.substring(11, 19) : '';
      console.log(`${ts} [${l.severity}] ${(l.message || '').substring(0, 300)}`);
    });
  } else {
    console.log('Error:', JSON.stringify(ld).substring(0, 500));
  }
}
getLogs().catch(console.error);
