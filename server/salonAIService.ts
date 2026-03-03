/**
 * SALON AI SERVICE v2 - SISTEMA INTELIGENTE DE AGENDAMENTO PARA SALÕES
 *
 * ARQUITETURA (IA + VALIDAÇÃO DETERMINÍSTICA):
 * 1. IA conversa livremente com o cliente (sem menus "digite 1, 2, 3")
 * 2. IA extrai campos estruturados (serviço, profissional, data, hora) via LLM
 * 3. Validação determinística: slots reais, conflitos, horário comercial
 * 4. Confirmação explícita antes de agendar
 * 5. Agendamento seguro com revalidação pré-insert
 */

import { supabase } from "./supabaseAuth";
import { chatComplete } from "./llm";
import {
  getAvailableStartTimes,
  validateSlot,
  findClosestSlot,
  checkOverlapBeforeInsert,
  findAvailableProfessional,
  computeMinNoticeMinutes,
} from "./salonAvailability";

// ═══════════════════════════════════════════════════════════════════════
// INTERFACES E TIPOS
// ═══════════════════════════════════════════════════════════════════════

export interface OpeningHoursDay {
  enabled: boolean;
  open: string;
  close: string;
}

export interface SalonConfig {
  id: string;
  user_id: string;
  is_active: boolean;
  send_to_ai: boolean;
  salon_name: string | null;
  salon_type: string;
  phone: string | null;
  address: string | null;
  opening_hours?: Record<string, OpeningHoursDay> & { __break?: { enabled: boolean; start: string; end: string } };
  slot_duration: number;
  buffer_between: number;
  max_advance_days: number;
  min_notice_hours?: number;       // LEGADO - manter compatibilidade
  min_notice_minutes?: number;     // NOVO - antecedência em minutos
  allow_cancellation: boolean;
  cancellation_notice_hours: number;
  use_services: boolean;
  use_professionals: boolean;
  allow_multiple_services: boolean;
  welcome_message?: string;
  booking_confirmation_message?: string;
  reminder_message?: string;
  cancellation_message?: string;
  closed_message?: string;
  humanize_responses?: boolean;
  use_customer_name?: boolean;
  response_variation?: boolean;
  response_delay_min?: number;
  response_delay_max?: number;
  ai_instructions?: string;
  display_instructions?: string;
}

export interface SalonService {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number | null;
  is_active: boolean;
  color: string | null;
}

export interface SalonProfessional {
  id: string;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  is_active: boolean;
  work_schedule: Record<string, any>;
}

export interface SalonData {
  config: SalonConfig;
  services: SalonService[];
  professionals: SalonProfessional[];
}

// Keep old types exported for compatibility
export type SalonIntent = 'GREETING' | 'WANT_SERVICES' | 'WANT_PROFESSIONALS' | 'WANT_TO_BOOK' | 'SELECT_SERVICE' | 'SELECT_PROFESSIONAL' | 'SELECT_DATE' | 'SELECT_TIME' | 'CONFIRM_BOOKING' | 'CANCEL_BOOKING' | 'CHECK_BOOKING' | 'ASK_BUSINESS_HOURS' | 'ASK_PRICES' | 'PROVIDE_NAME' | 'OTHER';

// ═══════════════════════════════════════════════════════════════════════
// ESTADO DO AGENDAMENTO (EM MEMÓRIA)
// ═══════════════════════════════════════════════════════════════════════

interface BookingState {
  service: SalonService | null;
  professional: SalonProfessional | null;
  date: string | null;       // YYYY-MM-DD
  time: string | null;       // HH:mm
  customerName: string | null;
  customerPhone: string;
  awaitingConfirmation: boolean;
  createdAt: Date;
  lastUpdated: Date;
}

const bookingStates = new Map<string, BookingState>();
const STATE_EXPIRY_MS = 2 * 60 * 60 * 1000;

function cleanOldStates(): void {
  const now = Date.now();
  for (const [key, state] of Array.from(bookingStates.entries())) {
    if (now - state.lastUpdated.getTime() > STATE_EXPIRY_MS) {
      bookingStates.delete(key);
    }
  }
}
setInterval(cleanOldStates, 30 * 60 * 1000);

export function getBookingState(userId: string, customerPhone: string, conversationId?: string): BookingState {
  const keyBase = customerPhone || conversationId || 'default';
  const key = `${userId}:${keyBase}`;
  let state = bookingStates.get(key);
  if (!state) {
    state = {
      service: null,
      professional: null,
      date: null,
      time: null,
      customerName: null,
      customerPhone,
      awaitingConfirmation: false,
      createdAt: new Date(),
      lastUpdated: new Date(),
    };
    bookingStates.set(key, state);
  }
  return state;
}

export function resetBookingState(userId: string, customerPhone: string, conversationId?: string): void {
  const keyBase = customerPhone || conversationId || 'default';
  const key = `${userId}:${keyBase}`;
  bookingStates.delete(key);
  console.log(`💇 [Salon] Estado resetado: ${key}`);
}

// ═══════════════════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verifica se o horário atual está dentro do intervalo de almoço configurado.
 * Retorna { isDuringBreak: true, message } se estiver em pausa.
 */
export function isCurrentlyInBreak(openingHours?: Record<string, OpeningHoursDay>): {
  isDuringBreak: boolean;
  message: string;
  breakStart: string;
  breakEnd: string;
} {
  const breakConfig = openingHours?.['__break'] as { enabled: boolean; start: string; end: string } | undefined;

  if (!breakConfig || !breakConfig.enabled) {
    return { isDuringBreak: false, message: '', breakStart: '12:00', breakEnd: '13:00' };
  }

  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentHour = brazilTime.getHours();
  const currentMinute = brazilTime.getMinutes();
  const currentMinutes = currentHour * 60 + currentMinute;

  const [bStartH, bStartM] = breakConfig.start.split(':').map(Number);
  const [bEndH, bEndM] = breakConfig.end.split(':').map(Number);
  const breakStartMin = bStartH * 60 + bStartM;
  const breakEndMin = bEndH * 60 + bEndM;

  const isDuringBreak = currentMinutes >= breakStartMin && currentMinutes < breakEndMin;
  const message = isDuringBreak
    ? `Estamos no horário de almoço (${breakConfig.start} às ${breakConfig.end}). Voltamos em breve! 🍽️`
    : '';

  return { isDuringBreak, message, breakStart: breakConfig.start, breakEnd: breakConfig.end };
}

export function isSalonOpen(openingHours?: Record<string, OpeningHoursDay>): {
  isOpen: boolean;
  isDuringBreak: boolean;
  currentDay: string;
  currentTime: string;
  message: string;
} {
  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayNamesPt: Record<string, string> = {
    sunday: 'domingo', monday: 'segunda-feira', tuesday: 'terça-feira',
    wednesday: 'quarta-feira', thursday: 'quinta-feira', friday: 'sexta-feira', saturday: 'sábado'
  };
  const currentDay = dayNames[brazilTime.getDay()];
  const currentHour = brazilTime.getHours().toString().padStart(2, '0');
  const currentMinute = brazilTime.getMinutes().toString().padStart(2, '0');
  const currentTime = `${currentHour}:${currentMinute}`;

  if (!openingHours || Object.keys(openingHours).length === 0) {
    return { isOpen: true, isDuringBreak: false, currentDay, currentTime, message: '' };
  }
  const todayHours = openingHours[currentDay];
  if (!todayHours || !todayHours.enabled) {
    return { isOpen: false, isDuringBreak: false, currentDay, currentTime, message: `Estamos fechados hoje (${dayNamesPt[currentDay]}).` };
  }
  const openTime = todayHours.open || '09:00';
  const closeTime = todayHours.close || '19:00';
  const currentMinutes = parseInt(currentHour) * 60 + parseInt(currentMinute);
  const openMinutes = parseInt(openTime.split(':')[0]) * 60 + parseInt(openTime.split(':')[1] || '0');
  const closeMinutes = parseInt(closeTime.split(':')[0]) * 60 + parseInt(closeTime.split(':')[1] || '0');
  const isOpenHours = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  if (!isOpenHours) {
    return { isOpen: false, isDuringBreak: false, currentDay, currentTime, message: `Nosso horário hoje é das ${openTime} às ${closeTime}.` };
  }
  // Verificar horário de almoço
  const breakStatus = isCurrentlyInBreak(openingHours);
  if (breakStatus.isDuringBreak) {
    return { isOpen: false, isDuringBreak: true, currentDay, currentTime, message: breakStatus.message };
  }
  return { isOpen: true, isDuringBreak: false, currentDay, currentTime, message: '' };
}

function formatSalonHours(openingHours?: Record<string, OpeningHoursDay>): string {
  if (!openingHours || Object.keys(openingHours).length === 0) return 'Horários não informados.';
  const dayNamesPt: Record<string, string> = {
    monday: 'Segunda', tuesday: 'Terça', wednesday: 'Quarta',
    thursday: 'Quinta', friday: 'Sexta', saturday: 'Sábado', sunday: 'Domingo'
  };
  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  let text = '';
  for (const day of dayOrder) {
    const dc = openingHours[day];
    if (dc && dc.enabled) text += `${dayNamesPt[day]}: ${dc.open} às ${dc.close}\n`;
  }
  return text.trim() || 'Horários não informados.';
}

function getBrazilNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

function getBrazilToday(): string {
  const d = getBrazilNow();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function formatDatePtBr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// ═══════════════════════════════════════════════════════════════════════
// BUSCAR DADOS DO SALÃO
// ═══════════════════════════════════════════════════════════════════════

export async function getSalonConfig(userId: string): Promise<SalonConfig | null> {
  try {
    const { data, error } = await supabase
      .from('salon_config').select('*').eq('user_id', userId).single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('❌ [Salon] Erro ao buscar config:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('❌ [Salon] Erro ao buscar config:', err);
    return null;
  }
}

export async function getSalonData(userId: string): Promise<SalonData | null> {
  try {
    const config = await getSalonConfig(userId);
    if (!config) return null;
    const { data: services } = await supabase
      .from('scheduling_services').select('*').eq('user_id', userId).eq('is_active', true).order('display_order');
    const { data: professionals } = await supabase
      .from('scheduling_professionals').select('*').eq('user_id', userId).eq('is_active', true).order('display_order');
    return { config, services: services || [], professionals: professionals || [] };
  } catch (err) {
    console.error('❌ [Salon] Erro ao buscar dados:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BUSCAR HORÁRIOS DISPONÍVEIS (usa novo módulo)
// ═══════════════════════════════════════════════════════════════════════

export async function getAvailableSlots(
  userId: string,
  date: string,
  professionalId?: string,
  serviceDuration?: number
): Promise<string[]> {
  try {
    const salonData = await getSalonData(userId);
    if (!salonData) return [];

    const slotDuration = serviceDuration || salonData.config.slot_duration || 30;

    return await getAvailableStartTimes({
      userId,
      date,
      professionalId,
      serviceDurationMinutes: slotDuration,
      stepMinutes: 5,
    });
  } catch (err) {
    console.error('❌ [Salon] Erro ao buscar slots:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CRIAR AGENDAMENTO SEGURO (revalida antes de inserir)
// ═══════════════════════════════════════════════════════════════════════

export async function createSalonAppointment(
  userId: string,
  conversationId: string,
  data: {
    clientName: string;
    clientPhone: string;
    serviceId?: string;
    serviceName: string;
    professionalId?: string;
    professionalName?: string;
    appointmentDate: string;
    startTime: string;
    durationMinutes: number;
  }
): Promise<{ success: boolean; appointmentId?: string; error?: string; suggestedSlots?: string[] }> {
  try {
    // Verificar se o profissional foi especificado
    let professionalId = data.professionalId;
    let professionalName = data.professionalName;

    if (!professionalId) {
      // Buscar um profissional disponível automaticamente
      const availableProfId = await findAvailableProfessional(
        userId, data.appointmentDate, data.startTime, data.durationMinutes
      );

      if (!availableProfId) {
        // Nenhum profissional disponível
        const { availableSlots } = await validateSlot(userId, data.appointmentDate, data.startTime, undefined, data.durationMinutes);
        return {
          success: false,
          error: 'Nenhum profissional disponível para este horário',
          suggestedSlots: availableSlots.slice(0, 5)
        };
      }

      // Buscar nome do profissional
      const { data: profData } = await supabase
        .from('scheduling_professionals')
        .select('name')
        .eq('id', availableProfId)
        .single();

      professionalId = availableProfId;
      professionalName = profData?.name || null;
    }

    // REVALIDAR slot antes de inserir (evita race condition)
    const { valid, availableSlots } = await validateSlot(
      userId, data.appointmentDate, data.startTime, professionalId, data.durationMinutes
    );
    if (!valid) {
      console.log(`❌ [Salon] Slot ${data.startTime} em ${data.appointmentDate} já ocupado! Sugerindo alternativas.`);
      return { success: false, error: 'Horário já ocupado', suggestedSlots: availableSlots.slice(0, 5) };
    }

    const [startH, startM] = data.startTime.split(':').map(Number);
    const endMinutes = startH * 60 + startM + data.durationMinutes;
    const endH = Math.floor(endMinutes / 60);
    const endM = endMinutes % 60;
    const endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

    // ÚLTIMA CHECAGEM DE OVERLAP antes do insert (anti-race)
    const hasOverlap = await checkOverlapBeforeInsert(
      userId, data.appointmentDate, data.startTime, endTime, professionalId || null
    );

    if (hasOverlap) {
      console.log(`❌ [Salon] Overlap detectado na checagem final! Abortando insert.`);
      return { success: false, error: 'Conflito de horário detectado', suggestedSlots: availableSlots.slice(0, 5) };
    }

    const { data: appointment, error } = await supabase
      .from('appointments')
      .insert({
        user_id: userId,
        conversation_id: conversationId || null,
        client_name: data.clientName,
        client_phone: data.clientPhone,
        service_id: data.serviceId || null,
        service_name: data.serviceName,
        professional_id: professionalId || null,
        professional_name: professionalName || null,
        appointment_date: data.appointmentDate,
        start_time: data.startTime,
        end_time: endTime,
        duration_minutes: data.durationMinutes,
        status: 'pending',
        confirmed_by_client: true,
        confirmed_by_business: false,
        created_by_ai: true,
      })
      .select().single();

    if (error) {
      console.error('❌ [Salon] Erro ao criar agendamento:', error);
      return { success: false, error: error.message };
    }
    console.log(`✅ [Salon] Agendamento criado: ${appointment.id}`);
    return { success: true, appointmentId: appointment.id };
  } catch (err) {
    console.error('❌ [Salon] Erro ao criar agendamento:', err);
    return { success: false, error: 'Erro interno' };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EXTRAÇÃO DE CAMPOS VIA IA (LLM → JSON estruturado)
// ═══════════════════════════════════════════════════════════════════════

interface ExtractedFields {
  intent: 'greeting' | 'booking' | 'check_availability' | 'info_services' | 'info_hours' | 'info_prices' | 'confirm' | 'cancel' | 'check_booking' | 'general';
  service?: string;
  professional?: string;
  date?: string;
  time?: string;
  customerName?: string;
}

async function extractSalonFieldsLLM(
  message: string,
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
  salonData: SalonData,
  bookingState: BookingState
): Promise<ExtractedFields> {
  const now = getBrazilNow();
  const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const todayStr = dayNames[now.getDay()];
  const todayDate = getBrazilToday();

  const servicesList = salonData.services.map(s => s.name).join(', ');
  const profList = salonData.professionals.map(p => p.name).join(', ');

  const stateInfo = [
    bookingState.service ? `Serviço já escolhido: ${bookingState.service.name}` : '',
    bookingState.professional ? `Profissional já escolhido: ${bookingState.professional.name}` : '',
    bookingState.date ? `Data já escolhida: ${bookingState.date}` : '',
    bookingState.time ? `Horário já escolhido: ${bookingState.time}` : '',
    bookingState.awaitingConfirmation ? 'AGUARDANDO CONFIRMAÇÃO DO CLIENTE' : '',
  ].filter(Boolean).join('\n');

  const recentHistory = conversationHistory.slice(-6)
    .map(m => `${m.fromMe ? 'Atendente' : 'Cliente'}: ${m.text}`)
    .join('\n');

  const extractPrompt = `Extraia campos estruturados da mensagem do cliente de um salão de beleza.

Hoje: ${todayStr}, ${todayDate}
Serviços disponíveis: ${servicesList || 'Nenhum cadastrado'}
Profissionais: ${profList || 'Nenhum cadastrado'}

Estado atual do agendamento:
${stateInfo || 'Nenhum dado coletado ainda'}

Histórico recente:
${recentHistory}

Mensagem atual do cliente: "${message}"

Responda APENAS em JSON (sem markdown):
{
  "intent": "greeting|booking|check_availability|info_services|info_hours|info_prices|confirm|cancel|check_booking|general",
  "service": "nome exato do serviço ou null",
  "professional": "nome exato do profissional ou null",
  "date": "YYYY-MM-DD ou null (hoje=${todayDate}, amanhã=calcule, próxima segunda=calcule, etc)",
  "time": "HH:mm ou null (fim da tarde=16:00, manhã=09:00, depois do almoço=14:00, etc)",
  "customerName": "nome do cliente ou null"
}

Regras:
- Se o cliente diz "sim", "confirmo", "pode marcar" e estamos AGUARDANDO CONFIRMAÇÃO, intent="confirm"
- Se menciona serviço (mesmo parcial), extraia o nome EXATO do serviço disponível mais próximo
- Se menciona profissional, extraia o nome EXATO
- Datas relativas: "amanhã" → calcule a data, "segunda" → próxima segunda, "sábado" → próximo sábado
- Horários vagos: "fim da tarde" → 16:00, "depois do almoço" → 14:00, "manhã" → 09:00, "meio dia" → 12:00
- "não", "cancelar", "desistir" → intent="cancel"
- Se o cliente quer agendar algo (cortar, pintar, fazer unha, etc) → intent="booking"
- Se o cliente pergunta sobre DISPONIBILIDADE de horários sem mencionar serviço específico ("quais horários tem", "tem horário", "horário disponível", "tem vaga", "o que tem disponível") → intent="check_availability" (com a data se mencionada)`;

  try {
    const result = await chatComplete({
      messages: [
        { role: 'system', content: 'Você é um extrator de campos para sistema de agendamento. Responda SOMENTE JSON válido, sem markdown.' },
        { role: 'user', content: extractPrompt }
      ],
      maxTokens: 200,
      temperature: 0.1,
    });

    const raw = result.choices?.[0]?.message?.content || '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { intent: 'general' };

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      intent: parsed.intent || 'general',
      service: parsed.service || undefined,
      professional: parsed.professional || undefined,
      date: parsed.date || undefined,
      time: parsed.time || undefined,
      customerName: parsed.customerName || undefined,
    };
  } catch (err) {
    console.error('❌ [Salon] Erro na extração LLM:', err);
    return { intent: 'general' };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// RESOLVER SERVIÇO E PROFISSIONAL POR NOME (fuzzy match)
// ═══════════════════════════════════════════════════════════════════════

function matchService(name: string | undefined, services: SalonService[]): SalonService | null {
  if (!name || services.length === 0) return null;
  const lower = name.toLowerCase().trim();
  // Exact match
  const exact = services.find(s => s.name.toLowerCase() === lower);
  if (exact) return exact;
  // Partial match
  const partial = services.find(s =>
    s.name.toLowerCase().includes(lower) || lower.includes(s.name.toLowerCase())
  );
  return partial || null;
}

function matchProfessional(name: string | undefined, professionals: SalonProfessional[]): SalonProfessional | null {
  if (!name || professionals.length === 0) return null;
  const lower = name.toLowerCase().trim();
  if (/qualquer|tanto faz|sem prefer/.test(lower)) return professionals[0];
  const exact = professionals.find(p => p.name.toLowerCase() === lower);
  if (exact) return exact;
  const partial = professionals.find(p =>
    p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase())
  );
  return partial || null;
}

// ═══════════════════════════════════════════════════════════════════════
// FUNÇÃO ESTRUTURADA PARA SUGESTÃO DE HORÁRIOS (JSON + VALIDAÇÃO)
// ═══════════════════════════════════════════════════════════════════════

interface SlotSuggestionResult {
  messageText: string;
  suggestedSlots: string[];
}

interface SlotSuggestionOptions {
  message: string;
  conversationHistory: Array<{ fromMe: boolean; text: string }>;
  salonData: SalonData;
  bookingState: BookingState;
  date: string;
  allowedSlots: string[];
  breakConfig?: { enabled: boolean; start: string; end: string };
  serviceName?: string;
}

/**
 * Gera sugestão de horários via LLM com validação estruturada.
 * A IA retorna JSON com messageText e suggestedSlots, e validamos que
 * suggestedSlots é subconjunto de allowedSlots.
 */
async function generateSlotSuggestionMessageLLM(
  options: SlotSuggestionOptions
): Promise<SlotSuggestionResult> {
  const { message, conversationHistory, salonData, bookingState, date, allowedSlots, breakConfig, serviceName } = options;
  const { config, professionals } = salonData;

  const dateFormatted = formatDatePtBr(date);
  const breakNotice = breakConfig?.enabled
    ? `⚠️ NÃO atendemos no horário do almoço (${breakConfig.start} às ${breakConfig.end}).`
    : '';

  const recentHistory = conversationHistory.slice(-6)
    .map(m => `${m.fromMe ? 'Atendente' : 'Cliente'}: ${m.text}`)
    .join('\n');

  const profName = bookingState.professional?.name || professionals[0]?.name || 'nossa equipe';

  const slotsListStr = allowedSlots.slice(0, 8).join(', ');

  const systemPrompt = `Você é uma atendente virtual de um salão de beleza.
Sua tarefa: sugerir horários disponíveis para agendamento.

DATA: ${dateFormatted}
SERVIÇO: ${serviceName || 'o serviço escolhido'}
PROFISSIONAL: ${profName}
HORÁRIOS DISPONÍVEIS (confirmados pelo sistema): ${slotsListStr}
${breakNotice}

REGRAS IMPORTANTES:
1. Você SÓ pode sugerir horários da lista acima.
2. suggestedSlots DEVE ser um subconjunto de: [${allowedSlots.map(s => `"${s}"`).join(', ')}]
3. Não invente horários que não estão na lista.
4. Seja breve e amigável (máximo 3 linhas).

Responda APENAS em JSON (sem markdown):
{
  "messageText": "sua mensagem curta e simpática",
  "suggestedSlots": ["HH:mm", "HH:mm", ...]
}`;

  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await chatComplete({
        messages: [
          { role: 'system', content: systemPrompt },
          ...recentHistory.split('\n').map((line, i) => ({
            role: (i % 2 === 0) ? 'user' as const : 'assistant' as const,
            content: line
          })),
          { role: 'user', content: message }
        ],
        maxTokens: 200,
        temperature: 0.3,
      });

      const raw = result.choices?.[0]?.message?.content || '{}';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('⚠️ [Salon] LLM não retornou JSON válido, usando fallback');
        break;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const suggested = parsed.suggestedSlots || [];

      // VALIDAR: todos os slots sugeridos devem estar em allowedSlots
      const allValid = suggested.every((s: string) => allowedSlots.includes(s));

      if (allValid && suggested.length > 0) {
        console.log(`✅ [Salon] Slots validados: ${suggested.join(', ')}`);
        return {
          messageText: parsed.messageText || `Para ${dateFormatted}, temos: ${suggested.join(', ')}. Qual prefere?`,
          suggestedSlots: suggested
        };
      }

      if (attempt < maxRetries) {
        console.warn(`⚠️ [Salon] LLM sugeriu slots inválidos (tentativa ${attempt + 1}), reenviando...`);
        // Continuar para próxima tentativa com correção
        continue;
      }

      console.warn('⚠️ [Salon] LLM persistiu com slots inválidos, usando fallback');
      break;
    } catch (err) {
      console.error('❌ [Salon] Erro no generateSlotSuggestionMessageLLM:', err);
      break;
    }
  }

  // FALLBACK: usar os slots diretamente sem LLM
  const fallbackSlots = allowedSlots.slice(0, 6);
  console.log(`🔄 [Salon] Usando fallback com slots: ${fallbackSlots.join(', ')}`);
  return {
    messageText: `Para ${serviceName || 'o serviço'} em ${dateFormatted}, temos estes horários:\n\n${fallbackSlots.join(', ')}\n\n${breakNotice}\n\nQual funciona melhor para você?`,
    suggestedSlots: fallbackSlots
  };
}

// ═══════════════════════════════════════════════════════════════════════
// GERAR RESPOSTA VIA IA (conversacional)
// ═══════════════════════════════════════════════════════════════════════

async function generateAIResponse(
  message: string,
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
  salonData: SalonData,
  bookingState: BookingState,
  contextMessage: string
): Promise<string> {
  const { config, services, professionals } = salonData;

  const agentPrompt = config.ai_instructions || '';

  const servicesInfo = services.length > 0
    ? services.map(s => {
        const price = s.price ? `R$ ${s.price.toFixed(2).replace('.', ',')}` : 'Consulte';
        return `- ${s.name}: ${price} (${s.duration_minutes || 30}min)${s.description ? ' - ' + s.description : ''}`;
      }).join('\n')
    : 'Nenhum serviço cadastrado.';

  const profsInfo = professionals.length > 0
    ? professionals.map(p => `- ${p.name}${p.bio ? ': ' + p.bio : ''}`).join('\n')
    : 'Nenhum profissional cadastrado.';

  const hoursInfo = formatSalonHours(config.opening_hours);

  const stateInfo = [
    bookingState.service ? `Serviço escolhido: ${bookingState.service.name}` : '',
    bookingState.professional ? `Profissional: ${bookingState.professional.name}` : '',
    bookingState.date ? `Data: ${formatDatePtBr(bookingState.date)}` : '',
    bookingState.time ? `Horário: ${bookingState.time}` : '',
    bookingState.customerName ? `Cliente: ${bookingState.customerName}` : '',
  ].filter(Boolean).join(' | ');

  const recentHistory = conversationHistory.slice(-8)
    .map(m => `${m.fromMe ? 'Você' : 'Cliente'}: ${m.text}`)
    .join('\n');

  const systemPrompt = `Você é a atendente virtual do "${config.salon_name || 'Salão'}". Converse naturalmente com o cliente pelo WhatsApp, como uma recepcionista simpática e profissional.

${agentPrompt ? `INSTRUÇÕES DO DONO:\n${agentPrompt}\n` : ''}
SERVIÇOS DISPONÍVEIS:
${servicesInfo}

PROFISSIONAIS:
${profsInfo}

HORÁRIOS DE FUNCIONAMENTO:
${hoursInfo}

${config.address ? `ENDEREÇO: ${config.address}` : ''}
${config.phone ? `TELEFONE: ${config.phone}` : ''}

ESTADO DO AGENDAMENTO EM ANDAMENTO: ${stateInfo || 'Nenhum'}

${contextMessage ? `CONTEXTO IMPORTANTE: ${contextMessage}` : ''}

REGRAS:
- Converse naturalmente, SEM menus "digite 1, 2, 3"
- Se o cliente quer agendar, ajude coletando: serviço, profissional (se tiver), data e horário
- Não invente horários, serviços ou profissionais que não existem
- IMPORTANTE: NUNCA sugira horários específicos (como "12:30", "14:10") a menos que uma lista de horários disponíveis seja fornecida no contexto. Sem lista, pergunte apenas a preferência do cliente.
- Seja breve (máximo 3-4 linhas por mensagem)
- Use o nome do cliente quando souber
- Se todos os dados estiverem coletados, faça um RESUMO e peça confirmação
- Não confirme agendamento por conta própria, SEMPRE pergunte "Posso confirmar?"`;

  try {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Add recent history as conversation context
    for (const h of conversationHistory.slice(-6)) {
      messages.push({
        role: h.fromMe ? 'assistant' : 'user',
        content: h.text,
      });
    }
    messages.push({ role: 'user', content: message });

    const result = await chatComplete({
      messages,
      maxTokens: 300,
      temperature: 0.7,
    });

    return result.choices?.[0]?.message?.content || 'Como posso ajudar você?';
  } catch (err) {
    console.error('❌ [Salon] Erro ao gerar resposta IA:', err);
    return 'Desculpe, tive um problema. Pode repetir?';
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GERAR RESPOSTA PRINCIPAL DO SALÃO
// ═══════════════════════════════════════════════════════════════════════

export async function generateSalonResponse(
  userId: string,
  conversationId: string,
  customerPhone: string,
  message: string,
  conversationHistory?: Array<{ fromMe: boolean; text: string }>
): Promise<{ text: string; shouldSave?: boolean } | null> {
  try {
    const salonData = await getSalonData(userId);
    if (!salonData || !salonData.config.is_active) return null;

    const { config, services, professionals } = salonData;
    const history = conversationHistory || [];
    const state = getBookingState(userId, customerPhone, conversationId);

    console.log(`💇 [Salon v2] msg="${message.substring(0, 80)}" phone=${customerPhone}`);
    console.log(`💇 [Salon v2] state: svc=${state.service?.name || '-'} prof=${state.professional?.name || '-'} date=${state.date || '-'} time=${state.time || '-'} confirm=${state.awaitingConfirmation}`);

    // 0. VERIFICAR HORÁRIO DE ALMOÇO — bloquear se estiver no intervalo
    const breakStatus = isCurrentlyInBreak(config.opening_hours);
    if (breakStatus.isDuringBreak) {
      console.log(`💇 [Salon v2] ⏸️ HORÁRIO DE ALMOÇO (${breakStatus.breakStart}–${breakStatus.breakEnd}) — bloqueando resposta`);
      return {
        text: breakStatus.message,
      };
    }

    // 1. EXTRAIR CAMPOS VIA IA
    const extracted = await extractSalonFieldsLLM(message, history, salonData, state);
    console.log(`💇 [Salon v2] extracted:`, JSON.stringify(extracted));

    // 2. ATUALIZAR ESTADO COM CAMPOS EXTRAÍDOS
    if (extracted.customerName && !state.customerName) {
      state.customerName = extracted.customerName;
    }

    if (extracted.service) {
      const matched = matchService(extracted.service, services);
      if (matched) {
        state.service = matched;
        console.log(`💇 [Salon v2] Serviço matched: ${matched.name}`);
      }
    }

    if (extracted.professional) {
      const matched = matchProfessional(extracted.professional, professionals);
      if (matched) {
        state.professional = matched;
        console.log(`💇 [Salon v2] Profissional matched: ${matched.name}`);
      }
    }

            if (extracted.date && /^\d{4}-\d{2}-\d{2}$/.test(extracted.date)) {
      state.date = extracted.date;
      console.log(`💇 [Salon v2] Data: ${extracted.date}`);
    }

        if (extracted.time && /^\d{2}:\d{2}$/.test(extracted.time)) {
      state.time = extracted.time;
      console.log(`💇 [Salon v2] Hora: ${extracted.time}`);
    }

    state.lastUpdated = new Date();

    // 3. HANDLE CANCEL
    if (extracted.intent === 'cancel') {
      resetBookingState(userId, customerPhone, conversationId);
      return { text: await generateAIResponse(message, history, salonData, state, 'O cliente cancelou o agendamento. Confirme o cancelamento de forma amigável.') };
    }

    // 4. HANDLE CONFIRMATION
    // Allow confirm when: (a) awaitingConfirmation is true OR (b) intent=confirm and all data present
    const hasAllBookingData = state.service && state.date && state.time;
    const shouldConfirm = extracted.intent === 'confirm' && (state.awaitingConfirmation || hasAllBookingData);
    console.log(`💇 [Salon v2] CONFIRM CHECK: intent=${extracted.intent} awaiting=${state.awaitingConfirmation} hasAllData=${!!hasAllBookingData} shouldConfirm=${shouldConfirm}`);
    if (shouldConfirm) {
      console.log(`💇 [Salon v2] CONFIRM PATH: svc=${state.service?.name} date=${state.date} time=${state.time}`);
      if (!state.service || !state.date || !state.time) {
        state.awaitingConfirmation = false;
        console.log(`💇 [Salon v2] CONFIRM FAIL: missing data`);
        return { text: await generateAIResponse(message, history, salonData, state, 'Faltam dados para confirmar. Pergunte o que falta.') };
      }

      // REVALIDATE SLOT
      console.log(`💇 [Salon v2] REVALIDATING slot: ${state.date} ${state.time}`);
      const { valid, availableSlots } = await validateSlot(
        userId, state.date, state.time,
        state.professional?.id,
        state.service.duration_minutes
      );

      console.log(`💇 [Salon v2] VALIDATE result: valid=${valid} availableSlots=${availableSlots.length}`);
      if (!valid) {
        const requestedTime = state.time; // Salvar antes de limpar
        state.awaitingConfirmation = false;
        state.time = null;

        // USAR FUNÇÃO ESTRUTURADA para sugerir alternativas
        const breakConfig = config.opening_hours?.['__break'] as { enabled: boolean; start: string; end: string } | undefined;
        const slotResult = await generateSlotSuggestionMessageLLM({
          message,
          conversationHistory: history,
          salonData,
          bookingState: state,
          date: state.date!,
          allowedSlots: availableSlots,
          breakConfig,
          serviceName: state.service?.name,
        });
        return { text: slotResult.messageText };
      }

      // CREATE APPOINTMENT
      console.log(`💇 [Salon v2] CREATING appointment...`);
      const result = await createSalonAppointment(userId, conversationId, {
        clientName: state.customerName || 'Cliente',
        clientPhone: customerPhone,
        serviceId: state.service.id,
        serviceName: state.service.name,
        professionalId: state.professional?.id,
        professionalName: state.professional?.name,
        appointmentDate: state.date,
        startTime: state.time,
        durationMinutes: state.service.duration_minutes || 30,
      });

      console.log(`💇 [Salon v2] CREATE result: success=${result.success} id=${result.appointmentId} error=${result.error}`);
      if (result.success) {
        const dateFormatted = formatDatePtBr(state.date);
        const svcName = state.service.name;
        const profName = state.professional?.name;
        const timeStr = state.time;
        resetBookingState(userId, customerPhone, conversationId);

        return {
          text: await generateAIResponse(message, history, salonData,
            { ...state, service: null, professional: null, date: null, time: null, awaitingConfirmation: false, customerName: state.customerName, customerPhone, createdAt: new Date(), lastUpdated: new Date() },
            `AGENDAMENTO CRIADO COM SUCESSO! Dados: ${svcName}${profName ? ' com ' + profName : ''} em ${dateFormatted} às ${timeStr}. Confirme ao cliente de forma entusiasmada e amigável.`),
          shouldSave: true,
        };
      } else if (result.suggestedSlots && result.suggestedSlots.length > 0) {
        state.awaitingConfirmation = false;
        state.time = null;

        // USAR FUNÇÃO ESTRUTURADA para sugerir alternativas
        const breakConfig = config.opening_hours?.['__break'] as { enabled: boolean; start: string; end: string } | undefined;
        const slotResult = await generateSlotSuggestionMessageLLM({
          message,
          conversationHistory: history,
          salonData,
          bookingState: state,
          date: state.date!,
          allowedSlots: result.suggestedSlots,
          breakConfig,
          serviceName: state.service?.name,
        });
        return { text: slotResult.messageText };
      } else {
        return { text: await generateAIResponse(message, history, salonData, state, 'Erro ao criar agendamento. Peça desculpas e peça para tentar novamente.') };
      }
    }

    // 4.5. HANDLE CHECK_AVAILABILITY - Mostrar horários ANTES de pedir serviço
    // Detecta também via regex como fallback (caso LLM não classifique corretamente)
    const availabilityRegex = /quais\s+hor[áa]rios|tem\s+hor[áa]rio|hor[áa]rio\s+dispon[íi]vel|tem\s+vaga|disponibilidade|que\s+horas?\s+tem|horarios\s+livres|agenda\s+livre/i;
    const isAvailabilityQuery = extracted.intent === 'check_availability' || 
      (availabilityRegex.test(message) && !state.service && (extracted.date || state.date));
    
    if (isAvailabilityQuery) {
      // Determinar a data alvo
      const targetDate = extracted.date || state.date || (() => {
        // Fallback: detectar "amanhã" via regex
        if (/amanh[ãa]/i.test(message)) {
          const tomorrow = new Date(getBrazilNow());
          tomorrow.setDate(tomorrow.getDate() + 1);
          const y = tomorrow.getFullYear();
          const m = (tomorrow.getMonth() + 1).toString().padStart(2, '0');
          const d = tomorrow.getDate().toString().padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
        if (/hoje/i.test(message)) return getBrazilToday();
        return null;
      })();

      if (targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        // Salvar data no estado
        state.date = targetDate;
        state.lastUpdated = new Date();

        // Buscar slots usando duração padrão do salão
        const defaultDuration = config.slot_duration || 30;
        const slots = await getAvailableSlots(userId, targetDate, state.professional?.id, defaultDuration);
        const dateFormatted = formatDatePtBr(targetDate);

        console.log(`💇 [Salon v2] AVAILABILITY CHECK: date=${targetDate} slots=${slots.length}`);

        if (slots.length === 0) {
          // Dia lotado - tentar próximo dia útil
          let nextDate = new Date(targetDate + 'T12:00:00');
          let nextSlots: string[] = [];
          let nextDateStr = '';
          for (let i = 1; i <= 7; i++) {
            nextDate.setDate(nextDate.getDate() + 1);
            const y = nextDate.getFullYear();
            const m = (nextDate.getMonth() + 1).toString().padStart(2, '0');
            const d = nextDate.getDate().toString().padStart(2, '0');
            nextDateStr = `${y}-${m}-${d}`;
            nextSlots = await getAvailableSlots(userId, nextDateStr, undefined, defaultDuration);
            if (nextSlots.length > 0) break;
          }

          if (nextSlots.length > 0) {
            const nextFormatted = formatDatePtBr(nextDateStr);
            const sampleSlots = nextSlots.slice(0, 6).join(', ');
            return { text: `Infelizmente não temos horários disponíveis para ${dateFormatted} 😔\n\nO próximo dia com vagas é ${nextFormatted}. Alguns horários: ${sampleSlots}\n\nGostaria de agendar nesse dia? Qual serviço deseja?` };
          } else {
            return { text: `Infelizmente não temos horários disponíveis para ${dateFormatted} e nem nos próximos dias. Por favor, entre em contato novamente em breve! 😔` };
          }
        }

        // Mostrar horários disponíveis (5-8 slots espaçados)
        let displaySlots: string[];
        if (slots.length <= 8) {
          displaySlots = slots;
        } else {
          // Selecionar slots espaçados para cobrir o dia todo
          const step = Math.floor(slots.length / 7);
          displaySlots = [];
          for (let i = 0; i < slots.length && displaySlots.length < 8; i += step) {
            displaySlots.push(slots[i]);
          }
          // Garantir o último slot
          if (!displaySlots.includes(slots[slots.length - 1])) {
            displaySlots[displaySlots.length - 1] = slots[slots.length - 1];
          }
        }

        const slotsFormatted = displaySlots.join(', ');
        const totalMsg = slots.length > 8 ? ` (${slots.length} horários no total)` : '';
        
        // Perguntar serviço DEPOIS de mostrar disponibilidade
        const servicesHint = services.length > 0
          ? `\n\nQual serviço você gostaria? Temos: ${services.slice(0, 5).map(s => s.name).join(', ')}`
          : '';

        return { text: `Para ${dateFormatted}, temos os seguintes horários disponíveis${totalMsg}:\n\n🕐 ${slotsFormatted}\n${servicesHint}` };
      }
    }

    // 5. CHECK IF WE HAVE ALL DATA FOR BOOKING
    const needsService = !state.service && services.length > 0;
    const needsProfessional = !state.professional && config.use_professionals && professionals.length > 0;
    const needsDate = !state.date;
    const needsTime = !state.time;

    const isBookingIntent = extracted.intent === 'booking' || state.service !== null || state.date !== null;

    if (isBookingIntent && state.service && state.date && state.time && !state.awaitingConfirmation) {
      // All data collected - VALIDATE SLOT then ask confirmation
      const { valid, availableSlots } = await validateSlot(
        userId, state.date, state.time,
        state.professional?.id,
        state.service.duration_minutes
      );

      if (!valid) {
        // Find closest available slot
        const closest = findClosestSlot(state.time, availableSlots);
        state.time = null;

        // USAR FUNÇÃO ESTRUTURADA para sugerir alternativas
        const breakConfig = config.opening_hours?.['__break'] as { enabled: boolean; start: string; end: string } | undefined;
        const slotResult = await generateSlotSuggestionMessageLLM({
          message,
          conversationHistory: history,
          salonData,
          bookingState: state,
          date: state.date!,
          allowedSlots: availableSlots,
          breakConfig,
          serviceName: state.service?.name,
        });
        return { text: slotResult.messageText };
      }

      // SLOT VALID - ask confirmation
      state.awaitingConfirmation = true;
      state.lastUpdated = new Date();
      const dateFormatted = formatDatePtBr(state.date);
      const price = state.service.price ? `R$ ${state.service.price.toFixed(2).replace('.', ',')}` : null;
      const confirmContext = `Todos os dados estão completos e o horário está DISPONÍVEL. Faça um resumo e pergunte "Posso confirmar?":
- Serviço: ${state.service.name}${price ? ' (' + price + ')' : ''}
- ${state.professional ? 'Profissional: ' + state.professional.name : 'Sem profissional específico'}
- Data: ${dateFormatted}
- Horário: ${state.time}
Peça confirmação do cliente.`;

      return { text: await generateAIResponse(message, history, salonData, state, confirmContext) };
    }

    // 6. IF BOOKING INTENT, CHECK WHAT'S MISSING AND PROVIDE SLOTS IF DATE IS SET
    if (isBookingIntent) {
      let contextMsg = '';

      if (needsService) {
        const svcList = services.map(s => {
          const p = s.price ? ` (R$ ${s.price.toFixed(2).replace('.', ',')})` : '';
          return `${s.name}${p}`;
        }).join(', ');
        contextMsg = `O cliente quer agendar mas não escolheu o serviço ainda. Serviços: ${svcList}. Pergunte qual serviço deseja.`;
      } else if (needsProfessional) {
        const profNames = professionals.map(p => p.name).join(', ');
        contextMsg = `Serviço escolhido: ${state.service!.name}. Profissionais disponíveis: ${profNames}. Pergunte com qual profissional prefere ou se tanto faz.`;
      } else if (needsDate) {
        contextMsg = `Serviço: ${state.service!.name}${state.professional ? ', Profissional: ' + state.professional.name : ''}. Pergunte qual dia/data o cliente prefere.`;
      } else if (needsTime) {
        // Fetch available slots for the date (já filtrados pelo backend - sem almoço)
        const slots = await getAvailableSlots(
          userId, state.date!, state.professional?.id, state.service!.duration_minutes
        );
        if (slots.length === 0) {
          const requestedDate = state.date || ''; // Salvar antes de limpar
          state.date = null;
          contextMsg = `Não há horários disponíveis para ${formatDatePtBr(requestedDate)}. Peça outra data ao cliente.`;
        } else {
          // USAR FUNÇÃO ESTRUTURADA: IA retorna JSON com validação de slots
          const breakConfig = config.opening_hours?.['__break'] as { enabled: boolean; start: string; end: string } | undefined;
          const slotResult = await generateSlotSuggestionMessageLLM({
            message,
            conversationHistory: history,
            salonData,
            bookingState: state,
            date: state.date!,
            allowedSlots: slots,
            breakConfig,
            serviceName: state.service?.name,
          });
          // Retornar diretamente a mensagem validada (sem passar por generateAIResponse)
          return { text: slotResult.messageText };
        }
      }

      return { text: await generateAIResponse(message, history, salonData, state, contextMsg) };
    }

    // 7. INFO-ONLY INTENTS (services, hours, prices)
    if (extracted.intent === 'info_services' || extracted.intent === 'info_prices') {
      const svcInfo = services.map(s => {
        const p = s.price ? `R$ ${s.price.toFixed(2).replace('.', ',')}` : 'Consulte';
        return `${s.name}: ${p} (${s.duration_minutes}min)`;
      }).join(', ');
      return { text: await generateAIResponse(message, history, salonData, state, `Informe os serviços e preços: ${svcInfo}`) };
    }

    if (extracted.intent === 'info_hours') {
      const hours = formatSalonHours(config.opening_hours);
      return { text: await generateAIResponse(message, history, salonData, state, `Informe os horários de funcionamento:\n${hours}`) };
    }

    // 8. GENERAL CONVERSATION - AI handles naturally
    return { text: await generateAIResponse(message, history, salonData, state, '') };

  } catch (err) {
    console.error('❌ [Salon] Erro ao gerar resposta:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS PARA COMPATIBILIDADE
// ═══════════════════════════════════════════════════════════════════════

export async function isSalonActive(userId: string): Promise<boolean> {
  const config = await getSalonConfig(userId);
  return config?.is_active === true;
}

// Legacy exports (unused but kept for import compatibility)
export function detectSalonIntent(): SalonIntent { return 'OTHER'; }
