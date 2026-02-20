import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Bell, Send, Clock, Calendar, AlertTriangle, Users, 
  MessageCircle, Zap, Save, Loader2, Sparkles, 
  RefreshCw, CheckCircle2, XCircle, Play, Pause,
  Target, Filter, Bot, Shield, Timer, ChevronLeft, ChevronRight,
  CalendarDays, Trash2, Eye, History, RotateCcw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Tipos
interface ScheduledNotification {
  id: string;
  admin_id: string;
  user_id: string;
  notification_type: string;
  recipient_phone: string;
  recipient_name: string;
  message_template: string;
  ai_prompt: string;
  scheduled_for: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  ai_enabled: boolean;
  metadata: any;
  user_name?: string;
  user_email?: string;
  final_message?: string;
}

interface CalendarData {
  [date: string]: {
    total: number;
    pending: number;
    sent: number;
    failed: number;
    byType: Record<string, number>;
  };
}

interface NotificationConfig {
  // Lembrete de pagamento
  paymentReminderEnabled: boolean;
  paymentReminderDaysBefore: number[];
  paymentReminderMessageTemplate: string;
  paymentReminderAiEnabled: boolean;
  paymentReminderAiPrompt: string;
  
  // Cobrança em atraso
  overdueReminderEnabled: boolean;
  overdueReminderDaysAfter: number[];
  overdueReminderMessageTemplate: string;
  overdueReminderAiEnabled: boolean;
  overdueReminderAiPrompt: string;
  
  // Check-in periódico
  periodicCheckinEnabled: boolean;
  periodicCheckinMinDays: number;
  periodicCheckinMaxDays: number;
  periodicCheckinMessageTemplate: string;
  checkinAiEnabled: boolean;
  checkinAiPrompt: string;
  
  // Broadcast
  broadcastEnabled: boolean;
  broadcastAntibotVariation: boolean;
  broadcastAiVariation: boolean;
  broadcastMinIntervalSeconds: number;
  broadcastMaxIntervalSeconds: number;
  
  // Alerta WhatsApp desconectado
  disconnectedAlertEnabled: boolean;
  disconnectedAlertHours: number;
  disconnectedAlertMessageTemplate: string;
  disconnectedAiEnabled: boolean;
  disconnectedAiPrompt: string;
  
  // IA para variação (global - mantido por compatibilidade)
  aiVariationEnabled: boolean;
  aiVariationPrompt: string;
  
  // Horário comercial
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: number[];
  respectBusinessHours: boolean;
  
  // Mensagens de boas-vindas
  welcomeMessageEnabled: boolean;
  welcomeMessageVariations: string[];
  welcomeMessageAiEnabled: boolean;
  welcomeMessageAiPrompt: string;
}

interface Broadcast {
  id: string;
  name: string;
  messageTemplate: string;
  targetType: 'all' | 'with_plan' | 'without_plan' | 'custom';
  targetFilter: any;
  aiVariation: boolean;
  antibotEnabled: boolean;
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'cancelled';
  scheduledAt?: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
}

const defaultConfig: NotificationConfig = {
  paymentReminderEnabled: true,
  paymentReminderDaysBefore: [7, 3, 1],
  paymentReminderMessageTemplate: `Olá {cliente_nome}! 👋

Gostaríamos de lembrar que seu pagamento vence em {dias_restantes} dias.

📅 Vencimento: {data_vencimento}
💰 Valor: R$ {valor}

Qualquer dúvida estamos à disposição! 🙏`,
  paymentReminderAiEnabled: true,
  paymentReminderAiPrompt: 'Reescreva esta mensagem de lembrete de pagamento de forma natural e personalizada. Mantenha o tom profissional mas amigável.',

  overdueReminderEnabled: true,
  overdueReminderDaysAfter: [1, 3, 7, 14],
  overdueReminderMessageTemplate: `Olá {cliente_nome}! 👋

Identificamos que seu pagamento está em atraso há {dias_atraso} dias.

📅 Venceu em: {data_vencimento}
💰 Valor: R$ {valor}

Por favor, regularize sua situação para continuar aproveitando nossos serviços. 🤝`,
  overdueReminderAiEnabled: true,
  overdueReminderAiPrompt: 'Reescreva esta mensagem de cobrança de forma educada e empática. Mantenha o tom profissional.',

  periodicCheckinEnabled: true,
  periodicCheckinMinDays: 7,
  periodicCheckinMaxDays: 15,
  periodicCheckinMessageTemplate: `Olá {cliente_nome}! 👋

Passando para ver se está tudo bem! 😊

Precisa de alguma coisa? Podemos ajudar em algo?

Estamos aqui para o que precisar! 💪`,
  checkinAiEnabled: true,
  checkinAiPrompt: 'Reescreva esta mensagem de check-in de forma calorosa e natural. Pareça genuinamente interessado no cliente.',

  broadcastEnabled: true,
  broadcastAntibotVariation: true,
  broadcastAiVariation: true,
  broadcastMinIntervalSeconds: 3,
  broadcastMaxIntervalSeconds: 10,

  disconnectedAlertEnabled: true,
  disconnectedAlertHours: 2,
  disconnectedAlertMessageTemplate: `Olá {cliente_nome}! 👋

Notamos que seu WhatsApp está desconectado há algumas horas. 📱

Está acontecendo algo? Podemos ajudar?

Fico à disposição! 🙏`,
  disconnectedAiEnabled: true,
  disconnectedAiPrompt: 'Reescreva esta mensagem de alerta de desconexão de forma prestativa e profissional.',

  aiVariationEnabled: true,
  aiVariationPrompt: 'Você é um assistente que reescreve mensagens de forma natural e personalizada. Mantenha o tom profissional mas amigável. Use o nome do cliente quando disponível. Varie a estrutura das frases para parecer mais humano.',

  businessHoursStart: '09:00',
  businessHoursEnd: '18:00',
  businessDays: [1, 2, 3, 4, 5],
  respectBusinessHours: true,
  
  welcomeMessageEnabled: true,
  welcomeMessageVariations: [
    'Olá {{name}}! 👋 Bem-vindo(a) ao nosso atendimento. Como posso ajudar você hoje?',
    'Oi {{name}}! 😊 É um prazer ter você aqui. Em que posso ser útil?',
    'Bem-vindo(a) {{name}}! Estou aqui para ajudar. O que você precisa?',
    'Olá! Que bom ter você por aqui, {{name}}! Como posso te atender hoje?',
    '👋 Oi {{name}}! Seja muito bem-vindo(a). Estou pronto para te ajudar!'
  ],
  welcomeMessageAiEnabled: true,
  welcomeMessageAiPrompt: 'Gere uma mensagem de boas-vindas calorosa e profissional para um cliente que acabou de iniciar uma conversa no WhatsApp. Use o nome do cliente se disponível. Seja breve, amigável e mostre disposição para ajudar.',
};

const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function AdminNotificationsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  
  // Detectar aba pela URL
  const getTabFromUrl = () => {
    const hash = location.split('#')[1];
    return hash || 'pagamentos';
  };
  
  const [activeTab, setActiveTab] = useState(getTabFromUrl());
  const [config, setConfig] = useState<NotificationConfig>(defaultConfig);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Sincronizar aba com URL
  useEffect(() => {
    const tab = getTabFromUrl();
    setActiveTab(tab);
  }, [location]);
  
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const basePath = location.split('#')[0];
    setLocation(`${basePath}#${value}`);
  };
  
  // Estado do broadcast
  const [newBroadcast, setNewBroadcast] = useState({
    name: '',
    messageTemplate: '',
    targetType: 'all' as const,
    aiVariation: true,
    antibotEnabled: true,
  });

  // Query de configuração
  const { data: savedConfig, isLoading: loadingConfig } = useQuery<NotificationConfig>({
    queryKey: ["/api/admin/notifications/config"],
  });

  // Query de broadcasts
  const { data: broadcasts, isLoading: loadingBroadcasts } = useQuery<Broadcast[]>({
    queryKey: ["/api/admin/broadcasts"],
  });

  // Query de usuários para estatísticas
  const { data: userStats } = useQuery<{ 
    total: number; 
    withPlan: number; 
    withoutPlan: number;
    disconnected: number;
    overduePayments: number;
  }>({
    queryKey: ["/api/admin/notifications/stats"],
  });

  // Estado do calendário
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth() + 1);
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedNotification, setSelectedNotification] = useState<ScheduledNotification | null>(null);

  // Query de calendário
  const { data: calendarData, isLoading: loadingCalendar, refetch: refetchCalendar } = useQuery<CalendarData>({
    queryKey: ["/api/admin/notifications/calendar", calendarMonth, calendarYear],
    queryFn: async () => {
      const response = await fetch(
        `/api/admin/notifications/calendar?month=${calendarMonth}&year=${calendarYear}`,
        { credentials: "include" }
      );
      if (!response.ok) throw new Error("Erro ao carregar calendário");
      return response.json();
    },
  });

  // Query de agendamentos para data selecionada
  const { data: scheduledNotifications, isLoading: loadingScheduled, refetch: refetchScheduled } = useQuery<ScheduledNotification[]>({
    queryKey: ["/api/admin/notifications/scheduled", selectedDate],
    queryFn: async () => {
      if (!selectedDate) return [];
      const startDate = `${selectedDate}T00:00:00`;
      const endDate = `${selectedDate}T23:59:59`;
      const response = await fetch(
        `/api/admin/notifications/scheduled?startDate=${startDate}&endDate=${endDate}`,
        { credentials: "include" }
      );
      if (!response.ok) throw new Error("Erro ao carregar agendamentos");
      return response.json();
    },
    enabled: !!selectedDate,
  });

  // Mutation para reorganizar agendamentos
  const reorganizeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/notifications/reorganize", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Erro ao reorganizar");
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Agendamentos reorganizados!", 
        description: `${data.scheduled} notificações agendadas. Lembrete: ${data.breakdown?.paymentReminder || 0}, Atraso: ${data.breakdown?.overdueReminder || 0}, Check-in: ${data.breakdown?.checkin || 0}, Desconectado: ${data.breakdown?.disconnected || 0}` 
      });
      refetchCalendar();
      refetchQueueStatus();
      if (selectedDate) refetchScheduled();
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao reorganizar", description: error.message, variant: "destructive" });
    },
  });

  // Query para status da fila
  const { data: queueStatus, refetch: refetchQueueStatus } = useQuery({
    queryKey: ["/api/admin/notifications/queue-status"],
    queryFn: async () => {
      const response = await fetch("/api/admin/notifications/queue-status", { credentials: "include" });
      if (!response.ok) return { pendingNow: 0, breakdown: [], nextInQueue: [] };
      return response.json();
    },
    refetchInterval: 30000, // Atualizar a cada 30s
  });

  // Mutation para processar fila
  const processQueueMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/notifications/process-queue", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Erro ao processar fila");
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Processamento iniciado!", 
        description: `${data.total} notificações sendo processadas em fila com delay de ${data.minDelay}-${data.maxDelay}s`
      });
      // Atualizar status em 5 segundos
      setTimeout(() => {
        refetchQueueStatus();
        refetchCalendar();
        if (selectedDate) refetchScheduled();
      }, 5000);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao processar fila", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para cancelar agendamento

  // === HISTÓRICO ===
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTypeFilter, setHistoryTypeFilter] = useState<string>('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('');

  const { data: historyData, isLoading: loadingHistory, refetch: refetchHistory } = useQuery<{
    logs: any[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
    stats: any;
  }>({
    queryKey: ["/api/admin/notifications/history", historyPage, historyTypeFilter, historyStatusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(historyPage), limit: '30' });
      if (historyTypeFilter) params.set('type', historyTypeFilter);
      if (historyStatusFilter) params.set('status', historyStatusFilter);
      const response = await fetch(`/api/admin/notifications/history?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Erro ao carregar histórico");
      return response.json();
    },
    enabled: activeTab === 'historico',
  });

  const cancelScheduledMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/notifications/scheduled/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Erro ao cancelar");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Agendamento cancelado!" });
      refetchCalendar();
      if (selectedDate) refetchScheduled();
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao cancelar", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para enviar agendamento imediatamente
  const sendScheduledMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/notifications/send/${id}`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Erro ao enviar");
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: data.success ? "Mensagem enviada!" : "Falha no envio", 
        description: data.success ? "A notificação foi enviada com sucesso." : data.message,
        variant: data.success ? "default" : "destructive"
      });
      refetchCalendar();
      if (selectedDate) refetchScheduled();
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para REENVIAR notificação já enviada
  const resendScheduledMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/notifications/resend/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: true }) // Usar variação de IA
      });
      if (!response.ok) throw new Error("Erro ao reenviar");
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: data.success ? "Mensagem reenviada!" : "Falha no reenvio", 
        description: data.success ? "A notificação foi reenviada com sucesso." : data.message,
        variant: data.success ? "default" : "destructive"
      });
      refetchCalendar();
      if (selectedDate) refetchScheduled();
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao reenviar", description: error.message, variant: "destructive" });
    },
  });

  // Carregar config salva
  useEffect(() => {
    if (savedConfig) {
      // Garantir que todos os campos obrigatórios existam
      setConfig({
        ...defaultConfig,
        ...savedConfig,
        // Garantir arrays
        paymentReminderDaysBefore: savedConfig.paymentReminderDaysBefore || defaultConfig.paymentReminderDaysBefore,
        overdueReminderDaysAfter: savedConfig.overdueReminderDaysAfter || defaultConfig.overdueReminderDaysAfter,
        businessDays: savedConfig.businessDays || defaultConfig.businessDays,
        welcomeMessageVariations: savedConfig.welcomeMessageVariations || defaultConfig.welcomeMessageVariations,
      });
    }
  }, [savedConfig]);

  // Mutation para salvar config
  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/notifications/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(config),
      });
      if (!response.ok) throw new Error("Erro ao salvar configurações");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Configurações salvas!", description: "As configurações de notificação foram atualizadas." });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications/config"] });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para criar broadcast
  const createBroadcastMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newBroadcast),
      });
      if (!response.ok) throw new Error("Erro ao criar broadcast");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Broadcast criado!", description: "O broadcast foi criado com sucesso." });
      setNewBroadcast({ name: '', messageTemplate: '', targetType: 'all', aiVariation: true, antibotEnabled: true });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/broadcasts"] });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para iniciar broadcast
  const startBroadcastMutation = useMutation({
    mutationFn: async (broadcastId: string) => {
      const response = await fetch(`/api/admin/broadcasts/${broadcastId}/start`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Erro ao iniciar broadcast");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Broadcast iniciado!", description: "O envio das mensagens foi iniciado." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/broadcasts"] });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao iniciar", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para enviar teste
  const sendTestMutation = useMutation({
    mutationFn: async (data: { type: string; message: string }) => {
      const response = await fetch("/api/admin/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Erro ao enviar teste");
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Teste enviado!", 
        description: `Mensagem variada: "${data.variedMessage?.substring(0, 50)}..."` 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
    },
  });

  const updateConfig = (updates: Partial<NotificationConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const toggleBusinessDay = (day: number) => {
    const newDays = config.businessDays.includes(day)
      ? config.businessDays.filter(d => d !== day)
      : [...config.businessDays, day].sort();
    updateConfig({ businessDays: newDays });
  };

  if (loadingConfig) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com estatísticas */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Clientes</span>
            </div>
            <p className="text-2xl font-bold">{userStats?.total || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Com Plano</span>
            </div>
            <p className="text-2xl font-bold">{userStats?.withPlan || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-muted-foreground">Sem Plano</span>
            </div>
            <p className="text-2xl font-bold">{userStats?.withoutPlan || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-muted-foreground">Desconectados</span>
            </div>
            <p className="text-2xl font-bold">{userStats?.disconnected || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Em Atraso</span>
            </div>
            <p className="text-2xl font-bold">{userStats?.overduePayments || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs de configuração */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Sistema de Notificações
              </CardTitle>
              <CardDescription>
                Configure lembretes de pagamento, check-ins periódicos e broadcasts em massa
              </CardDescription>
            </div>
            <Button 
              onClick={() => saveConfigMutation.mutate()}
              disabled={!hasChanges || saveConfigMutation.isPending}
            >
              {saveConfigMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Salvar Configurações
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="grid w-full grid-cols-8">
              <TabsTrigger value="agenda" className="flex items-center gap-1">
                <CalendarDays className="w-4 h-4" />
                Agenda
              </TabsTrigger>
              <TabsTrigger value="historico" className="flex items-center gap-1">
                <History className="w-4 h-4" />
                Histórico
              </TabsTrigger>
              <TabsTrigger value="boasvindas" className="flex items-center gap-1">
                <Sparkles className="w-4 h-4" />
                Boas-vindas
              </TabsTrigger>
              <TabsTrigger value="pagamentos" className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Pagamentos
              </TabsTrigger>
              <TabsTrigger value="checkin" className="flex items-center gap-1">
                <MessageCircle className="w-4 h-4" />
                Check-in
              </TabsTrigger>
              <TabsTrigger value="desconectado" className="flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                Desconectado
              </TabsTrigger>
              <TabsTrigger value="broadcast" className="flex items-center gap-1">
                <Send className="w-4 h-4" />
                Broadcast
              </TabsTrigger>
              <TabsTrigger value="config" className="flex items-center gap-1">
                <Zap className="w-4 h-4" />
                IA & Horários
              </TabsTrigger>
            </TabsList>

            {/* Tab: Agenda / Calendário */}
            <TabsContent value="agenda" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <CalendarDays className="w-4 h-4" />
                        Calendário de Agendamentos
                      </CardTitle>
                      <CardDescription>Visualize e gerencie todas as notificações agendadas</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Status da fila */}
                      {(queueStatus?.pendingNow || 0) > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1 bg-yellow-50 border border-yellow-200 rounded-md">
                          <span className="text-sm text-yellow-700">
                            {queueStatus?.pendingNow} pendentes agora
                          </span>
                          <Button 
                            size="sm"
                            onClick={() => processQueueMutation.mutate()}
                            disabled={processQueueMutation.isPending}
                            className="bg-yellow-600 hover:bg-yellow-700 h-7 px-2"
                          >
                            {processQueueMutation.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Play className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                      )}
                      <Button 
                        onClick={() => reorganizeMutation.mutate()}
                        disabled={reorganizeMutation.isPending}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        {reorganizeMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4 mr-2" />
                        )}
                        Reorganizar Agenda
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Navegação do mês */}
                  <div className="flex items-center justify-between mb-4">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        if (calendarMonth === 1) {
                          setCalendarMonth(12);
                          setCalendarYear(calendarYear - 1);
                        } else {
                          setCalendarMonth(calendarMonth - 1);
                        }
                        setSelectedDate(null);
                      }}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <h3 className="text-lg font-semibold">
                      {new Date(calendarYear, calendarMonth - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                    </h3>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        if (calendarMonth === 12) {
                          setCalendarMonth(1);
                          setCalendarYear(calendarYear + 1);
                        } else {
                          setCalendarMonth(calendarMonth + 1);
                        }
                        setSelectedDate(null);
                      }}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Calendário */}
                  {loadingCalendar ? (
                    <div className="flex justify-center p-8">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-7 gap-1">
                      {/* Cabeçalho dos dias */}
                      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                        <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                          {day}
                        </div>
                      ))}
                      
                      {/* Dias do mês */}
                      {(() => {
                        const firstDay = new Date(calendarYear, calendarMonth - 1, 1).getDay();
                        const daysInMonth = new Date(calendarYear, calendarMonth, 0).getDate();
                        const today = new Date().toISOString().split('T')[0];
                        const cells = [];
                        
                        // Dias vazios antes do primeiro dia
                        for (let i = 0; i < firstDay; i++) {
                          cells.push(<div key={`empty-${i}`} className="h-20" />);
                        }
                        
                        // Dias do mês
                        for (let day = 1; day <= daysInMonth; day++) {
                          const dateStr = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          const dayData = calendarData?.[dateStr];
                          const isToday = dateStr === today;
                          const isSelected = dateStr === selectedDate;
                          
                          cells.push(
                            <div
                              key={day}
                              onClick={() => setSelectedDate(dateStr)}
                              className={`h-20 border rounded-lg p-1 cursor-pointer transition-colors ${
                                isSelected ? 'border-primary bg-primary/10' : 
                                isToday ? 'border-blue-500 bg-blue-50' : 
                                'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <div className="text-sm font-medium mb-1">{day}</div>
                              {dayData && (
                                <div className="space-y-0.5">
                                  {dayData.pending > 0 && (
                                    <div className="flex items-center gap-1">
                                      <div className="w-2 h-2 rounded-full bg-yellow-500" />
                                      <span className="text-xs">{dayData.pending} pendentes</span>
                                    </div>
                                  )}
                                  {dayData.sent > 0 && (
                                    <div className="flex items-center gap-1">
                                      <div className="w-2 h-2 rounded-full bg-green-500" />
                                      <span className="text-xs">{dayData.sent} enviadas</span>
                                    </div>
                                  )}
                                  {dayData.failed > 0 && (
                                    <div className="flex items-center gap-1">
                                      <div className="w-2 h-2 rounded-full bg-red-500" />
                                      <span className="text-xs">{dayData.failed} falhas</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        }
                        
                        return cells;
                      })()}
                    </div>
                  )}

                  {/* Legenda */}
                  <div className="flex gap-4 mt-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      <span>Pendente</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <span>Enviada</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span>Falha</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Lista de agendamentos para a data selecionada */}
              {selectedDate && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Agendamentos para {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { 
                        weekday: 'long', day: 'numeric', month: 'long' 
                      })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loadingScheduled ? (
                      <div className="flex justify-center p-4">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    ) : scheduledNotifications && scheduledNotifications.length > 0 ? (
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-3">
                          {scheduledNotifications.map((notification) => (
                            <Card key={notification.id} className="border">
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Badge variant={
                                        notification.status === 'pending' ? 'outline' :
                                        notification.status === 'sent' ? 'default' :
                                        notification.status === 'failed' ? 'destructive' : 'secondary'
                                      }>
                                        {notification.status === 'pending' ? 'Pendente' :
                                         notification.status === 'sent' ? 'Enviada' :
                                         notification.status === 'failed' ? 'Falha' : 'Cancelada'}
                                      </Badge>
                                      <Badge variant="secondary">
                                        {notification.notification_type === 'payment_reminder' ? '💰 Lembrete' :
                                         notification.notification_type === 'checkin' ? '👋 Check-in' :
                                         notification.notification_type === 'disconnected' ? '📱 Desconectado' :
                                         notification.notification_type}
                                      </Badge>
                                      {notification.ai_enabled && (
                                        <Badge variant="outline" className="bg-purple-50">
                                          <Sparkles className="w-3 h-3 mr-1" />
                                          IA
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="font-medium">{notification.recipient_name || 'Cliente'}</p>
                                    <p className="text-sm text-muted-foreground">{notification.recipient_phone}</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Horário: {new Date(notification.scheduled_for).toLocaleTimeString('pt-BR', { 
                                        hour: '2-digit', minute: '2-digit' 
                                      })}
                                    </p>
                                    {notification.final_message && (
                                      <div className="mt-2 p-2 bg-muted rounded text-sm">
                                        <p className="text-xs text-muted-foreground mb-1">Mensagem enviada:</p>
                                        {notification.final_message}
                                      </div>
                                    )}
                                  </div>
                                  {notification.status === 'pending' && (
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => sendScheduledMutation.mutate(notification.id)}
                                        disabled={sendScheduledMutation.isPending}
                                      >
                                        <Play className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-red-500"
                                        onClick={() => cancelScheduledMutation.mutate(notification.id)}
                                        disabled={cancelScheduledMutation.isPending}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  )}
                                  {/* Botão Reenviar para notificações já enviadas ou com falha */}
                                  {(notification.status === 'sent' || notification.status === 'failed') && (
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-blue-500"
                                        onClick={() => resendScheduledMutation.mutate(notification.id)}
                                        disabled={resendScheduledMutation.isPending}
                                        title="Reenviar notificação"
                                      >
                                        <RotateCcw className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        Nenhum agendamento para esta data
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Tab: Histórico */}
            <TabsContent value="historico" className="space-y-4 mt-6">
              {/* Stats Cards */}
              {historyData?.stats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="bg-white border rounded-lg p-3">
                    <div className="text-xs text-gray-500">Enviados (total)</div>
                    <div className="text-xl font-bold text-green-600">{historyData.stats.total_sent || 0}</div>
                  </div>
                  <div className="bg-white border rounded-lg p-3">
                    <div className="text-xs text-gray-500">Falhas (total)</div>
                    <div className="text-xl font-bold text-red-600">{historyData.stats.total_failed || 0}</div>
                  </div>
                  <div className="bg-white border rounded-lg p-3">
                    <div className="text-xs text-gray-500">Enviados hoje</div>
                    <div className="text-xl font-bold text-blue-600">{historyData.stats.sent_today || 0}</div>
                  </div>
                  <div className="bg-white border rounded-lg p-3">
                    <div className="text-xs text-gray-500">Enviados (7 dias)</div>
                    <div className="text-xl font-bold text-purple-600">{historyData.stats.sent_week || 0}</div>
                  </div>
                  <div className="bg-white border rounded-lg p-3">
                    <div className="text-xs text-gray-500">Pendentes na fila</div>
                    <div className="text-xl font-bold text-yellow-600">{historyData.stats.pending_count || 0}</div>
                  </div>
                </div>
              )}

              {/* Type breakdown */}
              {historyData?.stats && (
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                    <div className="text-xs text-blue-600">Pagamento</div>
                    <div className="text-lg font-bold text-blue-700">{historyData.stats.payment_reminders || 0}</div>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                    <div className="text-xs text-orange-600">Cobrança</div>
                    <div className="text-lg font-bold text-orange-700">{historyData.stats.overdue_reminders || 0}</div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                    <div className="text-xs text-green-600">Check-in</div>
                    <div className="text-lg font-bold text-green-700">{historyData.stats.checkins || 0}</div>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                    <div className="text-xs text-red-600">Desconectado</div>
                    <div className="text-lg font-bold text-red-700">{historyData.stats.disconnected_alerts || 0}</div>
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="flex items-center gap-3 flex-wrap">
                <Select value={historyTypeFilter || 'all'} onValueChange={(v) => { setHistoryTypeFilter(v === 'all' ? '' : v); setHistoryPage(1); }}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    <SelectItem value="payment_reminder">Pagamento</SelectItem>
                    <SelectItem value="overdue_reminder">Cobrança</SelectItem>
                    <SelectItem value="checkin">Check-in</SelectItem>
                    <SelectItem value="periodic_checkin">Check-in periódico</SelectItem>
                    <SelectItem value="disconnected">Desconectado</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={historyStatusFilter || 'all'} onValueChange={(v) => { setHistoryStatusFilter(v === 'all' ? '' : v); setHistoryPage(1); }}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="sent">Enviados</SelectItem>
                    <SelectItem value="failed">Falhas</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => refetchHistory()}>
                  <RefreshCw className="w-3 h-3 mr-1" /> Atualizar
                </Button>
                {historyData?.pagination && (
                  <span className="text-xs text-gray-500 ml-auto">
                    {historyData.pagination.total} registros
                  </span>
                )}
              </div>

              {/* History list */}
              {loadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-2">
                  {(!historyData?.logs || historyData.logs.length === 0) ? (
                    <div className="text-center py-8 text-gray-400">
                      <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Nenhum registro encontrado</p>
                    </div>
                  ) : (
                    <>
                      {historyData.logs.map((log: any) => {
                        const typeLabels: Record<string, string> = {
                          payment_reminder: 'Pagamento',
                          overdue_reminder: 'Cobrança',
                          checkin: 'Check-in',
                          periodic_checkin: 'Check-in',
                          disconnected: 'Desconectado',
                          subscription_expired: 'Plano expirado',
                        };
                        const typeColors: Record<string, string> = {
                          payment_reminder: 'bg-blue-100 text-blue-700',
                          overdue_reminder: 'bg-orange-100 text-orange-700',
                          checkin: 'bg-green-100 text-green-700',
                          periodic_checkin: 'bg-green-100 text-green-700',
                          disconnected: 'bg-red-100 text-red-700',
                          subscription_expired: 'bg-gray-100 text-gray-700',
                        };
                        const isSent = log.status === 'sent';
                        const dateStr = log.created_at ? new Date(log.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

                        return (
                          <div key={log.id} className={`flex items-start gap-3 p-3 rounded-lg border ${isSent ? 'bg-white border-gray-200' : 'bg-red-50 border-red-200'}`}>
                            <div className="flex-shrink-0 mt-0.5">
                              {isSent ? (
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm truncate">{log.recipient_name || log.user_name || 'Cliente'}</span>
                                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${typeColors[log.notification_type] || 'bg-gray-100'}`}>
                                  {typeLabels[log.notification_type] || log.notification_type}
                                </Badge>
                                <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{dateStr}</span>
                              </div>
                              {log.message_sent && (
                                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{log.message_sent}</p>
                              )}
                              {!isSent && log.error_message && (
                                <p className="text-xs text-red-500 mt-1">{log.error_message}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Pagination */}
                      {historyData.pagination.totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-3">
                          <Button
                            variant="outline" size="sm"
                            disabled={historyPage <= 1}
                            onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                          >
                            <ChevronLeft className="w-3 h-3" />
                          </Button>
                          <span className="text-xs text-gray-500">
                            {historyPage} / {historyData.pagination.totalPages}
                          </span>
                          <Button
                            variant="outline" size="sm"
                            disabled={historyPage >= historyData.pagination.totalPages}
                            onClick={() => setHistoryPage(p => p + 1)}
                          >
                            <ChevronRight className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Tab: Boas-vindas */}
            <TabsContent value="boasvindas" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        Mensagens de Boas-vindas
                      </CardTitle>
                      <CardDescription>Enviar mensagens automáticas quando cliente inicia conversa</CardDescription>
                    </div>
                    <Switch
                      checked={config.welcomeMessageEnabled}
                      onCheckedChange={(checked) => updateConfig({ welcomeMessageEnabled: checked })}
                    />
                  </div>
                </CardHeader>
                {config.welcomeMessageEnabled && (
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label>Variações de Mensagens</Label>
                        <Badge variant="outline" className="text-xs">
                          {config.welcomeMessageVariations.length} variações
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        O sistema escolherá aleatoriamente uma dessas mensagens para cada cliente. 
                        Use {'{{name}}'} para incluir o nome do cliente.
                      </p>
                      <div className="space-y-3">
                        {config.welcomeMessageVariations.map((variation, index) => (
                          <div key={index} className="flex gap-2">
                            <Textarea
                              value={variation}
                              onChange={(e) => {
                                const newVariations = [...config.welcomeMessageVariations];
                                newVariations[index] = e.target.value;
                                updateConfig({ welcomeMessageVariations: newVariations });
                              }}
                              rows={2}
                              className="font-mono text-sm flex-1"
                              placeholder="Digite uma variação da mensagem..."
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const newVariations = config.welcomeMessageVariations.filter((_, i) => i !== index);
                                updateConfig({ welcomeMessageVariations: newVariations });
                              }}
                              disabled={config.welcomeMessageVariations.length <= 1}
                            >
                              <XCircle className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const newVariations = [...config.welcomeMessageVariations, ''];
                            updateConfig({ welcomeMessageVariations: newVariations });
                          }}
                          className="w-full"
                        >
                          + Adicionar Variação
                        </Button>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <Label className="flex items-center gap-2">
                            <Bot className="w-4 h-4" />
                            Variação com IA
                          </Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            Usar IA para gerar variações únicas e naturais de cada mensagem
                          </p>
                        </div>
                        <Switch
                          checked={config.welcomeMessageAiEnabled}
                          onCheckedChange={(checked) => updateConfig({ welcomeMessageAiEnabled: checked })}
                        />
                      </div>
                      {config.welcomeMessageAiEnabled && (
                        <div>
                          <Label>Prompt da IA</Label>
                          <Textarea
                            value={config.welcomeMessageAiPrompt}
                            onChange={(e) => updateConfig({ welcomeMessageAiPrompt: e.target.value })}
                            rows={4}
                            className="mt-2 font-mono text-sm"
                            placeholder="Instruções para a IA gerar mensagens de boas-vindas..."
                          />
                          <p className="text-xs text-muted-foreground mt-2">
                            💡 A IA usará este prompt para criar mensagens únicas baseadas nas variações acima
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            </TabsContent>

            {/* Tab: Pagamentos */}
            <TabsContent value="pagamentos" className="space-y-6 mt-6">
              {/* Lembrete antes do vencimento */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Lembrete de Pagamento</CardTitle>
                      <CardDescription>Enviar lembretes antes do vencimento</CardDescription>
                    </div>
                    <Switch
                      checked={config.paymentReminderEnabled}
                      onCheckedChange={(checked) => updateConfig({ paymentReminderEnabled: checked })}
                    />
                  </div>
                </CardHeader>
                {config.paymentReminderEnabled && (
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Dias antes do vencimento para lembrar</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {[1, 2, 3, 5, 7, 10, 14, 30].map(day => (
                          <Badge
                            key={day}
                            variant={config.paymentReminderDaysBefore.includes(day) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => {
                              const newDays = config.paymentReminderDaysBefore.includes(day)
                                ? config.paymentReminderDaysBefore.filter(d => d !== day)
                                : [...config.paymentReminderDaysBefore, day].sort((a, b) => b - a);
                              updateConfig({ paymentReminderDaysBefore: newDays });
                            }}
                          >
                            {day} {day === 1 ? 'dia' : 'dias'}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label>Mensagem (será variada pela IA)</Label>
                      <Textarea
                        value={config.paymentReminderMessageTemplate}
                        onChange={(e) => updateConfig({ paymentReminderMessageTemplate: e.target.value })}
                        rows={6}
                        className="mt-2 font-mono text-sm"
                        placeholder="Use {cliente_nome}, {dias_restantes}, {data_vencimento}, {valor}"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Variáveis: {'{cliente_nome}'}, {'{dias_restantes}'}, {'{data_vencimento}'}, {'{valor}'}
                      </p>
                    </div>
                    
                    {/* Variação com IA para Lembrete de Pagamento */}
                    <Card className="border-dashed">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-500" />
                            <CardTitle className="text-sm">Variação com IA</CardTitle>
                          </div>
                          <Switch
                            checked={config.paymentReminderAiEnabled}
                            onCheckedChange={(checked) => updateConfig({ paymentReminderAiEnabled: checked })}
                          />
                        </div>
                        <CardDescription className="text-xs">
                          Usar IA para gerar variações únicas e naturais de cada mensagem
                        </CardDescription>
                      </CardHeader>
                      {config.paymentReminderAiEnabled && (
                        <CardContent className="pt-0">
                          <Label className="text-xs">Prompt da IA</Label>
                          <Textarea
                            value={config.paymentReminderAiPrompt}
                            onChange={(e) => updateConfig({ paymentReminderAiPrompt: e.target.value })}
                            rows={2}
                            className="mt-1 text-sm"
                            placeholder="Instruções para a IA..."
                          />
                        </CardContent>
                      )}
                    </Card>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => sendTestMutation.mutate({ 
                        type: 'payment_reminder', 
                        message: config.paymentReminderMessageTemplate 
                      })}
                      disabled={sendTestMutation.isPending}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Testar Variação com IA
                    </Button>
                  </CardContent>
                )}
              </Card>

              {/* Cobrança em atraso */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Cobrança em Atraso</CardTitle>
                      <CardDescription>Notificar clientes com pagamento vencido</CardDescription>
                    </div>
                    <Switch
                      checked={config.overdueReminderEnabled}
                      onCheckedChange={(checked) => updateConfig({ overdueReminderEnabled: checked })}
                    />
                  </div>
                </CardHeader>
                {config.overdueReminderEnabled && (
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Dias após o vencimento para cobrar</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {[1, 2, 3, 5, 7, 10, 14, 21, 30].map(day => (
                          <Badge
                            key={day}
                            variant={config.overdueReminderDaysAfter.includes(day) ? "destructive" : "outline"}
                            className="cursor-pointer"
                            onClick={() => {
                              const newDays = config.overdueReminderDaysAfter.includes(day)
                                ? config.overdueReminderDaysAfter.filter(d => d !== day)
                                : [...config.overdueReminderDaysAfter, day].sort((a, b) => a - b);
                              updateConfig({ overdueReminderDaysAfter: newDays });
                            }}
                          >
                            {day} {day === 1 ? 'dia' : 'dias'}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label>Mensagem de cobrança (será variada pela IA)</Label>
                      <Textarea
                        value={config.overdueReminderMessageTemplate}
                        onChange={(e) => updateConfig({ overdueReminderMessageTemplate: e.target.value })}
                        rows={6}
                        className="mt-2 font-mono text-sm"
                        placeholder="Use {cliente_nome}, {dias_atraso}, {data_vencimento}, {valor}"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Variáveis: {'{cliente_nome}'}, {'{dias_atraso}'}, {'{data_vencimento}'}, {'{valor}'}
                      </p>
                    </div>
                    
                    {/* Variação com IA para Cobrança em Atraso */}
                    <Card className="border-dashed">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-500" />
                            <CardTitle className="text-sm">Variação com IA</CardTitle>
                          </div>
                          <Switch
                            checked={config.overdueReminderAiEnabled}
                            onCheckedChange={(checked) => updateConfig({ overdueReminderAiEnabled: checked })}
                          />
                        </div>
                        <CardDescription className="text-xs">
                          Usar IA para gerar variações únicas e naturais de cada mensagem
                        </CardDescription>
                      </CardHeader>
                      {config.overdueReminderAiEnabled && (
                        <CardContent className="pt-0">
                          <Label className="text-xs">Prompt da IA</Label>
                          <Textarea
                            value={config.overdueReminderAiPrompt}
                            onChange={(e) => updateConfig({ overdueReminderAiPrompt: e.target.value })}
                            rows={2}
                            className="mt-1 text-sm"
                            placeholder="Instruções para a IA..."
                          />
                        </CardContent>
                      )}
                    </Card>
                  </CardContent>
                )}
              </Card>
            </TabsContent>

            {/* Tab: Check-in periódico */}
            <TabsContent value="checkin" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Check-in Periódico</CardTitle>
                      <CardDescription>Perguntar aos clientes se precisam de algo</CardDescription>
                    </div>
                    <Switch
                      checked={config.periodicCheckinEnabled}
                      onCheckedChange={(checked) => updateConfig({ periodicCheckinEnabled: checked })}
                    />
                  </div>
                </CardHeader>
                {config.periodicCheckinEnabled && (
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Intervalo mínimo (dias)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={30}
                          value={config.periodicCheckinMinDays}
                          onChange={(e) => updateConfig({ periodicCheckinMinDays: parseInt(e.target.value) || 7 })}
                          className="mt-2"
                        />
                      </div>
                      <div>
                        <Label>Intervalo máximo (dias)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={60}
                          value={config.periodicCheckinMaxDays}
                          onChange={(e) => updateConfig({ periodicCheckinMaxDays: parseInt(e.target.value) || 15 })}
                          className="mt-2"
                        />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      As mensagens serão enviadas em um intervalo aleatório entre {config.periodicCheckinMinDays} e {config.periodicCheckinMaxDays} dias para parecer mais natural.
                    </p>
                    <div>
                      <Label>Mensagem de check-in (será variada pela IA)</Label>
                      <Textarea
                        value={config.periodicCheckinMessageTemplate}
                        onChange={(e) => updateConfig({ periodicCheckinMessageTemplate: e.target.value })}
                        rows={5}
                        className="mt-2 font-mono text-sm"
                        placeholder="Use {cliente_nome}"
                      />
                    </div>
                    
                    {/* Variação com IA para Check-in */}
                    <Card className="border-dashed">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-500" />
                            <CardTitle className="text-sm">Variação com IA</CardTitle>
                          </div>
                          <Switch
                            checked={config.checkinAiEnabled}
                            onCheckedChange={(checked) => updateConfig({ checkinAiEnabled: checked })}
                          />
                        </div>
                        <CardDescription className="text-xs">
                          Usar IA para gerar variações únicas e naturais de cada mensagem
                        </CardDescription>
                      </CardHeader>
                      {config.checkinAiEnabled && (
                        <CardContent className="pt-0">
                          <Label className="text-xs">Prompt da IA</Label>
                          <Textarea
                            value={config.checkinAiPrompt}
                            onChange={(e) => updateConfig({ checkinAiPrompt: e.target.value })}
                            rows={2}
                            className="mt-1 text-sm"
                            placeholder="Instruções para a IA..."
                          />
                        </CardContent>
                      )}
                    </Card>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => sendTestMutation.mutate({ 
                        type: 'periodic_checkin', 
                        message: config.periodicCheckinMessageTemplate 
                      })}
                      disabled={sendTestMutation.isPending}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Testar Variação com IA
                    </Button>
                  </CardContent>
                )}
              </Card>
            </TabsContent>

            {/* Tab: WhatsApp Desconectado */}
            <TabsContent value="desconectado" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Alerta de WhatsApp Desconectado</CardTitle>
                      <CardDescription>Notificar clientes que têm plano mas estão com WhatsApp desconectado</CardDescription>
                    </div>
                    <Switch
                      checked={config.disconnectedAlertEnabled}
                      onCheckedChange={(checked) => updateConfig({ disconnectedAlertEnabled: checked })}
                    />
                  </div>
                </CardHeader>
                {config.disconnectedAlertEnabled && (
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Enviar alerta após (horas desconectado)</Label>
                      <div className="flex items-center gap-4 mt-2">
                        <Slider
                          value={[config.disconnectedAlertHours]}
                          onValueChange={([value]) => updateConfig({ disconnectedAlertHours: value })}
                          min={1}
                          max={24}
                          step={1}
                          className="flex-1"
                        />
                        <span className="text-sm font-medium w-16">{config.disconnectedAlertHours}h</span>
                      </div>
                    </div>
                    <div>
                      <Label>Mensagem de alerta (será variada pela IA)</Label>
                      <Textarea
                        value={config.disconnectedAlertMessageTemplate}
                        onChange={(e) => updateConfig({ disconnectedAlertMessageTemplate: e.target.value })}
                        rows={5}
                        className="mt-2 font-mono text-sm"
                        placeholder="Use {cliente_nome}"
                      />
                    </div>
                    
                    {/* Variação com IA para Desconectado */}
                    <Card className="border-dashed">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-500" />
                            <CardTitle className="text-sm">Variação com IA</CardTitle>
                          </div>
                          <Switch
                            checked={config.disconnectedAiEnabled}
                            onCheckedChange={(checked) => updateConfig({ disconnectedAiEnabled: checked })}
                          />
                        </div>
                        <CardDescription className="text-xs">
                          Usar IA para gerar variações únicas e naturais de cada mensagem
                        </CardDescription>
                      </CardHeader>
                      {config.disconnectedAiEnabled && (
                        <CardContent className="pt-0">
                          <Label className="text-xs">Prompt da IA</Label>
                          <Textarea
                            value={config.disconnectedAiPrompt}
                            onChange={(e) => updateConfig({ disconnectedAiPrompt: e.target.value })}
                            rows={2}
                            className="mt-1 text-sm"
                            placeholder="Instruções para a IA..."
                          />
                        </CardContent>
                      )}
                    </Card>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => sendTestMutation.mutate({ 
                        type: 'disconnected_alert', 
                        message: config.disconnectedAlertMessageTemplate 
                      })}
                      disabled={sendTestMutation.isPending}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Testar Variação com IA
                    </Button>
                  </CardContent>
                )}
              </Card>
            </TabsContent>

            {/* Tab: Broadcast */}
            <TabsContent value="broadcast" className="space-y-6 mt-6">
              {/* Configurações gerais de broadcast */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Configurações Anti-Bot
                  </CardTitle>
                  <CardDescription>Técnicas para evitar bloqueio do WhatsApp</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Variação com IA</Label>
                      <p className="text-xs text-muted-foreground">Cada mensagem é única</p>
                    </div>
                    <Switch
                      checked={config.broadcastAiVariation}
                      onCheckedChange={(checked) => updateConfig({ broadcastAiVariation: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Intervalo aleatório entre mensagens</Label>
                      <p className="text-xs text-muted-foreground">Evita padrão detectável</p>
                    </div>
                    <Switch
                      checked={config.broadcastAntibotVariation}
                      onCheckedChange={(checked) => updateConfig({ broadcastAntibotVariation: checked })}
                    />
                  </div>
                  {config.broadcastAntibotVariation && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs">Intervalo mínimo (seg)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={60}
                          value={config.broadcastMinIntervalSeconds}
                          onChange={(e) => updateConfig({ broadcastMinIntervalSeconds: parseInt(e.target.value) || 3 })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Intervalo máximo (seg)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={120}
                          value={config.broadcastMaxIntervalSeconds}
                          onChange={(e) => updateConfig({ broadcastMaxIntervalSeconds: parseInt(e.target.value) || 10 })}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Criar novo broadcast */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    Novo Broadcast
                  </CardTitle>
                  <CardDescription>Enviar mensagem para múltiplos clientes</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Nome da campanha</Label>
                    <Input
                      value={newBroadcast.name}
                      onChange={(e) => setNewBroadcast(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Promoção de Janeiro"
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Destinatários</Label>
                    <Select
                      value={newBroadcast.targetType}
                      onValueChange={(value: any) => setNewBroadcast(prev => ({ ...prev, targetType: value }))}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Todos os clientes ({userStats?.total || 0})
                          </div>
                        </SelectItem>
                        <SelectItem value="with_plan">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            Clientes com plano ({userStats?.withPlan || 0})
                          </div>
                        </SelectItem>
                        <SelectItem value="without_plan">
                          <div className="flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-gray-500" />
                            Clientes sem plano ({userStats?.withoutPlan || 0})
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Mensagem (será variada pela IA para cada cliente)</Label>
                    <Textarea
                      value={newBroadcast.messageTemplate}
                      onChange={(e) => setNewBroadcast(prev => ({ ...prev, messageTemplate: e.target.value }))}
                      rows={5}
                      className="mt-2 font-mono text-sm"
                      placeholder="Use {cliente_nome} para personalizar"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => sendTestMutation.mutate({ 
                        type: 'broadcast', 
                        message: newBroadcast.messageTemplate 
                      })}
                      disabled={sendTestMutation.isPending || !newBroadcast.messageTemplate}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Preview com IA
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => createBroadcastMutation.mutate()}
                      disabled={createBroadcastMutation.isPending || !newBroadcast.name || !newBroadcast.messageTemplate}
                    >
                      {createBroadcastMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-2" />
                      )}
                      Criar Broadcast
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Lista de broadcasts */}
              {broadcasts && broadcasts.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Broadcasts Recentes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {broadcasts.map(broadcast => (
                        <div key={broadcast.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <div>
                            <p className="font-medium">{broadcast.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {broadcast.sentCount}/{broadcast.totalRecipients} enviadas
                              {broadcast.failedCount > 0 && (
                                <span className="text-red-500 ml-2">{broadcast.failedCount} falhas</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={
                              broadcast.status === 'completed' ? 'default' :
                              broadcast.status === 'sending' ? 'secondary' :
                              broadcast.status === 'draft' ? 'outline' : 'destructive'
                            }>
                              {broadcast.status}
                            </Badge>
                            {broadcast.status === 'draft' && (
                              <Button
                                size="sm"
                                onClick={() => startBroadcastMutation.mutate(broadcast.id)}
                                disabled={startBroadcastMutation.isPending}
                              >
                                <Play className="w-4 h-4 mr-1" />
                                Iniciar
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Tab: Configurações de IA e Horários */}
            <TabsContent value="config" className="space-y-6 mt-6">
              {/* Configuração de IA */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Bot className="w-4 h-4" />
                        Variação com IA
                      </CardTitle>
                      <CardDescription>A IA reescreve cada mensagem de forma única e natural</CardDescription>
                    </div>
                    <Switch
                      checked={config.aiVariationEnabled}
                      onCheckedChange={(checked) => updateConfig({ aiVariationEnabled: checked })}
                    />
                  </div>
                </CardHeader>
                {config.aiVariationEnabled && (
                  <CardContent>
                    <div>
                      <Label>Instruções para a IA</Label>
                      <Textarea
                        value={config.aiVariationPrompt}
                        onChange={(e) => updateConfig({ aiVariationPrompt: e.target.value })}
                        rows={4}
                        className="mt-2 font-mono text-sm"
                      />
                    </div>
                  </CardContent>
                )}
              </Card>

              {/* Horário de funcionamento */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Timer className="w-4 h-4" />
                        Horário de Envio
                      </CardTitle>
                      <CardDescription>Respeitar horário comercial para envio de notificações</CardDescription>
                    </div>
                    <Switch
                      checked={config.respectBusinessHours}
                      onCheckedChange={(checked) => updateConfig({ respectBusinessHours: checked })}
                    />
                  </div>
                </CardHeader>
                {config.respectBusinessHours && (
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Início</Label>
                        <Input
                          type="time"
                          value={config.businessHoursStart}
                          onChange={(e) => updateConfig({ businessHoursStart: e.target.value })}
                          className="mt-2"
                        />
                      </div>
                      <div>
                        <Label>Fim</Label>
                        <Input
                          type="time"
                          value={config.businessHoursEnd}
                          onChange={(e) => updateConfig({ businessHoursEnd: e.target.value })}
                          className="mt-2"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Dias da semana</Label>
                      <div className="flex gap-2 mt-2">
                        {dayNames.map((name, index) => (
                          <Badge
                            key={index}
                            variant={config.businessDays.includes(index) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => toggleBusinessDay(index)}
                          >
                            {name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Mensagens fora do horário serão enfileiradas e enviadas no próximo horário disponível.
                    </p>
                  </CardContent>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
