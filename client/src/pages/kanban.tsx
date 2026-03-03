/**
 * 🎯 KANBAN CRM - Interface Minimalista e Focada em Conversão
 * 
 * Design Principles Applied:
 * - Eye-tracking: F-pattern layout, visual hierarchy
 * - Minimal: Only essential info on cards
 * - Conversion-focused: Clear stage progression
 * - Drag & Drop: Intuitive movement between stages
 */

import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ContextualHelpButton } from "@/components/contextual-help-button";
import { 
  Plus, 
  Search, 
  MoreHorizontal, 
  MessageSquare, 
  Clock, 
  Phone,
  User,
  Edit2,
  Trash2,
  GripVertical,
  X,
  Check,
  ChevronRight,
  AlertCircle,
  Sparkles,
  Settings2,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

// Types
interface KanbanStage {
  id: string;
  user_id: string;
  name: string;
  description: string;
  color: string;
  position: number;
  is_default: boolean;
}

interface Conversation {
  id: string;
  contact_name: string | null;
  contact_number: string;
  contact_avatar: string | null;
  last_message_text: string | null;
  last_message_time: string | null;
  unread_count: number;
  kanban_stage_id: string | null;
  kanban_notes: string | null;
  priority: string | null;
}

// Priority Config
const priorities = {
  low: { label: "Baixa", color: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  normal: { label: "Normal", color: "bg-blue-100 text-blue-600", dot: "bg-blue-400" },
  high: { label: "Alta", color: "bg-amber-100 text-amber-600", dot: "bg-amber-400" },
  urgent: { label: "Urgente", color: "bg-red-100 text-red-600", dot: "bg-red-500" },
};

// Stage Colors
const stageColors = [
  { value: "bg-blue-500", label: "Azul" },
  { value: "bg-purple-500", label: "Roxo" },
  { value: "bg-emerald-500", label: "Verde" },
  { value: "bg-amber-500", label: "Amarelo" },
  { value: "bg-red-500", label: "Vermelho" },
  { value: "bg-pink-500", label: "Rosa" },
  { value: "bg-cyan-500", label: "Ciano" },
  { value: "bg-slate-400", label: "Cinza" },
];

// Time helpers
function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return "agora";
  if (diffMins < 60) return `${diffMins}min`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function formatPhoneDisplay(phone: string): string {
  const clean = phone.replace(/\D/g, "");
  if (clean.length >= 12) {
    return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  }
  return phone;
}

// ============ CONTACT CARD COMPONENT ============
interface ContactCardProps {
  conversation: Conversation;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onEdit: (conversation: Conversation) => void;
  onOpenChat: (conversationId: string) => void;
}

function ContactCard({ conversation, onDragStart, onEdit, onOpenChat }: ContactCardProps) {
  const displayName = conversation.contact_name || formatPhoneDisplay(conversation.contact_number);
  const initials = (conversation.contact_name || "?").slice(0, 2).toUpperCase();
  const priority = conversation.priority as keyof typeof priorities || "normal";
  const priorityConfig = priorities[priority];
  
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, conversation.id)}
      className="group relative bg-white rounded-xl border border-slate-200 p-4 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200"
    >
      {/* Drag Handle - Visible on hover */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity">
        <GripVertical className="w-4 h-4 text-slate-400" />
      </div>
      
      {/* Priority Indicator */}
      <div className={cn("absolute top-3 right-3 w-2 h-2 rounded-full", priorityConfig.dot)} />
      
      {/* Main Content */}
      <div className="flex items-start gap-3">
        <Avatar className="w-10 h-10 flex-shrink-0">
          <AvatarImage src={conversation.contact_avatar || undefined} />
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-sm font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          {/* Name & Time */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <h4 className="font-semibold text-slate-800 truncate text-sm">
              {displayName}
            </h4>
            {conversation.last_message_time && (
              <span className="text-xs text-slate-400 flex-shrink-0">
                {formatTimeAgo(conversation.last_message_time)}
              </span>
            )}
          </div>
          
          {/* Last Message Preview */}
          {conversation.last_message_text && (
            <p className="text-xs text-slate-500 truncate leading-relaxed">
              {conversation.last_message_text}
            </p>
          )}
          
          {/* Notes Preview */}
          {conversation.kanban_notes && (
            <p className="text-xs text-purple-600 mt-1 truncate flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {conversation.kanban_notes}
            </p>
          )}
        </div>
      </div>

      {/* Actions - Visible on hover */}
      <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 rounded-lg hover:bg-blue-50"
          onClick={(e) => {
            e.stopPropagation();
            onOpenChat(conversation.id);
          }}
        >
          <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 rounded-lg hover:bg-slate-100"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(conversation);
          }}
        >
          <Edit2 className="w-3.5 h-3.5 text-slate-500" />
        </Button>
      </div>
      
      {/* Unread Badge */}
      {conversation.unread_count > 0 && (
        <Badge className="absolute -top-2 -right-2 bg-red-500 text-white text-xs h-5 min-w-5 flex items-center justify-center px-1.5">
          {conversation.unread_count > 9 ? "9+" : conversation.unread_count}
        </Badge>
      )}
    </div>
  );
}

// ============ STAGE COLUMN COMPONENT ============
interface StageColumnProps {
  stage: KanbanStage;
  conversations: Conversation[];
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, stageId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onEditStage: (stage: KanbanStage) => void;
  onDeleteStage: (stageId: string) => void;
  onEditContact: (conversation: Conversation) => void;
  onOpenChat: (conversationId: string) => void;
  isDragOver: boolean;
}

function StageColumn({
  stage,
  conversations,
  onDragStart,
  onDrop,
  onDragOver,
  onEditStage,
  onDeleteStage,
  onEditContact,
  onOpenChat,
  isDragOver,
}: StageColumnProps) {
  return (
    <div
      className={cn(
        "flex flex-col bg-slate-50/80 rounded-2xl w-[300px] flex-shrink-0 transition-all duration-200",
        isDragOver && "ring-2 ring-blue-400 ring-offset-2 bg-blue-50/50"
      )}
      onDrop={(e) => onDrop(e, stage.id)}
      onDragOver={onDragOver}
    >
      {/* Column Header */}
      <div className="p-4 border-b border-slate-200/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("w-3 h-3 rounded-full", stage.color)} />
            <div>
              <h3 className="font-semibold text-slate-800">{stage.name}</h3>
              {stage.description && (
                <p className="text-xs text-slate-500 mt-0.5">{stage.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-white text-slate-600 font-medium">
              {conversations.length}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <MoreHorizontal className="w-4 h-4 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => onEditStage(stage)}>
                  <Edit2 className="w-4 h-4 mr-2" />
                  Editar
                </DropdownMenuItem>
                {!stage.is_default && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="text-red-600"
                      onClick={() => onDeleteStage(stage.id)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Excluir
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Cards Container */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-280px)] min-h-[200px]">
        {conversations.map((conv) => (
          <ContactCard
            key={conv.id}
            conversation={conv}
            onDragStart={onDragStart}
            onEdit={onEditContact}
            onOpenChat={onOpenChat}
          />
        ))}
        
        {conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <User className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">Nenhum contato</p>
            <p className="text-xs">Arraste para cá</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ MAIN KANBAN PAGE ============
export default function KanbanPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  
  // State
  const [search, setSearch] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState<Conversation | null>(null);
  const [editingStage, setEditingStage] = useState<KanbanStage | null>(null);
  const [isAddingStage, setIsAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("bg-blue-500");

  // Fetch stages
  const { data: stages = [], isLoading: stagesLoading } = useQuery<KanbanStage[]>({
    queryKey: ["/api/kanban/stages"],
  });

  // Fetch conversations
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/kanban/conversations"],
  });

  // Move conversation mutation
  const moveConversation = useMutation({
    mutationFn: async ({ id, stageId }: { id: string; stageId: string | null }) => {
      return apiRequest("PUT", `/api/kanban/conversations/${id}/move`, { stageId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kanban/conversations"] });
    },
    onError: () => {
      toast({ title: "Erro ao mover contato", variant: "destructive" });
    },
  });

  // Update conversation mutation
  const updateConversation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Conversation> }) => {
      return apiRequest("PUT", `/api/kanban/conversations/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kanban/conversations"] });
      setEditingContact(null);
      toast({ title: "Contato atualizado!" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar contato", variant: "destructive" });
    },
  });

  // Create stage mutation
  const createStage = useMutation({
    mutationFn: async (data: { name: string; color: string; description?: string }) => {
      return apiRequest("POST", "/api/kanban/stages", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kanban/stages"] });
      setIsAddingStage(false);
      setNewStageName("");
      toast({ title: "Etapa criada!" });
    },
    onError: () => {
      toast({ title: "Erro ao criar etapa", variant: "destructive" });
    },
  });

  // Update stage mutation
  const updateStage = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<KanbanStage> }) => {
      return apiRequest("PUT", `/api/kanban/stages/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kanban/stages"] });
      setEditingStage(null);
      toast({ title: "Etapa atualizada!" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar etapa", variant: "destructive" });
    },
  });

  // Delete stage mutation
  const deleteStage = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/kanban/stages/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kanban/stages"] });
      toast({ title: "Etapa excluída!" });
    },
    onError: () => {
      toast({ title: "Erro ao excluir etapa", variant: "destructive" });
    },
  });

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    if (draggedId) {
      moveConversation.mutate({ id: draggedId, stageId });
    }
    setDraggedId(null);
    setDragOverStageId(null);
  };

  const handleDragEnter = (stageId: string) => {
    setDragOverStageId(stageId);
  };

  const handleDragLeave = () => {
    setDragOverStageId(null);
  };

  // Filter conversations by search
  const filteredConversations = conversations.filter((conv) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      conv.contact_name?.toLowerCase().includes(term) ||
      conv.contact_number.includes(term) ||
      conv.last_message_text?.toLowerCase().includes(term)
    );
  });

  // Get conversations by stage
  const getConversationsByStage = (stageId: string) => {
    return filteredConversations.filter((conv) => conv.kanban_stage_id === stageId);
  };

  // Unassigned conversations
  const unassignedConversations = filteredConversations.filter(
    (conv) => !conv.kanban_stage_id || !stages.find((s) => s.id === conv.kanban_stage_id)
  );

  const openChat = (conversationId: string) => {
    setLocation(`/conversas?id=${conversationId}`);
  };

  const isLoading = stagesLoading || conversationsLoading;

  return (
    <div className="flex-1 flex flex-col h-full bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="px-6 py-4 border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between gap-4 max-w-[1800px] mx-auto">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Kanban CRM</h1>
            <p className="text-sm text-slate-500">
              Gerencie seus leads arrastando entre etapas do funil
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar contatos..."
                className="pl-9 h-9 bg-slate-50 border-slate-200"
              />
            </div>
            
            {/* Add Stage Button */}
            <Button
              onClick={() => setIsAddingStage(true)}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Nova Etapa
            </Button>
            <ContextualHelpButton articleId="kanban-overview" title="Como usar o Kanban CRM" description="Organize seus leads em etapas do funil de vendas." />
          </div>
        </div>
      </header>

      {/* Main Kanban Board */}
      <main className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full min-w-max pb-4">
          {/* Unassigned Column */}
          {unassignedConversations.length > 0 && (
            <StageColumn
              stage={{
                id: "__unassigned__",
                user_id: "",
                name: "Inbox",
                description: "Conversas não categorizadas",
                color: "bg-slate-400",
                position: -1,
                is_default: false,
              }}
              conversations={unassignedConversations}
              onDragStart={handleDragStart}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedId) {
                  moveConversation.mutate({ id: draggedId, stageId: null });
                }
                setDraggedId(null);
              }}
              onDragOver={handleDragOver}
              onEditStage={() => {}}
              onDeleteStage={() => {}}
              onEditContact={setEditingContact}
              onOpenChat={openChat}
              isDragOver={dragOverStageId === "__unassigned__"}
            />
          )}

          {/* Stage Columns */}
          {stages.map((stage) => (
            <div
              key={stage.id}
              onDragEnter={() => handleDragEnter(stage.id)}
              onDragLeave={handleDragLeave}
            >
              <StageColumn
                stage={stage}
                conversations={getConversationsByStage(stage.id)}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onEditStage={setEditingStage}
                onDeleteStage={(id) => deleteStage.mutate(id)}
                onEditContact={setEditingContact}
                onOpenChat={openChat}
                isDragOver={dragOverStageId === stage.id}
              />
            </div>
          ))}

          {/* Add Stage Placeholder */}
          {!isAddingStage && (
            <button
              onClick={() => setIsAddingStage(true)}
              className="flex flex-col items-center justify-center w-[300px] h-40 rounded-2xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 transition-all duration-200 flex-shrink-0"
            >
              <Plus className="w-8 h-8 mb-2" />
              <span className="font-medium">Adicionar Etapa</span>
            </button>
          )}
        </div>
      </main>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500">Carregando...</p>
          </div>
        </div>
      )}

      {/* Edit Contact Dialog */}
      <Dialog open={!!editingContact} onOpenChange={() => setEditingContact(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Editar Contato
            </DialogTitle>
          </DialogHeader>
          
          {editingContact && (
            <div className="space-y-4">
              {/* Contact Info Display */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={editingContact.contact_avatar || undefined} />
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                    {(editingContact.contact_name || "?").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{editingContact.contact_name || "Sem nome"}</p>
                  <p className="text-sm text-slate-500">
                    {formatPhoneDisplay(editingContact.contact_number)}
                  </p>
                </div>
              </div>
              
              {/* Name Input */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Nome do Contato
                </label>
                <Input
                  value={editingContact.contact_name || ""}
                  onChange={(e) =>
                    setEditingContact({ ...editingContact, contact_name: e.target.value })
                  }
                  placeholder="Nome do contato"
                />
              </div>

              {/* Priority Select */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Prioridade
                </label>
                <Select
                  value={editingContact.priority || "normal"}
                  onValueChange={(value) =>
                    setEditingContact({ ...editingContact, priority: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorities).map(([key, { label, dot }]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", dot)} />
                          {label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Notas Internas
                </label>
                <Textarea
                  value={editingContact.kanban_notes || ""}
                  onChange={(e) =>
                    setEditingContact({ ...editingContact, kanban_notes: e.target.value })
                  }
                  placeholder="Adicione notas sobre este lead..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingContact(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (editingContact) {
                  updateConversation.mutate({
                    id: editingContact.id,
                    data: {
                      contact_name: editingContact.contact_name,
                      priority: editingContact.priority,
                      kanban_notes: editingContact.kanban_notes,
                    },
                  });
                }
              }}
              disabled={updateConversation.isPending}
            >
              {updateConversation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Stage Dialog */}
      <Dialog open={!!editingStage} onOpenChange={() => setEditingStage(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              Editar Etapa
            </DialogTitle>
          </DialogHeader>
          
          {editingStage && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Nome da Etapa
                </label>
                <Input
                  value={editingStage.name}
                  onChange={(e) =>
                    setEditingStage({ ...editingStage, name: e.target.value })
                  }
                  placeholder="Ex: Em Negociação"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Descrição (opcional)
                </label>
                <Input
                  value={editingStage.description}
                  onChange={(e) =>
                    setEditingStage({ ...editingStage, description: e.target.value })
                  }
                  placeholder="Leads em fase de proposta"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                  Cor
                </label>
                <div className="flex gap-2 flex-wrap">
                  {stageColors.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setEditingStage({ ...editingStage, color: value })}
                      className={cn(
                        "w-8 h-8 rounded-full transition-all",
                        value,
                        editingStage.color === value
                          ? "ring-2 ring-offset-2 ring-slate-800 scale-110"
                          : "hover:scale-105"
                      )}
                      title={label}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingStage(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (editingStage) {
                  updateStage.mutate({
                    id: editingStage.id,
                    data: {
                      name: editingStage.name,
                      description: editingStage.description,
                      color: editingStage.color,
                    },
                  });
                }
              }}
              disabled={updateStage.isPending}
            >
              {updateStage.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Stage Dialog */}
      <Dialog open={isAddingStage} onOpenChange={setIsAddingStage}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Nova Etapa
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                Nome da Etapa
              </label>
              <Input
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="Ex: Prospectando"
                autoFocus
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                Cor
              </label>
              <div className="flex gap-2 flex-wrap">
                {stageColors.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setNewStageColor(value)}
                    className={cn(
                      "w-8 h-8 rounded-full transition-all",
                      value,
                      newStageColor === value
                        ? "ring-2 ring-offset-2 ring-slate-800 scale-110"
                        : "hover:scale-105"
                    )}
                    title={label}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsAddingStage(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (newStageName.trim()) {
                  createStage.mutate({ name: newStageName.trim(), color: newStageColor });
                }
              }}
              disabled={!newStageName.trim() || createStage.isPending}
            >
              {createStage.isPending ? "Criando..." : "Criar Etapa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
