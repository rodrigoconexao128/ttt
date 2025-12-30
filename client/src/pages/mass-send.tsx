import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Send, 
  Users, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  XCircle,
  FileText,
  Phone,
  RefreshCw,
  AlertCircle,
  Loader2,
  Sparkles,
  Clock,
  Shield,
  Search,
  Eye,
  History,
  BarChart3,
  MessageSquare,
  Zap,
  ChevronRight,
  UserCheck,
  List,
  BookUser,
  Import,
  HelpCircle,
  CheckCheck,
  ChevronDown,
  Timer,
  Calendar,
  ChevronLeft,
  ArrowLeft,
  UsersRound
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Contact {
  id: string;
  name: string;
  phone: string;
  selected?: boolean;
  hasReplied?: boolean;
  lastMessage?: string;
  tags?: string[];
}

interface WhatsAppGroup {
  id: string;
  name: string;
  participantsCount: number;
  description?: string;
  owner?: string;
  createdAt?: number;
  isAdmin?: boolean;
}

interface ContactList {
  id: string;
  name: string;
  description: string;
  contacts: Contact[];
  createdAt: string;
}

interface SendProgress {
  total: number;
  sent: number;
  failed: number;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  currentPhone?: string;
  estimatedTime?: number;
}

interface CampaignHistory {
  id: string;
  name: string;
  message?: string;
  sentCount?: number;
  failedCount?: number;
  totalSent?: number;    // Backend pode enviar nesse formato
  totalFailed?: number;  // Backend pode enviar nesse formato
  executedAt: string;
  status: string;
  recipients?: string[];
  recipientNames?: Record<string, string>;
  delayProfile?: string;
  useAiVariation?: boolean;
  results?: {
    sent?: { phone: string; name?: string; timestamp: string; message?: string }[];
    failed?: { phone: string; name?: string; error: string; timestamp: string }[];
  };
}

// Componente para tooltips informativos
function InfoTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help inline ml-1" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-sm">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Step Indicator Component
function StepIndicator({ currentStep, steps }: { currentStep: number; steps: string[] }) {
  return (
    <div className="flex items-center justify-center mb-6">
      {steps.map((step, index) => (
        <div key={index} className="flex items-center">
          <div className={`
            flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors
            ${index + 1 <= currentStep 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-muted text-muted-foreground'
            }
          `}>
            {index + 1 < currentStep ? <CheckCheck className="w-4 h-4" /> : index + 1}
          </div>
          <span className={`ml-2 text-sm hidden md:inline ${index + 1 <= currentStep ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
            {step}
          </span>
          {index < steps.length - 1 && (
            <ChevronRight className="w-4 h-4 mx-2 md:mx-3 text-muted-foreground" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function MassSendPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Estados do Wizard/Passo a Passo
  const [currentStep, setCurrentStep] = useState(1);
  const steps = ["Destinatários", "Mensagem", "Configurações", "Revisar"];
  
  // Estado para modo de entrada de destinatários
  const [recipientMode, setRecipientMode] = useState<'manual' | 'list' | 'synced' | 'groups'>('manual');
  
  // Estado para envio manual com nome
  const [manualContacts, setManualContacts] = useState<string>("");
  const [messageTemplate, setMessageTemplate] = useState<string>("");
  
  // Configurações de envio
  const [useAI, setUseAI] = useState(false);
  const [useHumanDelay, setUseHumanDelay] = useState(true);
  // Pré-selecionado: Humano (5-12s) - Recomendado
  const [delayMin, setDelayMin] = useState(5);
  const [delayMax, setDelayMax] = useState(12);
  const [batchSize, setBatchSize] = useState(10);
  const [batchInterval, setBatchInterval] = useState(60);
  
  // Estado para listas e contatos selecionados
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  
  // Estado para grupos selecionados
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [groupSearchTerm, setGroupSearchTerm] = useState("");
  
  // Progresso de envio
  const [sendProgress, setSendProgress] = useState<SendProgress>({
    total: 0,
    sent: 0,
    failed: 0,
    status: 'idle'
  });
  
  // Estados de diálogo
  const [showCreateListDialog, setShowCreateListDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showCampaignDetailsDialog, setShowCampaignDetailsDialog] = useState(false);
  const [selectedCampaignDetails, setSelectedCampaignDetails] = useState<CampaignHistory | null>(null);
  const [showListDetailsDialog, setShowListDetailsDialog] = useState(false);
  const [selectedListDetails, setSelectedListDetails] = useState<ContactList | null>(null);
  const [listSearchTerm, setListSearchTerm] = useState("");
  const [listPage, setListPage] = useState(1);
  const listsPerPage = 5;
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  
  // Estados de agendamento
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  
  // Sincronização
  const [syncProgress, setSyncProgress] = useState<{ syncing: boolean; count: number }>({ syncing: false, count: 0 });
  
  // Estado para carregamento de grupos
  const [groupsLoading, setGroupsLoading] = useState(false);
  
  // Buscar conexão WhatsApp
  const { data: connection } = useQuery<{ isConnected: boolean } | null>({
    queryKey: ["/api/whatsapp/connection"],
  });

  // Buscar listas de contatos
  const { data: contactLists = [], isLoading: listsLoading, refetch: refetchLists } = useQuery<ContactList[]>({
    queryKey: ["/api/contacts/lists"],
    retry: false,
  });

  // Buscar contatos sincronizados (apenas que já responderam)
  const { data: syncedContacts = [], refetch: refetchContacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts/synced"],
    retry: false,
  });

  // Buscar grupos do WhatsApp
  const { data: whatsappGroups = [], isLoading: groupsQueryLoading, refetch: refetchGroups } = useQuery<WhatsAppGroup[]>({
    queryKey: ["/api/whatsapp/groups"],
    retry: false,
    enabled: !!connection?.isConnected,
  });

  // Buscar histórico de campanhas
  const { data: campaignHistory = [] } = useQuery<CampaignHistory[]>({
    queryKey: ["/api/campaigns"],
    retry: false,
  });

  // Mutation para envio em massa
  const sendBulkMutation = useMutation({
    mutationFn: async (data: { 
      contacts: { phone: string; name?: string }[]; 
      message: string;
      useAI: boolean;
      delayMin: number;
      delayMax: number;
      batchSize: number;
      batchInterval: number;
    }) => {
      // Usar a API existente de bulk-send
      const phones = data.contacts.map(c => c.phone);
      const response = await apiRequest("POST", "/api/whatsapp/bulk-send", { 
        phones, 
        message: data.message,
        contacts: data.contacts, // Enviar dados completos também
        settings: {
          useAI: data.useAI,
          delayMin: data.delayMin,
          delayMax: data.delayMax,
          batchSize: data.batchSize,
          batchInterval: data.batchInterval
        }
      });
      return response.json();
    },
    onSuccess: (data) => {
      setSendProgress({ 
        total: data.total || 0, 
        sent: data.sent || 0, 
        failed: data.failed || 0, 
        status: 'completed' 
      });
      setIsSending(false); // Liberar botão
      toast({
        title: "Envio concluído!",
        description: `${data.sent || 0} mensagens enviadas com sucesso.`,
      });
      // Atualizar histórico de campanhas
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
    },
    onError: (error: Error) => {
      setSendProgress(prev => ({ ...prev, status: 'error' }));
      setIsSending(false); // Liberar botão mesmo em erro
      toast({
        title: "Erro no envio",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para envio em grupos
  const sendToGroupsMutation = useMutation({
    mutationFn: async (data: { 
      groupIds: string[]; 
      message: string;
      useAI: boolean;
      delayMin: number;
      delayMax: number;
      scheduledAt?: string;
    }) => {
      const response = await apiRequest("POST", "/api/whatsapp/groups/bulk-send", { 
        groupIds: data.groupIds, 
        message: data.message,
        settings: {
          useAI: data.useAI,
          delayMin: data.delayMin,
          delayMax: data.delayMax,
        },
        scheduledAt: data.scheduledAt,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.scheduled) {
        setSendProgress({ total: data.total || 0, sent: 0, failed: 0, status: 'idle' });
        setIsSending(false);
        toast({
          title: "Envio agendado!",
          description: data.message,
        });
      } else {
        setSendProgress({ 
          total: data.total || 0, 
          sent: data.sent || 0, 
          failed: data.failed || 0, 
          status: 'completed' 
        });
        setIsSending(false);
        toast({
          title: "Envio para grupos iniciado!",
          description: `Enviando para ${data.total || 0} grupos em background.`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
    },
    onError: (error: Error) => {
      setSendProgress(prev => ({ ...prev, status: 'error' }));
      setIsSending(false);
      toast({
        title: "Erro no envio para grupos",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para criar lista
  const createListMutation = useMutation({
    mutationFn: async ({ name, description, contacts }: { name: string; description: string; contacts?: Contact[] }) => {
      const response = await apiRequest("POST", "/api/contacts/lists", { name, description, contacts });
      return response.json();
    },
    onSuccess: () => {
      setShowCreateListDialog(false);
      setNewListName("");
      setNewListDescription("");
      refetchLists();
      toast({ title: "Lista criada!", description: "Sua nova lista de contatos foi criada." });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar lista", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para sincronizar contatos
  const syncContactsMutation = useMutation({
    mutationFn: async () => {
      setSyncProgress({ syncing: true, count: 0 });
      const response = await apiRequest("POST", "/api/contacts/sync");
      return response.json();
    },
    onSuccess: (data) => {
      setSyncProgress({ syncing: false, count: data.count || 0 });
      refetchContacts();
      toast({
        title: "Sincronização concluída!",
        description: `${data.count || 0} contatos que já conversaram foram sincronizados.`,
      });
    },
    onError: (error: Error) => {
      setSyncProgress({ syncing: false, count: 0 });
      toast({ title: "Erro na sincronização", description: error.message, variant: "destructive" });
    },
  });

  // Parsear contatos do textarea (nome, número)
  const parseManualContacts = (text: string): { phone: string; name: string }[] => {
    const lines = text.split('\n').filter(line => line.trim());
    const contacts: { phone: string; name: string }[] = [];
    
    for (const line of lines) {
      // Formato: Nome, Número ou apenas Número
      const parts = line.split(/[,;\t]/).map(p => p.trim());
      
      if (parts.length >= 2) {
        // Nome e número fornecidos
        const name = parts[0];
        const phone = parts[1].replace(/\D/g, '');
        if (phone.length >= 10 && phone.length <= 15) {
          contacts.push({ name, phone });
        }
      } else if (parts.length === 1) {
        // Apenas número
        const phone = parts[0].replace(/\D/g, '');
        if (phone.length >= 10 && phone.length <= 15) {
          contacts.push({ name: '', phone });
        }
      }
    }
    
    return contacts;
  };

  // Obter contatos selecionados baseado no modo
  const getSelectedContacts = useMemo(() => {
    if (recipientMode === 'manual') {
      return parseManualContacts(manualContacts);
    } else if (recipientMode === 'list' && selectedListId) {
      const list = contactLists.find(l => l.id === selectedListId);
      if (list?.contacts) {
        const selected = list.contacts.filter(c => selectedContactIds.size === 0 || selectedContactIds.has(c.id));
        return selected.map(c => ({ phone: c.phone, name: c.name || '' }));
      }
    } else if (recipientMode === 'synced') {
      const selected = syncedContacts.filter(c => selectedContactIds.size === 0 || selectedContactIds.has(c.id));
      return selected.map(c => ({ phone: c.phone, name: c.name || '' }));
    } else if (recipientMode === 'groups') {
      // Para grupos, retornamos os grupos selecionados como "contatos" para contagem
      const selectedGroups = whatsappGroups?.filter(g => selectedGroupIds.has(g.id)) || [];
      return selectedGroups.map(g => ({ phone: g.id, name: g.name }));
    }
    return [];
  }, [recipientMode, manualContacts, selectedListId, selectedContactIds, contactLists, syncedContacts, selectedGroupIds, whatsappGroups]);

  // Aplicar variáveis na mensagem
  const applyMessageTemplate = (template: string, name: string): string => {
    return template.replace(/\[nome\]/gi, name || 'Cliente');
  };

  // Gerar preview da mensagem
  const previewMessage = useMemo(() => {
    const sample = getSelectedContacts[0] || { name: 'João', phone: '11999887766' };
    return applyMessageTemplate(messageTemplate, sample.name);
  }, [messageTemplate, getSelectedContacts]);

  // Formatar número para exibição
  const formatPhone = (phone: string): string => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 11) {
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    } else if (clean.length === 13) {
      return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
    }
    return phone;
  };

  // Calcular tempo estimado de envio
  const estimatedTime = useMemo(() => {
    const count = getSelectedContacts.length;
    if (count === 0) return 0;
    
    const avgDelay = (delayMin + delayMax) / 2;
    const batches = Math.ceil(count / batchSize);
    const totalSeconds = (count * avgDelay) + ((batches - 1) * batchInterval);
    
    return Math.ceil(totalSeconds / 60); // Em minutos
  }, [getSelectedContacts.length, delayMin, delayMax, batchSize, batchInterval]);

  // Filtrar contatos por busca
  const filteredContacts = useMemo(() => {
    const contacts = recipientMode === 'synced' ? syncedContacts : 
                    (recipientMode === 'list' && selectedListId) ? 
                    contactLists.find(l => l.id === selectedListId)?.contacts || [] : [];
    
    if (!searchTerm) return contacts;
    
    const term = searchTerm.toLowerCase();
    return contacts.filter(c => 
      c.name?.toLowerCase().includes(term) || 
      c.phone.includes(term)
    );
  }, [recipientMode, syncedContacts, selectedListId, contactLists, searchTerm]);

  // Selecionar/deselecionar todos
  const toggleSelectAll = () => {
    if (selectedContactIds.size === filteredContacts.length) {
      setSelectedContactIds(new Set());
    } else {
      setSelectedContactIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  // Estado para prevenir múltiplos cliques
  const [isSending, setIsSending] = useState(false);

  // Iniciar envio - com proteção contra múltiplos cliques
  const handleSend = () => {
    // Prevenir múltiplos cliques
    if (isSending || sendProgress.status === 'running') {
      return;
    }

    const contacts = getSelectedContacts;
    
    if (contacts.length === 0) {
      toast({ title: "Nenhum destinatário", description: recipientMode === 'groups' ? "Selecione pelo menos um grupo." : "Selecione pelo menos um contato.", variant: "destructive" });
      return;
    }

    if (!messageTemplate.trim()) {
      toast({ title: "Mensagem vazia", description: "Digite uma mensagem para enviar.", variant: "destructive" });
      return;
    }

    // Marcar como enviando para prevenir cliques duplos
    setIsSending(true);
    setSendProgress({ total: contacts.length, sent: 0, failed: 0, status: 'running' });
    
    // Se for modo grupos, usar mutation específica
    if (recipientMode === 'groups') {
      const groupIds = Array.from(selectedGroupIds);
      // Criar data de agendamento se habilitado
      let scheduledAtStr: string | undefined;
      if (scheduleEnabled && scheduledDate && scheduledTime) {
        const dateTimeStr = `${scheduledDate}T${scheduledTime}`;
        scheduledAtStr = new Date(dateTimeStr).toISOString();
      }
      sendToGroupsMutation.mutate({
        groupIds,
        message: messageTemplate,
        useAI,
        delayMin,
        delayMax,
        scheduledAt: scheduledAtStr,
      });
    } else {
      // Modo normal de contatos
      sendBulkMutation.mutate({
        contacts,
        message: messageTemplate,
        useAI,
        delayMin,
        delayMax,
        batchSize,
        batchInterval
      });
    }
  };
  const isConnected = connection?.isConnected;

  return (
    <div className="flex-1 overflow-auto">
      {/* Header Fixo */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                <Send className="w-4 h-4" /> Envio em Massa
              </div>
              <h1 className="text-2xl font-bold mt-1">Disparo de Mensagens</h1>
            </div>
            <div className="flex items-center gap-3">
              {isConnected ? (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Conectado
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="w-3 h-3 mr-1" /> Desconectado
                </Badge>
              )}
              
              <Button variant="outline" size="sm" onClick={() => setShowHistoryDialog(true)}>
                <History className="w-4 h-4 mr-2" />
                Histórico
              </Button>
            </div>
          </div>
          
          {/* Step Indicator */}
          <div className="mt-4">
            <StepIndicator currentStep={currentStep} steps={steps} />
          </div>
        </div>
      </div>

      {/* Conteúdo Principal */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-6">
        
        {/* Alerta de desconexão */}
        {!isConnected && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>WhatsApp não conectado</AlertTitle>
            <AlertDescription>
              Conecte seu WhatsApp na página de conexão para usar o envio em massa.
            </AlertDescription>
          </Alert>
        )}

        {/* STEP 1: Destinatários */}
        {currentStep === 1 && (
          <div className="space-y-6">
            {/* Seletor de Modo */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Como você quer adicionar os destinatários?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {/* Opção Manual */}
                  <button
                    onClick={() => setRecipientMode('manual')}
                    className={`
                      p-4 rounded-lg border-2 text-left transition-all hover:border-primary/50
                      ${recipientMode === 'manual' ? 'border-primary bg-primary/5' : 'border-border'}
                    `}
                  >
                    <Import className="w-8 h-8 mb-2 text-primary" />
                    <h3 className="font-semibold">Inserir Manualmente</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Digite nome e número. Formato: Nome, Número
                    </p>
                  </button>

                  {/* Opção Lista */}
                  <button
                    onClick={() => setRecipientMode('list')}
                    className={`
                      p-4 rounded-lg border-2 text-left transition-all hover:border-primary/50
                      ${recipientMode === 'list' ? 'border-primary bg-primary/5' : 'border-border'}
                    `}
                  >
                    <List className="w-8 h-8 mb-2 text-primary" />
                    <h3 className="font-semibold">Listas de Contatos</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Selecione uma lista salva ({contactLists.length} disponíveis)
                    </p>
                  </button>

                  {/* Opção Sincronizados */}
                  <button
                    onClick={() => setRecipientMode('synced')}
                    className={`
                      p-4 rounded-lg border-2 text-left transition-all hover:border-primary/50
                      ${recipientMode === 'synced' ? 'border-primary bg-primary/5' : 'border-border'}
                    `}
                  >
                    <UserCheck className="w-8 h-8 mb-2 text-green-600" />
                    <h3 className="font-semibold">Contatos Seguros</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="text-green-600">✓</span> Quem já conversou ({syncedContacts.length})
                    </p>
                  </button>

                  {/* Opção Grupos */}
                  <button
                    onClick={() => setRecipientMode('groups')}
                    className={`
                      p-4 rounded-lg border-2 text-left transition-all hover:border-primary/50
                      ${recipientMode === 'groups' ? 'border-primary bg-primary/5' : 'border-border'}
                    `}
                  >
                    <UsersRound className="w-8 h-8 mb-2 text-blue-600" />
                    <h3 className="font-semibold">Grupos do WhatsApp</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="text-blue-600">✓</span> Enviar para grupos ({whatsappGroups?.length || 0})
                    </p>
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Área de Input baseado no modo */}
            {recipientMode === 'manual' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Inserir Contatos em Massa
                    <InfoTooltip text="Digite Nome, Número (um por linha). Se não fornecer nome, apenas o número será usado. A variável [nome] na mensagem usará o nome fornecido." />
                  </CardTitle>
                  <CardDescription>
                    Formato: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">Nome, Número</code> ou apenas <code className="bg-muted px-1.5 py-0.5 rounded text-xs">Número</code> (um por linha)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder={`João Silva, 17991234567
Maria Santos, 11987654321
21999887766
Pedro Oliveira, 31988776655`}
                    value={manualContacts}
                    onChange={(e) => setManualContacts(e.target.value)}
                    className="min-h-[200px] font-mono text-sm"
                    disabled={!isConnected || sendProgress.status === 'running'}
                  />
                  
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {parseManualContacts(manualContacts).length} contatos
                      </span>
                      <span className="flex items-center gap-1">
                        <UserCheck className="w-4 h-4" />
                        {parseManualContacts(manualContacts).filter(c => c.name).length} com nome
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setManualContacts("")}
                        disabled={!manualContacts}
                      >
                        <Trash2 className="w-4 h-4 mr-1" /> Limpar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const contacts = parseManualContacts(manualContacts);
                          if (contacts.length > 0) {
                            setShowCreateListDialog(true);
                          } else {
                            toast({ title: "Sem contatos", description: "Insira contatos primeiro.", variant: "destructive" });
                          }
                        }}
                      >
                        <Plus className="w-4 h-4 mr-1" /> Salvar Lista
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {recipientMode === 'list' && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <BookUser className="w-5 h-5" />
                        Listas de Contatos
                      </CardTitle>
                      <CardDescription>
                        Gerencie e selecione listas para envio
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setShowCreateListDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Nova Lista
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {contactLists.length === 0 ? (
                    <div className="text-center py-8">
                      <List className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground mb-4">Nenhuma lista criada ainda</p>
                      <Button onClick={() => setShowCreateListDialog(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Criar Lista
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Busca nas listas */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Buscar lista..."
                          value={listSearchTerm}
                          onChange={(e) => { setListSearchTerm(e.target.value); setListPage(1); }}
                          className="pl-9"
                        />
                      </div>
                      
                      {/* Lista de listas com paginação */}
                      {(() => {
                        const filteredLists = contactLists.filter(l => 
                          l.name.toLowerCase().includes(listSearchTerm.toLowerCase()) ||
                          l.description?.toLowerCase().includes(listSearchTerm.toLowerCase())
                        );
                        const totalPages = Math.ceil(filteredLists.length / listsPerPage);
                        const paginatedLists = filteredLists.slice((listPage - 1) * listsPerPage, listPage * listsPerPage);
                        
                        return (
                          <div className="space-y-3">
                            <div className="space-y-2">
                              {paginatedLists.map((list) => (
                                <div 
                                  key={list.id} 
                                  className={`p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer ${
                                    selectedListId === list.id ? 'border-primary bg-primary/5' : ''
                                  }`}
                                  onClick={() => { setSelectedListId(list.id); setSelectedContactIds(new Set()); }}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-3 h-3 rounded-full ${selectedListId === list.id ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                                      <div>
                                        <p className="font-medium">{list.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {list.contacts?.length || 0} contatos • {list.description || 'Sem descrição'}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button 
                                        variant="ghost" 
                                        size="sm"
                                        onClick={(e) => { 
                                          e.stopPropagation(); 
                                          setSelectedListDetails(list); 
                                          setShowListDetailsDialog(true); 
                                        }}
                                      >
                                        <Eye className="w-4 h-4" />
                                      </Button>
                                      <Badge variant="outline">
                                        {list.contacts?.length || 0}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            
                            {/* Paginação */}
                            {totalPages > 1 && (
                              <div className="flex items-center justify-between pt-2 border-t">
                                <span className="text-sm text-muted-foreground">
                                  {filteredLists.length} listas encontradas
                                </span>
                                <div className="flex items-center gap-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setListPage(p => Math.max(1, p - 1))}
                                    disabled={listPage === 1}
                                  >
                                    <ChevronLeft className="w-4 h-4" />
                                  </Button>
                                  <span className="text-sm">
                                    {listPage} de {totalPages}
                                  </span>
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setListPage(p => Math.min(totalPages, p + 1))}
                                    disabled={listPage === totalPages}
                                  >
                                    <ChevronRight className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {selectedListId && (
                        <div className="space-y-3 pt-4 border-t">
                          <h4 className="font-medium text-sm">Contatos da Lista Selecionada</h4>
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                            <div className="relative flex-1 max-w-xs">
                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                placeholder="Buscar contato..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                                {selectedContactIds.size === filteredContacts.length ? 'Desmarcar' : 'Selecionar Todos'}
                              </Button>
                              <span className="text-sm text-muted-foreground">
                                {selectedContactIds.size > 0 ? selectedContactIds.size : filteredContacts.length} selecionados
                              </span>
                            </div>
                          </div>
                          
                          <ScrollArea className="h-[300px] border rounded-md">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-12"></TableHead>
                                  <TableHead>Nome</TableHead>
                                  <TableHead>Telefone</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredContacts.map((contact) => (
                                  <TableRow key={contact.id}>
                                    <TableCell>
                                      <Checkbox
                                        checked={selectedContactIds.size === 0 || selectedContactIds.has(contact.id)}
                                        onCheckedChange={(checked) => {
                                          const newSet = new Set(selectedContactIds);
                                          if (checked) {
                                            newSet.add(contact.id);
                                          } else {
                                            newSet.delete(contact.id);
                                          }
                                          setSelectedContactIds(newSet);
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell className="font-medium">{contact.name || '-'}</TableCell>
                                    <TableCell className="text-muted-foreground">{formatPhone(contact.phone)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </ScrollArea>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {recipientMode === 'synced' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-green-600" />
                    Contatos Seguros
                    <Badge variant="outline" className="text-green-600 border-green-600 ml-2">Anti-Spam</Badge>
                  </CardTitle>
                  <CardDescription>
                    Contatos que já iniciaram conversa ou responderam você
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert className="bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800">
                    <Shield className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800 dark:text-green-200">Por que é mais seguro?</AlertTitle>
                    <AlertDescription className="text-green-700 dark:text-green-300">
                      Enviar para quem já conversou com você reduz muito o risco de bloqueio. O WhatsApp prioriza conversas já estabelecidas.
                    </AlertDescription>
                  </Alert>

                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <Button
                      onClick={() => syncContactsMutation.mutate()}
                      disabled={!isConnected || syncProgress.syncing}
                    >
                      {syncProgress.syncing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sincronizando...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Sincronizar
                        </>
                      )}
                    </Button>
                    
                    <span className="text-sm text-muted-foreground">
                      {syncedContacts.length} contatos disponíveis
                    </span>
                  </div>

                  {syncedContacts.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div className="relative flex-1 max-w-xs">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            placeholder="Buscar..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                            {selectedContactIds.size === filteredContacts.length ? 'Desmarcar' : 'Selecionar Todos'}
                          </Button>
                          <span className="text-sm text-muted-foreground">
                            {selectedContactIds.size > 0 ? selectedContactIds.size : filteredContacts.length} selecionados
                          </span>
                        </div>
                      </div>
                      
                      <ScrollArea className="h-[300px] border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12"></TableHead>
                              <TableHead>Nome</TableHead>
                              <TableHead>Telefone</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredContacts.map((contact) => (
                              <TableRow key={contact.id}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedContactIds.size === 0 || selectedContactIds.has(contact.id)}
                                    onCheckedChange={(checked) => {
                                      const newSet = new Set(selectedContactIds);
                                      if (checked) {
                                        newSet.add(contact.id);
                                      } else {
                                        newSet.delete(contact.id);
                                      }
                                      setSelectedContactIds(newSet);
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">{contact.name || '-'}</TableCell>
                                <TableCell className="text-muted-foreground">{formatPhone(contact.phone)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Seção de Grupos */}
            {recipientMode === 'groups' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UsersRound className="w-5 h-5 text-blue-600" />
                    Grupos do WhatsApp
                    <Badge variant="outline" className="text-blue-600 border-blue-600 ml-2">Envio em Massa</Badge>
                  </CardTitle>
                  <CardDescription>
                    Selecione os grupos que você participa para enviar mensagens
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
                    <UsersRound className="h-4 w-4 text-blue-600" />
                    <AlertTitle className="text-blue-800 dark:text-blue-200">Envio para Grupos</AlertTitle>
                    <AlertDescription className="text-blue-700 dark:text-blue-300">
                      A mensagem será enviada diretamente nos grupos selecionados. Todos os participantes receberão a mensagem.
                    </AlertDescription>
                  </Alert>

                  {groupsQueryLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mr-2" />
                      <span>Carregando grupos...</span>
                    </div>
                  ) : !whatsappGroups || whatsappGroups.length === 0 ? (
                    <div className="text-center py-8">
                      <UsersRound className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground mb-4">Nenhum grupo encontrado</p>
                      <p className="text-sm text-muted-foreground">
                        {isConnected ? 'Você não participa de nenhum grupo no WhatsApp' : 'Conecte seu WhatsApp para ver os grupos'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Busca nos grupos */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div className="relative flex-1 max-w-xs">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            placeholder="Buscar grupo..."
                            value={groupSearchTerm}
                            onChange={(e) => setGroupSearchTerm(e.target.value)}
                            className="pl-9"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => {
                              if (selectedGroupIds.size === whatsappGroups.length) {
                                setSelectedGroupIds(new Set());
                              } else {
                                setSelectedGroupIds(new Set(whatsappGroups.map(g => g.id)));
                              }
                            }}
                          >
                            {selectedGroupIds.size === whatsappGroups.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                          </Button>
                          <span className="text-sm text-muted-foreground">
                            {selectedGroupIds.size} grupos selecionados
                          </span>
                        </div>
                      </div>

                      {/* Lista de grupos */}
                      <ScrollArea className="h-[350px] border rounded-md">
                        <div className="p-2 space-y-2">
                          {whatsappGroups
                            .filter(group => 
                              group.name.toLowerCase().includes(groupSearchTerm.toLowerCase())
                            )
                            .map((group) => (
                              <div 
                                key={group.id}
                                className={`
                                  p-3 rounded-lg border cursor-pointer transition-all hover:bg-muted/50
                                  ${selectedGroupIds.has(group.id) ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-border'}
                                `}
                                onClick={() => {
                                  const newSet = new Set(selectedGroupIds);
                                  if (newSet.has(group.id)) {
                                    newSet.delete(group.id);
                                  } else {
                                    newSet.add(group.id);
                                  }
                                  setSelectedGroupIds(newSet);
                                }}
                              >
                                <div className="flex items-center gap-3">
                                  <Checkbox
                                    checked={selectedGroupIds.has(group.id)}
                                    onCheckedChange={(checked) => {
                                      const newSet = new Set(selectedGroupIds);
                                      if (checked) {
                                        newSet.add(group.id);
                                      } else {
                                        newSet.delete(group.id);
                                      }
                                      setSelectedGroupIds(newSet);
                                    }}
                                  />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{group.name}</span>
                                      {group.isAdmin && (
                                        <Badge variant="secondary" className="text-xs">Admin</Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {group.participantCount} participantes
                                    </p>
                                  </div>
                                  <Badge variant="outline" className="text-blue-600">
                                    {group.participantCount}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                        </div>
                      </ScrollArea>

                      {/* Resumo da seleção */}
                      {selectedGroupIds.size > 0 && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                              {selectedGroupIds.size} grupos selecionados
                            </span>
                            <span className="text-xs text-blue-600">
                              (~{whatsappGroups
                                .filter(g => selectedGroupIds.has(g.id))
                                .reduce((acc, g) => acc + g.participantCount, 0)} pessoas alcançadas)
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Navegação */}
            <div className="flex justify-end">
              <Button 
                onClick={() => setCurrentStep(2)}
                disabled={getSelectedContacts.length === 0}
              >
                Próximo: Mensagem
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Mensagem */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Escreva sua Mensagem
                </CardTitle>
                <CardDescription>
                  Use <code className="bg-muted px-1.5 py-0.5 rounded text-xs">[nome]</code> para personalizar com o nome do contato
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder={`Olá [nome], tudo bem?

Estou entrando em contato para...

💡 Use [nome] para inserir o nome do contato automaticamente!`}
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  className="min-h-[200px]"
                  disabled={sendProgress.status === 'running'}
                />
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{messageTemplate.length} caracteres</span>
                    {messageTemplate.toLowerCase().includes('[nome]') && (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <UserCheck className="w-3 h-3 mr-1" />
                        Personalizado
                      </Badge>
                    )}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowPreviewDialog(true)}
                    disabled={!messageTemplate}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Ver Preview
                  </Button>
                </div>

                {/* Botão para inserir variável */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">Inserir:</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setMessageTemplate(prev => prev + '[nome]')}
                  >
                    [nome]
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Opção de IA */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                  Variação com IA
                  <Badge variant="outline" className="text-purple-600 border-purple-600">BETA</Badge>
                </CardTitle>
                <CardDescription>
                  Gera versões únicas da mensagem para evitar detecção de spam
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="use-ai">Ativar variação com IA</Label>
                    <p className="text-sm text-muted-foreground">
                      Cada contato recebe uma versão diferente
                    </p>
                  </div>
                  <Switch
                    id="use-ai"
                    checked={useAI}
                    onCheckedChange={setUseAI}
                  />
                </div>
                
                {useAI && (
                  <Alert className="mt-4 bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800">
                    <Sparkles className="h-4 w-4 text-purple-600" />
                    <AlertDescription className="text-purple-700 dark:text-purple-300">
                      A IA manterá o significado mas variará palavras e estrutura. A variável [nome] será preservada.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Navegação */}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep(1)}>
                Voltar
              </Button>
              <Button 
                onClick={() => setCurrentStep(3)}
                disabled={!messageTemplate.trim()}
              >
                Próximo: Configurações
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Configurações Anti-Spam */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
              <Shield className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-800 dark:text-blue-200">Proteção Anti-Spam</AlertTitle>
              <AlertDescription className="text-blue-700 dark:text-blue-300">
                Configure intervalos e lotes para simular comportamento humano e evitar bloqueios.
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Delay Humanizado
                  <InfoTooltip text="Intervalos aleatórios entre mensagens simulam digitação humana." />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <Label>Ativar delay humanizado</Label>
                  <Switch checked={useHumanDelay} onCheckedChange={setUseHumanDelay} />
                </div>

                {useHumanDelay && (
                  <>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Perfil de Delay</Label>
                        <Select 
                          value={`${delayMin}-${delayMax}`} 
                          onValueChange={(v) => {
                            const [min, max] = v.split('-').map(Number);
                            setDelayMin(min);
                            setDelayMax(max);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3-7">
                              <span className="flex items-center gap-2">
                                <Zap className="w-4 h-4 text-yellow-500" /> Normal (3-7s)
                              </span>
                            </SelectItem>
                            <SelectItem value="5-12">
                              <span className="flex items-center gap-2">
                                <Timer className="w-4 h-4 text-blue-500" /> Humano (5-12s) - Recomendado
                              </span>
                            </SelectItem>
                            <SelectItem value="10-20">
                              <span className="flex items-center gap-2">
                                <Shield className="w-4 h-4 text-green-500" /> Conservador (10-20s)
                              </span>
                            </SelectItem>
                            <SelectItem value="15-30">
                              <span className="flex items-center gap-2">
                                <Shield className="w-4 h-4 text-emerald-500" /> Ultra Seguro (15-30s)
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Intervalo atual: {delayMin}s a {delayMax}s entre cada mensagem
                        </p>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <h4 className="font-medium flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        Configurações de Lotes
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Mensagens por lote</Label>
                          <Select value={String(batchSize)} onValueChange={(v) => setBatchSize(Number(v))}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="10">10 mensagens</SelectItem>
                              <SelectItem value="20">20 mensagens</SelectItem>
                              <SelectItem value="30">30 mensagens</SelectItem>
                              <SelectItem value="50">50 mensagens</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Pausa entre lotes</Label>
                          <Select value={String(batchInterval)} onValueChange={(v) => setBatchInterval(Number(v))}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="60">1 minuto</SelectItem>
                              <SelectItem value="120">2 minutos</SelectItem>
                              <SelectItem value="180">3 minutos</SelectItem>
                              <SelectItem value="300">5 minutos</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Resumo das proteções */}
            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <h4 className="font-medium mb-4">Resumo das Proteções</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex items-center gap-2 text-sm">
                    {useHumanDelay ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
                    <span>Delay humanizado ({delayMin}-{delayMax}s)</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {useAI ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                    <span>Variação com IA</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {recipientMode === 'synced' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                    <span>Apenas contatos seguros</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {messageTemplate.toLowerCase().includes('[nome]') ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                    <span>Personalização com nome</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {scheduleEnabled ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                    <span>Agendamento {scheduleEnabled && scheduledDate && scheduledTime ? `(${scheduledDate} ${scheduledTime})` : ''}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Agendamento */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Agendamento
                  <InfoTooltip text="Agende o envio para uma data e hora específica. Ideal para enviar em horário comercial." />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Agendar envio</Label>
                    <p className="text-sm text-muted-foreground">
                      Defina data e hora para iniciar o envio
                    </p>
                  </div>
                  <Switch
                    checked={scheduleEnabled}
                    onCheckedChange={setScheduleEnabled}
                  />
                </div>

                {scheduleEnabled && (
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-2">
                      <Label>Data</Label>
                      <Input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Hora</Label>
                      <Input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Alert className="bg-blue-50 border-blue-200">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <AlertDescription className="text-blue-700">
                          <strong>Dica:</strong> Envie entre 9h e 18h em dias úteis para melhores resultados.
                        </AlertDescription>
                      </Alert>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Navegação */}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep(2)}>
                Voltar
              </Button>
              <Button onClick={() => setCurrentStep(4)}>
                Próximo: Revisar
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: Revisão e Envio */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Resumo do Envio
                </CardTitle>
                <CardDescription>
                  Revise antes de iniciar
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border p-4 space-y-1">
                    <p className="text-sm text-muted-foreground">Destinatários</p>
                    <p className="text-3xl font-bold">{getSelectedContacts.length}</p>
                  </div>
                  <div className="rounded-lg border p-4 space-y-1">
                    <p className="text-sm text-muted-foreground">Tempo estimado</p>
                    <p className="text-3xl font-bold">~{estimatedTime} min</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-medium">Configurações</h4>
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Origem:</span>
                      <span className="font-medium">
                        {recipientMode === 'manual' ? 'Manual' : recipientMode === 'list' ? 'Lista' : 'Contatos seguros'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Delay:</span>
                      <span className="font-medium">{delayMin}-{delayMax}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IA:</span>
                      <span className="font-medium">{useAI ? 'Ativada' : 'Desativada'}</span>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-medium">Preview</h4>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="whitespace-pre-wrap text-sm">{previewMessage}</p>
                  </div>
                  
                  {/* Aviso sobre IA quando ativada */}
                  {useAI && (
                    <Alert className="bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800">
                      <Sparkles className="h-4 w-4 text-purple-600" />
                      <AlertTitle className="text-purple-800 dark:text-purple-200">Variação com IA Ativada</AlertTitle>
                      <AlertDescription className="text-purple-700 dark:text-purple-300">
                        <strong>Como funciona:</strong> O sistema irá gerar automaticamente <strong>{getSelectedContacts.length} versões únicas</strong> desta mensagem, 
                        uma para cada contato. Cada versão manterá o mesmo significado mas usará palavras, estruturas e 
                        expressões diferentes (sinônimos, variações de saudação, emojis) para evitar detecção de spam pelo WhatsApp.
                        A variável [nome] será preservada e substituída pelo nome de cada contato.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                {/* Progresso de envio */}
                {sendProgress.status !== 'idle' && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Progresso</h4>
                        <Badge variant={
                          sendProgress.status === 'completed' ? 'default' : 
                          sendProgress.status === 'error' ? 'destructive' : 'secondary'
                        }>
                          {sendProgress.status === 'running' ? 'Enviando...' : 
                           sendProgress.status === 'completed' ? 'Concluído' :
                           sendProgress.status === 'error' ? 'Erro' : 'Aguardando'}
                        </Badge>
                      </div>
                      <Progress 
                        value={sendProgress.total > 0 ? ((sendProgress.sent + sendProgress.failed) / sendProgress.total) * 100 : 0} 
                        className="h-3"
                      />
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{sendProgress.sent + sendProgress.failed} de {sendProgress.total}</span>
                        <div className="flex gap-4">
                          <span className="text-green-600">{sendProgress.sent} ✓</span>
                          <span className="text-red-600">{sendProgress.failed} ✗</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
              <CardFooter className="flex justify-between border-t pt-6">
                <Button variant="outline" onClick={() => setCurrentStep(3)} disabled={isSending}>
                  Voltar
                </Button>
                {/* Botão desaparece após envio concluído */}
                {sendProgress.status !== 'completed' ? (
                  <Button 
                    size="lg"
                    onClick={handleSend}
                    disabled={!isConnected || isSending || sendProgress.status === 'running' || getSelectedContacts.length === 0}
                    className="min-w-[200px]"
                  >
                    {sendProgress.status === 'running' || isSending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Enviar ({getSelectedContacts.length})
                      </>
                    )}
                  </Button>
                ) : (
                  <Button 
                    size="lg"
                    onClick={() => {
                      // Reset para novo envio
                      setIsSending(false);
                      setSendProgress({ total: 0, sent: 0, failed: 0, status: 'idle' });
                      setCurrentStep(1);
                      setManualContacts('');
                    }}
                    className="min-w-[200px]"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Novo Envio
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>
        )}

        {/* Histórico de Campanhas - Visível no Step 1 */}
        {currentStep === 1 && campaignHistory.filter(c => c.status === 'completed').length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Envios Recentes
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowHistoryDialog(true)}>
                Ver todos
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {campaignHistory.filter(c => c.status === 'completed').slice(0, 3).map((campaign) => {
                  const sentCount = campaign.totalSent || campaign.sentCount || 0;
                  const failedCount = campaign.totalFailed || campaign.failedCount || 0;
                  
                  return (
                    <div 
                      key={campaign.id} 
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedCampaignDetails(campaign);
                        setShowCampaignDetailsDialog(true);
                      }}
                    >
                      <div>
                        <p className="font-medium">{campaign.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {campaign.executedAt ? new Date(campaign.executedAt).toLocaleDateString('pt-BR') : '-'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-green-600">
                          {sentCount} ✓
                        </Badge>
                        {failedCount > 0 && (
                          <Badge variant="outline" className="text-red-600">
                            {failedCount} ✗
                          </Badge>
                        )}
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog: Criar Lista */}
      <Dialog open={showCreateListDialog} onOpenChange={setShowCreateListDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Nova Lista</DialogTitle>
            <DialogDescription>
              Salve os contatos para usar novamente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome da Lista</Label>
              <Input
                placeholder="Ex: Clientes VIP"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                placeholder="Descrição..."
                value={newListDescription}
                onChange={(e) => setNewListDescription(e.target.value)}
              />
            </div>
            {recipientMode === 'manual' && (
              <p className="text-sm text-muted-foreground">
                {parseManualContacts(manualContacts).length} contatos serão salvos
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateListDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                const contacts = recipientMode === 'manual' 
                  ? parseManualContacts(manualContacts).map((c, i) => ({
                      id: `contact_${Date.now()}_${i}`,
                      name: c.name,
                      phone: c.phone,
                    }))
                  : [];
                createListMutation.mutate({ 
                  name: newListName, 
                  description: newListDescription,
                  contacts 
                });
              }}
              disabled={!newListName.trim() || createListMutation.isPending}
            >
              {createListMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Preview */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Preview da Mensagem</DialogTitle>
            <DialogDescription>
              Como a mensagem aparecerá
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {getSelectedContacts.slice(0, 3).map((contact, i) => (
              <div key={i} className="p-4 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">
                  Para: {contact.name || 'Sem nome'} ({formatPhone(contact.phone)})
                </p>
                <p className="whitespace-pre-wrap text-sm">
                  {applyMessageTemplate(messageTemplate, contact.name)}
                </p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowPreviewDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Histórico */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Histórico de Envios
            </DialogTitle>
            <DialogDescription>
              Clique em uma campanha para ver os detalhes dos números enviados
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-3">
              {campaignHistory.length === 0 ? (
                <div className="text-center py-12">
                  <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhuma campanha enviada ainda</p>
                </div>
              ) : (
                campaignHistory.map((campaign) => {
                  const sentCount = campaign.totalSent || campaign.sentCount || 0;
                  const failedCount = campaign.totalFailed || campaign.failedCount || 0;
                  const total = sentCount + failedCount;
                  const recipientsCount = campaign.recipients?.length || total;
                  
                  return (
                    <div 
                      key={campaign.id} 
                      className="p-4 border rounded-lg space-y-3 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedCampaignDetails(campaign);
                        setShowCampaignDetailsDialog(true);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{campaign.name}</h4>
                          <p className="text-xs text-muted-foreground">
                            {campaign.executedAt ? new Date(campaign.executedAt).toLocaleString('pt-BR') : '-'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={campaign.status === 'completed' ? 'default' : 'secondary'}>
                            {campaign.status === 'completed' ? 'Concluída' : campaign.status}
                          </Badge>
                          <Button variant="ghost" size="sm">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 text-center text-sm">
                        <div className="bg-muted rounded p-2">
                          <Users className="w-4 h-4 mx-auto mb-1" />
                          <p className="font-bold">{recipientsCount}</p>
                          <p className="text-xs text-muted-foreground">Total</p>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/20 rounded p-2">
                          <CheckCircle2 className="w-4 h-4 mx-auto mb-1 text-green-600" />
                          <p className="font-bold text-green-600">{sentCount}</p>
                          <p className="text-xs text-muted-foreground">Enviados</p>
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/20 rounded p-2">
                          <XCircle className="w-4 h-4 mx-auto mb-1 text-red-600" />
                          <p className="font-bold text-red-600">{failedCount}</p>
                          <p className="text-xs text-muted-foreground">Falhas</p>
                        </div>
                      </div>
                      
                      {total > 0 && (
                        <Progress value={(sentCount / total) * 100} className="h-2" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHistoryDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Detalhes da Campanha */}
      <Dialog open={showCampaignDetailsDialog} onOpenChange={setShowCampaignDetailsDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowCampaignDetailsDialog(false)}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <DialogTitle>{selectedCampaignDetails?.name || 'Detalhes da Campanha'}</DialogTitle>
                <DialogDescription>
                  {selectedCampaignDetails?.executedAt 
                    ? `Enviada em ${new Date(selectedCampaignDetails.executedAt).toLocaleString('pt-BR')}`
                    : 'Detalhes dos números enviados'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          {selectedCampaignDetails && (
            <div className="space-y-4">
              {/* Estatísticas */}
              <div className="grid grid-cols-4 gap-3">
                <Card className="bg-blue-50 dark:bg-blue-900/20">
                  <CardContent className="pt-4 text-center">
                    <Users className="w-6 h-6 mx-auto mb-1 text-blue-600" />
                    <p className="text-xl font-bold">{selectedCampaignDetails.recipients?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Destinatários</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 dark:bg-green-900/20">
                  <CardContent className="pt-4 text-center">
                    <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-green-600" />
                    <p className="text-xl font-bold text-green-600">
                      {selectedCampaignDetails.totalSent || selectedCampaignDetails.sentCount || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Enviados</p>
                  </CardContent>
                </Card>
                <Card className="bg-red-50 dark:bg-red-900/20">
                  <CardContent className="pt-4 text-center">
                    <XCircle className="w-6 h-6 mx-auto mb-1 text-red-600" />
                    <p className="text-xl font-bold text-red-600">
                      {selectedCampaignDetails.totalFailed || selectedCampaignDetails.failedCount || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Falhas</p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50 dark:bg-purple-900/20">
                  <CardContent className="pt-4 text-center">
                    <BarChart3 className="w-6 h-6 mx-auto mb-1 text-purple-600" />
                    <p className="text-xl font-bold text-purple-600">
                      {(() => {
                        const sent = selectedCampaignDetails.totalSent || selectedCampaignDetails.sentCount || 0;
                        const total = selectedCampaignDetails.recipients?.length || sent;
                        return total > 0 ? Math.round((sent / total) * 100) : 0;
                      })()}%
                    </p>
                    <p className="text-xs text-muted-foreground">Taxa Sucesso</p>
                  </CardContent>
                </Card>
              </div>

              {/* Mensagem enviada */}
              {selectedCampaignDetails.message && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Mensagem Enviada
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded">
                      {selectedCampaignDetails.message}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Lista de números */}
              <div className="grid md:grid-cols-2 gap-4">
                {/* Enviados com sucesso */}
                <Card className="bg-green-50/50 dark:bg-green-900/10">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-green-700">
                      <CheckCircle2 className="w-4 h-4" />
                      Enviados com Sucesso
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[200px]">
                      <div className="space-y-1">
                        {selectedCampaignDetails.results?.sent?.length ? (
                          selectedCampaignDetails.results.sent.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm bg-white dark:bg-background p-2 rounded">
                              <div>
                                {item.name && <span className="font-medium">{item.name} - </span>}
                                <span className="text-muted-foreground">{formatPhone(item.phone)}</span>
                              </div>
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                            </div>
                          ))
                        ) : selectedCampaignDetails.recipients?.length ? (
                          // Fallback: mostrar os recipients se não tiver results
                          selectedCampaignDetails.recipients.slice(0, selectedCampaignDetails.totalSent || selectedCampaignDetails.sentCount || 0).map((phone, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm bg-white dark:bg-background p-2 rounded">
                              <div>
                                {selectedCampaignDetails.recipientNames?.[phone] && (
                                  <span className="font-medium">{selectedCampaignDetails.recipientNames[phone]} - </span>
                                )}
                                <span className="text-muted-foreground">{formatPhone(phone)}</span>
                              </div>
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-4">Sem dados detalhados</p>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Falhas */}
                <Card className="bg-red-50/50 dark:bg-red-900/10">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-red-700">
                      <XCircle className="w-4 h-4" />
                      Falhas no Envio
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[200px]">
                      <div className="space-y-1">
                        {selectedCampaignDetails.results?.failed?.length ? (
                          selectedCampaignDetails.results.failed.map((item, idx) => (
                            <div key={idx} className="text-sm bg-white dark:bg-background p-2 rounded">
                              <div className="flex items-center justify-between">
                                <div>
                                  {item.name && <span className="font-medium">{item.name} - </span>}
                                  <span className="text-muted-foreground">{formatPhone(item.phone)}</span>
                                </div>
                                <XCircle className="w-4 h-4 text-red-600" />
                              </div>
                              <p className="text-xs text-red-500 mt-1">{item.error}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            {(selectedCampaignDetails.totalFailed || selectedCampaignDetails.failedCount || 0) === 0 
                              ? 'Nenhuma falha registrada' 
                              : 'Sem dados detalhados'}
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              {/* Configurações usadas */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Configurações Utilizadas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {selectedCampaignDetails.delayProfile === 'humano' ? '🐢 Delay Humano' : 
                       selectedCampaignDetails.delayProfile === 'conservador' ? '🛡️ Conservador' : 
                       '⚡ Normal'}
                    </Badge>
                    {selectedCampaignDetails.useAiVariation && (
                      <Badge variant="outline" className="bg-purple-50">
                        <Sparkles className="w-3 h-3 mr-1" />
                        Variação IA
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCampaignDetailsDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Detalhes da Lista */}
      <Dialog open={showListDetailsDialog} onOpenChange={setShowListDetailsDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookUser className="w-5 h-5" />
              {selectedListDetails?.name || 'Detalhes da Lista'}
            </DialogTitle>
            <DialogDescription>
              {selectedListDetails?.description || 'Visualize os contatos desta lista'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedListDetails && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm">Total de contatos:</span>
                <Badge>{selectedListDetails.contacts?.length || 0}</Badge>
              </div>
              
              <ScrollArea className="h-[400px] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedListDetails.contacts?.map((contact, idx) => (
                      <TableRow key={contact.id || idx}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{contact.name || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">{formatPhone(contact.phone)}</TableCell>
                      </TableRow>
                    ))}
                    {(!selectedListDetails.contacts || selectedListDetails.contacts.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          Nenhum contato nesta lista
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowListDetailsDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
