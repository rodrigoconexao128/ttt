import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  X,
  User,
  Building2,
  Mail,
  Phone,
  FileText,
  Calendar,
  Hash,
  MapPin,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Save,
  Loader2,
  Image,
  Video,
  Music,
  File,
  Tags,
  Kanban,
  Edit3,
  Check,
  RefreshCw,
  ExternalLink,
  Bot,
  BotOff,
} from "lucide-react";
import type { Conversation, Tag } from "@shared/schema";

interface ContactDetailsPanelProps {
  conversation: Conversation | null;
  connectionId?: string;
  onClose: () => void;
}

interface CustomFieldWithValue {
  definition: {
    id: string;
    name: string;
    label: string;
    field_type: string;
    options: string[];
    required: boolean;
    placeholder?: string;
    help_text?: string;
    ai_extraction_enabled: boolean;
  };
  value: {
    id: string;
    value: string;
    auto_extracted: boolean;
    extraction_confidence?: number;
    last_edited_by: string;
  } | null;
}

interface MediaGallery {
  gallery: Array<{
    id: string;
    mediaType: string;
    mediaUrl: string;
    mediaMimeType?: string;
    mediaCaption?: string;
    timestamp: string;
    fromMe: boolean;
  }>;
  counts: {
    image: number;
    video: number;
    audio: number;
    document: number;
    total: number;
  };
}

interface KanbanStage {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  color: string;
  position: number;
  is_default?: boolean;
}

interface AgentDisabledStatus {
  isDisabled: boolean;
  disabledAt?: string;
}

// Ícone por tipo de campo
function getFieldIcon(fieldType: string) {
  switch (fieldType) {
    case "email": return Mail;
    case "phone": return Phone;
    case "cpf_cnpj": return User;
    case "number": return Hash;
    case "date": return Calendar;
    case "textarea": return MapPin;
    case "select": return FileText;
    default: return FileText;
  }
}

// Ícone por tipo de mídia
function getMediaIcon(mediaType: string) {
  switch (mediaType) {
    case "image": return Image;
    case "video": return Video;
    case "audio": return Music;
    default: return File;
  }
}

export function ContactDetailsPanel({ conversation, connectionId, onClose }: ContactDetailsPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState("fields");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const conversationId = conversation?.id;

  // Query: Campos personalizados
  const { data: customFields = [], isLoading: loadingFields } = useQuery<CustomFieldWithValue[]>({
    queryKey: ["/api/conversations", conversationId, "custom-fields"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/conversations/${conversationId}/custom-fields`);
      return res.json();
    },
    enabled: !!conversationId,
  });

  // Query: Mídias da conversa
  const { data: mediaGallery, isLoading: loadingMedia } = useQuery<MediaGallery>({
    queryKey: ["/api/conversations", conversationId, "media"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/conversations/${conversationId}/media`);
      return res.json();
    },
    enabled: !!conversationId && activeTab === "media",
  });

  // Query: Tags do usuário
  const { data: userTags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
    enabled: !!conversationId,
  });

  // Query: Tags da conversa
  const { data: conversationTags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/conversations", conversationId, "tags"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/conversations/${conversationId}/tags`);
      return res.json();
    },
    enabled: !!conversationId,
  });

  // Query: Estágios do Kanban
  const { data: kanbanStages = [] } = useQuery<KanbanStage[]>({
    queryKey: ["/api/kanban/stages"],
    enabled: !!conversationId,
  });

  // Query: Status da IA para a conversa
  const { data: agentStatus } = useQuery<AgentDisabledStatus>({
    queryKey: ["/api/agent/status", conversationId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/agent/status/${conversationId}`);
      return res.json();
    },
    enabled: !!conversationId,
  });

  // Inicializa valores dos campos quando carrega
  useEffect(() => {
    if (customFields.length > 0) {
      const values: Record<string, string> = {};
      customFields.forEach(cf => {
        values[cf.definition.id] = cf.value?.value || "";
      });
      setCustomFieldValues(values);
      setHasChanges(false);
    }
  }, [customFields]);

  // Mutation: Salvar campos personalizados
  const saveFieldsMutation = useMutation({
    mutationFn: async () => {
      const fields = Object.entries(customFieldValues).map(([fieldDefinitionId, value]) => ({
        fieldDefinitionId,
        value: value || null,
      }));
      const res = await apiRequest("PUT", `/api/conversations/${conversationId}/custom-fields`, { fields });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "custom-fields"] });
      toast({ title: "Campos salvos com sucesso!" });
      setHasChanges(false);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    },
  });

  // Mutation: Extrair campos com IA
  const extractFieldsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/conversations/${conversationId}/custom-fields/extract`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "custom-fields"] });
      toast({ 
        title: "Extração concluída", 
        description: data.message || `${data.extracted} campo(s) preenchido(s)`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Erro na extração", description: error.message, variant: "destructive" });
    },
  });

  // Mutation: Atualizar tags da conversa
  const updateTagsMutation = useMutation({
    mutationFn: async (tagIds: string[]) => {
      const res = await apiRequest("PUT", `/api/conversations/${conversationId}/tags`, { tagIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations-with-tags"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar etiquetas", description: error.message, variant: "destructive" });
    },
  });

  // Mutation: Mover conversa no Kanban
  const moveKanbanMutation = useMutation({
    mutationFn: async (stageId: string) => {
      const res = await apiRequest("PUT", `/api/kanban/conversations/${conversationId}/move`, { stageId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kanban"] });
      // 🔧 FIX: Invalidar a conversa específica para atualizar o kanbanStageId no seletor
      queryClient.invalidateQueries({ queryKey: ["/api/conversation", conversationId] });
      toast({ title: "Movido no Kanban!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao mover no Kanban", description: error.message, variant: "destructive" });
    },
  });

  // Mutation: Toggle IA da conversa
  const toggleAgentMutation = useMutation({
    mutationFn: async (disable: boolean) => {
      const res = await apiRequest("POST", `/api/agent/toggle/${conversationId}`, { disable });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/status", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ 
        title: data.isDisabled ? "IA desativada para este contato" : "IA ativada para este contato" 
      });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao alterar IA", description: error.message, variant: "destructive" });
    },
  });

  const handleFieldChange = (fieldId: string, value: string) => {
    setCustomFieldValues(prev => ({ ...prev, [fieldId]: value }));
    setHasChanges(true);
  };

  const toggleTag = (tagId: string) => {
    const currentIds = conversationTags.map(t => t.id);
    const newIds = currentIds.includes(tagId)
      ? currentIds.filter(id => id !== tagId)
      : [...currentIds, tagId];
    updateTagsMutation.mutate(newIds);
  };

  if (!conversation) return null;

  const displayNumber = conversation.contactNumber || 
    (conversation.remoteJid?.split("@")[0].split(":")[0]) || "";

  return (
    <div className="w-80 border-l bg-card flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="font-semibold">Dados do Contato</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Perfil do Contato */}
      <div className="p-4 flex flex-col items-center text-center border-b">
        <Avatar className="h-16 w-16 mb-2">
          {conversation.contactAvatar && (
            <AvatarImage src={conversation.contactAvatar} />
          )}
          <AvatarFallback className="bg-primary/10 text-primary text-xl">
            {(conversation.contactName || displayNumber).charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <h4 className="font-semibold">{conversation.contactName || displayNumber}</h4>
        <p className="text-sm text-muted-foreground font-mono">{displayNumber}</p>
        
        {/* Toggle IA para esta conversa */}
        <div className="mt-3 w-full p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {agentStatus?.isDisabled ? (
                <BotOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Bot className="h-4 w-4 text-green-500" />
              )}
              <span className="text-sm font-medium">
                {agentStatus?.isDisabled ? "IA Desativada" : "IA Ativada"}
              </span>
            </div>
            <Switch
              checked={!agentStatus?.isDisabled}
              onCheckedChange={(checked) => toggleAgentMutation.mutate(!checked)}
              disabled={toggleAgentMutation.isPending}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1 text-left">
            {agentStatus?.isDisabled 
              ? "A IA não responderá mensagens deste contato" 
              : "A IA responderá automaticamente este contato"}
          </p>
        </div>

        {/* Seletor de Kanban */}
        {kanbanStages.length > 0 && (
          <div className="mt-3 w-full">
            <Label className="text-xs flex items-center gap-1.5 mb-2">
              <Kanban className="h-3 w-3" />
              Estágio do Kanban
            </Label>
            <Select
              value={conversation.kanbanStageId || ""}
              onValueChange={(value) => moveKanbanMutation.mutate(value)}
              disabled={moveKanbanMutation.isPending}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecionar estágio..." />
              </SelectTrigger>
              <SelectContent>
                {kanbanStages.map(stage => (
                  <SelectItem key={stage.id} value={stage.id}>
                    <div className="flex items-center gap-2">
                      <div 
                        className={`w-2 h-2 rounded-full ${stage.color}`}
                      />
                      {stage.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid w-full grid-cols-3 px-4 pt-2">
          <TabsTrigger value="fields" className="text-xs">
            <Edit3 className="h-3 w-3 mr-1" />
            Campos
          </TabsTrigger>
          <TabsTrigger value="tags" className="text-xs">
            <Tags className="h-3 w-3 mr-1" />
            Etiquetas
          </TabsTrigger>
          <TabsTrigger value="media" className="text-xs">
            <Image className="h-3 w-3 mr-1" />
            Mídias
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 min-h-0">
          {/* Tab: Campos Personalizados */}
          <TabsContent value="fields" className="p-4 space-y-4 mt-0">
            {/* Botão de Extração com IA */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => extractFieldsMutation.mutate()}
                disabled={extractFieldsMutation.isPending}
              >
                {extractFieldsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2 text-amber-500" />
                )}
                Extrair com IA
              </Button>
              <Button
                size="sm"
                onClick={() => saveFieldsMutation.mutate()}
                disabled={!hasChanges || saveFieldsMutation.isPending}
              >
                {saveFieldsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar
              </Button>
            </div>

            {/* Lista de Campos */}
            {loadingFields ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : customFields.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum campo configurado</p>
                <p className="text-xs">Configure em Ferramentas → Campos Personalizados</p>
              </div>
            ) : (
              <div className="space-y-3">
                {customFields.map(cf => {
                  const Icon = getFieldIcon(cf.definition.field_type);
                  const fieldValue = customFieldValues[cf.definition.id] || "";
                  
                  return (
                    <div key={cf.definition.id} className="space-y-1">
                      <Label className="text-xs flex items-center gap-1.5">
                        <Icon className="h-3 w-3 text-muted-foreground" />
                        {cf.definition.label}
                        {cf.definition.required && <span className="text-destructive">*</span>}
                        {cf.value?.auto_extracted && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Sparkles className="h-3 w-3 text-amber-500" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Extraído automaticamente pela IA</p>
                                {cf.value.extraction_confidence && (
                                  <p className="text-xs">
                                    Confiança: {Math.round(parseFloat(String(cf.value.extraction_confidence)) * 100)}%
                                  </p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </Label>
                      
                      {cf.definition.field_type === "textarea" ? (
                        <Textarea
                          value={fieldValue}
                          onChange={(e) => handleFieldChange(cf.definition.id, e.target.value)}
                          placeholder={cf.definition.placeholder}
                          rows={2}
                          className="text-sm"
                        />
                      ) : cf.definition.field_type === "select" ? (
                        <Select
                          value={fieldValue || ""}
                          onValueChange={(value) => handleFieldChange(cf.definition.id, value)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder={cf.definition.placeholder || "Selecione..."} />
                          </SelectTrigger>
                          <SelectContent>
                            {cf.definition.options.map(opt => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={cf.definition.field_type === "email" ? "email" : 
                                cf.definition.field_type === "number" ? "number" :
                                cf.definition.field_type === "date" ? "date" : "text"}
                          value={fieldValue}
                          onChange={(e) => handleFieldChange(cf.definition.id, e.target.value)}
                          placeholder={cf.definition.placeholder}
                          className="h-8 text-sm"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Tab: Etiquetas */}
          <TabsContent value="tags" className="p-4 mt-0">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Clique nas etiquetas para adicionar ou remover
              </p>
              <div className="flex flex-wrap gap-2">
                {userTags.map(tag => {
                  const isSelected = conversationTags.some(ct => ct.id === tag.id);
                  return (
                    <Badge
                      key={tag.id}
                      variant={isSelected ? "default" : "outline"}
                      className="cursor-pointer transition-all"
                      style={isSelected ? { backgroundColor: tag.color } : undefined}
                      onClick={() => toggleTag(tag.id)}
                    >
                      {isSelected && <Check className="h-3 w-3 mr-1" />}
                      {tag.name}
                    </Badge>
                  );
                })}
              </div>
              {userTags.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Tags className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma etiqueta criada</p>
                  <p className="text-xs">Configure em Ferramentas → Etiquetas</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Tab: Mídias */}
          <TabsContent value="media" className="p-4 mt-0">
            {loadingMedia ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Contadores */}
                {mediaGallery?.counts && (
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="p-2 bg-muted rounded">
                      <Image className="h-4 w-4 mx-auto mb-1" />
                      <span className="text-xs">{mediaGallery.counts.image}</span>
                    </div>
                    <div className="p-2 bg-muted rounded">
                      <Video className="h-4 w-4 mx-auto mb-1" />
                      <span className="text-xs">{mediaGallery.counts.video}</span>
                    </div>
                    <div className="p-2 bg-muted rounded">
                      <Music className="h-4 w-4 mx-auto mb-1" />
                      <span className="text-xs">{mediaGallery.counts.audio}</span>
                    </div>
                    <div className="p-2 bg-muted rounded">
                      <File className="h-4 w-4 mx-auto mb-1" />
                      <span className="text-xs">{mediaGallery.counts.document}</span>
                    </div>
                  </div>
                )}

                {/* Galeria */}
                {mediaGallery?.gallery && mediaGallery.gallery.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {mediaGallery.gallery.slice(0, 12).map(item => {
                      const MediaIcon = getMediaIcon(item.mediaType);
                      return (
                        <div
                          key={item.id}
                          className="aspect-square rounded border overflow-hidden bg-muted relative cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          {item.mediaType === "image" && item.mediaUrl ? (
                            <img
                              src={item.mediaUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <MediaIcon className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] p-1 truncate">
                            {format(new Date(item.timestamp), "dd/MM HH:mm")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Image className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma mídia nesta conversa</p>
                  </div>
                )}

                {mediaGallery?.gallery && mediaGallery.gallery.length > 12 && (
                  <p className="text-center text-xs text-muted-foreground">
                    +{mediaGallery.gallery.length - 12} mídias
                  </p>
                )}
              </div>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
