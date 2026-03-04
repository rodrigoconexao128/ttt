import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

const configPath = path.join(homedir(), '.railway', 'config.json');
const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const token = config.user.token;

const API_URL = 'https://backboard.railway.app/graphql/v2';
const PROJECT_ID = 'ad92eb6d-31d4-45b2-9b78-56898787e384';
const WORKER_ID = '5c181da5-0dd2-4883-8838-4e85604f2941';
const PROXY_ID = '8a3c5692-67d5-4886-a756-18c39f6b2afd';
const ENV_ID = 'ae4fcb07-80c5-457b-a0e4-64faccecde44';

async function gql(q) {
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q })
  });
  return r.json();
}

async function main() {
  // Get latest deployments
  const workerDeploys = await gql(`{
    deployments(input: {serviceId: "${WORKER_ID}", environmentId: "${ENV_ID}"}, first: 3) {
      edges { node { id status createdAt } }
    }
  }`);
  console.log('=== WORKER DEPLOYMENTS ===');
  console.log(JSON.stringify(workerDeploys.data?.deployments?.edges?.map(e => e.node), null, 2));

  const proxyDeploys = await gql(`{
    deployments(input: {serviceId: "${PROXY_ID}", environmentId: "${ENV_ID}"}, first: 3) {
      edges { node { id status createdAt } }
    }
  }`);
  console.log('\n=== PROXY DEPLOYMENTS ===');
  console.log(JSON.stringify(proxyDeploys.data?.deployments?.edges?.map(e => e.node), null, 2));

  // Get service info
  const workerService = await gql(`{ service(id: "${WORKER_ID}") { name } }`);
  console.log('\n=== WORKER SERVICE ===');
  console.log(JSON.stringify(workerService.data, null, 2));

  const proxyService = await gql(`{ service(id: "${PROXY_ID}") { name } }`);
  console.log('\n=== PROXY SERVICE ===');
  console.log(JSON.stringify(proxyService.data, null, 2));

  // Get environment variables that affect performance
  const workerVars = await gql(`{
    variables(projectId: "${PROJECT_ID}", serviceId: "${WORKER_ID}", environmentId: "${ENV_ID}")
  }`);
  const vars = workerVars.data?.variables || {};
  const perfVars = {};
  for (const [k, v] of Object.entries(vars)) {
    if (/NODE|MEMORY|CPU|LIMIT|TIMEOUT|WORKER|CONCUR|POOL|CACHE|PORT|SERVICE_MODE/i.test(k)) {
      perfVars[k] = v;
    }
  }
  console.log('\n=== WORKER PERF VARS ===');
  console.log(JSON.stringify(perfVars, null, 2));

  // Get recent Worker deploy logs (last deployment)
  const latestDeployId = workerDeploys.data?.deployments?.edges?.[0]?.node?.id;
  if (latestDeployId) {
    const logs = await gql(`{
      deploymentLogs(deploymentId: "${latestDeployId}", limit: 50) {
        message timestamp severity
      }
    }`);
    console.log('\n=== WORKER RECENT LOGS (last 50) ===');
    const logEntries = logs.data?.deploymentLogs || [];
    logEntries.forEach(l => {
      // Filter for performance-related entries
      if (/slow|timeout|error|memory|heap|cpu|latency|ms\)|warning|🐌|reconnect/i.test(l.message)) {
        console.log(`[${l.severity}] ${l.message.substring(0, 200)}`);
      }
    });
    console.log(`(${logEntries.length} total log entries, showing perf-related only)`);
  }

  // Check Proxy variables too
  const proxyVars = await gql(`{
    variables(projectId: "${PROJECT_ID}", serviceId: "${PROXY_ID}", environmentId: "${ENV_ID}")
  }`);
  const pVars = proxyVars.data?.variables || {};
  const proxyPerfVars = {};
  for (const [k, v] of Object.entries(pVars)) {
    if (/NODE|MEMORY|CPU|LIMIT|TIMEOUT|WORKER|CONCUR|POOL|CACHE|PORT|SERVICE_MODE|WA_WORKER/i.test(k)) {
      proxyPerfVars[k] = v;
    }
  }
  console.log('\n=== PROXY PERF VARS ===');
  console.log(JSON.stringify(proxyPerfVars, null, 2));

  // Check latest usage/metrics if available
  try {
    const metrics = await gql(`{
      metrics(projectId: "${PROJECT_ID}", serviceId: "${WORKER_ID}", environmentId: "${ENV_ID}", 
        startDate: "${new Date(Date.now() - 3600000).toISOString()}", 
        endDate: "${new Date().toISOString()}",
        measurementType: CPU_USAGE
      ) {
        values { date value }
      }
    }`);
    console.log('\n=== WORKER CPU METRICS (last 1h) ===');
    console.log(JSON.stringify(metrics.data?.metrics?.values?.slice(-5), null, 2));
  } catch(e) {
    console.log('\n=== METRICS: Not available via API ===');
  }
}

main().catch(e => console.error(e));
