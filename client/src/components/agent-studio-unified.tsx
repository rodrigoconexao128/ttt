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
  Clock, Brain, Pause, X, Save, Pencil, File, Rocket, Wrench
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { CalibrationChat } from "@/components/calibration-chat";

// 🔒 Modal de upgrade estilo Lovable
interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  used: number;
  limit: number;
  type: "calibration" | "simulator";
}

function UpgradeModal({ isOpen, onClose, title, description, used, limit, type }: UpgradeModalProps) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-8 animate-in fade-in-50 zoom-in-95">
        {/* Badge decorativo */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 px-4 py-1 text-sm font-medium">
            Limite atingido
          </Badge>
        </div>
        
        {/* Ícone */}
        <div className="flex justify-center mb-6 pt-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center">
            <Rocket className="w-8 h-8 text-emerald-400" />
          </div>
        </div>
        
        {/* Título */}
        <h3 className="text-xl font-semibold text-white text-center mb-2">{title}</h3>
        
        {/* Barra de progresso */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-slate-400 mb-2">
            <span>{type === "calibration" ? "Calibrações hoje" : "Mensagens hoje"}</span>
            <span className="text-emerald-400 font-medium">{used}/{limit}</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full" style={{width: "100%"}} />
          </div>
        </div>
        
        {/* Descrição */}
        <p className="text-slate-300 text-center text-sm mb-6">{description}</p>
        
        {/* Benefícios */}
        <div className="bg-slate-800/50 rounded-xl p-4 mb-6 border border-slate-700">
          <p className="text-emerald-400 text-sm font-medium mb-3">✨ Com o plano PRO você terá:</p>
          <ul className="space-y-2 text-sm text-slate-300">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Calibrações ilimitadas por dia</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Simulador sem limite de mensagens</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Mensagens reais ilimitadas no WhatsApp</span>
            </li>
          </ul>
        </div>
        
        {/* Botões */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            Agora não
          </Button>
          <Button
            onClick={() => window.location.href = "/plans"}
            className="flex-1 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:from-emerald-600 hover:to-cyan-600"
          >
            <Zap className="w-4 h-4 mr-2" />
            Ver planos
          </Button>
        </div>
      </div>
    </div>
  );
}

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
  autoReactivateMinutes: number | null;
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
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
}

interface PromptHistoryEntry {
  id: string;
  prompt: string;
  instruction: string;
  timestamp: Date;
  summary: string;
}

type Section = 'chat' | 'code' | 'media' | 'config' | 'tools';

// ============ HELPER: FORMATAÇÃO WHATSAPP ============
function formatWhatsAppText(text: string): string {
  if (!text) return text;
  
  // DEBUG: Ver o que está chegando na função
  console.log('[formatWhatsAppText] Input:', JSON.stringify(text));
  console.log('[formatWhatsAppText] Contains \\n:', text.includes('\n'));
  
  let formatted = text;
  
  // Preservar quebras de linha convertendo \n para <br>
  formatted = formatted.replace(/\n/g, '<br>');
  
  console.log('[formatWhatsAppText] Output:', formatted.substring(0, 200));
  
  // *texto* = negrito
  formatted = formatted.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
  
  // _texto_ = itálico
  formatted = formatted.replace(/\b_([^_]+)_\b/g, '<em>$1</em>');
  
  // ~texto~ = tachado
  formatted = formatted.replace(/~([^~]+)~/g, '<del>$1</del>');
  
  // `texto` = monoespaçado
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="bg-gray-200 dark:bg-zinc-700 px-1 rounded text-sm">$1</code>');
  
  return formatted;
}

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
  const [simulatorSentMedias, setSimulatorSentMedias] = useState<string[]>([]); // 🆕 Mídias já enviadas
  const simulatorEpochRef = useRef(0);
  
  // Estado de configurações
  const [isActive, setIsActive] = useState(true);
  const [responseDelaySeconds, setResponseDelaySeconds] = useState(30);
  const [messageSplitChars, setMessageSplitChars] = useState(400);
  const [triggerPhrases, setTriggerPhrases] = useState<string[]>([]);
  const [newTriggerPhrase, setNewTriggerPhrase] = useState("");
  const [fetchHistoryOnFirstResponse, setFetchHistoryOnFirstResponse] = useState(true);
  const [pauseOnManualReply, setPauseOnManualReply] = useState(true);
  const [autoReactivateMinutes, setAutoReactivateMinutes] = useState<number | null>(null);
  const [customMinutesInput, setCustomMinutesInput] = useState<string>("");
  
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
  
  // 🔒 Estado do modal de upgrade (estilo Lovable)
  const [upgradeModal, setUpgradeModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    used: number;
    limit: number;
    type: "calibration" | "simulator";
  }>({ isOpen: false, title: "", description: "", used: 0, limit: 0, type: "calibration" });

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

  // 🔒 Query para buscar limites diários (estilo Lovable)
  const { data: dailyLimits, refetch: refetchDailyLimits } = useQuery<{
    hasActiveSubscription: boolean;
    calibration: {
      used: number;
      limit: number;
      remaining: number;
      isLimitReached: boolean;
    };
    simulator: {
      used: number;
      limit: number;
      remaining: number;
      isLimitReached: boolean;
    };
  }>({
    queryKey: ["/api/daily-limits"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/daily-limits");
      return res.json();
    },
    refetchInterval: 30000, // Atualiza a cada 30 segundos
  });

  // Estado para controlar se o histórico já foi carregado
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [versionsLoaded, setVersionsLoaded] = useState(false);
  
  // Estado de restauração (loading)
  const [isRestoring, setIsRestoring] = useState(false);
  
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
      const configMinutes = (config as any).autoReactivateMinutes ?? null;
      setAutoReactivateMinutes(configMinutes);
      // Inicializa campo custom se for valor personalizado
      if (configMinutes !== null && ![10, 30, 60, 120].includes(configMinutes)) {
        setCustomMinutesInput(String(configMinutes));
      }
      
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
    
    // Prevenir cliques múltiplos
    if (isRestoring) {
      console.log("[RESTORE] ⏳ Já está restaurando, ignorando clique duplicado");
      return;
    }
    
    try {
      setIsRestoring(true);
      setShowHistory(false);
      
      toast({
        title: "⏳ Restaurando versão...",
        description: "Aguarde, processando restauração"
      });
      
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
          content: `🔄 Restaurado da v${data.restoredFrom} → Nova v${data.versionNumber} criada (ID: ${data.versionId})`,
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
    } finally {
      setIsRestoring(false);
    }
  }, [promptHistory, queryClient, toast, isRestoring]);

  // Estado para logs de calibração em tempo real
  const [calibrationLogs, setCalibrationLogs] = useState<string[]>([]);
  const [showCalibrationLogs, setShowCalibrationLogs] = useState(false);
  const calibrationLogsRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll para mostrar os logs mais recentes
  useEffect(() => {
    if (calibrationLogsRef.current) {
      calibrationLogsRef.current.scrollTop = calibrationLogsRef.current.scrollHeight;
    }
  }, [calibrationLogs]);

  // ============ EDIÇÃO VIA CHAT COM STREAMING ============
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
    setCalibrationLogs([]);
    setShowCalibrationLogs(true);

    // Criar mensagem placeholder que vai receber os logs
    const processingMessageId = `processing-${Date.now()}`;
    const processingMessage: ChatMessage = {
      id: processingMessageId,
      role: "assistant",
      content: "🔄 Processando sua solicitação...",
      timestamp: new Date()
    };
    setChatMessages(prev => [...prev, processingMessage]);

    try {
      const token = await getAuthToken();
      const response = await fetch("/api/agent/edit-prompt-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPrompt,
          instruction: currentInstruction,
          skipCalibration: true
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let currentLogs: string[] = [];

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n').filter(line => line.startsWith('data: '));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'log' || data.type === 'calibration_log') {
              // Adicionar mensagem ao log (evitar duplicatas)
              const newMessage = data.message;
              if (!currentLogs.includes(newMessage)) {
                currentLogs = [...currentLogs, newMessage];
                setCalibrationLogs([...currentLogs]);
              }
              
              // Atualizar mensagem com logs simples (sem calibração)
              const logText = currentLogs.slice(-3).map(log => `• ${log}`).join('\n');
              
              setChatMessages(prev => prev.map(msg => 
                msg.id === processingMessageId 
                  ? { ...msg, content: `🔄 **Editando seu agente...**\n${logText}` }
                  : msg
              ));
            }
            
            if (data.type === 'limit_reached') {
              setUpgradeModal({
                isOpen: true,
                title: "Você atingiu o limite de calibrações",
                description: data.message || "Assine um plano para continuar calibrando.",
                used: data.used || 5,
                limit: data.limit || 5,
                type: "calibration"
              });
              
              setChatMessages(prev => prev.map(msg => 
                msg.id === processingMessageId 
                  ? { ...msg, content: `🚀 Você usou todas as ${data.limit} calibrações gratuitas de hoje! Assine um plano PRO para continuar.` }
                  : msg
              ));
              return;
            }
            
            if (data.type === 'complete') {
              setShowCalibrationLogs(false);
              
              if (data.success && data.newPrompt) {
                addToHistory(data.newPrompt, currentInstruction, "Edição aplicada");
                setCurrentPrompt(data.newPrompt);
                setHasChanges(false);
                
                setChatMessages(prev => prev.map(msg => 
                  msg.id === processingMessageId 
                    ? { ...msg, content: data.feedbackMessage || "✅ Mudanças aplicadas!" }
                    : msg
                ));
                
                updateConfigMutation.mutate({ prompt: data.newPrompt });
                refetchDailyLimits();
              } else {
                setChatMessages(prev => prev.map(msg => 
                  msg.id === processingMessageId 
                    ? { ...msg, content: data.feedbackMessage || "⚠️ Não foi possível aplicar essa mudança." }
                    : msg
                ));
              }
            }
            
            if (data.type === 'error') {
              setShowCalibrationLogs(false);
              setChatMessages(prev => prev.map(msg => 
                msg.id === processingMessageId 
                  ? { ...msg, content: `❌ Erro: ${data.message}` }
                  : msg
              ));
            }
          } catch (e) {
            console.warn('Erro ao parsear SSE:', e);
          }
        }
      }

    } catch (error: any) {
      console.error('Erro no streaming:', error);
      setShowCalibrationLogs(false);
      
      // Mensagem mais amigável para o usuário com instrução para tentar novamente
      setChatMessages(prev => prev.map(msg => 
        msg.id === `processing-${Date.now()}` || msg.content.includes('🔄')
          ? { ...msg, content: `⚠️ O sistema está processando. Por favor, envie sua solicitação novamente em alguns segundos. Sua edição será aplicada na próxima tentativa.` }
          : msg
      ));
    } finally {
      setIsProcessing(false);
    }
  };

  // ============ SIMULADOR ============
  const handleSimulate = async () => {
    if (!simulatorInput.trim() || isSimulating) return;

    const epochAtSend = simulatorEpochRef.current;

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
      // 🆕 CONVERTER HISTÓRICO DO SIMULADOR PARA FORMATO DO BACKEND
      // 🛡️ FIX: Filtrar mensagens vazias (mídias sem texto) para evitar "[Mensagem vazia]" na resposta
      const historyForBackend = simulatorMessages
        .filter(msg => msg.message && msg.message.trim()) // Ignorar mídias sem texto
        .map(msg => ({
          role: msg.role === "agent" ? "assistant" : "user" as "user" | "assistant",
          content: msg.message
        }));
      
      const response = await apiRequest("POST", "/api/agent/test", {
        message: simulatorInput,
        customPrompt: currentPrompt,
        // 🆕 ENVIAR HISTÓRICO E MÍDIAS PARA SIMULADOR UNIFICADO
        history: historyForBackend,
        sentMedias: simulatorSentMedias,
        // Limpar carrinho se for primeira mensagem (sem histórico)
        clearCart: historyForBackend.length === 0
      });
      
      const data = await response.json();
      const agentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      // Se o usuário clicou em "Limpar" durante a requisição, ignorar qualquer resposta atrasada
      if (simulatorEpochRef.current !== epochAtSend) {
        return;
      }
      
      // 🔒 Verificar se atingiu limite do simulador
      if (data.limitReached) {
        setUpgradeModal({
          isOpen: true,
          title: "Limite de testes atingido",
          description: data.message || "Assine um plano para testar seu agente sem limites.",
          used: data.used || 25,
          limit: data.limit || 25,
          type: "simulator"
        });
        
        // Adiciona mensagem de limite no simulador
        const limitMsg: SimulatorMessage = {
          id: `sim-limit-${Date.now()}`,
          role: "agent",
          message: `🚀 Você usou todas as ${data.limit} mensagens de teste gratuitas de hoje! Assine um plano PRO para testar sem limites.`,
          time: agentTime
        };
        setSimulatorMessages(prev => [...prev, limitMsg]);
        return;
      }
      
      // 🆕 CRIAR LISTA DE NOVAS MENSAGENS (mídias + texto)
      const newMessages: SimulatorMessage[] = [];
      
      // 🆕 ADICIONAR MÍDIAS COMO MENSAGENS SEPARADAS PRIMEIRO
      if (data?.mediaActions && data.mediaActions.length > 0) {
        console.log(`📁 [Simulador] Recebeu ${data.mediaActions.length} mídia(s)`, data.mediaActions);
        
        for (const action of data.mediaActions) {
          if (action.type === 'send_media' && action.media_url) {
            newMessages.push({
              id: `sim-media-${Date.now()}-${Math.random()}`,
              role: "agent",
              message: '', // Sem texto - apenas mídia
              time: agentTime,
              mediaUrl: action.media_url,
              mediaType: action.media_type || 'audio'
            });
          }
          if (action.type === 'send_media_url' && action.media_url) {
            newMessages.push({
              id: `sim-media-${Date.now()}-${Math.random()}`,
              role: "agent",
              message: '',
              time: agentTime,
              mediaUrl: action.media_url,
              mediaType: action.media_type || 'image'
            });
          }
        }
        
        // Rastrear mídias enviadas
        const newMediaNames = data.mediaActions
          .filter((a: any) => a.type === 'send_media' && a.media_name)
          .map((a: any) => a.media_name.toUpperCase());
        setSimulatorSentMedias(prev => [...new Set([...prev, ...newMediaNames])]);
      }
      
      // 🔄 USAR splitResponses PARA CONSISTÊNCIA COM WHATSAPP
      // Se o backend retornou mensagens divididas, adiciona cada uma como uma bolha separada
      const splitResponses = data?.splitResponses || [];
      
      if (splitResponses.length > 0) {
        // Usa as mensagens divididas pelo backend (mesma lógica do WhatsApp)
        for (const splitMsg of splitResponses) {
          if (splitMsg && splitMsg.trim()) {
            newMessages.push({
              id: `sim-agent-${Date.now()}-${Math.random()}`,
              role: "agent",
              message: splitMsg,
              time: agentTime
            });
          }
        }
        console.log(`📱 [Simulador] Exibindo ${splitResponses.length} bolhas de mensagem`);
      } else if (typeof data?.response === 'string' && data.response.trim()) {
        // Fallback: usa resposta completa se splitResponses não existir
        newMessages.push({
          id: `sim-agent-${Date.now()}`,
          role: "agent",
          message: data.response,
          time: agentTime
        });
      }
      
      setSimulatorMessages(prev => [...prev, ...newMessages]);
      
      // 🔄 Refetch limites diários após usar simulador
      refetchDailyLimits();
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
  
  // 🆕 LIMPAR SIMULADOR (resetar histórico e mídias)
  const handleClearSimulator = () => {
    // Invalida respostas de requests em voo (evita repopular após limpar)
    simulatorEpochRef.current++;
    setSimulatorMessages([]);
    setSimulatorSentMedias([]);
    setSimulatorInput("");
    setIsSimulating(false);
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
      pauseOnManualReply,
      autoReactivateMinutes
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
      // Se há um novo arquivo selecionado, fazer upload primeiro
      if (selectedFile) {
        try {
          // Upload do novo arquivo
          const formData = new FormData();
          formData.append("file", selectedFile);
          
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
          
          // Atualizar mídia com novo arquivo
          updateMediaMutation.mutate({
            id: editingMedia.id,
            data: {
              name: mediaForm.name,
              mediaType: mediaForm.mediaType,
              description: mediaForm.description,
              whenToUse: mediaForm.whenToUse,
              caption: mediaForm.caption,
              transcription: uploadData.transcription || mediaForm.transcription,
              isPtt: mediaForm.isPtt,
              sendAlone: mediaForm.sendAlone,
              isActive: mediaForm.isActive,
              storageUrl: uploadData.storageUrl,
              fileName: uploadData.fileName,
              fileSize: uploadData.fileSize,
              mimeType: uploadData.mimeType
            }
          });
        } catch (error: any) {
          toast({ title: "Erro", description: error.message || "Falha ao fazer upload.", variant: "destructive" });
          return;
        }
      } else {
        // Apenas atualizar metadados sem novo arquivo
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
      }
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
                <Button
                  variant={activeSection === "tools" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveSection("tools")}
                  className="h-7 px-2 text-xs"
                >
                  <Wrench className="w-3 h-3 mr-1" />
                  Corrigir
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
            <Button
              variant={activeSection === "tools" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveSection("tools")}
              className="h-7 px-2 text-xs flex-shrink-0"
            >
              <Wrench className="w-3 h-3 mr-1" />
              Corrigir
            </Button>
          </div>

          {/* History Panel */}
          {showHistory && promptHistory.length > 0 && (
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
                      disabled={isRestoring}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors overflow-hidden relative",
                        isActive 
                          ? "bg-primary/10 border border-primary/30" 
                          : "hover:bg-muted border border-transparent",
                        isRestoring && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {isRestoring && (
                        <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        </div>
                      )}
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
                    <div className="bg-muted px-4 py-3 rounded-2xl rounded-bl-md max-w-[90%] w-full">
                      <div className="flex flex-col gap-1">
                        {/* Header com spinner */}
                        <div className="flex items-center gap-2 mb-2">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          <span className="text-sm font-medium text-primary">
                            {calibrationLogs.some(l => l.includes('Calibr') || l.includes('Testando')) 
                              ? '🤖 IA trabalhando...' 
                              : '⏳ Processando...'}
                          </span>
                        </div>
                        
                        {/* Logs em tempo real - CADA LOG APARECE INDIVIDUALMENTE */}
                        <div 
                          ref={calibrationLogsRef}
                          className="space-y-0.5 text-xs font-mono bg-slate-900/90 rounded-lg p-3 max-h-[400px] overflow-y-auto scroll-smooth"
                        >
                          {calibrationLogs.length === 0 ? (
                            <div className="text-slate-400 animate-pulse">Iniciando...</div>
                          ) : (
                            calibrationLogs.map((log, idx) => (
                              <div 
                                key={idx} 
                                className={cn(
                                  "py-0.5 leading-relaxed animate-in fade-in slide-in-from-left-2 duration-300",
                                  // Separadores
                                  log.includes('━') && "text-slate-600 text-[10px]",
                                  // Sucesso
                                  log.includes('✅') && "text-emerald-400",
                                  // Erro
                                  log.includes('❌') && "text-red-400",
                                  // Processando
                                  log.includes('🔄') && "text-blue-400",
                                  // Reparo
                                  log.includes('🔧') && "text-amber-400 font-semibold",
                                  // Score
                                  log.includes('📊') && "text-purple-400 font-semibold",
                                  // Sucesso final
                                  log.includes('🎉') && "text-emerald-400 font-bold text-sm",
                                  // Atenção
                                  log.includes('⚠️') && "text-amber-400",
                                  // Iniciando
                                  log.includes('🚀') && "text-cyan-400",
                                  // Análise
                                  log.includes('📝') && "text-slate-300",
                                  // Agente
                                  log.includes('🤖') && "text-blue-400 font-medium",
                                  // Cliente/Conversa
                                  log.includes('💬') && "text-indigo-400",
                                  log.includes('👤') && "text-green-400 font-medium",
                                  // Teste
                                  log.includes('🧪') && "text-pink-400 font-medium",
                                  log.includes('TESTE') && "text-pink-400 font-bold",
                                  // Alvo
                                  log.includes('🎯') && "text-orange-400",
                                  // Documentação
                                  log.includes('📋') && "text-teal-400",
                                  // Ideia
                                  log.includes('💡') && "text-yellow-300",
                                  // Linhas com texto recuado (respostas)
                                  log.startsWith('   ') && "text-slate-400 pl-4 border-l-2 border-slate-700",
                                  // Default
                                  !log.match(/[✅❌🔄🔧📊🎉⚠️🚀📝🤖💬🧪🎯📋💡👤━]/) && !log.startsWith('   ') && "text-slate-400"
                                )}
                                style={{ animationDelay: `${Math.min(idx * 30, 500)}ms` }}
                              >
                                {log}
                              </div>
                            ))
                          )}
                          {/* Cursor piscando no final */}
                          <div className="inline-block w-2 h-4 bg-primary/70 animate-pulse ml-1" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>
              
              {/* Chat Input */}
              <div className="border-t bg-background pb-2">
                {/* 🔒 Banner de créditos estilo Lovable */}
                {dailyLimits && !dailyLimits.hasActiveSubscription && (
                  <div className={cn(
                    "flex items-center justify-between px-3 py-2 text-xs border-b transition-all",
                    dailyLimits.calibration.isLimitReached
                      ? "bg-amber-500/10 border-amber-500/20"
                      : "bg-muted/30 border-border/50"
                  )}>
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        dailyLimits.calibration.isLimitReached
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      )} />
                      <span className={cn(
                        "font-medium",
                        dailyLimits.calibration.isLimitReached
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground"
                      )}>
                        {dailyLimits.calibration.remaining} créditos restantes hoje
                      </span>
                    </div>
                    <button
                      onClick={() => window.location.href = "/plans"}
                      className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-semibold transition-all",
                        dailyLimits.calibration.isLimitReached
                          ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-md"
                          : "bg-primary/10 text-primary hover:bg-primary/20"
                      )}
                    >
                      {dailyLimits.calibration.isLimitReached ? "Ver Planos" : "Upgrade"}
                    </button>
                  </div>
                )}
                
                <div className="p-3 md:p-4">
                  <div className="flex gap-2 items-end">
                    <Textarea
                      placeholder="Descreva como deseja alterar seu agente..."
                      value={editInput}
                      onChange={(e) => setEditInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleEditPrompt();
                        }
                      }}
                      className="flex-1 min-h-[80px] max-h-[200px] resize-none rounded-xl bg-muted/30 hover:bg-muted/50 focus:bg-background border-input shadow-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 text-base"
                      rows={3}
                    />
                    <Button
                      onClick={handleEditPrompt}
                      disabled={isProcessing || !editInput.trim()}
                      size="icon"
                      className="h-10 w-10 md:h-12 md:w-12 rounded-xl flex-shrink-0 mb-1"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </Button>
                  </div>
                  
                  {editInput === "" && chatMessages.length > 0 && (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {quickActions.map((action, i) => (
                        <button
                          key={i}
                          onClick={() => setEditInput(action.instruction)}
                          className="text-xs px-3 py-1.5 rounded-full border border-border/50 bg-background hover:bg-muted/80 transition-all shadow-sm hover:shadow"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
                  
                  {/* Timer de Auto-Reativação - só aparece quando pauseOnManualReply está ativo */}
                  {pauseOnManualReply && (
                    <CardContent className="pt-0 pb-4">
                      <div className="space-y-3 border-t pt-4">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <Label className="text-sm font-medium">Reativar IA Automaticamente</Label>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Se você não continuar conversando, a IA volta após o tempo selecionado
                        </p>
                        
                        <div className="grid grid-cols-3 gap-2">
                          <Button
                            variant={autoReactivateMinutes === null ? "default" : "outline"}
                            size="sm"
                            className="text-xs"
                            onClick={() => { setAutoReactivateMinutes(null); setCustomMinutesInput(""); }}
                          >
                            Nunca
                          </Button>
                          <Button
                            variant={autoReactivateMinutes === 10 ? "default" : "outline"}
                            size="sm"
                            className="text-xs"
                            onClick={() => { setAutoReactivateMinutes(10); setCustomMinutesInput(""); }}
                          >
                            10 min
                          </Button>
                          <Button
                            variant={autoReactivateMinutes === 30 ? "default" : "outline"}
                            size="sm"
                            className="text-xs"
                            onClick={() => { setAutoReactivateMinutes(30); setCustomMinutesInput(""); }}
                          >
                            30 min
                          </Button>
                          <Button
                            variant={autoReactivateMinutes === 60 ? "default" : "outline"}
                            size="sm"
                            className="text-xs"
                            onClick={() => { setAutoReactivateMinutes(60); setCustomMinutesInput(""); }}
                          >
                            1 hora
                          </Button>
                          <Button
                            variant={autoReactivateMinutes === 120 ? "default" : "outline"}
                            size="sm"
                            className="text-xs"
                            onClick={() => { setAutoReactivateMinutes(120); setCustomMinutesInput(""); }}
                          >
                            2 horas
                          </Button>
                          
                          {/* Campo Custom - Input direto de minutos */}
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="1"
                              max="10080"
                              placeholder="min"
                              className={`w-16 h-8 text-xs text-center rounded-md border ${
                                autoReactivateMinutes !== null && ![null, 10, 30, 60, 120].includes(autoReactivateMinutes)
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-input bg-background"
                              }`}
                              value={
                                autoReactivateMinutes !== null && ![10, 30, 60, 120].includes(autoReactivateMinutes)
                                  ? autoReactivateMinutes
                                  : customMinutesInput
                              }
                              onChange={(e) => {
                                const value = e.target.value;
                                setCustomMinutesInput(value);
                                if (value && !isNaN(Number(value)) && Number(value) > 0) {
                                  setAutoReactivateMinutes(Number(value));
                                }
                              }}
                            />
                            <span className="text-xs text-muted-foreground">min</span>
                          </div>
                        </div>
                        
                        <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-md">
                          <p className="text-xs text-blue-700 dark:text-blue-300">
                            {autoReactivateMinutes === null 
                              ? "💡 A IA só volta quando você reativar manualmente na conversa."
                              : `⏰ Se o cliente enviar mensagem e você não responder em ${autoReactivateMinutes} min, a IA lê o contexto e responde.`
                            }
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  )}
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

          {/* ============ SECTION: TOOLS (CALIBRAÇÃO VIA CHAT) ============ */}
          {activeSection === "tools" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <CalibrationChat 
                currentPrompt={currentPrompt}
                onPromptUpdated={(newPrompt) => {
                  setCurrentPrompt(newPrompt);
                  setHasChanges(false);
                }}
                className="h-full border-0 rounded-none"
              />
            </div>
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
              onClick={handleClearSimulator}
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
                  {/* 🆕 RENDERIZAR MÍDIA SE HOUVER */}
                  {msg.mediaUrl && (
                    <div className="mb-2">
                      {msg.mediaType === 'image' && (
                        <img src={msg.mediaUrl} alt="Mídia" className="rounded max-w-full max-h-60 object-cover" />
                      )}
                      {msg.mediaType === 'video' && (
                        <video src={msg.mediaUrl} controls className="rounded max-w-full max-h-60" />
                      )}
                      {msg.mediaType === 'audio' && (
                        <div className="flex items-center gap-2 bg-[#F0F2F5] dark:bg-zinc-800 rounded-lg p-2 min-w-[200px]">
                          <audio 
                            src={msg.mediaUrl} 
                            controls 
                            controlsList="nodownload"
                            className="w-full"
                            style={{
                              height: '32px',
                              accentColor: '#00A884'
                            }}
                          />
                        </div>
                      )}
                      {msg.mediaType === 'document' && (
                        <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline flex items-center gap-1">
                          📄 Abrir documento
                        </a>
                      )}
                    </div>
                  )}
                  
                  {/* TEXTO DA MENSAGEM (se houver) */}
                  {msg.message && (
                    <p 
                      className="text-sm whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: formatWhatsAppText(msg.message) }}
                    />
                  )}
                  
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
                </div>
              </div>
            )}

            {/* Input de arquivo oculto - sempre presente para permitir trocar arquivo na edição */}
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
              onChange={(e) => {
                setSelectedFile(e.target.files?.[0] || null);
                // Limpa o valor do input para permitir selecionar o mesmo arquivo novamente
                e.target.value = "";
              }}
            />

            {/* Preview de Áudio */}
            {mediaForm.mediaType === "audio" && editingMedia?.storageUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="p-3 border rounded-lg bg-muted/30">
                  <audio controls className="w-full mb-2" src={editingMedia.storageUrl}>
                    Seu navegador não suporta áudio.
                  </audio>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Trocar Áudio
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('[DEBUG] Remover Áudio clicked in agent-studio-unified!');
                        // Limpa a mídia do editingMedia diretamente
                        if (editingMedia) {
                          setEditingMedia({ ...editingMedia, storageUrl: "", fileName: "" });
                        }
                        setMediaForm(prev => ({ ...prev, storageUrl: "", fileName: "", transcription: "" }));
                        setSelectedFile(null);
                        toast({
                          title: "Removido!",
                          description: "Mídia removida.",
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Preview de Imagem */}
            {mediaForm.mediaType === "image" && editingMedia?.storageUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="border rounded-lg overflow-hidden">
                  <img 
                    src={editingMedia.storageUrl} 
                    alt="Preview"
                    className="w-full max-h-48 object-contain"
                  />
                  <div className="flex gap-2 p-2 bg-muted/30 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Trocar Imagem
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('[DEBUG] Remover Imagem clicked in agent-studio-unified!');
                        if (editingMedia) {
                          setEditingMedia({ ...editingMedia, storageUrl: "", fileName: "" });
                        }
                        setMediaForm(prev => ({ ...prev, storageUrl: "", fileName: "" }));
                        setSelectedFile(null);
                        toast({
                          title: "Removido!",
                          description: "Mídia removida.",
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Preview de Vídeo */}
            {mediaForm.mediaType === "video" && editingMedia?.storageUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="border rounded-lg overflow-hidden">
                  <video 
                    controls 
                    className="w-full max-h-48 object-contain"
                    src={editingMedia.storageUrl}
                  />
                  <div className="flex gap-2 p-2 bg-muted/30 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Trocar Vídeo
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('[DEBUG] Remover Vídeo clicked in agent-studio-unified!');
                        if (editingMedia) {
                          setEditingMedia({ ...editingMedia, storageUrl: "", fileName: "" });
                        }
                        setMediaForm(prev => ({ ...prev, storageUrl: "", fileName: "" }));
                        setSelectedFile(null);
                        toast({
                          title: "Removido!",
                          description: "Mídia removida.",
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Preview de Documento */}
            {mediaForm.mediaType === "document" && editingMedia?.storageUrl && (
              <div className="space-y-2">
                <Label>Arquivo</Label>
                <div className="p-3 border rounded-lg bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm truncate max-w-[200px]">{editingMedia.fileName || "Documento"}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Trocar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('[DEBUG] Remover Documento clicked in agent-studio-unified!');
                        if (editingMedia) {
                          setEditingMedia({ ...editingMedia, storageUrl: "", fileName: "" });
                        }
                        setMediaForm(prev => ({ ...prev, storageUrl: "", fileName: "" }));
                        setSelectedFile(null);
                        toast({
                          title: "Removido!",
                          description: "Mídia removida.",
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
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
      
      {/* 🔒 Modal de Upgrade (estilo Lovable) */}
      <UpgradeModal
        isOpen={upgradeModal.isOpen}
        onClose={() => setUpgradeModal(prev => ({ ...prev, isOpen: false }))}
        title={upgradeModal.title}
        description={upgradeModal.description}
        used={upgradeModal.used}
        limit={upgradeModal.limit}
        type={upgradeModal.type}
      />
    </div>
  );
}
