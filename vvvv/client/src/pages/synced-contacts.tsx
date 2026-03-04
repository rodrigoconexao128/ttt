import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Users, 
  RefreshCw, 
  Search, 
  Download, 
  Upload, 
  Trash2,
  Phone,
  User,
  MessageSquare,
  CheckCircle,
  Clock,
  Shield,
  Info,
  AlertTriangle,
  FileText,
  Plus,
  X,
  Filter,
  SortAsc,
  SortDesc,
  Copy,
  CheckCheck,
  UserPlus,
  Database,
  Zap,
  Calendar,
  MessageCircle,
  Smartphone,
  List,
  Send
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Contact {
  id?: string;
  jid?: string;
  phone: string;
  name?: string;
  pushName?: string;
  isGroup?: boolean;
  lastSeen?: string;
  hasResponded?: boolean;
  conversationCount?: number;
  lastMessageAt?: string;
  createdAt?: string;
  tags?: string[];
}

interface SyncStats {
  total: number;
  withName: number;
  responded: number;
  groups: number;
}

export default function SyncedContactsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Estados
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'phone' | 'lastMessage'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterResponded, setFilterResponded] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [selectedContactMap, setSelectedContactMap] = useState<Record<string, Contact>>({});
  const [activeTab, setActiveTab] = useState('all');

  // Estados do diálogo de criar lista
  const [showCreateListDialog, setShowCreateListDialog] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');

  // Debounce para busca (400ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page ao mudar busca
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // ===== AGENDA LIVE: Contatos em Memória (SEM BANCO) =====
  // SEMPRE busca ao carregar para verificar se há cache no servidor
  // Se não tiver cache, mostra mensagem para sincronizar
  // O cache dura 2 horas e é mantido na memória do servidor
  
  const { data: agendaData, isLoading: isLoadingAgenda, refetch: refetchAgenda } = useQuery<{
    status: 'ready' | 'syncing' | 'not_synced' | 'error';
    contacts: Contact[];
    total: number;
    message: string;
    syncedAt?: string;
    expiresIn?: string;
  }>({
    queryKey: ['/api/contacts/agenda-live'],
    enabled: true, // SEMPRE buscar ao carregar a página
    staleTime: 30000, // Considerar dados frescos por 30 segundos
    refetchOnWindowFocus: true, // Refetch ao voltar para a aba
    refetchInterval: (query) => {
      // Se está sincronizando, atualizar a cada 3 segundos
      const data = query.state.data;
      if (data && data.status === 'syncing') {
        return 3000;
      }
      return false;
    },
  });

  // Buscar contatos do banco com paginação e busca
  const { data: syncedData, isLoading, refetch } = useQuery<{
    contacts: Contact[];
    total: number;
    page: number;
    totalPages: number;
    syncStatus?: {
      status: string;
      progress: number;
      message: string;
    };
  }>({
    queryKey: ['/api/contacts/synced', page, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await apiRequest('GET', `/api/contacts/synced?${params}`);
      return res.json();
    },
    enabled: true,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    refetchInterval: (data) => {
      // Se está sincronizando, atualizar a cada 5 segundos
      if (data && data.syncStatus?.status === 'running') {
        return 5000;
      }
      return false;
    },
  });

  // ===== PRIORIDADE: Agenda-Live (memória) > DB (fallback) =====
  // Se tiver contatos na agenda-live, usar eles (economiza banco)
  // Senão, usar do banco como fallback (histórico)
  const dbContacts = syncedData?.contacts || [];
  const dbTotal = syncedData?.total || 0;
  const dbTotalPages = syncedData?.totalPages || 1;

  // Preferir agenda-live quando ela é maior ou igual ao banco
  // Caso contrário, usar banco (histórico completo)
  const contacts = dbContacts;
  
  // Status da sincronização - combinar ambos
  const syncStatus = agendaData?.status === 'syncing' 
    ? { status: 'running', progress: 50, message: agendaData.message }
    : syncedData?.syncStatus;

  // Mostrar se está usando dados da agenda-live ou do banco
  const isUsingAgendaLive = false;
  const isUsingDatabase = dbContacts.length > 0;

  // Buscar estatísticas de WhatsApp
  const { data: whatsappStatus } = useQuery<any>({
    queryKey: ['/api/whatsapp/connection'],
  });

  // Mutation para sincronizar contatos (sincronização rápida - apenas conversas)
  const syncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/contacts/sync');
    },
    onSuccess: (data: any) => {
      toast({ 
        title: data.message || 'Sincronização iniciada!', 
        description: data.status === 'started' 
          ? 'Os contatos aparecerão em até 10 minutos. Você pode continuar usando o sistema.'
          : data.status === 'already_running'
          ? 'Aguarde a sincronização atual terminar.'
          : 'Sincronização em andamento...',
      });
      // Atualizar a cada 5 segundos enquanto sincroniza
      setTimeout(() => refetch(), 5000);
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Erro na sincronização', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // ===== SINCRONIZAÇÃO DA AGENDA EM MEMÓRIA (sem banco) =====
  // Cliente pode sair da página - sync acontece em background no servidor
  // Cache dura 2 HORAS - não deixa o site lento
  const agendaSyncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/contacts/agenda-live/refresh');
    },
    onSuccess: (data: any) => {
      // Se já retornou contatos, mostra sucesso
      if (data.count > 0) {
        toast({ 
          title: '✅ Agenda Sincronizada!', 
          description: data.message,
        });
        // Refetch imediato para mostrar os contatos
        refetchAgenda();
      } else {
        // Ainda sincronizando - polling a cada 2s por 20s
        toast({ 
          title: '📱 Sincronizando...', 
          description: 'Você pode continuar usando o sistema. Os contatos aparecerão em alguns segundos.',
        });
        let attempts = 0;
        const interval = setInterval(() => {
          refetchAgenda();
          attempts++;
          if (attempts >= 10) clearInterval(interval);
        }, 2000);
      }
    },
    onError: (error: any) => {
      toast({ 
        title: 'Erro na sincronização da agenda', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Mutation para sincronização COMPLETA (agenda WhatsApp + conversas)
  const fullSyncMutation = useMutation({
    mutationFn: async (force: boolean = false) => {
      return apiRequest('POST', '/api/contacts/full-sync', { force });
    },
    onSuccess: (data: any) => {
      toast({
        title: data.success ? '✅ Sincronização Completa' : '⏳ Aguarde',
        description: data.message,
      });
      // Atualizar a cada 5 segundos enquanto sincroniza
      setTimeout(() => {
        refetch();
        refetchFullSyncStatus();
      }, 3000);
    },
    onError: (error: any) => {
      toast({
        title: 'Erro na sincronização completa',
        description: error.message,
        variant: 'destructive'
      });
    },
  });

  // ======================================================================
  // 📱 SINCRONIZAÇÃO COMPLETA DA AGENDA DO WHATSAPP
  // ======================================================================
  // Este mutation força uma reconexão do WhatsApp que dispara o syncFullHistory
  // e faz o Baileys emitir TODOS os contatos da agenda via contacts.upsert
  // ======================================================================
  const syncAgendaMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/contacts/sync-agenda');
    },
    onSuccess: (data: any) => {
      toast({
        title: data.success ? '📱 Sincronização Iniciada!' : '⚠️ Aviso',
        description: data.message,
      });
      // Polling para atualizar contatos enquanto sincroniza
      let attempts = 0;
      const interval = setInterval(() => {
        refetchAgenda();
        attempts++;
        if (attempts >= 30) clearInterval(interval); // 60 segundos máximo
      }, 2000);
    },
    onError: (error: any) => {
      toast({
        title: 'Erro na sincronização da agenda',
        description: error.message,
        variant: 'destructive'
      });
    },
  });

  // Query para status da sincronização completa
  const { data: fullSyncStatusData, refetch: refetchFullSyncStatus } = useQuery<any>({
    queryKey: ['/api/contacts/full-sync/status'],
    refetchInterval: (data) => {
      if (data && (data.status === 'running' || data.status === 'queued')) {
        return 5000;
      }
      return false;
    },
  });

  // Mutation para deletar contato
  const deleteMutation = useMutation({
    mutationFn: async (contactId: string) => {
      return apiRequest('DELETE', `/api/contacts/${contactId}`);
    },
    onSuccess: () => {
      toast({ title: 'Contato removido' });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Erro ao remover', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Mutation para criar lista de contatos a partir da seleção
  const createListMutation = useMutation({
    mutationFn: async ({ name, description, contacts }: { name: string; description: string; contacts: Contact[] }) => {
      const response = await apiRequest('POST', '/api/contacts/lists', { name, description, contacts });
      return response.json();
    },
    onSuccess: (data) => {
      setShowCreateListDialog(false);
      setNewListName('');
      setNewListDescription('');
      setSelectedContacts(new Set());
      setSelectedContactMap({});
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/lists'] });
      toast({ 
        title: 'Lista criada com sucesso!', 
        description: `Lista "${data.name || newListName}" com ${selectedContacts.size} contatos.`
      });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Erro ao criar lista', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Handler para criar lista
  const handleCreateList = () => {
    if (!newListName.trim()) {
      toast({ title: 'Digite um nome para a lista', variant: 'destructive' });
      return;
    }

    const selectedContactsList = Object.values(selectedContactMap);
    createListMutation.mutate({
      name: newListName,
      description: newListDescription,
      contacts: selectedContactsList
    });
  };

  // Calcular estatísticas
  const stats: SyncStats = {
    total: dbTotal,
    withName: contacts.filter(c => c.name || c.pushName).length,
    responded: contacts.filter(c => c.hasResponded || c.conversationCount).length,
    groups: contacts.filter(c => c.isGroup).length,
  };

  // Filtrar e ordenar contatos
  const filteredContacts = contacts
    .filter(contact => {
      // Filtro de busca
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        contact.name?.toLowerCase().includes(searchLower) ||
        contact.pushName?.toLowerCase().includes(searchLower) ||
        contact.phone?.includes(searchTerm);

      // Filtro de respondidos
      const matchesResponded = !filterResponded || contact.hasResponded || contact.conversationCount;

      // Filtro por tab
      const matchesTab = activeTab === 'all' || 
        (activeTab === 'responded' && (contact.hasResponded || contact.conversationCount)) ||
        (activeTab === 'groups' && contact.isGroup) ||
        (activeTab === 'recent' && contact.lastMessageAt);

      return matchesSearch && matchesResponded && matchesTab;
    })
    .sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          const nameA = a.name || a.pushName || '';
          const nameB = b.name || b.pushName || '';
          comparison = nameA.localeCompare(nameB);
          break;
        case 'phone':
          comparison = (a.phone || '').localeCompare(b.phone || '');
          break;
        case 'lastMessage':
          const dateA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const dateB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          comparison = dateB - dateA;
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

  // Toggle seleção de contato
  const toggleSelect = (contact: Contact) => {
    const phone = contact.phone || contact.jid?.replace('@s.whatsapp.net', '') || '';
    const newSet = new Set(selectedContacts);
    const nextMap = { ...selectedContactMap };

    if (newSet.has(phone)) {
      newSet.delete(phone);
      delete nextMap[phone];
    } else {
      newSet.add(phone);
      nextMap[phone] = contact;
    }

    setSelectedContacts(newSet);
    setSelectedContactMap(nextMap);
  };

  // Selecionar todos visíveis
  const selectAll = () => {
    const allVisibleSelected = filteredContacts.length > 0 &&
      filteredContacts.every(contact => {
        const phone = contact.phone || contact.jid?.replace('@s.whatsapp.net', '') || '';
        return selectedContacts.has(phone);
      });

    if (allVisibleSelected) {
      const newSet = new Set(selectedContacts);
      const nextMap = { ...selectedContactMap };

      filteredContacts.forEach(contact => {
        const phone = contact.phone || contact.jid?.replace('@s.whatsapp.net', '') || '';
        newSet.delete(phone);
        delete nextMap[phone];
      });

      setSelectedContacts(newSet);
      setSelectedContactMap(nextMap);
    } else {
      const newSet = new Set(selectedContacts);
      const nextMap = { ...selectedContactMap };

      filteredContacts.forEach(contact => {
        const phone = contact.phone || contact.jid?.replace('@s.whatsapp.net', '') || '';
        newSet.add(phone);
        nextMap[phone] = contact;
      });

      setSelectedContacts(newSet);
      setSelectedContactMap(nextMap);
    }
  };

  // Exportar contatos selecionados
  const exportSelected = () => {
    const toExport = Object.values(selectedContactMap);
    const csv = toExport.map(c => `${c.name || c.pushName || 'Sem nome'},${c.phone}`).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contatos_whatsapp_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: `${toExport.length} contatos exportados!` });
  };

  // Copiar números selecionados
  const copySelected = () => {
    const phones = Object.values(selectedContactMap)
      .map(c => c.phone)
      .join('\n');
    
    navigator.clipboard.writeText(phones);
    toast({ title: 'Números copiados para área de transferência!' });
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Smartphone className="h-8 w-8 text-primary" />
            Contatos Sincronizados
          </h1>
          <p className="text-muted-foreground mt-1">
            Sincronize os contatos da sua agenda do WhatsApp
          </p>
        </div>
        <div className="flex gap-2">
          {/* Botão 1: Sincronizar Agenda (rápido - do cache) */}
          <Button
            onClick={() => {
              agendaSyncMutation.mutate();
            }}
            disabled={agendaSyncMutation.isPending || isLoadingAgenda || !whatsappStatus?.isConnected}
            className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-6"
            size="lg"
          >
            {agendaSyncMutation.isPending || isLoadingAgenda ? (
              <>
                <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                Sincronizando...
              </>
            ) : agendaData?.status === 'ready' ? (
              <>
                <RefreshCw className="h-5 w-5 mr-2" />
                Atualizar
              </>
            ) : (
              <>
                <Smartphone className="h-5 w-5 mr-2" />
                Sincronizar
              </>
            )}
          </Button>

          {/* Botão 2: Sincronizar AGENDA COMPLETA (força reconexão) */}
          <Button
            onClick={() => {
              if (window.confirm('Isso vai reconectar seu WhatsApp para buscar TODOS os contatos da agenda. Continuar?')) {
                syncAgendaMutation.mutate();
              }
            }}
            disabled={syncAgendaMutation.isPending || !whatsappStatus?.isConnected}
            variant="outline"
            className="border-blue-400 text-blue-700 hover:bg-blue-50"
            size="lg"
          >
            {syncAgendaMutation.isPending ? (
              <>
                <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                Reconectando...
              </>
            ) : (
              <>
                <Database className="h-5 w-5 mr-2" />
                Buscar Agenda Completa
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Banner de Sucesso - Contatos Carregados */}
      {isUsingAgendaLive && (
        <Card className="mb-6 bg-gradient-to-br from-green-50 to-emerald-50 border-green-300">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <div className="flex-1">
                <h3 className="font-medium text-green-900 flex items-center gap-2">
                  ✅ {agendaData?.total} contatos carregados
                  <Badge variant="outline" className="bg-green-100 text-green-700 text-xs">
                    Em Memória
                  </Badge>
                </h3>
                <p className="text-sm text-green-700 mt-1">
                  Cache expira em: {agendaData?.expiresIn} • Clique no botão para atualizar
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Banner de Sucesso - Contatos do Banco (Histórico) */}
      {isUsingDatabase && !isUsingAgendaLive && (
        <Card className="mb-6 bg-gradient-to-br from-slate-50 to-blue-50 border-blue-300">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Database className="h-6 w-6 text-blue-600" />
              <div className="flex-1">
                <h3 className="font-medium text-blue-900 flex items-center gap-2">
                  ✅ {contacts.length} contatos carregados
                  <Badge variant="outline" className="bg-blue-100 text-blue-700 text-xs">
                    Histórico
                  </Badge>
                </h3>
                <p className="text-sm text-blue-700 mt-1">
                  Mostrando contatos salvos no banco (sincronização completa)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Banner de Sincronizando */}
      {(agendaSyncMutation.isPending || agendaData?.status === 'syncing') && (
        <Card className="mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-300">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
              <div className="flex-1">
                <h3 className="font-medium text-blue-900">📱 Sincronizando Agenda...</h3>
                <p className="text-sm text-blue-700 mt-1">
                  Aguarde enquanto carregamos os contatos do seu WhatsApp
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Banner Inicial - Quando não tem cache */}
      {agendaData?.status === 'not_synced' && whatsappStatus?.isConnected && dbTotal === 0 && (
        <Card className="mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-300">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Smartphone className="h-6 w-6 text-blue-600" />
              <div className="flex-1">
                <h3 className="font-medium text-blue-900">📱 Clique em "Sincronizar Agenda" para carregar seus contatos</h3>
                <p className="text-sm text-blue-700 mt-1">
                  Os contatos são carregados sob demanda para economizar recursos. Não salvamos no banco de dados.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status WhatsApp não conectado */}
      {!whatsappStatus?.isConnected && (
        <Card className="mb-6 bg-yellow-50 border-yellow-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <div>
                <h3 className="font-medium text-yellow-900">WhatsApp não conectado</h3>
                <p className="text-sm text-yellow-700">
                  Conecte seu WhatsApp na página de configurações para sincronizar contatos.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 text-center">
            <Database className="h-8 w-8 mx-auto mb-2 text-blue-500" />
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total de Contatos</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50">
          <CardContent className="pt-4 text-center">
            <CheckCheck className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p className="text-2xl font-bold text-green-600">{stats.responded}</p>
            <p className="text-xs text-muted-foreground">Já Responderam</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <User className="h-8 w-8 mx-auto mb-2 text-purple-500" />
            <p className="text-2xl font-bold">{stats.withName}</p>
            <p className="text-xs text-muted-foreground">Com Nome</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Users className="h-8 w-8 mx-auto mb-2 text-orange-500" />
            <p className="text-2xl font-bold">{stats.groups}</p>
            <p className="text-xs text-muted-foreground">Grupos</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros e Busca */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-center">
            {/* Busca */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Filtro de Respondidos */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="filter-responded"
                checked={filterResponded}
                onCheckedChange={(checked) => setFilterResponded(!!checked)}
              />
              <label htmlFor="filter-responded" className="text-sm cursor-pointer">
                Apenas que responderam
              </label>
            </div>

            {/* Ordenação */}
            <div className="flex items-center gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="name">Nome</option>
                <option value="phone">Telefone</option>
                <option value="lastMessage">Última Msg</option>
              </select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              >
                {sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="all">
            <Users className="h-4 w-4 mr-1" />
            Todos ({dbTotal})
          </TabsTrigger>
          <TabsTrigger value="responded">
            <CheckCheck className="h-4 w-4 mr-1" />
            Responderam ({stats.responded})
          </TabsTrigger>
          <TabsTrigger value="groups">
            <Users className="h-4 w-4 mr-1" />
            Grupos ({stats.groups})
          </TabsTrigger>
          <TabsTrigger value="recent">
            <Clock className="h-4 w-4 mr-1" />
            Recentes
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Ações em Massa */}
      {selectedContacts.size > 0 && (
        <Card className="mb-4 bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-blue-600" />
                <span className="font-medium">{selectedContacts.size} contatos selecionados</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={() => setShowCreateListDialog(true)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <List className="h-4 w-4 mr-1" />
                  Criar Lista
                </Button>
                <Button variant="outline" size="sm" onClick={copySelected}>
                  <Copy className="h-4 w-4 mr-1" />
                  Copiar Números
                </Button>
                <Button variant="outline" size="sm" onClick={exportSelected}>
                  <Download className="h-4 w-4 mr-1" />
                  Exportar CSV
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setSelectedContacts(new Set());
                    setSelectedContactMap({});
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de Contatos */}
      <Card>
        <CardHeader className="pb-2">
          {/* Campo de Busca */}
          <div className="mb-4">
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
              icon={<Search className="w-4 h-4" />}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {dbTotal > 0 ? `${dbTotal} contatos` : `${filteredContacts.length} contatos encontrados`}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={selectAll}>
              {(filteredContacts.length > 0 && filteredContacts.every(contact => {
                const phone = contact.phone || contact.jid?.replace('@s.whatsapp.net', '') || '';
                return selectedContacts.has(phone);
              })) ? 'Desmarcar Todos' : 'Selecionar Todos'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">Carregando contatos...</p>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium mb-2">Nenhum contato encontrado</h3>
              <p className="text-muted-foreground mb-4">
                {contacts.length === 0 
                  ? 'Sincronize seus contatos do WhatsApp para começar'
                  : 'Tente ajustar os filtros de busca'
                }
              </p>
              {contacts.length === 0 && whatsappStatus?.isConnected && (
                <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                  <Download className="h-4 w-4 mr-2" />
                  Sincronizar Agora
                </Button>
              )}
            </div>
          ) : (
            <>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredContacts.map((contact, idx) => {
                const displayName = contact.name || contact.pushName || 'Sem nome';
                const phone = contact.phone || contact.jid?.replace('@s.whatsapp.net', '') || '';
                
                return (
                  <div
                    key={contact.id || idx}
                    className={`flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors cursor-pointer ${
                      selectedContacts.has(phone) ? 'bg-blue-50 border-blue-200' : ''
                    }`}
                    onClick={() => toggleSelect(contact)}
                  >
                    <Checkbox
                      checked={selectedContacts.has(phone)}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={() => toggleSelect(contact)}
                    />
                    
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      contact.isGroup ? 'bg-orange-100' : 'bg-blue-100'
                    }`}>
                      {contact.isGroup ? (
                        <Users className="h-5 w-5 text-orange-600" />
                      ) : (
                        <User className="h-5 w-5 text-blue-600" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{displayName}</p>
                        {(contact.hasResponded || contact.conversationCount) && (
                          <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                            <CheckCheck className="h-3 w-3 mr-1" />
                            Seguro
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{phone}</p>
                    </div>

                    {/* Meta */}
                    <div className="text-right text-xs text-muted-foreground">
                      {contact.lastMessageAt && (
                        <p className="flex items-center gap-1 justify-end">
                          <MessageCircle className="h-3 w-3" />
                          {new Date(contact.lastMessageAt).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                      {contact.conversationCount && (
                        <p>{contact.conversationCount} msgs</p>
                      )}
                    </div>

                    {/* Ações */}
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(phone);
                          toast({ title: 'Número copiado!' });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Controles de Paginação */}
            {dbTotalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-6 pt-6 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  ← Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {page} de {dbTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= dbTotalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Próxima →
                </Button>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Dicas */}
      <Card className="mt-6 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
            <Info className="h-4 w-4" />
            Dicas de Uso
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-amber-700 space-y-2">
          <p>• <strong>Contatos marcados como "Seguro"</strong> já responderam mensagens - são ideais para campanhas</p>
          <p>• Use a <strong>exportação CSV</strong> para backup ou para usar em Envio em Massa</p>
          <p>• <strong>Sincronize regularmente</strong> para manter sua lista atualizada com novos contatos</p>
          <p>• Contatos de <strong>grupos</strong> aparecem separadamente para facilitar campanhas segmentadas</p>
          <p>• Na página de <strong>Envio em Massa</strong>, você pode selecionar estes contatos diretamente</p>
        </CardContent>
      </Card>

      {/* Diálogo para Criar Lista */}
      <Dialog open={showCreateListDialog} onOpenChange={setShowCreateListDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <List className="h-5 w-5 text-green-600" />
              Criar Nova Lista
            </DialogTitle>
            <DialogDescription>
              Crie uma lista com os {selectedContacts.size} contatos selecionados para usar no Envio em Massa.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="list-name">Nome da Lista *</Label>
              <Input
                id="list-name"
                placeholder="Ex: Clientes VIP, Leads Janeiro..."
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="list-description">Descrição (opcional)</Label>
              <Textarea
                id="list-description"
                placeholder="Adicione uma descrição para identificar esta lista..."
                value={newListDescription}
                onChange={(e) => setNewListDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="p-3 rounded-lg bg-muted/50 space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4 text-blue-500" />
                Resumo
              </div>
              <p className="text-sm text-muted-foreground">
                {selectedContacts.size} contatos serão adicionados a esta lista.
              </p>
              <p className="text-xs text-muted-foreground">
                Você poderá usar esta lista na página de Envio em Massa.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowCreateListDialog(false)}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateList}
              disabled={!newListName.trim() || createListMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {createListMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Lista
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
