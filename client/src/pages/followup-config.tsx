import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Bell, 
  Clock, 
  MessageCircle, 
  Settings, 
  Sparkles, 
  Plus, 
  Trash2, 
  Save,
  BarChart3,
  Calendar,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw
} from "lucide-react";

interface ImportantInfo {
  titulo: string;
  conteudo: string;
  usado?: boolean;
}

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
  importantInfo: ImportantInfo[];
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

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

const TONE_OPTIONS = [
  { value: "consultivo", label: "Consultivo", description: "Ajuda o cliente a tomar decisões" },
  { value: "vendedor", label: "Vendedor", description: "Persuasivo mas não agressivo" },
  { value: "humano", label: "Humanizado", description: "Casual, como um amigo" },
  { value: "técnico", label: "Técnico", description: "Profissional e detalhado" },
];

export default function FollowupConfigPage() {
  const { toast } = useToast();
  const [newInfo, setNewInfo] = useState({ titulo: "", conteudo: "" });

  // Buscar configuração
  const { data: config, isLoading: configLoading } = useQuery<FollowupConfig>({
    queryKey: ["/api/followup/config"],
  });

  // Buscar estatísticas
  const { data: stats } = useQuery<FollowupStats>({
    queryKey: ["/api/followup/stats"],
    refetchInterval: 30000, // Atualiza a cada 30s
  });

  // Buscar pendentes
  const { data: pending } = useQuery<any[]>({
    queryKey: ["/api/followup/pending"],
    refetchInterval: 30000,
  });

  // Estado local para edição
  const [formData, setFormData] = useState<Partial<FollowupConfig>>({});

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  // Mutation para salvar
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<FollowupConfig>) => {
      return await apiRequest("PUT", "/api/followup/config", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/followup/config"] });
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

  const addImportantInfo = () => {
    if (!newInfo.titulo || !newInfo.conteudo) {
      toast({
        title: "Preencha todos os campos",
        description: "Título e conteúdo são obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    const currentInfo = formData.importantInfo || [];
    if (currentInfo.length >= 10) {
      toast({
        title: "Limite atingido",
        description: "Máximo de 10 informações importantes.",
        variant: "destructive",
      });
      return;
    }

    setFormData({
      ...formData,
      importantInfo: [...currentInfo, { ...newInfo, usado: false }],
    });
    setNewInfo({ titulo: "", conteudo: "" });
  };

  const removeImportantInfo = (index: number) => {
    const currentInfo = formData.importantInfo || [];
    setFormData({
      ...formData,
      importantInfo: currentInfo.filter((_, i) => i !== index),
    });
  };

  const formatInterval = (minutes: number): string => {
    if (minutes < 60) return `${minutes}min`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
    return `${Math.floor(minutes / 1440)}d`;
  };

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-primary" />
            Follow-up Inteligente
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure mensagens automáticas para recuperar conversas paradas
          </p>
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          <Save className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? "Salvando..." : "Salvar Alterações"}
        </Button>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
              <Clock className="w-5 h-5 text-blue-500" />
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
      </div>

      <Tabs defaultValue="config" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="config">
            <Settings className="w-4 h-4 mr-2" />
            Configuração
          </TabsTrigger>
          <TabsTrigger value="timing">
            <Clock className="w-4 h-4 mr-2" />
            Horários
          </TabsTrigger>
          <TabsTrigger value="content">
            <MessageCircle className="w-4 h-4 mr-2" />
            Conteúdo
          </TabsTrigger>
          <TabsTrigger value="pending">
            <Bell className="w-4 h-4 mr-2" />
            Pendentes ({pending?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* Tab Configuração */}
        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configurações Gerais</CardTitle>
              <CardDescription>
                Ative ou desative o follow-up automático para todas as conversas
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
                <div className="flex items-center gap-4">
                  <Slider
                    value={[formData.maxAttempts || 8]}
                    onValueChange={([value]) => setFormData({ ...formData, maxAttempts: value })}
                    max={20}
                    min={1}
                    step={1}
                    className="flex-1"
                  />
                  <span className="w-12 text-center font-mono">{formData.maxAttempts || 8}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Número de mensagens de follow-up antes de pausar (ou entrar em loop infinito)
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

              <div className="space-y-2">
                <Label>Sequência de Intervalos</Label>
                <div className="flex flex-wrap gap-2">
                  {(formData.intervalsMinutes || [10, 30, 180, 1440, 2880, 4320, 10080, 21600]).map((interval, i) => (
                    <Badge key={i} variant="secondary" className="text-sm">
                      #{i + 1}: {formatInterval(interval)}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tempo entre cada tentativa de follow-up
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Horários */}
        <TabsContent value="timing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Horário Comercial</CardTitle>
              <CardDescription>
                Configure quando o follow-up pode ser enviado
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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
                      {WEEKDAYS.map((day) => (
                        <Button
                          key={day.value}
                          variant={(formData.businessDays || [1, 2, 3, 4, 5]).includes(day.value) ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleDay(day.value)}
                        >
                          {day.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Conteúdo */}
        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tom e Estilo</CardTitle>
              <CardDescription>
                Configure como a IA deve se comunicar nas mensagens de follow-up
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Tom da Conversa</Label>
                <Select
                  value={formData.tone || "consultivo"}
                  onValueChange={(value) => setFormData({ ...formData, tone: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div>
                          <div className="font-medium">{option.label}</div>
                          <div className="text-xs text-muted-foreground">{option.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Nível de Formalidade: {formData.formalityLevel || 5}/10</Label>
                <Slider
                  value={[formData.formalityLevel || 5]}
                  onValueChange={([value]) => setFormData({ ...formData, formalityLevel: value })}
                  max={10}
                  min={1}
                  step={1}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Informal</span>
                  <span>Formal</span>
                </div>
              </div>

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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Informações Importantes</CardTitle>
              <CardDescription>
                Adicione argumentos e informações que a IA pode usar nos follow-ups (máximo 10)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Lista de informações existentes */}
              <div className="space-y-3">
                {(formData.importantInfo || []).map((info, index) => (
                  <div key={index} className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{info.titulo}</p>
                      <p className="text-sm text-muted-foreground">{info.conteudo}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeImportantInfo(index)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Formulário para adicionar */}
              {(formData.importantInfo || []).length < 10 && (
                <div className="space-y-3 pt-3 border-t">
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <Input
                      placeholder="Ex: Garantia, Desconto, Entrega Grátis..."
                      value={newInfo.titulo}
                      onChange={(e) => setNewInfo({ ...newInfo, titulo: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Conteúdo</Label>
                    <Textarea
                      placeholder="Ex: Oferecemos 60 dias de garantia total com troca grátis..."
                      value={newInfo.conteudo}
                      onChange={(e) => setNewInfo({ ...newInfo, conteudo: e.target.value })}
                    />
                  </div>
                  <Button variant="outline" onClick={addImportantInfo}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Informação
                  </Button>
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
              {pending && pending.length > 0 ? (
                <div className="space-y-3">
                  {pending.map((conv) => (
                    <div key={conv.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">{conv.contactName || conv.contactNumber}</p>
                        <p className="text-sm text-muted-foreground">{conv.contactNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          Estágio {conv.stage + 1} • Próximo: {conv.nextFollowupAt ? new Date(conv.nextFollowupAt).toLocaleString('pt-BR') : 'N/A'}
                        </p>
                      </div>
                      <Badge variant={conv.stage === 0 ? "default" : "secondary"}>
                        #{conv.stage + 1}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum follow-up pendente</p>
                  <p className="text-sm">Quando clientes pararem de responder, aparecerão aqui</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
