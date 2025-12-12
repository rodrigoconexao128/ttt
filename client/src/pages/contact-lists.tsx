import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Plus, 
  Trash2, 
  Search,
  Eye,
  BookUser,
  Users,
  Edit,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Phone,
  UserPlus,
  FileText,
  Import,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface Contact {
  id: string;
  name: string;
  phone: string;
}

interface ContactList {
  id: string;
  name: string;
  description: string;
  contacts: Contact[];
  createdAt: string;
}

export default function ContactListsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Estados
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;
  
  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showAddContactsDialog, setShowAddContactsDialog] = useState(false);
  const [selectedList, setSelectedList] = useState<ContactList | null>(null);
  
  // Form states
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  const [manualContacts, setManualContacts] = useState("");
  const [addContactsMode, setAddContactsMode] = useState<'manual' | 'synced'>('manual');
  
  // Buscar listas de contatos
  const { data: contactLists = [], isLoading, refetch } = useQuery<ContactList[]>({
    queryKey: ["/api/contacts/lists"],
  });

  // Buscar contatos sincronizados
  const { data: syncedContacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts/synced"],
  });

  // Mutation para criar lista
  const createListMutation = useMutation({
    mutationFn: async ({ name, description, contacts }: { name: string; description: string; contacts?: Contact[] }) => {
      const response = await apiRequest("POST", "/api/contacts/lists", { name, description, contacts });
      return response.json();
    },
    onSuccess: () => {
      setShowCreateDialog(false);
      setNewListName("");
      setNewListDescription("");
      setManualContacts("");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/contacts/lists"] });
      toast({ title: "Lista criada!", description: "Sua nova lista de contatos foi criada." });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar lista", description: error.message, variant: "destructive" });
    },
  });

  // Parsear contatos do textarea
  const parseManualContacts = (text: string): Contact[] => {
    const lines = text.split('\n').filter(line => line.trim());
    const contacts: Contact[] = [];
    
    for (const line of lines) {
      const parts = line.split(/[,;\t]/).map(p => p.trim());
      
      if (parts.length >= 2) {
        const name = parts[0];
        const phone = parts[1].replace(/\D/g, '');
        if (phone.length >= 10 && phone.length <= 15) {
          contacts.push({ id: `contact_${Date.now()}_${contacts.length}`, name, phone });
        }
      } else if (parts.length === 1) {
        const phone = parts[0].replace(/\D/g, '');
        if (phone.length >= 10 && phone.length <= 15) {
          contacts.push({ id: `contact_${Date.now()}_${contacts.length}`, name: '', phone });
        }
      }
    }
    
    return contacts;
  };

  // Formatar telefone
  const formatPhone = (phone: string): string => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 11) {
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    } else if (clean.length === 13) {
      return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
    }
    return phone;
  };

  // Filtrar listas
  const filteredLists = useMemo(() => {
    if (!searchTerm) return contactLists;
    const term = searchTerm.toLowerCase();
    return contactLists.filter(l => 
      l.name.toLowerCase().includes(term) ||
      l.description?.toLowerCase().includes(term)
    );
  }, [contactLists, searchTerm]);

  // Paginação
  const totalPages = Math.ceil(filteredLists.length / itemsPerPage);
  const paginatedLists = filteredLists.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                <BookUser className="w-4 h-4" /> Listas de Contatos
              </div>
              <h1 className="text-2xl font-bold mt-1">Gerenciar Listas</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Crie e gerencie listas de contatos para envios em massa
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Nova Lista
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Barra de busca */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar listas..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>

        {/* Estatísticas */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-lg dark:bg-blue-900/30">
                  <BookUser className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{contactLists.length}</p>
                  <p className="text-sm text-muted-foreground">Listas criadas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-lg dark:bg-green-900/30">
                  <Users className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {contactLists.reduce((sum, l) => sum + (l.contacts?.length || 0), 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Contatos totais</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-100 rounded-lg dark:bg-purple-900/30">
                  <Phone className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{syncedContacts.length}</p>
                  <p className="text-sm text-muted-foreground">Sincronizados</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista de listas */}
        {contactLists.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <BookUser className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhuma lista criada</h3>
                <p className="text-muted-foreground mb-6">
                  Crie sua primeira lista de contatos para começar
                </p>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Lista
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Suas Listas</CardTitle>
              <CardDescription>
                {filteredLists.length} lista{filteredLists.length !== 1 ? 's' : ''} encontrada{filteredLists.length !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {paginatedLists.map((list) => (
                  <div 
                    key={list.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-muted rounded-lg">
                        <BookUser className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-medium">{list.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {list.description || 'Sem descrição'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">
                        <Users className="w-3 h-3 mr-1" />
                        {list.contacts?.length || 0}
                      </Badge>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setSelectedList(list);
                          setShowDetailsDialog(true);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setSelectedList(list);
                          setShowAddContactsDialog(true);
                        }}
                      >
                        <UserPlus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t mt-4">
                  <span className="text-sm text-muted-foreground">
                    Página {page} de {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog: Criar Lista */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Criar Nova Lista</DialogTitle>
            <DialogDescription>
              Crie uma lista de contatos para usar no envio em massa
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome da Lista *</Label>
                <Input
                  placeholder="Ex: Clientes VIP"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição (opcional)</Label>
                <Input
                  placeholder="Descrição..."
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                />
              </div>
            </div>

            <Tabs value={addContactsMode} onValueChange={(v) => setAddContactsMode(v as 'manual' | 'synced')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="manual">
                  <FileText className="w-4 h-4 mr-2" />
                  Manual
                </TabsTrigger>
                <TabsTrigger value="synced">
                  <Import className="w-4 h-4 mr-2" />
                  Sincronizados
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="manual" className="space-y-3">
                <Label>Contatos (Nome, Número - um por linha)</Label>
                <Textarea
                  placeholder={`João Silva, 17991234567
Maria Santos, 11987654321
21999887766`}
                  value={manualContacts}
                  onChange={(e) => setManualContacts(e.target.value)}
                  className="min-h-[150px] font-mono text-sm"
                />
                <p className="text-sm text-muted-foreground">
                  {parseManualContacts(manualContacts).length} contatos identificados
                </p>
              </TabsContent>
              
              <TabsContent value="synced" className="space-y-3">
                {syncedContacts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-4" />
                    <p>Nenhum contato sincronizado disponível</p>
                    <p className="text-sm">Sincronize seus contatos no Envio em Massa primeiro</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[200px] border rounded-md p-2">
                    {syncedContacts.slice(0, 50).map((contact) => (
                      <div key={contact.id} className="flex items-center justify-between py-2 px-2 hover:bg-muted rounded">
                        <span className="font-medium">{contact.name || 'Sem nome'}</span>
                        <span className="text-sm text-muted-foreground">{formatPhone(contact.phone)}</span>
                      </div>
                    ))}
                  </ScrollArea>
                )}
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                const contacts = addContactsMode === 'manual' 
                  ? parseManualContacts(manualContacts)
                  : syncedContacts;
                createListMutation.mutate({ 
                  name: newListName, 
                  description: newListDescription,
                  contacts 
                });
              }}
              disabled={!newListName.trim() || createListMutation.isPending}
            >
              {createListMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar Lista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Detalhes da Lista */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookUser className="w-5 h-5" />
              {selectedList?.name || 'Detalhes da Lista'}
            </DialogTitle>
            <DialogDescription>
              {selectedList?.description || 'Visualize os contatos desta lista'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedList && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm">Total de contatos:</span>
                <Badge>{selectedList.contacts?.length || 0}</Badge>
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
                    {selectedList.contacts?.map((contact, idx) => (
                      <TableRow key={contact.id || idx}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{contact.name || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">{formatPhone(contact.phone)}</TableCell>
                      </TableRow>
                    ))}
                    {(!selectedList.contacts || selectedList.contacts.length === 0) && (
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
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Adicionar Contatos */}
      <Dialog open={showAddContactsDialog} onOpenChange={setShowAddContactsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Contatos</DialogTitle>
            <DialogDescription>
              Adicione mais contatos à lista "{selectedList?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              placeholder={`João Silva, 17991234567
Maria Santos, 11987654321`}
              value={manualContacts}
              onChange={(e) => setManualContacts(e.target.value)}
              className="min-h-[150px] font-mono text-sm"
            />
            <p className="text-sm text-muted-foreground">
              {parseManualContacts(manualContacts).length} novos contatos identificados
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddContactsDialog(false); setManualContacts(''); }}>
              Cancelar
            </Button>
            <Button disabled={parseManualContacts(manualContacts).length === 0}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
