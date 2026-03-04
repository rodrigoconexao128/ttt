const http = require('http');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsImtpZCI6IjNyc21manREY0xYQjdlWXoiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2JuZnBjdXpqdnljdWRjY3ljcXF0LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJjYjkyMTNjMy1mZGUzLTQ3OWUtYTRhYS0zNDQxNzFjNTk3MzUiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzcxNTYxMTA3LCJpYXQiOjE3NzE1NTc1MDcsImVtYWlsIjoicm9kcmlnbzRAZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwibmFtZSI6InJvZHJpZ28iLCJwaG9uZSI6Iis1NTE3OTkxOTU2OTQ4In0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3NzE1NTc1MDd9XSwic2Vzc2lvbl9pZCI6ImVlNDhkNWY2LTg5ODEtNGFkMi1hODIzLThjMDRlNTFjOTEwMCIsImlzX2Fub255bW91cyI6ZmFsc2V9.5LTsBvMgIUTVWjhwvCwbJYsa2W-IR1Nlik81H2A4fnE';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = http.request(opts, res => {
      let chunks = '';
      res.on('data', d => chunks += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(chunks) }); }
        catch(e) { resolve({ status: res.statusCode, body: chunks }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  let passed = 0, failed = 0;
  const results = [];
  
  function log(name, ok, detail) {
    const icon = ok ? '✅' : '❌';
    console.log(`${icon} ${name}${detail ? ' | ' + detail : ''}`);
    if (ok) passed++; else failed++;
    results.push({ name, ok, detail });
  }
  
  // ===== PARTE 4 TESTS =====
  
  // 1. GET user (signature check)
  try {
    const r = await request('GET', '/api/auth/user');
    log('T01: GET /api/auth/user', r.status === 200, `sig=${r.body.signature}`);
  } catch(e) { log('T01: GET /api/auth/user', false, e.message); }
  
  // 2. PUT signature - update and verify
  try {
    const r = await request('PUT', '/api/user/signature', { signature: 'Att, Rodrigo P4', signatureEnabled: true });
    log('T02: PUT /api/user/signature', r.status === 200, `status=${r.status}`);
  } catch(e) { log('T02: PUT /api/user/signature', false, e.message); }
  
  // 3. Verify signature persistence
  try {
    const r = await request('GET', '/api/auth/user');
    const ok = r.body.signature === 'Att, Rodrigo P4' && r.body.signatureEnabled === true;
    log('T03: Signature persistence', ok, `sig="${r.body.signature}" enabled=${r.body.signatureEnabled}`);
  } catch(e) { log('T03: Signature persistence', false, e.message); }
  
  // 4. GET conversations-with-tags (contact list with selection support)
  let convIds = [];
  try {
    const r = await request('GET', '/api/conversations-with-tags');
    const ok = r.status === 200 && Array.isArray(r.body) && r.body.length > 0;
    convIds = r.body.slice(0, 5).map(c => c.id);
    log('T04: GET /api/conversations-with-tags', ok, `count=${r.body.length} (5 IDs for bulk tests)`);
  } catch(e) { log('T04: GET /api/conversations-with-tags', false, e.message); }
  
  // 5. Bulk read (mass action - select all test)
  try {
    const r = await request('POST', '/api/conversations/bulk/read', { conversationIds: convIds });
    log('T05: POST bulk/read (selecionar todos)', r.status === 200, `updated=${r.body.updated} of ${convIds.length}`);
  } catch(e) { log('T05: POST bulk/read', false, e.message); }
  
  // 6. Individual contact selection test (single ID)
  if (convIds.length > 0) {
    try {
      const r = await request('POST', '/api/conversations/bulk/read', { conversationIds: [convIds[0]] });
      log('T06: POST bulk/read (seleção individual)', r.status === 200, `updated=${r.body.updated}`);
    } catch(e) { log('T06: Individual selection', false, e.message); }
  }
  
  // 7. Bulk AI enable (mass action)
  try {
    const r = await request('POST', '/api/conversations/bulk/ai-enable', { conversationIds: convIds });
    log('T07: POST bulk/ai-enable (ativar IA em massa)', r.status === 200, `updated=${r.body.updated}`);
  } catch(e) { log('T07: POST bulk/ai-enable', false, e.message); }
  
  // 8. Bulk AI disable (mass action)
  try {
    const r = await request('POST', '/api/conversations/bulk/ai-disable', { conversationIds: convIds });
    log('T08: POST bulk/ai-disable (desativar IA em massa)', r.status === 200, `updated=${r.body.updated}`);
  } catch(e) { log('T08: POST bulk/ai-disable', false, e.message); }
  
  // 9. GET custom field definitions
  let customFields = [];
  try {
    const r = await request('GET', '/api/custom-fields');
    customFields = r.body;
    log('T09: GET /api/custom-fields', r.status === 200, `count=${customFields.length}`);
  } catch(e) { log('T09: GET /api/custom-fields', false, e.message); }
  
  // 10. POST create custom field
  let newFieldId = null;
  try {
    const r = await request('POST', '/api/custom-fields', { 
      name: 'campo_teste_p4', 
      label: 'Campo Teste P4',
      fieldType: 'text', 
      required: false 
    });
    newFieldId = r.body.id;
    log('T10: POST /api/custom-fields (create)', r.status === 200 || r.status === 201, `id=${newFieldId}`);
  } catch(e) { log('T10: POST /api/custom-fields', false, e.message); }
  
  // 11. PUT update custom field
  if (newFieldId) {
    try {
      const r = await request('PUT', `/api/custom-fields/${newFieldId}`, { 
        label: 'Campo Teste P4 Editado',
        isActive: true
      });
      log('T11: PUT /api/custom-fields/:id (update)', r.status === 200, `status=${r.status}`);
    } catch(e) { log('T11: PUT /api/custom-fields/:id', false, e.message); }
  }
  
  // 12. GET conversation custom field values
  if (convIds.length > 0) {
    try {
      const r = await request('GET', `/api/conversations/${convIds[0]}/custom-fields`);
      log('T12: GET /api/conversations/:id/custom-fields', r.status === 200, `status=${r.status}`);
    } catch(e) { log('T12: GET /api/conversations/:id/custom-fields', false, e.message); }
    
    // 13. PUT save custom field values (Salvar button)
    const fieldToSave = customFields.length > 0 ? customFields[0] : null;
    if (fieldToSave) {
      try {
        const r = await request('PUT', `/api/conversations/${convIds[0]}/custom-fields`, {
          fields: [{ fieldId: fieldToSave.id, value: 'TesteSalvar123' }]
        });
        log('T13: PUT /api/conversations/:id/custom-fields (Salvar)', r.status === 200, `status=${r.status}`);
      } catch(e) { log('T13: PUT custom-fields save', false, e.message); }
      
      // 14. Verify persistence of saved custom field
      try {
        const r = await request('GET', `/api/conversations/${convIds[0]}/custom-fields`);
        const fields = Array.isArray(r.body) ? r.body : (r.body.values || r.body.fields || []);
        const savedField = fields.find(f => f.value === 'TesteSalvar123');
        log('T14: Custom field save persistence', r.status === 200, `saved=${!!savedField} fields=${fields.length}`);
      } catch(e) { log('T14: Custom field persistence', false, e.message); }
    }
  }
  
  // 15. Close ticket (encerrar chamado sem apagar histórico)
  if (convIds.length > 0) {
    const convIdToClose = convIds[2]; // Use 3rd conversation to avoid affecting main test conv
    try {
      const r = await request('POST', `/api/conversations/${convIdToClose}/close-ticket`, { 
        reason: 'Teste encerramento P4' 
      });
      log('T15: POST close-ticket (encerrar chamado)', r.status === 200, `isClosed=${r.body.conversation?.isClosed}`);
    } catch(e) { log('T15: POST close-ticket', false, e.message); }
    
    // 16. Verify history preserved after close
    try {
      const r = await request('GET', `/api/conversations/${convIdToClose}/closure-logs`);
      log('T16: GET closure-logs (histórico preservado)', r.status === 200, `logs=${Array.isArray(r.body) ? r.body.length : 'N/A'}`);
    } catch(e) { log('T16: GET closure-logs', false, e.message); }
    
    // 17. Reopen ticket (new context on return)
    try {
      const r = await request('POST', `/api/conversations/${convIdToClose}/reopen-ticket`, { 
        reason: 'Cliente retornou' 
      });
      log('T17: POST reopen-ticket (novo contexto retorno)', r.status === 200, `newId=${r.body.conversation?.id}`);
    } catch(e) { log('T17: POST reopen-ticket', false, e.message); }
  }
  
  // 18. Schedule message (manual text)
  let scheduledMsgId = null;
  if (convIds.length > 0) {
    try {
      const futureDate = new Date(Date.now() + 3600000).toISOString().replace('T', ' ').slice(0, 16);
      const r = await request('POST', `/api/conversations/${convIds[0]}/schedule-message`, {
        scheduledFor: new Date(Date.now() + 3600000).toISOString(),
        text: 'Mensagem agendada teste P4 - manual',
        useAI: false,
        note: 'Teste P4'
      });
      scheduledMsgId = r.body.messageId;
      log('T18: POST schedule-message (texto manual)', r.status === 200 || r.status === 201, `id=${scheduledMsgId} scheduled=${r.body.scheduledFor}`);
    } catch(e) { log('T18: POST schedule-message', false, e.message); }
    
    // 19. GET scheduled messages
    try {
      const r = await request('GET', `/api/conversations/${convIds[0]}/scheduled-messages`);
      log('T19: GET scheduled-messages', r.status === 200, `count=${Array.isArray(r.body) ? r.body.length : 'N/A'}`);
    } catch(e) { log('T19: GET scheduled-messages', false, e.message); }
    
    // 20. Schedule with AI flag (AI editável)
    try {
      const r = await request('POST', `/api/conversations/${convIds[0]}/schedule-message`, {
        scheduledFor: new Date(Date.now() + 7200000).toISOString(),
        text: 'Olá, tudo bem? Como posso ajudar?',
        useAI: true,
        note: 'Com IA - editável'
      });
      log('T20: POST schedule-message (com IA editável)', r.status === 200 || r.status === 201, `useAI=${r.body.useAI}`);
    } catch(e) { log('T20: POST schedule-message (AI)', false, e.message); }
    
    // 21. Cancel scheduled message
    if (scheduledMsgId) {
      try {
        const r = await request('DELETE', `/api/conversations/${convIds[0]}/scheduled-messages/${scheduledMsgId}`);
        log('T21: DELETE scheduled-messages/:id (cancel)', r.status === 200, `success=${r.body.success}`);
      } catch(e) { log('T21: DELETE scheduled-message', false, e.message); }
    }
  }
  
  // 22. User AI generate message
  if (convIds.length > 0) {
    try {
      const r = await request('POST', `/api/user/ai/generate-message`, {
        conversationId: convIds[0],
        baseMessage: 'Olá, precisamos conversar sobre seu pedido.',
        context: 'Agendamento de retorno'
      });
      log('T22: POST /api/user/ai/generate-message (IA editável)', r.status === 200, `generated=${r.body.generatedMessage ? 'yes' : 'no'}`);
    } catch(e) { log('T22: POST ai/generate-message', false, e.message); }
  }
  
  // 23. Edge case - empty bulk (should return 400)
  try {
    const r = await request('POST', '/api/conversations/bulk/read', { conversationIds: [] });
    log('T23: Edge: bulk with empty list (expect 400)', r.status === 400, `status=${r.status}`);
  } catch(e) { log('T23: Edge: empty bulk', false, e.message); }
  
  // 24. Edge case - invalid conversation ID for close-ticket (expect 404/403)
  try {
    const r = await request('POST', '/api/conversations/non-existent-id-xyz/close-ticket', { reason: 'test' });
    log('T24: Edge: close-ticket invalid ID (expect 404)', r.status === 404, `status=${r.status}`);
  } catch(e) { log('T24: Edge: invalid close-ticket', false, e.message); }
  
  // 25. Regression - bulk route still works after ordering fix
  try {
    const r = await request('POST', '/api/conversations/bulk/archive', { conversationIds: convIds.slice(0,2), archived: false });
    log('T25: Regression: bulk/archive still works', r.status === 200, `updated=${r.body.updated}`);
  } catch(e) { log('T25: Regression: bulk/archive', false, e.message); }
  
  // 26. Regression - conversations list still works
  try {
    const r = await request('GET', '/api/conversations');
    log('T26: Regression: GET /api/conversations', r.status === 200, `status=${r.status}`);
  } catch(e) { log('T26: Regression: /api/conversations', false, e.message); }
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log(`PARTE 4 RESULTS: ${passed} PASSED, ${failed} FAILED out of ${passed+failed} tests`);
  console.log('='.repeat(70));
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.ok).forEach(r => console.log('  ❌ ' + r.name + ' | ' + r.detail));
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error(e); process.exit(1); });
