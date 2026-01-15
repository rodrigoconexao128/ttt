import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, MessageCircle, Smartphone, X, Tags, Filter } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Conversation } from "@shared/schema";
import { useState, useEffect } from "react";
import { queryClient } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { TagBadges, ConversationTagsModal } from "./conversation-tags";

// Tag interface
interface Tag {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
  isDefault: boolean;
  position: number;
}

// Conversation with tags
interface ConversationWithTags extends Conversation {
  tags?: Tag[];
}

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
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [avatarModalImage, setAvatarModalImage] = useState<string | null>(null);
  const [avatarModalName, setAvatarModalName] = useState<string>("");
  
  // Tag filter states
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagModalConversationId, setTagModalConversationId] = useState<string>("");
  const [tagModalCurrentTags, setTagModalCurrentTags] = useState<Tag[]>([]);

  // Buscar conversas com tags
  const { data: conversationsWithTags = [], isLoading } = useQuery<ConversationWithTags[]>({
    queryKey: ["/api/conversations-with-tags", selectedTagFilter],
    queryFn: async () => {
      const token = await getAuthToken();
      const url = selectedTagFilter 
        ? `/api/conversations-with-tags?tagId=${selectedTagFilter}`
        : "/api/conversations-with-tags";
      const response = await fetch(url, {
        credentials: "include",
        headers: {
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch conversations");
      return response.json();
    },
    enabled: !!connectionId,
    refetchInterval: 30000, // Fallback polling - WebSocket é primário (economia de egress)
    staleTime: 5000, // Considera dados frescos por 5s
  });
  
  // Buscar tags disponíveis para filtro
  const { data: availableTags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
    enabled: !!connectionId,
  });

  // WebSocket para atualização em tempo real
  useEffect(() => {
    if (!connectionId) return;

    let websocket: WebSocket | null = null;
    let cancelled = false;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

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
              queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
            }
          } catch (error) {
            console.error("Erro ao processar mensagem WebSocket:", error);
          }
        };

        websocket.onerror = (error) => {
          console.error("Erro no WebSocket:", error);
        };

        websocket.onclose = () => {
          console.log("WebSocket desconectado, reconectando em 3s...");
          // Reconexão automática em 3 segundos
          if (!cancelled) {
            reconnectTimeout = setTimeout(connectWebSocket, 3000);
          }
        };

        setWs(websocket);
      } catch (error) {
        console.error("Erro ao conectar WebSocket de conversas:", error);
        // Tentar reconectar em caso de erro
        if (!cancelled) {
          reconnectTimeout = setTimeout(connectWebSocket, 3000);
        }
      }
    };

    connectWebSocket();

    return () => {
      cancelled = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (websocket) {
        websocket.close();
      }
    };
  }, [connectionId]);

  // Filtrar conversas de grupos e status no frontend (camada extra de segurança)
  const individualConversations = conversationsWithTags.filter((conv) => {
    const number = conv.contactNumber;
    if (number.length < 10 || number.length > 15) return false;
    if (number.startsWith("120") || number.startsWith("status")) return false;
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

  const openTagModal = (conv: ConversationWithTags, e: React.MouseEvent) => {
    e.stopPropagation();
    setTagModalConversationId(conv.id);
    setTagModalCurrentTags(conv.tags || []);
    setTagModalOpen(true);
  };

  const handleTagsUpdated = (updatedTags: Tag[]) => {
    queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
  };

  const activeFilterTag = availableTags.find(t => t.id === selectedTagFilter);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 md:p-4 border-b space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Conversas</h2>
          {/* Dropdown de filtro por tag */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant={selectedTagFilter ? "default" : "ghost"} 
                size="icon" 
                className="h-8 w-8"
                style={activeFilterTag ? {
                  backgroundColor: activeFilterTag.color,
                  borderColor: activeFilterTag.color,
                } : undefined}
              >
                <Filter className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Filtrar por Etiqueta</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={selectedTagFilter === null}
                onCheckedChange={() => setSelectedTagFilter(null)}
              >
                <span className="font-medium">Todas as conversas</span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {availableTags.map(tag => (
                <DropdownMenuCheckboxItem
                  key={tag.id}
                  checked={selectedTagFilter === tag.id}
                  onCheckedChange={() => setSelectedTagFilter(
                    selectedTagFilter === tag.id ? null : tag.id
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span>{tag.name}</span>
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            style={{ fontSize: '16px' }}
            data-testid="input-search-conversations"
          />
        </div>
        
        {/* Indicador de filtro ativo */}
        {selectedTagFilter && activeFilterTag && (
          <div className="flex items-center gap-2">
            <Badge
              style={{ 
                backgroundColor: `${activeFilterTag.color}20`,
                color: activeFilterTag.color,
                borderColor: activeFilterTag.color
              }}
              variant="outline"
              className="cursor-pointer"
              onClick={() => setSelectedTagFilter(null)}
            >
              <Tags className="w-3 h-3 mr-1" />
              {activeFilterTag.name}
              <X className="w-3 h-3 ml-1" />
            </Badge>
            <span className="text-xs text-muted-foreground">
              Filtro ativo
            </span>
          </div>
        )}
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
              {searchQuery || selectedTagFilter ? "Nenhuma conversa encontrada" : "Nenhuma conversa"}
            </h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              {searchQuery 
                ? "Tente buscar por outro termo"
                : selectedTagFilter 
                  ? "Nenhuma conversa com esta etiqueta"
                  : "As conversas aparecerão aqui quando você receber mensagens"}
            </p>
            {selectedTagFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setSelectedTagFilter(null)}
              >
                Limpar filtro
              </Button>
            )}
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
                  className={`w-full p-3 md:p-4 text-left hover-elevate active-elevate-2 transition-colors touch-manipulation ${
                    selectedConversationId === conversation.id
                      ? "bg-sidebar-accent"
                      : ""
                  }`}
                  data-testid={`conversation-item-${conversation.id}`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="w-11 h-11 md:w-12 md:h-12 flex-shrink-0">
                      {conversation.contactAvatar ? (
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
                          {conversation.contactName || displayNumber}
                        </h3>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {conversation.lastMessageTime && (
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(
                                new Date(conversation.lastMessageTime),
                                { addSuffix: true, locale: ptBR }
                              )}
                            </span>
                          )}
                          {/* Botão de tag - usando div para evitar button aninhado */}
                          <div
                            role="button"
                            tabIndex={0}
                            className="h-6 w-6 opacity-60 hover:opacity-100 flex items-center justify-center rounded-md hover:bg-accent cursor-pointer"
                            onClick={(e) => openTagModal(conversation, e)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openTagModal(conversation, e);
                              }
                            }}
                          >
                            <Tags className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </div>
                      
                      {/* Tags da conversa */}
                      {conversation.tags && conversation.tags.length > 0 && (
                        <div className="mb-1">
                          <TagBadges tags={conversation.tags} maxVisible={3} size="sm" />
                        </div>
                      )}
                      
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
      
      {/* Modal de foto ampliada */}
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
      
      {/* Modal de tags da conversa */}
      <ConversationTagsModal
        open={tagModalOpen}
        onOpenChange={setTagModalOpen}
        conversationId={tagModalConversationId}
        currentTags={tagModalCurrentTags}
        onTagsUpdated={handleTagsUpdated}
      />
    </div>
  );
}
