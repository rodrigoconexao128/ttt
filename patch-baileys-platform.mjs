#!/usr/bin/env node
/**
 * patch-baileys-platform.mjs
 * 
 * FIX 2026-02-24: WhatsApp rejeitou Platform.WEB (value 14)
 * Agora requer Platform.MACOS (value 24)
 * 
 * Ref: https://github.com/WhiskeySockets/Baileys/issues/2370
 * Ref: https://github.com/WhiskeySockets/Baileys/pull/2365
 * 
 * Este script roda como postinstall para aplicar o patch automaticamente
 * após npm install, já que o PR #2365 ainda não foi mergeado no Baileys.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const filePath = join(
  __dirname,
  'node_modules',
  '@whiskeysockets',
  'baileys',
  'lib',
  'Utils',
  'validate-connection.js'
);

if (!existsSync(filePath)) {
  console.log('⚠️ [PATCH] validate-connection.js não encontrado, pulando patch');
  process.exit(0);
}

let content = readFileSync(filePath, 'utf-8');

const oldPlatform = 'proto.ClientPayload.UserAgent.Platform.WEB';
const newPlatform = 'proto.ClientPayload.UserAgent.Platform.MACOS';

if (content.includes(newPlatform)) {
  console.log('✅ [PATCH] Platform já é MACOS, nenhuma alteração necessária');
  process.exit(0);
}

if (!content.includes(oldPlatform)) {
  console.log('⚠️ [PATCH] Platform.WEB não encontrado no arquivo, pulando patch');
  process.exit(0);
}

content = content.replace(oldPlatform, newPlatform);
writeFileSync(filePath, content, 'utf-8');

console.log('✅ [PATCH] Platform.WEB → Platform.MACOS aplicado com sucesso!');
console.log('   Ref: https://github.com/WhiskeySockets/Baileys/issues/2370');
