import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, MessageCircle, Smartphone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Conversation } from "@shared/schema";
import { useState, useEffect } from "react";
import { queryClient } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/supabase";

interface ConversationsListProps {
  connectionId?: string;
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
}

export function ConversationsList({
  connectionId,
  selectedConversationId,
  onSelectConversation,
}: ConversationsListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [ws, setWs] = useState<WebSocket | null>(null);

  const { data: conversations = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    enabled: !!connectionId,
    refetchInterval: 5000, // Refetch a cada 5 segundos como fallback
  });

  // WebSocket para atualização em tempo real
  useEffect(() => {
    if (!connectionId) return;

    let websocket: WebSocket | null = null;
    let cancelled = false;

    const connectWebSocket = async () => {
      try {
        const token = await getAuthToken();

        if (!token) {
          console.error("Sem token de autenticação para WebSocket de conversas");
          return;
        }

        if (cancelled) return;

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(
          token,
        )}`;

        websocket = new WebSocket(wsUrl);

        websocket.onopen = () => {
          console.log("WebSocket conectado para conversas");
        };

        websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("WebSocket message:", data);

            // Atualizar lista de conversas quando receber nova mensagem
            if (data.type === "new_message" || data.type === "agent_response") {
              queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
            }
          } catch (error) {
            console.error("Erro ao processar mensagem WebSocket:", error);
          }
        };

        websocket.onerror = (error) => {
          console.error("Erro no WebSocket:", error);
        };

        websocket.onclose = () => {
          console.log("WebSocket desconectado");
        };

        setWs(websocket);
      } catch (error) {
        console.error("Erro ao conectar WebSocket de conversas:", error);
      }
    };

    connectWebSocket();

    return () => {
      cancelled = true;
      if (websocket) {
        websocket.close();
      }
    };
  }, [connectionId]);

  // Filtrar conversas de grupos e status no frontend (camada extra de segurança)
  const individualConversations = conversations.filter((conv) => {
    // Ignorar conversas que parecem ser de grupos ou status
    // Grupos geralmente têm contactNumber muito longo ou com padrões específicos
    const number = conv.contactNumber;

    // Filtro básico: número deve ter entre 10-15 dígitos (típico de números de telefone)
    if (number.length < 10 || number.length > 15) {
      return false;
    }

    // Filtro adicional: evitar números que começam com padrões de grupo/broadcast
    if (number.startsWith("120") || number.startsWith("status")) {
      return false;
    }

    return true;
  });

  const filteredConversations = individualConversations.filter((conv) => {
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

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b space-y-4 flex-shrink-0">
        <h2 className="font-semibold text-lg">Conversas</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-conversations"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {!connectionId ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <Smartphone className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="font-medium text-sm mb-2">WhatsApp não conectado</h3>
            <p className="text-xs text-muted-foreground max-w-xs mb-3">
              Conecte seu WhatsApp para começar a receber conversas.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const el = document.querySelector(
                  '[data-testid="button-nav-connection"]',
                ) as HTMLButtonElement;
                el?.click();
              }}
              data-testid="button-minimal-connect-whatsapp-list"
            >
              Conectar WhatsApp
            </Button>
          </div>
        ) : isLoading ? (
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
                : "As conversas aparecerão aqui quando você receber mensagens"}
            </p>
          </div>
      ) : (
        <div className="divide-y" data-testid="list-conversations">
            {filteredConversations.map((conversation) => {
              const displayNumber =
                conversation.contactNumber ||
                (conversation.remoteJid || "").split("@")[0].split(":")[0] ||
                "?";

              return (
              <button
                key={conversation.id}
                onClick={() => onSelectConversation(conversation.id)}
                className={`w-full p-4 text-left hover-elevate active-elevate-2 transition-colors ${
                  selectedConversationId === conversation.id
                    ? "bg-sidebar-accent"
                    : ""
                }`}
                data-testid={`conversation-item-${conversation.id}`}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="w-12 h-12 flex-shrink-0">
                    {conversation.contactAvatar ? (
                      <img 
                        src={conversation.contactAvatar} 
                        alt={conversation.contactName || displayNumber}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Fallback para inicial se imagem falhar
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
                        : displayNumber.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3 className="font-semibold text-sm truncate">
                        {conversation.contactName ||
                          displayNumber}
                      </h3>
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
                          data-testid={`badge-unread-${conversation.id}`}
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
  );
}
