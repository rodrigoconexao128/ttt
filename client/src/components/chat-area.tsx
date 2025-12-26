import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Send, MessageCircle, Bot, BotOff, Smartphone, X, Trash2, Sparkles, SparklesOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Message, Conversation, AiAgentConfig } from "@shared/schema";
import { MessageImage } from "@/components/message-image";
import { MessageAudio } from "@/components/message-audio";

interface ChatAreaProps {
  conversationId: string | null;
  connectionId?: string;
}

export function ChatArea({ conversationId, connectionId }: ChatAreaProps) {
  const { toast } = useToast();
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [avatarModalImage, setAvatarModalImage] = useState("");
  const [avatarModalName, setAvatarModalName] = useState("");

  const { data: conversation } = useQuery<Conversation>({
    queryKey: ["/api/conversation", conversationId],
    enabled: !!conversationId,
  });

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
          ? "O agente voltara a responder automaticamente" 
          : "O agente nao respondera mais nesta conversa",
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

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      return await apiRequest("POST", "/api/messages/send", {
        conversationId,
        text,
      });
    },
    onSuccess: (data: any) => {
      setMessageText("");
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
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message,
        variant: "destructive",
      });
    },
  });

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
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="p-3 md:p-4 border-b flex items-center gap-3 bg-background/95 backdrop-blur sticky top-0 z-10">
        <Avatar 
          className="w-8 h-8 md:w-10 md:h-10 cursor-pointer hover:opacity-80 transition-opacity" 
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
                      <Sparkles className="w-3 h-3" />
                      <span className="hidden md:inline text-xs">Follow-up</span>
                    </>
                  ) : (
                    <>
                      <SparklesOff className="w-3 h-3" />
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

      {/* Messages Area */}
      <div className="flex-1 overflow-auto p-4 space-y-4" data-testid="container-messages">
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
                className={`max-w-md rounded-md px-4 py-2 ${
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
                    {message.text && (
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.text}
                      </p>
                    )}
                  </div>
                ) : message.mediaType === "video" && message.mediaUrl ? (
                  <div className="space-y-2">
                    <video 
                      src={message.mediaUrl} 
                      controls 
                      className="max-w-[280px] max-h-[280px] rounded-lg"
                    />
                    {message.mediaCaption && (
                      <p className="text-sm whitespace-pre-wrap break-words">{message.mediaCaption}</p>
                    )}
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

      {/* Message Input */}
      <div className="p-4 border-t bg-background">
        <div className="flex gap-2">
          <Textarea
            placeholder="Digite sua mensagem..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyPress}
            className="resize-none min-h-12 max-h-32"
            data-testid="input-message"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!messageText.trim() || sendMutation.isPending}
            data-testid="button-send"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
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
    </div>
  );
}

