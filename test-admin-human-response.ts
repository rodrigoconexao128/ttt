
import 'dotenv/config';
import { processAdminMessage } from './server/adminAgentService';
import { storage } from './server/storage';

// Mock do console.log para limpar a saída
const originalLog = console.log;
// console.log = () => {}; 

async function runTest() {
  originalLog('\n🧪 INICIANDO TESTE DE HUMANIZAÇÃO DO ADMIN AGENT\n');

  const phone = '5511999998888';
  const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  // 1. Limpar sessão anterior
  await processAdminMessage(phone, '#limpar');

  // 2. Enviar Imagem
  originalLog('📸 Enviando imagem...');
  const response1 = await processAdminMessage(phone, '', 'image', base64Image);
  
  originalLog('\n--- RESPOSTA 1 (Após envio da imagem) ---');
  originalLog(response1?.text);

  if (response1?.text.includes('imagem base64') && response1?.text.includes('Resumo:')) {
    originalLog('❌ FALHA: Resposta ainda contém texto robótico/técnico ("imagem base64").');
  } else if (response1?.text.includes('Recebi a imagem!')) {
    originalLog('✅ SUCESSO: Resposta inicial humanizada detectada.');
  } else {
    originalLog('⚠️ ALERTA: Resposta diferente do esperado.');
  }

  // 3. Enviar Gatilho
  originalLog('\n🗣️ Enviando gatilho: "quando pedir preço"');
  const response2 = await processAdminMessage(phone, 'quando pedir preço');

  originalLog('\n--- RESPOSTA 2 (Pedido de confirmação) ---');
  originalLog(response2?.text);

  if (response2?.text.includes('Entendi! Então vou enviar')) {
    originalLog('✅ SUCESSO: Pedido de confirmação humanizado detectado.');
  } else if (response2?.text.includes('Deseja *confirmar*')) {
    originalLog('❌ FALHA: Pedido de confirmação ainda robótico.');
  }

  // 4. Confirmar
  originalLog('\n👍 Confirmando: "sim"');
  const response3 = await processAdminMessage(phone, 'sim');

  originalLog('\n--- RESPOSTA 3 (Finalização) ---');
  originalLog(response3?.text);

  if (response3?.text.includes('Pronto! Imagem configurada. 😉')) {
    originalLog('✅ SUCESSO: Mensagem final humanizada detectada.');
  } else {
    originalLog('❌ FALHA: Mensagem final ainda robótica ou diferente.');
  }

  originalLog('\n🏁 TESTE CONCLUÍDO');
  process.exit(0);
}

runTest().catch(console.error);
