import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
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
  PlayCircle 
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
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

// Função para extrair número do telefone de forma consistente (mesma lógica de /conversas)
function getDisplayNumber(conv: AdminConversation): string {
  // Prioridade: contactNumber > remoteJid (extraindo apenas a parte do número)
  if (conv.contactNumber) {
    return conv.contactNumber;
  }
  if (conv.remoteJid) {
    // Formato: 5517991234567@s.whatsapp.net ou 5517991234567:12@s.whatsapp.net
    return conv.remoteJid.split("@")[0].split(":")[0];
  }
  return "?";
}

// Função para formatar número para exibição
function formatPhoneNumber(number: string): string {
  // Remove tudo que não é dígito
  const digits = number.replace(/\D/g, "");
  
  // Formato brasileiro: +55 (17) 99123-4567
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  
  return number;
}

export default function AdminConversations() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");

  // Buscar lista de conversas
  const { data: conversations = [], isLoading: loadingConversations, refetch: refetchConversations } = useQuery<AdminConversation[]>({
    queryKey: ["/api/admin/conversations"],
    refetchInterval: 5000, // Atualizar a cada 5 segundos
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
        title: pause ? "Agente Pausado" : "Agente Retomado",
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

  const handleSendMessage = () => {
    if (!selectedConversationId || !newMessage.trim()) return;
    sendMessageMutation.mutate({
      conversationId: selectedConversationId,
      message: newMessage.trim(),
    });
  };

  // Filtrar conversas por busca (usando mesma lógica de /conversas)
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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Conversas do WhatsApp Admin
              </CardTitle>
              <CardDescription>
                Visualize todas as conversas, pause o agente IA e responda manualmente quando necessário.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchConversations()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[600px]">
            {/* Lista de Conversas */}
            <div className="border rounded-lg flex flex-col">
              <div className="p-3 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar conversa..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <ScrollArea className="flex-1">
                {loadingConversations ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <MessageCircle className="h-8 w-8 mb-2" />
                    <p>Nenhuma conversa encontrada</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredConversations.map((conv) => {
                      const displayNumber = getDisplayNumber(conv);
                      return (
                      <div
                        key={conv.id}
                        onClick={() => setSelectedConversationId(conv.id)}
                        className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                          selectedConversationId === conv.id ? "bg-muted" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <Avatar className="h-10 w-10">
                            {conv.contactAvatar ? (
                              <img 
                                src={conv.contactAvatar} 
                                alt={conv.contactName || displayNumber}
                                className="w-full h-full object-cover rounded-full"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : null}
                            <AvatarFallback className={conv.contactAvatar ? 'hidden' : ''}>
                              {conv.contactName 
                                ? conv.contactName.charAt(0).toUpperCase() 
                                : displayNumber.slice(-2)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="font-medium truncate">
                                {conv.contactName || formatPhoneNumber(displayNumber)}
                              </p>
                              {conv.unreadCount > 0 && (
                                <Badge variant="default" className="ml-2">
                                  {conv.unreadCount}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">
                              {conv.lastMessageText || "Sem mensagens"}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {conv.lastMessageTime && (
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(conv.lastMessageTime), {
                                    addSuffix: true,
                                    locale: ptBR,
                                  })}
                                </span>
                              )}
                              <Badge 
                                variant={conv.isAgentEnabled ? "secondary" : "outline"}
                                className="text-xs"
                              >
                                {conv.isAgentEnabled ? (
                                  <><Bot className="h-3 w-3 mr-1" /> IA</>
                                ) : (
                                  <><User className="h-3 w-3 mr-1" /> Manual</>
                                )}
                              </Badge>
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

            {/* Área de Mensagens */}
            <div className="md:col-span-2 border rounded-lg flex flex-col">
              {!selectedConversationId ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                  <MessageCircle className="h-12 w-12 mb-4" />
                  <p>Selecione uma conversa para visualizar</p>
                </div>
              ) : (
                <>
                  {/* Header da conversa */}
                  <div className="p-3 border-b flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        {selectedConversation?.contactAvatar ? (
                          <img 
                            src={selectedConversation.contactAvatar} 
                            alt={selectedConversation.contactName || selectedDisplayNumber}
                            className="w-full h-full object-cover rounded-full"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : null}
                        <AvatarFallback className={selectedConversation?.contactAvatar ? 'hidden' : ''}>
                          {selectedConversation?.contactName 
                            ? selectedConversation.contactName.charAt(0).toUpperCase() 
                            : selectedDisplayNumber.slice(-2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {selectedConversation?.contactName || formatPhoneNumber(selectedDisplayNumber)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatPhoneNumber(selectedDisplayNumber)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={selectedConversation?.isAgentEnabled ? "secondary" : "outline"}
                      >
                        {selectedConversation?.isAgentEnabled ? "IA Ativa" : "Modo Manual"}
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
                      >
                        {toggleAgentMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : selectedConversation?.isAgentEnabled ? (
                          <>
                            <PauseCircle className="h-4 w-4 mr-2" />
                            Pausar IA
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

                  {/* Mensagens */}
                  <ScrollArea className="flex-1 p-4">
                    {loadingMessages ? (
                      <div className="flex items-center justify-center h-32">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                        <MessageCircle className="h-8 w-8 mb-2" />
                        <p>Nenhuma mensagem ainda</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.fromMe ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[70%] rounded-lg p-3 ${
                                msg.fromMe
                                  ? msg.isFromAgent
                                    ? "bg-blue-500/20 text-foreground"
                                    : "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              }`}
                            >
                              {msg.fromMe && msg.isFromAgent && (
                                <div className="flex items-center gap-1 text-xs text-blue-500 mb-1">
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
                              <p className="whitespace-pre-wrap">{msg.text}</p>
                              <p className="text-xs opacity-70 mt-1 text-right">
                                {new Date(msg.timestamp).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>

                  {/* Input de mensagem */}
                  <div className="p-3 border-t">
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
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim() || sendMessageMutation.isPending}
                      >
                        {sendMessageMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {!selectedConversation?.isAgentEnabled && (
                      <p className="text-xs text-amber-600 mt-2">
                        ⚠️ O agente IA está pausado para esta conversa. Suas mensagens serão enviadas manualmente.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
