import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { getAuthToken } from "@/lib/supabase";
import { ptBR } from "date-fns/locale";
import { 
  CalendarClock, 
  Settings, 
  Plus, 
  Check, 
  X, 
  Clock, 
  MapPin, 
  User, 
  Phone,
  CalendarDays,
  Loader2,
  Ban,
  CheckCircle2,
  AlertCircle,
  Trash2,
  RefreshCw,
  Calendar as CalendarIcon,
  Link2,
  Link2Off,
  Briefcase,
  Users,
  Palette,
  DollarSign,
  Edit,
  Mail,
  Bell
} from "lucide-react";
import { cn } from "@/lib/utils";

// Types
interface SchedulingConfig {
  id?: string;
  isEnabled: boolean;
  serviceName: string;
  serviceDuration: number;
  location: string;
  locationType: string;
  availableDays: number[];
  workStartTime: string;
  workEndTime: string;
  breakStartTime: string;
  breakEndTime: string;
  hasBreak: boolean;
  slotDuration: number;
  bufferBetweenAppointments: number;
  maxAppointmentsPerDay: number;
  advanceBookingDays: number;
  minBookingNoticeHours: number;
  requireConfirmation: boolean;
  autoConfirm: boolean;
  allowCancellation: boolean;
  sendReminder: boolean;
  reminderHoursBefore: number;
  // Novas opções
  useServices?: boolean;
  useProfessionals?: boolean;
  aiSchedulingEnabled?: boolean;
  aiCanSuggestProfessional?: boolean;
  aiCanSuggestService?: boolean;
  googleCalendarEnabled?: boolean;
}

interface Appointment {
  id: string;
  client_name: string;
  client_phone: string;
  client_email?: string;
  service_name?: string;
  service_id?: string;
  professional_id?: string;
  professional_name?: string;
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
  created_at: string;
  google_event_id?: string;
}

interface SchedulingException {
  id: string;
  exception_date: string;
  exception_type: 'blocked' | 'modified_hours' | 'holiday';
  custom_start_time?: string;
  custom_end_time?: string;
  reason?: string;
}

// Novas interfaces para serviços e profissionais
interface SchedulingService {
  id: string;
  name: string;
  description?: string;
  durationMinutes: number;
  price?: number;
  isActive: boolean;
  allowOnline: boolean;
  allowPresencial: boolean;
  requiresConfirmation: boolean;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  maxPerDay?: number;
  color: string;
  icon?: string;
  displayOrder: number;
}

interface SchedulingProfessional {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  specialty?: string;
  bio?: string;
  workStartTime: string;
  workEndTime: string;
  breakStartTime: string;
  breakEndTime: string;
  availableDays: number[];
  isActive: boolean;
  isDefault: boolean;
  acceptsOnline: boolean;
  acceptsPresencial: boolean;
  maxAppointmentsPerDay: number;
  displayOrder: number;
  assignedServices?: string[];
}

interface GoogleCalendarStatus {
  isConnected: boolean;
  configured: boolean;
  email?: string;
}

// Transform functions for snake_case to camelCase
const transformService = (data: any): SchedulingService => ({
  id: data.id,
  name: data.name,
  description: data.description,
  durationMinutes: data.duration_minutes ?? data.durationMinutes ?? 60,
  price: data.price,
  isActive: data.is_active ?? data.isActive ?? true,
  allowOnline: data.allow_online ?? data.allowOnline ?? true,
  allowPresencial: data.allow_presencial ?? data.allowPresencial ?? true,
  requiresConfirmation: data.requires_confirmation ?? data.requiresConfirmation ?? false,
  bufferBeforeMinutes: data.buffer_before_minutes ?? data.bufferBeforeMinutes ?? 0,
  bufferAfterMinutes: data.buffer_after_minutes ?? data.bufferAfterMinutes ?? 0,
  maxPerDay: data.max_per_day ?? data.maxPerDay,
  color: data.color ?? '#3B82F6',
  icon: data.icon,
  displayOrder: data.display_order ?? data.displayOrder ?? 0,
});

const transformProfessional = (data: any): SchedulingProfessional => ({
  id: data.id,
  name: data.name,
  email: data.email,
  phone: data.phone,
  photoUrl: data.photo_url ?? data.photoUrl,
  specialty: data.specialty,
  bio: data.bio,
  workStartTime: data.work_start_time ?? data.workStartTime ?? '09:00',
  workEndTime: data.work_end_time ?? data.workEndTime ?? '18:00',
  breakStartTime: data.break_start_time ?? data.breakStartTime ?? '12:00',
  breakEndTime: data.break_end_time ?? data.breakEndTime ?? '13:00',
  availableDays: data.available_days ?? data.availableDays ?? [1, 2, 3, 4, 5],
  isActive: data.is_active ?? data.isActive ?? true,
  isDefault: data.is_default ?? data.isDefault ?? false,
  acceptsOnline: data.accepts_online ?? data.acceptsOnline ?? true,
  acceptsPresencial: data.accepts_presencial ?? data.acceptsPresencial ?? true,
  maxAppointmentsPerDay: data.max_appointments_per_day ?? data.maxAppointmentsPerDay ?? 20,
  displayOrder: data.display_order ?? data.displayOrder ?? 0,
  assignedServices: data.assigned_services ?? data.assignedServices ?? [],
});

const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo', short: 'Dom' },
  { value: 1, label: 'Segunda', short: 'Seg' },
  { value: 2, label: 'Terça', short: 'Ter' },
  { value: 3, label: 'Quarta', short: 'Qua' },
  { value: 4, label: 'Quinta', short: 'Qui' },
  { value: 5, label: 'Sexta', short: 'Sex' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
];

const STATUS_CONFIG = {
  pending: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle },
  confirmed: { label: 'Confirmado', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800', icon: X },
  completed: { label: 'Concluído', color: 'bg-blue-100 text-blue-800', icon: Check },
  no_show: { label: 'Não compareceu', color: 'bg-gray-100 text-gray-800', icon: Ban },
};

// Helper de fetch autenticado para agendamentos
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
}

// Google Calendar Integration Component
export default function SchedulingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("appointments");
  const [newAppointmentOpen, setNewAppointmentOpen] = useState(false);
  const [newExceptionOpen, setNewExceptionOpen] = useState(false);
  const [newServiceOpen, setNewServiceOpen] = useState(false);
  const [newProfessionalOpen, setNewProfessionalOpen] = useState(false);
  const [editingService, setEditingService] = useState<SchedulingService | null>(null);
  const [editingProfessional, setEditingProfessional] = useState<SchedulingProfessional | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  // Helper para converter snake_case do servidor para camelCase
  const transformConfig = (data: any): SchedulingConfig => ({
    id: data.id,
    isEnabled: data.is_enabled ?? false,
    serviceName: data.service_name ?? '',
    serviceDuration: data.service_duration ?? 60,
    location: data.location ?? '',
    locationType: data.location_type ?? 'presencial',
    availableDays: data.available_days ?? [1, 2, 3, 4, 5],
    workStartTime: data.work_start_time ?? '09:00',
    workEndTime: data.work_end_time ?? '18:00',
    breakStartTime: data.break_start_time ?? '12:00',
    breakEndTime: data.break_end_time ?? '13:00',
    hasBreak: data.has_break ?? true,
    slotDuration: data.slot_duration ?? 60,
    bufferBetweenAppointments: data.buffer_between_appointments ?? 15,
    maxAppointmentsPerDay: data.max_appointments_per_day ?? 10,
    advanceBookingDays: data.advance_booking_days ?? 30,
    minBookingNoticeHours: data.min_booking_notice_hours ?? 2,
    requireConfirmation: data.require_confirmation ?? true,
    autoConfirm: data.auto_confirm ?? false,
    allowCancellation: data.allow_cancellation ?? true,
    sendReminder: data.send_reminder ?? true,
    reminderHoursBefore: data.reminder_hours_before ?? 24,
    useServices: data.use_services ?? false,
    useProfessionals: data.use_professionals ?? false,
    aiSchedulingEnabled: data.ai_scheduling_enabled ?? true,
    aiCanSuggestProfessional: data.ai_can_suggest_professional ?? true,
    aiCanSuggestService: data.ai_can_suggest_service ?? true,
    googleCalendarEnabled: data.google_calendar_enabled ?? false,
  });

  // Fetch config
  const { data: config, isLoading: configLoading } = useQuery<SchedulingConfig>({
    queryKey: ['scheduling-config'],
    queryFn: async () => {
      const res = await authFetch('/api/scheduling/config');
      if (!res.ok) throw new Error('Failed to fetch config');
      const data = await res.json();
      return transformConfig(data);
    },
  });

  // Fetch Google Calendar status
  const { data: googleCalendarStatus, refetch: refetchGoogleStatus } = useQuery<GoogleCalendarStatus>({
    queryKey: ['google-calendar-status'],
    queryFn: async () => {
      const res = await authFetch('/api/scheduling/google-calendar/status');
      if (!res.ok) return { isConnected: false, configured: false };
      const data = await res.json();
      return {
        isConnected: data.isConnected || data.connected || false,
        email: data.email || data.userEmail,
        configured: data.configured ?? true,
      };
    },
  });

  // Fetch services
  const { data: services = [], refetch: refetchServices } = useQuery<SchedulingService[]>({
    queryKey: ['scheduling-services'],
    queryFn: async () => {
      const res = await authFetch('/api/scheduling/services');
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data.map(transformService) : [];
    },
  });

  // Fetch professionals
  const { data: professionals = [], refetch: refetchProfessionals } = useQuery<SchedulingProfessional[]>({
    queryKey: ['scheduling-professionals'],
    queryFn: async () => {
      const res = await authFetch('/api/scheduling/professionals?withServices=true');
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data.map(transformProfessional) : [];
    },
  });

  // Fetch appointments
  const { data: appointments = [], isLoading: appointmentsLoading, refetch: refetchAppointments } = useQuery<Appointment[]>({
    queryKey: ['appointments', filterStatus],
    queryFn: async () => {
      let url = '/api/scheduling/appointments';
      if (filterStatus && filterStatus !== 'all') {
        url += `?status=${filterStatus}`;
      }
      const res = await authFetch(url);
      if (!res.ok) throw new Error('Failed to fetch appointments');
      return res.json();
    },
  });

  const selectedDateKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const selectedDayAppointments = selectedDateKey
    ? appointments.filter(apt => format(parseISO(apt.appointment_date), "yyyy-MM-dd") === selectedDateKey)
    : [];

  // Fetch exceptions
  const { data: exceptions = [] } = useQuery<SchedulingException[]>({
    queryKey: ['scheduling-exceptions'],
    queryFn: async () => {
      const res = await authFetch('/api/scheduling/exceptions');
      if (!res.ok) throw new Error('Failed to fetch exceptions');
      return res.json();
    },
  });

  // Save config mutation
  const saveConfigMutation = useMutation({
    mutationFn: async (newConfig: Partial<SchedulingConfig>) => {
      const res = await authFetch('/api/scheduling/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      if (!res.ok) throw new Error('Failed to save config');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-config'] });
      toast({ title: "✅ Configurações salvas!", description: "As alterações foram aplicadas." });
    },
    onError: () => {
      toast({ title: "❌ Erro", description: "Não foi possível salvar as configurações.", variant: "destructive" });
    },
  });

  // Create appointment mutation
  const createAppointmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await authFetch('/api/scheduling/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to create appointment');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      setNewAppointmentOpen(false);
      toast({ title: "✅ Agendamento criado!", description: "O agendamento foi adicionado com sucesso." });
    },
    onError: (error: Error) => {
      toast({ title: "❌ Erro", description: error.message, variant: "destructive" });
    },
  });

  // Confirm appointment mutation
  const confirmAppointmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/scheduling/appointments/${id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmedBy: 'business' }),
      });
      if (!res.ok) throw new Error('Failed to confirm');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast({ title: "✅ Confirmado!", description: "O agendamento foi confirmado." });
    },
  });

  // Cancel appointment mutation
  const cancelAppointmentMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const res = await authFetch(`/api/scheduling/appointments/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelledBy: 'business', reason }),
      });
      if (!res.ok) throw new Error('Failed to cancel');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast({ title: "❌ Cancelado", description: "O agendamento foi cancelado." });
    },
  });

  // Complete appointment mutation
  const completeAppointmentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await authFetch(`/api/scheduling/appointments/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to complete');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      toast({ title: "✅ Status atualizado!" });
    },
  });

  // Create exception mutation
  const createExceptionMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await authFetch('/api/scheduling/exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create exception');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-exceptions'] });
      setNewExceptionOpen(false);
      toast({ title: "✅ Exceção criada!" });
    },
  });

  // Delete exception mutation
  const deleteExceptionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/scheduling/exceptions/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-exceptions'] });
      toast({ title: "✅ Exceção removida!" });
    },
  });

  // ==================== SERVICES MUTATIONS ====================
  const createServiceMutation = useMutation({
    mutationFn: async (data: Partial<SchedulingService>) => {
      const res = await authFetch('/api/scheduling/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create service');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-services'] });
      setNewServiceOpen(false);
      setEditingService(null);
      toast({ title: "✅ Serviço criado com sucesso!" });
    },
  });

  const updateServiceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SchedulingService> }) => {
      const res = await authFetch(`/api/scheduling/services/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update service');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-services'] });
      setEditingService(null);
      toast({ title: "✅ Serviço atualizado!" });
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/scheduling/services/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete service');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-services'] });
      toast({ title: "✅ Serviço removido!" });
    },
  });

  // ==================== PROFESSIONALS MUTATIONS ====================
  const createProfessionalMutation = useMutation({
    mutationFn: async (data: Partial<SchedulingProfessional>) => {
      const res = await authFetch('/api/scheduling/professionals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create professional');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-professionals'] });
      setNewProfessionalOpen(false);
      setEditingProfessional(null);
      toast({ title: "✅ Profissional adicionado!" });
    },
  });

  const updateProfessionalMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SchedulingProfessional> }) => {
      const res = await authFetch(`/api/scheduling/professionals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update professional');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-professionals'] });
      setEditingProfessional(null);
      toast({ title: "✅ Profissional atualizado!" });
    },
  });

  const deleteProfessionalMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/scheduling/professionals/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete professional');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-professionals'] });
      toast({ title: "✅ Profissional removido!" });
    },
  });

  const assignServicesToProfessionalMutation = useMutation({
    mutationFn: async ({ professionalId, serviceIds }: { professionalId: string; serviceIds: string[] }) => {
      const res = await authFetch(`/api/scheduling/professionals/${professionalId}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_ids: serviceIds }),
      });
      if (!res.ok) throw new Error('Failed to assign services');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-professionals'] });
      toast({ title: "✅ Serviços atribuídos!" });
    },
  });

  // ==================== GOOGLE CALENDAR MUTATIONS ====================
  const connectGoogleCalendarMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/scheduling/google-calendar/connect');
      if (!res.ok) throw new Error('Failed to get Google auth URL');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.authUrl) {
        window.open(data.authUrl, '_blank', 'width=500,height=600');
      }
    },
  });

  const disconnectGoogleCalendarMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/scheduling/google-calendar/disconnect', {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to disconnect');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      toast({ title: "✅ Google Calendar desconectado!" });
    },
  });

  const toggleGoogleCalendarSyncMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await authFetch('/api/scheduling/config/advanced', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ google_calendar_enabled: enabled }),
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-config'] });
      toast({ title: "✅ Sincronização atualizada!" });
    },
  });

  const toggleAdvancedConfigMutation = useMutation({
    mutationFn: async (data: { use_services?: boolean; use_professionals?: boolean; ai_scheduling_enabled?: boolean }) => {
      const res = await authFetch('/api/scheduling/config/advanced', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update config');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-config'] });
      toast({ title: "✅ Configuração atualizada!" });
    },
  });

  // Form state for config
  const [configForm, setConfigForm] = useState<Partial<SchedulingConfig>>({});

  useEffect(() => {
    if (config) {
      setConfigForm(config);
    }
  }, [config]);

  // New appointment form
  const [appointmentForm, setAppointmentForm] = useState({
    clientName: '',
    clientPhone: '',
    clientEmail: '',
    appointmentDate: format(new Date(), 'yyyy-MM-dd'),
    startTime: '09:00',
    endTime: '10:00',
    clientNotes: '',
  });

  // New exception form
  const [exceptionForm, setExceptionForm] = useState({
    exceptionDate: format(new Date(), 'yyyy-MM-dd'),
    exceptionType: 'blocked' as 'blocked' | 'modified_hours' | 'holiday',
    customStartTime: '09:00',
    customEndTime: '18:00',
    reason: '',
  });

  // Service form state
  const [serviceForm, setServiceForm] = useState({
    name: '',
    description: '',
    duration_minutes: 60,
    price: 0,
    color: '#3B82F6',
    is_active: true,
  });
  const [isApplyingSalonTemplate, setIsApplyingSalonTemplate] = useState(false);

  // Professional form state
  const [professionalForm, setProfessionalForm] = useState({
    name: '',
    email: '',
    phone: '',
    specialty: '',
    photo_url: '',
    is_active: true,
    work_start_time: '09:00',
    work_end_time: '18:00',
    break_start_time: '12:00',
    break_end_time: '13:00',
    available_days: [1, 2, 3, 4, 5],
    assigned_services: [] as string[],
  });

  // Reset forms when dialogs close
  useEffect(() => {
    if (!newServiceOpen && !editingService) {
      setServiceForm({
        name: '',
        description: '',
        duration_minutes: 60,
        price: 0,
        color: '#3B82F6',
        is_active: true,
      });
    }
  }, [newServiceOpen, editingService]);

  useEffect(() => {
    if (!newProfessionalOpen && !editingProfessional) {
      setProfessionalForm({
        name: '',
        email: '',
        phone: '',
        specialty: '',
        photo_url: '',
        is_active: true,
        work_start_time: '09:00',
        work_end_time: '18:00',
        break_start_time: '12:00',
        break_end_time: '13:00',
        available_days: [1, 2, 3, 4, 5],
        assigned_services: [],
      });
    }
  }, [newProfessionalOpen, editingProfessional]);

  // Load editing data
  useEffect(() => {
    if (editingService) {
      setServiceForm({
        name: editingService.name,
        description: editingService.description || '',
        duration_minutes: editingService.durationMinutes,
        price: editingService.price || 0,
        color: editingService.color || '#3B82F6',
        is_active: editingService.isActive,
      });
    }
  }, [editingService]);

  useEffect(() => {
    if (editingProfessional) {
      setProfessionalForm({
        name: editingProfessional.name,
        email: editingProfessional.email || '',
        phone: editingProfessional.phone || '',
        specialty: editingProfessional.specialty || '',
        photo_url: editingProfessional.photoUrl || '',
        is_active: editingProfessional.isActive,
        work_start_time: editingProfessional.workStartTime || '09:00',
        work_end_time: editingProfessional.workEndTime || '18:00',
        break_start_time: editingProfessional.breakStartTime || '12:00',
        break_end_time: editingProfessional.breakEndTime || '13:00',
        available_days: editingProfessional.availableDays || [1, 2, 3, 4, 5],
        assigned_services: editingProfessional.assignedServices || [],
      });
    }
  }, [editingProfessional]);

  // Handle service save
  const handleSaveService = () => {
    // Converter snake_case para camelCase antes de enviar ao backend
    const serviceData = {
      name: serviceForm.name,
      description: serviceForm.description,
      durationMinutes: serviceForm.duration_minutes, // Backend espera camelCase
      price: serviceForm.price,
      color: serviceForm.color,
      isActive: serviceForm.is_active, // Backend espera camelCase
    };
    
    if (editingService) {
      updateServiceMutation.mutate({ id: editingService.id, data: serviceData });
    } else {
      createServiceMutation.mutate(serviceData);
    }
  };

  const applySalonTemplate = async () => {
    if (isApplyingSalonTemplate) return;
    setIsApplyingSalonTemplate(true);
    try {
      const templateServices = [
        { name: 'Corte Feminino', description: 'Corte e finalização', durationMinutes: 60, price: 90, color: '#EC4899', isActive: true },
        { name: 'Corte Masculino', description: 'Corte clássico ou degradê', durationMinutes: 45, price: 60, color: '#3B82F6', isActive: true },
        { name: 'Escova', description: 'Escova modeladora', durationMinutes: 60, price: 80, color: '#F59E0B', isActive: true },
        { name: 'Coloração', description: 'Coloração completa', durationMinutes: 120, price: 180, color: '#10B981', isActive: true },
        { name: 'Hidratação', description: 'Tratamento capilar', durationMinutes: 60, price: 100, color: '#8B5CF6', isActive: true },
        { name: 'Barba', description: 'Acabamento e alinhamento', durationMinutes: 30, price: 40, color: '#6B7280', isActive: true },
      ];

      for (const service of templateServices) {
        await authFetch('/api/scheduling/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(service),
        });
      }

      toggleAdvancedConfigMutation.mutate({ use_services: true });
      setConfigForm((prev) => ({ ...prev, useServices: true }));
      refetchServices();
      toast({ title: '✅ Modelo de cabeleireiro aplicado!', description: 'Serviços padrão adicionados.' });
    } catch (error) {
      toast({ title: '❌ Erro ao aplicar modelo', description: 'Não foi possível criar os serviços.', variant: 'destructive' });
    } finally {
      setIsApplyingSalonTemplate(false);
    }
  };

  // Handle professional save
  const handleSaveProfessional = () => {
    if (editingProfessional) {
      updateProfessionalMutation.mutate({ id: editingProfessional.id, data: professionalForm });
    } else {
      createProfessionalMutation.mutate(professionalForm);
    }
  };

  // Toggle professional day
  const toggleProfessionalDay = (day: number) => {
    setProfessionalForm(prev => {
      const currentDays = prev.available_days || [];
      if (currentDays.includes(day)) {
        return { ...prev, available_days: currentDays.filter(d => d !== day) };
      } else {
        return { ...prev, available_days: [...currentDays, day].sort() };
      }
    });
  };

  const handleSaveConfig = () => {
    saveConfigMutation.mutate({
      is_enabled: configForm.isEnabled,
      service_name: configForm.serviceName,
      service_duration: configForm.serviceDuration,
      location: configForm.location,
      location_type: configForm.locationType,
      available_days: configForm.availableDays,
      work_start_time: configForm.workStartTime,
      work_end_time: configForm.workEndTime,
      break_start_time: configForm.breakStartTime,
      break_end_time: configForm.breakEndTime,
      has_break: configForm.hasBreak,
      slot_duration: configForm.slotDuration,
      buffer_between_appointments: configForm.bufferBetweenAppointments,
      max_appointments_per_day: configForm.maxAppointmentsPerDay,
      advance_booking_days: configForm.advanceBookingDays,
      min_booking_notice_hours: configForm.minBookingNoticeHours,
      require_confirmation: configForm.requireConfirmation,
      auto_confirm: configForm.autoConfirm,
      allow_cancellation: configForm.allowCancellation,
      send_reminder: configForm.sendReminder,
      reminder_hours_before: configForm.reminderHoursBefore,
    } as any);
  };

  const handleCreateAppointment = () => {
    createAppointmentMutation.mutate({
      ...appointmentForm,
      serviceName: configForm.serviceName,
      location: configForm.location,
      durationMinutes: configForm.slotDuration || 60,
    });
  };

  const handleCreateException = () => {
    createExceptionMutation.mutate(exceptionForm);
  };

  const toggleDay = (day: number) => {
    setConfigForm(prev => {
      const currentDays = prev.availableDays || [];
      if (currentDays.includes(day)) {
        return { ...prev, availableDays: currentDays.filter(d => d !== day) };
      } else {
        return { ...prev, availableDays: [...currentDays, day].sort() };
      }
    });
  };

  // Group appointments by date
  const todayAppointments = appointments.filter(a => a.appointment_date === format(new Date(), 'yyyy-MM-dd'));

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <CalendarClock className="w-8 h-8" />
              Agendamentos
            </h1>
            <p className="text-muted-foreground">
              Gerencie seus agendamentos e configure horários disponíveis para a IA
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={configForm.isEnabled || false}
                onCheckedChange={(checked) => {
                  setConfigForm({ ...configForm, isEnabled: checked });
                  saveConfigMutation.mutate({ is_enabled: checked } as any);
                }}
              />
              <Label className={configForm.isEnabled ? "text-green-600 font-medium" : "text-muted-foreground"}>
                {configForm.isEnabled ? "Ativo" : "Desativado"}
              </Label>
            </div>
            <Button onClick={() => refetchAppointments()} variant="outline" size="icon">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Dialog open={newAppointmentOpen} onOpenChange={setNewAppointmentOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Novo Agendamento
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Novo Agendamento</DialogTitle>
                  <DialogDescription>Adicione um agendamento manualmente</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nome do Cliente *</Label>
                    <Input
                      value={appointmentForm.clientName}
                      onChange={(e) => setAppointmentForm({ ...appointmentForm, clientName: e.target.value })}
                      placeholder="Nome completo"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone *</Label>
                    <Input
                      value={appointmentForm.clientPhone}
                      onChange={(e) => setAppointmentForm({ ...appointmentForm, clientPhone: e.target.value })}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={appointmentForm.clientEmail}
                      onChange={(e) => setAppointmentForm({ ...appointmentForm, clientEmail: e.target.value })}
                      placeholder="email@exemplo.com"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Data *</Label>
                      <Input
                        type="date"
                        value={appointmentForm.appointmentDate}
                        onChange={(e) => setAppointmentForm({ ...appointmentForm, appointmentDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Horário *</Label>
                      <Input
                        type="time"
                        value={appointmentForm.startTime}
                        onChange={(e) => {
                          const start = e.target.value;
                          const [h, m] = start.split(':').map(Number);
                          const endMinutes = h * 60 + m + (configForm.slotDuration || 60);
                          const endH = Math.floor(endMinutes / 60);
                          const endM = endMinutes % 60;
                          setAppointmentForm({
                            ...appointmentForm,
                            startTime: start,
                            endTime: `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`,
                          });
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Textarea
                      value={appointmentForm.clientNotes}
                      onChange={(e) => setAppointmentForm({ ...appointmentForm, clientNotes: e.target.value })}
                      placeholder="Notas adicionais..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNewAppointmentOpen(false)}>Cancelar</Button>
                  <Button 
                    onClick={handleCreateAppointment}
                    disabled={!appointmentForm.clientName || !appointmentForm.clientPhone || createAppointmentMutation.isPending}
                  >
                    {createAppointmentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Criar Agendamento
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Alert when disabled */}
        {!configForm.isEnabled && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800">Sistema de agendamento desativado</p>
              <p className="text-sm text-yellow-600">Ative o sistema nas configurações para que a IA possa criar agendamentos automaticamente.</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="appointments">
              <CalendarDays className="w-4 h-4 mr-2" />
              Agendamentos
            </TabsTrigger>
            <TabsTrigger value="services">
              <Briefcase className="w-4 h-4 mr-2" />
              Serviços
            </TabsTrigger>
            <TabsTrigger value="professionals">
              <Users className="w-4 h-4 mr-2" />
              Profissionais
            </TabsTrigger>
            <TabsTrigger value="google-calendar">
              <Link2 className="w-4 h-4 mr-2" />
              Google Calendar
            </TabsTrigger>
            <TabsTrigger value="config">
              <Settings className="w-4 h-4 mr-2" />
              Configurações
            </TabsTrigger>
            <TabsTrigger value="exceptions">
              <Ban className="w-4 h-4 mr-2" />
              Exceções
            </TabsTrigger>
          </TabsList>

          {/* Appointments Tab */}
          <TabsContent value="appointments" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Hoje</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{todayAppointments.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Pendentes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">
                    {appointments.filter(a => a.status === 'pending').length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Confirmados</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {appointments.filter(a => a.status === 'confirmed').length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total do Mês</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{appointments.length}</div>
                </CardContent>
              </Card>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-4">
              <Label>Filtrar por status:</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="confirmed">Confirmados</SelectItem>
                  <SelectItem value="cancelled">Cancelados</SelectItem>
                  <SelectItem value="completed">Concluídos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Agenda do dia */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5" />
                  Agenda do Dia
                </CardTitle>
                <CardDescription>Selecione uma data e veja os agendamentos abaixo</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-[320px_1fr]">
                  <div className="rounded-md border p-3">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      locale={ptBR}
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="text-sm font-medium">
                      {selectedDate
                        ? `Agendamentos de ${format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}`
                        : "Selecione uma data"}
                    </div>
                    {selectedDayAppointments.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        Nenhum agendamento para este dia.
                      </div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {selectedDayAppointments.map((apt) => (
                          <AppointmentCard
                            key={apt.id}
                            appointment={apt}
                            onConfirm={() => confirmAppointmentMutation.mutate(apt.id)}
                            onCancel={() => cancelAppointmentMutation.mutate({ id: apt.id })}
                            onComplete={(status) => completeAppointmentMutation.mutate({ id: apt.id, status })}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Today's Appointments */}
            {todayAppointments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5" />
                    Hoje - {format(new Date(), "dd 'de' MMMM", { locale: ptBR })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {todayAppointments.map((apt) => (
                      <AppointmentCard 
                        key={apt.id} 
                        appointment={apt}
                        onConfirm={() => confirmAppointmentMutation.mutate(apt.id)}
                        onCancel={() => cancelAppointmentMutation.mutate({ id: apt.id })}
                        onComplete={(status) => completeAppointmentMutation.mutate({ id: apt.id, status })}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* All Appointments Table */}
            <Card>
              <CardHeader>
                <CardTitle>Todos os Agendamentos</CardTitle>
                <CardDescription>Lista completa de agendamentos</CardDescription>
              </CardHeader>
              <CardContent>
                {appointmentsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                ) : appointments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CalendarClock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum agendamento encontrado</p>
                    <p className="text-sm">Crie um novo agendamento ou aguarde a IA criar automaticamente</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Horário</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Criado por</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {appointments.map((apt) => {
                        const statusConfig = STATUS_CONFIG[apt.status];
                        const StatusIcon = statusConfig.icon;
                        return (
                          <TableRow key={apt.id}>
                            <TableCell className="font-medium">
                              {format(parseISO(apt.appointment_date), "dd/MM/yyyy")}
                            </TableCell>
                            <TableCell>{apt.start_time} - {apt.end_time}</TableCell>
                            <TableCell>{apt.client_name}</TableCell>
                            <TableCell>{apt.client_phone}</TableCell>
                            <TableCell>
                              <Badge className={cn("gap-1", statusConfig.color)}>
                                <StatusIcon className="w-3 h-3" />
                                {statusConfig.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {apt.created_by_ai ? (
                                <Badge variant="outline" className="gap-1">
                                  🤖 IA
                                </Badge>
                              ) : (
                                <Badge variant="outline">Manual</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                {apt.status === 'pending' && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-green-600"
                                      onClick={() => confirmAppointmentMutation.mutate(apt.id)}
                                    >
                                      <Check className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-red-600"
                                      onClick={() => cancelAppointmentMutation.mutate({ id: apt.id })}
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                                {apt.status === 'confirmed' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => completeAppointmentMutation.mutate({ id: apt.id, status: 'completed' })}
                                  >
                                    Concluir
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Config Tab */}
          <TabsContent value="config" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Basic Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Informações do Serviço</CardTitle>
                  <CardDescription>Configure o serviço oferecido</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome do Serviço</Label>
                    <Input
                      value={configForm.serviceName || ''}
                      onChange={(e) => setConfigForm({ ...configForm, serviceName: e.target.value })}
                      placeholder="Ex: Consulta, Corte de Cabelo, Reunião..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Duração (minutos)</Label>
                    <Input
                      type="number"
                      value={configForm.slotDuration || 60}
                      onChange={(e) => setConfigForm({ ...configForm, slotDuration: parseInt(e.target.value) })}
                      min={15}
                      max={480}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Local/Endereço</Label>
                    <Textarea
                      value={configForm.location || ''}
                      onChange={(e) => setConfigForm({ ...configForm, location: e.target.value })}
                      placeholder="Ex: Rua das Flores, 123 - Centro"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de Atendimento</Label>
                    <Select 
                      value={configForm.locationType || 'presencial'}
                      onValueChange={(value) => setConfigForm({ ...configForm, locationType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="presencial">Presencial</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="ambos">Presencial ou Online</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Schedule Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Horários de Funcionamento</CardTitle>
                  <CardDescription>Defina quando você está disponível</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Dias Disponíveis</Label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_OF_WEEK.map((day) => (
                        <Button
                          key={day.value}
                          variant={configForm.availableDays?.includes(day.value) ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleDay(day.value)}
                        >
                          {day.short}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Início do Expediente</Label>
                      <Input
                        type="time"
                        value={configForm.workStartTime || '09:00'}
                        onChange={(e) => setConfigForm({ ...configForm, workStartTime: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fim do Expediente</Label>
                      <Input
                        type="time"
                        value={configForm.workEndTime || '18:00'}
                        onChange={(e) => setConfigForm({ ...configForm, workEndTime: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={configForm.hasBreak || false}
                      onCheckedChange={(checked) => setConfigForm({ ...configForm, hasBreak: checked })}
                    />
                    <Label>Horário de Almoço/Pausa</Label>
                  </div>
                  {configForm.hasBreak && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Início da Pausa</Label>
                        <Input
                          type="time"
                          value={configForm.breakStartTime || '12:00'}
                          onChange={(e) => setConfigForm({ ...configForm, breakStartTime: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Fim da Pausa</Label>
                        <Input
                          type="time"
                          value={configForm.breakEndTime || '13:00'}
                          onChange={(e) => setConfigForm({ ...configForm, breakEndTime: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Advanced Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Configurações Avançadas</CardTitle>
                  <CardDescription>Limites e regras de agendamento</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Máx. por dia</Label>
                      <Input
                        type="number"
                        value={configForm.maxAppointmentsPerDay || 10}
                        onChange={(e) => setConfigForm({ ...configForm, maxAppointmentsPerDay: parseInt(e.target.value) })}
                        min={1}
                        max={50}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Dias de antecedência</Label>
                      <Input
                        type="number"
                        value={configForm.advanceBookingDays || 30}
                        onChange={(e) => setConfigForm({ ...configForm, advanceBookingDays: parseInt(e.target.value) })}
                        min={1}
                        max={365}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Intervalo entre atendimentos (min)</Label>
                      <Input
                        type="number"
                        value={configForm.bufferBetweenAppointments || 0}
                        onChange={(e) => setConfigForm({ ...configForm, bufferBetweenAppointments: parseInt(e.target.value) })}
                        min={0}
                        max={60}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Antecedência mínima (horas)</Label>
                      <Input
                        type="number"
                        value={configForm.minBookingNoticeHours || 2}
                        onChange={(e) => setConfigForm({ ...configForm, minBookingNoticeHours: parseInt(e.target.value) })}
                        min={0}
                        max={72}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* AI & Confirmation Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>IA e Confirmação</CardTitle>
                  <CardDescription>Como a IA deve lidar com agendamentos</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Exigir confirmação manual</Label>
                      <p className="text-sm text-muted-foreground">A IA cria como pendente e você confirma</p>
                    </div>
                    <Switch
                      checked={configForm.requireConfirmation || false}
                      onCheckedChange={(checked) => setConfigForm({ ...configForm, requireConfirmation: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Enviar lembrete</Label>
                      <p className="text-sm text-muted-foreground">Lembrar cliente antes do agendamento</p>
                    </div>
                    <Switch
                      checked={configForm.sendReminder || false}
                      onCheckedChange={(checked) => setConfigForm({ ...configForm, sendReminder: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Permitir cancelamento pelo cliente</Label>
                      <p className="text-sm text-muted-foreground">Cliente pode cancelar agendamento via IA</p>
                    </div>
                    <Switch
                      checked={configForm.allowCancellation ?? true}
                      onCheckedChange={(checked) => setConfigForm({ ...configForm, allowCancellation: checked })}
                    />
                  </div>
                  {configForm.sendReminder && (
                    <div className="space-y-2">
                      <Label>Horas antes do lembrete</Label>
                      <Input
                        type="number"
                        value={configForm.reminderHoursBefore || 24}
                        onChange={(e) => setConfigForm({ ...configForm, reminderHoursBefore: parseInt(e.target.value) })}
                        min={1}
                        max={72}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveConfig} disabled={saveConfigMutation.isPending}>
                {saveConfigMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar Configurações
              </Button>
            </div>
          </TabsContent>

          {/* Exceptions Tab */}
          <TabsContent value="exceptions" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Exceções e Dias Bloqueados</CardTitle>
                  <CardDescription>Feriados, dias de folga e horários especiais</CardDescription>
                </div>
                <Dialog open={newExceptionOpen} onOpenChange={setNewExceptionOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Nova Exceção
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nova Exceção</DialogTitle>
                      <DialogDescription>Bloqueie um dia ou modifique o horário</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Data</Label>
                        <Input
                          type="date"
                          value={exceptionForm.exceptionDate}
                          onChange={(e) => setExceptionForm({ ...exceptionForm, exceptionDate: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tipo</Label>
                        <Select
                          value={exceptionForm.exceptionType}
                          onValueChange={(value: any) => setExceptionForm({ ...exceptionForm, exceptionType: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="blocked">Dia Bloqueado (sem atendimento)</SelectItem>
                            <SelectItem value="holiday">Feriado</SelectItem>
                            <SelectItem value="modified_hours">Horário Modificado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {exceptionForm.exceptionType === 'modified_hours' && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Início</Label>
                            <Input
                              type="time"
                              value={exceptionForm.customStartTime}
                              onChange={(e) => setExceptionForm({ ...exceptionForm, customStartTime: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Fim</Label>
                            <Input
                              type="time"
                              value={exceptionForm.customEndTime}
                              onChange={(e) => setExceptionForm({ ...exceptionForm, customEndTime: e.target.value })}
                            />
                          </div>
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label>Motivo (opcional)</Label>
                        <Input
                          value={exceptionForm.reason}
                          onChange={(e) => setExceptionForm({ ...exceptionForm, reason: e.target.value })}
                          placeholder="Ex: Feriado de Natal, Viagem..."
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setNewExceptionOpen(false)}>Cancelar</Button>
                      <Button onClick={handleCreateException} disabled={createExceptionMutation.isPending}>
                        {createExceptionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Criar Exceção
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {exceptions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Ban className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma exceção cadastrada</p>
                    <p className="text-sm">Adicione feriados ou dias de folga</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Horário</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exceptions.map((exc) => (
                        <TableRow key={exc.id}>
                          <TableCell className="font-medium">
                            {format(parseISO(exc.exception_date), "dd/MM/yyyy")}
                          </TableCell>
                          <TableCell>
                            <Badge variant={exc.exception_type === 'blocked' ? 'destructive' : 'outline'}>
                              {exc.exception_type === 'blocked' ? 'Bloqueado' : 
                               exc.exception_type === 'holiday' ? 'Feriado' : 'Horário Especial'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {exc.exception_type === 'modified_hours' 
                              ? `${exc.custom_start_time} - ${exc.custom_end_time}`
                              : '-'}
                          </TableCell>
                          <TableCell>{exc.reason || '-'}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => deleteExceptionMutation.mutate(exc.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== SERVICES TAB ==================== */}
          <TabsContent value="services" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="w-5 h-5" />
                      Serviços
                    </CardTitle>
                    <CardDescription>
                      Cadastre os serviços que você oferece. Seus clientes poderão escolher qual serviço agendar.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={configForm.useServices || false}
                        onCheckedChange={(checked) => {
                          setConfigForm({ ...configForm, useServices: checked });
                          toggleAdvancedConfigMutation.mutate({ use_services: checked });
                        }}
                      />
                      <Label className={configForm.useServices ? "text-green-600 font-medium" : "text-muted-foreground"}>
                        {configForm.useServices ? "Ativo" : "Desativado"}
                      </Label>
                    </div>
                    <Button
                      variant="outline"
                      onClick={applySalonTemplate}
                      disabled={isApplyingSalonTemplate}
                    >
                      {isApplyingSalonTemplate ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Palette className="w-4 h-4 mr-2" />
                      )}
                      Modelo Cabeleireiro
                    </Button>
                    <Dialog open={newServiceOpen} onOpenChange={setNewServiceOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="w-4 h-4 mr-2" />
                          Novo Serviço
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>{editingService ? 'Editar Serviço' : 'Novo Serviço'}</DialogTitle>
                          <DialogDescription>
                            {editingService ? 'Atualize os dados do serviço' : 'Cadastre um novo serviço para seus clientes'}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Nome do Serviço *</Label>
                            <Input
                              value={serviceForm.name}
                              onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                              placeholder="Ex: Corte de Cabelo"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Descrição</Label>
                            <Input
                              value={serviceForm.description}
                              onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                              placeholder="Breve descrição do serviço"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Duração (minutos)</Label>
                              <Input
                                type="number"
                                value={serviceForm.duration_minutes}
                                onChange={(e) => setServiceForm({ ...serviceForm, duration_minutes: parseInt(e.target.value) || 60 })}
                                min={15}
                                step={15}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Preço (R$)</Label>
                              <Input
                                type="number"
                                value={serviceForm.price}
                                onChange={(e) => setServiceForm({ ...serviceForm, price: parseFloat(e.target.value) || 0 })}
                                min={0}
                                step={0.01}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Cor de identificação</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="color"
                                value={serviceForm.color}
                                onChange={(e) => setServiceForm({ ...serviceForm, color: e.target.value })}
                                className="w-16 h-10 p-1 cursor-pointer"
                              />
                              <span className="text-sm text-muted-foreground">{serviceForm.color}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={serviceForm.is_active}
                              onCheckedChange={(checked) => setServiceForm({ ...serviceForm, is_active: checked })}
                            />
                            <Label>Serviço ativo</Label>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => { setNewServiceOpen(false); setEditingService(null); }}>
                            Cancelar
                          </Button>
                          <Button 
                            onClick={handleSaveService}
                            disabled={!serviceForm.name || createServiceMutation.isPending || updateServiceMutation.isPending}
                          >
                            {(createServiceMutation.isPending || updateServiceMutation.isPending) && (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            )}
                            {editingService ? 'Salvar' : 'Criar Serviço'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!configForm.useServices && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <p className="text-yellow-800 text-sm">
                      ⚠️ A funcionalidade de serviços está desativada. Ative-a para que seus clientes possam escolher qual serviço agendar.
                    </p>
                  </div>
                )}
                {services.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Briefcase className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <h3 className="text-lg font-medium mb-2">Nenhum serviço cadastrado</h3>
                    <p className="text-sm mb-4">Adicione seus serviços para que os clientes possam escolher ao agendar</p>
                    <Button onClick={() => setNewServiceOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Primeiro Serviço
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {services.map((service) => (
                      <Card key={service.id} className={cn("relative overflow-hidden", !service.isActive && "opacity-60")}>
                        <div 
                          className="absolute top-0 left-0 w-full h-1" 
                          style={{ backgroundColor: service.color || '#3B82F6' }}
                        />
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-lg">{service.name}</CardTitle>
                            <div className="flex gap-1">
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-8 w-8"
                                onClick={() => { setEditingService(service); setNewServiceOpen(true); }}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-8 w-8 text-red-600"
                                onClick={() => deleteServiceMutation.mutate(service.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          {service.description && (
                            <CardDescription>{service.description}</CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="w-4 h-4" />
                              {service.durationMinutes} min
                            </div>
                            {service.price !== null && service.price > 0 && (
                              <div className="flex items-center gap-1 font-medium text-green-600">
                                <DollarSign className="w-4 h-4" />
                                {service.price.toFixed(2)}
                              </div>
                            )}
                          </div>
                          <div className="mt-2">
                            <Badge variant={service.isActive ? "default" : "secondary"}>
                              {service.isActive ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== PROFESSIONALS TAB ==================== */}
          <TabsContent value="professionals" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Profissionais
                    </CardTitle>
                    <CardDescription>
                      Cadastre sua equipe. Clientes poderão escolher com qual profissional agendar.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={configForm.useProfessionals || false}
                        onCheckedChange={(checked) => {
                          setConfigForm({ ...configForm, useProfessionals: checked });
                          toggleAdvancedConfigMutation.mutate({ use_professionals: checked });
                        }}
                      />
                      <Label className={configForm.useProfessionals ? "text-green-600 font-medium" : "text-muted-foreground"}>
                        {configForm.useProfessionals ? "Ativo" : "Desativado"}
                      </Label>
                    </div>
                    <Dialog open={newProfessionalOpen} onOpenChange={setNewProfessionalOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="w-4 h-4 mr-2" />
                          Novo Profissional
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>{editingProfessional ? 'Editar Profissional' : 'Novo Profissional'}</DialogTitle>
                          <DialogDescription>
                            {editingProfessional ? 'Atualize os dados do profissional' : 'Adicione um membro da sua equipe'}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Nome *</Label>
                              <Input
                                value={professionalForm.name}
                                onChange={(e) => setProfessionalForm({ ...professionalForm, name: e.target.value })}
                                placeholder="Nome completo"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Especialidade</Label>
                              <Input
                                value={professionalForm.specialty}
                                onChange={(e) => setProfessionalForm({ ...professionalForm, specialty: e.target.value })}
                                placeholder="Ex: Cabeleireiro"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Email</Label>
                              <Input
                                type="email"
                                value={professionalForm.email}
                                onChange={(e) => setProfessionalForm({ ...professionalForm, email: e.target.value })}
                                placeholder="email@exemplo.com"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Telefone</Label>
                              <Input
                                value={professionalForm.phone}
                                onChange={(e) => setProfessionalForm({ ...professionalForm, phone: e.target.value })}
                                placeholder="(11) 99999-9999"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Foto URL</Label>
                            <Input
                              value={professionalForm.photo_url}
                              onChange={(e) => setProfessionalForm({ ...professionalForm, photo_url: e.target.value })}
                              placeholder="https://..."
                            />
                          </div>
                          
                          <Separator />
                          
                          <div className="space-y-2">
                            <Label>Horário de Trabalho</Label>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Início</Label>
                                <Input
                                  type="time"
                                  value={professionalForm.work_start_time}
                                  onChange={(e) => setProfessionalForm({ ...professionalForm, work_start_time: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Fim</Label>
                                <Input
                                  type="time"
                                  value={professionalForm.work_end_time}
                                  onChange={(e) => setProfessionalForm({ ...professionalForm, work_end_time: e.target.value })}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Intervalo</Label>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Início</Label>
                                <Input
                                  type="time"
                                  value={professionalForm.break_start_time}
                                  onChange={(e) => setProfessionalForm({ ...professionalForm, break_start_time: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Fim</Label>
                                <Input
                                  type="time"
                                  value={professionalForm.break_end_time}
                                  onChange={(e) => setProfessionalForm({ ...professionalForm, break_end_time: e.target.value })}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Dias de Trabalho</Label>
                            <div className="flex flex-wrap gap-2">
                              {DAYS_OF_WEEK.map((day) => (
                                <Button
                                  key={day.value}
                                  type="button"
                                  size="sm"
                                  variant={professionalForm.available_days?.includes(day.value) ? "default" : "outline"}
                                  onClick={() => toggleProfessionalDay(day.value)}
                                >
                                  {day.short}
                                </Button>
                              ))}
                            </div>
                          </div>

                          {services.length > 0 && (
                            <>
                              <Separator />
                              <div className="space-y-2">
                                <Label>Serviços que realiza</Label>
                                <div className="flex flex-wrap gap-2">
                                  {services.map((service) => (
                                    <Button
                                      key={service.id}
                                      type="button"
                                      size="sm"
                                      variant={professionalForm.assigned_services?.includes(service.id) ? "default" : "outline"}
                                      onClick={() => {
                                        const current = professionalForm.assigned_services || [];
                                        if (current.includes(service.id)) {
                                          setProfessionalForm({ ...professionalForm, assigned_services: current.filter(s => s !== service.id) });
                                        } else {
                                          setProfessionalForm({ ...professionalForm, assigned_services: [...current, service.id] });
                                        }
                                      }}
                                      style={{ 
                                        borderColor: service.color || '#3B82F6',
                                        backgroundColor: professionalForm.assigned_services?.includes(service.id) ? service.color : 'transparent',
                                        color: professionalForm.assigned_services?.includes(service.id) ? 'white' : undefined
                                      }}
                                    >
                                      {service.name}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}

                          <div className="flex items-center gap-2">
                            <Switch
                              checked={professionalForm.is_active}
                              onCheckedChange={(checked) => setProfessionalForm({ ...professionalForm, is_active: checked })}
                            />
                            <Label>Profissional ativo</Label>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => { setNewProfessionalOpen(false); setEditingProfessional(null); }}>
                            Cancelar
                          </Button>
                          <Button 
                            onClick={handleSaveProfessional}
                            disabled={!professionalForm.name || createProfessionalMutation.isPending || updateProfessionalMutation.isPending}
                          >
                            {(createProfessionalMutation.isPending || updateProfessionalMutation.isPending) && (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            )}
                            {editingProfessional ? 'Salvar' : 'Adicionar Profissional'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!configForm.useProfessionals && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <p className="text-yellow-800 text-sm">
                      ⚠️ A funcionalidade de profissionais está desativada. Ative-a para que seus clientes possam escolher com quem agendar.
                    </p>
                  </div>
                )}
                {professionals.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <h3 className="text-lg font-medium mb-2">Nenhum profissional cadastrado</h3>
                    <p className="text-sm mb-4">Adicione membros da sua equipe para que os clientes possam escolher</p>
                    <Button onClick={() => setNewProfessionalOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Primeiro Profissional
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {professionals.map((professional) => (
                      <Card key={professional.id} className={cn("relative", !professional.isActive && "opacity-60")}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start gap-3">
                            {professional.photoUrl ? (
                              <img 
                                src={professional.photoUrl} 
                                alt={professional.name}
                                className="w-12 h-12 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="w-6 h-6 text-primary" />
                              </div>
                            )}
                            <div className="flex-1">
                              <div className="flex items-start justify-between">
                                <div>
                                  <CardTitle className="text-lg">{professional.name}</CardTitle>
                                  {professional.specialty && (
                                    <CardDescription>{professional.specialty}</CardDescription>
                                  )}
                                </div>
                                <div className="flex gap-1">
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-8 w-8"
                                    onClick={() => { setEditingProfessional(professional); setNewProfessionalOpen(true); }}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-8 w-8 text-red-600"
                                    onClick={() => deleteProfessionalMutation.mutate(professional.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-2 text-sm">
                            {professional.email && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Mail className="w-4 h-4" />
                                {professional.email}
                              </div>
                            )}
                            {professional.phone && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Phone className="w-4 h-4" />
                                {professional.phone}
                              </div>
                            )}
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="w-4 h-4" />
                              {professional.workStartTime} - {professional.workEndTime}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {professional.availableDays?.map(day => (
                                <Badge key={day} variant="outline" className="text-xs">
                                  {DAYS_OF_WEEK.find(d => d.value === day)?.short}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t">
                            <Badge variant={professional.isActive ? "default" : "secondary"}>
                              {professional.isActive ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== GOOGLE CALENDAR TAB ==================== */}
          <TabsContent value="google-calendar" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google Calendar
                </CardTitle>
                <CardDescription>
                  Sincronize seus agendamentos com o Google Calendar em um clique
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Connection Status Card */}
                <div className={cn(
                  "rounded-lg border-2 p-6",
                  googleCalendarStatus?.isConnected ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {googleCalendarStatus?.isConnected ? (
                        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                          <Link2 className="w-6 h-6 text-green-600" />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                          <Link2Off className="w-6 h-6 text-gray-500" />
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold text-lg">
                          {googleCalendarStatus?.isConnected ? "Conectado" : "Não Conectado"}
                        </h3>
                        {googleCalendarStatus?.isConnected && googleCalendarStatus.email && (
                          <p className="text-sm text-muted-foreground">
                            {googleCalendarStatus.email}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {googleCalendarStatus?.isConnected ? (
                      <Button 
                        variant="outline" 
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => disconnectGoogleCalendarMutation.mutate()}
                        disabled={disconnectGoogleCalendarMutation.isPending}
                      >
                        {disconnectGoogleCalendarMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Link2Off className="w-4 h-4 mr-2" />
                        )}
                        Desconectar
                      </Button>
                    ) : (
                      <Button 
                        onClick={() => connectGoogleCalendarMutation.mutate()}
                        disabled={connectGoogleCalendarMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {connectGoogleCalendarMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                          </svg>
                        )}
                        Conectar com Google
                      </Button>
                    )}
                  </div>
                </div>

                {/* Sync Settings */}
                {googleCalendarStatus?.isConnected && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Configurações de Sincronização</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="font-medium">Sincronização Automática</Label>
                          <p className="text-sm text-muted-foreground">
                            Novos agendamentos serão criados automaticamente no seu Google Calendar
                          </p>
                        </div>
                        <Switch
                          checked={configForm.googleCalendarEnabled || false}
                          onCheckedChange={(checked) => {
                            setConfigForm({ ...configForm, googleCalendarEnabled: checked });
                            toggleGoogleCalendarSyncMutation.mutate(checked);
                          }}
                        />
                      </div>
                      
                      <Separator />
                      
                      <div className="space-y-3">
                        <h4 className="font-medium">Quando sincronizar:</h4>
                        <div className="space-y-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            Novo agendamento criado
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            Agendamento confirmado
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            Agendamento cancelado (evento removido)
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            Reagendamento (evento atualizado)
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Benefits Section */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Benefícios da Integração</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <CalendarDays className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">Visualização Unificada</h4>
                          <p className="text-xs text-muted-foreground">
                            Veja todos os seus compromissos em um só lugar
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                          <Bell className="w-4 h-4 text-green-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">Notificações</h4>
                          <p className="text-xs text-muted-foreground">
                            Receba lembretes do Google Calendar
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                          <Phone className="w-4 h-4 text-purple-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">Acesso Mobile</h4>
                          <p className="text-xs text-muted-foreground">
                            Seus agendamentos no celular automaticamente
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                          <RefreshCw className="w-4 h-4 text-orange-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">Sempre Atualizado</h4>
                          <p className="text-xs text-muted-foreground">
                            Sincronização automática em tempo real
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* AI Integration Section */}
                <Card className="border-2 border-primary/20 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      🤖 Agendamento Inteligente com IA
                    </CardTitle>
                    <CardDescription>
                      Quando ativado, a inteligência artificial faz tudo automaticamente
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-background rounded-lg border">
                      <div>
                        <Label className="font-medium">IA Gerencia Agendamentos</Label>
                        <p className="text-sm text-muted-foreground">
                          A IA conversa com clientes, verifica disponibilidade e cria agendamentos
                        </p>
                      </div>
                      <Switch
                        checked={configForm.aiSchedulingEnabled || false}
                        onCheckedChange={(checked) => {
                          setConfigForm({ ...configForm, aiSchedulingEnabled: checked });
                          toggleAdvancedConfigMutation.mutate({ ai_scheduling_enabled: checked });
                        }}
                      />
                    </div>
                    
                    <div className="text-sm space-y-2">
                      <h4 className="font-medium">A IA irá automaticamente:</h4>
                      <ul className="space-y-1 text-muted-foreground">
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Perguntar qual serviço o cliente deseja
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Mostrar profissionais disponíveis (se configurado)
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Verificar horários livres no calendário
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Criar o agendamento automaticamente
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Sincronizar com Google Calendar (se conectado)
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Enviar confirmação ao cliente
                        </li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// Appointment Card Component
function AppointmentCard({ 
  appointment, 
  onConfirm, 
  onCancel, 
  onComplete 
}: { 
  appointment: Appointment;
  onConfirm: () => void;
  onCancel: () => void;
  onComplete: (status: string) => void;
}) {
  const statusConfig = STATUS_CONFIG[appointment.status];
  const StatusIcon = statusConfig.icon;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Clock className="w-4 h-4 text-muted-foreground" />
          {appointment.start_time}
        </div>
        <Badge className={cn("gap-1", statusConfig.color)}>
          <StatusIcon className="w-3 h-3" />
          {statusConfig.label}
        </Badge>
      </div>
      
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">{appointment.client_name}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Phone className="w-4 h-4" />
          {appointment.client_phone}
        </div>
        {appointment.location && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4" />
            {appointment.location}
          </div>
        )}
      </div>

      {appointment.created_by_ai && (
        <Badge variant="outline" className="gap-1">
          🤖 Criado pela IA
        </Badge>
      )}

      {appointment.status === 'pending' && (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={onConfirm}>
            <Check className="w-4 h-4 mr-1" />
            Confirmar
          </Button>
          <Button size="sm" variant="outline" className="text-red-600" onClick={onCancel}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {appointment.status === 'confirmed' && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onComplete('completed')}>
            <CheckCircle2 className="w-4 h-4 mr-1" />
            Concluído
          </Button>
          <Button size="sm" variant="outline" className="text-red-600" onClick={() => onComplete('no_show')}>
            Não compareceu
          </Button>
        </div>
      )}
    </div>
  );
}
