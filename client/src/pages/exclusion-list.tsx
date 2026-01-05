import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { 
  Ban, 
  Plus, 
  Trash2, 
  Save,
  Search,
  User,
  Phone,
  RefreshCw,
  ChevronLeft,
  Settings,
  AlertCircle,
  CheckCircle,
  XCircle,
  UserX,
  MessageCircle,
  BellOff,
  Power,
  PowerOff,
  RotateCcw,
  Info
} from "lucide-react";

// Interface para item da lista de exclusão
interface ExclusionListItem {
  id: string;
  userId: string;
  phoneNumber: string;
  contactName: string | null;
  reason: string | null;
  excludeFromFollowup: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Interface para configuração de exclusão
interface ExclusionConfig {
  id: string;
  userId: string;
  isEnabled: boolean;
  followupExclusionEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function ExclusionListPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Estados do formulário
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newExcludeFollowup, setNewExcludeFollowup] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<ExclusionListItem | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Query para buscar configuração (usando queryKey padrão)
  const { data: config, isLoading: configLoading } = useQuery<ExclusionConfig>({
    queryKey: ["/api/exclusion/config"],
  });

  // Query para buscar lista de exclusão
  const { data: exclusionList, isLoading: listLoading } = useQuery<ExclusionListItem[]>({
    queryKey: ["/api/exclusion/list"],
  });

  // Mutation para atualizar configuração
  const updateConfigMutation = useMutation({
    mutationFn: async (data: Partial<ExclusionConfig>) => {
      const response = await apiRequest("PUT", "/api/exclusion/config", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusion/config"] });
      toast({
        title: "✅ Configuração atualizada",
        description: "As configurações da lista de exclusão foram salvas.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Erro",
        description: error.message || "Erro ao atualizar configurações",
        variant: "destructive",
      });
    },
  });

  // Mutation para adicionar número
  const addItemMutation = useMutation({
    mutationFn: (data: { phoneNumber: string; contactName?: string; reason?: string; excludeFromFollowup: boolean }) =>
      apiRequest("POST", "/api/exclusion/list", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusion/list"] });
      setShowAddDialog(false);
      resetForm();
      toast({
        title: "🚫 Número adicionado",
        description: "O número foi adicionado à lista de exclusão.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Erro",
        description: error.message || "Erro ao adicionar número",
        variant: "destructive",
      });
    },
  });

  // Mutation para atualizar item
  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ExclusionListItem> }) =>
      apiRequest("PUT", `/api/exclusion/list/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusion/list"] });
      setShowEditDialog(false);
      setEditingItem(null);
      toast({
        title: "✅ Item atualizado",
        description: "As alterações foram salvas.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Erro",
        description: error.message || "Erro ao atualizar item",
        variant: "destructive",
      });
    },
  });

  // Mutation para remover item (soft delete)
  const removeItemMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/exclusion/list/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusion/list"] });
      toast({
        title: "🔄 Número desativado",
        description: "O número foi desativado da lista de exclusão.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Erro",
        description: error.message || "Erro ao remover número",
        variant: "destructive",
      });
    },
  });

  // Mutation para remover permanentemente
  const deleteItemMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/exclusion/list/${id}?permanent=true`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusion/list"] });
      toast({
        title: "🗑️ Número removido",
        description: "O número foi removido permanentemente da lista.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Erro",
        description: error.message || "Erro ao deletar número",
        variant: "destructive",
      });
    },
  });

  // Mutation para reativar item
  const reactivateItemMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/exclusion/list/${id}/reactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusion/list"] });
      toast({
        title: "✅ Número reativado",
        description: "O número foi reativado na lista de exclusão.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Erro",
        description: error.message || "Erro ao reativar número",
        variant: "destructive",
      });
    },
  });

  // Filtrar lista
  const filteredList = useMemo(() => {
    if (!exclusionList) return [];
    
    if (!searchTerm.trim()) return exclusionList;
    
    const search = searchTerm.toLowerCase();
    return exclusionList.filter(
      (item) =>
        item.phoneNumber.includes(search) ||
        item.contactName?.toLowerCase().includes(search) ||
        item.reason?.toLowerCase().includes(search)
    );
  }, [exclusionList, searchTerm]);

  // Separar ativos e inativos
  const activeItems = filteredList.filter((item) => item.isActive);
  const inactiveItems = filteredList.filter((item) => !item.isActive);

  // Resetar formulário
  const resetForm = () => {
    setNewPhone("");
    setNewName("");
    setNewReason("");
    setNewExcludeFollowup(true);
  };

  // Formatar número de telefone para exibição
  const formatPhone = (phone: string) => {
    if (phone.length === 11) {
      return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`;
    } else if (phone.length === 10) {
      return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`;
    } else if (phone.length >= 12) {
      // Número com código do país
      return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`;
    }
    return phone;
  };

  const isLoading = configLoading || listLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Carregando lista de exclusão...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/")}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Ban className="h-6 w-6 text-destructive" />
              Lista de Exclusão
            </h1>
            <p className="text-muted-foreground">
              Gerencie números que a IA não deve responder automaticamente
            </p>
          </div>
        </div>

        {/* Configuração Global */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings className="h-5 w-5" />
              Configurações Globais
            </CardTitle>
            <CardDescription>
              Configure o comportamento da lista de exclusão
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Ativar/Desativar Lista de Exclusão */}
              <div className="flex-1 flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  {config?.isEnabled ? (
                    <Power className="h-5 w-5 text-green-500" />
                  ) : (
                    <PowerOff className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <Label className="text-base font-medium">
                      Lista de Exclusão Ativa
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Quando ativa, a IA não responde números da lista
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config?.isEnabled ?? true}
                  onCheckedChange={(checked) =>
                    updateConfigMutation.mutate({ isEnabled: checked })
                  }
                />
              </div>

              {/* Ativar/Desativar Exclusão de Follow-up */}
              <div className="flex-1 flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  {config?.followupExclusionEnabled ? (
                    <BellOff className="h-5 w-5 text-orange-500" />
                  ) : (
                    <MessageCircle className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <Label className="text-base font-medium">
                      Excluir do Follow-up
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Também bloquear follow-up para números marcados
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config?.followupExclusionEnabled ?? true}
                  onCheckedChange={(checked) =>
                    updateConfigMutation.mutate({ followupExclusionEnabled: checked })
                  }
                />
              </div>
            </div>

            {/* Alerta informativo */}
            <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <p className="font-medium mb-1">Como funciona a lista de exclusão:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-600 dark:text-blue-400">
                  <li>Números nesta lista <strong>não receberão respostas automáticas</strong> da IA</li>
                  <li>Se "Excluir do Follow-up" estiver ativo, também não receberão mensagens de follow-up</li>
                  <li>Você ainda pode enviar mensagens manualmente para esses contatos</li>
                  <li>Ideal para fornecedores, familiares ou contatos que não devem receber atendimento automático</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Barra de ações */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por número, nome ou motivo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button onClick={() => setShowAddDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar Número
          </Button>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <Ban className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activeItems.length}</p>
                  <p className="text-sm text-muted-foreground">Números bloqueados</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                  <BellOff className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {activeItems.filter((i) => i.excludeFromFollowup).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Sem follow-up</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 dark:bg-gray-900/30 rounded-lg">
                  <UserX className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{inactiveItems.length}</p>
                  <p className="text-sm text-muted-foreground">Desativados</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-lg",
                  config?.isEnabled ? "bg-green-100 dark:bg-green-900/30" : "bg-gray-100 dark:bg-gray-900/30"
                )}>
                  {config?.isEnabled ? (
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {config?.isEnabled ? "Ativo" : "Inativo"}
                  </p>
                  <p className="text-sm text-muted-foreground">Status da lista</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista de números */}
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="active" className="gap-2">
              <Ban className="h-4 w-4" />
              Ativos ({activeItems.length})
            </TabsTrigger>
            <TabsTrigger value="inactive" className="gap-2">
              <UserX className="h-4 w-4" />
              Desativados ({inactiveItems.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <Card>
              <CardContent className="p-0">
                {activeItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Ban className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <h3 className="text-lg font-medium text-muted-foreground">
                      Nenhum número na lista de exclusão
                    </h3>
                    <p className="text-sm text-muted-foreground/70 mb-4">
                      Adicione números que não devem receber respostas automáticas
                    </p>
                    <Button onClick={() => setShowAddDialog(true)} className="gap-2">
                      <Plus className="h-4 w-4" />
                      Adicionar Primeiro Número
                    </Button>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Número</TableHead>
                          <TableHead>Nome</TableHead>
                          <TableHead>Motivo</TableHead>
                          <TableHead className="text-center">Follow-up</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono font-medium">
                              {formatPhone(item.phoneNumber)}
                            </TableCell>
                            <TableCell>
                              {item.contactName || (
                                <span className="text-muted-foreground italic">
                                  Sem nome
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {item.reason || (
                                <span className="text-muted-foreground italic">
                                  Sem motivo
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {item.excludeFromFollowup ? (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="secondary" className="gap-1">
                                      <BellOff className="h-3 w-3" />
                                      Bloqueado
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Não recebe follow-up automático
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="gap-1">
                                      <MessageCircle className="h-3 w-3" />
                                      Liberado
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Pode receber follow-up automático
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        setEditingItem(item);
                                        setShowEditDialog(true);
                                      }}
                                    >
                                      <Settings className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Editar</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-orange-600 hover:text-orange-700 hover:bg-orange-100"
                                      onClick={() => removeItemMutation.mutate(item.id)}
                                    >
                                      <PowerOff className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Desativar</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                      onClick={() => {
                                        if (confirm("Remover permanentemente este número da lista?")) {
                                          deleteItemMutation.mutate(item.id);
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Excluir permanentemente</TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inactive">
            <Card>
              <CardContent className="p-0">
                {inactiveItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <h3 className="text-lg font-medium text-muted-foreground">
                      Nenhum número desativado
                    </h3>
                    <p className="text-sm text-muted-foreground/70">
                      Números desativados aparecerão aqui
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Número</TableHead>
                          <TableHead>Nome</TableHead>
                          <TableHead>Motivo</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inactiveItems.map((item) => (
                          <TableRow key={item.id} className="opacity-60">
                            <TableCell className="font-mono font-medium">
                              {formatPhone(item.phoneNumber)}
                            </TableCell>
                            <TableCell>
                              {item.contactName || (
                                <span className="text-muted-foreground italic">
                                  Sem nome
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {item.reason || (
                                <span className="text-muted-foreground italic">
                                  Sem motivo
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-green-600 hover:text-green-700 hover:bg-green-100"
                                      onClick={() => reactivateItemMutation.mutate(item.id)}
                                    >
                                      <RotateCcw className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Reativar</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                      onClick={() => {
                                        if (confirm("Remover permanentemente este número da lista?")) {
                                          deleteItemMutation.mutate(item.id);
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Excluir permanentemente</TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Dialog para adicionar número */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Adicionar à Lista de Exclusão
              </DialogTitle>
              <DialogDescription>
                Adicione um número que não deve receber respostas automáticas da IA
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Número de Telefone *</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    placeholder="11987654321"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ""))}
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Apenas números, sem espaços ou símbolos
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Nome do Contato (opcional)</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    placeholder="Ex: Fornecedor João"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Motivo da Exclusão (opcional)</Label>
                <Input
                  id="reason"
                  placeholder="Ex: Número pessoal do dono"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <BellOff className="h-4 w-4 text-orange-500" />
                  <Label htmlFor="exclude-followup" className="cursor-pointer">
                    Também excluir do Follow-up
                  </Label>
                </div>
                <Switch
                  id="exclude-followup"
                  checked={newExcludeFollowup}
                  onCheckedChange={setNewExcludeFollowup}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddDialog(false);
                  resetForm();
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (!newPhone || newPhone.length < 8) {
                    toast({
                      title: "⚠️ Número inválido",
                      description: "Informe um número de telefone válido",
                      variant: "destructive",
                    });
                    return;
                  }
                  addItemMutation.mutate({
                    phoneNumber: newPhone,
                    contactName: newName || undefined,
                    reason: newReason || undefined,
                    excludeFromFollowup: newExcludeFollowup,
                  });
                }}
                disabled={addItemMutation.isPending}
                className="gap-2"
              >
                {addItemMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Adicionar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog para editar número */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Editar Item
              </DialogTitle>
              <DialogDescription>
                {editingItem && `Editando ${formatPhone(editingItem.phoneNumber)}`}
              </DialogDescription>
            </DialogHeader>
            
            {editingItem && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Número de Telefone</Label>
                  <Input
                    value={formatPhone(editingItem.phoneNumber)}
                    disabled
                    className="font-mono bg-muted"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-name">Nome do Contato</Label>
                  <Input
                    id="edit-name"
                    value={editingItem.contactName || ""}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, contactName: e.target.value })
                    }
                    placeholder="Ex: Fornecedor João"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-reason">Motivo da Exclusão</Label>
                  <Input
                    id="edit-reason"
                    value={editingItem.reason || ""}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, reason: e.target.value })
                    }
                    placeholder="Ex: Número pessoal do dono"
                  />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <BellOff className="h-4 w-4 text-orange-500" />
                    <Label htmlFor="edit-exclude-followup" className="cursor-pointer">
                      Também excluir do Follow-up
                    </Label>
                  </div>
                  <Switch
                    id="edit-exclude-followup"
                    checked={editingItem.excludeFromFollowup}
                    onCheckedChange={(checked) =>
                      setEditingItem({ ...editingItem, excludeFromFollowup: checked })
                    }
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowEditDialog(false);
                  setEditingItem(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (editingItem) {
                    updateItemMutation.mutate({
                      id: editingItem.id,
                      data: {
                        contactName: editingItem.contactName,
                        reason: editingItem.reason,
                        excludeFromFollowup: editingItem.excludeFromFollowup,
                      },
                    });
                  }
                }}
                disabled={updateItemMutation.isPending}
                className="gap-2"
              >
                {updateItemMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
