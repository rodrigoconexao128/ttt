/**
 * Módulo de Integração de Agendamento com IA
 * 
 * Este módulo permite que o agente de IA:
 * 1. Detecte intenções de agendamento nas mensagens dos clientes
 * 2. Verifique horários disponíveis automaticamente
 * 3. Crie agendamentos pendentes para confirmação
 * 4. Responda sobre disponibilidade de forma inteligente
 * 
 * OTIMIZAÇÕES:
 * - Cache em memória para configurações (reduz queries ao Supabase)
 * - Verificação de is_enabled ANTES de queries pesadas
 * - TTL de 5 minutos para cache de config
 */

import { supabase } from "./supabaseAuth";

// ========== CACHE SYSTEM ==========
// Cache em memória para reduzir Disk IO e Egress do Supabase
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const schedulingConfigCache = new Map<string, CacheEntry<SchedulingConfig | null>>();

/**
 * Limpa cache expirado periodicamente
 */
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, entry] of schedulingConfigCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      schedulingConfigCache.delete(key);
    }
  }
}

// Limpar cache a cada 10 minutos
setInterval(cleanExpiredCache, 10 * 60 * 1000);

/**
 * Invalida o cache de um usuário específico
 * Chamar quando a configuração for alterada
 */
export function invalidateSchedulingCache(userId: string): void {
  schedulingConfigCache.delete(userId);
  console.log(`🗑️ [Scheduling] Cache invalidado para user ${userId}`);
}

/**
 * Verifica RAPIDAMENTE se o agendamento está habilitado (usa cache)
 * Esta função evita queries desnecessárias ao Supabase
 */
export async function isSchedulingEnabled(userId: string): Promise<boolean> {
  const config = await getSchedulingConfigCached(userId);
  return config?.is_enabled === true;
}

export interface SchedulingConfig {
  id: string;
  user_id: string;
  is_enabled: boolean;
  service_name: string;
  service_duration: number;
  location: string;
  location_type: string;
  available_days: number[];
  work_start_time: string;
  work_end_time: string;
  break_start_time: string;
  break_end_time: string;
  has_break: boolean;
  slot_duration: number;
  buffer_between_appointments: number;
  max_appointments_per_day: number;
  advance_booking_days: number;
  min_booking_notice_hours: number;
  require_confirmation: boolean;
  auto_confirm: boolean;
  allow_cancellation: boolean;
  send_reminder: boolean;
  reminder_hours_before: number;
  google_calendar_enabled: boolean;
  confirmation_message: string;
  reminder_message: string;
  cancellation_message: string;
}

export interface Appointment {
  id: string;
  user_id: string;
  client_name: string;
  client_phone: string;
  client_email?: string;
  service_name: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  location?: string;
  location_type: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  confirmed_by_client: boolean;
  confirmed_by_business: boolean;
  created_by_ai: boolean;
  client_notes?: string;
  internal_notes?: string;
  google_calendar_event_id?: string;
  reminder_sent: boolean;
}

export interface SchedulingException {
  id: string;
  user_id: string;
  exception_date: string;
  exception_type: 'blocked' | 'modified_hours' | 'holiday';
  custom_start_time?: string;
  custom_end_time?: string;
  reason?: string;
}

export interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}

export interface SchedulingIntent {
  detected: boolean;
  type: 'check_availability' | 'book_appointment' | 'cancel_appointment' | 'reschedule' | 'info' | null;
  requestedDate?: string;
  requestedTime?: string;
  confidence: number;
}

// Padrões de detecção de intenção de agendamento
const SCHEDULING_PATTERNS = {
  check_availability: [
    /tem hor[aá]rio/i,
    /hor[aá]rio dispon[ií]vel/i,
    /quando (pode|posso|consigo)/i,
    /qual hor[aá]rio/i,
    /tem vaga/i,
    /est[aá] dispon[ií]vel/i,
    /podemos marcar/i,
    /posso agendar/i,
    /agenda livre/i,
    /disponibilidade/i,
  ],
  // IMPORTANTE: reschedule deve vir ANTES de book_appointment para priorizar "reagendar"
  reschedule: [
    /remarcar/i,
    /reagendar/i,
    /trocar o hor[aá]rio/i,
    /mudar o hor[aá]rio/i,
    /alterar (o )?(meu )?agendamento/i,
    /outro hor[aá]rio/i,
  ],
  cancel_appointment: [
    /cancelar/i,
    /desmarcar/i,
    /n[aã]o vou (poder )?(ir|comparecer)/i,
    /n[aã]o posso (ir|comparecer)/i,
    /preciso cancelar/i,
  ],
  book_appointment: [
    /quero agendar/i,
    /quero marcar/i,
    /vou agendar/i,
    /pode agendar/i,
    /pode marcar/i,
    /reservar hor[aá]rio/i,
    /marcar um hor[aá]rio/i,
    /agendar para/i,
    /confirma o hor[aá]rio/i,
    /esse hor[aá]rio/i,
    /pode ser [àa]s/i,
  ],
  info: [
    /onde (fica|é|[eé] o endereço)/i,
    /qual o endereço/i,
    /como funciona/i,
    /quanto tempo (dura|demora)/i,
    /quanto custa/i,
    /pre[çc]o/i,
    /valor/i,
  ],
};

// Padrões para extrair data/hora
const DATE_PATTERNS = {
  today: /hoje/i,
  tomorrow: /amanh[ãa]/i,
  dayAfterTomorrow: /depois de amanh[ãa]/i,
  weekday: /(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)/i,
  specificDate: /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/,
  nextWeek: /semana que vem|pr[óo]xima semana/i,
};

const TIME_PATTERNS = {
  // Captura: 14:00, 14h, 14h30, 14:30, 14 horas
  specific: /(\d{1,2})(?:(?:h|:)(\d{2})|(:(\d{2}))|h)?\s*(hrs?|horas?)?/i,
  // Formato alternativo: 14h30 (sem : )
  withH: /(\d{1,2})h(\d{2})/i,
  morning: /manh[ãa]|de manh[ãa]/i,
  afternoon: /tarde|de tarde/i,
  evening: /noite|de noite/i,
};

/**
 * Detecta se uma mensagem contém intenção de agendamento
 */
export function detectSchedulingIntent(message: string): SchedulingIntent {
  const result: SchedulingIntent = {
    detected: false,
    type: null,
    confidence: 0,
  };
  
  const normalizedMsg = message.toLowerCase().trim();
  
  // Ordem específica para priorizar reschedule sobre book_appointment
  const orderedIntents: (keyof typeof SCHEDULING_PATTERNS)[] = [
    'check_availability',
    'reschedule', 
    'cancel_appointment',
    'book_appointment',
    'info'
  ];
  
  for (const intentType of orderedIntents) {
    const patterns = SCHEDULING_PATTERNS[intentType];
    for (const pattern of patterns) {
      if (pattern.test(normalizedMsg)) {
        result.detected = true;
        result.type = intentType as SchedulingIntent['type'];
        result.confidence = 0.8; // Base confidence
        break;
      }
    }
    if (result.detected) break;
  }
  
  // Se não detectou intenção específica, verificar menção genérica
  if (!result.detected) {
    const genericPatterns = [
      /agend/i, /marc/i, /hor[áa]rio/i, /consulta/i, /atendimento/i
    ];
    for (const pattern of genericPatterns) {
      if (pattern.test(normalizedMsg)) {
        result.detected = true;
        result.type = 'info';
        result.confidence = 0.5;
        break;
      }
    }
  }
  
  // Extrair data se possível
  if (result.detected) {
    result.requestedDate = extractDate(normalizedMsg);
    result.requestedTime = extractTime(normalizedMsg);
    
    // Aumentar confiança se tiver data/hora específica
    if (result.requestedDate) result.confidence += 0.1;
    if (result.requestedTime) result.confidence += 0.1;
  }
  
  return result;
}

/**
 * Extrai uma data da mensagem
 * IMPORTANTE: Verificar "depois de amanhã" ANTES de "amanhã" para evitar match parcial
 */
function extractDate(message: string): string | undefined {
  const brazil = getBrazilDateTime();
  const today = brazil.date;
  
  // PRIMEIRO verificar "depois de amanhã" (mais específico)
  if (DATE_PATTERNS.dayAfterTomorrow.test(message)) {
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);
    return formatDate(dayAfter);
  }
  
  // DEPOIS verificar "amanhã"
  if (DATE_PATTERNS.tomorrow.test(message)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(tomorrow);
  }
  
  if (DATE_PATTERNS.today.test(message)) {
    return formatDate(today);
  }
  
  const weekdayMatch = message.match(DATE_PATTERNS.weekday);
  if (weekdayMatch) {
    const weekdays: { [key: string]: number } = {
      'domingo': 0, 'segunda': 1, 'terca': 2, 'terça': 2,
      'quarta': 3, 'quinta': 4, 'sexta': 5, 'sabado': 6, 'sábado': 6
    };
    const targetDay = weekdays[weekdayMatch[1].toLowerCase()];
    if (targetDay !== undefined) {
      const brazil = getBrazilDateTime();
      const date = new Date(brazil.date);
      const currentDay = date.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7;
      date.setDate(date.getDate() + daysToAdd);
      return formatDate(date);
    }
  }
  
  const specificMatch = message.match(DATE_PATTERNS.specificDate);
  if (specificMatch) {
    const brazil = getBrazilDateTime();
    const day = parseInt(specificMatch[1]);
    const month = parseInt(specificMatch[2]) - 1;
    const year = specificMatch[3] ? parseInt(specificMatch[3]) : brazil.date.getFullYear();
    const fullYear = year < 100 ? 2000 + year : year;
    return formatDate(new Date(fullYear, month, day));
  }
  
  if (DATE_PATTERNS.nextWeek.test(message)) {
    const brazil = getBrazilDateTime();
    const nextWeek = new Date(brazil.date);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return formatDate(nextWeek);
  }
  
  return undefined;
}

/**
 * Extrai uma hora da mensagem
 * Suporta: 14:00, 14h, 14h30, 14:30, 14 horas, manhã, tarde, noite
 */
function extractTime(message: string): string | undefined {
  // Primeiro tentar formato XhYY (ex: 14h30, 10h45)
  const withHMatch = message.match(TIME_PATTERNS.withH);
  if (withHMatch) {
    const hour = parseInt(withHMatch[1]);
    const minutes = parseInt(withHMatch[2]);
    if (hour >= 0 && hour <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }
  
  // Depois tentar formato geral (14:00, 14h, 14 horas)
  const timeMatch = message.match(TIME_PATTERNS.specific);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1]);
    // Capturar minutos de diferentes grupos
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : (timeMatch[4] ? parseInt(timeMatch[4]) : 0);
    if (hour >= 0 && hour <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }
  
  // Horários aproximados
  if (TIME_PATTERNS.morning.test(message)) {
    return '09:00'; // Padrão para manhã
  }
  if (TIME_PATTERNS.afternoon.test(message)) {
    return '14:00'; // Padrão para tarde
  }
  if (TIME_PATTERNS.evening.test(message)) {
    return '19:00'; // Padrão para noite
  }
  
  return undefined;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

/**
 * Busca a configuração de agendamento do usuário COM CACHE
 * Reduz Disk IO e Egress do Supabase
 */
export async function getSchedulingConfigCached(userId: string): Promise<SchedulingConfig | null> {
  // Verificar cache primeiro
  const cached = schedulingConfigCache.get(userId);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }
  
  // Cache miss ou expirado - buscar do banco
  try {
    const { data, error } = await supabase
      .from('scheduling_config')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    const config = (error || !data) ? null : data as SchedulingConfig;
    
    // Salvar no cache
    schedulingConfigCache.set(userId, {
      data: config,
      timestamp: Date.now()
    });
    
    return config;
  } catch (error) {
    console.error('[Scheduling] Error fetching config:', error);
    return null;
  }
}

/**
 * Busca a configuração de agendamento do usuário (sem cache - para compatibilidade)
 * @deprecated Use getSchedulingConfigCached para melhor performance
 */
export async function getSchedulingConfig(userId: string): Promise<SchedulingConfig | null> {
  return getSchedulingConfigCached(userId);
}

/**
 * Busca exceções de agendamento para uma data
 */
export async function getExceptionForDate(userId: string, date: string): Promise<SchedulingException | null> {
  try {
    const { data, error } = await supabase
      .from('scheduling_exceptions')
      .select('*')
      .eq('user_id', userId)
      .eq('exception_date', date)
      .single();
    
    if (error || !data) return null;
    return data as SchedulingException;
  } catch (error) {
    console.error('[Scheduling] Error fetching exception:', error);
    return null;
  }
}

/**
 * Busca agendamentos existentes para uma data
 */
export async function getAppointmentsForDate(userId: string, date: string): Promise<Appointment[]> {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('user_id', userId)
      .eq('appointment_date', date)
      .in('status', ['pending', 'confirmed'])
      .order('start_time', { ascending: true });
    
    if (error) {
      console.error('[Scheduling] Error fetching appointments:', error);
      return [];
    }
    
    return (data || []) as Appointment[];
  } catch (error) {
    console.error('[Scheduling] Error fetching appointments:', error);
    return [];
  }
}

/**
 * Verifica se um dia específico está disponível para agendamento
 */
export function isDayAvailable(date: string, config: SchedulingConfig, exception?: SchedulingException | null): boolean {
  const dateObj = new Date(date + 'T12:00:00');
  const dayOfWeek = dateObj.getDay();
  
  // Verificar se é um dia de exceção bloqueado
  if (exception && (exception.exception_type === 'blocked' || exception.exception_type === 'holiday')) {
    return false;
  }
  
  // Verificar se o dia da semana está nos dias disponíveis
  if (!config.available_days.includes(dayOfWeek)) {
    return false;
  }
  
  // Verificar se é futuro (não permitir agendamentos no passado) - usando timezone de São Paulo
  const brazil = getBrazilDateTime();
  const todayBrazil = new Date(brazil.dateStr + 'T00:00:00');
  const targetDate = new Date(date + 'T00:00:00');
  if (targetDate < todayBrazil) {
    return false;
  }
  
  // Verificar limite de antecedência
  const maxDate = new Date(todayBrazil);
  maxDate.setDate(maxDate.getDate() + config.advance_booking_days);
  if (targetDate > maxDate) {
    return false;
  }
  
  return true;
}

/**
 * Gera os slots de horário disponíveis para uma data
 * @param userId - ID do usuário
 * @param date - Data no formato YYYY-MM-DD
 * @param providedConfig - Config já buscada (opcional, evita query duplicada)
 */
export async function getAvailableSlots(
  userId: string, 
  date: string,
  providedConfig?: SchedulingConfig | null
): Promise<TimeSlot[]> {
  // Usar config fornecida ou buscar do cache
  const config = providedConfig ?? await getSchedulingConfigCached(userId);
  console.log(`📅 [getAvailableSlots] Config para ${userId}:`, {
    is_enabled: config?.is_enabled,
    work_start_time: config?.work_start_time,
    work_end_time: config?.work_end_time,
    available_days: config?.available_days,
    slot_duration: config?.slot_duration,
    has_break: config?.has_break,
    break_start: config?.break_start_time,
    break_end: config?.break_end_time
  });
  
  if (!config || !config.is_enabled) {
    console.log(`📅 [getAvailableSlots] ❌ Config não habilitada ou não encontrada`);
    return [];
  }
  
  const exception = await getExceptionForDate(userId, date);
  if (!isDayAvailable(date, config, exception)) {
    return [];
  }
  
  const existingAppointments = await getAppointmentsForDate(userId, date);
  
  // Determinar horários de início e fim (considerar exceção com horário modificado)
  let startTime = config.work_start_time;
  let endTime = config.work_end_time;
  
  if (exception?.exception_type === 'modified_hours') {
    startTime = exception.custom_start_time || startTime;
    endTime = exception.custom_end_time || endTime;
  }
  
  const slots: TimeSlot[] = [];
  const slotDuration = config.slot_duration;
  const buffer = config.buffer_between_appointments;
  
  // Converter horários para minutos
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  // IMPORTANTE: Se end_time é 00:00 (meia-noite), tratar como 24:00 (1440 minutos)
  // Isso permite horários até meia-noite, ex: 09:00-00:00
  let endMinutes = endH * 60 + endM;
  if (endMinutes === 0 || (endMinutes > 0 && endMinutes <= startMinutes)) {
    // Se end_time é 00:00 ou menor/igual ao start (ex: trabalhar até meia-noite)
    endMinutes = 24 * 60; // 1440 = meia-noite
  }
  
  // Horário de pausa (almoço)
  let breakStartMinutes = 0;
  let breakEndMinutes = 0;
  if (config.has_break && config.break_start_time && config.break_end_time) {
    const [bsH, bsM] = config.break_start_time.split(':').map(Number);
    const [beH, beM] = config.break_end_time.split(':').map(Number);
    breakStartMinutes = bsH * 60 + bsM;
    breakEndMinutes = beH * 60 + beM;
  }
  
  // Verificar horário mínimo de antecedência (usando timezone de São Paulo)
  const brazil = getBrazilDateTime();
  const today = brazil.dateStr;
  let minSlotMinutes = 0;
  
  if (date === today) {
    const currentMinutes = brazil.date.getHours() * 60 + brazil.date.getMinutes();
    minSlotMinutes = currentMinutes + (config.min_booking_notice_hours * 60);
  }
  
  // Gerar slots
  let currentMinutes = startMinutes;
  let appointmentCount = existingAppointments.length;
  
  while (currentMinutes + slotDuration <= endMinutes) {
    const slotEndMinutes = currentMinutes + slotDuration;
    
    // Verificar se está dentro do horário de pausa
    const isInBreak = config.has_break && 
      currentMinutes < breakEndMinutes && 
      slotEndMinutes > breakStartMinutes;
    
    // Verificar se respeita antecedência mínima
    const respectsMinNotice = currentMinutes >= minSlotMinutes;
    
    // Verificar se já atingiu limite diário
    const underDailyLimit = appointmentCount < config.max_appointments_per_day;
    
    // Verificar conflito com agendamentos existentes
    const slotStartStr = minutesToTime(currentMinutes);
    const slotEndStr = minutesToTime(slotEndMinutes);
    
    const hasConflict = existingAppointments.some(apt => {
      const aptStart = timeToMinutes(apt.start_time);
      const aptEnd = timeToMinutes(apt.end_time);
      return currentMinutes < aptEnd && slotEndMinutes > aptStart;
    });
    
    const available = !isInBreak && !hasConflict && respectsMinNotice && underDailyLimit;
    
    slots.push({
      start: slotStartStr,
      end: slotEndStr,
      available
    });
    
    currentMinutes += slotDuration + buffer;
  }
  
  const availableSlots = slots.filter(s => s.available);
  console.log(`📅 [getAvailableSlots] ${date}: Gerados ${slots.length} slots, ${availableSlots.length} disponíveis`);
  console.log(`📅 [getAvailableSlots] Slots disponíveis:`, availableSlots.map(s => s.start).slice(0, 10), availableSlots.length > 10 ? '...' : '');
  
  return slots;
}

/**
 * Cria um agendamento pendente (para confirmação)
 * @param providedConfig - Config já buscada (opcional, evita query duplicada)
 */
export async function createPendingAppointment(
  userId: string,
  clientName: string,
  clientPhone: string,
  appointmentDate: string,
  startTime: string,
  clientNotes?: string,
  providedConfig?: SchedulingConfig | null,
  serviceName?: string
): Promise<{ success: boolean; appointment?: Appointment; error?: string; adjustedTime?: string }> {
  // Usar config fornecida ou buscar do cache
  const config = providedConfig ?? await getSchedulingConfigCached(userId);
  if (!config || !config.is_enabled) {
    return { success: false, error: 'Sistema de agendamento desativado' };
  }
  
  // Verificar disponibilidade (passar config para evitar query duplicada)
  const slots = await getAvailableSlots(userId, appointmentDate, config);
  
  // Tentar encontrar slot exato primeiro
  let selectedSlot = slots.find(s => s.start === startTime && s.available);
  let adjustedTime: string | undefined;
  
  // Se não encontrou slot exato, procurar o mais próximo disponível
  if (!selectedSlot) {
    const requestedMinutes = timeToMinutes(startTime);
    const availableSlots = slots.filter(s => s.available);
    
    if (availableSlots.length > 0) {
      // Encontrar slot mais próximo (dentro de 30 minutos de tolerância)
      const TOLERANCE_MINUTES = 30;
      let closestSlot: TimeSlot | null = null;
      let minDiff = Infinity;
      
      for (const slot of availableSlots) {
        const slotMinutes = timeToMinutes(slot.start);
        const diff = Math.abs(slotMinutes - requestedMinutes);
        
        if (diff <= TOLERANCE_MINUTES && diff < minDiff) {
          minDiff = diff;
          closestSlot = slot;
        }
      }
      
      if (closestSlot) {
        selectedSlot = closestSlot;
        adjustedTime = closestSlot.start;
        console.log(`📅 [Scheduling] Horário ${startTime} não disponível, ajustado para ${adjustedTime} (diferença: ${minDiff}min)`);
      }
    }
  }
  
  if (!selectedSlot) {
    // Log para debug: mostrar quais slots existem
    const availableSlots = slots.filter(s => s.available).map(s => s.start).join(', ');
    console.log(`📅 [Scheduling] Slot ${startTime} não encontrado. Slots disponíveis: ${availableSlots || 'nenhum'}`);
    return { success: false, error: 'Horário não disponível' };
  }
  
  // Usar o horário do slot selecionado (pode ser ajustado)
  const finalStartTime = selectedSlot.start;
  
  // Calcular horário de término
  const startMinutes = timeToMinutes(finalStartTime);
  const endMinutes = startMinutes + config.slot_duration;
  const endTime = minutesToTime(endMinutes);
  
  // Criar o agendamento
  const status = config.auto_confirm ? 'confirmed' : 'pending';
  
  try {
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        user_id: userId,
        client_name: clientName,
        client_phone: clientPhone,
        service_name: serviceName || config.service_name,
        appointment_date: appointmentDate,
        start_time: finalStartTime,
        end_time: endTime,
        duration_minutes: config.slot_duration,
        location: config.location,
        location_type: config.location_type,
        status,
        confirmed_by_client: false,
        confirmed_by_business: config.auto_confirm,
        created_by_ai: true,
        client_notes: clientNotes,
        reminder_sent: false,
      })
      .select()
      .single();
    
    if (error) {
      console.error('[Scheduling] Error creating appointment:', error);
      return { success: false, error: 'Erro ao criar agendamento' };
    }
    
    return { success: true, appointment: data as Appointment, adjustedTime };
  } catch (error) {
    console.error('[Scheduling] Error creating appointment:', error);
    return { success: false, error: 'Erro ao criar agendamento' };
  }
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Gera o bloco de prompt para o agente de IA sobre agendamentos
 */
// Helper para obter data/hora no timezone de São Paulo
function getBrazilDateTime(): { date: Date; dateStr: string; timeStr: string } {
  const now = new Date();
  // Converte para São Paulo (UTC-3)
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dateStr = `${brazilTime.getFullYear()}-${(brazilTime.getMonth() + 1).toString().padStart(2, '0')}-${brazilTime.getDate().toString().padStart(2, '0')}`;
  const timeStr = `${String(brazilTime.getHours()).padStart(2, '0')}:${String(brazilTime.getMinutes()).padStart(2, '0')}`;
  return { date: brazilTime, dateStr, timeStr };
}

export async function generateSchedulingPromptBlock(userId: string): Promise<string> {
  // Usa cache para evitar query duplicada
  const config = await getSchedulingConfigCached(userId);
  
  if (!config || !config.is_enabled) {
    return '';
  }
  
  const daysMap: { [key: number]: string } = {
    0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta',
    4: 'Quinta', 5: 'Sexta', 6: 'Sábado'
  };
  
  const availableDaysText = config.available_days.map(d => daysMap[d]).join(', ');
  
  let breakText = '';
  if (config.has_break) {
    breakText = ` (pausa ${config.break_start_time}-${config.break_end_time})`;
  }
  
  // Data/hora no timezone de São Paulo
  const brazil = getBrazilDateTime();
  const todayStr = brazil.dateStr;
  const todayDayName = daysMap[brazil.date.getDay()];
  const currentTime = brazil.timeStr;
  
  const tomorrow = new Date(brazil.date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${(tomorrow.getMonth() + 1).toString().padStart(2, '0')}-${tomorrow.getDate().toString().padStart(2, '0')}`;
  const tomorrowDayName = daysMap[tomorrow.getDay()];
  
  // BUSCAR SLOTS REAIS DO BANCO (não apenas teóricos)
  const todaySlots = await getAvailableSlots(userId, todayStr, config);
  const tomorrowSlots = await getAvailableSlots(userId, tomorrowStr, config);
  
  const todaySlotsAvailable = todaySlots.filter(s => s.available).map(s => s.start);
  const tomorrowSlotsAvailable = tomorrowSlots.filter(s => s.available).map(s => s.start);
  
  const todayAvailable = config.available_days.includes(brazil.date.getDay());
  const tomorrowAvailable = config.available_days.includes(tomorrow.getDay());

  // Buscar exceções para hoje e amanhã
  const todayException = await getExceptionForDate(userId, todayStr);
  const tomorrowException = await getExceptionForDate(userId, tomorrowStr);

  // Construir info de disponibilidade real (considerando exceções)
  let todayInfo = '';
  if (todayException && (todayException.exception_type === 'blocked' || todayException.exception_type === 'holiday')) {
    const reason = todayException.reason || (todayException.exception_type === 'holiday' ? 'feriado' : 'dia de folga');
    todayInfo = `Hoje (${todayDayName}): NÃO ATENDEMOS (${reason})`;
  } else if (!todayAvailable) {
    todayInfo = `Hoje (${todayDayName}): não atendemos neste dia da semana`;
  } else if (todaySlotsAvailable.length === 0) {
    todayInfo = `Hoje: horários esgotados ou já passaram`;
  } else {
    todayInfo = `Hoje: ${todaySlotsAvailable.join(', ')}`;
  }
  
  let tomorrowInfo = '';
  if (tomorrowException && (tomorrowException.exception_type === 'blocked' || tomorrowException.exception_type === 'holiday')) {
    const reason = tomorrowException.reason || (tomorrowException.exception_type === 'holiday' ? 'feriado' : 'dia de folga');
    tomorrowInfo = `Amanhã (${tomorrowDayName}): NÃO ATENDEMOS (${reason})`;
  } else if (!tomorrowAvailable) {
    tomorrowInfo = `Amanhã (${tomorrowDayName}): não atendemos neste dia da semana`;
  } else if (tomorrowSlotsAvailable.length === 0) {
    tomorrowInfo = `Amanhã: lotado`;
  } else {
    tomorrowInfo = `Amanhã: ${tomorrowSlotsAvailable.join(', ')}`;
  }

  // Info sobre cancelamento
  const cancellationInfo = config.allow_cancellation 
    ? 'O cliente pode cancelar seu agendamento a qualquer momento.'
    : 'O cliente NÃO pode cancelar pelo chat. Para cancelamentos, deve entrar em contato por outro meio.';

  // Buscar serviços cadastrados (se use_services está ativo)
  let servicesText = '';
  try {
    const { data: services } = await supabase
      .from('scheduling_services')
      .select('name, description, duration_minutes, price, is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    
    if (services && services.length > 0) {
      servicesText = `\n\nSERVIÇOS DISPONÍVEIS:\n${services.map(s => {
        let line = `• ${s.name}`;
        if (s.duration_minutes) line += ` (${s.duration_minutes} min)`;
        if (s.price) line += ` - R$ ${Number(s.price).toFixed(2).replace('.', ',')}`;
        if (s.description) line += ` - ${s.description}`;
        return line;
      }).join('\n')}\nSempre pergunte qual serviço o cliente deseja ao agendar!`;
    }
  } catch (e) {
    // Ignore errors - services are optional
  }

  // Calcular horário mínimo para agendamento hoje (antecedência mínima)
  const currentMinutes = brazil.date.getHours() * 60 + brazil.date.getMinutes();
  const minBookingMinutes = currentMinutes + (config.min_booking_notice_hours * 60);
  const minBookingTime = minutesToTime(minBookingMinutes > 24*60 ? 24*60 : minBookingMinutes);
  
  // Gerar texto de antecedência mínima
  const noticeText = config.min_booking_notice_hours > 0 
    ? `\n⏰ ANTECEDÊNCIA MÍNIMA: ${config.min_booking_notice_hours}h (para hoje, só horários a partir de ${minBookingTime})`
    : '';

  return `
---
📅 RECURSO DE AGENDAMENTO ATIVO
Agora: ${todayStr} ${currentTime} | Atendimento: ${availableDaysText}, ${config.work_start_time}-${config.work_end_time}${breakText}${noticeText}
${servicesText}

HORÁRIOS DISPONÍVEIS (ATUALIZADOS EM TEMPO REAL):
• ${todayInfo}
• ${tomorrowInfo}

COMO RESPONDER QUANDO O HORÁRIO PEDIDO NÃO ESTÁ DISPONÍVEL:
- Por antecedência: "Para hoje precisamos de ${config.min_booking_notice_hours}h de antecedência. O próximo horário disponível é [horário da lista]."
- Se ocupado/lotado: "Esse horário já está reservado. Temos disponível: [horários da lista]."
- Fora do expediente: "Nosso horário é das ${config.work_start_time} às ${config.work_end_time}. Temos disponível: [horários da lista]."
- Dia de folga/feriado: Se o dia estiver marcado como "NÃO ATENDEMOS", explique o motivo entre parênteses e sugira o próximo dia com disponibilidade.
- Sempre ofereça o PRÓXIMO horário/dia disponível!

POLÍTICA DE CANCELAMENTO:
${cancellationInfo}

⚠️ REGRA CRÍTICA DE AGENDAMENTO:
PARA CADA CLIENTE diferente que quiser agendar, você DEVE usar a tag [AGENDAR:].
A tag é o que REALMENTE cria o agendamento no sistema.
Sem a tag = sem agendamento = cliente não vai receber confirmação/lembrete!

COMO USAR:
[AGENDAR: DATA=YYYY-MM-DD, HORA=HH:MM, NOME=Nome do Cliente, SERVICO=Nome do Serviço]

Exemplos:
- Hoje: DATA=${todayStr}
- Amanhã: DATA=${tomorrowStr}

FLUXO DE AGENDAMENTO:
1. Cliente pergunta horários → Diga as opções disponíveis acima
2. Cliente escolhe horário → Peça o nome e o serviço desejado
3. Tem horário, nome E serviço → USE A TAG! Ex: [AGENDAR: DATA=${tomorrowStr}, HORA=10:15, NOME=João, SERVICO=Consulta]

Depois da tag, converse naturalmente sobre o agendamento.

⚠️ REGRA CRÍTICA DE CANCELAMENTO:
Quando o cliente pedir para CANCELAR um agendamento, você DEVE usar a tag [CANCELAR:].
Sem a tag = o agendamento NÃO será realmente cancelado no sistema!

COMO USAR:
[CANCELAR: DATA=YYYY-MM-DD, HORA=HH:MM, NOME=Nome do Cliente]

FLUXO DE CANCELAMENTO:
1. Cliente pede para cancelar → Confirme os dados do agendamento
2. Após confirmação → USE A TAG! Ex: [CANCELAR: DATA=${tomorrowStr}, HORA=10:15, NOME=João]
3. Após a tag, ofereça remarcar para outro horário disponível.
---
`;
}

/**
 * Processa tags de agendamento na resposta da IA
 */
export async function processSchedulingTags(
  responseText: string,
  userId: string,
  clientPhone: string
): Promise<{ text: string; appointmentCreated?: Appointment }> {
  const schedulingTagRegex = /\[AGENDAR:\s*DATA=(\d{4}-\d{2}-\d{2}),\s*HORA=(\d{2}:\d{2}),\s*NOME=([^,\]]+)(?:,\s*SERVICO=([^\]]+))?\]/gi;
  
  let match = schedulingTagRegex.exec(responseText);
  let modifiedText = responseText;
  let appointmentCreated: Appointment | undefined;
  
  // Buscar configuração de agendamento para saber se precisa confirmação
  let schedulingConfig: SchedulingConfig | null = null;
  try {
    schedulingConfig = await getSchedulingConfigCached(userId);
  } catch (e) {
    console.error('📅 [Scheduling] Error fetching config:', e);
  }
  
  while (match) {
    const [fullMatch, date, time, clientName, serviceName] = match;
    
    console.log(`📅 [Scheduling] Detected scheduling tag: ${fullMatch}`);
    
    const result = await createPendingAppointment(
      userId,
      clientName.trim(),
      clientPhone,
      date,
      time,
      undefined,
      schedulingConfig,
      serviceName?.trim()
    );
    
    if (result.success && result.appointment) {
      console.log(`✅ [Scheduling] Appointment created: ${result.appointment.id}`);
      appointmentCreated = result.appointment;
      
      // ABORDAGEM: Agendamento Invisível
      // A IA já escreveu a confirmação naturalmente, apenas removemos a tag
      // e adicionamos um ✅ discreto no final (se a IA não tiver colocado)
      
      // Remover a tag da resposta
      modifiedText = modifiedText.replace(fullMatch, '');
      
      // Adicionar checkmark discreto apenas se a resposta não terminar com emoji de sucesso
      const trimmed = modifiedText.trim();
      if (!trimmed.endsWith('✅') && !trimmed.endsWith('📅') && !trimmed.endsWith('👍') && !trimmed.endsWith('😊')) {
        modifiedText = trimmed + ' ✅';
      }
    } else {
      console.log(`❌ [Scheduling] Failed to create appointment: ${result.error}`);
      // Apenas remover a tag sem adicionar mensagem de erro
      // Com as novas instruções, a IA só usa a tag após confirmação,
      // então se falhar é um erro técnico - a IA já informou o cliente
      modifiedText = modifiedText.replace(fullMatch, '');
      
      // Se a mensagem ficou vazia após remover a tag, adicionar fallback
      // Isso acontece quando a IA só enviou a tag sem texto natural
      if (modifiedText.trim() === '') {
        modifiedText = `Puxa, o horário ${time} não está mais disponível! 😅 Mas sem problemas, posso verificar outros horários para você. Qual horário prefere?`;
      }
    }
    
    match = schedulingTagRegex.exec(responseText);
  }
  
  return { text: modifiedText.trim(), appointmentCreated };
}

/**
 * Processa tags de cancelamento na resposta da IA
 */
export async function processSchedulingCancelTags(
  responseText: string,
  userId: string,
  clientPhone: string
): Promise<{ text: string; appointmentCancelled?: boolean }> {
  const cancelTagRegex = /\[CANCELAR:\s*DATA=(\d{4}-\d{2}-\d{2}),\s*HORA=(\d{2}:\d{2}),\s*NOME=([^\]]+)\]/gi;
  
  let match = cancelTagRegex.exec(responseText);
  let modifiedText = responseText;
  let appointmentCancelled = false;
  
  while (match) {
    const [fullMatch, date, time, clientName] = match;
    
    console.log(`📅 [Scheduling] Detected cancellation tag: ${fullMatch}`);
    
    try {
      // Find the appointment by date, time… and optionally client name/phone
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('user_id', userId)
        .eq('appointment_date', date)
        .eq('start_time', `${time}:00`)
        .in('status', ['pending', 'confirmed'])
        .limit(5);
      
      if (error) {
        console.error(`❌ [Scheduling] Error finding appointment to cancel:`, error);
        modifiedText = modifiedText.replace(fullMatch, '');
        match = cancelTagRegex.exec(responseText);
        continue;
      }
      
      // Try to match by client name or phone
      let appointmentToCancel = appointments?.find(a => 
        a.client_name?.toLowerCase().trim() === clientName.trim().toLowerCase() ||
        a.client_phone === clientPhone
      );
      
      // If no name/phone match, take the first one for that date/time
      if (!appointmentToCancel && appointments && appointments.length > 0) {
        appointmentToCancel = appointments[0];
      }
      
      if (appointmentToCancel) {
        const { error: updateError } = await supabase
          .from('appointments')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancelled_by: 'client',
            cancellation_reason: 'Cancelado pelo cliente via IA',
            updated_at: new Date().toISOString(),
          })
          .eq('id', appointmentToCancel.id);
        
        if (!updateError) {
          console.log(`✅ [Scheduling] Appointment cancelled: ${appointmentToCancel.id}`);
          appointmentCancelled = true;
          modifiedText = modifiedText.replace(fullMatch, '');
        } else {
          console.error(`❌ [Scheduling] Error cancelling appointment:`, updateError);
          modifiedText = modifiedText.replace(fullMatch, '');
        }
      } else {
        console.log(`⚠️ [Scheduling] No matching appointment found to cancel for ${date} ${time} ${clientName}`);
        modifiedText = modifiedText.replace(fullMatch, '');
      }
    } catch (err) {
      console.error(`❌ [Scheduling] Exception cancelling appointment:`, err);
      modifiedText = modifiedText.replace(fullMatch, '');
    }
    
    match = cancelTagRegex.exec(responseText);
  }
  
  return { text: modifiedText.trim(), appointmentCancelled };
}

/**
 * Busca próximos horários disponíveis para sugerir ao cliente
 */
export async function getNextAvailableSlots(
  userId: string,
  maxSlots: number = 5
): Promise<{ date: string; slots: TimeSlot[] }[]> {
  const result: { date: string; slots: TimeSlot[] }[] = [];
  const today = new Date();
  
  for (let i = 0; i < 14 && result.length < maxSlots; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = formatDate(date);
    
    const slots = await getAvailableSlots(userId, dateStr);
    const availableSlots = slots.filter(s => s.available);
    
    if (availableSlots.length > 0) {
      result.push({
        date: dateStr,
        slots: availableSlots.slice(0, 3) // Max 3 slots por dia
      });
    }
  }
  
  return result;
}

/**
 * Formata sugestões de horários disponíveis para resposta da IA
 */
export function formatAvailableSlotsForAI(
  slotsData: { date: string; slots: TimeSlot[] }[]
): string {
  if (slotsData.length === 0) {
    return 'Não há horários disponíveis nos próximos dias.';
  }
  
  const lines: string[] = ['📅 *Horários disponíveis:*'];
  
  for (const dayData of slotsData) {
    const dateObj = new Date(dayData.date + 'T12:00:00');
    const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const dayName = dayNames[dateObj.getDay()];
    const formattedDate = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
    
    const times = dayData.slots.map(s => s.start).join(', ');
    lines.push(`• *${dayName} (${formattedDate}):* ${times}`);
  }
  
  lines.push('\nQual horário fica melhor para você?');
  
  return lines.join('\n');
}
