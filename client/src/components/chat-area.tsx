import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Send, MessageCircle, Bot, BotOff, Smartphone, X, Trash2, Sparkles, Clock, CalendarPlus, Loader2, ArrowLeft, Mic, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Message, Conversation, AiAgentConfig } from "@shared/schema";
import { MessageImage } from "@/components/message-image";
import { MessageAudio } from "@/components/message-audio";
import { MessageVideo } from "@/components/message-video";
import { MessageDocument } from "@/components/message-document";
import { UserAudioRecorder } from "@/components/user-audio-recorder";
import { UserMediaUploader } from "@/components/user-media-uploader";
import { UserQuickReplies } from "@/components/user-quick-replies";
import { UserAIMessageGenerator } from "@/components/user-ai-message-generator";
import { cn } from "@/lib/utils";
import { getAuthToken } from "@/lib/supabase";

interface ChatAreaProps {
  conversationId: string | null;
  connectionId?: string;
  onBack?: () => void;
  onOpenContactPanel?: () => void;
}

export function ChatArea({ conversationId, connectionId, onBack, onOpenContactPanel }: ChatAreaProps) {
  const { toast } = useToast();
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [avatarModalImage, setAvatarModalImage] = useState("");
  const [avatarModalName, setAvatarModalName] = useState("");
  
  // Estados para agendamento manual de follow-up
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");

  // Estados para novas funcionalidades
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  
  // Estado para auto-transcrição
  const [isAutoTranscribing, setIsAutoTranscribing] = useState(false);
  
  // Detectar se é mobile
  const isMobile = typeof window !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768
  );

  const { data: conversation } = useQuery<Conversation>({
    queryKey: ["/api/conversation", conversationId],
    enabled: !!conversationId,
  });

  // 🔧 FIX: Quando conversa é carregada (marcada como lida no backend), atualizar lista de conversas
  useEffect(() => {
    if (conversation && conversationId) {
      // Invalidar lista de conversas para atualizar o badge de não lidas
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    }
  }, [conversationId, conversation]);

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages", conversationId],
    enabled: !!conversationId,
    refetchInterval: 2000, // Poll every 2 seconds
  });

  const { data: agentConfig } = useQuery<AiAgentConfig | null>({
    queryKey: ["/api/agent/config"],
  });

  const { data: agentStatus } = useQuery<{ isDisabled: boolean }>({
    queryKey: ["/api/agent/status", conversationId],
    enabled: !!conversationId,
  });

  // Follow-up status
  const { data: followupStatus } = useQuery<{ 
    active: boolean; 
    stage: number; 
    nextFollowupAt: string | null;
    disabledReason: string | null;
  }>({
    queryKey: ["/api/followup/conversation", conversationId, "status"],
    enabled: !!conversationId,
  });

  const toggleAgentMutation = useMutation({
    mutationFn: async (disable: boolean) => {
      return await apiRequest("POST", `/api/agent/toggle/${conversationId}`, {
        disable,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/status", conversationId] });
      toast({
        title: agentStatus?.isDisabled ? "Agente Ativado" : "Agente Desativado",
        description: agentStatus?.isDisabled 
          ? "O agente voltará a responder quando o cliente enviar nova mensagem" 
          : "O agente não responderá mais nesta conversa",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao alterar agente",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 🤖 Responder com IA - dispara resposta manualmente
  const respondWithAIMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/agent/respond/${conversationId}`);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages", conversationId] });
      // Sempre mostra sucesso - a IA irá processar em background
      toast({
        title: "✅ Solicitação Enviada",
        description: "A IA irá processar e responder em breve",
        variant: "default",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao responder com IA",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMessagesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/messages/${conversationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/status", conversationId] });
      toast({
        title: "Conversa limpa",
        description: "Todas as mensagens foram apagadas e a IA foi reativada.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao limpar conversa",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Follow-up toggle mutation
  const toggleFollowupMutation = useMutation({
    mutationFn: async (active: boolean) => {
      return await apiRequest("POST", `/api/followup/conversation/${conversationId}/toggle`, {
        active,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/followup/conversation", conversationId, "status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/pending"] });
      toast({
        title: followupStatus?.active ? "Follow-up Desativado" : "Follow-up Ativado",
        description: followupStatus?.active 
          ? "Mensagens automáticas de follow-up foram pausadas para esta conversa" 
          : "Mensagens automáticas serão enviadas quando o cliente parar de responder",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao alterar follow-up",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Agendar follow-up manual
  const scheduleFollowupMutation = useMutation({
    mutationFn: async (data: { scheduledFor: string; note?: string }) => {
      return await apiRequest("POST", `/api/followup/conversation/${conversationId}/schedule`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/followup/conversation", conversationId, "status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/followup/pending"] });
      setScheduleDialogOpen(false);
      setScheduleDate("");
      setScheduleTime("");
      setScheduleNote("");
      toast({
        title: "Follow-up Agendado!",
        description: "Você receberá um lembrete na data/hora escolhida.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao agendar follow-up",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para auto-transcrição
  const autoTranscribeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/conversations/${conversationId}/auto-transcribe`);
      return response.json();
    },
    onSuccess: (data: { transcribed: number; total: number; remaining: number }) => {
      if (data.transcribed > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/messages", conversationId] });
        toast({
          title: "Áudios transcritos!",
          description: `${data.transcribed} de ${data.total} áudios foram transcritos.`,
        });
      }
      setIsAutoTranscribing(false);
    },
    onError: (error: Error) => {
      setIsAutoTranscribing(false);
      console.error("Auto-transcribe error:", error);
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      return await apiRequest("POST", "/api/messages/send", {
        conversationId,
        text,
      });
    },
    // Optimistic update - mostrar mensagem imediatamente
    onMutate: async (text: string) => {
      // Cancelar queries em andamento
      await queryClient.cancelQueries({ queryKey: ["/api/messages", conversationId] });
      
      // Snapshot do estado anterior
      const previousMessages = queryClient.getQueryData<Message[]>(["/api/messages", conversationId]);
      
      // Criar mensagem otimista
      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        conversationId: conversationId!,
        messageId: `temp-${Date.now()}`,
        fromMe: true,
        text: text,
        timestamp: new Date(),
        status: "sending",
        isFromAgent: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        mediaType: null,
        mediaUrl: null,
        mediaMimeType: null,
        mediaCaption: null,
      };
      
      // Atualizar cache imediatamente
      queryClient.setQueryData<Message[]>(["/api/messages", conversationId], (old = []) => [...old, optimisticMessage]);
      
      // Limpar input imediatamente
      setMessageText("");
      
      return { previousMessages };
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      
      // 🛑 AUTO-PAUSE: Se o agente foi pausado automaticamente, atualizar status e avisar
      if (data?.agentPaused) {
        queryClient.invalidateQueries({ queryKey: ["/api/agent/status", conversationId] });
        toast({
          title: "IA Pausada Automaticamente",
          description: "A IA foi pausada para esta conversa pois você respondeu manualmente. Ative novamente quando desejar.",
          variant: "default",
        });
      }
    },
    onError: (error: Error, _text, context) => {
      // Reverter para estado anterior em caso de erro
      if (context?.previousMessages) {
        queryClient.setQueryData(["/api/messages", conversationId], context.previousMessages);
      }
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para enviar áudio
  const sendAudioMutation = useMutation({
    mutationFn: async ({ audioData, duration, mimeType }: { audioData: string; duration: number; mimeType: string }) => {
      return await apiRequest("POST", `/api/conversations/${conversationId}/send-audio`, {
        audioData,
        duration,
        mimeType,
      });
    },
    // Optimistic update para áudio
    onMutate: async ({ audioData, duration }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/messages", conversationId] });
      const previousMessages = queryClient.getQueryData<Message[]>(["/api/messages", conversationId]);
      
      const optimisticMessage: Message = {
        id: `temp-audio-${Date.now()}`,
        conversationId: conversationId!,
        messageId: `temp-audio-${Date.now()}`,
        fromMe: true,
        text: `[Áudio ${duration}s]`,
        timestamp: new Date(),
        status: "sending",
        isFromAgent: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        mediaType: "audio",
        mediaUrl: audioData,
        mediaMimeType: "audio/ogg",
        mediaCaption: null,
      };
      
      queryClient.setQueryData<Message[]>(["/api/messages", conversationId], (old = []) => [...old, optimisticMessage]);
      
      return { previousMessages };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/status", conversationId] });
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(["/api/messages", conversationId], context.previousMessages);
      }
      toast({
        title: "Erro ao enviar áudio",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para enviar mídia
  const sendMediaMutation = useMutation({
    mutationFn: async ({ file, type, caption, previewUrl }: { file: File; type: string; caption?: string; previewUrl?: string }) => {
      // Converter arquivo para base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      const base64Data = await base64Promise;
      
      // Enviar como JSON com apiRequest (que tem autenticação)
      const response = await apiRequest("POST", `/api/conversations/${conversationId}/send-media-base64`, {
        fileData: base64Data,
        fileName: file.name,
        mimeType: file.type,
        mediaType: type,
        caption: caption || undefined,
      });
      
      return response.json();
    },
    // Optimistic update para mídia
    onMutate: async ({ file, type, caption }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/messages", conversationId] });
      const previousMessages = queryClient.getQueryData<Message[]>(["/api/messages", conversationId]);
      
      // Criar preview URL para imagem/vídeo
      let previewUrl: string | null = null;
      if (type === 'image' || type === 'video') {
        previewUrl = URL.createObjectURL(file);
      }
      
      const mediaLabel = type === 'image' ? 'Imagem' : type === 'video' ? 'Vídeo' : type === 'audio' ? 'Áudio' : 'Documento';
      
      const optimisticMessage: Message = {
        id: `temp-media-${Date.now()}`,
        conversationId: conversationId!,
        messageId: `temp-media-${Date.now()}`,
        fromMe: true,
        text: caption || `[${mediaLabel}]`,
        timestamp: new Date(),
        status: "sending",
        isFromAgent: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        mediaType: type,
        mediaUrl: previewUrl,
        mediaMimeType: file.type,
        mediaCaption: caption || null,
      };
      
      queryClient.setQueryData<Message[]>(["/api/messages", conversationId], (old = []) => [...old, optimisticMessage]);
      
      return { previousMessages, previewUrl };
    },
    onSuccess: (_data, _vars, context) => {
      // Limpar preview URL
      if (context?.previewUrl) {
        URL.revokeObjectURL(context.previewUrl);
      }
      // Não precisa mais setar isSendingMedia pois não bloqueia UI
      queryClient.invalidateQueries({ queryKey: ["/api/messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/status", conversationId] });
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previewUrl) {
        URL.revokeObjectURL(context.previewUrl);
      }
      if (context?.previousMessages) {
        queryClient.setQueryData(["/api/messages", conversationId], context.previousMessages);
      }
      // Não precisa mais setar isSendingMedia pois não bloqueia UI
      toast({
        title: "Erro ao enviar mídia",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handler para enviar áudio
  const handleSendAudio = useCallback(async (audioBlob: Blob, duration: number, mimeType: string) => {
    console.log('[ChatArea] Sending audio, size:', audioBlob.size, 'mimeType:', mimeType);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      sendAudioMutation.mutate({ audioData: base64, duration, mimeType });
    };
    reader.readAsDataURL(audioBlob);
  }, [sendAudioMutation]);

  // Handler para enviar mídia
  const handleSendMedia = useCallback((file: File, type: "image" | "video" | "document" | "audio", caption?: string) => {
    // Não bloquear UI - optimistic update já adiciona a mensagem
    sendMediaMutation.mutate({ file, type, caption });
  }, [sendMediaMutation]);

  // Handler para selecionar resposta rápida
  const handleQuickReplySelect = useCallback((content: string) => {
    setMessageText(content);
  }, []);

  // Handler para gerar mensagem com IA
  const handleAIGenerate = useCallback((message: string) => {
    setMessageText(message);
  }, []);

  const handleSend = () => {
    if (!messageText.trim() || !conversationId) return;
    sendMutation.mutate(messageText);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-scroll para última mensagem quando messages mudar
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-scroll quando abrir uma nova conversa
  useEffect(() => {
    if (conversationId) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }, 100);
    }
  }, [conversationId]);

  // Auto-transcrição ao abrir conversa
  useEffect(() => {
    if (conversationId && messages.length > 0 && !isAutoTranscribing) {
      // Debug: log todas as mensagens de áudio
      const audioMessages = messages.filter(msg => 
        msg.mediaType === "audio" || msg.text?.includes("Áudio") || msg.text?.includes("[Áudio")
      );
      console.log('[AUTO-TRANSCRIBE] Mensagens de áudio encontradas:', audioMessages.map(m => ({
        id: m.id,
        mediaType: m.mediaType,
        mediaUrl: m.mediaUrl ? 'SIM' : 'NÃO',
        text: m.text
      })));
      
      // Verifica se há áudios sem transcrição
      const hasUntranscribedAudios = messages.some(msg => 
        msg.mediaType === "audio" && 
        msg.mediaUrl && 
        (!msg.text || msg.text === "🎵 Áudio" || msg.text === "🎤 Áudio" || msg.text.startsWith("[Áudio"))
      );
      
      console.log('[AUTO-TRANSCRIBE] hasUntranscribedAudios:', hasUntranscribedAudios);
      
      if (hasUntranscribedAudios) {
        console.log('[AUTO-TRANSCRIBE] Iniciando transcrição automática...');
        setIsAutoTranscribing(true);
        autoTranscribeMutation.mutate();
      }
    }
  }, [conversationId, messages.length]);

  // WebSocket para atualizações em tempo real
  useEffect(() => {
    if (!conversationId) return;

    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connectWebSocket = async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;
        
        ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[ChatArea WebSocket] Received:', data.type);
            
            // Atualiza mensagens quando recebe nova mensagem ou resposta do agente
            if (data.type === 'new_message' || data.type === 'agent_response') {
              // Verifica se é para esta conversa
              if (data.data?.conversationId === conversationId) {
                queryClient.invalidateQueries({ 
                  queryKey: ["/api/messages", conversationId] 
                });
              }
            }
          } catch (err) {
            console.error('[ChatArea WebSocket] Parse error:', err);
          }
        };

        ws.onclose = () => {
          console.log('[ChatArea WebSocket] Closed, reconnecting in 3s...');
          reconnectTimeout = setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = (error) => {
          console.error('[ChatArea WebSocket] Error:', error);
        };

      } catch (error) {
        console.error('[ChatArea WebSocket] Connection error:', error);
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      }
    };

    connectWebSocket();

    return () => {
      if (ws) {
        ws.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [conversationId, queryClient]);

  // Número normalizado para exibição (usa remoteJid quando disponível)
  const displayNumber =
    conversation?.contactNumber ||
    (conversation?.remoteJid
      ? conversation.remoteJid.split("@")[0].split(":")[0]
      : "");

  // Minimalist onboarding: Agent CTA should have priority on the right side
  if (!conversationId && (!agentConfig || !(agentConfig as any).isActive)) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/20">
        <div className="text-center space-y-4 max-w-sm p-8">
          <Bot className="w-16 h-16 mx-auto text-muted-foreground" />
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Configure seu Agente IA</h3>
            <p className="text-sm text-muted-foreground">Defina seu agente para automatizar respostas.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const el = document.querySelector('[data-testid=\"button-nav-agent\"]') as HTMLButtonElement;
                el?.click();
              }}
              data-testid="button-minimal-configure-agent"
            >
              <Bot className="w-4 h-4 mr-2" />
              Configurar Agente
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Minimalist onboarding: WhatsApp connection CTA when nothing selected
  if (!conversationId && !connectionId) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/20">
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <Smartphone className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="font-medium text-sm mb-2">WhatsApp nao conectado</h3>
          <p className="text-xs text-muted-foreground max-w-xs mb-3">
            Conecte seu WhatsApp para visualizar e responder mensagens.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const el = document.querySelector('[data-testid="button-nav-connection"]') as HTMLButtonElement;
              el?.click();
            }}
            data-testid="button-minimal-connect-whatsapp"
          >
            Conectar WhatsApp
          </Button>
        </div>
      </div>
    );
  }

  // Minimal onboarding when agent is not configured
  if (!conversationId && (!agentStatus || agentStatus === undefined)) {
    // Fallback: show standard message; agent status is per conversation, so we also check global config below
  }

  // If no conversation selected and agent not configured globally, show minimal CTA
  // Note: relies on `/api/agent/config` query above
  // @ts-ignore - `agentConfig` is added when available
  if (!conversationId && (typeof agentConfig === 'undefined' || !(agentConfig && (agentConfig as any).isActive))) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/20">
        <div className="text-center space-y-4 max-w-sm p-8">
          <Bot className="w-16 h-16 mx-auto text-muted-foreground" />
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Configure seu Agente IA</h3>
            <p className="text-sm text-muted-foreground">Defina seu agente para automatizar respostas.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const el = document.querySelector('[data-testid="button-nav-agent"]') as HTMLButtonElement;
                el?.click();
              }}
              data-testid="button-minimal-configure-agent"
            >
              <Bot className="w-4 h-4 mr-2" />
              Configurar Agente
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!conversationId) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/20">
        <div className="text-center space-y-4 max-w-sm p-8">
          <MessageCircle className="w-16 h-16 mx-auto text-muted-foreground" />
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Selecione uma conversa</h3>
            <p className="text-sm text-muted-foreground">
              Escolha uma conversa da lista para comecar a visualizar e responder mensagens
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!connectionId) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/20">
        <div className="text-center space-y-4 max-w-sm p-8">
          <MessageCircle className="w-16 h-16 mx-auto text-muted-foreground" />
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">WhatsApp nao conectado</h3>
            <p className="text-sm text-muted-foreground">
              Conecte seu WhatsApp primeiro para visualizar as conversas
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Chat Header - Fixed no mobile */}
      <div className={cn(
        "p-3 md:p-4 border-b flex items-center gap-2 md:gap-3 bg-background z-10",
        isMobile && "fixed top-0 left-0 right-0"
      )}>
        {/* Botão voltar - apenas mobile */}
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9 flex-shrink-0"
            onClick={onBack}
            data-testid="button-back-conversations"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <Avatar 
          className="w-8 h-8 md:w-10 md:h-10 cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0" 
          onClick={(e) => {
            e.stopPropagation();
            if (conversation?.contactAvatar) {
              setAvatarModalImage(conversation.contactAvatar);
              setAvatarModalName(conversation.contactName || displayNumber);
              setAvatarModalOpen(true);
            }
          }}
        >
          {conversation?.contactAvatar ? (
            <img 
              src={conversation.contactAvatar} 
              alt={conversation.contactName || displayNumber}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <AvatarFallback 
            className={`bg-primary/10 text-primary font-semibold ${conversation?.contactAvatar ? 'hidden' : ''}`}
          >
            {conversation?.contactName
              ? conversation.contactName.charAt(0).toUpperCase()
              : (displayNumber || "?").charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate" data-testid="text-contact-name">
            {conversation?.contactName || displayNumber}
          </h3>
          <p className="text-xs text-muted-foreground font-mono">
            {displayNumber}
          </p>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          {/* Follow-up Toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={followupStatus?.active ? "default" : "outline"}
                  size="sm"
                  className="gap-1 h-7 px-2"
                  onClick={() => toggleFollowupMutation.mutate(!followupStatus?.active)}
                  disabled={toggleFollowupMutation.isPending}
                  data-testid="button-followup-toggle"
                >
                  {followupStatus?.active ? (
                    <>
                      <Sparkles className="w-3 h-3 text-yellow-500" />
                      <span className="hidden md:inline text-xs">Follow-up</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 opacity-40" />
                      <span className="hidden md:inline text-xs">Sem Follow-up</span>
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {followupStatus?.active 
                  ? `Follow-up ativo (Estágio ${(followupStatus.stage || 0) + 1})` 
                  : "Follow-up desativado para esta conversa"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Agendar Follow-up Manual */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 h-7 px-2"
                  onClick={() => setScheduleDialogOpen(true)}
                  data-testid="button-schedule-followup"
                >
                  <CalendarPlus className="w-3 h-3" />
                  <span className="hidden md:inline text-xs">Agendar</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Agendar follow-up manual (ex: cliente pediu para ligar em outro dia)
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Badge
            variant={agentStatus?.isDisabled ? "secondary" : "default"}
            className="gap-1 h-7 md:h-auto px-2"
            data-testid="badge-agent-status-chat"
          >
            {agentStatus?.isDisabled ? (
              <>
                <BotOff className="w-3 h-3" />
                <span className="hidden md:inline">Agente Desativado</span>
              </>
            ) : (
              <>
                <Bot className="w-3 h-3" />
                <span className="hidden md:inline">Agente Ativo</span>
              </>
            )}
          </Badge>
          <Switch
            checked={!agentStatus?.isDisabled}
            onCheckedChange={(checked) => toggleAgentMutation.mutate(!checked)}
            disabled={toggleAgentMutation.isPending}
            data-testid="switch-agent-chat"
          />
          
          {/* 🤖 Botão Responder com IA - dispara resposta manual */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 h-7 px-2 bg-gradient-to-r from-purple-500/10 to-blue-500/10 hover:from-purple-500/20 hover:to-blue-500/20 border-purple-500/30"
                  onClick={() => respondWithAIMutation.mutate()}
                  disabled={respondWithAIMutation.isPending || !agentConfig?.isActive}
                  data-testid="button-respond-with-ai"
                >
                  {respondWithAIMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3 text-purple-500" />
                  )}
                  <span className="hidden md:inline text-xs">Responder com IA</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  Faz a IA responder imediatamente a última mensagem do cliente.
                  {!agentConfig?.isActive && (
                    <span className="block text-amber-500 mt-1">
                      ⚠️ Ative o agente global em "Meu Agente IA" primeiro.
                    </span>
                  )}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* Botão para abrir painel de detalhes do contato */}
          {onOpenContactPanel && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 h-7 px-2 hidden md:flex"
                    onClick={onOpenContactPanel}
                    data-testid="button-open-contact-panel"
                  >
                    <User className="w-3 h-3" />
                    <span className="hidden lg:inline text-xs">Detalhes</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Abrir painel de detalhes do contato (campos personalizados, mídias, etiquetas)
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" title="Limpar conversa">
                <Trash2 className="w-5 h-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar conversa?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação apagará todas as mensagens desta conversa. Isso é útil para testar o fluxo da IA como se fosse um novo cliente. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMessagesMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Limpar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Messages Area - Scrollable entre header fixo e input fixo no mobile */}
      <div
        className={cn(
          "overflow-auto p-3 md:p-4 space-y-3 md:space-y-4",
          isMobile
            ? "absolute top-[64px] bottom-[calc(4rem+env(safe-area-inset-bottom)+3.5rem)] left-0 right-0"
            : "flex-1"
        )}
        data-testid="container-messages"
      >
        {/* Filtrar mensagens de sistema/eco que vieram de integrações antigas,
            por exemplo textos \"[Mensagem n\u00e3o suportada]\" */}
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.filter((m) => {
            if (m.mediaType) return true;
            const t = m.text?.toLowerCase() || "";
            // esconde mensagens de placeholder como \"[mensagem n\u00e3o suportada]\"
            return !(t.includes("mensagem") && t.includes("suportada"));
          }).length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda</p>
            </div>
          </div>
        ) : (
          messages
            .filter((m) => {
              if (m.mediaType) return true;
              const t = m.text?.toLowerCase() || "";
              return !(t.includes("mensagem") && t.includes("suportada"));
            })
            .map((message) => (
            <div
              key={message.id}
              className={`flex ${message.fromMe ? "justify-end" : "justify-start"}`}
              data-testid={`message-${message.id}`}
            >
              <div
                className={`max-w-[85%] md:max-w-md rounded-md px-3 py-2 md:px-4 ${
                  message.fromMe
                    ? "bg-primary text-primary-foreground ml-auto"
                    : "bg-muted mr-auto"
                }`}
              >
                {message.isFromAgent && (
                  <div className="flex items-center gap-1 mb-1">
                    <Bot className="w-3 h-3 text-primary" />
                    <span className="text-xs font-semibold text-primary">Agente IA</span>
                  </div>
                )}
                
                {/* Render media content */}
                {message.mediaType === "image" && message.mediaUrl ? (
                  <MessageImage 
                    src={message.mediaUrl} 
                    caption={message.mediaCaption}
                    alt="Imagem do WhatsApp"
                  />
                ) : message.mediaType === "audio" && message.mediaUrl ? (
                  <div className="space-y-2">
                    <MessageAudio 
                      src={message.mediaUrl}
                      duration={message.mediaDuration}
                      fromMe={message.fromMe}
                    />
                    {message.text && !message.text.startsWith('[Áudio') && !message.text.startsWith('🎵') && !message.text.startsWith('🎤') && (
                      <p className="text-sm whitespace-pre-wrap break-words italic opacity-80">
                        📝 {message.text.replace(/^\[ÁUDIO ENVIADO PELO AGENTE\]:\s*/i, '')}
                      </p>
                    )}
                  </div>
                ) : message.mediaType === "video" && message.mediaUrl ? (
                  <MessageVideo 
                    src={message.mediaUrl}
                    caption={message.mediaCaption}
                    duration={message.mediaDuration}
                    fromMe={message.fromMe}
                  />
                ) : message.mediaType === "document" && message.mediaUrl ? (
                  <MessageDocument 
                    src={message.mediaUrl}
                    fileName={message.text?.replace(/^📄\s*/, '') || "Documento"}
                    mimeType={message.mediaMimeType || undefined}
                    caption={message.mediaCaption}
                    fromMe={message.fromMe}
                  />
                ) : message.mediaType === "image" && !message.mediaUrl ? (
                  /* Imagem sem URL - mostrar placeholder */
                  <div className={`flex items-center gap-3 p-3 rounded-lg ${
                    message.fromMe 
                      ? "bg-white/10" 
                      : "bg-gray-100"
                  }`}>
                    <span className="text-2xl">🖼️</span>
                    <div>
                      <p className={`text-sm font-medium ${
                        message.fromMe ? "text-white" : "text-gray-900"
                      }`}>
                        Imagem enviada
                      </p>
                      <p className={`text-xs ${
                        message.fromMe ? "text-white/60" : "text-gray-500"
                      }`}>
                        {message.fromMe 
                          ? "Enviado pelo WhatsApp - visualize no app" 
                          : "Mídia não disponível"}
                      </p>
                    </div>
                  </div>
                ) : message.mediaType === "document" && !message.mediaUrl ? (
                  /* Documento sem URL - mostrar placeholder */
                  <div className={`flex items-center gap-3 p-3 rounded-lg ${
                    message.fromMe 
                      ? "bg-white/10" 
                      : "bg-gray-100"
                  }`}>
                    <span className="text-2xl">📄</span>
                    <div>
                      <p className={`text-sm font-medium ${
                        message.fromMe ? "text-white" : "text-gray-900"
                      }`}>
                        {message.text?.replace(/^📄\s*/, '').replace(/^\[Documento.*\]\s*/, '') || "Documento enviado"}
                      </p>
                      <p className={`text-xs ${
                        message.fromMe ? "text-white/60" : "text-gray-500"
                      }`}>
                        {message.fromMe 
                          ? "Enviado pelo WhatsApp - visualize no app" 
                          : "Mídia não disponível"}
                      </p>
                    </div>
                  </div>
                ) : message.mediaType === "video" && !message.mediaUrl ? (
                  /* Vídeo sem URL - mostrar placeholder */
                  <div className={`flex items-center gap-3 p-3 rounded-lg ${
                    message.fromMe 
                      ? "bg-white/10" 
                      : "bg-gray-100"
                  }`}>
                    <span className="text-2xl">🎥</span>
                    <div>
                      <p className={`text-sm font-medium ${
                        message.fromMe ? "text-white" : "text-gray-900"
                      }`}>
                        Vídeo enviado
                      </p>
                      <p className={`text-xs ${
                        message.fromMe ? "text-white/60" : "text-gray-500"
                      }`}>
                        {message.fromMe 
                          ? "Enviado pelo WhatsApp - visualize no app" 
                          : "Mídia não disponível"}
                      </p>
                    </div>
                  </div>
                ) : message.mediaType === "audio" && !message.mediaUrl ? (
                  /* Áudio sem URL - mostrar placeholder */
                  <div className={`flex items-center gap-3 p-3 rounded-lg ${
                    message.fromMe 
                      ? "bg-white/10" 
                      : "bg-gray-100"
                  }`}>
                    <span className="text-2xl">🎤</span>
                    <div>
                      <p className={`text-sm font-medium ${
                        message.fromMe ? "text-white" : "text-gray-900"
                      }`}>
                        Áudio enviado
                      </p>
                      <p className={`text-xs ${
                        message.fromMe ? "text-white/60" : "text-gray-500"
                      }`}>
                        {message.fromMe 
                          ? "Enviado pelo WhatsApp - visualize no app" 
                          : "Mídia não disponível"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
                )}
                
                <p
                  className={`text-xs mt-1 ${
                    message.fromMe ? "text-primary-foreground/70" : "text-muted-foreground"
                  }`}
                >
                  {format(new Date(message.timestamp), "HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input - Fixed acima do menu no mobile */}
      <div
        className={cn(
          "p-3 md:p-4 border-t bg-background z-20",
          isMobile && "fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0"
        )}
      >
        {/* Se está gravando áudio, mostra a barra de gravação */}
        {isRecordingAudio ? (
          <UserAudioRecorder
            onSend={handleSendAudio}
            onCancel={() => setIsRecordingAudio(false)}
            disabled={sendAudioMutation.isPending}
          />
        ) : (
          <div className="flex items-center gap-2">
            {/* Botões de ação à esquerda - escondidos no mobile para dar mais espaço */}
            <div className="hidden md:flex items-center gap-1">
              <UserMediaUploader
                onUpload={handleSendMedia}
                disabled={sendMediaMutation.isPending}
              />
              <UserQuickReplies
                onSelect={handleQuickReplySelect}
                disabled={false}
              />
              <UserAIMessageGenerator
                onGenerate={handleAIGenerate}
                contactName={conversation?.contactName || undefined}
                lastMessages={messages?.slice(-5).map(m => m.text || "").filter(Boolean) || []}
                disabled={false}
              />
            </div>
            
            {/* Botão de anexo no mobile */}
            <div className="md:hidden">
              <UserMediaUploader
                onUpload={handleSendMedia}
                disabled={sendMediaMutation.isPending}
              />
            </div>
            
            {/* Input de texto */}
            <Textarea
              placeholder="Digite sua mensagem..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={handleKeyPress}
              className="resize-none min-h-11 max-h-32 flex-1 text-base"
              style={{ fontSize: '16px' }} // Prevent iOS zoom
              data-testid="input-message"
            />
            
            {/* Botões de ação à direita */}
            <div className="flex items-center gap-1">
              {/* Botão de gravar áudio (aparece quando não tem texto) */}
              {!messageText.trim() && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsRecordingAudio(true)}
                  disabled={sendAudioMutation.isPending}
                  className={cn(
                    "text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors",
                    isMobile && "h-11 w-11"
                  )}
                  title="Gravar áudio"
                  type="button"
                >
                  <Mic className={cn("w-5 h-5", isMobile && "w-6 h-6")} />
                </Button>
              )}
              
              {/* Botão de enviar (aparece quando tem texto) */}
              {messageText.trim() && (
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!messageText.trim() || sendMutation.isPending}
                  data-testid="button-send"
                  className={isMobile ? "h-11 w-11" : ""}
                >
                  <Send className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Avatar Modal */}
      <Dialog open={avatarModalOpen} onOpenChange={setAvatarModalOpen}>
        <DialogContent className="max-w-md bg-black border-none">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-gray-800 pb-4">
            <DialogTitle className="text-white font-medium">
              {avatarModalName}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-white hover:bg-transparent"
              onClick={() => setAvatarModalOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </DialogHeader>
          <div className="flex items-center justify-center py-6">
            <img
              src={avatarModalImage}
              alt={avatarModalName}
              className="max-w-full max-h-[70vh] object-contain rounded-lg"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Agendamento Manual */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="w-5 h-5" />
              Agendar Follow-up Manual
            </DialogTitle>
            <DialogDescription>
              Agende um lembrete para entrar em contato com este cliente em uma data específica.
              Ideal para quando o cliente pede para ligar em outro dia.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="schedule-date">Data</Label>
                <Input
                  id="schedule-date"
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="schedule-time">Horário</Label>
                <Input
                  id="schedule-time"
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-note">Observação (opcional)</Label>
              <Input
                id="schedule-note"
                placeholder="Ex: Cliente pediu para ligar às 14h"
                value={scheduleNote}
                onChange={(e) => setScheduleNote(e.target.value)}
              />
            </div>
            
            {/* Atalhos rápidos */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Atalhos rápidos</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    setScheduleDate(tomorrow.toISOString().split('T')[0]);
                    setScheduleTime("09:00");
                  }}
                >
                  Amanhã 9h
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    setScheduleDate(tomorrow.toISOString().split('T')[0]);
                    setScheduleTime("14:00");
                  }}
                >
                  Amanhã 14h
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const nextWeek = new Date();
                    nextWeek.setDate(nextWeek.getDate() + 7);
                    setScheduleDate(nextWeek.toISOString().split('T')[0]);
                    setScheduleTime("10:00");
                  }}
                >
                  Próxima semana
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const in2Hours = new Date();
                    in2Hours.setHours(in2Hours.getHours() + 2);
                    setScheduleDate(in2Hours.toISOString().split('T')[0]);
                    setScheduleTime(in2Hours.toTimeString().slice(0, 5));
                  }}
                >
                  Em 2 horas
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setScheduleDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!scheduleDate || !scheduleTime) {
                  toast({
                    title: "Campos obrigatórios",
                    description: "Preencha a data e horário do agendamento",
                    variant: "destructive",
                  });
                  return;
                }
                const scheduledFor = new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString();
                scheduleFollowupMutation.mutate({ scheduledFor, note: scheduleNote || undefined });
              }}
              disabled={scheduleFollowupMutation.isPending}
            >
              {scheduleFollowupMutation.isPending ? (
                <>
                  <Clock className="w-4 h-4 mr-2 animate-spin" />
                  Agendando...
                </>
              ) : (
                <>
                  <CalendarPlus className="w-4 h-4 mr-2" />
                  Agendar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );}