/**
 * Entry Point - Service Mode Router
 * 
 * Roteia para o modo correto baseado na variável SERVICE_MODE:
 * - 'proxy': Proxy reverso leve (Web Service - sem volume, deploy rápido)
 * - 'worker' | 'monolith' | undefined: App completo (Worker Service - com volume)
 * 
 * ARQUITETURA 2 SERVIÇOS:
 * ┌─────────────────┐     ┌──────────────────────────┐
 * │  Web Service     │     │  Worker Service           │
 * │  (proxy)         │────▶│  (app completo)           │
 * │  SERVICE_MODE=   │     │  SERVICE_MODE=worker      │
 * │    proxy         │     │  Volume: /data             │
 * │  Sem volume      │     │  WhatsApp sessions        │
 * │  Deploy rápido   │     │  Auto-deploy: OFF         │
 * └─────────────────┘     └──────────────────────────┘
 */
import 'dotenv/config';

const SERVICE_MODE = process.env.SERVICE_MODE || 'monolith';
const BOOT_ID = new Date().toISOString();
process.env.BOOT_ID = BOOT_ID;

console.log(`🚀 [BOOT] Starting server (bootId=${BOOT_ID}) mode=${SERVICE_MODE}`);
console.log(`🚀 [BOOT] node=${process.version} env=${process.env.NODE_ENV || 'unknown'} port=${process.env.PORT || 'unknown'}`);
console.log(`🚀 [BOOT] railwayCommit=${process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT || 'unknown'}`);

if (SERVICE_MODE === 'proxy') {
  // ============================================================
  // MODO PROXY: Apenas encaminha tráfego para o Worker Service
  // Não carrega whatsapp.ts, routes.ts, nem nada pesado
  // Deploy instantâneo (~5s), sessões WhatsApp não são afetadas
  // ============================================================
  console.log('🔄 [PROXY MODE] Loading lightweight proxy module...');
  import('./proxy').then(({ startProxy }) => {
    startProxy();
  }).catch((err) => {
    console.error('❌ [PROXY MODE] Failed to start proxy:', err);
    process.exit(1);
  });
} else {
  // ============================================================
  // MODO WORKER/MONOLITH: App completo com WhatsApp + Express + tudo
  // ============================================================
  console.log(`🏗️ [${SERVICE_MODE.toUpperCase()} MODE] Loading full application...`);
  import('./full-app').then(({ startFullApp }) => {
    startFullApp();
  }).catch((err) => {
    console.error(`❌ [${SERVICE_MODE.toUpperCase()} MODE] Failed to start:`, err);
    process.exit(1);
  });
}
