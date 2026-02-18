import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Bell, Save, RefreshCw, CheckCircle, XCircle, AlertCircle, MessageCircle, Calendar, TrendingUp } from "lucide-react";

interface FollowupConfig {
  id: string;
  userId: string;
  isEnabled: boolean;
  maxAttempts: number;
  intervalsMinutes: number[];
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: number[];
  respectBusinessHours: boolean;
  tone: string;
  formalityLevel: number;
  useEmojis: boolean;
  importantInfo: { titulo: string; conteudo: string }[];
  infiniteLoop: boolean;
  infiniteLoopMinDays: number;
  infiniteLoopMaxDays: number;
}

interface FollowupStats {
  totalSent: number;
  totalFailed: number;
  totalCancelled: number;
  totalSkipped: number;
  pending: number;
  scheduledToday: number;
}

interface FollowupLog {
  id: number;
  conversationId: string;
  contactNumber: string;
  contactName: string | null;
  status: 'sent' | 'failed' | 'cancelled' | 'skipped';
  messageContent: string | null;
  stage: number;
  executedAt: string;
  errorReason: string | null;
}

interface FollowupEvent {
  id: string;
  contactNumber: string;
  contactName: string | null;
  stage: number;
  nextFollowupAt: string;
  status?: 'pending' | 'sent' | 'cancelled' | 'failed' | 'skipped';
}

export default function AdminFollowUpPanel() {
  const { toast } = useToast();

  // Buscar configuração global (admin)
  const { data: config, isLoading: configLoading, refetch: refetchConfig } = useQuery<FollowupConfig>({
    queryKey: ["/api/followup/config"],
  });

  // Buscar estatísticas
  const { data: stats, refetch: refetchStats } = useQuery<FollowupStats>({
    queryKey: ["/api/followup/stats"],
    refetchInterval: 30000,
  });

  // Buscar pendentes
  const { data: pending, refetch: refetchPending } = useQuery<FollowupEvent[]>({
    queryKey: ["/api/followup/pending"],
    refetchInterval: 30000,
  });

  // Buscar histórico
  const { data: logs, refetch: refetchLogs } = useQuery<FollowupLog[]>({
    queryKey: ["/api/followup/logs"],
    refetchInterval: 60000,
  });

  // Estado local para edição
  const [formData, setFormData] = useState<Partial<FollowupConfig>>({});
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  // Atualizar config quando mudar o estado local
  useEffect(() => {
    if (activeTab === 'settings' && config) {
      setFormData(config);
    }
  }, [config, activeTab]);

  // Mutation para salvar
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<FollowupConfig>) => {
      return await apiRequest("PUT", "/api/followup/config", data);
    },
    onSuccess: () => {
      refetchConfig();
      refetchStats();
      refetchLogs();
      toast({
        title: "Configuração salva!",
        description: "As alterações foram aplicadas com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const toggleDay = (day: number) => {
    const currentDays = formData.businessDays || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day].sort();
    setFormData({ ...formData, businessDays: newDays });
  };

  const formatInterval = (minutes: number): string => {
    if (minutes < 60) return `${minutes}min`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
    return `${Math.floor(minutes / 1440)}d`;
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  };

  const formatPhone = (phone: string) => {
    if (!phone) return "Sem número";
    if (phone.length >= 12) {
      return `(${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`;
    }
    return phone;
  };

  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    pending: { label: "Pendente", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20", icon: Bell },
    sent: { label: "Enviado", color: "bg-green-500/10 text-green-600 border-green-500/20", icon: CheckCircle },
    cancelled: { label: "Cancelado", color: "bg-gray-500/10 text-gray-600 border-gray-500/20", icon: XCircle },
    failed: { label: "Falhou", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: AlertCircle },
    skipped: { label: "Pulado", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: MessageCircle },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" />
            Follow-up Inteligente
          </h2>
          <p className="text-muted-foreground mt-1">
            Sistema automático de follow-ups para conversas
          </p>
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          <Save className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      {/* Toggle Principal */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Switch
                id="followup-enabled-main"
                checked={formData.isEnabled ?? false}
                onCheckedChange={(checked) => {
                  setFormData({ ...formData, isEnabled: checked });
                  saveMutation.mutate({ ...formData, isEnabled: checked });
                }}
              />
              <Label htmlFor="followup-enabled-main" className="flex items-center gap-2">
                {formData.isEnabled ? (
                  <>
                    <TrendingUp className="w-5 h-5 text-green-500" />
                    <span className="font-medium text-green-600">Follow-up Ativado</span>
                  </>
                ) : (
                  <>
                    <Bell className="w-5 h-5 text-muted-foreground" />
                    <span className="font-medium text-muted-foreground">Follow-up Desativado</span>
                  </>
                )}
              </Label>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { refetchPending(); refetchStats(); refetchLogs(); }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.totalSent || 0}</p>
                <p className="text-xs text-muted-foreground">Enviados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.pending || 0}</p>
                <p className="text-xs text-muted-foreground">Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.scheduledToday || 0}</p>
                <p className="text-xs text-muted-foreground">Hoje</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.totalCancelled || 0}</p>
                <p className="text-xs text-muted-foreground">Cancelados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.totalSkipped || 0}</p>
                <p className="text-xs text-muted-foreground">Pulados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pendentes ({pending?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="history">
            Histórico
          </TabsTrigger>
          <TabsTrigger value="settings">
            Configurações
          </TabsTrigger>
        </TabsList>

        {/* Tab Visão Geral */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Follow-ups Pendentes</CardTitle>
              <CardDescription>
                Conversas que receberão mensagens de follow-up
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pending && pending.length > 0 ? (
                <div className="space-y-3">
                  {pending.slice(0, 5).map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex-1">
                        <p className="font-medium">{event.contactName || formatPhone(event.contactNumber)}</p>
                        <p className="text-sm text-muted-foreground">{formatPhone(event.contactNumber)}</p>
                        <p className="text-xs text-muted-foreground">
                          Estágio {event.stage + 1} • Próximo: {formatDateTime(event.nextFollowupAt)}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        #{event.stage + 1}
                      </Badge>
                    </div>
                  ))}
                  {pending.length > 5 && (
                    <Button variant="link" className="w-full" onClick={() => setActiveTab('pending')}>
                      Ver todos os {pending.length} pendentes →
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Nenhum follow-up pendente</p>
                  <p className="text-sm">Quando clientes pararem de responder, os follow-ups aparecerão aqui</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Logs Recentes</CardTitle>
              <CardDescription>
                Últimas ações do sistema de follow-up
              </CardDescription>
            </CardHeader>
            <CardContent>
              {logs && logs.length > 0 ? (
                <div className="space-y-2 max-h-[300px]">
                  {logs.slice(0, 10).map((log) => {
                    const status = statusConfig[log.status] || statusConfig.skipped;
                    const StatusIcon = status.icon;
                    return (
                      <div
                        key={log.id}
                        className="flex items-center justify-between p-2 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <StatusIcon className="w-4 h-4" />
                          <div>
                            <p className="text-sm font-medium">
                              {log.contactName || formatPhone(log.contactNumber)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Estágio {log.stage + 1} • {formatDateTime(log.executedAt)}
                            </p>
                          </div>
                        </div>
                        <Badge className={cn("text-[10px]", status.color)}>
                          {status.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  Nenhum log encontrado
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Pendentes */}
        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Conversas com Follow-up Pendente</CardTitle>
              <CardDescription>
                Lista de conversas que receberão mensagens de follow-up
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {pending && pending.length > 0 ? (
                    pending.map((conv) => (
                      <div
                        key={conv.id}
                        className="flex items-center justify-between p-4 rounded-lg border hover:shadow-md transition-shadow"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <p className="font-medium text-lg">{conv.contactName || formatPhone(conv.contactNumber)}</p>
                            <Badge variant="outline" className="text-[10px]">
                              #{conv.stage + 1}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{formatPhone(conv.contactNumber)}</p>
                          <p className="text-xs text-muted-foreground">
                            Próximo: {formatDateTime(conv.nextFollowupAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => refetchPending()}
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Bell className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">Nenhum follow-up pendente</p>
                      <p className="text-sm">Quando clientes pararem de responder, os follow-ups aparecerão aqui</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Histórico */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Histórico Completo</CardTitle>
              <CardDescription>
                Todos os follow-ups enviados, falhados ou cancelados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {logs && logs.length > 0 ? (
                    logs.map((log) => {
                      const status = statusConfig[log.status] || statusConfig.skipped;
                      const StatusIcon = status.icon;
                      return (
                        <div
                          key={log.id}
                          className="flex items-start gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                        >
                          <StatusIcon className="w-5 h-5 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className="font-medium">
                                {log.contactName || formatPhone(log.contactNumber)}
                              </p>
                              <Badge className={cn("text-[10px]", status.color)}>
                                {status.label}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-1">
                              Estágio {log.stage + 1}
                            </p>
                            {log.messageContent && (
                              <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                                "{log.messageContent}"
                              </p>
                            )}
                            {log.errorReason && (
                              <p className="text-xs text-red-600 mt-1">
                                Erro: {log.errorReason}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDateTime(log.executedAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <HistoryIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">Nenhum log encontrado</p>
                      <p className="text-sm">O histórico será preenchido conforme os follow-ups são executados</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Configurações */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configurações Gerais</CardTitle>
              <CardDescription>
                Configure o comportamento do follow-up automático
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Follow-up Ativo</Label>
                  <p className="text-sm text-muted-foreground">
                    Quando ativado, mensagens automáticas serão enviadas para clientes que pararam de responder
                  </p>
                </div>
                <Switch
                  checked={formData.isEnabled ?? true}
                  onCheckedChange={(checked) => setFormData({ ...formData, isEnabled: checked })}
                />
              </div>

              <div className="space-y-2">
                <Label>Máximo de Tentativas</Label>
                <Input
                  type="number"
                  value={formData.maxAttempts || 8}
                  onChange={(e) => setFormData({ ...formData, maxAttempts: parseInt(e.target.value) })}
                  min={1}
                  max={20}
                />
                <p className="text-xs text-muted-foreground">
                  Número de mensagens de follow-up antes de pausar
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Loop Infinito</Label>
                  <p className="text-sm text-muted-foreground">
                    Continuar enviando follow-ups a cada 15-30 dias após acabar a sequência
                  </p>
                </div>
                <Switch
                  checked={formData.infiniteLoop ?? true}
                  onCheckedChange={(checked) => setFormData({ ...formData, infiniteLoop: checked })}
                />
              </div>

              {formData.infiniteLoop && (
                <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-primary/20">
                  <div className="space-y-2">
                    <Label>Mínimo (dias)</Label>
                    <Input
                      type="number"
                      value={formData.infiniteLoopMinDays || 15}
                      onChange={(e) => setFormData({ ...formData, infiniteLoopMinDays: parseInt(e.target.value) })}
                      min={1}
                      max={60}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Máximo (dias)</Label>
                    <Input
                      type="number"
                      value={formData.infiniteLoopMaxDays || 30}
                      onChange={(e) => setFormData({ ...formData, infiniteLoopMaxDays: parseInt(e.target.value) })}
                      min={1}
                      max={90}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Label>Sequência de Intervalos</Label>
                <div className="space-y-2">
                  {(formData.intervalsMinutes || [10, 30, 180, 1440]).map((interval, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Badge variant="outline" className="w-8 justify-center">#{i + 1}</Badge>
                      <span className="text-sm text-muted-foreground flex-1">
                        após {i === 0 ? 'última msg do cliente' : `follow-up #${i}`}
                      </span>
                      <span className="text-sm font-medium">
                        {formatInterval(interval)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Respeitar Horário Comercial</Label>
                  <p className="text-sm text-muted-foreground">
                    Enviar mensagens apenas durante o horário definido
                  </p>
                </div>
                <Switch
                  checked={formData.respectBusinessHours ?? true}
                  onCheckedChange={(checked) => setFormData({ ...formData, respectBusinessHours: checked })}
                />
              </div>

              {formData.respectBusinessHours && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Início</Label>
                      <Input
                        type="time"
                        value={formData.businessHoursStart || "09:00"}
                        onChange={(e) => setFormData({ ...formData, businessHoursStart: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fim</Label>
                      <Input
                        type="time"
                        value={formData.businessHoursEnd || "18:00"}
                        onChange={(e) => setFormData({ ...formData, businessHoursEnd: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Dias da Semana</Label>
                    <div className="flex gap-2">
                      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, i) => (
                        <Button
                          key={i}
                          variant={(formData.businessDays || [1, 2, 3, 4, 5]).includes(i) ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleDay(i)}
                        >
                          {day}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Usar Emojis</Label>
                  <p className="text-sm text-muted-foreground">
                    Incluir emojis moderadamente nas mensagens
                  </p>
                </div>
                <Switch
                  checked={formData.useEmojis ?? true}
                  onCheckedChange={(checked) => setFormData({ ...formData, useEmojis: checked })}
                />
              </div>

              <div className="pt-4 border-t">
                <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full">
                  <Save className="w-4 h-4 mr-2" />
                  {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
