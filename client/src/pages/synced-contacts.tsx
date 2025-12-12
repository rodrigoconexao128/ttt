import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
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
  Smartphone
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
  const [sortBy, setSortBy] = useState<'name' | 'phone' | 'lastMessage'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterResponded, setFilterResponded] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('all');

  // Buscar contatos
  const { data: contacts = [], isLoading, refetch } = useQuery<Contact[]>({
    queryKey: ['/api/contacts'],
  });

  // Buscar estatísticas de WhatsApp
  const { data: whatsappStatus } = useQuery<any>({
    queryKey: ['/api/whatsapp/status'],
  });

  // Mutation para sincronizar contatos
  const syncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/contacts/sync');
    },
    onSuccess: (data: any) => {
      toast({ 
        title: 'Sincronização concluída!', 
        description: `${data.count || 0} contatos sincronizados`
      });
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

  // Calcular estatísticas
  const stats: SyncStats = {
    total: contacts.length,
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
  const toggleSelect = (phone: string) => {
    const newSet = new Set(selectedContacts);
    if (newSet.has(phone)) {
      newSet.delete(phone);
    } else {
      newSet.add(phone);
    }
    setSelectedContacts(newSet);
  };

  // Selecionar todos visíveis
  const selectAll = () => {
    if (selectedContacts.size === filteredContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(filteredContacts.map(c => c.phone)));
    }
  };

  // Exportar contatos selecionados
  const exportSelected = () => {
    const toExport = filteredContacts.filter(c => selectedContacts.has(c.phone));
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
    const phones = filteredContacts
      .filter(c => selectedContacts.has(c.phone))
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
            Gerencie todos os contatos sincronizados do WhatsApp
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button 
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || !whatsappStatus?.isConnected}
          >
            {syncMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Sincronizar do WhatsApp
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Aviso sobre sincronização */}
      <Card className="mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-900">Sincronização Inteligente Anti-Spam</h3>
              <p className="text-sm text-blue-700 mt-1">
                A sincronização traz apenas contatos que já interagiram com você (responderam mensagens). 
                Isso é uma medida anti-spam que protege seu número e garante envios mais seguros para campanhas de marketing.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status WhatsApp */}
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
            Todos ({contacts.length})
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
              <div className="flex gap-2">
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
                  onClick={() => setSelectedContacts(new Set())}
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {filteredContacts.length} contatos encontrados
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={selectAll}>
              {selectedContacts.size === filteredContacts.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
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
                    onClick={() => toggleSelect(phone)}
                  >
                    <Checkbox
                      checked={selectedContacts.has(phone)}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={() => toggleSelect(phone)}
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
    </div>
  );
}
