#!/usr/bin/env node
/**
 * deploy-worker.mjs — Deploy do Worker (vvvv) via Railway API
 * 
 * Uso: node deploy-worker.mjs
 * 
 * O que faz:
 * 1. Cria trigger temporário no worker
 * 2. Faz git push origin main
 * 3. Monitora o deploy até completar
 * 4. Deleta o trigger (worker volta a não auto-deploiar)
 * 
 * Pré-requisitos:
 * - Railway CLI logado (railway login) ou token no config
 * - Git configurado com remote origin
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

// ===== CONFIGURAÇÃO =====
const PROJECT_ID = 'ad92eb6d-31d4-45b2-9b78-56898787e384';
const WORKER_SERVICE_ID = '5c181da5-0dd2-4883-8838-4e85604f2941';
const ENVIRONMENT_ID = 'ae4fcb07-80c5-457b-a0e4-64faccecde44';
const REPO = 'heroncosmo/vvvv';
const BRANCH = 'main';
const API_URL = 'https://backboard.railway.app/graphql/v2';

// ===== FUNÇÕES AUXILIARES =====
function getToken() {
  // Tenta RAILWAY_TOKEN do ambiente primeiro
  if (process.env.RAILWAY_TOKEN) return process.env.RAILWAY_TOKEN;
  
  // Tenta ler do config do Railway CLI
  const configPath = path.join(homedir(), '.railway', 'config.json');
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (config?.user?.token) return config.user.token;
  }
  
  throw new Error('Token não encontrado. Faça "railway login" primeiro ou defina RAILWAY_TOKEN.');
}

async function graphql(token, query, variables = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL: ${json.errors.map(e => e.message).join(', ')}`);
  return json.data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== MAIN =====
async function main() {
  console.log('🚀 Deploy Worker (vvvv) iniciando...\n');
  
  const token = getToken();
  let triggerId = null;
  
  try {
    // 1. Verificar deploy triggers existentes
    console.log('1️⃣  Verificando triggers existentes...');
    const triggers = await graphql(token, `
      query { deploymentTriggers(projectId: "${PROJECT_ID}", environmentId: "${ENVIRONMENT_ID}", serviceId: "${WORKER_SERVICE_ID}") { edges { node { id } } } }
    `);
    
    const existingTriggers = triggers.deploymentTriggers.edges || [];
    if (existingTriggers.length > 0) {
      console.log('   ⚠️  Worker já tem trigger ativo — usando existente');
      triggerId = existingTriggers[0].node.id;
    } else {
      // 2. Criar trigger temporário
      console.log('2️⃣  Criando trigger temporário...');
      const result = await graphql(token, `
        mutation { deploymentTriggerCreate(input: {
          projectId: "${PROJECT_ID}"
          serviceId: "${WORKER_SERVICE_ID}"
          environmentId: "${ENVIRONMENT_ID}"
          provider: "github"
          repository: "${REPO}"
          branch: "${BRANCH}"
        }) { id } }
      `);
      triggerId = result.deploymentTriggerCreate.id;
      console.log(`   ✅ Trigger criado: ${triggerId}`);
    }
    
    // 3. Git push
    console.log('3️⃣  Fazendo git push...');
    try {
      const pushOutput = execSync('git push origin main 2>&1', { encoding: 'utf-8', cwd: process.cwd() });
      if (pushOutput.includes('Everything up-to-date')) {
        console.log('   ℹ️  Código já está atualizado. Fazendo commit vazio para triggerar deploy...');
        execSync('git commit --allow-empty -m "deploy: trigger worker redeploy"', { encoding: 'utf-8' });
        execSync('git push origin main 2>&1', { encoding: 'utf-8' });
      }
      console.log('   ✅ Push concluído');
    } catch (e) {
      // Git push writes to stderr normally
      if (e.stdout?.includes('Everything up-to-date') || e.stderr?.includes('Everything up-to-date')) {
        console.log('   ℹ️  Código já está atualizado. Fazendo commit vazio...');
        execSync('git commit --allow-empty -m "deploy: trigger worker redeploy"', { encoding: 'utf-8' });
        try { execSync('git push origin main 2>&1', { encoding: 'utf-8' }); } catch {}
      }
      console.log('   ✅ Push concluído');
    }
    
    // 4. Esperar deploy iniciar
    console.log('4️⃣  Aguardando deploy iniciar...');
    await sleep(10000);
    
    // 5. Monitorar deploy
    console.log('5️⃣  Monitorando deploy...');
    let attempts = 0;
    const maxAttempts = 60; // 5 minutos max
    
    while (attempts < maxAttempts) {
      const data = await graphql(token, `
        query { deployments(input: { serviceId: "${WORKER_SERVICE_ID}", environmentId: "${ENVIRONMENT_ID}" }, first: 1) {
          edges { node { id status createdAt } }
        } }
      `);
      
      const latest = data.deployments.edges[0]?.node;
      if (!latest) { await sleep(5000); attempts++; continue; }
      
      const status = latest.status;
      process.stdout.write(`\r   ⏳ Status: ${status} (${attempts * 5}s)    `);
      
      if (status === 'SUCCESS') {
        console.log(`\n   ✅ Deploy concluído com SUCESSO! (${latest.id})`);
        break;
      } else if (status === 'FAILED' || status === 'CRASHED') {
        console.log(`\n   ❌ Deploy FALHOU! Status: ${status}`);
        console.log(`   ID: ${latest.id}`);
        console.log('   Verifique os logs no Railway Dashboard');
        break;
      }
      
      await sleep(5000);
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      console.log('\n   ⚠️  Timeout — deploy ainda em andamento. Verifique no Dashboard.');
    }
    
  } finally {
    // 6. Deletar trigger (SEMPRE, mesmo se falhar)
    if (triggerId) {
      console.log('6️⃣  Removendo trigger temporário...');
      try {
        await graphql(token, `mutation { deploymentTriggerDelete(id: "${triggerId}") }`);
        console.log('   ✅ Trigger removido — Worker não vai auto-deploiar');
      } catch (e) {
        console.log(`   ⚠️  Erro ao remover trigger: ${e.message}`);
        console.log(`   ID do trigger para remover manualmente: ${triggerId}`);
      }
    }
  }
  
  console.log('\n✨ Processo concluído!');
  console.log('   Proxy: deploya automaticamente via git push');
  console.log('   Worker: use este script (node deploy-worker.mjs)');
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
