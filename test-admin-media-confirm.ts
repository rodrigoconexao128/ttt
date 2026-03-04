import { processAdminMessage, getClientSession, clearClientSession } from "./server/adminAgentService";
import { storage } from "./server/storage";
(storage as any).getAllAdmins = async () => [{ id: 'admin-test' }];
(storage as any).createAdminMedia = async (data: any) => { console.log('[MOCK DB] createAdminMedia', data); return data; };
(storage as any).getSystemConfig = async (key: string) => ({ valor: 'Prompt original.' });
(storage as any).updateSystemConfig = async (k: string, v: string) => { console.log('[MOCK DB] updateSystemConfig', k, v); return { chave: k, valor: v }; };

async function run() {
  const phone = '5511999999999';
  clearClientSession(phone);

  const validBase64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  console.log('\n--- Send image (admin) ---');
  const r1 = await processAdminMessage(phone, 'Imagem do cardápio', 'image', validBase64Image, true);
  console.log('R1:', r1?.text);

  const session = getClientSession(phone);
  console.log('Session after image:', { awaitingMediaContext: session?.awaitingMediaContext, awaitingMediaConfirmation: session?.awaitingMediaConfirmation, pendingMedia: session?.pendingMedia });

  console.log('\n--- Send trigger candidate ---');
  const r2 = await processAdminMessage(phone, 'Quando o cliente pedir o cardápio', undefined, undefined, true);
  console.log('R2:', r2?.text);

  console.log('\n--- Confirm with sim ---');
  const r3 = await processAdminMessage(phone, 'sim', undefined, undefined, true);
  console.log('R3:', r3?.text);
}

run().catch(console.error);
