import {
  supabase
} from "./chunk-LC2K5ZEZ.js";

// server/schedulingService.ts
var CACHE_TTL_MS = 5 * 60 * 1e3;
var schedulingConfigCache = /* @__PURE__ */ new Map();
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, entry] of schedulingConfigCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      schedulingConfigCache.delete(key);
    }
  }
}
setInterval(cleanExpiredCache, 10 * 60 * 1e3);
function invalidateSchedulingCache(userId) {
  schedulingConfigCache.delete(userId);
  console.log(`\u{1F5D1}\uFE0F [Scheduling] Cache invalidado para user ${userId}`);
}
async function isSchedulingEnabled(userId) {
  const config = await getSchedulingConfigCached(userId);
  return config?.is_enabled === true;
}
var SCHEDULING_PATTERNS = {
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
    /disponibilidade/i
  ],
  // IMPORTANTE: reschedule deve vir ANTES de book_appointment para priorizar "reagendar"
  reschedule: [
    /remarcar/i,
    /reagendar/i,
    /trocar o hor[aá]rio/i,
    /mudar o hor[aá]rio/i,
    /alterar (o )?(meu )?agendamento/i,
    /outro hor[aá]rio/i
  ],
  cancel_appointment: [
    /cancelar/i,
    /desmarcar/i,
    /n[aã]o vou (poder )?(ir|comparecer)/i,
    /n[aã]o posso (ir|comparecer)/i,
    /preciso cancelar/i
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
    /pode ser [àa]s/i
  ],
  info: [
    /onde (fica|é|[eé] o endereço)/i,
    /qual o endereço/i,
    /como funciona/i,
    /quanto tempo (dura|demora)/i,
    /quanto custa/i,
    /pre[çc]o/i,
    /valor/i
  ]
};
var DATE_PATTERNS = {
  today: /hoje/i,
  tomorrow: /amanh[ãa]/i,
  dayAfterTomorrow: /depois de amanh[ãa]/i,
  weekday: /(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)/i,
  specificDate: /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/,
  nextWeek: /semana que vem|pr[óo]xima semana/i
};
var TIME_PATTERNS = {
  // Captura: 14:00, 14h, 14h30, 14:30, 14 horas
  specific: /(\d{1,2})(?:(?:h|:)(\d{2})|(:(\d{2}))|h)?\s*(hrs?|horas?)?/i,
  // Formato alternativo: 14h30 (sem : )
  withH: /(\d{1,2})h(\d{2})/i,
  morning: /manh[ãa]|de manh[ãa]/i,
  afternoon: /tarde|de tarde/i,
  evening: /noite|de noite/i
};
function detectSchedulingIntent(message) {
  const result = {
    detected: false,
    type: null,
    confidence: 0
  };
  const normalizedMsg = message.toLowerCase().trim();
  const orderedIntents = [
    "check_availability",
    "reschedule",
    "cancel_appointment",
    "book_appointment",
    "info"
  ];
  for (const intentType of orderedIntents) {
    const patterns = SCHEDULING_PATTERNS[intentType];
    for (const pattern of patterns) {
      if (pattern.test(normalizedMsg)) {
        result.detected = true;
        result.type = intentType;
        result.confidence = 0.8;
        break;
      }
    }
    if (result.detected) break;
  }
  if (!result.detected) {
    const genericPatterns = [
      /agend/i,
      /marc/i,
      /hor[áa]rio/i,
      /consulta/i,
      /atendimento/i
    ];
    for (const pattern of genericPatterns) {
      if (pattern.test(normalizedMsg)) {
        result.detected = true;
        result.type = "info";
        result.confidence = 0.5;
        break;
      }
    }
  }
  if (result.detected) {
    result.requestedDate = extractDate(normalizedMsg);
    result.requestedTime = extractTime(normalizedMsg);
    if (result.requestedDate) result.confidence += 0.1;
    if (result.requestedTime) result.confidence += 0.1;
  }
  return result;
}
function extractDate(message) {
  const brazil = getBrazilDateTime();
  const today = brazil.date;
  if (DATE_PATTERNS.dayAfterTomorrow.test(message)) {
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);
    return formatDate(dayAfter);
  }
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
    const weekdays = {
      "domingo": 0,
      "segunda": 1,
      "terca": 2,
      "ter\xE7a": 2,
      "quarta": 3,
      "quinta": 4,
      "sexta": 5,
      "sabado": 6,
      "s\xE1bado": 6
    };
    const targetDay = weekdays[weekdayMatch[1].toLowerCase()];
    if (targetDay !== void 0) {
      const brazil2 = getBrazilDateTime();
      const date = new Date(brazil2.date);
      const currentDay = date.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7;
      date.setDate(date.getDate() + daysToAdd);
      return formatDate(date);
    }
  }
  const specificMatch = message.match(DATE_PATTERNS.specificDate);
  if (specificMatch) {
    const brazil2 = getBrazilDateTime();
    const day = parseInt(specificMatch[1]);
    const month = parseInt(specificMatch[2]) - 1;
    const year = specificMatch[3] ? parseInt(specificMatch[3]) : brazil2.date.getFullYear();
    const fullYear = year < 100 ? 2e3 + year : year;
    return formatDate(new Date(fullYear, month, day));
  }
  if (DATE_PATTERNS.nextWeek.test(message)) {
    const brazil2 = getBrazilDateTime();
    const nextWeek = new Date(brazil2.date);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return formatDate(nextWeek);
  }
  return void 0;
}
function extractTime(message) {
  const withHMatch = message.match(TIME_PATTERNS.withH);
  if (withHMatch) {
    const hour = parseInt(withHMatch[1]);
    const minutes = parseInt(withHMatch[2]);
    if (hour >= 0 && hour <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    }
  }
  const timeMatch = message.match(TIME_PATTERNS.specific);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : timeMatch[4] ? parseInt(timeMatch[4]) : 0;
    if (hour >= 0 && hour <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    }
  }
  if (TIME_PATTERNS.morning.test(message)) {
    return "09:00";
  }
  if (TIME_PATTERNS.afternoon.test(message)) {
    return "14:00";
  }
  if (TIME_PATTERNS.evening.test(message)) {
    return "19:00";
  }
  return void 0;
}
function formatDate(date) {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}
async function getSchedulingConfigCached(userId) {
  const cached = schedulingConfigCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  try {
    const { data, error } = await supabase.from("scheduling_config").select("*").eq("user_id", userId).single();
    const config = error || !data ? null : data;
    schedulingConfigCache.set(userId, {
      data: config,
      timestamp: Date.now()
    });
    return config;
  } catch (error) {
    console.error("[Scheduling] Error fetching config:", error);
    return null;
  }
}
async function getSchedulingConfig(userId) {
  return getSchedulingConfigCached(userId);
}
async function getExceptionForDate(userId, date) {
  try {
    const { data, error } = await supabase.from("scheduling_exceptions").select("*").eq("user_id", userId).eq("exception_date", date).single();
    if (error || !data) return null;
    return data;
  } catch (error) {
    console.error("[Scheduling] Error fetching exception:", error);
    return null;
  }
}
async function getAppointmentsForDate(userId, date) {
  try {
    const { data, error } = await supabase.from("appointments").select("*").eq("user_id", userId).eq("appointment_date", date).in("status", ["pending", "confirmed"]).order("start_time", { ascending: true });
    if (error) {
      console.error("[Scheduling] Error fetching appointments:", error);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error("[Scheduling] Error fetching appointments:", error);
    return [];
  }
}
function isDayAvailable(date, config, exception) {
  const dateObj = /* @__PURE__ */ new Date(date + "T12:00:00");
  const dayOfWeek = dateObj.getDay();
  if (exception && (exception.exception_type === "blocked" || exception.exception_type === "holiday")) {
    return false;
  }
  if (!config.available_days.includes(dayOfWeek)) {
    return false;
  }
  const brazil = getBrazilDateTime();
  const todayBrazil = /* @__PURE__ */ new Date(brazil.dateStr + "T00:00:00");
  const targetDate = /* @__PURE__ */ new Date(date + "T00:00:00");
  if (targetDate < todayBrazil) {
    return false;
  }
  const maxDate = new Date(todayBrazil);
  maxDate.setDate(maxDate.getDate() + config.advance_booking_days);
  if (targetDate > maxDate) {
    return false;
  }
  return true;
}
async function getAvailableSlots(userId, date, providedConfig) {
  const config = providedConfig ?? await getSchedulingConfigCached(userId);
  console.log(`\u{1F4C5} [getAvailableSlots] Config para ${userId}:`, {
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
    console.log(`\u{1F4C5} [getAvailableSlots] \u274C Config n\xE3o habilitada ou n\xE3o encontrada`);
    return [];
  }
  const exception = await getExceptionForDate(userId, date);
  if (!isDayAvailable(date, config, exception)) {
    return [];
  }
  const existingAppointments = await getAppointmentsForDate(userId, date);
  let startTime = config.work_start_time;
  let endTime = config.work_end_time;
  if (exception?.exception_type === "modified_hours") {
    startTime = exception.custom_start_time || startTime;
    endTime = exception.custom_end_time || endTime;
  }
  const slots = [];
  const slotDuration = config.slot_duration;
  const buffer = config.buffer_between_appointments;
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;
  if (endMinutes === 0 || endMinutes > 0 && endMinutes <= startMinutes) {
    endMinutes = 24 * 60;
  }
  let breakStartMinutes = 0;
  let breakEndMinutes = 0;
  if (config.has_break && config.break_start_time && config.break_end_time) {
    const [bsH, bsM] = config.break_start_time.split(":").map(Number);
    const [beH, beM] = config.break_end_time.split(":").map(Number);
    breakStartMinutes = bsH * 60 + bsM;
    breakEndMinutes = beH * 60 + beM;
  }
  const brazil = getBrazilDateTime();
  const today = brazil.dateStr;
  let minSlotMinutes = 0;
  if (date === today) {
    const currentMinutes2 = brazil.date.getHours() * 60 + brazil.date.getMinutes();
    minSlotMinutes = currentMinutes2 + config.min_booking_notice_hours * 60;
  }
  let currentMinutes = startMinutes;
  let appointmentCount = existingAppointments.length;
  while (currentMinutes + slotDuration <= endMinutes) {
    const slotEndMinutes = currentMinutes + slotDuration;
    const isInBreak = config.has_break && currentMinutes < breakEndMinutes && slotEndMinutes > breakStartMinutes;
    const respectsMinNotice = currentMinutes >= minSlotMinutes;
    const underDailyLimit = appointmentCount < config.max_appointments_per_day;
    const slotStartStr = minutesToTime(currentMinutes);
    const slotEndStr = minutesToTime(slotEndMinutes);
    const hasConflict = existingAppointments.some((apt) => {
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
  const availableSlots = slots.filter((s) => s.available);
  console.log(`\u{1F4C5} [getAvailableSlots] ${date}: Gerados ${slots.length} slots, ${availableSlots.length} dispon\xEDveis`);
  console.log(`\u{1F4C5} [getAvailableSlots] Slots dispon\xEDveis:`, availableSlots.map((s) => s.start).slice(0, 10), availableSlots.length > 10 ? "..." : "");
  return slots;
}
async function createPendingAppointment(userId, clientName, clientPhone, appointmentDate, startTime, clientNotes, providedConfig, serviceName) {
  const config = providedConfig ?? await getSchedulingConfigCached(userId);
  if (!config || !config.is_enabled) {
    return { success: false, error: "Sistema de agendamento desativado" };
  }
  const slots = await getAvailableSlots(userId, appointmentDate, config);
  let selectedSlot = slots.find((s) => s.start === startTime && s.available);
  let adjustedTime;
  if (!selectedSlot) {
    const requestedMinutes = timeToMinutes(startTime);
    const availableSlots = slots.filter((s) => s.available);
    if (availableSlots.length > 0) {
      const TOLERANCE_MINUTES = 30;
      let closestSlot = null;
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
        console.log(`\u{1F4C5} [Scheduling] Hor\xE1rio ${startTime} n\xE3o dispon\xEDvel, ajustado para ${adjustedTime} (diferen\xE7a: ${minDiff}min)`);
      }
    }
  }
  if (!selectedSlot) {
    const availableSlots = slots.filter((s) => s.available).map((s) => s.start).join(", ");
    console.log(`\u{1F4C5} [Scheduling] Slot ${startTime} n\xE3o encontrado. Slots dispon\xEDveis: ${availableSlots || "nenhum"}`);
    return { success: false, error: "Hor\xE1rio n\xE3o dispon\xEDvel" };
  }
  const finalStartTime = selectedSlot.start;
  const startMinutes = timeToMinutes(finalStartTime);
  const endMinutes = startMinutes + config.slot_duration;
  const endTime = minutesToTime(endMinutes);
  const status = config.auto_confirm ? "confirmed" : "pending";
  try {
    const { data, error } = await supabase.from("appointments").insert({
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
      reminder_sent: false
    }).select().single();
    if (error) {
      console.error("[Scheduling] Error creating appointment:", error);
      return { success: false, error: "Erro ao criar agendamento" };
    }
    return { success: true, appointment: data, adjustedTime };
  } catch (error) {
    console.error("[Scheduling] Error creating appointment:", error);
    return { success: false, error: "Erro ao criar agendamento" };
  }
}
function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
function getBrazilDateTime() {
  const now = /* @__PURE__ */ new Date();
  const brazilTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dateStr = `${brazilTime.getFullYear()}-${(brazilTime.getMonth() + 1).toString().padStart(2, "0")}-${brazilTime.getDate().toString().padStart(2, "0")}`;
  const timeStr = `${String(brazilTime.getHours()).padStart(2, "0")}:${String(brazilTime.getMinutes()).padStart(2, "0")}`;
  return { date: brazilTime, dateStr, timeStr };
}
async function generateSchedulingPromptBlock(userId) {
  const config = await getSchedulingConfigCached(userId);
  if (!config || !config.is_enabled) {
    return "";
  }
  const daysMap = {
    0: "Domingo",
    1: "Segunda",
    2: "Ter\xE7a",
    3: "Quarta",
    4: "Quinta",
    5: "Sexta",
    6: "S\xE1bado"
  };
  const availableDaysText = config.available_days.map((d) => daysMap[d]).join(", ");
  let breakText = "";
  if (config.has_break) {
    breakText = ` (pausa ${config.break_start_time}-${config.break_end_time})`;
  }
  const brazil = getBrazilDateTime();
  const todayStr = brazil.dateStr;
  const todayDayName = daysMap[brazil.date.getDay()];
  const currentTime = brazil.timeStr;
  const tomorrow = new Date(brazil.date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${(tomorrow.getMonth() + 1).toString().padStart(2, "0")}-${tomorrow.getDate().toString().padStart(2, "0")}`;
  const tomorrowDayName = daysMap[tomorrow.getDay()];
  const todaySlots = await getAvailableSlots(userId, todayStr, config);
  const tomorrowSlots = await getAvailableSlots(userId, tomorrowStr, config);
  const todaySlotsAvailable = todaySlots.filter((s) => s.available).map((s) => s.start);
  const tomorrowSlotsAvailable = tomorrowSlots.filter((s) => s.available).map((s) => s.start);
  const todayAvailable = config.available_days.includes(brazil.date.getDay());
  const tomorrowAvailable = config.available_days.includes(tomorrow.getDay());
  const todayException = await getExceptionForDate(userId, todayStr);
  const tomorrowException = await getExceptionForDate(userId, tomorrowStr);
  let todayInfo = "";
  if (todayException && (todayException.exception_type === "blocked" || todayException.exception_type === "holiday")) {
    const reason = todayException.reason || (todayException.exception_type === "holiday" ? "feriado" : "dia de folga");
    todayInfo = `Hoje (${todayDayName}): N\xC3O ATENDEMOS (${reason})`;
  } else if (!todayAvailable) {
    todayInfo = `Hoje (${todayDayName}): n\xE3o atendemos neste dia da semana`;
  } else if (todaySlotsAvailable.length === 0) {
    todayInfo = `Hoje: hor\xE1rios esgotados ou j\xE1 passaram`;
  } else {
    todayInfo = `Hoje: ${todaySlotsAvailable.join(", ")}`;
  }
  let tomorrowInfo = "";
  if (tomorrowException && (tomorrowException.exception_type === "blocked" || tomorrowException.exception_type === "holiday")) {
    const reason = tomorrowException.reason || (tomorrowException.exception_type === "holiday" ? "feriado" : "dia de folga");
    tomorrowInfo = `Amanh\xE3 (${tomorrowDayName}): N\xC3O ATENDEMOS (${reason})`;
  } else if (!tomorrowAvailable) {
    tomorrowInfo = `Amanh\xE3 (${tomorrowDayName}): n\xE3o atendemos neste dia da semana`;
  } else if (tomorrowSlotsAvailable.length === 0) {
    tomorrowInfo = `Amanh\xE3: lotado`;
  } else {
    tomorrowInfo = `Amanh\xE3: ${tomorrowSlotsAvailable.join(", ")}`;
  }
  const cancellationInfo = config.allow_cancellation ? "O cliente pode cancelar seu agendamento a qualquer momento." : "O cliente N\xC3O pode cancelar pelo chat. Para cancelamentos, deve entrar em contato por outro meio.";
  let servicesText = "";
  try {
    const { data: services } = await supabase.from("scheduling_services").select("name, description, duration_minutes, price, is_active").eq("user_id", userId).eq("is_active", true).order("display_order", { ascending: true });
    if (services && services.length > 0) {
      servicesText = `

SERVI\xC7OS DISPON\xCDVEIS:
${services.map((s) => {
        let line = `\u2022 ${s.name}`;
        if (s.duration_minutes) line += ` (${s.duration_minutes} min)`;
        if (s.price) line += ` - R$ ${Number(s.price).toFixed(2).replace(".", ",")}`;
        if (s.description) line += ` - ${s.description}`;
        return line;
      }).join("\n")}
Sempre pergunte qual servi\xE7o o cliente deseja ao agendar!`;
    }
  } catch (e) {
  }
  const currentMinutes = brazil.date.getHours() * 60 + brazil.date.getMinutes();
  const minBookingMinutes = currentMinutes + config.min_booking_notice_hours * 60;
  const minBookingTime = minutesToTime(minBookingMinutes > 24 * 60 ? 24 * 60 : minBookingMinutes);
  const noticeText = config.min_booking_notice_hours > 0 ? `
\u23F0 ANTECED\xCANCIA M\xCDNIMA: ${config.min_booking_notice_hours}h (para hoje, s\xF3 hor\xE1rios a partir de ${minBookingTime})` : "";
  return `
---
\u{1F4C5} RECURSO DE AGENDAMENTO ATIVO
Agora: ${todayStr} ${currentTime} | Atendimento: ${availableDaysText}, ${config.work_start_time}-${config.work_end_time}${breakText}${noticeText}
${servicesText}

HOR\xC1RIOS DISPON\xCDVEIS (ATUALIZADOS EM TEMPO REAL):
\u2022 ${todayInfo}
\u2022 ${tomorrowInfo}

COMO RESPONDER QUANDO O HOR\xC1RIO PEDIDO N\xC3O EST\xC1 DISPON\xCDVEL:
- Por anteced\xEAncia: "Para hoje precisamos de ${config.min_booking_notice_hours}h de anteced\xEAncia. O pr\xF3ximo hor\xE1rio dispon\xEDvel \xE9 [hor\xE1rio da lista]."
- Se ocupado/lotado: "Esse hor\xE1rio j\xE1 est\xE1 reservado. Temos dispon\xEDvel: [hor\xE1rios da lista]."
- Fora do expediente: "Nosso hor\xE1rio \xE9 das ${config.work_start_time} \xE0s ${config.work_end_time}. Temos dispon\xEDvel: [hor\xE1rios da lista]."
- Dia de folga/feriado: Se o dia estiver marcado como "N\xC3O ATENDEMOS", explique o motivo entre par\xEAnteses e sugira o pr\xF3ximo dia com disponibilidade.
- Sempre ofere\xE7a o PR\xD3XIMO hor\xE1rio/dia dispon\xEDvel!

POL\xCDTICA DE CANCELAMENTO:
${cancellationInfo}

\u26A0\uFE0F REGRA CR\xCDTICA DE AGENDAMENTO:
PARA CADA CLIENTE diferente que quiser agendar, voc\xEA DEVE usar a tag [AGENDAR:].
A tag \xE9 o que REALMENTE cria o agendamento no sistema.
Sem a tag = sem agendamento = cliente n\xE3o vai receber confirma\xE7\xE3o/lembrete!

COMO USAR:
[AGENDAR: DATA=YYYY-MM-DD, HORA=HH:MM, NOME=Nome do Cliente, SERVICO=Nome do Servi\xE7o]

Exemplos:
- Hoje: DATA=${todayStr}
- Amanh\xE3: DATA=${tomorrowStr}

FLUXO DE AGENDAMENTO:
1. Cliente pergunta hor\xE1rios \u2192 Diga as op\xE7\xF5es dispon\xEDveis acima
2. Cliente escolhe hor\xE1rio \u2192 Pe\xE7a o nome e o servi\xE7o desejado
3. Tem hor\xE1rio, nome E servi\xE7o \u2192 USE A TAG! Ex: [AGENDAR: DATA=${tomorrowStr}, HORA=10:15, NOME=Jo\xE3o, SERVICO=Consulta]

Depois da tag, converse naturalmente sobre o agendamento.

\u26A0\uFE0F REGRA CR\xCDTICA DE CANCELAMENTO:
Quando o cliente pedir para CANCELAR um agendamento, voc\xEA DEVE usar a tag [CANCELAR:].
Sem a tag = o agendamento N\xC3O ser\xE1 realmente cancelado no sistema!

COMO USAR:
[CANCELAR: DATA=YYYY-MM-DD, HORA=HH:MM, NOME=Nome do Cliente]

FLUXO DE CANCELAMENTO:
1. Cliente pede para cancelar \u2192 Confirme os dados do agendamento
2. Ap\xF3s confirma\xE7\xE3o \u2192 USE A TAG! Ex: [CANCELAR: DATA=${tomorrowStr}, HORA=10:15, NOME=Jo\xE3o]
3. Ap\xF3s a tag, ofere\xE7a remarcar para outro hor\xE1rio dispon\xEDvel.
---
`;
}
async function processSchedulingTags(responseText, userId, clientPhone) {
  const schedulingTagRegex = /\[AGENDAR:\s*DATA=(\d{4}-\d{2}-\d{2}),\s*HORA=(\d{2}:\d{2}),\s*NOME=([^,\]]+)(?:,\s*SERVICO=([^\]]+))?\]/gi;
  let match = schedulingTagRegex.exec(responseText);
  let modifiedText = responseText;
  let appointmentCreated;
  let schedulingConfig = null;
  try {
    schedulingConfig = await getSchedulingConfigCached(userId);
  } catch (e) {
    console.error("\u{1F4C5} [Scheduling] Error fetching config:", e);
  }
  while (match) {
    const [fullMatch, date, time, clientName, serviceName] = match;
    console.log(`\u{1F4C5} [Scheduling] Detected scheduling tag: ${fullMatch}`);
    const result = await createPendingAppointment(
      userId,
      clientName.trim(),
      clientPhone,
      date,
      time,
      void 0,
      schedulingConfig,
      serviceName?.trim()
    );
    if (result.success && result.appointment) {
      console.log(`\u2705 [Scheduling] Appointment created: ${result.appointment.id}`);
      appointmentCreated = result.appointment;
      modifiedText = modifiedText.replace(fullMatch, "");
      const trimmed = modifiedText.trim();
      if (!trimmed.endsWith("\u2705") && !trimmed.endsWith("\u{1F4C5}") && !trimmed.endsWith("\u{1F44D}") && !trimmed.endsWith("\u{1F60A}")) {
        modifiedText = trimmed + " \u2705";
      }
    } else {
      console.log(`\u274C [Scheduling] Failed to create appointment: ${result.error}`);
      modifiedText = modifiedText.replace(fullMatch, "");
      if (modifiedText.trim() === "") {
        modifiedText = `Puxa, o hor\xE1rio ${time} n\xE3o est\xE1 mais dispon\xEDvel! \u{1F605} Mas sem problemas, posso verificar outros hor\xE1rios para voc\xEA. Qual hor\xE1rio prefere?`;
      }
    }
    match = schedulingTagRegex.exec(responseText);
  }
  return { text: modifiedText.trim(), appointmentCreated };
}
async function processSchedulingCancelTags(responseText, userId, clientPhone) {
  const cancelTagRegex = /\[CANCELAR:\s*DATA=(\d{4}-\d{2}-\d{2}),\s*HORA=(\d{2}:\d{2}),\s*NOME=([^\]]+)\]/gi;
  let match = cancelTagRegex.exec(responseText);
  let modifiedText = responseText;
  let appointmentCancelled = false;
  while (match) {
    const [fullMatch, date, time, clientName] = match;
    console.log(`\u{1F4C5} [Scheduling] Detected cancellation tag: ${fullMatch}`);
    try {
      const { data: appointments, error } = await supabase.from("appointments").select("*").eq("user_id", userId).eq("appointment_date", date).eq("start_time", `${time}:00`).in("status", ["pending", "confirmed"]).limit(5);
      if (error) {
        console.error(`\u274C [Scheduling] Error finding appointment to cancel:`, error);
        modifiedText = modifiedText.replace(fullMatch, "");
        match = cancelTagRegex.exec(responseText);
        continue;
      }
      let appointmentToCancel = appointments?.find(
        (a) => a.client_name?.toLowerCase().trim() === clientName.trim().toLowerCase() || a.client_phone === clientPhone
      );
      if (!appointmentToCancel && appointments && appointments.length > 0) {
        appointmentToCancel = appointments[0];
      }
      if (appointmentToCancel) {
        const { error: updateError } = await supabase.from("appointments").update({
          status: "cancelled",
          cancelled_at: (/* @__PURE__ */ new Date()).toISOString(),
          cancelled_by: "client",
          cancellation_reason: "Cancelado pelo cliente via IA",
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }).eq("id", appointmentToCancel.id);
        if (!updateError) {
          console.log(`\u2705 [Scheduling] Appointment cancelled: ${appointmentToCancel.id}`);
          appointmentCancelled = true;
          modifiedText = modifiedText.replace(fullMatch, "");
        } else {
          console.error(`\u274C [Scheduling] Error cancelling appointment:`, updateError);
          modifiedText = modifiedText.replace(fullMatch, "");
        }
      } else {
        console.log(`\u26A0\uFE0F [Scheduling] No matching appointment found to cancel for ${date} ${time} ${clientName}`);
        modifiedText = modifiedText.replace(fullMatch, "");
      }
    } catch (err) {
      console.error(`\u274C [Scheduling] Exception cancelling appointment:`, err);
      modifiedText = modifiedText.replace(fullMatch, "");
    }
    match = cancelTagRegex.exec(responseText);
  }
  return { text: modifiedText.trim(), appointmentCancelled };
}
async function getNextAvailableSlots(userId, maxSlots = 5) {
  const result = [];
  const today = /* @__PURE__ */ new Date();
  for (let i = 0; i < 14 && result.length < maxSlots; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = formatDate(date);
    const slots = await getAvailableSlots(userId, dateStr);
    const availableSlots = slots.filter((s) => s.available);
    if (availableSlots.length > 0) {
      result.push({
        date: dateStr,
        slots: availableSlots.slice(0, 3)
        // Max 3 slots por dia
      });
    }
  }
  return result;
}
function formatAvailableSlotsForAI(slotsData) {
  if (slotsData.length === 0) {
    return "N\xE3o h\xE1 hor\xE1rios dispon\xEDveis nos pr\xF3ximos dias.";
  }
  const lines = ["\u{1F4C5} *Hor\xE1rios dispon\xEDveis:*"];
  for (const dayData of slotsData) {
    const dateObj = /* @__PURE__ */ new Date(dayData.date + "T12:00:00");
    const dayNames = ["Domingo", "Segunda", "Ter\xE7a", "Quarta", "Quinta", "Sexta", "S\xE1bado"];
    const dayName = dayNames[dateObj.getDay()];
    const formattedDate = `${dateObj.getDate().toString().padStart(2, "0")}/${(dateObj.getMonth() + 1).toString().padStart(2, "0")}`;
    const times = dayData.slots.map((s) => s.start).join(", ");
    lines.push(`\u2022 *${dayName} (${formattedDate}):* ${times}`);
  }
  lines.push("\nQual hor\xE1rio fica melhor para voc\xEA?");
  return lines.join("\n");
}

export {
  invalidateSchedulingCache,
  isSchedulingEnabled,
  detectSchedulingIntent,
  getSchedulingConfigCached,
  getSchedulingConfig,
  getExceptionForDate,
  getAppointmentsForDate,
  isDayAvailable,
  getAvailableSlots,
  createPendingAppointment,
  generateSchedulingPromptBlock,
  processSchedulingTags,
  processSchedulingCancelTags,
  getNextAvailableSlots,
  formatAvailableSlotsForAI
};
