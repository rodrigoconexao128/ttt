import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Loader2, Plus, Trash2, Check, DollarSign, Users, CreditCard, MessageCircle, Bot, LayoutDashboard, Settings, UserCog, Calendar, Edit, Send, Play, RefreshCw, Search, CheckCircle, Copy, Key, Eye, EyeOff, TestTube, LogIn, CheckSquare, Square } from "lucide-react";
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
    refetchInterval: 10000, // Atualizar a cada 10 segundos para refletir status de conexão
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
interface UserWithStatus extends User {
  isConnected?: boolean;
}

function UsersManager({ users }: { users: UserWithStatus[] | undefined }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editingAgentUser, setEditingAgentUser] = useState<User | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [reconnectingUserId, setReconnectingUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  
  // Bulk selection state
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState("");

  const filteredUsers = users?.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    return (
      user.name?.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower) ||
      user.phone?.includes(searchLower) ||
      user.whatsappNumber?.includes(searchLower)
    );
  });

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

  // Mutation: Bulk Delete Users
  const bulkDeleteMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      const res = await apiRequest("POST", "/api/admin/users/bulk-delete", { userIds });
      if (!res.ok) throw new Error("Failed to delete users");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setSelectedUserIds(new Set());
      setShowBulkDeleteConfirm(false);
      setBulkDeleteConfirmText("");
      toast({ 
        title: "✅ Usuários excluídos",
        description: `${data.deletedCount || selectedUserIds.size} usuário(s) removido(s) com sucesso.`
      });
    },
    onError: () => {
      toast({ 
        title: "Erro ao excluir usuários", 
        description: "Não foi possível excluir os usuários selecionados.",
        variant: "destructive" 
      });
    },
  });

  // Mutation: Admin Impersonate User
  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/impersonate`);
      if (!res.ok) throw new Error("Failed to impersonate user");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "🔓 Acesso concedido",
        description: "Você será redirecionado para o painel do cliente."
      });
      // Redirecionar para o dashboard do cliente
      setTimeout(() => {
        window.location.href = "/";
      }, 1000);
    },
    onError: (error) => {
      toast({ 
        title: "Erro ao acessar conta", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Bulk selection helpers
  const handleSelectAll = () => {
    if (filteredUsers) {
      if (selectedUserIds.size === filteredUsers.length) {
        setSelectedUserIds(new Set());
      } else {
        setSelectedUserIds(new Set(filteredUsers.map(u => u.id)));
      }
    }
  };

  const handleSelectUser = (userId: string) => {
    const newSelected = new Set(selectedUserIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUserIds(newSelected);
  };

  const handleBulkDelete = () => {
    if (bulkDeleteConfirmText === "DELETAR") {
      bulkDeleteMutation.mutate(Array.from(selectedUserIds));
    }
  };

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
      toast({ title: "Senha Gerada!", description: "A senha foi gerada e atualizada com sucesso." });
      if (data.password) {
        setGeneratedPassword(data.password);
      }
    },
    onError: (error) => {
      toast({ title: "Erro ao gerar senha", description: error.message, variant: "destructive" });
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

  // Mutation: Reconnect All
  const reconnectAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/connections/reconnect-all");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Reconexão Iniciada", 
        description: data.message || "Processo de reconexão em massa iniciado." 
      });
    },
    onError: (error) => {
      toast({ 
        title: "Erro na reconexão", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Mutation: Reconnect Single User
  const reconnectUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      setReconnectingUserId(userId);
      const res = await apiRequest("POST", `/api/admin/connections/reconnect/${userId}`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ 
          title: "✅ Reconexão Iniciada", 
          description: data.message 
        });
      } else {
        toast({ 
          title: "⚠️ Problema na Reconexão", 
          description: data.message || "A reconexão pode precisar de um novo QR Code.",
          variant: "destructive" 
        });
      }
      // Aguardar um pouco e atualizar a lista para ver se mudou o status
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
        setReconnectingUserId(null);
      }, 3000);
    },
    onError: (error) => {
      setReconnectingUserId(null);
      toast({ 
        title: "❌ Erro", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Mutation: Reset User Session (force new QR code)
  const resetUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/connections/reset/${userId}`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ 
          title: "🔄 Sessão Resetada", 
          description: data.message 
        });
      } else {
        toast({ 
          title: "⚠️ Erro ao Resetar", 
          description: data.message,
          variant: "destructive" 
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error) => {
      toast({ 
        title: "❌ Erro", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const handleEditEmail = (user: User) => {
    setSelectedUser(user);
    setNewEmail(user.email || "");
    setIsEmailDialogOpen(true);
  };

  const handleSendCredentials = (userId: string) => {
    if (confirm("Tem certeza que deseja gerar uma nova senha para este usuário? A senha antiga deixará de funcionar.")) {
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Usuários Cadastrados
            </CardTitle>
            <CardDescription>
              Gerencie os agentes, pagamentos e acessos.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {selectedUserIds.size > 0 && (
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={() => setShowBulkDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir Selecionados ({selectedUserIds.size})
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                if (confirm("Isso tentará reconectar TODOS os usuários que possuem conexão configurada. Continuar?")) {
                  reconnectAllMutation.mutate();
                }
              }}
              disabled={reconnectAllMutation.isPending}
            >
              {reconnectAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Reconectar Todos
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={filteredUsers && filteredUsers.length > 0 && selectedUserIds.size === filteredUsers.length}
                  onCheckedChange={handleSelectAll}
                  aria-label="Selecionar todos"
                />
              </TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Conexão</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers?.map((user: UserWithStatus) => (
              <TableRow key={user.id} data-testid={`row-user-${user.id}`} className={selectedUserIds.has(user.id) ? "bg-muted/50" : ""}>
                <TableCell>
                  <Checkbox
                    checked={selectedUserIds.has(user.id)}
                    onCheckedChange={() => handleSelectUser(user.id)}
                    aria-label={`Selecionar ${user.name || user.email}`}
                  />
                </TableCell>
                <TableCell className="font-medium">{user.name || "-"}</TableCell>
                <TableCell data-testid={`text-email-${user.id}`}>{user.email}</TableCell>
                <TableCell>{user.whatsappNumber || user.phone || "-"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant={user.isConnected ? "default" : "destructive"} className={user.isConnected ? "bg-green-500 hover:bg-green-600" : ""}>
                      {user.isConnected ? "Conectado" : "Offline"}
                    </Badge>
                    {!user.isConnected && (
                      <>
                        <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-6 w-6" 
                            title="Tentar Reconectar"
                            onClick={() => reconnectUserMutation.mutate(user.id)}
                            disabled={reconnectingUserId === user.id}
                        >
                            <RefreshCw className={`h-3 w-3 ${reconnectingUserId === user.id ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-6 w-6 text-orange-500 hover:text-orange-600" 
                            title="Resetar Sessão (força novo QR Code)"
                            onClick={() => {
                              if (confirm("Isso vai apagar a sessão do usuário e ele precisará escanear um novo QR Code. Continuar?")) {
                                resetUserMutation.mutate(user.id);
                              }
                            }}
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
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
                  <Button 
                    size="sm" 
                    variant="ghost"
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    onClick={() => {
                      if (confirm(`Você será logado como "${user.name || user.email}". Deseja continuar?`)) {
                        impersonateMutation.mutate(user.id);
                      }
                    }}
                    disabled={impersonateMutation.isPending}
                    title="Acessar conta do cliente"
                  >
                    <LogIn className="h-4 w-4" />
                  </Button>
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
                    title="Gerar Nova Senha"
                  >
                    <Key className="h-4 w-4" />
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
        
        {(!filteredUsers || filteredUsers.length === 0) && (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum usuário encontrado</p>
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

      <Dialog open={!!generatedPassword} onOpenChange={(open) => !open && setGeneratedPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Senha Gerada</DialogTitle>
            <DialogDescription>
              Copie a senha abaixo. Ela não será mostrada novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 py-4">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="generated-password" className="sr-only">
                Senha
              </Label>
              <Input
                id="generated-password"
                value={generatedPassword || ""}
                readOnly
              />
            </div>
            <Button type="submit" size="sm" className="px-3" onClick={() => {
              navigator.clipboard.writeText(generatedPassword || "");
              toast({ title: "Copiado!", description: "Senha copiada para a área de transferência." });
            }}>
              <span className="sr-only">Copiar</span>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setGeneratedPassword(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Excluir {selectedUserIds.size} Usuários
            </DialogTitle>
            <DialogDescription className="space-y-3">
              <p>
                Você está prestes a excluir permanentemente <strong>{selectedUserIds.size} usuários</strong>.
              </p>
              <p className="text-red-600 font-medium">
                ⚠️ Esta ação irá remover para CADA usuário:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                <li>Conexão WhatsApp do usuário</li>
                <li>Todas as conversas e mensagens</li>
                <li>Configurações do agente IA</li>
                <li>Assinatura e pagamentos</li>
                <li>Todos os dados relacionados</li>
              </ul>
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">
                  Para confirmar, digite: <span className="font-mono font-bold text-red-600">DELETAR</span>
                </p>
                <Input
                  value={bulkDeleteConfirmText}
                  onChange={(e) => setBulkDeleteConfirmText(e.target.value)}
                  placeholder="Digite DELETAR para confirmar"
                  className="font-mono"
                />
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowBulkDeleteConfirm(false);
                setBulkDeleteConfirmText("");
              }}
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkDeleteConfirmText !== "DELETAR" || bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Excluir {selectedUserIds.size} Usuários
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const [showMistralKey, setShowMistralKey] = useState(false);
  const [showZaiKey, setShowZaiKey] = useState(false);
  const [testingMistral, setTestingMistral] = useState(false);

  // Sincronizar estado com config quando carregar
  useEffect(() => {
    if (config) {
      setMistralKey(config.mistral_api_key || "");
      setPixKey(config.pix_key || "");
      setZaiKey(config.zai_api_key || "");
    }
  }, [config]);

  const testMistralKey = async () => {
    setTestingMistral(true);
    try {
      const response = await apiRequest("POST", "/api/admin/test-mistral");
      const data = await response.json();
      if (data.success) {
        toast({ title: "✅ Chave Mistral válida!", description: `Modelo: ${data.model}` });
      } else {
        toast({ title: "❌ Chave Mistral inválida", description: data.error, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "❌ Erro ao testar chave", description: error.message, variant: "destructive" });
    } finally {
      setTestingMistral(false);
    }
  };

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
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="mistralKey"
                  type={showMistralKey ? "text" : "password"}
                  value={mistralKey}
                  onChange={(e) => setMistralKey(e.target.value)}
                  placeholder="sk-..."
                  data-testid="input-mistral-key"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowMistralKey(!showMistralKey)}
                >
                  {showMistralKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={testMistralKey}
                disabled={testingMistral || !mistralKey}
              >
                {testingMistral ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Testar
              </Button>
            </div>
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
            <div className="relative">
              <Input
                id="zaiKey"
                type={showZaiKey ? "text" : "password"}
                value={zaiKey}
                onChange={(e) => setZaiKey(e.target.value)}
                placeholder="0a..."
                data-testid="input-zai-key"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowZaiKey(!showZaiKey)}
              >
                {showZaiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
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

interface UserWithConnectionStatus extends User {
  isConnected?: boolean;
}

function ClientManager({ 
  users, 
  plans,
  subscriptions 
}: { 
  users: UserWithConnectionStatus[] | undefined;
  plans: Plan[] | undefined;
  subscriptions: (Subscription & { plan: Plan; user: User })[] | undefined;
}) {
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "without-plan" | "with-plan">("without-plan");

  // Get set of user IDs that have active subscriptions
  const usersWithActiveSubscriptions = new Set(
    subscriptions
      ?.filter(s => s.status === "active")
      .map(s => s.userId) || []
  );

  // Filter users based on search and filter mode
  const filteredUsers = users?.filter(user => {
    // Exclude admins and owners
    if (user.role === "owner" || user.role === "admin") return false;
    
    // Apply filter mode
    const hasActivePlan = usersWithActiveSubscriptions.has(user.id);
    if (filterMode === "without-plan" && hasActivePlan) return false;
    if (filterMode === "with-plan" && !hasActivePlan) return false;
    
    // Apply search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        user.name?.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower) ||
        user.phone?.includes(searchLower)
      );
    }
    
    return true;
  });

  // Count users in each category
  const usersWithoutPlanCount = users?.filter(u => 
    u.role !== "owner" && u.role !== "admin" && !usersWithActiveSubscriptions.has(u.id)
  ).length || 0;
  
  const usersWithPlanCount = users?.filter(u => 
    u.role !== "owner" && u.role !== "admin" && usersWithActiveSubscriptions.has(u.id)
  ).length || 0;

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

  // Get subscription for a user
  const getUserSubscription = (userId: string) => {
    return subscriptions?.find(s => s.userId === userId && s.status === "active");
  };

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{usersWithoutPlanCount}</p>
              <p className="text-xs text-muted-foreground">Sem plano ativo</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{usersWithPlanCount}</p>
              <p className="text-xs text-muted-foreground">Com plano ativo</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{plans?.filter(p => p.ativo).length || 0}</p>
              <p className="text-xs text-muted-foreground">Planos disponíveis</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Assign Plan Section */}
      <Card data-testid="card-assign-plan">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5" />
            Gerenciar Planos de Clientes
          </CardTitle>
          <CardDescription>
            Busque clientes e atribua ou gerencie seus planos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Search and Filter Bar */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email ou telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={filterMode === "without-plan" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterMode("without-plan")}
                className="whitespace-nowrap"
              >
                Sem Plano ({usersWithoutPlanCount})
              </Button>
              <Button
                variant={filterMode === "with-plan" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterMode("with-plan")}
                className="whitespace-nowrap"
              >
                Com Plano ({usersWithPlanCount})
              </Button>
              <Button
                variant={filterMode === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterMode("all")}
              >
                Todos
              </Button>
            </div>
          </div>

          {/* Plan Selection */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Selecionar Cliente</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger data-testid="select-user" className="h-11">
                  <SelectValue placeholder="Escolha um cliente para atribuir plano" />
                </SelectTrigger>
                <SelectContent>
                  {filteredUsers?.length === 0 && (
                    <div className="p-3 text-sm text-muted-foreground text-center">
                      {searchTerm 
                        ? "Nenhum cliente encontrado para esta busca" 
                        : filterMode === "without-plan"
                          ? "Todos os clientes já têm plano ativo!"
                          : "Nenhum cliente encontrado"
                      }
                    </div>
                  )}
                  {filteredUsers?.map((user) => {
                    const userSub = getUserSubscription(user.id);
                    return (
                      <SelectItem key={user.id} value={user.id}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${user.isConnected ? 'bg-green-500' : 'bg-red-500'}`} title={user.isConnected ? 'Conectado' : 'Offline'} />
                          <span className="font-medium">{user.name || "Sem nome"}</span>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-sm text-muted-foreground">{user.email || user.phone}</span>
                          {userSub && (
                            <Badge variant="secondary" className="ml-auto text-xs">
                              {userSub.plan.nome}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Selecionar Plano</Label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger data-testid="select-plan" className="h-11">
                  <SelectValue placeholder="Escolha um plano" />
                </SelectTrigger>
                <SelectContent>
                  {plans?.filter(p => p.ativo).map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      <div className="flex items-center justify-between w-full gap-4">
                        <span className="font-medium">{plan.nome}</span>
                        <span className="text-sm text-muted-foreground">
                          R$ {plan.valor}/{plan.periodicidade === "mensal" ? "mês" : "ano"}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Selected user info */}
          {selectedUser && (
            <div className="p-4 rounded-lg bg-muted/50 border">
              {(() => {
                const user = users?.find(u => u.id === selectedUser);
                const userSub = getUserSubscription(selectedUser);
                if (!user) return null;
                return (
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{user.name || "Sem nome"}</p>
                      <p className="text-sm text-muted-foreground">{user.email} • {user.phone}</p>
                    </div>
                    {userSub ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        Plano atual: {userSub.plan.nome}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-orange-600 border-orange-300">
                        Sem plano ativo
                      </Badge>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          <Button 
            onClick={handleAssignPlan} 
            disabled={assignPlanMutation.isPending || !selectedUser || !selectedPlan}
            className="w-full md:w-auto"
            size="lg"
            data-testid="button-assign-plan"
          >
            {assignPlanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Atribuir Plano e Ativar Imediatamente
          </Button>
        </CardContent>
      </Card>

      {/* Active Subscriptions Table */}
      <Card data-testid="card-active-subscriptions">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Assinaturas Ativas
          </CardTitle>
          <CardDescription>Visualize e gerencie todas as assinaturas ativas</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Conexão</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions?.filter(s => s.status === "active").length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <CreditCard className="w-8 h-8 opacity-50" />
                      <p>Nenhuma assinatura ativa</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {subscriptions?.filter(s => s.status === "active").map((subscription) => {
                // Find user connection status from users array
                const userWithStatus = users?.find(u => u.id === subscription.userId);
                const isConnected = userWithStatus?.isConnected || false;
                
                return (
                <TableRow key={subscription.id} data-testid={`row-subscription-${subscription.id}`}>
                  <TableCell>
                    <div className="space-y-0.5">
                      <p className="font-medium">{subscription.user.name || "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground">{subscription.user.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={isConnected ? "default" : "destructive"} className={isConnected ? "bg-green-500 hover:bg-green-600" : ""}>
                      {isConnected ? "Conectado" : "Offline"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                      {subscription.plan.nome}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      Ativo
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {subscription.dataInicio ? new Date(subscription.dataInicio).toLocaleDateString("pt-BR") : "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {subscription.dataFim ? new Date(subscription.dataFim).toLocaleDateString("pt-BR") : "-"}
                  </TableCell>
                  <TableCell className="text-right">
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
              );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
