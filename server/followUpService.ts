/**
 * 🚀 SISTEMA DE FOLLOW-UP E AGENDAMENTO INTELIGENTE
 * 
 * Gerencia:
 * - Follow-ups automáticos com escalonamento progressivo
 * - Agendamentos de contato futuro
 * - Respeita horários comerciais
 * - Reagenda automaticamente baseado em conversas
 */

import { storage } from "./storage";

// ============================================================================
// CONFIGURAÇÕES DE HORÁRIO COMERCIAL
// ============================================================================

const BUSINESS_HOURS = {
  start: 8,  // 8h da manhã
  end: 21,   // 21h (9 da noite)
  workDays: [1, 2, 3, 4, 5, 6], // Segunda a Sábado (0 = domingo)
};

// Sequência de follow-ups progressivos (em minutos)
const FOLLOW_UP_SEQUENCE = [
  { delay: 10, type: 'gentle' as const, message: 'Primeira tentativa leve' },
  { delay: 60, type: 'reminder' as const, message: 'Lembrete amigável' },
  { delay: 240, type: 'value' as const, message: 'Agregar valor' }, // 4 horas
  { delay: 1440, type: 'final' as const, message: 'Última tentativa (24h)' },
];

// ============================================================================
// TIPOS
// ============================================================================

export interface FollowUp {
  id: string;
  phoneNumber: string;
  type: 'gentle' | 'reminder' | 'value' | 'final' | 'scheduled';
  scheduledAt: Date;
  originalScheduledAt?: Date; // Se foi reagendado por horário comercial
  message?: string;
  context?: string;
  attempt: number; // Qual tentativa é essa (1, 2, 3, 4)
  status: 'pending' | 'sent' | 'cancelled' | 'rescheduled';
  createdAt: Date;
}

export interface ScheduledContact {
  id: string;
  phoneNumber: string;
  scheduledDate: Date;
  reason: string;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: Date;
}

// ============================================================================
// ARMAZENAMENTO EM MEMÓRIA (migrar para DB depois)
// ============================================================================

const pendingFollowUps = new Map<string, FollowUp>();
const scheduledContacts = new Map<string, ScheduledContact[]>();
const followUpTimers = new Map<string, NodeJS.Timeout>();
const clientAttempts = new Map<string, number>(); // Rastreia quantas tentativas por cliente

// ============================================================================
// FUNÇÕES AUXILIARES DE HORÁRIO
// ============================================================================

/**
 * Verifica se está dentro do horário comercial
 */
function isBusinessHours(date: Date = new Date()): boolean {
  const hour = date.getHours();
  const day = date.getDay();
  
  const isWorkDay = BUSINESS_HOURS.workDays.includes(day);
  const isWorkHour = hour >= BUSINESS_HOURS.start && hour < BUSINESS_HOURS.end;
  
  return isWorkDay && isWorkHour;
}

/**
 * Encontra o próximo horário comercial válido
 */
function getNextBusinessHour(fromDate: Date = new Date()): Date {
  const result = new Date(fromDate);
  
  // Se já está em horário comercial, retorna o mesmo
  if (isBusinessHours(result)) {
    return result;
  }
  
  // Se é antes do horário comercial do mesmo dia
  if (result.getHours() < BUSINESS_HOURS.start && BUSINESS_HOURS.workDays.includes(result.getDay())) {
    result.setHours(BUSINESS_HOURS.start, 0, 0, 0);
    return result;
  }
  
  // Se é depois do horário comercial ou dia não útil, vai pro próximo dia útil
  result.setDate(result.getDate() + 1);
  result.setHours(BUSINESS_HOURS.start, 0, 0, 0);
  
  // Encontrar próximo dia útil
  while (!BUSINESS_HOURS.workDays.includes(result.getDay())) {
    result.setDate(result.getDate() + 1);
  }
  
  return result;
}

/**
 * Ajusta uma data para horário comercial se necessário
 */
function adjustToBusinessHours(date: Date): { date: Date; wasAdjusted: boolean } {
  if (isBusinessHours(date)) {
    return { date, wasAdjusted: false };
  }
  
  const adjustedDate = getNextBusinessHour(date);
  return { date: adjustedDate, wasAdjusted: true };
}

// ============================================================================
// FUNÇÕES DE FOLLOW-UP
// ============================================================================

/**
 * Agenda um follow-up automático inteligente
 * Respeita horário comercial e usa sequência progressiva
 */
export function scheduleAutoFollowUp(
  phoneNumber: string, 
  delayMinutes: number,
  context: string
): void {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  
  // Cancelar follow-up anterior se existir
  cancelFollowUp(cleanPhone);
  
  // Obter número de tentativas anteriores
  const attempts = clientAttempts.get(cleanPhone) || 0;
  const nextAttempt = Math.min(attempts, FOLLOW_UP_SEQUENCE.length - 1);
  const followUpConfig = FOLLOW_UP_SEQUENCE[nextAttempt];
  
  // Calcular data do follow-up
  const rawDate = new Date(Date.now() + followUpConfig.delay * 60 * 1000);
  const { date: scheduledDate, wasAdjusted } = adjustToBusinessHours(rawDate);
  
  const followUp: FollowUp = {
    id: `fu_${Date.now()}`,
    phoneNumber: cleanPhone,
    type: followUpConfig.type,
    scheduledAt: scheduledDate,
    originalScheduledAt: wasAdjusted ? rawDate : undefined,
    context,
    attempt: nextAttempt + 1,
    status: 'pending',
    createdAt: new Date(),
  };
  
  pendingFollowUps.set(cleanPhone, followUp);
  
  // Calcular delay real (considerando ajuste de horário)
  const realDelay = Math.max(0, scheduledDate.getTime() - Date.now());
  
  // Agendar timer
  const timer = setTimeout(async () => {
    await executeFollowUp(cleanPhone);
  }, realDelay);
  
  followUpTimers.set(cleanPhone, timer);
  
  const formattedTime = scheduledDate.toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  console.log(`⏰ [FOLLOW-UP] Agendado para ${cleanPhone}`);
  console.log(`   📅 Data: ${formattedTime}`);
  console.log(`   🔄 Tentativa: ${followUp.attempt}/${FOLLOW_UP_SEQUENCE.length}`);
  console.log(`   📝 Tipo: ${followUp.type}`);
  if (wasAdjusted) {
    console.log(`   ⚠️ Reagendado para horário comercial`);
  }
}

/**
 * Agenda próximo follow-up na sequência
 */
export function scheduleNextFollowUp(phoneNumber: string, context: string): void {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const attempts = clientAttempts.get(cleanPhone) || 0;
  
  // Se já esgotou todas as tentativas, não agendar mais
  if (attempts >= FOLLOW_UP_SEQUENCE.length) {
    console.log(`⚠️ [FOLLOW-UP] ${cleanPhone} - Todas as tentativas esgotadas`);
    return;
  }
  
  // Incrementar contador e agendar
  clientAttempts.set(cleanPhone, attempts + 1);
  scheduleAutoFollowUp(cleanPhone, 0, context); // delay será calculado pela sequência
}

/**
 * Reseta o contador de tentativas (quando cliente responde)
 */
export function resetFollowUpAttempts(phoneNumber: string): void {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  clientAttempts.delete(cleanPhone);
}

/**
 * Cancela follow-up pendente e reseta tentativas
 */
export function cancelFollowUp(phoneNumber: string): void {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  
  const timer = followUpTimers.get(cleanPhone);
  if (timer) {
    clearTimeout(timer);
    followUpTimers.delete(cleanPhone);
  }
  
  const followUp = pendingFollowUps.get(cleanPhone);
  if (followUp) {
    followUp.status = 'cancelled';
    pendingFollowUps.delete(cleanPhone);
    console.log(`❌ [FOLLOW-UP] Cancelado para ${cleanPhone} (cliente respondeu)`);
  }
  
  // Resetar contador de tentativas quando cliente responde
  resetFollowUpAttempts(cleanPhone);
}

/**
 * Executa o follow-up
 */
// Callback para enviar follow-up (será configurado pelo whatsapp.ts)
let onFollowUpReady: ((phoneNumber: string, context: string, attempt: number, type: string) => Promise<void>) | null = null;
let onScheduledContactReady: ((phoneNumber: string, reason: string) => Promise<void>) | null = null;

/**
 * Registra callback para envio de follow-up
 */
export function registerFollowUpCallback(
  callback: (phoneNumber: string, context: string, attempt: number, type: string) => Promise<void>
): void {
  onFollowUpReady = callback;
  console.log("📲 [FOLLOW-UP] Callback de envio registrado");
}

/**
 * Registra callback para contato agendado
 */
export function registerScheduledContactCallback(
  callback: (phoneNumber: string, reason: string) => Promise<void>
): void {
  onScheduledContactReady = callback;
  console.log("📲 [AGENDAMENTO] Callback de envio registrado");
}

async function executeFollowUp(phoneNumber: string): Promise<void> {
  const followUp = pendingFollowUps.get(phoneNumber);
  if (!followUp || followUp.status !== 'pending') return;
  
  // Verificar se está em horário comercial
  if (!isBusinessHours()) {
    const nextBusinessHour = getNextBusinessHour();
    console.log(`⏸️ [FOLLOW-UP] Fora do horário comercial. Reagendando para ${nextBusinessHour.toLocaleString('pt-BR')}`);
    
    followUp.scheduledAt = nextBusinessHour;
    followUp.status = 'rescheduled';
    
    const delay = nextBusinessHour.getTime() - Date.now();
    const timer = setTimeout(async () => {
      followUp.status = 'pending';
      await executeFollowUp(phoneNumber);
    }, delay);
    
    followUpTimers.set(phoneNumber, timer);
    return;
  }
  
  try {
    console.log(`📤 [FOLLOW-UP] Executando para ${phoneNumber} (tentativa ${followUp.attempt})...`);
    
    if (onFollowUpReady) {
      await onFollowUpReady(phoneNumber, followUp.context || '', followUp.attempt, followUp.type);
      
      followUp.status = 'sent';
      pendingFollowUps.delete(phoneNumber);
      followUpTimers.delete(phoneNumber);
      
      console.log(`✅ [FOLLOW-UP] Enviado para ${phoneNumber}`);
      
      // Se não foi a última tentativa, agendar próximo
      if (followUp.attempt < FOLLOW_UP_SEQUENCE.length) {
        scheduleNextFollowUp(phoneNumber, followUp.context || '');
      } else {
        console.log(`📴 [FOLLOW-UP] Última tentativa enviada para ${phoneNumber}`);
      }
    } else {
      console.log(`⚠️ [FOLLOW-UP] Callback não registrado para ${phoneNumber}`);
    }
  } catch (error) {
    console.error(`❌ [FOLLOW-UP] Erro ao enviar para ${phoneNumber}:`, error);
  }
}

// ============================================================================
// FUNÇÕES DE AGENDAMENTO
// ============================================================================

/**
 * Agenda um contato para data/hora específica
 */
export function scheduleContact(
  phoneNumber: string,
  date: Date,
  reason: string
): ScheduledContact {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  
  const scheduled: ScheduledContact = {
    id: `sc_${Date.now()}`,
    phoneNumber: cleanPhone,
    scheduledDate: date,
    reason,
    status: 'pending',
    createdAt: new Date(),
  };
  
  const existing = scheduledContacts.get(cleanPhone) || [];
  existing.push(scheduled);
  scheduledContacts.set(cleanPhone, existing);
  
  // Agendar timer
  const delay = date.getTime() - Date.now();
  if (delay > 0) {
    setTimeout(async () => {
      await executeScheduledContact(cleanPhone, scheduled.id);
    }, delay);
  }
  
  console.log(`📅 [AGENDAMENTO] Contato agendado para ${cleanPhone} em ${date.toLocaleString('pt-BR')}`);
  
  return scheduled;
}

/**
 * Executa contato agendado
 */
async function executeScheduledContact(phoneNumber: string, scheduleId: string): Promise<void> {
  const contacts = scheduledContacts.get(phoneNumber);
  const scheduled = contacts?.find(c => c.id === scheduleId);
  
  if (!scheduled || scheduled.status !== 'pending') return;
  
  try {
    console.log(`📤 [AGENDAMENTO] Executando contato agendado para ${phoneNumber}...`);
    
    if (onScheduledContactReady) {
      await onScheduledContactReady(phoneNumber, scheduled.reason);
      scheduled.status = 'completed';
      console.log(`✅ [AGENDAMENTO] Contato enviado para ${phoneNumber}`);
    } else {
      console.log(`⚠️ [AGENDAMENTO] Callback não registrado para ${phoneNumber}`);
    }
  } catch (error) {
    console.error(`❌ [AGENDAMENTO] Erro ao enviar para ${phoneNumber}:`, error);
  }
}

/**
 * Parseia data/hora de texto natural
 * Ex: "amanhã às 14h", "segunda-feira", "daqui 2 dias"
 */
export function parseScheduleFromText(text: string): Date | null {
  const now = new Date();
  const lowerText = text.toLowerCase();
  
  // Amanhã
  if (lowerText.includes('amanhã') || lowerText.includes('amanha')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Tentar extrair hora
    const hourMatch = text.match(/(\d{1,2})\s*(?:h|hora|:)/i);
    if (hourMatch) {
      tomorrow.setHours(parseInt(hourMatch[1]), 0, 0, 0);
    } else {
      tomorrow.setHours(10, 0, 0, 0); // Padrão: 10h
    }
    
    return tomorrow;
  }
  
  // Próxima semana / segunda / terça etc
  const weekdays = ['domingo', 'segunda', 'terça', 'terca', 'quarta', 'quinta', 'sexta', 'sábado', 'sabado'];
  for (let i = 0; i < weekdays.length; i++) {
    if (lowerText.includes(weekdays[i])) {
      const targetDay = i % 7;
      const currentDay = now.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7;
      
      const target = new Date(now);
      target.setDate(target.getDate() + daysToAdd);
      
      const hourMatch = text.match(/(\d{1,2})\s*(?:h|hora|:)/i);
      if (hourMatch) {
        target.setHours(parseInt(hourMatch[1]), 0, 0, 0);
      } else {
        target.setHours(10, 0, 0, 0);
      }
      
      return target;
    }
  }
  
  // Daqui X dias/horas
  const inXMatch = text.match(/daqui\s*(?:a\s*)?(\d+)\s*(dia|hora|minuto)/i);
  if (inXMatch) {
    const amount = parseInt(inXMatch[1]);
    const unit = inXMatch[2].toLowerCase();
    const target = new Date(now);
    
    if (unit.startsWith('dia')) {
      target.setDate(target.getDate() + amount);
      target.setHours(10, 0, 0, 0);
    } else if (unit.startsWith('hora')) {
      target.setHours(target.getHours() + amount);
    } else if (unit.startsWith('minuto')) {
      target.setMinutes(target.getMinutes() + amount);
    }
    
    return target;
  }
  
  return null;
}

// ============================================================================
// GETTERS PARA O ADMIN
// ============================================================================

export function getAllPendingFollowUps(): FollowUp[] {
  return Array.from(pendingFollowUps.values());
}

export function getAllScheduledContacts(): ScheduledContact[] {
  const all: ScheduledContact[] = [];
  scheduledContacts.forEach(contacts => all.push(...contacts));
  return all.sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
}

export function getScheduledContactsForPhone(phoneNumber: string): ScheduledContact[] {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  return scheduledContacts.get(cleanPhone) || [];
}

export function cancelScheduledContact(phoneNumber: string, scheduleId: string): boolean {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const contacts = scheduledContacts.get(cleanPhone);
  const scheduled = contacts?.find(c => c.id === scheduleId);
  
  if (scheduled && scheduled.status === 'pending') {
    scheduled.status = 'cancelled';
    return true;
  }
  return false;
}

// ============================================================================
// FUNÇÕES PARA CALENDÁRIO DO ADMIN
// ============================================================================

export interface CalendarEvent {
  id: string;
  phoneNumber: string;
  type: 'followup' | 'scheduled_contact';
  title: string;
  scheduledAt: Date;
  status: string;
  attempt?: number;
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * Retorna todos os eventos do calendário (follow-ups + agendamentos)
 */
export function getCalendarEvents(): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  
  // Adicionar follow-ups pendentes
  pendingFollowUps.forEach((followUp) => {
    events.push({
      id: followUp.id,
      phoneNumber: followUp.phoneNumber,
      type: 'followup',
      title: `Follow-up #${followUp.attempt} - ${followUp.type}`,
      scheduledAt: followUp.scheduledAt,
      status: followUp.status,
      attempt: followUp.attempt,
      metadata: {
        context: followUp.context,
        originalScheduledAt: followUp.originalScheduledAt,
      },
    });
  });
  
  // Adicionar contatos agendados
  scheduledContacts.forEach((contacts) => {
    contacts.forEach((contact) => {
      if (contact.status === 'pending') {
        events.push({
          id: contact.id,
          phoneNumber: contact.phoneNumber,
          type: 'scheduled_contact',
          title: `Contato agendado: ${contact.reason}`,
          scheduledAt: contact.scheduledDate,
          status: contact.status,
          reason: contact.reason,
        });
      }
    });
  });
  
  // Ordenar por data
  return events.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

/**
 * Retorna estatísticas de follow-up
 */
export function getFollowUpStats(): {
  pending: number;
  scheduledToday: number;
  scheduledThisWeek: number;
  byType: Record<string, number>;
} {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  const events = getCalendarEvents();
  
  const stats = {
    pending: events.filter(e => e.status === 'pending').length,
    scheduledToday: events.filter(e => 
      e.scheduledAt >= today && 
      e.scheduledAt < new Date(today.getTime() + 24 * 60 * 60 * 1000)
    ).length,
    scheduledThisWeek: events.filter(e => 
      e.scheduledAt >= today && 
      e.scheduledAt < nextWeek
    ).length,
    byType: {} as Record<string, number>,
  };
  
  events.forEach(e => {
    stats.byType[e.type] = (stats.byType[e.type] || 0) + 1;
  });
  
  return stats;
}

/**
 * Retorna configuração de horário comercial
 */
export function getBusinessHoursConfig() {
  return {
    ...BUSINESS_HOURS,
    isCurrentlyOpen: isBusinessHours(),
    nextOpenTime: isBusinessHours() ? null : getNextBusinessHour(),
  };
}
