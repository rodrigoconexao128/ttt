/**
 * SALON ROUTES - ROTAS PARA O SISTEMA DE AGENDAMENTOS DE SALÃO
 */

import type { Express, Request, Response, NextFunction } from "express";
import { isAuthenticated, supabase } from "./supabaseAuth";
import {
  getAvailableStartTimes,
  validateSlot,
  computeMinNoticeMinutes,
  computeBreakWindow,
  type SalonConfig
} from "./salonAvailability";

function getUserId(req: any): string {
  return req.session?.user?.id || req.user?.id || "";
}

export function registerSalonRoutes(app: Express): void {
  console.log("💇 [Salon] Registrando rotas de salão...");

  // ═══════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÃO DO SALÃO
  // ═══════════════════════════════════════════════════════════════════════

  // GET - Obter configuração do salão
  app.get("/api/salon/config", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      
      const { data, error } = await supabase
        .from("salon_config")
        .select("*")
        .eq("user_id", userId)
        .single();
      
      if (error && error.code !== "PGRST116") throw error;
      
      // Retorna config padrão se não existir
      if (!data) {
        return res.json({
          id: null,
          user_id: userId,
          is_active: false,
          send_to_ai: true,
          salon_name: null,
          salon_type: "salon",
          phone: null,
          address: null,
          opening_hours: {
            monday: { enabled: true, open: "09:00", close: "19:00" },
            tuesday: { enabled: true, open: "09:00", close: "19:00" },
            wednesday: { enabled: true, open: "09:00", close: "19:00" },
            thursday: { enabled: true, open: "09:00", close: "19:00" },
            friday: { enabled: true, open: "09:00", close: "19:00" },
            saturday: { enabled: true, open: "09:00", close: "17:00" },
            sunday: { enabled: false, open: "09:00", close: "17:00" },
          },
          slot_duration: 30,
          buffer_between: 10,
          max_advance_days: 30,
          min_notice_hours: 2,
          min_notice_minutes: 0,  // NOVO: antecedência em minutos
          allow_cancellation: true,
          cancellation_notice_hours: 4,
          use_services: true,
          use_professionals: true,
          allow_multiple_services: false,
          welcome_message: "Olá {cliente_nome}! 💇 Bem-vindo(a) ao nosso salão! Como posso ajudar você hoje?",
          booking_confirmation_message: "Perfeito! ✅ Seu agendamento foi confirmado:\n📅 {data}\n⏰ {horario}\n💇 {servico}\n👤 {profissional}\n\nAguardamos você!",
          reminder_message: "Lembrete: Você tem um agendamento amanhã às {horario}. Até lá! 💇",
          cancellation_message: "Agendamento cancelado. Se precisar remarcar, é só me chamar! 💬",
          closed_message: "Desculpe, estamos fechados no momento. Nossos horários: {horarios}",
          humanize_responses: true,
          use_customer_name: true,
          response_variation: true,
          response_delay_min: 1000,
          response_delay_max: 3000,
          ai_instructions: "",
          display_instructions: null,
        });
      }
      
      res.json(data);
    } catch (error) {
      console.error("❌ [Salon] Error fetching salon config:", error);
      res.status(500).json({ message: "Failed to fetch salon config" });
    }
  });

  // PUT - Atualizar configuração do salão
  app.put("/api/salon/config", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const body = req.body;
      
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      
      // Mapear campos
      const allowedFields = [
        "is_active", "send_to_ai", "salon_name", "salon_type", "phone", "address",
        "opening_hours", "slot_duration", "buffer_between", "max_advance_days",
        "min_notice_hours", "min_notice_minutes", "allow_cancellation", "cancellation_notice_hours",
        "use_services", "use_professionals", "allow_multiple_services",
        "welcome_message", "booking_confirmation_message", "reminder_message",
        "cancellation_message", "closed_message", "humanize_responses",
        "use_customer_name", "response_variation", "response_delay_min",
        "response_delay_max", "ai_instructions", "display_instructions",
      ];
      
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updateData[field] = body[field];
        }
      }
      
      // Verificar se já existe
      const { data: existing } = await supabase
        .from("salon_config")
        .select("id, opening_hours")
        .eq("user_id", userId)
        .single();

      // 🔒 Garantir persistência do horário de almoço (__break)
      // Se frontend/cliente enviar opening_hours sem __break, preserva o valor existente no banco.
      if (updateData.opening_hours && typeof updateData.opening_hours === "object") {
        const incomingOpeningHours = updateData.opening_hours as Record<string, any>;
        const incomingBreak = incomingOpeningHours.__break;
        const existingBreak = (existing?.opening_hours as Record<string, any> | undefined)?.__break;

        if (incomingBreak === undefined && existingBreak) {
          updateData.opening_hours = {
            ...incomingOpeningHours,
            __break: existingBreak,
          };
        }
      }
      
      let result;
      if (existing) {
        // Update
        const { data, error } = await supabase
          .from("salon_config")
          .update(updateData)
          .eq("user_id", userId)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        // Insert
        const { data, error } = await supabase
          .from("salon_config")
          .insert({ ...updateData, user_id: userId })
          .select()
          .single();
        if (error) throw error;
        result = data;
      }
      
      console.log(`✅ [Salon] Config atualizada para user: ${userId}`);
      res.json(result);
    } catch (error) {
      console.error("❌ [Salon] Error updating salon config:", error);
      res.status(500).json({ message: "Failed to update salon config" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // SERVIÇOS
  // ═══════════════════════════════════════════════════════════════════════

  // GET - Listar serviços
  app.get("/api/salon/services", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      
      const { data, error } = await supabase
        .from("scheduling_services")
        .select("*")
        .eq("user_id", userId)
        .order("display_order", { ascending: true });
      
      if (error) throw error;
      
      res.json(data || []);
    } catch (error) {
      console.error("❌ [Salon] Error fetching services:", error);
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  // POST - Criar serviço
  app.post("/api/salon/services", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { name, description, duration_minutes, price, is_active, color } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: "Nome é obrigatório" });
      }

      const parsedDuration = Number(duration_minutes ?? 30);
      if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
        return res.status(400).json({ message: "Duração do serviço inválida" });
      }
      
      // Obter próximo display_order
      const { data: existing } = await supabase
        .from("scheduling_services")
        .select("display_order")
        .eq("user_id", userId)
        .order("display_order", { ascending: false })
        .limit(1);
      
      const nextOrder = (existing?.[0]?.display_order || 0) + 1;
      
      const { data, error } = await supabase
        .from("scheduling_services")
        .insert({
          user_id: userId,
          name,
          description: description || null,
          duration_minutes: parsedDuration,
          price: price ? parseFloat(price) : null,
          is_active: is_active !== false,
          color: color || "#6366f1",
          display_order: nextOrder,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      console.log(`✅ [Salon] Serviço criado: ${name}`);
      res.json(data);
    } catch (error) {
      console.error("❌ [Salon] Error creating service:", error);
      res.status(500).json({ message: "Failed to create service" });
    }
  });

  // PUT - Atualizar serviço
  app.put("/api/salon/services/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;
      const { name, description, duration_minutes, price, is_active, color } = req.body;

      const parsedDuration = Number(duration_minutes ?? 30);
      if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
        return res.status(400).json({ message: "Duração do serviço inválida" });
      }
      
      const { data, error } = await supabase
        .from("scheduling_services")
        .update({
          name,
          description: description || null,
          duration_minutes: parsedDuration,
          price: price ? parseFloat(price) : null,
          is_active,
          color: color || "#6366f1",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      
      if (error) throw error;
      
      res.json(data);
    } catch (error) {
      console.error("❌ [Salon] Error updating service:", error);
      res.status(500).json({ message: "Failed to update service" });
    }
  });

  // DELETE - Remover serviço
  app.delete("/api/salon/services/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;
      
      const { error } = await supabase
        .from("scheduling_services")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      
      if (error) throw error;
      
      res.json({ success: true });
    } catch (error) {
      console.error("❌ [Salon] Error deleting service:", error);
      res.status(500).json({ message: "Failed to delete service" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // PROFISSIONAIS
  // ═══════════════════════════════════════════════════════════════════════

  // GET - Listar profissionais
  app.get("/api/salon/professionals", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      
      const { data, error } = await supabase
        .from("scheduling_professionals")
        .select("*")
        .eq("user_id", userId)
        .order("display_order", { ascending: true });
      
      if (error) throw error;
      
      res.json(data || []);
    } catch (error) {
      console.error("❌ [Salon] Error fetching professionals:", error);
      res.status(500).json({ message: "Failed to fetch professionals" });
    }
  });

  // POST - Criar profissional
  app.post("/api/salon/professionals", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { name, bio, avatar_url, is_active } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: "Nome é obrigatório" });
      }
      
      // Obter próximo display_order
      const { data: existing } = await supabase
        .from("scheduling_professionals")
        .select("display_order")
        .eq("user_id", userId)
        .order("display_order", { ascending: false })
        .limit(1);
      
      const nextOrder = (existing?.[0]?.display_order || 0) + 1;
      
      const { data, error } = await supabase
        .from("scheduling_professionals")
        .insert({
          user_id: userId,
          name,
          bio: bio || null,
          avatar_url: avatar_url || null,
          is_active: is_active !== false,
          display_order: nextOrder,
          work_schedule: {},
        })
        .select()
        .single();
      
      if (error) throw error;
      
      console.log(`✅ [Salon] Profissional criado: ${name}`);
      res.json(data);
    } catch (error) {
      console.error("❌ [Salon] Error creating professional:", error);
      res.status(500).json({ message: "Failed to create professional" });
    }
  });

  // PUT - Atualizar profissional
  app.put("/api/salon/professionals/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;
      const { name, bio, avatar_url, is_active } = req.body;
      
      const { data, error } = await supabase
        .from("scheduling_professionals")
        .update({
          name,
          bio: bio || null,
          avatar_url: avatar_url || null,
          is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      
      if (error) throw error;
      
      res.json(data);
    } catch (error) {
      console.error("❌ [Salon] Error updating professional:", error);
      res.status(500).json({ message: "Failed to update professional" });
    }
  });

  // DELETE - Remover profissional
  app.delete("/api/salon/professionals/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;
      
      const { error } = await supabase
        .from("scheduling_professionals")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      
      if (error) throw error;
      
      res.json({ success: true });
    } catch (error) {
      console.error("❌ [Salon] Error deleting professional:", error);
      res.status(500).json({ message: "Failed to delete professional" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // AGENDAMENTOS
  // ═══════════════════════════════════════════════════════════════════════

  // GET - Listar agendamentos
  app.get("/api/salon/appointments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { date, status, limit } = req.query;
      
      let query = supabase
        .from("appointments")
        .select("*")
        .eq("user_id", userId)
        .order("appointment_date", { ascending: false })
        .order("start_time", { ascending: true });
      
      if (date) {
        query = query.eq("appointment_date", date);
      }
      
      if (status && status !== "all") {
        query = query.eq("status", status);
      }
      
      if (limit) {
        query = query.limit(parseInt(limit as string));
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      res.json(data || []);
    } catch (error) {
      console.error("❌ [Salon] Error fetching appointments:", error);
      res.status(500).json({ message: "Failed to fetch appointments" });
    }
  });

  // GET - Buscar agendamento por ID
  app.get("/api/salon/appointments/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;
      
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();
      
      if (error) throw error;
      
      res.json(data);
    } catch (error) {
      console.error("❌ [Salon] Error fetching appointment:", error);
      res.status(500).json({ message: "Failed to fetch appointment" });
    }
  });

  // PUT - Atualizar status do agendamento
  app.put("/api/salon/appointments/:id/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;
      const { status } = req.body;
      
      const validStatuses = ["pending", "confirmed", "completed", "cancelled", "no_show"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Status inválido" });
      }
      
      const { data, error } = await supabase
        .from("appointments")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      
      if (error) throw error;
      
      console.log(`✅ [Salon] Agendamento ${id} atualizado para: ${status}`);
      res.json(data);
    } catch (error) {
      console.error("❌ [Salon] Error updating appointment:", error);
      res.status(500).json({ message: "Failed to update appointment" });
    }
  });

  // DELETE - Cancelar agendamento
  app.delete("/api/salon/appointments/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;
      
      // Soft delete - muda status para cancelled
      const { data, error } = await supabase
        .from("appointments")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      
      if (error) throw error;
      
      res.json({ success: true, data });
    } catch (error) {
      console.error("❌ [Salon] Error cancelling appointment:", error);
      res.status(500).json({ message: "Failed to cancel appointment" });
    }
  });

  // GET - Horários disponíveis para uma data
  app.get("/api/salon/available-slots", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { date, professionalId, serviceDuration } = req.query;

      if (!date) {
        return res.status(400).json({ message: "Data é obrigatória" });
      }

      const slotDuration = serviceDuration ? parseInt(serviceDuration as string) : 30;

      // Usar novo módulo de disponibilidade
      const availableSlots = await getAvailableStartTimes({
        userId,
        date: date as string,
        professionalId: professionalId as string | undefined,
        serviceDurationMinutes: slotDuration,
        stepMinutes: 5,
      });

      res.json(availableSlots);
    } catch (error) {
      console.error("❌ [Salon] Error fetching available slots:", error);
      res.status(500).json({ message: "Failed to fetch available slots" });
    }
  });

  // GET - Estatísticas do salão
  app.get("/api/salon/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const today = new Date().toISOString().split("T")[0];
      
      // Agendamentos de hoje
      const { data: todayAppointments } = await supabase
        .from("appointments")
        .select("*")
        .eq("user_id", userId)
        .eq("appointment_date", today)
        .neq("status", "cancelled");
      
      // Agendamentos da semana
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekStartStr = weekStart.toISOString().split("T")[0];
      
      const { data: weekAppointments } = await supabase
        .from("appointments")
        .select("*")
        .eq("user_id", userId)
        .gte("appointment_date", weekStartStr)
        .neq("status", "cancelled");
      
      res.json({
        today: {
          total: todayAppointments?.length || 0,
          pending: todayAppointments?.filter(a => a.status === "pending").length || 0,
          confirmed: todayAppointments?.filter(a => a.status === "confirmed").length || 0,
          completed: todayAppointments?.filter(a => a.status === "completed").length || 0,
        },
        week: {
          total: weekAppointments?.length || 0,
        },
      });
    } catch (error) {
      console.error("❌ [Salon] Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  console.log("✅ [Salon] Rotas de salão registradas com sucesso!");
}
