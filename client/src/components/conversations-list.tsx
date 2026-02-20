import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, MessageCircle, Smartphone, X, Tags, Filter, CheckCheck, Circle, Mail, MailOpen, MessageSquarePlus, Archive, ArchiveRestore, Loader2, Bot } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Conversation } from "@shared/schema";
import { useState, useEffect } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { getAuthToken } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { TagBadges, ConversationTagsModal } from "./conversation-tags";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [avatarModalImage, setAvatarModalImage] = useState<string | null>(null);
  const [avatarModalName, setAvatarModalName] = useState<string>("");
  
  // Status filter: "all" | "unread" | "replied" | "unreplied"
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "replied" | "unreplied" | "archived">("all");
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set());
  const [bulkTagDialogOpen, setBulkTagDialogOpen] = useState(false);
  const [bulkSelectedTagIds, setBulkSelectedTagIds] = useState<Set<string>>(new Set());
  
  // New contact dialog
  const [newContactDialogOpen, setNewContactDialogOpen] = useState(false);
  const [newContactNumber, setNewContactNumber] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);
  
  // Tag filter states
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagModalConversationId, setTagModalConversationId] = useState<string>("");
  const [tagModalCurrentTags, setTagModalCurrentTags] = useState<Tag[]>([]);

  // Buscar conversas com tags
  const { data: conversationsWithTags = [], isLoading } = useQuery<ConversationWithTags[]>({
    queryKey: ["/api/conversations-with-tags", selectedTagFilter],
    queryFn: async () => {
      // Prioridade para token de membro
      const memberToken = localStorage.getItem("memberToken");
      const supabaseToken = await getAuthToken();
      const token = memberToken || supabaseToken;
      
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
            if (
              data.type === "new_message" ||
              data.type === "agent_response" ||
              data.type === "agent_auto_paused" ||
              data.type === "agent_auto_reactivated"
            ) {
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

  // Apply status filter
  const statusFilteredConversations = filteredConversations.filter((conv) => {
    if (statusFilter !== "archived" && conv.isArchived === true) {
      return false;
    }
    switch (statusFilter) {
      case "unread":
        // Não lidas: unreadCount > 0
        return (conv.unreadCount || 0) > 0;
      case "replied":
        // Respondidas: conversa já foi respondida alguma vez (hasReplied = true)
        return conv.hasReplied === true;
      case "unreplied":
        // Pendentes: conversa NUNCA foi respondida (hasReplied = false)
        return !conv.hasReplied;
      case "archived":
        return conv.isArchived === true;
      default:
        return true;
    }
  });

  const visibleConversationIds = statusFilteredConversations.map(conv => conv.id);
  const isAllVisibleSelected = visibleConversationIds.length > 0
    && visibleConversationIds.every(id => selectedConversationIds.has(id));
  const isSomeVisibleSelected = visibleConversationIds.some(id => selectedConversationIds.has(id));
  const selectedIds = Array.from(selectedConversationIds);

  const toggleConversationSelection = (conversationId: string, checked: boolean) => {
    setSelectedConversationIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(conversationId);
      } else {
        next.delete(conversationId);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedConversationIds(prev => {
      const next = new Set(prev);
      if (checked) {
        visibleConversationIds.forEach(id => next.add(id));
      } else {
        visibleConversationIds.forEach(id => next.delete(id));
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedConversationIds(new Set());
  };

  const bulkReadMutation = useMutation({
    mutationFn: async (conversationIds: string[]) => {
      const response = await apiRequest("POST", "/api/conversations/bulk/read", { conversationIds });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Conversas marcadas como lidas" });
      clearSelection();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao marcar como lidas",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkUnreadMutation = useMutation({
    mutationFn: async (conversationIds: string[]) => {
      const response = await apiRequest("POST", "/api/conversations/bulk/unread", { conversationIds });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Conversas marcadas como não lidas" });
      clearSelection();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao marcar como não lidas",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkArchiveMutation = useMutation({
    mutationFn: async ({ conversationIds, archived }: { conversationIds: string[]; archived: boolean }) => {
      const response = await apiRequest("POST", "/api/conversations/bulk/archive", {
        conversationIds,
        archived,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
      toast({ title: statusFilter === "archived" ? "Conversas desarquivadas" : "Conversas arquivadas" });
      clearSelection();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao arquivar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkTagMutation = useMutation({
    mutationFn: async ({ conversationIds, tagIds }: { conversationIds: string[]; tagIds: string[] }) => {
      const response = await apiRequest("POST", "/api/conversations/bulk/tags", {
        conversationIds,
        tagIds,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
      toast({ title: "Etiquetas aplicadas" });
      setBulkTagDialogOpen(false);
      setBulkSelectedTagIds(new Set());
      clearSelection();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao etiquetar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkEnableAIMutation = useMutation({
    mutationFn: async (conversationIds: string[]) => {
      const response = await apiRequest("POST", "/api/conversations/bulk/ai-enable", { conversationIds });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
      toast({ title: "IA ativada nas conversas selecionadas" });
      clearSelection();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao ativar IA",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkDisableAIMutation = useMutation({
    mutationFn: async (conversationIds: string[]) => {
      const response = await apiRequest("POST", "/api/conversations/bulk/ai-disable", { conversationIds });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
      toast({ title: "IA desativada nas conversas selecionadas" });
      clearSelection();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao desativar IA",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle creating new contact
  const handleCreateNewContact = async () => {
    if (!newContactNumber.trim()) {
      toast({
        title: "Número obrigatório",
        description: "Digite o número do contato",
        variant: "destructive",
      });
      return;
    }

    setCreatingContact(true);
    try {
      const response = await apiRequest("POST", "/api/conversations/new-contact", {
        phoneNumber: newContactNumber.replace(/\D/g, ""),
        contactName: newContactName.trim() || undefined,
      });
      
      const data = await response.json();
      
      if (data.conversationId) {
        toast({ title: "Conversa criada!" });
        queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
        onSelectConversation(data.conversationId);
        setNewContactDialogOpen(false);
        setNewContactNumber("");
        setNewContactName("");
      }
    } catch (error: any) {
      toast({
        title: "Erro ao criar conversa",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCreatingContact(false);
    }
  };

  const openTagModal = (conv: ConversationWithTags, e: React.MouseEvent) => {
    e.stopPropagation();
    setTagModalConversationId(conv.id);
    setTagModalCurrentTags(conv.tags || []);
    setTagModalOpen(true);
  };

  const handleTagsUpdated = (updatedTags: Tag[]) => {
    queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
  };

  useEffect(() => {
    if (bulkTagDialogOpen) {
      setBulkSelectedTagIds(new Set());
    }
  }, [bulkTagDialogOpen]);

  const toggleBulkTag = (tagId: string) => {
    setBulkSelectedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  };

  const handleBulkTagSave = () => {
    const tagIds = Array.from(bulkSelectedTagIds);
    if (selectedIds.length === 0) {
      toast({
        title: "Nenhuma conversa selecionada",
        variant: "destructive",
      });
      return;
    }
    if (tagIds.length === 0) {
      toast({
        title: "Selecione pelo menos uma etiqueta",
        variant: "destructive",
      });
      return;
    }

    bulkTagMutation.mutate({ conversationIds: selectedIds, tagIds });
  };

  const activeFilterTag = availableTags.find(t => t.id === selectedTagFilter);
  const archiveActionLabel = statusFilter === "archived" ? "Desarquivar" : "Arquivar";
  const ArchiveActionIcon = statusFilter === "archived" ? ArchiveRestore : Archive;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 md:p-4 border-b space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {statusFilteredConversations.length > 0 && (
              <Checkbox
                checked={isAllVisibleSelected ? true : isSomeVisibleSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
                aria-label="Selecionar todas as conversas visíveis"
                className="data-[state=checked]:bg-primary"
              />
            )}
            <h2 className="font-semibold text-lg">Conversas</h2>
          </div>
          <div className="flex items-center gap-2">
            {/* Botão novo contato */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setNewContactDialogOpen(true)}
              title="Nova conversa"
            >
              <MessageSquarePlus className="w-4 h-4" />
            </Button>
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
        </div>
        
        {/* Filtros de status estilo WhatsApp */}
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)} className="w-full">
          <TabsList className="w-full grid grid-cols-5 h-8">
            <TabsTrigger value="all" className="text-xs px-2 py-1">
              Todas
            </TabsTrigger>
            <TabsTrigger value="unread" className="text-xs px-2 py-1">
              <Circle className="w-3 h-3 mr-1 fill-green-500 text-green-500" />
              Não lidas
            </TabsTrigger>
            <TabsTrigger value="replied" className="text-xs px-2 py-1">
              <CheckCheck className="w-3 h-3 mr-1 text-blue-500" />
              Respondidas
            </TabsTrigger>
            <TabsTrigger value="unreplied" className="text-xs px-2 py-1">
              <Mail className="w-3 h-3 mr-1" />
              Pendentes
            </TabsTrigger>
            <TabsTrigger value="archived" className="text-xs px-2 py-1">
              <Archive className="w-3 h-3 mr-1" />
              Arquivadas
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
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

        {selectedConversationIds.size > 0 && (
          <div className="rounded-md border bg-muted/40 px-2 py-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {selectedConversationIds.size} selecionada(s)
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={clearSelection}
                title="Limpar seleção"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 flex-shrink-0"
                onClick={() => bulkArchiveMutation.mutate({
                  conversationIds: selectedIds,
                  archived: statusFilter !== "archived",
                })}
                disabled={bulkArchiveMutation.isPending}
                title={archiveActionLabel}
              >
                {bulkArchiveMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ArchiveActionIcon className="w-3 h-3" />
                )}
                <span className="text-xs ml-1 hidden sm:inline">{archiveActionLabel}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 flex-shrink-0"
                onClick={() => bulkReadMutation.mutate(selectedIds)}
                disabled={bulkReadMutation.isPending}
                title="Marcar como lidas"
              >
                {bulkReadMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <MailOpen className="w-3 h-3" />
                )}
                <span className="text-xs ml-1 hidden sm:inline">Lidas</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 flex-shrink-0"
                onClick={() => bulkUnreadMutation.mutate(selectedIds)}
                disabled={bulkUnreadMutation.isPending}
                title="Marcar como não lidas"
              >
                {bulkUnreadMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Mail className="w-3 h-3" />
                )}
                <span className="text-xs ml-1 hidden sm:inline">Não lidas</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 flex-shrink-0"
                onClick={() => setBulkTagDialogOpen(true)}
                title="Etiquetar conversas"
              >
                <Tags className="w-3 h-3" />
                <span className="text-xs ml-1 hidden sm:inline">Etiquetar</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 flex-shrink-0 bg-green-50 hover:bg-green-100 border-green-200"
                onClick={() => bulkEnableAIMutation.mutate(selectedIds)}
                disabled={bulkEnableAIMutation.isPending}
                title="Ativar IA para todas selecionadas"
              >
                {bulkEnableAIMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin text-green-600" />
                ) : (
                  <Bot className="w-3 h-3 text-green-600" />
                )}
                <span className="text-xs ml-1 text-green-700 hidden sm:inline">Ativar IA</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 flex-shrink-0 bg-amber-50 hover:bg-amber-100 border-amber-200"
                onClick={() => bulkDisableAIMutation.mutate(selectedIds)}
                disabled={bulkDisableAIMutation.isPending}
                title="Desativar IA para todas selecionadas"
              >
                {bulkDisableAIMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
                ) : (
                  <Bot className="w-3 h-3 text-amber-600" />
                )}
                <span className="text-xs ml-1 text-amber-700 hidden sm:inline">Desativar IA</span>
              </Button>
            </div>
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
              onClick={() => setLocation("/conexao")}
              data-testid="button-minimal-connect-whatsapp-list"
            >
              Conectar WhatsApp
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : statusFilteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <MessageCircle className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="font-medium text-sm mb-2">
              {searchQuery || selectedTagFilter || statusFilter !== "all" ? "Nenhuma conversa encontrada" : "Nenhuma conversa"}
            </h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              {searchQuery 
                ? "Tente buscar por outro termo"
                : selectedTagFilter 
                  ? "Nenhuma conversa com esta etiqueta"
                  : statusFilter !== "all"
                    ? `Nenhuma conversa ${statusFilter === "unread" ? "não lida" : statusFilter === "replied" ? "respondida" : statusFilter === "unreplied" ? "pendente" : "arquivada"}`
                    : "As conversas aparecerão aqui quando você receber mensagens"}
            </p>
            {(selectedTagFilter || statusFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setSelectedTagFilter(null);
                  setStatusFilter("all");
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y" data-testid="list-conversations">
            {statusFilteredConversations.map((conversation) => {
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
                    <div
                      className="pt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selectedConversationIds.has(conversation.id)}
                        onCheckedChange={(checked) => toggleConversationSelection(conversation.id, checked === true)}
                        aria-label={`Selecionar ${conversation.contactName || displayNumber}`}
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>
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
      
      {/* Modal de etiquetas em massa */}
      <Dialog open={bulkTagDialogOpen} onOpenChange={setBulkTagDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tags className="w-5 h-5" />
              Etiquetar Conversas
            </DialogTitle>
            <DialogDescription>
              Aplique etiquetas às conversas selecionadas
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[300px] pr-3">
            {availableTags.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Tags className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhuma etiqueta criada</p>
              </div>
            ) : (
              <div className="space-y-2">
                {availableTags.map(tag => (
                  <label
                    key={tag.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      bulkSelectedTagIds.has(tag.id)
                        ? "bg-accent border-primary"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    <Checkbox
                      checked={bulkSelectedTagIds.has(tag.id)}
                      onCheckedChange={() => toggleBulkTag(tag.id)}
                      className="data-[state=checked]:bg-primary"
                    />
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="font-medium flex-1">{tag.name}</span>
                    <Badge
                      style={{
                        backgroundColor: `${tag.color}20`,
                        color: tag.color,
                        borderColor: tag.color,
                      }}
                      variant="outline"
                      className="text-xs"
                    >
                      {tag.name}
                    </Badge>
                  </label>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkTagDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleBulkTagSave} disabled={bulkTagMutation.isPending}>
              {bulkTagMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
      
      {/* Dialog de novo contato */}
      <Dialog open={newContactDialogOpen} onOpenChange={setNewContactDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="h-5 w-5" />
              Nova Conversa
            </DialogTitle>
            <DialogDescription>
              Inicie uma conversa com um novo contato
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newContactNumber">Número do WhatsApp *</Label>
              <Input
                id="newContactNumber"
                placeholder="5511999999999"
                value={newContactNumber}
                onChange={(e) => setNewContactNumber(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Digite com código do país (ex: 55 para Brasil)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newContactName">Nome (opcional)</Label>
              <Input
                id="newContactName"
                placeholder="Nome do contato"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNewContactDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateNewContact}
              disabled={creatingContact || !newContactNumber.trim()}
            >
              {creatingContact ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Criando...
                </>
              ) : (
                "Iniciar Conversa"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
