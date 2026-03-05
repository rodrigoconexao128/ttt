/**
 * Google Calendar Integration Service
 * 
 * Serviço completo para integração com Google Calendar:
 * - OAuth2 authentication flow
 * - Criação/atualização/exclusão de eventos
 * - Sincronização de agendamentos
 */

import { google, calendar_v3 } from 'googleapis';
import { supabase } from './supabaseAuth';

// Configuração OAuth2
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/google-calendar/callback';

// Scopes necessários para Google Calendar
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

// Interface para tokens
interface GoogleTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  token_type?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
}

// Interface para dados de evento
interface CalendarEventData {
  summary: string;          // Título do evento
  description?: string;     // Descrição
  startDateTime: string;    // ISO format: 2025-01-28T14:00:00
  endDateTime: string;      // ISO format: 2025-01-28T15:00:00
  location?: string;        // Local do atendimento
  attendeeEmail?: string;   // Email do cliente (opcional)
  colorId?: string;         // Cor do evento (1-11)
}

/**
 * Cria OAuth2 client do Google
 */
function createOAuth2Client() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

/**
 * Verifica se as credenciais do Google estão configuradas
 */
export function isGoogleCalendarConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

/**
 * Gera URL de autorização do Google
 * @param userId - ID do usuário (para state)
 */
export function getGoogleAuthUrl(userId: string): string {
  if (!isGoogleCalendarConfigured()) {
    throw new Error('Google Calendar não está configurado. Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.');
  }
  
  const oauth2Client = createOAuth2Client();
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Força consent para sempre receber refresh_token
    state: userId, // Passa userId no state para recuperar no callback
  });
  
  return authUrl;
}

/**
 * Processa callback do Google OAuth e salva tokens
 * @param code - Authorization code do Google
 * @param userId - ID do usuário
 */
export async function handleGoogleCallback(code: string, userId: string): Promise<{success: boolean; error?: string}> {
  try {
    if (!isGoogleCalendarConfigured()) {
      return { success: false, error: 'Google Calendar não configurado' };
    }
    
    const oauth2Client = createOAuth2Client();
    
    // Troca code por tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      console.warn('[GoogleCalendar] Nenhum refresh_token recebido. O usuário pode precisar revogar acesso e re-autorizar.');
    }
    
    // Salva tokens no Supabase
    const { error } = await supabase
      .from('google_calendar_tokens')
      .upsert({
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type,
        expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scope: tokens.scope,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });
    
    if (error) {
      console.error('[GoogleCalendar] Erro ao salvar tokens:', error);
      return { success: false, error: 'Erro ao salvar tokens' };
    }
    
    console.log(`[GoogleCalendar] Tokens salvos para usuário ${userId}`);
    return { success: true };
    
  } catch (error: any) {
    console.error('[GoogleCalendar] Erro no callback:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Busca tokens do usuário no Supabase
 */
async function getUserTokens(userId: string): Promise<GoogleTokens | null> {
  const { data, error } = await supabase
    .from('google_calendar_tokens')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    expiry_date: data.expiry_date ? new Date(data.expiry_date).getTime() : null,
    scope: data.scope
  };
}

/**
 * Atualiza tokens no Supabase
 */
async function updateUserTokens(userId: string, tokens: GoogleTokens): Promise<void> {
  await supabase
    .from('google_calendar_tokens')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || undefined, // Não sobrescreve se não vier novo
      expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);
}

/**
 * Retorna OAuth2 client autenticado para o usuário
 */
async function getAuthenticatedClient(userId: string): Promise<ReturnType<typeof createOAuth2Client> | null> {
  const tokens = await getUserTokens(userId);
  
  if (!tokens || !tokens.access_token) {
    return null;
  }
  
  const oauth2Client = createOAuth2Client();
  
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type,
    expiry_date: tokens.expiry_date,
  });
  
  // Listener para atualizar tokens quando forem refreshed
  oauth2Client.on('tokens', async (newTokens) => {
    console.log(`[GoogleCalendar] Tokens refreshed para usuário ${userId}`);
    await updateUserTokens(userId, newTokens);
  });
  
  return oauth2Client;
}

/**
 * Verifica se o usuário está conectado ao Google Calendar
 */
export async function isGoogleCalendarConnected(userId: string): Promise<boolean> {
  const tokens = await getUserTokens(userId);
  return !!(tokens && tokens.access_token);
}

/**
 * Obtém informações da conexão do Google Calendar
 */
export async function getGoogleCalendarStatus(userId: string): Promise<{
  connected: boolean;
  configured: boolean;
  email?: string;
}> {
  const configured = isGoogleCalendarConfigured();
  const connected = await isGoogleCalendarConnected(userId);
  
  let email: string | undefined;
  
  if (connected) {
    try {
      const oauth2Client = await getAuthenticatedClient(userId);
      if (oauth2Client) {
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        email = userInfo.data.email || undefined;
      }
    } catch (error) {
      console.error('[GoogleCalendar] Erro ao obter email:', error);
    }
  }
  
  return { connected, configured, email };
}

/**
 * Desconecta Google Calendar (revoga tokens)
 */
export async function disconnectGoogleCalendar(userId: string): Promise<{success: boolean; error?: string}> {
  try {
    const oauth2Client = await getAuthenticatedClient(userId);
    
    if (oauth2Client) {
      try {
        // Tenta revogar o token
        await oauth2Client.revokeCredentials();
      } catch (error) {
        console.warn('[GoogleCalendar] Erro ao revogar token (pode já estar revogado):', error);
      }
    }
    
    // Remove tokens do Supabase
    const { error } = await supabase
      .from('google_calendar_tokens')
      .delete()
      .eq('user_id', userId);
    
    if (error) {
      return { success: false, error: 'Erro ao remover tokens' };
    }
    
    console.log(`[GoogleCalendar] Desconectado para usuário ${userId}`);
    return { success: true };
    
  } catch (error: any) {
    console.error('[GoogleCalendar] Erro ao desconectar:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Cria evento no Google Calendar
 */
export async function createCalendarEvent(userId: string, eventData: CalendarEventData): Promise<{
  success: boolean;
  eventId?: string;
  htmlLink?: string;
  error?: string;
}> {
  try {
    const oauth2Client = await getAuthenticatedClient(userId);
    
    if (!oauth2Client) {
      return { success: false, error: 'Google Calendar não conectado' };
    }
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Prepara o evento
    const event: calendar_v3.Schema$Event = {
      summary: eventData.summary,
      description: eventData.description,
      location: eventData.location,
      start: {
        dateTime: eventData.startDateTime,
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: eventData.endDateTime,
        timeZone: 'America/Sao_Paulo',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'email', minutes: 60 },
        ],
      },
    };
    
    // Adiciona convidado se tiver email
    if (eventData.attendeeEmail) {
      event.attendees = [{ email: eventData.attendeeEmail }];
    }
    
    // Define cor se especificada
    if (eventData.colorId) {
      event.colorId = eventData.colorId;
    }
    
    // Cria o evento
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: eventData.attendeeEmail ? 'all' : 'none',
    });
    
    console.log(`[GoogleCalendar] Evento criado: ${response.data.id}`);
    
    return {
      success: true,
      eventId: response.data.id || undefined,
      htmlLink: response.data.htmlLink || undefined,
    };
    
  } catch (error: any) {
    console.error('[GoogleCalendar] Erro ao criar evento:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Atualiza evento no Google Calendar
 */
export async function updateCalendarEvent(
  userId: string,
  eventId: string,
  eventData: Partial<CalendarEventData>
): Promise<{success: boolean; error?: string}> {
  try {
    const oauth2Client = await getAuthenticatedClient(userId);
    
    if (!oauth2Client) {
      return { success: false, error: 'Google Calendar não conectado' };
    }
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Busca evento atual
    const currentEvent = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId,
    });
    
    // Prepara atualização
    const event: calendar_v3.Schema$Event = {
      ...currentEvent.data,
      summary: eventData.summary || currentEvent.data.summary,
      description: eventData.description ?? currentEvent.data.description,
      location: eventData.location ?? currentEvent.data.location,
    };
    
    if (eventData.startDateTime) {
      event.start = {
        dateTime: eventData.startDateTime,
        timeZone: 'America/Sao_Paulo',
      };
    }
    
    if (eventData.endDateTime) {
      event.end = {
        dateTime: eventData.endDateTime,
        timeZone: 'America/Sao_Paulo',
      };
    }
    
    // Atualiza o evento
    await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: event,
    });
    
    console.log(`[GoogleCalendar] Evento atualizado: ${eventId}`);
    return { success: true };
    
  } catch (error: any) {
    console.error('[GoogleCalendar] Erro ao atualizar evento:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Deleta evento do Google Calendar
 */
export async function deleteCalendarEvent(userId: string, eventId: string): Promise<{success: boolean; error?: string}> {
  try {
    const oauth2Client = await getAuthenticatedClient(userId);
    
    if (!oauth2Client) {
      return { success: false, error: 'Google Calendar não conectado' };
    }
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });
    
    console.log(`[GoogleCalendar] Evento deletado: ${eventId}`);
    return { success: true };
    
  } catch (error: any) {
    console.error('[GoogleCalendar] Erro ao deletar evento:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Lista eventos do Google Calendar em um período
 */
export async function listCalendarEvents(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  success: boolean;
  events?: calendar_v3.Schema$Event[];
  error?: string;
}> {
  try {
    const oauth2Client = await getAuthenticatedClient(userId);
    
    if (!oauth2Client) {
      return { success: false, error: 'Google Calendar não conectado' };
    }
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    });
    
    return {
      success: true,
      events: response.data.items || [],
    };
    
  } catch (error: any) {
    console.error('[GoogleCalendar] Erro ao listar eventos:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Verifica disponibilidade no Google Calendar
 * @returns true se o horário está livre, false se ocupado
 */
export async function checkCalendarAvailability(
  userId: string,
  startDateTime: string,
  endDateTime: string
): Promise<{available: boolean; conflictEvent?: string}> {
  try {
    const start = new Date(startDateTime);
    const end = new Date(endDateTime);
    
    const { success, events, error } = await listCalendarEvents(userId, start, end);
    
    if (!success || error) {
      // Se não conseguir verificar, assume disponível
      return { available: true };
    }
    
    // Verifica se há conflito
    if (events && events.length > 0) {
      const conflict = events[0];
      return {
        available: false,
        conflictEvent: conflict.summary || 'Evento sem título',
      };
    }
    
    return { available: true };
    
  } catch (error) {
    console.error('[GoogleCalendar] Erro ao verificar disponibilidade:', error);
    return { available: true }; // Na dúvida, assume disponível
  }
}

/**
 * Sincroniza um agendamento com o Google Calendar
 * Cria ou atualiza o evento correspondente
 */
export async function syncAppointmentToCalendar(
  userId: string,
  appointment: {
    id: string;
    clientName: string;
    clientPhone: string;
    appointmentDate: string;
    appointmentTime: string;
    serviceName?: string;
    notes?: string;
    googleEventId?: string;
  },
  serviceDurationMinutes: number = 60
): Promise<{success: boolean; eventId?: string; error?: string}> {
  try {
    // Monta datetime do evento
    const startDateTime = `${appointment.appointmentDate}T${appointment.appointmentTime}:00`;
    
    // Calcula horário de término
    const startDate = new Date(startDateTime);
    const endDate = new Date(startDate.getTime() + serviceDurationMinutes * 60 * 1000);
    const endDateTime = endDate.toISOString().slice(0, 19);
    
    const eventData: CalendarEventData = {
      summary: `📅 ${appointment.serviceName || 'Agendamento'} - ${appointment.clientName}`,
      description: [
        `Cliente: ${appointment.clientName}`,
        `Telefone: ${appointment.clientPhone}`,
        appointment.notes ? `\nNotas: ${appointment.notes}` : '',
        `\n--- Agendado via AgentZap ---`,
        `ID: ${appointment.id}`
      ].join('\n'),
      startDateTime,
      endDateTime,
      colorId: '2', // Verde sage
    };
    
    // Se já tem eventId, atualiza. Senão, cria novo
    if (appointment.googleEventId) {
      const result = await updateCalendarEvent(userId, appointment.googleEventId, eventData);
      return { success: result.success, eventId: appointment.googleEventId, error: result.error };
    } else {
      return await createCalendarEvent(userId, eventData);
    }
    
  } catch (error: any) {
    console.error('[GoogleCalendar] Erro ao sincronizar agendamento:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove evento do Calendar quando agendamento é cancelado
 */
export async function removeAppointmentFromCalendar(
  userId: string,
  googleEventId: string
): Promise<{success: boolean; error?: string}> {
  return deleteCalendarEvent(userId, googleEventId);
}

// Exporta tipos
export type { CalendarEventData, GoogleTokens };
