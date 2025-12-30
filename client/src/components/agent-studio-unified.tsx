import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Bot, ArrowRight, Sparkles, MessageSquare, Edit3, 
  Loader2, Send, Code, Smartphone, 
  CheckCircle2, Wand2, RefreshCw, Settings, Zap,
  Undo2, Redo2, History, ChevronUp,
  Image as ImageIcon, Music, Video, FileText, Plus, Trash2, Upload, Check,
  Clock, Brain, Pause, X, Save, Pencil, File
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// ============ INTERFACES ============
interface AgentConfig {
  id: string;
  prompt: string;
  isActive: boolean;
  model: string;
  triggerPhrases: string[];
  messageSplitChars: number;
  responseDelaySeconds: number;
  fetchHistoryOnFirstResponse: boolean;
  pauseOnManualReply: boolean;
}

interface MediaItem {
  id: string;
  name: string;
  mediaType: 'image' | 'audio' | 'video' | 'document';
  storageUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  durationSeconds?: number;
  description?: string;
  whenToUse?: string;
  caption?: string;
  transcription?: string;
  isPtt?: boolean;
  sendAlone?: boolean;
  isActive: boolean;
  displayOrder: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface SimulatorMessage {
  id: string;
  role: "user" | "agent";
  message: string;
  time: string;
}

interface PromptHistoryEntry {
  id: string;
  prompt: string;
  instruction: string;
  timestamp: Date;
  summary: string;
}

type Section = 'chat' | 'code' | 'media' | 'config';

// ============ COMPONENTE PRINCIPAL ============
export function AgentStudioUnified() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const simulatorEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // ============ ESTADO PRINCIPAL ============
  const [activeSection, setActiveSection] = useState<Section>('chat');
  const [mobileView, setMobileView] = useState<"editor" | "simulator">("editor");
  
  // Estado do prompt
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  
  // Estado do chat de edição
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [editInput, setEditInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Sistema de Undo/Redo
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showHistory, setShowHistory] = useState(false);
  
  // Estado do simulador
  const [simulatorMessages, setSimulatorMessages] = useState<SimulatorMessage[]>([]);
  const [simulatorInput, setSimulatorInput] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  
  // Estado de configurações
  const [isActive, setIsActive] = useState(true);
  const [responseDelaySeconds, setResponseDelaySeconds] = useState(30);
  const [messageSplitChars, setMessageSplitChars] = useState(400);
  const [triggerPhrases, setTriggerPhrases] = useState<string[]>([]);
  const [newTriggerPhrase, setNewTriggerPhrase] = useState("");
  const [fetchHistoryOnFirstResponse, setFetchHistoryOnFirstResponse] = useState(true);
  const [pauseOnManualReply, setPauseOnManualReply] = useState(true);
  
  // Estado de mídias
  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const [editingMedia, setEditingMedia] = useState<MediaItem | null>(null);
  const [mediaForm, setMediaForm] = useState({
    name: "",
    mediaType: "audio" as "audio" | "image" | "video" | "document",
    description: "",
    whenToUse: "",
    caption: "",
    transcription: "",
    isPtt: false,
    sendAlone: false,
    isActive: true
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  // ============ QUERIES ============
  const { data: config, isLoading: configLoading } = useQuery<AgentConfig>({
    queryKey: ["/api/agent/config"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agent/config");
      return res.json();
    }
  });

  const { data: mediaItems = [], isLoading: mediaLoading } = useQuery<MediaItem[]>({
    queryKey: ["/api/agent/media"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agent/media");
      return res.json();
    }
  });

  // Estado para controlar se o histórico já foi carregado
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [versionsLoaded, setVersionsLoaded] = useState(false);
  
  // Reset versionsLoaded quando config muda (navegação)
  useEffect(() => {
    return () => {
      setVersionsLoaded(false);
      setHistoryLoaded(false);
    };
  }, []);

  // Query para carregar histórico do chat de edição
  const { data: savedChatHistory } = useQuery<{ success: boolean; messages: { id: string; role: string; content: string; createdAt: string }[] }>({
    queryKey: ["/api/agent/prompt-chat"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agent/prompt-chat");
      return res.json();
    },
    refetchOnMount: 'always' // Sempre refazer quando componente é montado
  });

  // Query para carregar versões do prompt do banco
  const { data: promptVersionsData } = useQuery<{ success: boolean; versions: { id: string; versionNumber: number; promptContent: string; editSummary: string; isCurrent: boolean; createdAt: string }[] }>({
    queryKey: ["/api/agent/prompt-versions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agent/prompt-versions");
      return res.json();
    },
    refetchOnMount: 'always' // Sempre refazer quando componente é montado
  });

  // Carregar versões do prompt para o histórico
  useEffect(() => {
    if (promptVersionsData?.versions && promptVersionsData.versions.length > 0) {
      console.log("[VERSIONS] 📚 Carregando", promptVersionsData.versions.length, "versões do banco");
      
      const versions: PromptHistoryEntry[] = promptVersionsData.versions
        .sort((a, b) => a.versionNumber - b.versionNumber)
        .map(v => {
          console.log(`[VERSIONS] v${v.versionNumber}: ID=${v.id}, isCurrent=${v.isCurrent}, summary="${v.editSummary}"`);
          return {
            id: v.id, // 🔥 ID ÚNICO de cada versão
            prompt: v.promptContent,
            instruction: v.editSummary || `Versão ${v.versionNumber}`,
            timestamp: new Date(v.createdAt),
            summary: v.editSummary || `Versão ${v.versionNumber}`
          };
        });
      
      setPromptHistory(versions);
      
      // Set index to current version
      const currentIndex = versions.findIndex(v => v.id === promptVersionsData.versions.find(pv => pv.isCurrent)?.id);
      const finalIndex = currentIndex >= 0 ? currentIndex : versions.length - 1;
      
      console.log(`[VERSIONS] ✅ ${versions.length} versões carregadas, índice atual: ${finalIndex}`);
      setHistoryIndex(finalIndex);
      setVersionsLoaded(true);
    }
  }, [promptVersionsData]);

  // Carregar histórico do chat de edição quando disponível (apenas uma vez)
  useEffect(() => {
    if (savedChatHistory?.messages && savedChatHistory.messages.length > 0 && !historyLoaded) {
      setHistoryLoaded(true);
      const messages: ChatMessage[] = savedChatHistory.messages.map(m => ({
        id: m.id,
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
        timestamp: new Date(m.createdAt)
      }));
      setChatMessages(messages);
    }
  }, [savedChatHistory, historyLoaded]);

  // ============ MUTATIONS ============
  const updateConfigMutation = useMutation({
    mutationFn: async (data: Partial<AgentConfig>) => {
      console.log("[MUTATION] 💾 Enviando para /api/agent/config:", JSON.stringify(data).substring(0, 200));
      const res = await apiRequest("POST", "/api/agent/config", data);
      const result = await res.json();
      console.log("[MUTATION] ✅ Resposta:", JSON.stringify(result).substring(0, 200));
      return result;
    },
    onSuccess: async (data, variables) => {
      // 🔄 Invalidar todas as queries relacionadas para forçar refetch
      console.log("[MUTATION] 🔄 Invalidando queries...");
      await queryClient.invalidateQueries({ queryKey: ["/api/agent/config"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/agent/prompt-versions"] });
      
      console.log("[MUTATION] 🔄 Queries invalidadas - UI será atualizada");
      
      // Feedback diferente se foi salvamento de prompt
      if (variables.prompt) {
        toast({ 
          title: "✅ Prompt salvo!", 
          description: "Nova versão criada no histórico automaticamente." 
        });
      } else {
        toast({ 
          title: "✅ Salvo!", 
          description: "Configurações atualizadas." 
        });
      }
    },
    onError: (error) => {
      console.error("[MUTATION] ❌ Erro:", error);
      toast({ title: "Erro", description: "Falha ao salvar.", variant: "destructive" });
    }
  });

  const uploadMediaMutation = useMutation({
    mutationFn: async (data: { 
      file: File; 
      name: string; 
      mediaType: string;
      description: string; 
      whenToUse: string; 
      caption: string; 
      transcription: string;
      isPtt: boolean; 
      sendAlone: boolean;
      isActive: boolean;
    }) => {
      // 1. Upload do arquivo para Supabase Storage
      const formData = new FormData();
      formData.append("file", data.file);
      
      // Obter token de autenticação
      const token = await getAuthToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      
      const uploadRes = await fetch("/api/agent/media/upload", {
        method: "POST",
        body: formData,
        headers,
        credentials: "include"
      });
      
      if (!uploadRes.ok) {
        throw new Error("Falha no upload do arquivo");
      }
      
      const uploadData = await uploadRes.json();
      
      if (!uploadData.success || !uploadData.storageUrl) {
        throw new Error("Falha ao obter URL do arquivo");
      }
      
      // 2. Salvar registro no banco de dados
      const mediaData = {
        name: data.name || data.file.name.replace(/\.[^/.]+$/, "").toUpperCase().replace(/[^A-Z0-9]/g, "_"),
        mediaType: data.mediaType || uploadData.mediaType,
        storageUrl: uploadData.storageUrl,
        fileName: uploadData.fileName,
        fileSize: uploadData.fileSize,
        mimeType: uploadData.mimeType,
        description: data.description || `Mídia: ${data.name}`,
        whenToUse: data.whenToUse,
        caption: data.caption,
        transcription: data.transcription || uploadData.transcription,
        isPtt: data.isPtt,
        sendAlone: data.sendAlone,
        isActive: data.isActive
      };
      
      const saveRes = await apiRequest("POST", "/api/agent/media", mediaData);
      return saveRes.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/media"] });
      toast({ title: "Mídia salva!", description: "Arquivo adicionado." });
      closeMediaDialog();
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message || "Falha ao fazer upload.", variant: "destructive" });
    }
  });

  const updateMediaMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<MediaItem> }) => {
      const res = await apiRequest("PUT", `/api/agent/media/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/media"] });
      toast({ title: "Atualizado!", description: "Mídia atualizada." });
      closeMediaDialog();
    }
  });

  const deleteMediaMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/agent/media/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/media"] });
      toast({ title: "Removido!", description: "Mídia removida." });
    }
  });

  // ============ EFFECTS ============
  useEffect(() => {
    if (config) {
      setCurrentPrompt(config.prompt || "");
      setIsActive(config.isActive ?? true);
      setResponseDelaySeconds(config.responseDelaySeconds || 30);
      setMessageSplitChars(config.messageSplitChars || 400);
      setTriggerPhrases(config.triggerPhrases || []);
      setFetchHistoryOnFirstResponse(config.fetchHistoryOnFirstResponse ?? true);
      setPauseOnManualReply(config.pauseOnManualReply ?? true);
      
      // Inicializa histórico
      if (promptHistory.length === 0 && config.prompt) {
        setPromptHistory([{
          id: "initial",
          prompt: config.prompt,
          instruction: "Prompt inicial",
          timestamp: new Date(),
          summary: "Versão original"
        }]);
        setHistoryIndex(0);
      }
      
      // Mensagem de boas-vindas (apenas se não tiver histórico carregado)
      if (chatMessages.length === 0 && !historyLoaded) {
        setChatMessages([{
          id: "welcome",
          role: "system",
          content: "🎉 Agente criado! Você pode me dizer ajustes que quer fazer ou testar no simulador ao lado.",
          timestamp: new Date()
        }]);
      }
    }
  }, [config, historyLoaded]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    simulatorEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [simulatorMessages]);

  // ============ FUNÇÕES DE HISTÓRICO ============
  const addToHistory = useCallback((newPrompt: string, instruction: string, summary: string) => {
    const newEntry: PromptHistoryEntry = {
      id: `history-${Date.now()}`,
      prompt: newPrompt,
      instruction,
      timestamp: new Date(),
      summary
    };
    const newHistory = [...promptHistory.slice(0, historyIndex + 1), newEntry];
    setPromptHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [promptHistory, historyIndex]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < promptHistory.length - 1;

  const handleUndo = useCallback(() => {
    if (canUndo) {
      const newIndex = historyIndex - 1;
      const previousEntry = promptHistory[newIndex];
      setCurrentPrompt(previousEntry.prompt);
      setHistoryIndex(newIndex);
      setHasChanges(true);
      setChatMessages(prev => [...prev, {
        id: `system-undo-${Date.now()}`,
        role: "system",
        content: `⏪ Desfez: "${previousEntry.instruction}"`,
        timestamp: new Date()
      }]);
    }
  }, [canUndo, historyIndex, promptHistory]);

  const handleRedo = useCallback(() => {
    if (canRedo) {
      const newIndex = historyIndex + 1;
      const nextEntry = promptHistory[newIndex];
      setCurrentPrompt(nextEntry.prompt);
      setHistoryIndex(newIndex);
      setHasChanges(true);
      setChatMessages(prev => [...prev, {
        id: `system-redo-${Date.now()}`,
        role: "system",
        content: `⏩ Refez: "${nextEntry.instruction}"`,
        timestamp: new Date()
      }]);
    }
  }, [canRedo, historyIndex, promptHistory]);

  const restoreFromHistory = useCallback(async (index: number) => {
    const entry = promptHistory[index];
    console.log("\n[RESTORE] ═══════════════════════════════════════════════════════");
    console.log("[RESTORE] 🔄 Restaurando versão");
    console.log("[RESTORE] Index no array:", index);
    console.log("[RESTORE] Instruction:", entry?.instruction);
    console.log("[RESTORE] Version ID (ÚNICO):", entry?.id);
    console.log("[RESTORE] Prompt length:", entry?.prompt?.length);
    
    if (!entry || !entry.id) {
      console.error("[RESTORE] ❌ Entrada inválida ou sem ID");
      console.log("[RESTORE] ═══════════════════════════════════════════════════════\n");
      toast({
        title: "Erro ao restaurar",
        description: "Versão inválida",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setShowHistory(false);
      
      // 🔥 CRÍTICO: Usar rota de restore que cria NOVA versão com ID ÚNICO
      console.log("[RESTORE] 📡 POST /api/agent/prompt-versions/" + entry.id + "/restore");
      const response = await apiRequest("POST", `/api/agent/prompt-versions/${entry.id}/restore`, {});
      const data = await response.json();
      
      if (data.success && data.newPrompt) {
        console.log("[RESTORE] ✅ SUCESSO!");
        console.log("[RESTORE] 🆕 Nova versão criada: v" + data.versionNumber + " (ID: " + data.versionId + ")");
        console.log("[RESTORE] 📋 Restaurada da versão: v" + data.restoredFrom);
        console.log("[RESTORE] 📏 Novo prompt length:", data.newPrompt.length);
        
        // Atualizar UI local
        setCurrentPrompt(data.newPrompt);
        setHasChanges(false);
        
        // 🔄 CRÍTICO: Forçar refetch para carregar NOVA versão criada
        console.log("[RESTORE] 🔄 Invalidando queries para recarregar histórico...");
        await queryClient.invalidateQueries(["/api/agent/prompt-versions"]);
        await queryClient.invalidateQueries(["/api/agent/config"]);
        console.log("[RESTORE] ✅ Queries invalidadas - UI será atualizada");
        
        setChatMessages(prev => [...prev, {
          id: `system-restore-${Date.now()}`,
          role: "system",
          content: `🔄 Restaurado da v${data.restoredFrom} → Nova v${data.versionNumber} criada (ID único: ${data.versionId.substring(0, 8)}...)`,
          timestamp: new Date()
        }]);
        
        toast({
          title: "✅ Versão restaurada",
          description: `Restaurado da v${data.restoredFrom}. Nova versão v${data.versionNumber} criada.`
        });
        
        console.log("[RESTORE] ═══════════════════════════════════════════════════════\n");
      } else {
        throw new Error(data.message || "Falha ao restaurar");
      }
    } catch (error: any) {
      console.error("[RESTORE] ❌ ERRO:", error);
      console.log("[RESTORE] ═══════════════════════════════════════════════════════\n");
      toast({
        title: "Erro ao restaurar versão",
        description: error.message || "Tente novamente",
        variant: "destructive"
      });
    }
  }, [promptHistory, queryClient, toast]);

  // ============ EDIÇÃO VIA CHAT ============
        variant: "destructive"
      });
    }
  }, [promptHistory, queryClient, toast]);

  // ============ EDIÇÃO VIA CHAT ============
  const handleEditPrompt = async () => {
    if (!editInput.trim() || isProcessing) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: editInput,
      timestamp: new Date()
    };
    
    const currentInstruction = editInput;
    setChatMessages(prev => [...prev, userMessage]);
    setEditInput("");
    setIsProcessing(true);

    try {
      const response = await apiRequest("POST", "/api/agent/edit-prompt", {
        currentPrompt,
        instruction: currentInstruction
      });
      
      const data = await response.json();
      
      if (data.success && data.newPrompt && data.newPrompt !== currentPrompt) {
        addToHistory(data.newPrompt, currentInstruction, data.summary || "Edição aplicada");
        setCurrentPrompt(data.newPrompt);
        setHasChanges(false);
        
        const feedbackContent = data.feedbackMessage || data.summary || "Mudanças aplicadas!";
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: feedbackContent,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, assistantMessage]);
        
        // Auto-save
        updateConfigMutation.mutate({ prompt: data.newPrompt });
      } else {
        const warningMessage: ChatMessage = {
          id: `warning-${Date.now()}`,
          role: "assistant",
          content: data.feedbackMessage || `⚠️ Não consegui aplicar essa mudança. Tente ser mais específico.`,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, warningMessage]);
      }
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `❌ Erro ao processar. Tente novamente.`,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  // ============ SIMULADOR ============
  const handleSimulate = async () => {
    if (!simulatorInput.trim() || isSimulating) return;

    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    const userMsg: SimulatorMessage = {
      id: `sim-user-${Date.now()}`,
      role: "user",
      message: simulatorInput,
      time
    };
    setSimulatorMessages(prev => [...prev, userMsg]);
    setSimulatorInput("");
    setIsSimulating(true);

    try {
      const response = await apiRequest("POST", "/api/agent/test", {
        message: simulatorInput,
        customPrompt: currentPrompt
      });
      
      const data = await response.json();
      const agentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const agentMsg: SimulatorMessage = {
        id: `sim-agent-${Date.now()}`,
        role: "agent",
        message: data?.response || "Sem resposta",
        time: agentTime
      };
      setSimulatorMessages(prev => [...prev, agentMsg]);
    } catch (error: any) {
      toast({
        title: "Erro no simulador",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSimulating(false);
    }
  };

  // ============ SALVAR PROMPT ============
  const handleSavePrompt = () => {
    console.log("\n[SAVE] ═══════════════════════════════════════════════════════");
    console.log("[SAVE] 💾 Salvando prompt manualmente");
    console.log("[SAVE] Prompt length:", currentPrompt.length, "chars");
    console.log("[SAVE] Backend vai criar versão automaticamente");
    console.log("[SAVE] ═══════════════════════════════════════════════════════\n");
    
    updateConfigMutation.mutate({ prompt: currentPrompt });
    setHasChanges(false);
  };

  // ============ SALVAR CONFIGURAÇÕES ============
  const handleSaveConfig = () => {
    updateConfigMutation.mutate({
      isActive,
      responseDelaySeconds,
      messageSplitChars,
      triggerPhrases,
      fetchHistoryOnFirstResponse,
      pauseOnManualReply
    });
  };

  // ============ FUNÇÕES DE MÍDIA ============
  const closeMediaDialog = () => {
    setMediaDialogOpen(false);
    setEditingMedia(null);
    setSelectedFile(null);
    setMediaForm({ name: "", mediaType: "audio", description: "", whenToUse: "", caption: "", transcription: "", isPtt: false, sendAlone: false, isActive: true });
  };

  const openNewMediaDialog = () => {
    setEditingMedia(null);
    setMediaForm({ name: "", mediaType: "audio", description: "", whenToUse: "", caption: "", transcription: "", isPtt: false, sendAlone: false, isActive: true });
    setSelectedFile(null);
    setMediaDialogOpen(true);
  };

  const openEditMediaDialog = (media: MediaItem) => {
    setEditingMedia(media);
    setMediaForm({
      name: media.name,
      mediaType: media.mediaType,
      description: media.description || "",
      whenToUse: media.whenToUse || "",
      caption: media.caption || "",
      transcription: media.transcription || "",
      isPtt: media.isPtt || false,
      sendAlone: media.sendAlone || false,
      isActive: media.isActive ?? true
    });
    setMediaDialogOpen(true);
  };

  const handleMediaSubmit = async () => {
    if (editingMedia) {
      updateMediaMutation.mutate({
        id: editingMedia.id,
        data: {
          name: mediaForm.name,
          mediaType: mediaForm.mediaType,
          description: mediaForm.description,
          whenToUse: mediaForm.whenToUse,
          caption: mediaForm.caption,
          transcription: mediaForm.transcription,
          isPtt: mediaForm.isPtt,
          sendAlone: mediaForm.sendAlone,
          isActive: mediaForm.isActive
        }
      });
    } else {
      if (!selectedFile) {
        toast({ title: "Selecione um arquivo", variant: "destructive" });
        return;
      }
      // Converter nome para MAIÚSCULAS_COM_UNDERSCORES (requisito do backend)
      const rawName = mediaForm.name || selectedFile.name.replace(/\.[^/.]+$/, "");
      const formattedName = rawName.toUpperCase().replace(/[^A-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
      
      uploadMediaMutation.mutate({
        file: selectedFile,
        name: formattedName,
        mediaType: mediaForm.mediaType,
        description: mediaForm.description,
        whenToUse: mediaForm.whenToUse,
        caption: mediaForm.caption,
        transcription: mediaForm.transcription,
        isPtt: mediaForm.isPtt,
        sendAlone: mediaForm.sendAlone,
        isActive: mediaForm.isActive
      });
    }
  };

  const getMediaIcon = (type: string) => {
    switch (type) {
      case 'image': return <ImageIcon className="h-5 w-5" />;
      case 'audio': return <Music className="h-5 w-5" />;
      case 'video': return <Video className="h-5 w-5" />;
      default: return <File className="h-5 w-5" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleAddTriggerPhrase = () => {
    if (!newTriggerPhrase.trim()) return;
    if (!triggerPhrases.includes(newTriggerPhrase.trim())) {
      setTriggerPhrases([...triggerPhrases, newTriggerPhrase.trim()]);
    }
    setNewTriggerPhrase("");
  };

  const handleRemoveTriggerPhrase = (phrase: string) => {
    setTriggerPhrases(triggerPhrases.filter(p => p !== phrase));
  };

  const quickActions = [
    { label: "Mais formal", instruction: "Torne o tom mais formal e profissional" },
    { label: "Mais vendedor", instruction: "Adicione técnicas de vendas e persuasão" },
    { label: "Mais curto", instruction: "Faça as respostas serem mais curtas e diretas" },
  ];

  // ============ LOADING STATE ============
  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ============ RENDER PRINCIPAL ============
  return (
    <div className="flex flex-col h-full">
      
      {/* Mobile Tab Switcher */}
      <div className="md:hidden flex items-center justify-center gap-2 px-3 py-2 border-b bg-background">
        <button
          onClick={() => setMobileView("editor")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all",
            mobileView === "editor" 
              ? "bg-primary text-primary-foreground shadow-md" 
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          )}
        >
          <Edit3 className="w-4 h-4" />
          Editor
        </button>
        <button
          onClick={() => setMobileView("simulator")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all",
            mobileView === "simulator" 
              ? "bg-[#075E54] text-white shadow-md" 
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          )}
        >
          <Smartphone className="w-4 h-4" />
          Preview
        </button>
      </div>

      {/* Main Split View */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* ============ LEFT PANEL: EDITOR ============ */}
        <div className={cn(
          "flex-1 flex flex-col border-r bg-background relative overflow-hidden",
          mobileView !== "editor" && "hidden md:flex"
        )}>
          
          {/* Editor Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Editor de Agente</h3>
                <p className="text-[10px] text-muted-foreground">
                  {activeSection === "chat" ? "Converse para editar" : 
                   activeSection === "code" ? "Edite o prompt diretamente" :
                   activeSection === "media" ? "Biblioteca de mídias" : "Configurações"}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Undo/Redo Buttons - só mostra no chat/code */}
              {(activeSection === "chat" || activeSection === "code") && (
                <div className="flex items-center gap-0.5 mr-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className="h-8 w-8 p-0"
                    title="Desfazer"
                  >
                    <Undo2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className="h-8 w-8 p-0"
                    title="Refazer"
                  >
                    <Redo2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowHistory(!showHistory)}
                    className={cn("h-8 w-8 p-0", showHistory && "bg-muted")}
                    title="Histórico"
                  >
                    <History className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* Section Toggle */}
              <div className="hidden md:flex bg-muted rounded-lg p-0.5 overflow-x-auto">
                {/* Toggle IA Ativo */}
                <div className={cn(
                  "flex items-center gap-2 px-3 py-1 rounded-md mr-2 transition-colors",
                  isActive ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"
                )}>
                  <Switch
                    checked={isActive}
                    onCheckedChange={(checked) => {
                      setIsActive(checked);
                      updateConfigMutation.mutate({ isActive: checked });
                    }}
                    className={cn("h-4 w-8", isActive ? "data-[state=checked]:bg-green-600" : "")}
                  />
                  <span className={cn(
                    "text-xs font-medium",
                    isActive ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                  )}>
                    {isActive ? "IA ON" : "IA OFF"}
                  </span>
                </div>
                
                <Button
                  variant={activeSection === "chat" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveSection("chat")}
                  className="h-7 px-2 text-xs"
                >
                  <MessageSquare className="w-3 h-3 mr-1" />
                  Chat
                </Button>
                <Button
                  variant={activeSection === "code" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveSection("code")}
                  className="h-7 px-2 text-xs"
                >
                  <Code className="w-3 h-3 mr-1" />
                  Editar
                </Button>
                <Button
                  variant={activeSection === "media" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveSection("media")}
                  className="h-7 px-2 text-xs"
                >
                  <ImageIcon className="w-3 h-3 mr-1" />
                  Mídias
                </Button>
                <Button
                  variant={activeSection === "config" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveSection("config")}
                  className="h-7 px-2 text-xs"
                >
                  <Settings className="w-3 h-3 mr-1" />
                  Config
                </Button>
              </div>
              
              {/* Save Button */}
              {hasChanges && (
                <Button size="sm" onClick={handleSavePrompt} className="hidden md:flex">
                  <Zap className="w-3 h-3 mr-1" />
                  Salvar
                </Button>
              )}
            </div>
          </div>

          {/* Mobile Section Tabs */}
          <div className="md:hidden flex bg-muted/20 p-1 overflow-x-auto border-b items-center">
            {/* Toggle IA Mobile */}
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-md mr-2 flex-shrink-0",
              isActive ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"
            )}>
              <Switch
                checked={isActive}
                onCheckedChange={(checked) => {
                  setIsActive(checked);
                  updateConfigMutation.mutate({ isActive: checked });
                }}
                className={cn("h-3 w-6", isActive ? "data-[state=checked]:bg-green-600" : "")}
              />
              <span className={cn(
                "text-[10px] font-medium",
                isActive ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
              )}>
                {isActive ? "ON" : "OFF"}
              </span>
            </div>
            
            <Button
              variant={activeSection === "chat" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveSection("chat")}
              className="h-7 px-2 text-xs flex-shrink-0"
            >
              <MessageSquare className="w-3 h-3 mr-1" />
              Chat
            </Button>
            <Button
              variant={activeSection === "code" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveSection("code")}
              className="h-7 px-2 text-xs flex-shrink-0"
            >
              <Code className="w-3 h-3 mr-1" />
              Editar
            </Button>
            <Button
              variant={activeSection === "media" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveSection("media")}
              className="h-7 px-2 text-xs flex-shrink-0"
            >
              <ImageIcon className="w-3 h-3 mr-1" />
              Mídias
            </Button>
            <Button
              variant={activeSection === "config" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveSection("config")}
              className="h-7 px-2 text-xs flex-shrink-0"
            >
              <Settings className="w-3 h-3 mr-1" />
              Config
            </Button>
          </div>

          {/* History Panel */}
          {showHistory && promptHistory.length > 1 && (
            <div className="absolute top-12 left-0 right-0 z-50 border-b bg-background/95 backdrop-blur-sm shadow-lg px-4 py-3 max-h-64 overflow-y-auto mx-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">
                  📜 Histórico ({promptHistory.length} versões)
                </p>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-1">
                {[...promptHistory].reverse().slice(0, 15).map((entry, idx) => {
                  const actualIndex = promptHistory.length - 1 - idx;
                  const isActive = actualIndex === historyIndex;
                  
                  // 🔥 Verificar se é a versão que está realmente no banco (is_current)
                  const isCurrentInDB = promptVersionsData?.versions?.find(v => v.id === entry.id)?.isCurrent;
                  
                  // 🔥 Verificar se o prompt desta versão é igual ao prompt atual no config
                  const isReallyInUse = config?.prompt === entry.prompt;
                  
                  return (
                    <button
                      key={entry.id}
                      onClick={() => restoreFromHistory(actualIndex)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors overflow-hidden relative",
                        isActive 
                          ? "bg-primary/10 border border-primary/30" 
                          : "hover:bg-muted border border-transparent"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={cn("truncate", isActive && "font-medium")}>
                              {entry.instruction}
                            </span>
                            {isReallyInUse && (
                              <Badge variant="default" className="text-[9px] px-1.5 py-0 h-4 bg-green-500">
                                EM USO
                              </Badge>
                            )}
                            {isCurrentInDB && !isReallyInUse && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                                Atual
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{entry.timestamp.toLocaleString('pt-BR', { 
                              day: '2-digit', 
                              month: '2-digit', 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}</span>
                            <span>•</span>
                            <span>{entry.prompt.length} chars</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ============ SECTION: CHAT ============ */}
          {activeSection === "chat" && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                      <Wand2 className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-lg">Editor Inteligente</h4>
                      <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                        Diga o que quer mudar no seu agente
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center mt-4">
                      {quickActions.map((action, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          onClick={() => setEditInput(action.instruction)}
                          className="text-xs h-8 rounded-full"
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                
                {chatMessages.map((msg) => (
                  <div key={msg.id} className={cn(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}>
                    <div className={cn(
                      "px-4 py-2.5 rounded-2xl max-w-[85%] shadow-sm",
                      msg.role === "user" 
                        ? "bg-primary text-primary-foreground rounded-br-md" 
                        : msg.role === "system"
                        ? "bg-muted/50 text-muted-foreground text-center mx-auto text-sm"
                        : "bg-muted rounded-bl-md"
                    )}>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                
                {isProcessing && (
                  <div className="flex justify-start">
                    <div className="bg-muted px-4 py-3 rounded-2xl rounded-bl-md">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Aplicando mudanças...</span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>
              
              {/* Chat Input */}
              <div className="border-t bg-muted/20 p-3">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Ex: Torne as respostas mais curtas..."
                    value={editInput}
                    onChange={(e) => setEditInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleEditPrompt();
                      }
                    }}
                    className="flex-1 min-h-[44px] max-h-[120px] resize-none rounded-xl bg-white dark:bg-zinc-800 border-2 border-input shadow-sm focus:border-primary focus:ring-1 focus:ring-primary"
                    rows={1}
                  />
                  <Button
                    onClick={handleEditPrompt}
                    disabled={isProcessing || !editInput.trim()}
                    size="icon"
                    className="h-11 w-11 rounded-xl flex-shrink-0"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                
                {editInput === "" && chatMessages.length > 0 && (
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {quickActions.map((action, i) => (
                      <button
                        key={i}
                        onClick={() => setEditInput(action.instruction)}
                        className="text-[10px] px-2 py-1 rounded-full border border-border/50 bg-background hover:bg-muted transition-colors"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ============ SECTION: CODE ============ */}
          {activeSection === "code" && (
            <div className="flex-1 flex flex-col p-4">
              <Textarea
                value={currentPrompt}
                onChange={(e) => {
                  setCurrentPrompt(e.target.value);
                  setHasChanges(true);
                }}
                className="flex-1 font-mono text-sm resize-none bg-zinc-950 text-green-400 rounded-xl p-4 border-zinc-800"
                spellCheck={false}
              />
              <Button onClick={handleSavePrompt} className="mt-3" disabled={updateConfigMutation.isPending}>
                {updateConfigMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar Prompt
              </Button>
            </div>
          )}

          {/* ============ SECTION: MEDIA ============ */}
          {activeSection === "media" && (
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Biblioteca de Mídias</h2>
                  <Button onClick={openNewMediaDialog} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar
                  </Button>
                </div>

                {mediaLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : mediaItems.length === 0 ? (
                  <Card className="py-12">
                    <CardContent className="flex flex-col items-center text-center">
                      <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground mb-4">
                        Nenhuma mídia cadastrada ainda
                      </p>
                      <Button onClick={openNewMediaDialog}>
                        <Plus className="h-4 w-4 mr-2" />
                        Adicionar primeira mídia
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {mediaItems.map((media) => (
                      <Card key={media.id} className="overflow-hidden">
                        <div className="aspect-video bg-muted flex items-center justify-center relative">
                          {media.mediaType === 'image' && media.storageUrl ? (
                            <img 
                              src={media.storageUrl} 
                              alt={media.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              {getMediaIcon(media.mediaType)}
                              <span className="text-xs">{media.mediaType}</span>
                            </div>
                          )}
                          <Badge className="absolute top-2 right-2 text-xs">
                            {media.mediaType}
                          </Badge>
                        </div>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{media.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(media.fileSize)}
                              </p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8"
                                onClick={() => openEditMediaDialog(media)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-destructive"
                                onClick={() => deleteMediaMutation.mutate(media.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          {media.whenToUse && (
                            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                              {media.whenToUse}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          {/* ============ SECTION: CONFIG ============ */}
          {activeSection === "config" && (
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                <h2 className="text-lg font-semibold">Configurações do Agente</h2>

                {/* Tempo de Resposta */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Tempo de Resposta
                    </CardTitle>
                    <CardDescription>
                      Delay antes de enviar resposta
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant={responseDelaySeconds === 10 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setResponseDelaySeconds(10)}
                      >
                        <Zap className="h-3 w-3 mr-1" />
                        Rápido (10s)
                      </Button>
                      <Button
                        variant={responseDelaySeconds === 30 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setResponseDelaySeconds(30)}
                      >
                        Normal (30s)
                      </Button>
                      <Button
                        variant={responseDelaySeconds === 60 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setResponseDelaySeconds(60)}
                      >
                        Lento (60s)
                      </Button>
                    </div>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[responseDelaySeconds]}
                        onValueChange={([v]) => setResponseDelaySeconds(v)}
                        min={5}
                        max={120}
                        step={5}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-12 text-right">{responseDelaySeconds}s</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Tamanho das Mensagens */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Tamanho das Mensagens
                    </CardTitle>
                    <CardDescription>
                      Dividir mensagens longas
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant={messageSplitChars === 200 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setMessageSplitChars(200)}
                      >
                        Pequeno (200)
                      </Button>
                      <Button
                        variant={messageSplitChars === 400 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setMessageSplitChars(400)}
                      >
                        Médio (400)
                      </Button>
                      <Button
                        variant={messageSplitChars === 0 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setMessageSplitChars(0)}
                      >
                        Sem divisão
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Frases Gatilho */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Frases Gatilho
                    </CardTitle>
                    <CardDescription>
                      A IA só responde se a mensagem contiver uma dessas frases
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        value={newTriggerPhrase}
                        onChange={(e) => setNewTriggerPhrase(e.target.value)}
                        placeholder="Ex: olá, quero saber"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTriggerPhrase()}
                      />
                      <Button onClick={handleAddTriggerPhrase} disabled={!newTriggerPhrase.trim()}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {triggerPhrases.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {triggerPhrases.map((phrase, i) => (
                          <Badge key={i} variant="secondary" className="pl-2 pr-1 py-1">
                            {phrase}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 ml-1"
                              onClick={() => handleRemoveTriggerPhrase(phrase)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Sem frases gatilho = IA responde a todas mensagens
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Memória de Conversas */}
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Brain className="h-4 w-4" />
                          Memória de Conversas
                        </CardTitle>
                        <CardDescription>
                          Buscar histórico na primeira resposta
                        </CardDescription>
                      </div>
                      <Switch
                        checked={fetchHistoryOnFirstResponse}
                        onCheckedChange={setFetchHistoryOnFirstResponse}
                      />
                    </div>
                  </CardHeader>
                </Card>

                {/* Pausar ao Responder Manualmente */}
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Pause className="h-4 w-4" />
                          Pausar IA ao Responder
                        </CardTitle>
                        <CardDescription>
                          Desativa IA quando você responde
                        </CardDescription>
                      </div>
                      <Switch
                        checked={pauseOnManualReply}
                        onCheckedChange={setPauseOnManualReply}
                      />
                    </div>
                  </CardHeader>
                </Card>

                {/* Botão Salvar */}
                <Button 
                  onClick={handleSaveConfig} 
                  disabled={updateConfigMutation.isPending}
                  className="w-full"
                  size="lg"
                >
                  {updateConfigMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Salvar Configurações
                </Button>
              </div>
            </ScrollArea>
          )}
        </div>

        {/* ============ RIGHT PANEL: SIMULATOR ============ */}
        <div className={cn(
          "w-full md:w-[380px] lg:w-[420px] flex-shrink-0 flex flex-col bg-[#e5ddd5] dark:bg-zinc-900",
          mobileView !== "simulator" && "hidden md:flex"
        )}>
          
          {/* Simulator Header */}
          <div className="bg-[#075E54] dark:bg-zinc-800 text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">Simulador WhatsApp</p>
              <p className="text-xs text-white/70">
                Teste seu agente em tempo real
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSimulatorMessages([])}
              className="text-white/70 hover:text-white hover:bg-white/10 text-xs"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Limpar
            </Button>
          </div>

          {/* Simulator Messages */}
          <div 
            className="flex-1 overflow-y-auto p-4 space-y-3"
            style={{ 
              backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' 
            }}
          >
            {simulatorMessages.length === 0 && (
              <div className="flex justify-center">
                <div className="bg-[#FCF4CB] dark:bg-yellow-900/30 text-[#54656F] dark:text-yellow-200 text-xs px-4 py-2 rounded-lg shadow-sm text-center max-w-[250px]">
                  <Smartphone className="w-4 h-4 mx-auto mb-1" />
                  Teste como seu agente responde. Digite uma mensagem abaixo.
                </div>
              </div>
            )}

            {simulatorMessages.map((msg) => (
              <div key={msg.id} className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}>
                <div className={cn(
                  "px-3 py-2 rounded-lg max-w-[80%] shadow-sm",
                  msg.role === "user" 
                    ? "bg-[#DCF8C6] dark:bg-green-800 text-[#303030] dark:text-white rounded-tr-none" 
                    : "bg-white dark:bg-zinc-700 text-[#303030] dark:text-white rounded-tl-none"
                )}>
                  <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                  <p className={cn(
                    "text-[10px] text-right mt-1",
                    msg.role === "user" ? "text-[#667781] dark:text-green-300" : "text-[#667781] dark:text-zinc-400"
                  )}>
                    {msg.time} {msg.role === "user" && "✓✓"}
                  </p>
                </div>
              </div>
            ))}

            {isSimulating && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-zinc-700 px-4 py-3 rounded-lg rounded-tl-none shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-xs text-muted-foreground">digitando...</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={simulatorEndRef} />
          </div>

          {/* Simulator Input */}
          <div className="bg-[#F0F0F0] dark:bg-zinc-800 px-3 py-2 flex items-end gap-2 flex-shrink-0">
            <Textarea
              placeholder="Digite sua mensagem..."
              value={simulatorInput}
              onChange={(e) => setSimulatorInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && simulatorInput.trim()) {
                  e.preventDefault();
                  handleSimulate();
                }
              }}
              className="flex-1 resize-none rounded-2xl border-0 bg-white dark:bg-zinc-700 min-h-[44px] max-h-[120px] py-3 px-4 text-sm"
              rows={1}
            />
            <Button
              onClick={handleSimulate}
              disabled={isSimulating || !simulatorInput.trim()}
              size="icon"
              className="h-11 w-11 rounded-full bg-[#00A884] hover:bg-[#008f6f] flex-shrink-0"
            >
              {isSimulating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ArrowRight className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Media Dialog */}
      <Dialog open={mediaDialogOpen} onOpenChange={setMediaDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingMedia ? 'Editar Mídia' : 'Nova Mídia'}
            </DialogTitle>
            <DialogDescription>
              {editingMedia 
                ? 'Atualize as informações da mídia'
                : 'Adicione uma nova mídia à biblioteca do agente'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Nome */}
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={mediaForm.name}
                onChange={(e) => setMediaForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Áudio de boas vindas"
              />
            </div>

            {/* Tipo de Mídia */}
            <div className="space-y-2">
              <Label>Tipo de Mídia</Label>
              <Select
                value={mediaForm.mediaType}
                onValueChange={(value: "audio" | "image" | "video" | "document") => setMediaForm(prev => ({ ...prev, mediaType: value }))}
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

            {/* Upload de Arquivo */}
            {!editingMedia && (
              <div className="space-y-2">
                <Label>Upload de Arquivo</Label>
                <div 
                  className={cn(
                    "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                    dragActive ? "border-primary/70 bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                  )}
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragActive(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      setSelectedFile(e.dataTransfer.files[0]);
                    }
                  }}
                >
                  {selectedFile ? (
                    <div className="flex flex-col items-center gap-2">
                      {mediaForm.mediaType === "audio" && <Music className="h-8 w-8 text-primary" />}
                      {mediaForm.mediaType === "image" && <ImageIcon className="h-8 w-8 text-primary" />}
                      {mediaForm.mediaType === "video" && <Video className="h-8 w-8 text-primary" />}
                      {mediaForm.mediaType === "document" && <FileText className="h-8 w-8 text-primary" />}
                      <p className="text-sm font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      >
                        Trocar arquivo
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm font-medium">Clique ou arraste para selecionar</p>
                      <p className="text-xs text-muted-foreground">
                        {mediaForm.mediaType === "audio" && "Formatos: OGG, OPUS, MP3, M4A, WAV (max 16MB)"}
                        {mediaForm.mediaType === "image" && "Formatos: JPG, PNG, GIF, WEBP (max 5MB)"}
                        {mediaForm.mediaType === "video" && "Formatos: MP4, WEBM, MOV (max 64MB)"}
                        {mediaForm.mediaType === "document" && "Qualquer formato (max 100MB)"}
                      </p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={
                      mediaForm.mediaType === "audio" ? "audio/*,.ogg,.opus,.mp3,.m4a,.wav" :
                      mediaForm.mediaType === "image" ? "image/*,.jpg,.jpeg,.png,.gif,.webp" :
                      mediaForm.mediaType === "video" ? "video/*,.mp4,.webm,.mov" :
                      "*/*"
                    }
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>
            )}

            {/* Preview de Áudio */}
            {mediaForm.mediaType === "audio" && editingMedia?.storageUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <audio controls className="w-full" src={editingMedia.storageUrl}>
                  Seu navegador não suporta áudio.
                </audio>
              </div>
            )}

            {/* Preview de Imagem */}
            {mediaForm.mediaType === "image" && editingMedia?.storageUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <img 
                  src={editingMedia.storageUrl} 
                  alt="Preview"
                  className="w-full max-h-48 object-contain rounded-md border"
                />
              </div>
            )}

            {/* Transcrição (apenas para áudio) */}
            {mediaForm.mediaType === "audio" && (
              <div className="space-y-2">
                <Label>Transcrição (opcional)</Label>
                <Textarea
                  placeholder="Transcrição do áudio..."
                  value={mediaForm.transcription}
                  onChange={(e) => setMediaForm(prev => ({ ...prev, transcription: e.target.value }))}
                  rows={3}
                />
              </div>
            )}

            {/* Descrição para a IA */}
            <div className="space-y-2">
              <Label>Descrição para a IA *</Label>
              <Textarea
                value={mediaForm.description}
                onChange={(e) => setMediaForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Ex: Áudio explicando os preços dos produtos principais"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Esta descrição ajuda o agente a entender quando enviar esta mídia.
              </p>
            </div>

            {/* Quando usar */}
            <div className="space-y-2">
              <Label>Quando usar (opcional)</Label>
              <Textarea
                value={mediaForm.whenToUse}
                onChange={(e) => setMediaForm(prev => ({ ...prev, whenToUse: e.target.value }))}
                placeholder="Ex: Quando o cliente perguntar sobre preços ou valores"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Instrução adicional para o agente saber quando enviar esta mídia.
              </p>
            </div>

            {/* Legenda (apenas para imagem/vídeo) */}
            {(mediaForm.mediaType === "image" || mediaForm.mediaType === "video") && (
              <div className="space-y-2">
                <Label>Legenda da Mídia (opcional)</Label>
                <Textarea
                  value={mediaForm.caption}
                  onChange={(e) => setMediaForm(prev => ({ ...prev, caption: e.target.value }))}
                  placeholder="Ex: 📍 Nossa localização! Estamos na Av. Principal, 123"
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Esta legenda será enviada junto com a imagem/vídeo no WhatsApp.
                </p>
              </div>
            )}

            {/* Mídia ativa */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Mídia ativa</Label>
                <p className="text-xs text-muted-foreground">
                  Mídias inativas não aparecem no prompt do agente.
                </p>
              </div>
              <Switch
                checked={mediaForm.isActive}
                onCheckedChange={(v) => setMediaForm(prev => ({ ...prev, isActive: v }))}
              />
            </div>

            {/* Enviar sozinha */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Enviar sozinha</Label>
                <p className="text-xs text-muted-foreground">
                  Se ativado, esta mídia NÃO será enviada junto com outras.
                </p>
              </div>
              <Switch
                checked={mediaForm.sendAlone}
                onCheckedChange={(v) => setMediaForm(prev => ({ ...prev, sendAlone: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeMediaDialog}>
              Cancelar
            </Button>
            <Button 
              onClick={handleMediaSubmit}
              disabled={uploadMediaMutation.isPending || updateMediaMutation.isPending}
            >
              {(uploadMediaMutation.isPending || updateMediaMutation.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {editingMedia ? 'Atualizar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
