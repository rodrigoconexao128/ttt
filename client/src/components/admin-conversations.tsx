import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, 
  MessageCircle, 
  Loader2, 
  Send, 
  Bot, 
  User, 
  RefreshCw,
  PauseCircle,
  PlayCircle,
  Phone
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AdminConversation {
  id: string;
  adminId: string;
  contactNumber: string;
  remoteJid?: string | null;
  contactName?: string | null;
  contactAvatar?: string | null;
  lastMessageText?: string | null;
  lastMessageTime?: string | null;
  unreadCount: number;
  isAgentEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AdminMessage {
  id: string;
  conversationId: string;
  messageId: string;
  fromMe: boolean;
  text?: string | null;
  timestamp: string;
  status?: string | null;
  isFromAgent: boolean;
  mediaType?: string | null;
  mediaUrl?: string | null;
  mediaCaption?: string | null;
  createdAt: string;
}

// Função para extrair número do telefone de forma consistente
function getDisplayNumber(conv: AdminConversation): string {
  if (conv.contactNumber) {
    return conv.contactNumber;
  }
  if (conv.remoteJid) {
    return conv.remoteJid.split("@")[0].split(":")[0];
  }
  return "?";
}

// Função para formatar número para exibição
function formatPhoneNumber(number: string): string {
  const digits = number.replace(/\D/g, "");
  
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  
  return number;
}

// Gera cor consistente baseada no número
function getAvatarColor(identifier: string): string {
  const colors = [
    "bg-emerald-500", "bg-blue-500", "bg-purple-500", "bg-pink-500", 
    "bg-orange-500", "bg-teal-500", "bg-indigo-500", "bg-rose-500"
  ];
  const hash = identifier.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

export default function AdminConversations() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Buscar lista de conversas
  const { data: conversations = [], isLoading: loadingConversations, refetch: refetchConversations } = useQuery<AdminConversation[]>({
    queryKey: ["/api/admin/conversations"],
    refetchInterval: 5000,
  });

  // Buscar mensagens da conversa selecionada
  const { data: messages = [], isLoading: loadingMessages, refetch: refetchMessages } = useQuery<AdminMessage[]>({
    queryKey: ["/api/admin/conversations", selectedConversationId, "messages"],
    queryFn: async () => {
      if (!selectedConversationId) return [];
      const res = await fetch(`/api/admin/conversations/${selectedConversationId}/messages`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao buscar mensagens");
      return res.json();
    },
    enabled: !!selectedConversationId,
    refetchInterval: 3000,
  });

  // Mutation para pausar/continuar agente
  const toggleAgentMutation = useMutation({
    mutationFn: async ({ conversationId, pause }: { conversationId: string; pause: boolean }) => {
      const endpoint = pause ? "pause-agent" : "resume-agent";
      const res = await fetch(`/api/admin/conversations/${conversationId}/${endpoint}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao alterar agente");
      return res.json();
    },
    onSuccess: (data, { pause }) => {
      toast({
        title: pause ? "🤖 Agente Pausado" : "🤖 Agente Retomado",
        description: pause 
          ? "Você assumiu a conversa. O agente não responderá automaticamente."
          : "O agente voltou a responder automaticamente.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/conversations"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível alterar o status do agente",
        variant: "destructive",
      });
    },
  });

  // Mutation para enviar mensagem
  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, message }: { conversationId: string; message: string }) => {
      const res = await fetch(`/api/admin/conversations/${conversationId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: message }),
      });
      if (!res.ok) throw new Error("Erro ao enviar mensagem");
      return res.json();
    },
    onSuccess: () => {
      setNewMessage("");
      refetchMessages();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/conversations"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível enviar a mensagem",
        variant: "destructive",
      });
    },
  });

  // Auto-scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = () => {
    if (!selectedConversationId || !newMessage.trim()) return;
    sendMessageMutation.mutate({
      conversationId: selectedConversationId,
      message: newMessage.trim(),
    });
  };

  // Filtrar conversas por busca
  const filteredConversations = conversations.filter((conv) => {
    const query = searchQuery.toLowerCase();
    const displayNumber = getDisplayNumber(conv);
    return (
      displayNumber.includes(query) ||
      (conv.contactName?.toLowerCase().includes(query)) ||
      (conv.lastMessageText?.toLowerCase().includes(query))
    );
  });

  // Conversa selecionada
  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);
  const selectedDisplayNumber = selectedConversation ? getDisplayNumber(selectedConversation) : "";

  return (
    <div className="h-[calc(100vh-200px)] min-h-[600px] flex bg-background rounded-xl border shadow-lg overflow-hidden">
      {/* Sidebar - Lista de Conversas */}
      <div className="w-[380px] border-r flex flex-col bg-card">
        {/* Header da Sidebar */}
        <div className="p-4 border-b bg-gradient-to-r from-emerald-600 to-emerald-500">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Conversas
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetchConversations()}
              className="text-white hover:bg-white/20"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar ou começar uma nova conversa"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white/95 border-0 focus-visible:ring-2 focus-visible:ring-white/50"
            />
          </div>
        </div>

        {/* Lista de Conversas */}
        <ScrollArea className="flex-1">
          {loadingConversations ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground p-6 text-center">
              <MessageCircle className="h-12 w-12 mb-4 opacity-50" />
              <p className="font-medium">Nenhuma conversa</p>
              <p className="text-sm">As conversas aparecerão aqui</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredConversations.map((conv) => {
                const displayNumber = getDisplayNumber(conv);
                const avatarColor = getAvatarColor(displayNumber);
                const isSelected = selectedConversationId === conv.id;
                
                return (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConversationId(conv.id)}
                    className={`p-4 cursor-pointer transition-all duration-200 hover:bg-muted/50 ${
                      isSelected ? "bg-emerald-50 dark:bg-emerald-950/30 border-l-4 border-emerald-500" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative">
                        <Avatar className={`h-12 w-12 ${avatarColor}`}>
                          {conv.contactAvatar ? (
                            <img 
                              src={conv.contactAvatar} 
                              alt={conv.contactName || displayNumber}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : null}
                          <AvatarFallback className={`${avatarColor} text-white font-semibold ${conv.contactAvatar ? 'hidden' : ''}`}>
                            {conv.contactName 
                              ? conv.contactName.charAt(0).toUpperCase() 
                              : displayNumber.slice(-2)}
                          </AvatarFallback>
                        </Avatar>
                        {/* Status indicator */}
                        <div className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white flex items-center justify-center ${
                          conv.isAgentEnabled ? "bg-emerald-500" : "bg-amber-500"
                        }`}>
                          {conv.isAgentEnabled ? (
                            <Bot className="h-2.5 w-2.5 text-white" />
                          ) : (
                            <User className="h-2.5 w-2.5 text-white" />
                          )}
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm truncate">
                            {conv.contactName || formatPhoneNumber(displayNumber)}
                          </p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {conv.lastMessageTime && (
                              <span className={`text-xs ${conv.unreadCount > 0 ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}`}>
                                {formatDistanceToNow(new Date(conv.lastMessageTime), {
                                  addSuffix: false,
                                  locale: ptBR,
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <p className="text-sm text-muted-foreground truncate flex-1">
                            {conv.lastMessageText || "Sem mensagens"}
                          </p>
                          {conv.unreadCount > 0 && (
                            <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white text-xs px-2 min-w-[20px] justify-center">
                              {conv.unreadCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Área Principal - Chat */}
      <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900/50">
        {!selectedConversationId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <div className="bg-background/80 backdrop-blur-sm rounded-2xl p-8 text-center shadow-lg">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                <MessageCircle className="h-10 w-10 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-2">AgentZap Admin</h3>
              <p className="text-sm max-w-xs">
                Selecione uma conversa para visualizar e gerenciar o atendimento
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Header do Chat */}
            <div className="px-4 py-3 border-b bg-card flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className={`h-10 w-10 ${getAvatarColor(selectedDisplayNumber)}`}>
                  {selectedConversation?.contactAvatar ? (
                    <img 
                      src={selectedConversation.contactAvatar} 
                      alt={selectedConversation.contactName || selectedDisplayNumber}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : null}
                  <AvatarFallback className={`${getAvatarColor(selectedDisplayNumber)} text-white font-semibold ${selectedConversation?.contactAvatar ? 'hidden' : ''}`}>
                    {selectedConversation?.contactName 
                      ? selectedConversation.contactName.charAt(0).toUpperCase() 
                      : selectedDisplayNumber.slice(-2)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">
                    {selectedConversation?.contactName || formatPhoneNumber(selectedDisplayNumber)}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {formatPhoneNumber(selectedDisplayNumber)}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Badge 
                  variant="outline"
                  className={`${
                    selectedConversation?.isAgentEnabled 
                      ? "border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50" 
                      : "border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/50"
                  }`}
                >
                  {selectedConversation?.isAgentEnabled ? (
                    <><Bot className="h-3 w-3 mr-1" /> IA Ativa</>
                  ) : (
                    <><User className="h-3 w-3 mr-1" /> Modo Manual</>
                  )}
                </Badge>
                
                <Button
                  variant={selectedConversation?.isAgentEnabled ? "outline" : "default"}
                  size="sm"
                  onClick={() => {
                    if (selectedConversation) {
                      toggleAgentMutation.mutate({
                        conversationId: selectedConversation.id,
                        pause: selectedConversation.isAgentEnabled,
                      });
                    }
                  }}
                  disabled={toggleAgentMutation.isPending}
                  className={!selectedConversation?.isAgentEnabled ? "bg-emerald-500 hover:bg-emerald-600" : ""}
                >
                  {toggleAgentMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : selectedConversation?.isAgentEnabled ? (
                    <>
                      <PauseCircle className="h-4 w-4 mr-2" />
                      Assumir
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-4 w-4 mr-2" />
                      Retomar IA
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Área de Mensagens */}
            <ScrollArea className="flex-1 p-4">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <MessageCircle className="h-8 w-8 mb-2 opacity-50" />
                  <p>Nenhuma mensagem ainda</p>
                </div>
              ) : (
                <div className="space-y-2 max-w-3xl mx-auto">
                  {messages.map((msg, index) => {
                    const showDate = index === 0 || 
                      format(new Date(msg.timestamp), 'yyyy-MM-dd') !== 
                      format(new Date(messages[index - 1].timestamp), 'yyyy-MM-dd');
                    
                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="flex justify-center my-4">
                            <Badge variant="secondary" className="bg-white/80 dark:bg-gray-800/80 shadow-sm">
                              {format(new Date(msg.timestamp), "d 'de' MMMM", { locale: ptBR })}
                            </Badge>
                          </div>
                        )}
                        <div className={`flex ${msg.fromMe ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[70%] rounded-lg px-3 py-2 shadow-sm relative ${
                              msg.fromMe
                                ? msg.isFromAgent
                                  ? "bg-blue-100 dark:bg-blue-900/50 rounded-tr-none"
                                  : "bg-emerald-100 dark:bg-emerald-900/50 rounded-tr-none"
                                : "bg-white dark:bg-gray-800 rounded-tl-none"
                            }`}
                          >
                            {msg.fromMe && msg.isFromAgent && (
                              <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 mb-1 font-medium">
                                <Bot className="h-3 w-3" />
                                Agente IA
                              </div>
                            )}
                            {msg.mediaType && msg.mediaUrl && msg.mediaType === "image" && (
                              <img 
                                src={msg.mediaUrl} 
                                alt="Mídia" 
                                className="max-w-full rounded mb-2"
                              />
                            )}
                            <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
                            <p className={`text-[10px] mt-1 text-right ${
                              msg.fromMe ? "text-gray-500" : "text-gray-400"
                            }`}>
                              {format(new Date(msg.timestamp), "HH:mm")}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Input de Mensagem */}
            <div className="p-3 border-t bg-card">
              {!selectedConversation?.isAgentEnabled && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 mb-2 flex items-center gap-2 text-sm">
                  <PauseCircle className="h-4 w-4 text-amber-600" />
                  <span className="text-amber-700 dark:text-amber-300">
                    Você assumiu esta conversa. Suas mensagens serão enviadas manualmente.
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Digite sua mensagem..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  disabled={sendMessageMutation.isPending}
                  className="flex-1"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || sendMessageMutation.isPending}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-6"
                >
                  {sendMessageMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
