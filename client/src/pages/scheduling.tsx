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
  Calendar as CalendarIcon
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
}

interface Appointment {
  id: string;
  client_name: string;
  client_phone: string;
  client_email?: string;
  service_name?: string;
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
}

interface SchedulingException {
  id: string;
  exception_date: string;
  exception_type: 'blocked' | 'modified_hours' | 'holiday';
  custom_start_time?: string;
  custom_end_time?: string;
  reason?: string;
}

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
  const [filterStatus, setFilterStatus] = useState<string>("all");

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
    const currentDays = configForm.availableDays || [];
    if (currentDays.includes(day)) {
      setConfigForm({ ...configForm, availableDays: currentDays.filter(d => d !== day) });
    } else {
      setConfigForm({ ...configForm, availableDays: [...currentDays, day].sort() });
    }
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
          <TabsList>
            <TabsTrigger value="appointments">
              <CalendarDays className="w-4 h-4 mr-2" />
              Agendamentos
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
