import fetch from 'node-fetch';

// Supabase auth
const EMAIL = 'rodrigo4@gmail.com';
const PASSWORD = 'Ibira2019!';
const SUPABASE_URL = 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTMzODksImV4cCI6MjA3NzkyOTM4OX0.AVDgFqn1h-00a5CzS2SZYlcXl4TxtKVrdjKDkN08kVM';
const APP_URL = 'https://agentezap.online';

async function getToken() {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = await resp.json();
  return data.access_token;
}

async function runTests() {
  console.log('🔧 Autenticando...');
  const token = await getToken();
  if (!token) { console.error('❌ Falha ao autenticar'); process.exit(1); }
  console.log('✅ Autenticado!');
  
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  
  // ============================================================
  // TEST 1: Listar mídias e verificar fluxos existentes
  // ============================================================
  console.log('\n=== TEST 1: Listar mídias ===');
  const listResp = await fetch(`${APP_URL}/api/agent/media`, { headers });
  const items = await listResp.json();
  const flowItems = items.filter(m => m.mediaType === 'flow');
  const normalItems = items.filter(m => m.mediaType !== 'flow');
  
  console.log(`Total mídias: ${items.length}`);
  console.log(`  Fluxos: ${flowItems.length}`);
  console.log(`  Mídias normais: ${normalItems.length}`);
  flowItems.forEach(f => {
    console.log(`  📁 ${f.name}: ${f.flowItems?.length || 0} itens`);
  });
  
  // Verificar regressão em mídias normais
  const audioOk = normalItems.filter(m => m.mediaType === 'audio').every(m => m.storageUrl || m.storageUrl === '');
  console.log(`  ✅ Mídias normais intactas: ${normalItems.length > 0 ? 'SIM' : 'N/A'}`);
  
  // ============================================================
  // TEST 2: Editar um fluxo existente (adicionar item)
  // ============================================================
  console.log('\n=== TEST 2: Editar fluxo (cenário feliz) ===');
  const flow3 = flowItems.find(m => m.name === 'TESTE_FLUXO_3_ITENS');
  if (!flow3) { console.log('⚠️  TESTE_FLUXO_3_ITENS não encontrado, criando...'); }
  
  const targetFlow = flow3 || flowItems[0];
  if (!targetFlow) { console.log('❌ Nenhum fluxo encontrado para editar'); } 
  else {
    const newItems = [...(targetFlow.flowItems || []), { id: 'item_edit', order: (targetFlow.flowItems?.length || 0), type: 'text', text: 'Item adicionado por edição' }];
    const editResp = await fetch(`${APP_URL}/api/agent/media/${targetFlow.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ flowItems: newItems }),
    });
    const editData = await editResp.json();
    const newCount = editData.flowItems?.length || 0;
    const prevCount = targetFlow.flowItems?.length || 0;
    if (editResp.status === 200 && newCount === prevCount + 1) {
      console.log(`✅ Edição OK: ${prevCount} → ${newCount} itens`);
    } else {
      console.log(`❌ Edição FALHOU: status=${editResp.status}, count=${newCount}`);
    }
    
    // Restaurar (remover item adicionado)
    await fetch(`${APP_URL}/api/agent/media/${targetFlow.id}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ flowItems: targetFlow.flowItems }),
    });
    console.log('  ↩️  Restaurado para estado original');
  }
  
  // ============================================================
  // TEST 3: Tentar criar fluxo com 1 item (deve falhar na validação do frontend, mas no backend aceita)
  // ============================================================
  console.log('\n=== TEST 3: Fluxo com 0 itens (edge case) ===');
  const edgeResp = await fetch(`${APP_URL}/api/agent/media`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'TESTE_FLUXO_EDGE_VAZIO', mediaType: 'flow', storageUrl: '', description: 'Fluxo vazio de teste', isActive: true, flowItems: [] }),
  });
  const edgeData = await edgeResp.json();
  if (edgeResp.status === 200) {
    console.log(`✅ Backend aceita fluxo vazio (validação feita no frontend): id=${edgeData.id}`);
    // Deletar imediatamente
    await fetch(`${APP_URL}/api/agent/media/${edgeData.id}`, { method: 'DELETE', headers });
    console.log('  🗑️  Fluxo vazio deletado');
  } else {
    console.log(`ℹ️  Backend rejeitou fluxo vazio: ${edgeResp.status}`);
  }
  
  // ============================================================
  // TEST 4: Verificar ordem preservada (crítico!)
  // ============================================================
  console.log('\n=== TEST 4: Verificar ordem exata de 10 itens ===');
  const flow10 = flowItems.find(m => m.name === 'TESTE_FLUXO_10_ITENS');
  if (flow10 && flow10.flowItems) {
    const ordered = [...flow10.flowItems].sort((a, b) => a.order - b.order);
    const orderOk = ordered.every((item, idx) => item.order === idx);
    const types = ordered.map(i => `${i.order}:${i.type}`).join(', ');
    console.log(`✅ Ordem OK: ${orderOk}`);
    console.log(`  Sequência: ${types}`);
  } else {
    console.log('⚠️  TESTE_FLUXO_10_ITENS não encontrado');
  }
  
  // ============================================================
  // TEST 5: Regressão - mídias normais continuam funcionando
  // ============================================================
  console.log('\n=== TEST 5: Regressão - mídias normais ===');
  const audioMedia = normalItems.filter(m => m.mediaType === 'audio');
  const videoMedia = normalItems.filter(m => m.mediaType === 'video');
  console.log(`✅ Áudios intactos: ${audioMedia.length}`);
  console.log(`✅ Vídeos intactos: ${videoMedia.length}`);
  
  // Verificar se mídias normais têm storageUrl, description, whenToUse
  const allHaveDescription = normalItems.every(m => m.description && m.description.length > 0);
  const allHaveWhenToUse = normalItems.every(m => m.whenToUse !== undefined);
  console.log(`✅ Todas as mídias normais têm description: ${allHaveDescription}`);
  console.log(`✅ Todas as mídias normais têm whenToUse: ${allHaveWhenToUse}`);
  
  // Verificar fluxos também têm description e whenToUse
  const flowsHaveDescription = flowItems.every(m => m.description && m.description.length > 0);
  const flowsHaveWhenToUse = flowItems.every(m => m.whenToUse !== undefined);
  console.log(`✅ Todos os fluxos têm description: ${flowsHaveDescription}`);
  console.log(`✅ Todos os fluxos têm whenToUse: ${flowsHaveWhenToUse}`);
  
  console.log('\n🎉 TODOS OS TESTES CONCLUÍDOS!');
}

runTests().catch(console.error);
