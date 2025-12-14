/**
 * 🚀 SISTEMA DE FOLLOW-UP E AGENDAMENTO INTELIGENTE
 * 
 * Gerencia:
 * - Follow-ups automáticos após X minutos sem resposta
 * - Agendamentos de contato futuro
 * - Interpretação de datas/horários pela IA
 */

import { storage } from "./storage";

// ============================================================================
// TIPOS
// ============================================================================

export interface FollowUp {
  id: string;
  phoneNumber: string;
  type: 'auto_10min' | 'auto_1h' | 'auto_24h' | 'scheduled';
  scheduledAt: Date;
  message?: string;
  context?: string;
  status: 'pending' | 'sent' | 'cancelled';
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

// ============================================================================
// FUNÇÕES DE FOLLOW-UP
// ============================================================================

/**
 * Agenda um follow-up automático para daqui X minutos
 */
export function scheduleAutoFollowUp(
  phoneNumber: string, 
  delayMinutes: number,
  context: string
): void {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  
  // Cancelar follow-up anterior se existir
  cancelFollowUp(cleanPhone);
  
  const followUp: FollowUp = {
    id: `fu_${Date.now()}`,
    phoneNumber: cleanPhone,
    type: delayMinutes <= 10 ? 'auto_10min' : delayMinutes <= 60 ? 'auto_1h' : 'auto_24h',
    scheduledAt: new Date(Date.now() + delayMinutes * 60 * 1000),
    context,
    status: 'pending',
    createdAt: new Date(),
  };
  
  pendingFollowUps.set(cleanPhone, followUp);
  
  // Agendar timer
  const timer = setTimeout(async () => {
    await executeFollowUp(cleanPhone);
  }, delayMinutes * 60 * 1000);
  
  followUpTimers.set(cleanPhone, timer);
  
  console.log(`⏰ [FOLLOW-UP] Agendado para ${cleanPhone} em ${delayMinutes} minutos`);
}

/**
 * Cancela follow-up pendente
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
    console.log(`❌ [FOLLOW-UP] Cancelado para ${cleanPhone}`);
  }
}

/**
 * Executa o follow-up
 */
// Callback para enviar follow-up (será configurado pelo whatsapp.ts)
let onFollowUpReady: ((phoneNumber: string, context: string) => Promise<void>) | null = null;
let onScheduledContactReady: ((phoneNumber: string, reason: string) => Promise<void>) | null = null;

/**
 * Registra callback para envio de follow-up
 */
export function registerFollowUpCallback(
  callback: (phoneNumber: string, context: string) => Promise<void>
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
  
  try {
    console.log(`📤 [FOLLOW-UP] Executando para ${phoneNumber}...`);
    
    if (onFollowUpReady) {
      await onFollowUpReady(phoneNumber, followUp.context || '');
      
      followUp.status = 'sent';
      pendingFollowUps.delete(phoneNumber);
      followUpTimers.delete(phoneNumber);
      
      console.log(`✅ [FOLLOW-UP] Enviado para ${phoneNumber}`);
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
