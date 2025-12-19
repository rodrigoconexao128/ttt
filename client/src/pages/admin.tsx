import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { useLocation, useSearch, useRoute } from "wouter";
import { Loader2, Plus, Trash2, Check, DollarSign, Users, CreditCard, MessageCircle, Bot, LayoutDashboard, Settings, UserCog, Calendar, Edit, Send, Play } from "lucide-react";
import type { Plan, Subscription, Payment, User } from "@shared/schema";
import AdminWhatsappPanel from "@/components/admin-whatsapp-panel";
import WelcomeMessageConfig from "@/components/welcome-message-config";
import AdminAgentConfig from "@/components/admin-agent-config";
import AdminConversations from "@/components/admin-conversations";
import FollowUpCalendar from "@/components/follow-up-calendar";
import { UserAgentConfigDialog } from "@/components/user-agent-config-dialog";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
  SidebarSeparator,
} from "@/components/ui/sidebar";

export default function AdminPanel() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  
  // Extrair tab da URL
  const getTabFromUrl = () => {
    const hash = window.location.hash.replace('#', '');
    if (hash) return hash.split('/')[0] || 'dashboard';
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('tab') || 'dashboard';
  };
  
  const [activeTab, setActiveTab] = useState(getTabFromUrl);

  // Sincronizar aba com mudanças de hash (back/forward ou deep link)
  useEffect(() => {
    const onHashChange = () => setActiveTab(getTabFromUrl());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  
  // Sincronizar aba com URL
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);

    if (tab === 'agent') {
      const hash = window.location.hash.replace('#', '');
      const parts = hash.split('/');
      const subTab = parts[0] === 'agent' ? (parts[1] || 'atendimento') : 'atendimento';
      window.history.replaceState(null, '', `/admin#agent/${subTab}`);
      return;
    }

    window.history.replaceState(null, '', `/admin#${tab}`);
  };

  // Guard: exige sessão de admin
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/session", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && !data?.authenticated) {
          setLocation("/admin-login");
        }
      })
      .catch(() => {
        if (!cancelled) setLocation("/admin-login");
      });
    return () => { cancelled = true; };
  }, [setLocation]);

  const { data: stats } = useQuery<{ totalUsers: number; totalRevenue: number; activeSubscriptions: number }>({
    queryKey: ["/api/admin/stats"],
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ["/api/admin/plans"],
  });

  const { data: subscriptions } = useQuery<(Subscription & { plan: Plan; user: User })[]>({
    queryKey: ["/api/admin/subscriptions"],
  });

  const { data: pendingPayments } = useQuery<(Payment & { subscription: Subscription & { user: User; plan: Plan } })[]>({
    queryKey: ["/api/admin/payments/pending"],
  });

  const { data: config } = useQuery<{ mistral_api_key: string }>({
    queryKey: ["/api/admin/config"],
  });

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <div className="grid gap-4 md:grid-cols-3">
            <Card data-testid="card-stat-users">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Usuários</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-users">
                  {stats?.totalUsers || 0}
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-stat-revenue">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-revenue">
                  R$ {stats?.totalRevenue?.toFixed(2) || "0.00"}
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-stat-subscriptions">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Assinaturas Ativas</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-active-subscriptions">
                  {stats?.activeSubscriptions || 0}
                </div>
              </CardContent>
            </Card>
          </div>
        );
      case "users":
        return <UsersManager users={users} />;
      case "manage":
        return <ClientManager users={users} plans={plans} subscriptions={subscriptions} />;
      case "plans":
        return <PlansManager plans={plans} />;
      case "payments":
        return <PaymentsManager pendingPayments={pendingPayments} />;
      case "whatsapp":
        return (
          <div className="grid gap-4">
            <AdminWhatsappPanel />
            <WelcomeMessageConfig />
          </div>
        );
      case "agent":
        return <AdminAgentConfig />;
      case "conversations":
        return null; // Renderizado fora do container
      case "calendar":
        return <FollowUpCalendar />;
      case "config":
        return <ConfigManager config={config} />;
      default:
        return null;
    }
  };

  // Para conversas, usar layout full-screen sem o inset
  if (activeTab === "conversations") {
    return (
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <div className="px-2 py-1.5 text-sm font-semibold flex items-center gap-2">
              <Bot className="w-4 h-4 text-muted-foreground" />
              <span>Admin Panel</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("dashboard")}
                    isActive={activeTab === "dashboard"}
                    tooltip="Dashboard"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Dashboard</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("users")}
                    isActive={activeTab === "users"}
                    tooltip="Usuários"
                  >
                    <Users className="w-4 h-4" />
                    <span>Usuários</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("manage")}
                    isActive={activeTab === "manage"}
                    tooltip="Gerenciar Clientes"
                  >
                    <UserCog className="w-4 h-4" />
                    <span>Gerenciar Clientes</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("plans")}
                    isActive={activeTab === "plans"}
                    tooltip="Planos"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Planos</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("payments")}
                    isActive={activeTab === "payments"}
                    tooltip="Pagamentos"
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>Pagamentos</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("whatsapp")}
                    isActive={activeTab === "whatsapp"}
                    tooltip="WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>WhatsApp</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("agent")}
                    isActive={activeTab === "agent"}
                    tooltip="Agente IA"
                  >
                    <Bot className="w-4 h-4" />
                    <span>Agente IA</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("conversations")}
                    isActive={activeTab === "conversations"}
                    tooltip="Conversas"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Conversas</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("calendar")}
                    isActive={activeTab === "calendar"}
                    tooltip="Calendário de Follow-ups"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Calendário</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("config")}
                    isActive={activeTab === "config"}
                    tooltip="Configurações"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Configurações</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="p-4 text-xs text-muted-foreground text-center">
              Admin Panel v1.0
            </div>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="h-screen overflow-hidden">
          <div className="flex h-full overflow-hidden">
            <AdminConversations />
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  // Layout principal para todas as outras tabs
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="px-2 py-1.5 text-sm font-semibold flex items-center gap-2">
            <Bot className="w-4 h-4 text-muted-foreground" />
            <span>Admin Panel</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("dashboard")}
                  isActive={activeTab === "dashboard"}
                  tooltip="Dashboard"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("users")}
                  isActive={activeTab === "users"}
                  tooltip="Usuários"
                >
                  <Users className="w-4 h-4" />
                  <span>Usuários</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("manage")}
                  isActive={activeTab === "manage"}
                  tooltip="Gerenciar Clientes"
                >
                  <UserCog className="w-4 h-4" />
                  <span>Gerenciar Clientes</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("plans")}
                  isActive={activeTab === "plans"}
                  tooltip="Planos"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Planos</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("payments")}
                  isActive={activeTab === "payments"}
                  tooltip="Pagamentos"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Pagamentos</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("whatsapp")}
                  isActive={activeTab === "whatsapp"}
                  tooltip="WhatsApp"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>WhatsApp</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("agent")}
                  isActive={activeTab === "agent"}
                  tooltip="Agente IA"
                >
                  <Bot className="w-4 h-4" />
                  <span>Agente IA</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("conversations")}
                  isActive={activeTab === "conversations"}
                  tooltip="Conversas"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Conversas</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("calendar")}
                  isActive={activeTab === "calendar"}
                  tooltip="Calendário de Follow-ups"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Calendário</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("config")}
                  isActive={activeTab === "config"}
                  tooltip="Configurações"
                >
                  <Settings className="w-4 h-4" />
                  <span>Configurações</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="p-4 text-xs text-muted-foreground text-center">
            Admin Panel v1.0
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {renderContent()}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

// Users Manager Component with delete functionality
function UsersManager({ users }: { users: User[] | undefined }) {
  const { toast } = useToast();
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editingAgentUser, setEditingAgentUser] = useState<User | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setConfirmDeleteUser(null);
      toast({ 
        title: "✅ Usuário excluído",
        description: "O usuário e todos os dados relacionados foram removidos."
      });
    },
    onError: () => {
      toast({ 
        title: "Erro ao excluir usuário", 
        description: "Não foi possível excluir o usuário. Tente novamente.",
        variant: "destructive" 
      });
    },
  });

  // Mutation: Update Email
  const updateEmailMutation = useMutation({
    mutationFn: async ({ userId, email }: { userId: string; email: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}`, { email });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Email atualizado com sucesso!" });
      setIsEmailDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: "Erro ao atualizar email", description: error.message, variant: "destructive" });
    },
  });

  // Mutation: Send Credentials
  const sendCredentialsMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/send-credentials`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Credenciais enviadas!", description: "O cliente receberá os dados de acesso." });
      if (data.password) {
        alert(`Senha gerada: ${data.password}\n\nCopie esta senha, ela não será mostrada novamente.`);
      }
    },
    onError: (error) => {
      toast({ title: "Erro ao enviar credenciais", description: error.message, variant: "destructive" });
    },
  });

  // Mutation: Activate Agent
  const activateAgentMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/activate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Agente ativado!", description: "O status foi atualizado para ativo." });
    },
  });

  const handleEditEmail = (user: User) => {
    setSelectedUser(user);
    setNewEmail(user.email || "");
    setIsEmailDialogOpen(true);
  };

  const handleSendCredentials = (userId: string) => {
    if (confirm("Tem certeza que deseja enviar as credenciais para este usuário?")) {
      sendCredentialsMutation.mutate(userId);
    }
  };

  const handleActivate = (userId: string) => {
    activateAgentMutation.mutate(userId);
  };

  const handleChat = (phone: string) => {
    window.location.hash = '#conversations';
  };

  return (
    <Card data-testid="card-users-list">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Usuários Cadastrados
        </CardTitle>
        <CardDescription>
          Gerencie os agentes, pagamentos e acessos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.map((user: User) => (
              <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                <TableCell className="font-medium">{user.name || "-"}</TableCell>
                <TableCell data-testid={`text-email-${user.id}`}>{user.email}</TableCell>
                <TableCell>{user.whatsappNumber || user.phone || "-"}</TableCell>
                <TableCell>
                  <Badge variant={user.role === "owner" ? "default" : "secondary"}>
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={user.onboardingCompleted ? "default" : "outline"}>
                    {user.onboardingCompleted ? "Ativo" : "Pendente"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => handleChat(user.phone)} title="Conversar">
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingAgentUser(user)} title="Configurar Agente">
                    <Bot className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleEditEmail(user)} title="Editar Email">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => handleSendCredentials(user.id)}
                    title="Enviar Credenciais"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                    onClick={() => handleActivate(user.id)}
                    title="Ativar Agente"
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                  <Dialog open={confirmDeleteUser?.id === user.id} onOpenChange={(open) => !open && setConfirmDeleteUser(null)}>
                    <DialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setConfirmDeleteUser(user)}
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                          <Trash2 className="h-5 w-5" />
                          Confirmar Exclusão
                        </DialogTitle>
                        <DialogDescription className="space-y-3">
                          <p>
                            Você está prestes a excluir permanentemente o usuário:
                          </p>
                          <div className="bg-muted p-3 rounded-lg">
                            <p className="font-semibold">{confirmDeleteUser?.email}</p>
                            {confirmDeleteUser?.name && <p className="text-sm">{confirmDeleteUser.name}</p>}
                          </div>
                          <p className="text-red-600 font-medium">
                            ⚠️ Esta ação irá remover:
                          </p>
                          <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                            <li>Conexão WhatsApp do usuário</li>
                            <li>Todas as conversas e mensagens</li>
                            <li>Configurações do agente IA</li>
                            <li>Assinatura e pagamentos</li>
                            <li>Todos os dados relacionados</li>
                          </ul>
                          <p className="text-red-600 text-sm font-medium">
                            Esta ação não pode ser desfeita!
                          </p>
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter className="gap-2">
                        <Button 
                          variant="outline" 
                          onClick={() => setConfirmDeleteUser(null)}
                        >
                          Cancelar
                        </Button>
                        <Button 
                          variant="destructive"
                          onClick={() => confirmDeleteUser && deleteUserMutation.mutate(confirmDeleteUser.id)}
                          disabled={deleteUserMutation.isPending}
                        >
                          {deleteUserMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-2" />
                          )}
                          Excluir Permanentemente
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        
        {(!users || users.length === 0) && (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum usuário cadastrado</p>
          </div>
        )}
      </CardContent>

      <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Email do Cliente</DialogTitle>
            <DialogDescription>
              Altere o email para que o cliente possa receber as credenciais corretamente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">
                Email
              </Label>
              <Input
                id="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEmailDialogOpen(false)}>Cancelar</Button>
            <Button 
              onClick={() => selectedUser && updateEmailMutation.mutate({ userId: selectedUser.id, email: newEmail })}
              disabled={updateEmailMutation.isPending}
            >
              {updateEmailMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UserAgentConfigDialog 
        userId={editingAgentUser?.id || null}
        open={!!editingAgentUser}
        onOpenChange={(open) => !open && setEditingAgentUser(null)}
        userName={editingAgentUser?.name || editingAgentUser?.email || ""}
      />
    </Card>
  );
}

function PlansManager({ plans }: { plans: Plan[] | undefined }) {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  const createPlanMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/plans", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      setIsCreateOpen(false);
      toast({ title: "Plano criado com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao criar plano", variant: "destructive" });
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/admin/plans/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      setEditingPlan(null);
      toast({ title: "Plano atualizado com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar plano", variant: "destructive" });
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/plans/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      toast({ title: "Plano deletado com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao deletar plano", variant: "destructive" });
    },
  });

  return (
    <Card data-testid="card-plans-manager">
      <CardHeader className="flex flex-row items-center justify-between gap-1">
        <div>
          <CardTitle>Gerenciar Planos</CardTitle>
          <CardDescription>Criar, editar e remover planos de assinatura</CardDescription>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-plan">
              <Plus className="mr-2 h-4 w-4" />
              Novo Plano
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-create-plan">
            <PlanForm
              onSubmit={(data) => createPlanMutation.mutate(data)}
              isPending={createPlanMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Periodicidade</TableHead>
              <TableHead>Limite Conversas</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans?.map((plan) => (
              <TableRow key={plan.id} data-testid={`row-plan-${plan.id}`}>
                <TableCell data-testid={`text-plan-name-${plan.id}`}>{plan.nome}</TableCell>
                <TableCell>R$ {plan.valor}</TableCell>
                <TableCell>{plan.periodicidade}</TableCell>
                <TableCell>{plan.limiteConversas === -1 ? "Ilimitado" : plan.limiteConversas}</TableCell>
                <TableCell>
                  <Badge variant={plan.ativo ? "default" : "secondary"}>
                    {plan.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deletePlanMutation.mutate(plan.id)}
                    data-testid={`button-delete-plan-${plan.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PlanForm({ 
  onSubmit, 
  isPending, 
  initialData 
}: { 
  onSubmit: (data: any) => void; 
  isPending: boolean;
  initialData?: Plan;
}) {
  const [formData, setFormData] = useState({
    nome: initialData?.nome || "",
    valor: initialData?.valor || "",
    periodicidade: initialData?.periodicidade || "mensal",
    limiteConversas: initialData?.limiteConversas || 100,
    limiteAgentes: initialData?.limiteAgentes || 1,
    ativo: initialData?.ativo ?? true,
  });
  
  const [conversasIlimitadas, setConversasIlimitadas] = useState(initialData?.limiteConversas === -1);
  const [agentesIlimitados, setAgentesIlimitados] = useState(initialData?.limiteAgentes === -1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = {
      ...formData,
      limiteConversas: conversasIlimitadas ? -1 : formData.limiteConversas,
      limiteAgentes: agentesIlimitados ? -1 : formData.limiteAgentes,
    };
    onSubmit(submitData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{initialData ? "Editar Plano" : "Criar Novo Plano"}</DialogTitle>
        <DialogDescription>Preencha as informações do plano</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="nome">Nome do Plano</Label>
          <Input
            id="nome"
            value={formData.nome}
            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
            placeholder="Ex: Básico, Profissional"
            required
            data-testid="input-plan-name"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="valor">Valor (R$)</Label>
          <Input
            id="valor"
            type="number"
            step="0.01"
            value={formData.valor}
            onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
            placeholder="99.90"
            required
            data-testid="input-plan-value"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="periodicidade">Periodicidade</Label>
          <Select 
            value={formData.periodicidade} 
            onValueChange={(value) => setFormData({ ...formData, periodicidade: value as "mensal" | "anual" })}
          >
            <SelectTrigger data-testid="select-plan-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mensal">Mensal</SelectItem>
              <SelectItem value="anual">Anual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="limiteConversas">Limite de Conversas</Label>
            <div className="flex items-center space-x-2">
              <Switch
                checked={conversasIlimitadas}
                onCheckedChange={(checked) => {
                  setConversasIlimitadas(checked);
                  if (checked) setFormData({ ...formData, limiteConversas: -1 });
                }}
                data-testid="switch-conversations-unlimited"
              />
              <Label className="text-sm text-muted-foreground">Ilimitado</Label>
            </div>
          </div>
          <Input
            id="limiteConversas"
            type="number"
            value={conversasIlimitadas ? "" : formData.limiteConversas}
            onChange={(e) => setFormData({ ...formData, limiteConversas: parseInt(e.target.value) || 0 })}
            placeholder={conversasIlimitadas ? "Ilimitado" : "100"}
            disabled={conversasIlimitadas}
            data-testid="input-plan-conversations-limit"
          />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="limiteAgentes">Limite de Agentes</Label>
            <div className="flex items-center space-x-2">
              <Switch
                checked={agentesIlimitados}
                onCheckedChange={(checked) => {
                  setAgentesIlimitados(checked);
                  if (checked) setFormData({ ...formData, limiteAgentes: -1 });
                }}
                data-testid="switch-agents-unlimited"
              />
              <Label className="text-sm text-muted-foreground">Ilimitado</Label>
            </div>
          </div>
          <Input
            id="limiteAgentes"
            type="number"
            value={agentesIlimitados ? "" : formData.limiteAgentes}
            onChange={(e) => setFormData({ ...formData, limiteAgentes: parseInt(e.target.value) || 0 })}
            placeholder={agentesIlimitados ? "Ilimitado" : "1"}
            disabled={agentesIlimitados}
            data-testid="input-plan-agents-limit"
          />
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="ativo"
            checked={formData.ativo}
            onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })}
            data-testid="switch-plan-active"
          />
          <Label htmlFor="ativo">Plano Ativo</Label>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isPending} data-testid="button-submit-plan">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initialData ? "Atualizar" : "Criar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function PaymentsManager({ 
  pendingPayments 
}: { 
  pendingPayments: (Payment & { subscription: Subscription & { user: User; plan: Plan } })[] | undefined 
}) {
  const { toast } = useToast();

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("POST", `/api/admin/payments/approve/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payments/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Pagamento aprovado com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao aprovar pagamento", variant: "destructive" });
    },
  });

  return (
    <Card data-testid="card-pending-payments">
      <CardHeader>
        <CardTitle>Pagamentos Pendentes</CardTitle>
        <CardDescription>Aprovar pagamentos PIX manualmente</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingPayments?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhum pagamento pendente
                </TableCell>
              </TableRow>
            )}
            {pendingPayments?.map((payment) => (
              <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                <TableCell data-testid={`text-payment-user-${payment.id}`}>
                  {payment.subscription.user.email}
                </TableCell>
                <TableCell>{payment.subscription.plan.nome}</TableCell>
                <TableCell>R$ {payment.valor}</TableCell>
                <TableCell>{payment.createdAt ? new Date(payment.createdAt).toLocaleDateString("pt-BR") : "-"}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    onClick={() => approveMutation.mutate(payment.id)}
                    disabled={approveMutation.isPending}
                    data-testid={`button-approve-payment-${payment.id}`}
                  >
                    {approveMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Aprovar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ConfigManager({ config }: { config: { mistral_api_key: string; pix_key?: string; zai_api_key?: string } | undefined }) {
  const { toast } = useToast();
  const [mistralKey, setMistralKey] = useState(config?.mistral_api_key || "");
  const [pixKey, setPixKey] = useState(config?.pix_key || "");
  const [zaiKey, setZaiKey] = useState(config?.zai_api_key || "");

  const updateConfigMutation = useMutation({
    mutationFn: async (data: { mistral_api_key: string; pix_key: string; zai_api_key: string }) => {
      return await apiRequest("PUT", "/api/admin/config", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config"] });
      toast({ title: "Configuração atualizada com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar configuração", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateConfigMutation.mutate({ mistral_api_key: mistralKey, pix_key: pixKey, zai_api_key: zaiKey });
  };

  return (
    <Card data-testid="card-system-config">
      <CardHeader>
        <CardTitle>Configurações do Sistema</CardTitle>
        <CardDescription>Chave API Mistral, chave PIX e outras configurações</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="mistralKey">Mistral API Key</Label>
            <Input
              id="mistralKey"
              type="password"
              value={mistralKey}
              onChange={(e) => setMistralKey(e.target.value)}
              placeholder="sk-..."
              data-testid="input-mistral-key"
            />
            <p className="text-sm text-muted-foreground">
              Chave API usada por todos os agentes IA do sistema
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pixKey">Chave PIX</Label>
            <Input
              id="pixKey"
              type="text"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="email@example.com ou CPF/CNPJ ou telefone"
              data-testid="input-pix-key"
            />
            <p className="text-sm text-muted-foreground">
              Chave PIX usada para receber pagamentos de assinaturas
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="zaiKey">Z.AI API Key</Label>
            <Input
              id="zaiKey"
              type="password"
              value={zaiKey}
              onChange={(e) => setZaiKey(e.target.value)}
              placeholder="0a..."
              data-testid="input-zai-key"
            />
            <p className="text-sm text-muted-foreground">
              Chave API usada para os modelos GLM (Z.AI)
            </p>
          </div>

          <Button type="submit" disabled={updateConfigMutation.isPending} data-testid="button-save-config">
            {updateConfigMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Configurações
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ClientManager({ 
  users, 
  plans,
  subscriptions 
}: { 
  users: User[] | undefined;
  plans: Plan[] | undefined;
  subscriptions: (Subscription & { plan: Plan; user: User })[] | undefined;
}) {
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedPlan, setSelectedPlan] = useState<string>("");

  const assignPlanMutation = useMutation({
    mutationFn: async (data: { userId: string; planId: string }) => {
      const response = await apiRequest("POST", "/api/admin/subscriptions/assign", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setSelectedUser("");
      setSelectedPlan("");
      toast({ title: "Plano atribuído com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atribuir plano", description: error.message, variant: "destructive" });
    },
  });

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/subscriptions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Assinatura cancelada com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao cancelar assinatura", description: error.message, variant: "destructive" });
    },
  });

  const handleAssignPlan = () => {
    if (!selectedUser || !selectedPlan) {
      toast({ title: "Selecione um usuário e um plano", variant: "destructive" });
      return;
    }
    assignPlanMutation.mutate({ userId: selectedUser, planId: selectedPlan });
  };

  return (
    <div className="space-y-4">
      <Card data-testid="card-assign-plan">
        <CardHeader>
          <CardTitle>Atribuir Plano a Cliente</CardTitle>
          <CardDescription>Ative ou troque o plano de um cliente manualmente (sem necessidade de pagamento)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Selecione o Cliente</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger data-testid="select-user">
                <SelectValue placeholder="Escolha um usuário" />
              </SelectTrigger>
              <SelectContent>
                {users?.filter(u => u.role !== "owner" && u.role !== "admin").map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.email} - {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Selecione o Plano</Label>
            <Select value={selectedPlan} onValueChange={setSelectedPlan}>
              <SelectTrigger data-testid="select-plan">
                <SelectValue placeholder="Escolha um plano" />
              </SelectTrigger>
              <SelectContent>
                {plans?.filter(p => p.ativo).map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.nome} - R$ {plan.valor}/{plan.periodicidade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button 
            onClick={handleAssignPlan} 
            disabled={assignPlanMutation.isPending}
            data-testid="button-assign-plan"
          >
            {assignPlanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Atribuir Plano e Ativar
          </Button>
        </CardContent>
      </Card>

      <Card data-testid="card-active-subscriptions">
        <CardHeader>
          <CardTitle>Assinaturas Ativas</CardTitle>
          <CardDescription>Gerencie as assinaturas dos clientes</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions?.filter(s => s.status === "active").length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhuma assinatura ativa
                  </TableCell>
                </TableRow>
              )}
              {subscriptions?.filter(s => s.status === "active").map((subscription) => (
                <TableRow key={subscription.id} data-testid={`row-subscription-${subscription.id}`}>
                  <TableCell>{subscription.user.email}</TableCell>
                  <TableCell>
                    <Badge>{subscription.plan.nome}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={subscription.status === "active" ? "default" : "secondary"}>
                      {subscription.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {subscription.dataInicio ? new Date(subscription.dataInicio).toLocaleDateString("pt-BR") : "-"}
                  </TableCell>
                  <TableCell>
                    {subscription.dataFim ? new Date(subscription.dataFim).toLocaleDateString("pt-BR") : "-"}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => cancelSubscriptionMutation.mutate(subscription.id)}
                      disabled={cancelSubscriptionMutation.isPending}
                      data-testid={`button-cancel-subscription-${subscription.id}`}
                    >
                      Cancelar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
