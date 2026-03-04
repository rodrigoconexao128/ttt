#!/usr/bin/env node
/**
 * wa-audit-duplicate-connections.mjs
 * 
 * Audit script to identify WhatsApp connections that share the same auth scope.
 * Multiple connections sharing the same auth_userId dir will cause 440 (connectionReplaced)
 * conflicts when restored simultaneously.
 * 
 * Usage:
 *   node scripts/wa-audit-duplicate-connections.mjs
 *   QUARANTINE=true node scripts/wa-audit-duplicate-connections.mjs  # Also quarantine duplicates
 * 
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or DATABASE_URL environment variables
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const SESSIONS_BASE = process.env.SESSIONS_DIR || path.join(__dirname, '..', 'sessions');
const QUARANTINE = process.env.QUARANTINE === 'true';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('=== WhatsApp Connection Audit ===');
  console.log(`Mode: ${QUARANTINE ? 'QUARANTINE (will mark duplicates as disconnected)' : 'AUDIT ONLY (read-only)'}`);
  console.log('');

  // 1. Fetch all connections
  const { data: connections, error } = await supabase
    .from('whatsapp_connections')
    .select('id, user_id, is_connected, is_primary, phone_number, created_at, updated_at')
    .order('user_id');

  if (error) {
    console.error('Error fetching connections:', error);
    process.exit(1);
  }

  console.log(`Total connections in DB: ${connections.length}`);

  // 2. Group by user_id
  const byUser = new Map();
  for (const conn of connections) {
    const userId = conn.user_id;
    if (!byUser.has(userId)) byUser.set(userId, []);
    byUser.get(userId).push(conn);
  }

  // 3. Find users with multiple connections
  const duplicates = [];
  for (const [userId, userConns] of byUser) {
    if (userConns.length > 1) {
      duplicates.push({ userId, connections: userConns });
    }
  }

  console.log(`Users with multiple connections: ${duplicates.length}`);
  console.log('');

  // 4. Check auth dirs on disk
  let authDirs = [];
  try {
    const entries = await fs.readdir(SESSIONS_BASE);
    authDirs = entries.filter(e => e.startsWith('auth_'));
  } catch {
    console.log(`Cannot read sessions dir at ${SESSIONS_BASE}`);
  }

  // 5. Report duplicates
  let quarantineCount = 0;
  for (const { userId, connections: userConns } of duplicates) {
    console.log(`\n--- User ${userId.substring(0, 12)}... (${userConns.length} connections) ---`);

    // Sort: connected > primary > newest
    userConns.sort((a, b) => {
      if (a.is_connected && !b.is_connected) return -1;
      if (!a.is_connected && b.is_connected) return 1;
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    });

    // Check which ones share auth scope
    const userAuthDir = `auth_${userId}`;
    const hasUserAuth = authDirs.includes(userAuthDir);

    for (let i = 0; i < userConns.length; i++) {
      const conn = userConns[i];
      const connAuthDir = `auth_${conn.id}`;
      const hasOwnAuth = authDirs.includes(connAuthDir);
      const isCanonical = i === 0;

      const status = [
        isCanonical ? 'CANONICAL' : 'DUPLICATE',
        conn.is_connected ? 'connected' : 'disconnected',
        conn.is_primary ? 'primary' : 'secondary',
        hasOwnAuth ? 'has_own_auth' : (hasUserAuth ? 'shares_user_auth' : 'no_auth'),
        conn.phone_number || 'no_phone',
      ].join(' | ');

      console.log(`  ${isCanonical ? '✅' : '⚠️'} ${conn.id.substring(0, 12)}... ${status}`);

      // Quarantine: mark non-canonical as disconnected
      if (QUARANTINE && !isCanonical && conn.is_connected) {
        console.log(`    → QUARANTINING: marking as disconnected`);
        const { error: updateErr } = await supabase
          .from('whatsapp_connections')
          .update({ is_connected: false, qr_code: null })
          .eq('id', conn.id);

        if (updateErr) {
          console.error(`    → ERROR: ${updateErr.message}`);
        } else {
          quarantineCount++;
          console.log(`    → Done`);
        }
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total connections: ${connections.length}`);
  console.log(`Users with duplicates: ${duplicates.length}`);
  console.log(`Auth dirs on disk: ${authDirs.length}`);
  if (QUARANTINE) {
    console.log(`Connections quarantined: ${quarantineCount}`);
  }
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
