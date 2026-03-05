import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ContextualHelpButton } from "@/components/contextual-help-button";
import { 
  Loader2, 
  Mic, 
  Volume2, 
  Play, 
  Pause, 
  Settings, 
  Info,
  User,
  UserCircle2,
  Gauge,
  BarChart3,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

interface AudioConfig {
  isEnabled: boolean;
  voiceType: "female" | "male";
  speed: number;
}

interface AudioUsage {
  used: number;
  remaining: number;
  limit: number;
  canSend: boolean;
}

interface AudioConfigResponse {
  config: AudioConfig;
  usage: AudioUsage;
}

const SPEED_PRESETS = [
  { value: 0.75, label: "Lento", description: "Mais calmo e pausado" },
  { value: 1.0, label: "Normal", description: "Velocidade natural" },
  { value: 1.25, label: "Rápido", description: "Mais ágil" },
  { value: 1.5, label: "Muito Rápido", description: "Para quem tem pressa" },
];

export default function AudioConfigPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewSpeed, setPreviewSpeed] = useState<number | null>(null);
  const [localSpeed, setLocalSpeed] = useState<number>(1.0);
  const [localVoiceType, setLocalVoiceType] = useState<"female" | "male">("female");
  const [localIsEnabled, setLocalIsEnabled] = useState<boolean>(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Buscar configuração atual
  const { data: configData, isLoading } = useQuery<AudioConfigResponse>({
    queryKey: ["/api/audio-config"],
  });
  
  // Sincronizar estado local quando os dados chegarem
  useEffect(() => {
    if (configData) {
      setLocalSpeed(configData.config.speed);
      setLocalVoiceType(configData.config.voiceType);
      setLocalIsEnabled(configData.config.isEnabled);
    }
  }, [configData]);

  // Mutação para atualizar configuração
  const updateConfigMutation = useMutation({
    mutationFn: async (data: Partial<AudioConfig>) => {
      const res = await apiRequest("PUT", "/api/audio-config", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/audio-config"] });
      setHasUnsavedChanges(false);
      toast({
        title: "Configuração salva!",
        description: "Suas preferências de áudio foram atualizadas.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Não foi possível salvar as configurações.",
        variant: "destructive",
      });
    },
  });

  // Função para gerar preview de áudio
  const generatePreview = async (speed: number) => {
    setIsGeneratingPreview(true);
    setPreviewSpeed(speed);
    
    try {
      const response = await apiRequest("POST", "/api/audio-config/preview", { 
        speed, 
        voiceType: localVoiceType 
      });

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      toast({
        title: "Erro ao gerar preview",
        description: "Não foi possível gerar o áudio de teste.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  // Função para testar com texto personalizado
  const testWithCurrentConfig = async () => {
    setIsGeneratingPreview(true);
    
    try {
      const response = await apiRequest("POST", "/api/audio-config/test", { 
        speed: localSpeed,
      });

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      toast({
        title: "Erro ao gerar teste",
        description: "Não foi possível gerar o áudio de teste.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  // Salvar configurações
  const saveConfig = () => {
    updateConfigMutation.mutate({
      isEnabled: localIsEnabled,
      voiceType: localVoiceType,
      speed: localSpeed,
    });
  };

  // Calcular porcentagem de uso
  const usagePercentage = configData?.usage 
    ? (configData.usage.used / configData.usage.limit) * 100 
    : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-full bg-primary/10">
          <Mic className="h-8 w-8 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Falar por Áudio</h1>
            <ContextualHelpButton articleId="audio-overview" title="Como usar o Falar por Áudio" description="Configure seu agente para responder com mensagens de voz." size="sm" />
          </div>
          <p className="text-muted-foreground">
            Configure as respostas em áudio do seu agente IA
          </p>
        </div>
      </div>

      {/* Status do Uso */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Uso Diário
            </CardTitle>
            {configData?.usage && (
              <Badge variant={configData.usage.canSend ? "default" : "destructive"}>
                {configData.usage.canSend ? (
                  <><CheckCircle className="h-3 w-3 mr-1" /> Disponível</>
                ) : (
                  <><AlertCircle className="h-3 w-3 mr-1" /> Limite atingido</>
                )}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Áudios enviados hoje</span>
              <span className="font-medium">
                {configData?.usage?.used || 0} / {configData?.usage?.limit || 30}
              </span>
            </div>
            <Progress value={usagePercentage} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {configData?.usage?.remaining || 30} áudios restantes. O contador reseta à meia-noite.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Configuração Principal */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configurações de Áudio
              </CardTitle>
              <CardDescription>
                Personalize como seu agente responde por voz
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="audio-enabled" className="text-sm">
                {localIsEnabled ? "Ativado" : "Desativado"}
              </Label>
              <Switch
                id="audio-enabled"
                checked={localIsEnabled}
                onCheckedChange={(checked) => {
                  setLocalIsEnabled(checked);
                  setHasUnsavedChanges(true);
                }}
              />
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Seleção de Voz */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Volume2 className="h-4 w-4" />
              Tipo de Voz
            </Label>
            <RadioGroup
              value={localVoiceType}
              onValueChange={(value: "female" | "male") => {
                setLocalVoiceType(value);
                setHasUnsavedChanges(true);
              }}
              className="grid grid-cols-2 gap-4"
            >
              <div>
                <RadioGroupItem
                  value="female"
                  id="voice-female"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="voice-female"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                >
                  <UserCircle2 className="mb-2 h-8 w-8" />
                  <span className="font-medium">Francisca</span>
                  <span className="text-xs text-muted-foreground">Voz Feminina</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem
                  value="male"
                  id="voice-male"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="voice-male"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                >
                  <User className="mb-2 h-8 w-8" />
                  <span className="font-medium">Antonio</span>
                  <span className="text-xs text-muted-foreground">Voz Masculina</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Separator />

          {/* Velocidade */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Gauge className="h-4 w-4" />
                Velocidade da Fala
              </Label>
              <Badge variant="outline">{localSpeed.toFixed(2)}x</Badge>
            </div>
            
            <Slider
              value={[localSpeed]}
              min={0.5}
              max={2.0}
              step={0.05}
              onValueChange={(value) => {
                setLocalSpeed(value[0]);
                setHasUnsavedChanges(true);
              }}
              className="w-full"
            />
            
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.5x (Lento)</span>
              <span>1.0x (Normal)</span>
              <span>2.0x (Rápido)</span>
            </div>
          </div>

          <Separator />

          {/* Testar Velocidades */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              Testar Velocidades
            </Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {SPEED_PRESETS.map((preset) => (
                <Button
                  key={preset.value}
                  variant={previewSpeed === preset.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => generatePreview(preset.value)}
                  disabled={isGeneratingPreview}
                  className="flex flex-col h-auto py-2"
                >
                  {isGeneratingPreview && previewSpeed === preset.value ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <span className="font-medium">{preset.label}</span>
                      <span className="text-xs opacity-70">{preset.value}x</span>
                    </>
                  )}
                </Button>
              ))}
            </div>
          </div>

          {/* Teste com configuração atual */}
          <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
            <Info className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Testar sua configuração</p>
              <p className="text-xs text-muted-foreground">
                Ouça como ficará a voz do seu agente com as configurações atuais
              </p>
            </div>
            <Button
              onClick={testWithCurrentConfig}
              disabled={isGeneratingPreview}
              variant="secondary"
            >
              {isGeneratingPreview ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Testar
            </Button>
          </div>

          {/* Player de Áudio (escondido) */}
          <audio 
            ref={audioRef} 
            onEnded={() => setIsPlaying(false)}
            onPause={() => setIsPlaying(false)}
            className="hidden"
          />
        </CardContent>

        <CardFooter className="flex justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {hasUnsavedChanges ? (
              <span className="text-amber-600">Você tem alterações não salvas</span>
            ) : (
              "Todas as alterações estão salvas"
            )}
          </p>
          <Button
            onClick={saveConfig}
            disabled={!hasUnsavedChanges || updateConfigMutation.isPending}
          >
            {updateConfigMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Salvar Configurações
          </Button>
        </CardFooter>
      </Card>

      {/* Informações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-5 w-5" />
            Como funciona?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="font-medium">✨ Respostas em Áudio</h4>
              <p className="text-sm text-muted-foreground">
                Quando ativado, seu agente enviará uma mensagem de voz junto com cada resposta de texto, 
                criando uma experiência mais humanizada e envolvente.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">📊 Limite Diário</h4>
              <p className="text-sm text-muted-foreground">
                Você pode enviar até 30 mensagens de áudio por dia. 
                O contador reseta automaticamente à meia-noite.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">🎙️ Vozes Neurais</h4>
              <p className="text-sm text-muted-foreground">
                Utilizamos a tecnologia Microsoft Edge TTS com vozes neurais brasileiras 
                de alta qualidade: Francisca (feminina) e Antonio (masculina).
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">⚡ Velocidade Personalizada</h4>
              <p className="text-sm text-muted-foreground">
                Ajuste a velocidade da fala de acordo com sua preferência, 
                de 0.5x (lento) até 2.0x (muito rápido).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
