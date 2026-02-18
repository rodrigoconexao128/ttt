import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Send, MessageCircle, Search, Smartphone, Bot, X, Trash2, AlertTriangle, Loader2, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Conversation, AiAgentConfig, AdminMessage } from "@shared/schema";
import { MessageImage } from "@/components/message-image";
import { MessageAudio } from "@/components/message-audio";
import { AudioRecorder } from "@/components/audio-recorder";
import { MediaUploader, type MediaType } from "@/components/media-uploader";
import { QuickReplies } from "@/components/quick-replies";
import { AIMessageGenerator } from "@/components/ai-message-generator";
import { cn } from "@/lib/utils";

interface AdminConversation extends Conversation {
  userId?: string;
  followupActive?: boolean;
  followupStage?: number;
}

export default function AdminConversations() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [avatarModalImage, setAvatarModalImage] = useState("");
  const [avatarModalName, setAvatarModalName] = useState("");
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isSendingMedia, setIsSendingMedia] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  // Detectar se está em mobile
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch all conversations from admin endpoint
  const { data: conversations = [], isLoading } = useQuery<AdminConversation[]>({
    queryKey: ["/api/admin/conversations"],
    refetchInterval: 5000,
  });

  // Query para comprovantes PIX pendentes
  const { data: pendingReceiptsData } = useQuery<{ receipts: any[]; total: number }>({
    queryKey: ["/api/admin/payment-receipts", "pending-conversations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/payment-receipts?status=pending&limit=5");
      return res.json();
    },
    refetchInterval: 30000,
  });
  const pendingReceiptsCount = pendingReceiptsData?.total || 0;

  const { data: selectedConversation } = useQuery<AdminConversation>({
    queryKey: ["/api/admin/conversation", selectedConversationId],
    enabled: !!selectedConversationId,
  });

  const toggleFollowUpMutation = useMutation({
    mutationFn: async (active: boolean) => {
      return await apiRequest("POST", `/api/admin/conversations/${selectedConversationId}/toggle-followup`, { active });
    },
    onSuccess: (_, active) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/conversations", selectedConversationId] });
      toast({
        title: active ? "Follow-up Ativado" : "Follow-up Desativado",
        description: active 
          ? "O sistema enviará mensagens automáticas de reengajamento." 
          : "O follow-up automático foi pausado para esta conversa.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível alterar o status do follow-up.",
        variant: "destructive",
      });
    },
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<AdminMessage[]>({
    queryKey: ["/api/admin/messages", selectedConversationId],
    enabled: !!selectedConversationId,
    queryFn: async () => {
      if (!selectedConversationId) return [];
      const res = await fetch(`/api/admin/conversations/${selectedConversationId}/messages`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    refetchInterval: 2000,
  });

  const { data: agentConfig } = useQuery<AiAgentConfig | null>({
    queryKey: ["/api/agent/config"],
  });

  const { data: agentStatus } = useQuery<{ isDisabled: boolean }>({
    queryKey: ["/api/admin/conversations", selectedConversationId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/conversations/${selectedConversationId}`);
      if (!res.ok) return { isDisabled: false };
      const data = await res.json();
      return { isDisabled: !data.isAgentEnabled };
    },
    enabled: !!selectedConversationId,
  });

  // Filter conversations based on search
  const filteredConversations = conversations.filter((conv) => {
    const searchLower = searchQuery.toLowerCase();
    const normalizedNumber =
      conv.contactNumber ||
      (conv.remoteJid || `${conv.contactNumber}@s.whatsapp.net`)
        .split("@")[0]
        .split(":")[0];
    return (
      conv.contactName?.toLowerCase().includes(searchLower) ||
      normalizedNumber.includes(searchLower) ||
      conv.lastMessageText?.toLowerCase().includes(searchLower)
    );
  });

  const toggleAgentMutation = useMutation({
    mutationFn: async (disable: boolean) => {
      // Usar rotas específicas de admin para pausar/resumir
      const endpoint = disable ? "pause-agent" : "resume-agent";
      return await apiRequest("POST", `/api/admin/conversations/${selectedConversationId}/${endpoint}`, {});
    },
    onSuccess: (_, disable) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/conversations", selectedConversationId] });
      toast({
        title: !disable ? "Agente Ativado" : "Agente Desativado",
        description: !disable 
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

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      return await apiRequest("POST", `/api/admin/conversations/${selectedConversationId}/send`, {
        text,
      });
    },
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/messages", selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/conversations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para enviar áudio gravado
  const sendAudioMutation = useMutation({
    mutationFn: async ({ audioBlob, duration }: { audioBlob: Blob; duration: number }) => {
      // Converter blob para base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });
      const audioData = await base64Promise;
      
      return await apiRequest("POST", `/api/admin/conversations/${selectedConversationId}/send-audio`, {
        audioData,
        duration,
      });
    },
    onSuccess: () => {
      setIsRecordingAudio(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/messages", selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/conversations"] });
      toast({
        title: "Áudio enviado!",
        description: "Sua mensagem de voz foi enviada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar áudio",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para enviar mídia (imagem, vídeo, documento)
  const sendMediaMutation = useMutation({
    mutationFn: async ({ file, mediaType }: { file: File; mediaType: MediaType }) => {
      setIsSendingMedia(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mediaType', mediaType);
      
      const response = await fetch(`/api/admin/conversations/${selectedConversationId}/send-media`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send media');
      }
      
      return response.json();
    },
    onSuccess: () => {
      setIsSendingMedia(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/messages", selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/conversations"] });
      toast({
        title: "Mídia enviada!",
        description: "Seu arquivo foi enviado com sucesso.",
      });
    },
    onError: (error: Error) => {
      setIsSendingMedia(false);
      toast({
        title: "Erro ao enviar mídia",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handlers para os novos componentes
  const handleAudioRecordingComplete = useCallback((audioBlob: Blob, duration: number) => {
    sendAudioMutation.mutate({ audioBlob, duration });
  }, [sendAudioMutation]);

  const handleMediaSelect = useCallback((file: File, type: MediaType) => {
    sendMediaMutation.mutate({ file, mediaType: type });
  }, [sendMediaMutation]);

  const handleQuickReplySelect = useCallback((content: string) => {
    setMessageText(content);
  }, []);

  const handleAIMessageGenerate = useCallback((message: string) => {
    setMessageText(message);
  }, []);

  // Mutation para limpar histórico
  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      // "Limpar histórico" deve limpar TUDO (inclui conta de teste) para permitir recomeçar do zero
      const res = await fetch(`/api/admin/conversations/${selectedConversationId}/complete`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || error.message || "Falha ao limpar histórico");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/messages", selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/conversations"] });
      setSelectedConversationId(null);
      toast({
        title: "Reset completo!",
        description: "Conta e histórico removidos. Você pode recomeçar do zero.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao limpar histórico",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para reset completo (deleta tudo do banco)
  const resetCompleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/conversations/${selectedConversationId}/complete`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Falha ao resetar conta");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/messages", selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/conversations"] });
      setSelectedConversationId(null);
      setResetDialogOpen(false);
      setResetConfirmText("");
      toast({
        title: "Reset Completo!",
        description: "Conta deletada completamente do banco de dados. Você pode testar novamente do zero.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao resetar conta",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    if (!messageText.trim() || !selectedConversationId) return;
    sendMutation.mutate(messageText);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-scroll when opening new conversation
  useEffect(() => {
    if (selectedConversationId) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }, 100);
    }
  }, [selectedConversationId]);

  const displayNumber =
    selectedConversation?.contactNumber ||
    (selectedConversation?.remoteJid
      ? selectedConversation.remoteJid.split("@")[0].split(":")[0]
      : "");

  return (
    <div className="flex w-full h-full gap-0 bg-background">
      {/* Conversations List */}
      <div className="w-80 border-r bg-card flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b space-y-4 flex-shrink-0">
          <h2 className="font-semibold text-lg">Conversas</h2>

          {/* Banner de Comprovantes PIX Pendentes */}
          {pendingReceiptsCount > 0 && (
            <div 
              className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded-lg cursor-pointer hover:bg-orange-100 transition-colors"
              onClick={() => {
                // Navegar para a tab de receipts no admin
                window.location.hash = '#receipts';
                window.dispatchEvent(new CustomEvent('admin-tab-change', { detail: 'receipts' }));
              }}
            >
              <Receipt className="w-4 h-4 text-orange-500 flex-shrink-0" />
              <span className="text-xs text-orange-700 font-medium">
                {pendingReceiptsCount} comprovante{pendingReceiptsCount > 1 ? 's' : ''} PIX pendente{pendingReceiptsCount > 1 ? 's' : ''}
              </span>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-admin-conversations"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <MessageCircle className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="font-medium text-sm mb-2">
                {searchQuery ? "Nenhuma conversa encontrada" : "Nenhuma conversa"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                {searchQuery
                  ? "Tente buscar por outro termo"
                  : "As conversas aparecerão aqui quando houver atividade"}
              </p>
            </div>
          ) : (
            <div className="divide-y" data-testid="list-admin-conversations">
              {filteredConversations.map((conversation) => {
                const displayNum =
                  conversation.contactNumber ||
                  (conversation.remoteJid || "").split("@")[0].split(":")[0] ||
                  "?";

                return (
                  <button
                    key={conversation.id}
                    onClick={() => setSelectedConversationId(conversation.id)}
                    className={`w-full p-4 text-left hover:bg-accent transition-colors ${
                      selectedConversationId === conversation.id
                        ? "bg-sidebar-accent"
                        : ""
                    }`}
                    data-testid={`admin-conversation-item-${conversation.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar 
                        className="w-12 h-12 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (conversation.contactAvatar) {
                            setAvatarModalImage(conversation.contactAvatar);
                            setAvatarModalName(conversation.contactName || displayNum);
                            setAvatarModalOpen(true);
                          }
                        }}
                      >
                        {conversation.contactAvatar ? (
                          <img 
                            src={conversation.contactAvatar} 
                            alt={conversation.contactName || displayNum}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <AvatarFallback 
                          className={`bg-primary/10 text-primary font-semibold ${conversation.contactAvatar ? 'hidden' : ''}`}
                        >
                          {conversation.contactName
                            ? conversation.contactName.charAt(0).toUpperCase()
                            : displayNum.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <h3 className="font-semibold text-sm truncate">
                              {conversation.contactName || displayNum}
                            </h3>
                            {conversation.followupActive && (
                              <Badge variant="outline" className="h-4 px-1 text-[10px] border-blue-500/50 text-blue-500 flex-shrink-0">
                                Follow-up
                              </Badge>
                            )}
                          </div>
                          {conversation.lastMessageTime && (
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              {formatDistanceToNow(
                                new Date(conversation.lastMessageTime),
                                {
                                  addSuffix: true,
                                  locale: ptBR,
                                },
                              )}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground truncate">
                            {conversation.lastMessageText || "Sem mensagens"}
                          </p>
                          {conversation.unreadCount > 0 && (
                            <Badge
                              variant="default"
                              className="flex-shrink-0 h-5 min-w-5 px-1.5 text-xs"
                              data-testid={`admin-badge-unread-${conversation.id}`}
                            >
                              {conversation.unreadCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {!selectedConversationId ? (
          <div className="flex items-center justify-center h-full bg-muted/20">
            <div className="text-center space-y-4 max-w-sm p-8">
              <MessageCircle className="w-16 h-16 mx-auto text-muted-foreground" />
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">Selecione uma conversa</h3>
                <p className="text-sm text-muted-foreground">
                  Escolha uma conversa na lista para começar a visualizar as mensagens.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="border-b p-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <Avatar 
                  className="w-10 h-10 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedConversation?.contactAvatar) {
                      setAvatarModalImage(selectedConversation.contactAvatar);
                      setAvatarModalName(selectedConversation.contactName || displayNumber);
                      setAvatarModalOpen(true);
                    }
                  }}
                >
                  {selectedConversation?.contactAvatar ? (
                    <img 
                      src={selectedConversation.contactAvatar}
                      alt={selectedConversation.contactName || displayNumber}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <AvatarFallback className={`bg-primary/10 text-primary ${selectedConversation?.contactAvatar ? 'hidden' : ''}`}>
                    {selectedConversation?.contactName
                      ? selectedConversation.contactName.charAt(0).toUpperCase()
                      : displayNumber.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold">
                    {selectedConversation?.contactName || displayNumber}
                  </h3>
                  <p className="text-xs text-muted-foreground">{displayNumber}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={agentStatus?.isDisabled ? "secondary" : "default"}>
                    {agentStatus?.isDisabled ? "Agente Desativado" : "Agente Ativo"}
                  </Badge>
                  <Switch
                    checked={!agentStatus?.isDisabled}
                    onCheckedChange={(checked) => toggleAgentMutation.mutate(!checked)}
                    disabled={toggleAgentMutation.isPending}
                  />
                </div>

                <div className="flex items-center gap-2 ml-2 border-l pl-2">
                  <Badge variant={selectedConversation?.followupActive ? "outline" : "secondary"}>
                    {selectedConversation?.followupActive ? "Follow-up ON" : "Follow-up OFF"}
                  </Badge>
                  <Switch
                    checked={!!selectedConversation?.followupActive}
                    onCheckedChange={(checked) => toggleFollowUpMutation.mutate(checked)}
                    disabled={toggleFollowUpMutation.isPending}
                  />
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm("Encerrar este chamado? O histórico será mantido para auditoria, mas um novo contato iniciará novo contexto.")) {
                      closeTicketMutation.mutate();
                    }
                  }}
                  disabled={closeTicketMutation.isPending}
                  title="Encerrar chamado"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
                {/* Botão Reset Completo - só aparece para contas @agentezap.temp */}
                {selectedConversation?.userId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setResetDialogOpen(true)}
                    disabled={resetCompleteMutation.isPending}
                    title="DELETAR TUDO do banco - só para contas de teste"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <AlertTriangle className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="container-admin-messages">
              {messagesLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p>Nenhuma mensagem nesta conversa</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.fromMe ? "justify-end" : "justify-start"
                    }`}
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
                        {new Date(message.timestamp || message.createdAt).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className={cn(
              "border-t p-3 md:p-4 flex-shrink-0 space-y-2 bg-background",
              isMobile && "sticky bottom-0"
            )}>
              {/* Loading state para envio de mídia */}
              {isSendingMedia && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-lg p-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Enviando mídia...</span>
                </div>
              )}
              
              {/* Área de gravação de áudio (quando estiver gravando) */}
              {isRecordingAudio && (
                <div className="flex items-center justify-center py-2">
                  <AudioRecorder
                    onRecordingComplete={handleAudioRecordingComplete}
                    onCancel={() => setIsRecordingAudio(false)}
                    disabled={sendAudioMutation.isPending}
                  />
                </div>
              )}
              
              {/* Input normal */}
              {!isRecordingAudio && (
                <div className="flex items-end gap-2">
                  {/* Botões de mídia (esquerda) */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Anexar arquivo */}
                    <MediaUploader
                      onFileSelect={handleMediaSelect}
                      disabled={sendMutation.isPending || isSendingMedia}
                    />
                  </div>
                  
                  {/* Textarea */}
                  <div className="flex-1 relative">
                    <Textarea
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Digite sua mensagem..."
                      className={cn(
                        "min-h-[44px] max-h-32 resize-none pr-10",
                        isMobile && "text-base" // Maior em mobile
                      )}
                      data-testid="textarea-admin-message"
                    />
                  </div>
                  
                  {/* Botões de ação (direita) */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Respostas rápidas */}
                    <QuickReplies
                      onSelect={handleQuickReplySelect}
                      disabled={sendMutation.isPending}
                    />
                    
                    {/* Gerar com IA */}
                    <AIMessageGenerator
                      onGenerate={handleAIMessageGenerate}
                      context={{
                        contactName: selectedConversation?.contactName || undefined,
                        lastMessages: messages.slice(-5).map(m => m.text || ''),
                      }}
                      disabled={sendMutation.isPending}
                    />
                    
                    {/* Gravar áudio ou Enviar texto */}
                    {messageText.trim() ? (
                      <Button
                        onClick={handleSend}
                        disabled={sendMutation.isPending}
                        size="icon"
                        className="h-10 w-10"
                        data-testid="button-admin-send-message"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    ) : (
                      <AudioRecorder
                        onRecordingComplete={handleAudioRecordingComplete}
                        onCancel={() => {}}
                        disabled={sendMutation.isPending || sendAudioMutation.isPending}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Avatar Modal */}
      <Dialog open={avatarModalOpen} onOpenChange={setAvatarModalOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-black/90">
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground z-10">
            <X className="h-6 w-6 text-white" />
            <span className="sr-only">Fechar</span>
          </DialogClose>
          {avatarModalImage && (
            <div className="flex flex-col items-center justify-center p-4">
              <h3 className="text-white font-semibold mb-4 text-lg">{avatarModalName}</h3>
              <img 
                src={avatarModalImage} 
                alt={avatarModalName}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset Complete Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="max-w-md">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-lg">⚠️ ATENÇÃO - Reset Completo</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Esta ação é IRREVERSÍVEL e vai DELETAR TUDO do banco de dados:
                </p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <ul className="text-sm space-y-1 text-red-800">
                <li>✗ Conta do usuário (users)</li>
                <li>✗ Assinatura (subscriptions)</li>
                <li>✗ Configurações do agente (agent_config)</li>
                <li>✗ Conexões WhatsApp (whatsapp_connections)</li>
                <li>✗ Todas as conversas e mensagens</li>
                <li>✗ Follow-ups agendados</li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">
                Para confirmar, digite: <span className="font-mono font-bold text-red-600">DELETAR</span>
              </p>
              <Input
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="Digite DELETAR para confirmar"
                className="font-mono"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setResetDialogOpen(false);
                  setResetConfirmText("");
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => resetCompleteMutation.mutate()}
                disabled={resetConfirmText !== "DELETAR" || resetCompleteMutation.isPending}
              >
                {resetCompleteMutation.isPending ? "Deletando..." : "Confirmar Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
