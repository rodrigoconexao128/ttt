/**
 * 📱 SERVIÇO DE SINCRONIZAÇÃO DE CONTATOS EM BACKGROUND
 * 
 * ⚠️ OTIMIZADO PARA ESCALA - Todos os clientes usam este sistema!
 * 
 * OTIMIZAÇÕES:
 * - Máximo 1 sincronização por vez no servidor inteiro
 * - Lotes MUITO pequenos (3 contatos por vez)
 * - Delay GRANDE entre lotes (3 segundos)
 * - Cache em memória para evitar queries repetidas
 * - Limite de 500 contatos por sync (paginar se precisar de mais)
 * 
 * REGRA: Somente contatos que JÁ CONVERSARAM (clientes reais)
 */

import { storage } from "./storage";
import { db } from "./db";
import { whatsappContacts, conversations } from "../shared/schema";
import { eq, and, desc, sql, isNotNull, ne } from "drizzle-orm";

// ============================================
// CONFIGURAÇÕES DE PERFORMANCE
// ============================================
const CONFIG = {
  BATCH_SIZE: 10,          // Contatos por lote 
  DELAY_BETWEEN_BATCHES: 500,   // 500ms entre lotes
  MAX_CONTACTS_PER_SYNC: 10000, // Limite de contatos por sync (10k)
  MAX_CONCURRENT_SYNCS: 2,      // 2 syncs por vez no servidor
  CACHE_TTL_MS: 5 * 60 * 1000,  // Cache de 5 minutos
};

// Status de sincronização por userId
interface SyncStatus {
  userId: string;
  connectionId: string;
  status: 'idle' | 'queued' | 'running' | 'completed' | 'error';
  progress: number; // 0-100
  totalContacts: number;
  processedContacts: number;
  lastSyncAt?: Date;
  error?: string;
  queuePosition?: number;
}

// Map de status por usuário
const syncStatusMap = new Map<string, SyncStatus>();

// Fila GLOBAL de sincronização (todos os usuários)
const globalSyncQueue: string[] = [];
let activeSyncs = 0;

// Cache de contatos já no banco (evita queries repetidas)
const contactExistsCache = new Map<string, { exists: boolean; timestamp: number }>();

/**
 * Limpa cache antigo
 */
function cleanOldCache() {
  const now = Date.now();
  for (const [key, value] of contactExistsCache.entries()) {
    if (now - value.timestamp > CONFIG.CACHE_TTL_MS) {
      contactExistsCache.delete(key);
    }
  }
}

/**
 * Obtém o status atual da sincronização
 */
export function getSyncStatus(userId: string): SyncStatus {
  const status = syncStatusMap.get(userId);
  if (status) {
    // Atualizar posição na fila
    const queuePosition = globalSyncQueue.indexOf(userId);
    return {
      ...status,
      queuePosition: queuePosition >= 0 ? queuePosition + 1 : undefined,
    };
  }
  
  return {
    userId,
    connectionId: '',
    status: 'idle',
    progress: 0,
    totalContacts: 0,
    processedContacts: 0,
  };
}

/**
 * Inicia sincronização em background
 * Retorna imediatamente com mensagem para o usuário
 */
export async function startBackgroundSync(userId: string, connectionId: string): Promise<{ 
  message: string; 
  status: 'started' | 'queued' | 'already_running' | 'error' 
}> {
  const currentStatus = syncStatusMap.get(userId);
  
  // Se já está rodando ou na fila, não adiciona novamente
  if (currentStatus?.status === 'running') {
    return { 
      message: '⏳ Sincronização já está em andamento. Aguarde até 10 minutos.',
      status: 'already_running'
    };
  }
  
  if (currentStatus?.status === 'queued') {
    const position = globalSyncQueue.indexOf(userId) + 1;
    return { 
      message: `⏳ Você está na posição ${position} da fila. Aguarde sua vez.`,
      status: 'queued'
    };
  }
  
  // Verificar se já tem contatos sincronizados recentemente
  const hasSynced = await hasSyncedBefore(connectionId);
  if (hasSynced) {
    // Verificar quando foi a última sync
    const recentContacts = await db
      .select({ lastSync: whatsappContacts.lastSyncedAt })
      .from(whatsappContacts)
      .where(eq(whatsappContacts.connectionId, connectionId))
      .orderBy(desc(whatsappContacts.lastSyncedAt))
      .limit(1);
    
    if (recentContacts[0]?.lastSync) {
      const hoursSinceSync = (Date.now() - recentContacts[0].lastSync.getTime()) / (1000 * 60 * 60);
      if (hoursSinceSync < 1) {
        return {
          message: '✅ Contatos já estão atualizados! Última sincronização há menos de 1 hora.',
          status: 'already_running'
        };
      }
    }
  }
  
  // Adiciona à fila
  if (!globalSyncQueue.includes(userId)) {
    globalSyncQueue.push(userId);
  }
  
  const position = globalSyncQueue.indexOf(userId) + 1;
  
  // Inicializa status como "na fila"
  syncStatusMap.set(userId, {
    userId,
    connectionId,
    status: 'queued',
    progress: 0,
    totalContacts: 0,
    processedContacts: 0,
    queuePosition: position,
  });
  
  // Inicia processamento da fila se não estiver no limite
  processGlobalQueue();
  
  if (position === 1 && activeSyncs < CONFIG.MAX_CONCURRENT_SYNCS) {
    return {
      message: '✅ Sincronização iniciada! Os contatos aparecerão em até 10 minutos.',
      status: 'started'
    };
  }
  
  return {
    message: `⏳ Você está na posição ${position} da fila. Aguarde sua vez (estimativa: ${position * 5} minutos).`,
    status: 'queued'
  };
}

/**
 * Processa a fila GLOBAL de sincronização
 * Apenas 1 sync por vez para não sobrecarregar
 */
async function processGlobalQueue() {
  // Se já tem sync ativa, não inicia outra
  if (activeSyncs >= CONFIG.MAX_CONCURRENT_SYNCS || globalSyncQueue.length === 0) {
    return;
  }
  
  // Pega o próximo da fila
  const userId = globalSyncQueue[0];
  const status = syncStatusMap.get(userId);
  
  if (!status || status.status !== 'queued') {
    globalSyncQueue.shift();
    processGlobalQueue();
    return;
  }
  
  // Marca como rodando
  activeSyncs++;
  syncStatusMap.set(userId, { ...status, status: 'running' });
  globalSyncQueue.shift();
  
  // Atualiza posições na fila para os outros
  globalSyncQueue.forEach((uid, index) => {
    const s = syncStatusMap.get(uid);
    if (s) {
      syncStatusMap.set(uid, { ...s, queuePosition: index + 1 });
    }
  });
  
  try {
    await syncContactsForUser(userId, status.connectionId);
  } catch (error) {
    console.error(`[SYNC ERROR] Falha ao sincronizar para ${userId}:`, error);
    syncStatusMap.set(userId, {
      ...status,
      status: 'error',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  } finally {
    activeSyncs--;
    // Processa próximo da fila
    setTimeout(() => processGlobalQueue(), 1000);
  }
}

/**
 * Sincroniza contatos de um usuário em lotes MUITO pequenos
 * REGRA: Somente contatos que já conversaram (têm conversas)
 */
async function syncContactsForUser(userId: string, connectionId: string) {
  console.log(`[SYNC] 🚀 Iniciando sincronização para user ${userId}`);
  
  const status = syncStatusMap.get(userId)!;
  
  // Limpar cache antigo
  cleanOldCache();
  
  try {
    // 1. Buscar conversas em lote limitado (não buscar tudo de uma vez!)
    const allConversations = await db
      .select({
        contactNumber: conversations.contactNumber,
        contactName: conversations.contactName,
      })
      .from(conversations)
      .where(and(
        eq(conversations.connectionId, connectionId),
        isNotNull(conversations.contactNumber),
        sql`${conversations.contactNumber} NOT LIKE '%@lid%'`,
        sql`${conversations.contactNumber} NOT LIKE '%@g.us%'`  // Ignorar grupos
      ))
      .orderBy(desc(conversations.lastMessageTime))
      .limit(CONFIG.MAX_CONTACTS_PER_SYNC);  // LIMITA!
    
    console.log(`[SYNC] Encontradas ${allConversations.length} conversas (limite: ${CONFIG.MAX_CONTACTS_PER_SYNC})`);
    
    if (allConversations.length === 0) {
      syncStatusMap.set(userId, {
        ...status,
        status: 'completed',
        progress: 100,
        totalContacts: 0,
        processedContacts: 0,
        lastSyncAt: new Date(),
      });
      return;
    }
    
    // Extrair contatos únicos
    const uniqueContacts = new Map<string, string>();
    for (const conv of allConversations) {
      if (!conv.contactNumber) continue;
      
      const phone = conv.contactNumber
        .replace('@s.whatsapp.net', '')
        .replace('@c.us', '')
        .trim();
      
      if (!phone || phone.includes('@') || phone.length < 8) continue;
      
      if (!uniqueContacts.has(phone)) {
        uniqueContacts.set(phone, conv.contactName || '');
      }
    }
    
    const contactsArray = Array.from(uniqueContacts.entries()).map(([phone, name]) => ({ phone, name }));
    console.log(`[SYNC] ${contactsArray.length} contatos únicos para processar`);
    
    // Atualizar total
    status.totalContacts = contactsArray.length;
    syncStatusMap.set(userId, { ...status });
    
    // 2. Processar em lotes MUITO pequenos com delay GRANDE
    for (let i = 0; i < contactsArray.length; i += CONFIG.BATCH_SIZE) {
      const batch = contactsArray.slice(i, i + CONFIG.BATCH_SIZE);
      
      // Processar cada contato do lote
      for (const contact of batch) {
        const cacheKey = `${connectionId}:${contact.phone}`;
        const cached = contactExistsCache.get(cacheKey);
        
        // Se está no cache e existe, pula
        if (cached && cached.exists && Date.now() - cached.timestamp < CONFIG.CACHE_TTL_MS) {
          continue;
        }
        
        try {
          // Verificar se já existe (query leve)
          const existing = await db
            .select({ id: whatsappContacts.id })
            .from(whatsappContacts)
            .where(and(
              eq(whatsappContacts.connectionId, connectionId),
              eq(whatsappContacts.phoneNumber, contact.phone)
            ))
            .limit(1);
          
          if (existing.length === 0) {
            // Inserir novo contato
            await db.insert(whatsappContacts).values({
              connectionId,
              contactId: `${contact.phone}@s.whatsapp.net`,
              phoneNumber: contact.phone,
              name: contact.name || null,
              lastSyncedAt: new Date(),
            });
            contactExistsCache.set(cacheKey, { exists: true, timestamp: Date.now() });
          } else {
            // Já existe - cachear
            contactExistsCache.set(cacheKey, { exists: true, timestamp: Date.now() });
          }
        } catch (err) {
          // Ignora erros individuais, continua
          console.error(`[SYNC] Erro ao processar ${contact.phone}:`, err);
        }
      }
      
      // Atualizar progresso
      status.processedContacts = Math.min(i + CONFIG.BATCH_SIZE, contactsArray.length);
      status.progress = Math.round((status.processedContacts / contactsArray.length) * 100);
      syncStatusMap.set(userId, { ...status });
      
      // Log a cada 20%
      if (status.progress % 20 === 0) {
        console.log(`[SYNC] Progresso: ${status.progress}%`);
      }
      
      // Delay GRANDE entre lotes para não sobrecarregar Supabase
      if (i + CONFIG.BATCH_SIZE < contactsArray.length) {
        await sleep(CONFIG.DELAY_BETWEEN_BATCHES);
      }
    }
    
    // 3. Marcar como concluído
    syncStatusMap.set(userId, {
      ...status,
      status: 'completed',
      progress: 100,
      processedContacts: contactsArray.length,
      lastSyncAt: new Date(),
    });
    
    console.log(`[SYNC] ✅ Concluído! ${contactsArray.length} contatos.`);
    
  } catch (error) {
    console.error(`[SYNC] ❌ Erro:`, error);
    syncStatusMap.set(userId, {
      ...status,
      status: 'error',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
}

/**
 * Busca contatos sincronizados do banco de dados
 * RÁPIDO: Direto do banco, sem processar nada
 * 
 * FIX 2025: Agora busca TODOS os contatos e extrai número do contact_id
 * quando phone_number não está preenchido (ex: "553199999999@s.whatsapp.net")
 */
export async function getSyncedContactsFromDB(connectionId: string): Promise<{
  contacts: Array<{
    id: string;
    name: string;
    phone: string;
    pushName?: string;
    hasResponded: boolean;
    conversationCount?: number;
    isGroup: boolean;
    lastSeen?: Date;
  }>;
  total: number;
}> {
  try {
    // Query otimizada - busca TODOS os contatos (não apenas com phone_number)
    // O número pode ser extraído do contact_id no formato "numero@s.whatsapp.net"
    const dbContacts = await db
      .select({
        id: whatsappContacts.id,
        contactId: whatsappContacts.contactId,
        phoneNumber: whatsappContacts.phoneNumber,
        name: whatsappContacts.name,
        lastSyncedAt: whatsappContacts.lastSyncedAt,
      })
      .from(whatsappContacts)
      .where(and(
        eq(whatsappContacts.connectionId, connectionId),
        // Não filtrar por phone_number! Vamos extrair do contact_id
        // Apenas ignorar grupos (@g.us) e contatos inválidos
        sql`${whatsappContacts.contactId} NOT LIKE '%@g.us%'`,
        sql`${whatsappContacts.contactId} LIKE '%@s.whatsapp.net' OR ${whatsappContacts.contactId} LIKE '%@c.us'`
      ))
      .orderBy(desc(whatsappContacts.lastSyncedAt))
      .limit(50000);  // Limite alto - frontend vai paginar
    
    // Extrair número do contact_id quando phone_number é nulo
    const contacts = dbContacts.map(c => {
      // Tentar usar phoneNumber, se não tiver, extrair do contactId
      let phone = c.phoneNumber || '';
      
      if (!phone && c.contactId) {
        // Extrair número do formato "553199999999@s.whatsapp.net" ou "553199999999@c.us"
        const match = c.contactId.match(/^(\d+)@/);
        if (match) {
          phone = match[1];
        }
      }
      
      // Pular contatos sem número válido
      if (!phone || phone.length < 8) {
        return null;
      }
      
      return {
        id: c.id,
        name: c.name || '',
        phone,
        pushName: c.name || undefined,
        hasResponded: true,
        conversationCount: 1,
        isGroup: false,
        lastSeen: c.lastSyncedAt || undefined,
      };
    }).filter(Boolean) as Array<{
      id: string;
      name: string;
      phone: string;
      pushName?: string;
      hasResponded: boolean;
      conversationCount?: number;
      isGroup: boolean;
      lastSeen?: Date;
    }>;
    
    console.log(`[SYNC] Retornando ${contacts.length} contatos válidos de ${dbContacts.length} total`);
    return { contacts, total: contacts.length };
    
  } catch (error) {
    console.error('[SYNC] Erro ao buscar contatos:', error);
    return { contacts: [], total: 0 };
  }
}

/**
 * Verifica se a sincronização inicial já foi feita
 */
export async function hasSyncedBefore(connectionId: string): Promise<boolean> {
  try {
    const result = await db
      .select({ id: whatsappContacts.id })
      .from(whatsappContacts)
      .where(eq(whatsappContacts.connectionId, connectionId))
      .limit(1);
    
    return result.length > 0;
  } catch {
    return false;
  }
}

// Helper
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  getSyncStatus,
  startBackgroundSync,
  getSyncedContactsFromDB,
  hasSyncedBefore,
};
