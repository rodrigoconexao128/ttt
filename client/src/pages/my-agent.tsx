import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { 
  Bot, Sparkles, TestTube, Save, AlertCircle, CheckCircle2, 
  Plus, X, Zap, Settings2, Image as ImageIcon, Music, Video, 
  FileText, Upload, Trash2, Edit2, Loader2, RefreshCw, Check,
  Clock, MessageSquare, Filter, Info, ArrowRight, History
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/supabase";
import type { AiAgentConfig } from "@shared/schema";

// ============== TIPOS ==============
interface AgentMedia {
  id: string;
  userId: string;
  name: string;
  mediaType: "audio" | "image" | "video" | "document";
  storageUrl: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  durationSeconds?: number;
  description: string;
  whenToUse?: string;
  caption?: string;
  transcription?: string;
  isActive: boolean;
  sendAlone: boolean;
  displayOrder: number;
  createdAt: string;
}

interface MediaFormData {
  name: string;
  mediaType: "audio" | "image" | "video" | "document";
  storageUrl: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  description: string;
  whenToUse?: string;
  caption?: string;
  transcription?: string;
  isActive: boolean;
  sendAlone: boolean;
}

const initialMediaForm: MediaFormData = {
  name: "",
  mediaType: "audio",
  storageUrl: "",
  fileName: "",
  description: "",
  whenToUse: "",
  caption: "",
  transcription: "",
  isActive: true,
  sendAlone: false,
};

const mediaTypeIcons = {
  audio: Music,
  image: ImageIcon,
  video: Video,
  document: FileText,
};

// ============== COMPONENTE PRINCIPAL ==============
export default function MyAgent() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("prompt");
  
  // Estado do formulário principal
  const [prompt, setPrompt] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [triggerPhrases, setTriggerPhrases] = useState<string[]>([]);
  const [newTriggerPhrase, setNewTriggerPhrase] = useState("");
  const [messageSplitChars, setMessageSplitChars] = useState(400);
  const [responseDelaySeconds, setResponseDelaySeconds] = useState(30);
  const [fetchHistoryOnFirstResponse, setFetchHistoryOnFirstResponse] = useState(false);
  const [pauseOnManualReply, setPauseOnManualReply] = useState(true);
  
  // Estado do teste
  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState("");
  
  // Estado da biblioteca de mídias
  const [mediaList, setMediaList] = useState<AgentMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  const [editingMedia, setEditingMedia] = useState<AgentMedia | null>(null);
  const [mediaForm, setMediaForm] = useState<MediaFormData>(initialMediaForm);
  const [savingMedia, setSavingMedia] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Query de configuração
  const { data: config, isLoading } = useQuery<AiAgentConfig | null>({
    queryKey: ["/api/agent/config"],
  });

  // Carregar configuração
  useEffect(() => {
    if (config) {
      setPrompt(config.prompt || "");
      setIsActive(config.isActive || false);
      setTriggerPhrases(config.triggerPhrases || []);
      setMessageSplitChars(config.messageSplitChars ?? 400);
      setResponseDelaySeconds(config.responseDelaySeconds ?? 30);
      setFetchHistoryOnFirstResponse(config.fetchHistoryOnFirstResponse ?? false);
      setPauseOnManualReply((config as any).pauseOnManualReply ?? true);
    }
  }, [config]);

  // Carregar mídias
  const fetchMediaList = useCallback(async () => {
    try {
      setLoadingMedia(true);
      const token = await getAuthToken();
      const response = await fetch("/api/agent/media", {
        credentials: "include",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
      });
      
      if (response.ok) {
        const data = await response.json();
        setMediaList(data);
      }
    } catch (error) {
      console.error("Error fetching media:", error);
    } finally {
      setLoadingMedia(false);
    }
  }, []);

  useEffect(() => {
    fetchMediaList();
  }, [fetchMediaList]);

  // Mutations
  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/agent/config", {
        prompt,
        isActive,
        triggerPhrases,
        messageSplitChars,
        responseDelaySeconds,
        fetchHistoryOnFirstResponse,
        pauseOnManualReply,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/config"] });
      toast({
        title: "✅ Configuração Salva",
        description: "Seu agente IA foi atualizado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testAgentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/agent/test", {
        message: testMessage,
      });
      const data = await response.json();
      return data;
    },
    onSuccess: (data: any) => {
      setTestResponse(data?.response || "Sem resposta");
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao testar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ============== FUNÇÕES DE MÍDIA ==============
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setMediaForm(prev => ({
        ...prev,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        storageUrl: "",
      }));
    }
  };

  const uploadSelectedFile = async () => {
    if (!selectedFile) return null;
    setUploadingFile(true);
    try {
      const token = await getAuthToken();
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/agent/media/upload", {
        method: "POST",
        credentials: "include",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json();
      
      if (data.transcription && !mediaForm.transcription) {
        setMediaForm(prev => ({ ...prev, transcription: data.transcription }));
      }
      
      setSelectedFile(null);
      return data;
    } finally {
      setUploadingFile(false);
    }
  };

  const handleNewMedia = () => {
    setEditingMedia(null);
    setMediaForm({ ...initialMediaForm });
    setSelectedFile(null);
    setIsMediaDialogOpen(true);
  };

  const handleEditMedia = (media: AgentMedia) => {
    setEditingMedia(media);
    setMediaForm({
      name: media.name,
      mediaType: media.mediaType,
      storageUrl: media.storageUrl,
      fileName: media.fileName || "",
      fileSize: media.fileSize,
      mimeType: media.mimeType || "",
      description: media.description,
      whenToUse: media.whenToUse || "",
      caption: media.caption || "",
      transcription: media.transcription || "",
      isActive: media.isActive,
      sendAlone: media.sendAlone || false,
    });
    setSelectedFile(null);
    setIsMediaDialogOpen(true);
  };

  const handleSaveMedia = async () => {
    try {
      setSavingMedia(true);
      
      if (!mediaForm.name.trim() || !mediaForm.description.trim()) {
        toast({ title: "Erro", description: "Nome e descrição são obrigatórios", variant: "destructive" });
        return;
      }

      if (!mediaForm.storageUrl.trim() && !selectedFile) {
        toast({ title: "Erro", description: "Selecione um arquivo", variant: "destructive" });
        return;
      }

      let uploadData = null;
      if (selectedFile) {
        uploadData = await uploadSelectedFile();
        if (!uploadData) throw new Error("Upload failed");
      }

      const dataToSave = {
        ...mediaForm,
        storageUrl: uploadData?.storageUrl || mediaForm.storageUrl,
        fileName: uploadData?.fileName || mediaForm.fileName,
        fileSize: uploadData?.fileSize ?? mediaForm.fileSize,
        mimeType: uploadData?.mimeType || mediaForm.mimeType,
        mediaType: uploadData?.mediaType || mediaForm.mediaType,
        name: mediaForm.name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, ''),
      };

      const url = editingMedia ? `/api/agent/media/${editingMedia.id}` : "/api/agent/media";
      const method = editingMedia ? "PUT" : "POST";
      const token = await getAuthToken();

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify(dataToSave),
      });

      if (response.ok) {
        toast({ title: "Sucesso", description: editingMedia ? "Mídia atualizada!" : "Mídia adicionada!" });
        setIsMediaDialogOpen(false);
        fetchMediaList();
      } else {
        throw new Error("Failed to save");
      }
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setSavingMedia(false);
    }
  };

  const handleDeleteMedia = async (media: AgentMedia) => {
    if (!confirm(`Excluir "${media.name}"?`)) return;
    
    try {
      const token = await getAuthToken();
      await fetch(`/api/agent/media/${media.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
      });
      toast({ title: "Sucesso", description: "Mídia excluída!" });
      fetchMediaList();
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao excluir", variant: "destructive" });
    }
  };

  const handleTranscribe = async () => {
    if (!mediaForm.storageUrl || mediaForm.mediaType !== "audio") return;
    
    try {
      setTranscribing(true);
      const token = await getAuthToken();
      const response = await fetch("/api/agent/media/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          audioUrl: mediaForm.storageUrl,
          mimeType: mediaForm.mimeType || "audio/ogg",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMediaForm(prev => ({
          ...prev,
          transcription: data.transcription,
          description: prev.description || data.transcription.substring(0, 200),
        }));
        toast({ title: "Sucesso", description: "Áudio transcrito!" });
      }
    } catch (error) {
      toast({ title: "Erro", description: "Falha na transcrição", variant: "destructive" });
    } finally {
      setTranscribing(false);
    }
  };

  // Calcular progresso de configuração
  const configProgress = [
    prompt.length > 50,
    isActive,
    mediaList.length > 0,
  ].filter(Boolean).length;
  const progressPercent = (configProgress / 3) * 100;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gradient-to-b from-background to-muted/20">
      <div className="container max-w-5xl mx-auto p-6 space-y-6">
        
        {/* ============== HEADER COM PROGRESSO ============== */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
                <Bot className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                  Meu Agente IA
                </h1>
                <p className="text-muted-foreground">
                  Configure seu assistente inteligente
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <Badge
                variant={isActive ? "default" : "secondary"}
                className={`gap-2 px-4 py-2 text-sm ${isActive ? 'bg-green-500 hover:bg-green-600' : ''}`}
              >
                {isActive ? (
                  <><CheckCircle2 className="w-4 h-4" /> Ativo</>
                ) : (
                  <><AlertCircle className="w-4 h-4" /> Inativo</>
                )}
              </Badge>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                className="scale-125"
              />
            </div>
          </div>

          {/* Barra de Progresso */}
          <Card className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progresso da configuração</span>
                  <span className="font-medium">{configProgress}/3 etapas</span>
                </div>
                <Progress value={progressPercent} className="h-2" />
              </div>
              <div className="flex gap-2">
                {[
                  { done: prompt.length > 50, label: "Prompt" },
                  { done: isActive, label: "Ativado" },
                  { done: mediaList.length > 0, label: "Mídias" },
                ].map((step, i) => (
                  <Badge
                    key={i}
                    variant={step.done ? "default" : "outline"}
                    className={`text-xs ${step.done ? 'bg-green-500' : ''}`}
                  >
                    {step.done && <Check className="w-3 h-3 mr-1" />}
                    {step.label}
                  </Badge>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* ============== TABS PRINCIPAIS ============== */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 h-14">
            <TabsTrigger value="prompt" className="gap-2 text-sm">
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Instruções</span>
            </TabsTrigger>
            <TabsTrigger value="media" className="gap-2 text-sm">
              <ImageIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Mídias</span>
              {mediaList.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{mediaList.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2 text-sm">
              <Settings2 className="w-4 h-4" />
              <span className="hidden sm:inline">Configurações</span>
            </TabsTrigger>
            <TabsTrigger value="test" className="gap-2 text-sm">
              <TestTube className="w-4 h-4" />
              <span className="hidden sm:inline">Testar</span>
            </TabsTrigger>
          </TabsList>

          {/* ============== ABA: INSTRUÇÕES ============== */}
          <TabsContent value="prompt" className="space-y-4">
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Sparkles className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-lg font-semibold">Prompt do Agente</Label>
                    <p className="text-sm text-muted-foreground">
                      Defina a personalidade, tom e comportamento do seu agente. Seja específico!
                    </p>
                  </div>
                </div>

                <Textarea
                  placeholder={`Exemplo:
Você é um assistente de atendimento da [Nome da Empresa].

PERSONALIDADE:
- Seja simpático, profissional e direto
- Use emojis com moderação
- Sempre cumprimente o cliente pelo nome quando possível

INFORMAÇÕES:
- Horário: Segunda a Sexta, 8h às 18h
- Endereço: Rua Principal, 123
- WhatsApp: (11) 99999-9999

O QUE FAZER:
- Responda dúvidas sobre produtos e preços
- Agende visitas e reuniões
- Envie cardápios e catálogos quando solicitado

O QUE NÃO FAZER:
- Não invente informações que não sabe
- Se não souber, diga que vai verificar e retorna`}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={16}
                  className="resize-none text-base leading-relaxed"
                />

                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    {prompt.length} caracteres
                    {prompt.length < 50 && (
                      <span className="text-amber-500 ml-2">
                        (mínimo recomendado: 50)
                      </span>
                    )}
                  </div>
                  <Button
                    onClick={() => saveConfigMutation.mutate()}
                    disabled={saveConfigMutation.isPending || !prompt.trim()}
                    size="lg"
                  >
                    {saveConfigMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Salvar
                  </Button>
                </div>
              </div>
            </Card>

            {/* Dica guiada */}
            <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-500 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Próximo passo: Adicione mídias
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Configure áudios, imagens e vídeos que o agente pode enviar automaticamente.
                  </p>
                  <Button
                    variant="link"
                    className="p-0 h-auto text-blue-600"
                    onClick={() => setActiveTab("media")}
                  >
                    Ir para Mídias <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* ============== ABA: MÍDIAS ============== */}
          <TabsContent value="media" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Biblioteca de Mídias</h3>
                <p className="text-sm text-muted-foreground">
                  Adicione áudios, imagens e vídeos para o agente enviar
                </p>
              </div>
              <Button onClick={handleNewMedia}>
                <Plus className="w-4 h-4 mr-2" />
                Nova Mídia
              </Button>
            </div>

            {loadingMedia ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : mediaList.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="p-4 rounded-full bg-primary/10 mb-4">
                    <Upload className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">Nenhuma mídia cadastrada</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                    Adicione áudios, imagens ou vídeos que o agente pode enviar automaticamente.
                  </p>
                  <Button onClick={handleNewMedia}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar primeira mídia
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {mediaList.map((media) => {
                  const Icon = mediaTypeIcons[media.mediaType];
                  return (
                    <Card key={media.id} className={`relative ${!media.isActive ? 'opacity-50' : ''}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <CardTitle className="text-sm font-mono">{media.name}</CardTitle>
                              <Badge variant="secondary" className="text-xs mt-1">
                                {media.mediaType}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEditMedia(media)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteMedia(media)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {media.description}
                        </p>
                        {media.whenToUse && (
                          <p className="text-xs text-muted-foreground italic">
                            📌 {media.whenToUse}
                          </p>
                        )}
                        {media.mediaType === "audio" && media.storageUrl && (
                          <audio controls className="w-full h-8 mt-2" src={media.storageUrl} />
                        )}
                        {media.mediaType === "image" && media.storageUrl && (
                          <img src={media.storageUrl} alt={media.name} className="w-full h-20 object-cover rounded mt-2" />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ============== ABA: CONFIGURAÇÕES ============== */}
          <TabsContent value="settings" className="space-y-4">
            {/* Tempo de Resposta */}
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-base font-semibold">Tempo de Resposta</Label>
                    <p className="text-sm text-muted-foreground">
                      Aguarda antes de responder para acumular mensagens do cliente
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <Input
                    type="number"
                    min={5}
                    max={120}
                    step={5}
                    value={responseDelaySeconds}
                    onChange={(e) => setResponseDelaySeconds(Number(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">segundos</span>
                  <div className="flex gap-2">
                    {[
                      { value: 10, label: "Rápido" },
                      { value: 30, label: "Normal" },
                      { value: 60, label: "Lento" },
                    ].map((opt) => (
                      <Button
                        key={opt.value}
                        variant={responseDelaySeconds === opt.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setResponseDelaySeconds(opt.value)}
                      >
                        {opt.label} ({opt.value}s)
                      </Button>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-md">
                  💡 Um tempo maior permite que o cliente envie várias mensagens antes do agente responder, evitando respostas incompletas.
                </p>
              </div>
            </Card>

            {/* Tamanho das Bolhas */}
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <MessageSquare className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-base font-semibold">Tamanho das Mensagens</Label>
                    <p className="text-sm text-muted-foreground">
                      Quantos caracteres cada bolha de mensagem pode ter
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <Input
                    type="number"
                    min={0}
                    max={1000}
                    step={50}
                    value={messageSplitChars}
                    onChange={(e) => setMessageSplitChars(Number(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">caracteres</span>
                  <div className="flex gap-2">
                    {[
                      { value: 200, label: "Pequeno" },
                      { value: 400, label: "Médio" },
                      { value: 600, label: "Grande" },
                      { value: 0, label: "Sem divisão" },
                    ].map((opt) => (
                      <Button
                        key={opt.value}
                        variant={messageSplitChars === opt.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setMessageSplitChars(opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Frases Gatilho */}
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Filter className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-base font-semibold">Frases Gatilho</Label>
                    <p className="text-sm text-muted-foreground">
                      O agente só responde se a conversa contiver estas frases. Deixe vazio para responder todas.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {triggerPhrases.map((phrase, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={phrase}
                        onChange={(e) => {
                          const updated = [...triggerPhrases];
                          updated[index] = e.target.value;
                          setTriggerPhrases(updated);
                        }}
                        placeholder="Ex: vim do instagram"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setTriggerPhrases(triggerPhrases.filter((_, i) => i !== index))}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}

                  <div className="flex gap-2">
                    <Input
                      value={newTriggerPhrase}
                      onChange={(e) => setNewTriggerPhrase(e.target.value)}
                      placeholder="Adicionar frase gatilho..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newTriggerPhrase.trim()) {
                          setTriggerPhrases([...triggerPhrases, newTriggerPhrase.trim()]);
                          setNewTriggerPhrase("");
                        }
                      }}
                    />
                    <Button
                      onClick={() => {
                        if (newTriggerPhrase.trim()) {
                          setTriggerPhrases([...triggerPhrases, newTriggerPhrase.trim()]);
                          setNewTriggerPhrase("");
                        }
                      }}
                      disabled={!newTriggerPhrase.trim()}
                      variant="outline"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            {/* Histórico de Conversas */}
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <History className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-base font-semibold">Memória de Conversas Inteligente</Label>
                    <p className="text-sm text-muted-foreground">
                      Quando ativado, a IA analisa SEMPRE todo o histórico de conversas do cliente para entender o contexto completo
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${fetchHistoryOnFirstResponse ? 'bg-green-500/20' : 'bg-muted'}`}>
                      <History className={`w-5 h-5 ${fetchHistoryOnFirstResponse ? 'text-green-500' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className="font-medium">
                        {fetchHistoryOnFirstResponse ? 'Memória Ativa' : 'Memória Desativada'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fetchHistoryOnFirstResponse 
                          ? 'A IA analisa todo o histórico em cada resposta (otimizado para economia de tokens)' 
                          : 'A IA usa apenas o contexto recente da conversa'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={fetchHistoryOnFirstResponse}
                    onCheckedChange={setFetchHistoryOnFirstResponse}
                    className="scale-125"
                  />
                </div>

                <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 p-3 rounded-md">
                  💡 Ideal para advocacias, clínicas, e empresas que já têm histórico de conversas com clientes. A IA usa um sistema inteligente: últimas 30 mensagens na íntegra + resumo das anteriores. Isso economiza tokens mas mantém o contexto completo.
                </p>
              </div>
            </Card>

            {/* Pausar IA ao Responder Manualmente */}
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/10">
                    <AlertCircle className="w-5 h-5 text-orange-500" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-base font-semibold">Pausar IA ao Responder Manualmente</Label>
                    <p className="text-sm text-muted-foreground">
                      Quando você responde manualmente a um cliente, a IA pode ser pausada automaticamente para aquela conversa
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${pauseOnManualReply ? 'bg-orange-500/20' : 'bg-green-500/20'}`}>
                      <Bot className={`w-5 h-5 ${pauseOnManualReply ? 'text-orange-500' : 'text-green-500'}`} />
                    </div>
                    <div>
                      <p className="font-medium">
                        {pauseOnManualReply ? 'Pausar IA ao Responder' : 'Manter IA Sempre Ativa'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {pauseOnManualReply 
                          ? 'Quando você responder, a IA será pausada para aquela conversa' 
                          : 'A IA continua ativa mesmo após você responder manualmente'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={pauseOnManualReply}
                    onCheckedChange={setPauseOnManualReply}
                    className="scale-125"
                  />
                </div>

                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-md">
                  ⚠️ <strong>Recomendado: Ativado.</strong> Quando você responde manualmente, geralmente deseja assumir a conversa. 
                  Se desativar, a IA pode enviar respostas duplicadas ou conflitantes.
                  Para reativar a IA em uma conversa pausada, use o toggle na tela de conversas.
                </p>
              </div>
            </Card>

            <div className="flex justify-end">
              <Button
                onClick={() => saveConfigMutation.mutate()}
                disabled={saveConfigMutation.isPending}
                size="lg"
              >
                {saveConfigMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar Configurações
              </Button>
            </div>
          </TabsContent>

          {/* ============== ABA: TESTAR ============== */}
          <TabsContent value="test" className="space-y-4">
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <TestTube className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-lg font-semibold">Testar Agente</Label>
                    <p className="text-sm text-muted-foreground">
                      Simule uma conversa para ver como o agente responde
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <Textarea
                    placeholder="Digite uma mensagem de teste..."
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    rows={4}
                  />

                  <Button
                    onClick={() => testAgentMutation.mutate()}
                    disabled={testAgentMutation.isPending || !testMessage.trim()}
                    className="w-full"
                    size="lg"
                  >
                    {testAgentMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    Enviar Teste
                  </Button>

                  {testResponse && (
                    <div className="p-4 bg-muted rounded-lg space-y-2">
                      <Label className="text-sm font-semibold">Resposta do Agente:</Label>
                      <p className="text-sm whitespace-pre-wrap">{testResponse}</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ============== DIALOG DE MÍDIA ============== */}
      <Dialog open={isMediaDialogOpen} onOpenChange={setIsMediaDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMedia ? "Editar Mídia" : "Nova Mídia"}</DialogTitle>
            <DialogDescription>
              Configure a mídia e sua descrição para que o agente saiba quando usá-la.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Nome */}
            <div className="space-y-2">
              <Label>Nome da Mídia (ID)</Label>
              <Input
                placeholder="Ex: AUDIO_PRECO, IMG_CARDAPIO"
                value={mediaForm.name}
                onChange={(e) => setMediaForm(prev => ({ ...prev, name: e.target.value }))}
                className="font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">
                Use letras maiúsculas e underscores. A IA usará este nome para identificar a mídia.
              </p>
            </div>

            {/* Tipo */}
            <div className="space-y-2">
              <Label>Tipo de Mídia</Label>
              <Select
                value={mediaForm.mediaType}
                onValueChange={(value) => setMediaForm(prev => ({ ...prev, mediaType: value as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="audio">🎵 Áudio</SelectItem>
                  <SelectItem value="image">🖼️ Imagem</SelectItem>
                  <SelectItem value="video">🎬 Vídeo</SelectItem>
                  <SelectItem value="document">📄 Documento</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Upload */}
            <div className="space-y-2">
              <Label>Arquivo</Label>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept={
                  mediaForm.mediaType === "audio" ? "audio/*" :
                  mediaForm.mediaType === "image" ? "image/*" :
                  mediaForm.mediaType === "video" ? "video/*" : "*/*"
                }
                onChange={handleFileSelect}
              />

              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors`}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm">Enviando...</p>
                  </div>
                ) : selectedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <Check className="w-8 h-8 text-green-500" />
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <Button variant="outline" size="sm">Trocar arquivo</Button>
                  </div>
                ) : mediaForm.storageUrl ? (
                  <div className="flex flex-col items-center gap-2">
                    <Check className="w-8 h-8 text-green-500" />
                    <p className="text-sm text-green-600">Arquivo pronto</p>
                    <Button variant="outline" size="sm">Trocar arquivo</Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <p className="text-sm">Clique para selecionar</p>
                  </div>
                )}
              </div>
            </div>

            {/* Preview de Imagem */}
            {mediaForm.mediaType === "image" && mediaForm.storageUrl && (
              <img src={mediaForm.storageUrl} alt="Preview" className="w-full max-h-48 object-contain rounded border" />
            )}

            {/* Preview de Áudio */}
            {mediaForm.mediaType === "audio" && mediaForm.storageUrl && (
              <div className="space-y-2">
                <audio controls className="w-full" src={mediaForm.storageUrl} />
                <Button variant="outline" onClick={handleTranscribe} disabled={transcribing}>
                  {transcribing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Transcrever
                </Button>
              </div>
            )}

            {/* Transcrição */}
            {mediaForm.mediaType === "audio" && (
              <div className="space-y-2">
                <Label>Transcrição</Label>
                <Textarea
                  placeholder="Transcrição do áudio..."
                  value={mediaForm.transcription}
                  onChange={(e) => setMediaForm(prev => ({ ...prev, transcription: e.target.value }))}
                  rows={2}
                />
              </div>
            )}

            {/* Descrição */}
            <div className="space-y-2">
              <Label>Descrição para a IA *</Label>
              <Textarea
                placeholder="Ex: Áudio explicando os preços dos produtos principais"
                value={mediaForm.description}
                onChange={(e) => setMediaForm(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                A IA usa esta descrição para decidir quando enviar. NÃO é enviada ao cliente.
              </p>
            </div>

            {/* Quando usar */}
            <div className="space-y-2">
              <Label>Quando usar</Label>
              <Textarea
                placeholder="Ex: Quando o cliente perguntar sobre preços"
                value={mediaForm.whenToUse}
                onChange={(e) => setMediaForm(prev => ({ ...prev, whenToUse: e.target.value }))}
                rows={2}
              />
            </div>

            {/* Legenda (só para imagem/vídeo) */}
            {(mediaForm.mediaType === "image" || mediaForm.mediaType === "video") && (
              <div className="space-y-2">
                <Label>Legenda da Mídia</Label>
                <Textarea
                  placeholder="Ex: 📍 Nossa localização! Estamos na Av. Principal, 123"
                  value={mediaForm.caption}
                  onChange={(e) => setMediaForm(prev => ({ ...prev, caption: e.target.value }))}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Esta legenda será enviada junto com a imagem/vídeo no WhatsApp.
                </p>
              </div>
            )}

            {/* Switches */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Mídia ativa</Label>
                  <p className="text-xs text-muted-foreground">Mídias inativas não são usadas pela IA</p>
                </div>
                <Switch
                  checked={mediaForm.isActive}
                  onCheckedChange={(checked) => setMediaForm(prev => ({ ...prev, isActive: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Enviar sozinha</Label>
                  <p className="text-xs text-muted-foreground">Se ativado, não será combinada com outras mídias</p>
                </div>
                <Switch
                  checked={mediaForm.sendAlone}
                  onCheckedChange={(checked) => setMediaForm(prev => ({ ...prev, sendAlone: checked }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMediaDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveMedia} disabled={savingMedia || uploadingFile}>
              {(savingMedia || uploadingFile) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingMedia ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
