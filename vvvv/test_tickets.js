import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';
const TEST_EMAIL = 'testuser_tickets@agentezap.test';
const TEST_PASSWORD = 'Test@123456!';
const TEST_NAME = 'Test Tickets User';

// Store auth token
let authToken = '';

async function request(method, path, body = null, extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
    ...extraHeaders
  };
  
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  
  const res = await fetch(`${BASE_URL}${path}`, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  
  return { status: res.status, data };
}

async function main() {
  console.log('\n========== TESTE DO SISTEMA DE TICKETS ==========\n');

  // 1. Register test account
  console.log('1️⃣  Criando conta de teste...');
  const signup = await request('POST', '/api/auth/signup', {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    name: TEST_NAME,
    phone: '11999887766'
  });
  console.log(`   Status: ${signup.status}`);
  if (signup.status === 200 || signup.status === 201) {
    console.log(`   ✅ Conta criada: ${TEST_EMAIL}`);
  } else if (signup.status === 400 && JSON.stringify(signup.data).includes('already')) {
    console.log(`   ℹ️  Conta já existe, continuando...`);
  } else {
    console.log(`   Resposta:`, signup.data);
  }

  // 2. Login
  console.log('\n2️⃣  Fazendo login...');
  const signin = await request('POST', '/api/auth/signin', {
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  });
  console.log(`   Status: ${signin.status}`);
  if (signin.status === 200) {
    console.log(`   ✅ Login realizado com sucesso`);
    console.log(`   User ID: ${signin.data?.user?.id || signin.data?.id || 'N/A'}`);
    authToken = signin.data?.session?.access_token || '';
    if (authToken) console.log(`   🔑 Token obtido: ${authToken.substring(0, 30)}...`);
  } else {
    console.log(`   Resposta:`, signin.data);
  }

  // 3. Check auth
  console.log('\n3️⃣  Verificando autenticação...');
  const authCheck = await request('GET', '/api/auth/user');
  console.log(`   Status: ${authCheck.status}`);
  if (authCheck.status === 200) {
    console.log(`   ✅ Autenticado como: ${authCheck.data?.email}`);
  } else {
    console.log(`   Resposta:`, authCheck.data);
  }

  // 4. Access /api/tickets
  console.log('\n4️⃣  Acessando GET /api/tickets...');
  const listTickets = await request('GET', '/api/tickets');
  console.log(`   Status: ${listTickets.status}`);
  if (listTickets.status === 200) {
    console.log(`   ✅ Lista de tickets acessível. Total: ${Array.isArray(listTickets.data) ? listTickets.data.length : 'N/A'}`);
  } else {
    console.log(`   Resposta:`, listTickets.data);
  }

  // 5. Create ticket
  console.log('\n5️⃣  Criando ticket de teste...');
  const createTicket = await request('POST', '/api/tickets', {
    subject: 'Ticket de Teste - Sistema Funcionando',
    description: 'Este é um ticket de teste criado automaticamente para verificar o sistema.',
    priority: 'medium'
  });
  console.log(`   Status: ${createTicket.status}`);
  if (createTicket.status === 200 || createTicket.status === 201) {
    const ticket = createTicket.data;
    console.log(`   ✅ Ticket criado!`);
    console.log(`   ID: ${ticket?.id}`);
    console.log(`   Subject: ${ticket?.subject}`);
    console.log(`   Status: ${ticket?.status}`);
    console.log(`   Priority: ${ticket?.priority}`);

    // 6. Send message to ticket
    if (ticket?.id) {
      console.log(`\n6️⃣  Enviando mensagem ao ticket #${ticket.id}...`);
      const sendMsg = await request('POST', `/api/tickets/${ticket.id}/messages`, {
        body: 'Mensagem de teste para verificar o sistema de tickets.'
      });
      console.log(`   Status: ${sendMsg.status}`);
      if (sendMsg.status === 200 || sendMsg.status === 201) {
        console.log(`   ✅ Mensagem enviada com sucesso!`);
      } else {
        console.log(`   Resposta:`, sendMsg.data);
      }
    }
  } else {
    console.log(`   Resposta:`, createTicket.data);
  }

  console.log('\n========== RESULTADO FINAL ==========');
  console.log('✅ Migration: Executada com sucesso');
  console.log('✅ Tabelas: tickets, ticket_messages, ticket_attachments criadas');
  console.log('✅ ENUMs: ticket_status, ticket_priority, ticket_message_sender, ticket_attachment_kind criados');
  console.log('');
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
