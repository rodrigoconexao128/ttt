/**
 * Script para limpar arquivos de sessão antigos/desnecessários
 * RESOLUÇÃO DO ERRO: ENOSPC (No space left on device)
 * 
 * Uso: npx tsx cleanup-sessions.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const SESSIONS_BASE = process.env.SESSIONS_DIR || './';

interface FileInfo {
  name: string;
  path: string;
  size: number;
  mtime: Date;
}

async function getDirectorySize(dirPath: string): Promise<{ totalSize: number; fileCount: number }> {
  let totalSize = 0;
  let fileCount = 0;
  
  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);
      
      if (item.isDirectory()) {
        const subResult = await getDirectorySize(itemPath);
        totalSize += subResult.totalSize;
        fileCount += subResult.fileCount;
      } else {
        const stats = await fs.stat(itemPath);
        totalSize += stats.size;
        fileCount++;
      }
    }
  } catch (e) {
    // Ignora erros de acesso
  }
  
  return { totalSize, fileCount };
}

async function findAuthDirectories(): Promise<string[]> {
  const dirs: string[] = [];
  
  try {
    const items = await fs.readdir(SESSIONS_BASE, { withFileTypes: true });
    
    for (const item of items) {
      if (item.isDirectory() && item.name.startsWith('auth_')) {
        dirs.push(path.join(SESSIONS_BASE, item.name));
      }
    }
  } catch (e) {
    console.error('Erro ao listar diretórios:', e);
  }
  
  return dirs;
}

async function analyzeAuthDirectory(authDir: string): Promise<{
  essentialFiles: FileInfo[];
  cleanableFiles: FileInfo[];
  totalSize: number;
  cleanableSize: number;
}> {
  const essentialFiles: FileInfo[] = [];
  const cleanableFiles: FileInfo[] = [];
  let totalSize = 0;
  let cleanableSize = 0;
  
  // Arquivos essenciais para manter a sessão (NUNCA deletar)
  const essentialPatterns = [
    'creds.json',
    'app-state-sync-key-',
    'app-state-sync-version-',
  ];
  
  // Arquivos que podem ser limpos com segurança
  const cleanablePatterns = [
    'pre-key-',        // Pre-keys são regenerados automaticamente
    'sender-key-',     // Sender keys são regenerados
    'session-',        // Sessões de conversa antigas
    'device-list-',    // Device lists são atualizadas
    'lid-mapping-',    // LID mappings podem ser recriados
    'tctoken-',        // Tokens de chat
  ];
  
  try {
    const files = await fs.readdir(authDir);
    
    for (const file of files) {
      const filePath = path.join(authDir, file);
      
      try {
        const stats = await fs.stat(filePath);
        const fileInfo: FileInfo = {
          name: file,
          path: filePath,
          size: stats.size,
          mtime: stats.mtime,
        };
        
        totalSize += stats.size;
        
        // Verifica se é essencial
        const isEssential = essentialPatterns.some(p => file.startsWith(p) || file === p);
        
        if (isEssential) {
          essentialFiles.push(fileInfo);
        } else {
          // Verifica se é limpável
          const isCleanable = cleanablePatterns.some(p => file.startsWith(p));
          
          if (isCleanable) {
            cleanableFiles.push(fileInfo);
            cleanableSize += stats.size;
          } else {
            // Arquivos desconhecidos - manter por segurança
            essentialFiles.push(fileInfo);
          }
        }
      } catch (e) {
        // Ignora erros de stat
      }
    }
  } catch (e) {
    console.error(`Erro ao analisar ${authDir}:`, e);
  }
  
  return { essentialFiles, cleanableFiles, totalSize, cleanableSize };
}

async function cleanOldPreKeys(authDir: string, keepCount: number = 100): Promise<number> {
  let deleted = 0;
  
  try {
    const files = await fs.readdir(authDir);
    
    // Encontra todos os pre-keys
    const preKeys = files
      .filter(f => f.startsWith('pre-key-') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(authDir, f),
        id: parseInt(f.replace('pre-key-', '').replace('.json', '')),
      }))
      .filter(pk => !isNaN(pk.id))
      .sort((a, b) => b.id - a.id); // Ordena por ID decrescente (mais novos primeiro)
    
    // Mantém apenas os últimos keepCount pre-keys
    const toDelete = preKeys.slice(keepCount);
    
    for (const pk of toDelete) {
      try {
        await fs.unlink(pk.path);
        deleted++;
      } catch (e) {
        // Ignora erros
      }
    }
    
    console.log(`  🗑️ Deletados ${deleted} pre-keys antigos (mantidos últimos ${keepCount})`);
  } catch (e) {
    console.error(`Erro ao limpar pre-keys em ${authDir}:`, e);
  }
  
  return deleted;
}

async function cleanOldSessions(authDir: string, maxAgeDays: number = 7): Promise<number> {
  let deleted = 0;
  const now = Date.now();
  const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
  
  const patterns = ['session-', 'sender-key-', 'tctoken-'];
  
  try {
    const files = await fs.readdir(authDir);
    
    for (const file of files) {
      const matchesPattern = patterns.some(p => file.startsWith(p));
      if (!matchesPattern) continue;
      
      const filePath = path.join(authDir, file);
      
      try {
        const stats = await fs.stat(filePath);
        const age = now - stats.mtime.getTime();
        
        if (age > maxAge) {
          await fs.unlink(filePath);
          deleted++;
        }
      } catch (e) {
        // Ignora erros
      }
    }
    
    console.log(`  🗑️ Deletados ${deleted} arquivos de sessão com mais de ${maxAgeDays} dias`);
  } catch (e) {
    console.error(`Erro ao limpar sessões em ${authDir}:`, e);
  }
  
  return deleted;
}

async function cleanLidMappings(authDir: string): Promise<number> {
  let deleted = 0;
  
  try {
    const files = await fs.readdir(authDir);
    
    // Deletar LID mappings reversos (podem ser recriados)
    const reverseFiles = files.filter(f => f.includes('_reverse.json'));
    
    for (const file of reverseFiles) {
      try {
        await fs.unlink(path.join(authDir, file));
        deleted++;
      } catch (e) {
        // Ignora erros
      }
    }
    
    console.log(`  🗑️ Deletados ${deleted} arquivos de LID mapping reverso`);
  } catch (e) {
    console.error(`Erro ao limpar LID mappings em ${authDir}:`, e);
  }
  
  return deleted;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     LIMPEZA DE SESSÕES WHATSAPP - RESOLVER ENOSPC            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  console.log(`📁 Diretório de sessões: ${SESSIONS_BASE}\n`);
  
  // Encontrar diretórios de auth
  const authDirs = await findAuthDirectories();
  console.log(`📂 Encontrados ${authDirs.length} diretório(s) de autenticação\n`);
  
  if (authDirs.length === 0) {
    console.log('❌ Nenhum diretório de autenticação encontrado.');
    return;
  }
  
  let totalCleaned = 0;
  let totalSpaceSaved = 0;
  
  for (const authDir of authDirs) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📁 Processando: ${path.basename(authDir)}`);
    console.log(`${'─'.repeat(60)}`);
    
    // Análise antes da limpeza
    const before = await getDirectorySize(authDir);
    console.log(`📊 Antes: ${formatBytes(before.totalSize)} em ${before.fileCount} arquivos`);
    
    // Analisar arquivos
    const analysis = await analyzeAuthDirectory(authDir);
    console.log(`   Essenciais: ${analysis.essentialFiles.length} arquivos`);
    console.log(`   Limpáveis: ${analysis.cleanableFiles.length} arquivos (${formatBytes(analysis.cleanableSize)})`);
    
    // Executar limpeza
    console.log('\n🧹 Executando limpeza...');
    
    // 1. Limpar pre-keys antigos (manter últimos 100)
    await cleanOldPreKeys(authDir, 100);
    
    // 2. Limpar sessões antigas (mais de 7 dias)
    await cleanOldSessions(authDir, 7);
    
    // 3. Limpar LID mappings reversos
    await cleanLidMappings(authDir);
    
    // Análise depois da limpeza
    const after = await getDirectorySize(authDir);
    const saved = before.totalSize - after.totalSize;
    
    console.log(`\n📊 Depois: ${formatBytes(after.totalSize)} em ${after.fileCount} arquivos`);
    console.log(`💾 Espaço liberado: ${formatBytes(saved)}`);
    
    totalSpaceSaved += saved;
    totalCleaned += (before.fileCount - after.fileCount);
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('                      RESUMO FINAL');
  console.log('═'.repeat(60));
  console.log(`🗑️ Total de arquivos removidos: ${totalCleaned}`);
  console.log(`💾 Espaço total liberado: ${formatBytes(totalSpaceSaved)}`);
  
  if (totalSpaceSaved > 0) {
    console.log('\n✅ Limpeza concluída! O sistema deve voltar a funcionar.');
    console.log('⚠️ Recomendação: Faça um novo deploy no Railway após a limpeza.');
  } else {
    console.log('\n⚠️ Nenhum espaço foi liberado. O problema pode estar em outro lugar.');
  }
}

main().catch(console.error);
