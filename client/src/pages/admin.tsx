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
import { cn } from "@/lib/utils";
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
import { Loader2, Plus, Trash2, Check, DollarSign, Users, CreditCard, MessageCircle, Bot, LayoutDashboard, Settings, UserCog, Calendar, Edit, Send, Play, RefreshCw, Search, CheckCircle, Copy, Key, Eye, EyeOff, TestTube, LogIn, CheckSquare, Square, ArrowUpDown, ArrowUp, ArrowDown, Lock, Tag, Crown, Building2 } from "lucide-react";
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
        return <UsersManager users={users} subscriptions={subscriptions} />;
      case "manage":
        return <ClientManager users={users} plans={plans} subscriptions={subscriptions} />;
      case "plans":
        return <PlansManager plans={plans} />;
      case "payments":
        return <PaymentsManager pendingPayments={pendingPayments} />;
      case "subscriptions-history":
        return <SubscriptionsHistoryManager />;
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
      case "cupons":
        return <CouponsManager />;
      case "resellers":
        return <ResellersManager />;
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
                    onClick={() => handleTabChange("subscriptions-history")}
                    isActive={activeTab === "subscriptions-history"}
                    tooltip="Assinaturas e Histórico de Cobranças"
                  >
                    <Crown className="w-4 h-4" />
                    <span>Assinaturas</span>
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
                    onClick={() => handleTabChange("cupons")}
                    isActive={activeTab === "cupons"}
                    tooltip="Cupons de Desconto"
                  >
                    <Tag className="w-4 h-4" />
                    <span>Cupons</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleTabChange("resellers")}
                    isActive={activeTab === "resellers"}
                    tooltip="Revendedores White-Label"
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Revendedores</span>
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
                  onClick={() => handleTabChange("cupons")}
                  isActive={activeTab === "cupons"}
                  tooltip="Cupons de Desconto"
                >
                  <Tag className="w-4 h-4" />
                  <span>Cupons</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleTabChange("resellers")}
                  isActive={activeTab === "resellers"}
                  tooltip="Revendedores White-Label"
                >
                  <Building2 className="w-4 h-4" />
                  <span>Revendedores</span>
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
        <div className="flex-1 overflow-auto p-4">
          <div className="w-full space-y-6">
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
  agentMessagesCount?: number;
  messageLimit?: number;
  messagesRemaining?: number;
  isLimitReached?: boolean;
  hasActiveSubscription?: boolean;
}

function UsersManager({ users, subscriptions }: { users: UserWithStatus[] | undefined; subscriptions: (Subscription & { plan: Plan; user: User })[] | undefined }) {
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
  const [viewPasswordUser, setViewPasswordUser] = useState<User | null>(null);
  
  // Bulk selection state
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState("");
  
  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Helper to get user's active subscription
  const getUserSubscription = (userId: string) => {
    return subscriptions?.find(s => s.userId === userId && s.status === "active");
  };

  // Helper to check if user can be deleted
  const canDeleteUser = (user: UserWithStatus) => {
    // Cannot delete admins or owners
    if (user.role === "admin" || user.role === "owner") return false;
    // Cannot delete users with active subscription
    const hasActivePlan = !!getUserSubscription(user.id);
    return !hasActivePlan;
  };

  // Handle column sorting
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Sort icon component
  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="h-4 w-4 ml-1" /> 
      : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  const filteredUsers = users?.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    return (
      user.name?.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower) ||
      user.phone?.includes(searchLower) ||
      user.whatsappNumber?.includes(searchLower)
    );
  });

  // Apply sorting to filtered users
  const sortedUsers = filteredUsers?.slice().sort((a, b) => {
    if (!sortColumn) return 0;
    
    let aValue: any;
    let bValue: any;
    
    switch (sortColumn) {
      case "name":
        aValue = a.name?.toLowerCase() || "";
        bValue = b.name?.toLowerCase() || "";
        break;
      case "email":
        aValue = a.email?.toLowerCase() || "";
        bValue = b.email?.toLowerCase() || "";
        break;
      case "phone":
        aValue = a.whatsappNumber || a.phone || "";
        bValue = b.whatsappNumber || b.phone || "";
        break;
      case "connection":
        aValue = a.isConnected ? 1 : 0;
        bValue = b.isConnected ? 1 : 0;
        break;
      case "type":
        aValue = a.role === "owner" ? 2 : a.role === "admin" ? 1 : 0;
        bValue = b.role === "owner" ? 2 : b.role === "admin" ? 1 : 0;
        break;
      case "plan":
        const planA = getUserSubscription(a.id);
        const planB = getUserSubscription(b.id);
        aValue = planA?.plan.nome || "";
        bValue = planB?.plan.nome || "";
        break;
      case "status":
        aValue = a.onboardingCompleted ? 1 : 0;
        bValue = b.onboardingCompleted ? 1 : 0;
        break;
      case "messages":
        aValue = a.agentMessagesCount || 0;
        bValue = b.agentMessagesCount || 0;
        break;
      case "createdAt":
        aValue = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        bValue = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        break;
      default:
        return 0;
    }
    
    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
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
      
      const message = data.skippedCount > 0 
        ? `${data.deletedCount} excluído(s), ${data.skippedCount} ignorado(s) (admins ou com plano)`
        : `${data.deletedCount} usuário(s) removido(s) com sucesso`;
      
      toast({ 
        title: data.skippedCount > 0 ? "⚠️ Exclusão parcial" : "✅ Usuários excluídos",
        description: message
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
    if (sortedUsers) {
      // Filtrar apenas usuários que podem ser deletados
      const deletableUsers = sortedUsers.filter(canDeleteUser);
      if (selectedUserIds.size === deletableUsers.length && deletableUsers.length > 0) {
        setSelectedUserIds(new Set());
      } else {
        setSelectedUserIds(new Set(deletableUsers.map(u => u.id)));
      }
    }
  };

  const handleSelectUser = (userId: string) => {
    const user = sortedUsers?.find(u => u.id === userId);
    if (!user || !canDeleteUser(user)) {
      toast({
        title: "Não é possível selecionar",
        description: user?.role === "admin" || user?.role === "owner" 
          ? "Administradores não podem ser excluídos"
          : "Usuários com plano ativo não podem ser excluídos",
        variant: "destructive"
      });
      return;
    }
    
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
      <CardContent className="p-0">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={sortedUsers && sortedUsers.filter(canDeleteUser).length > 0 && selectedUserIds.size === sortedUsers.filter(canDeleteUser).length}
                  onCheckedChange={handleSelectAll}
                  aria-label="Selecionar todos os deletáveis"
                />
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center">
                  Nome
                  <SortIcon column="name" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("email")}
              >
                <div className="flex items-center">
                  Email
                  <SortIcon column="email" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("phone")}
              >
                <div className="flex items-center">
                  Telefone
                  <SortIcon column="phone" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("connection")}
              >
                <div className="flex items-center">
                  Conexão
                  <SortIcon column="connection" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("type")}
              >
                <div className="flex items-center">
                  Tipo
                  <SortIcon column="type" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("plan")}
              >
                <div className="flex items-center">
                  Plano
                  <SortIcon column="plan" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("status")}
              >
                <div className="flex items-center">
                  Status
                  <SortIcon column="status" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("messages")}
              >
                <div className="flex items-center">
                  Msgs Usadas
                  <SortIcon column="messages" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort("createdAt")}
              >
                <div className="flex items-center">
                  Data Cadastro
                  <SortIcon column="createdAt" />
                </div>
              </TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedUsers?.map((user: UserWithStatus) => {
              const userSubscription = getUserSubscription(user.id);
              const isDeletable = canDeleteUser(user);
              const isAdmin = user.role === "admin" || user.role === "owner";
              
              return (
              <TableRow key={user.id} data-testid={`row-user-${user.id}`} className={selectedUserIds.has(user.id) ? "bg-muted/50" : ""}>
                <TableCell>
                  <Checkbox
                    checked={selectedUserIds.has(user.id)}
                    onCheckedChange={() => handleSelectUser(user.id)}
                    disabled={!isDeletable}
                    aria-label={`Selecionar ${user.name || user.email}`}
                  />
                </TableCell>
                <TableCell className="font-medium min-w-[150px]">{user.name || "-"}</TableCell>
                <TableCell data-testid={`text-email-${user.id}`} className="min-w-[200px]">{user.email}</TableCell>
                <TableCell className="min-w-[130px]">{user.whatsappNumber || user.phone || "-"}</TableCell>
                <TableCell className="min-w-[180px]">
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
                <TableCell className="min-w-[110px]">
                  {isAdmin ? (
                    <Badge variant="default" className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                      <Settings className="h-3 w-3 mr-1" />
                      {user.role === "owner" ? "Dono" : "Admin"}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      Cliente
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="min-w-[150px]">
                  {userSubscription ? (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 whitespace-nowrap">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {userSubscription.plan.nome}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Sem plano
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="min-w-[100px]">
                  <Badge variant={user.onboardingCompleted ? "default" : "outline"}>
                    {user.onboardingCompleted ? "Ativo" : "Pendente"}
                  </Badge>
                </TableCell>
                <TableCell className="min-w-[140px]">
                  {user.agentMessagesCount !== undefined ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        {user.hasActiveSubscription ? (
                          <Badge variant="default" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">
                            <MessageCircle className="w-3 h-3 mr-1" />
                            Ilimitado
                          </Badge>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Badge 
                              variant="outline"
                              className={cn(
                                "font-medium",
                                user.isLimitReached 
                                  ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800" 
                                  : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300"
                              )}
                            >
                              {user.agentMessagesCount}/{user.messageLimit}
                            </Badge>
                            {/* Barra de progresso visual */}
                            <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div 
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  user.isLimitReached ? "bg-amber-500" : "bg-emerald-500"
                                )}
                                style={{ width: `${Math.min(100, ((user.agentMessagesCount || 0) / (user.messageLimit || 25)) * 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      {!user.hasActiveSubscription && user.isLimitReached && (
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Limite atingido</span>
                      )}
                      {!user.hasActiveSubscription && !user.isLimitReached && user.messagesRemaining !== undefined && user.messagesRemaining <= 5 && (
                        <span className="text-xs text-slate-500">{user.messagesRemaining} restantes</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                  )}
                </TableCell>
                <TableCell className="min-w-[130px]">
                  {user.createdAt ? (
                    <span className="text-sm">
                      {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right space-x-1 min-w-[300px]">
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
                    className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                    onClick={() => setViewPasswordUser(user)}
                    title="Ver Informações de Acesso"
                  >
                    <Eye className="h-4 w-4" />
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
                  {isDeletable ? (
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
                  ) : (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      disabled
                      title={isAdmin ? "Administradores não podem ser excluídos" : "Usuários com plano ativo não podem ser excluídos"}
                      className="opacity-50 cursor-not-allowed"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
            })}
          </TableBody>
        </Table>
        </div>
        
        {(!sortedUsers || sortedUsers.length === 0) && (
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

      <Dialog open={viewPasswordUser !== null} onOpenChange={(open) => !open && setViewPasswordUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-purple-600" />
              Acesso à Conta do Cliente
            </DialogTitle>
            <DialogDescription>
              Use as credenciais abaixo para acessar a conta
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Email de Login</Label>
                  <div className="flex items-center gap-2">
                    <p className="font-medium font-mono text-sm">{viewPasswordUser?.email}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => {
                        navigator.clipboard.writeText(viewPasswordUser?.email || "");
                        toast({ title: "Copiado!", description: "Email copiado." });
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {viewPasswordUser?.name && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Nome</Label>
                    <p className="font-medium">{viewPasswordUser.name}</p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-green-600" />
                  <p className="font-semibold text-green-900">Senha Mestra do Admin</p>
                </div>
                <div className="flex items-center gap-2 bg-white p-2 rounded border">
                  <code className="font-mono text-sm flex-1 select-all">AgentZap@Master2025!</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => {
                      navigator.clipboard.writeText("AgentZap@Master2025!");
                      toast({ title: "Copiado!", description: "Senha mestra copiada." });
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copiar
                  </Button>
                </div>
                <p className="text-xs text-green-800">
                  Esta senha permite logar em <strong>qualquer conta</strong> da plataforma.
                  Use o email do cliente acima + esta senha mestra.
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
              <div className="flex items-center gap-2">
                <LogIn className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-blue-900">
                  Ou use o botão <strong>"Acessar Conta"</strong> na tabela para login direto
                </span>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setViewPasswordUser(null)}>
              Fechar
            </Button>
            <Button 
              onClick={() => {
                // Copiar email e senha juntos
                const credentials = `Email: ${viewPasswordUser?.email}\nSenha: AgentZap@Master2025!`;
                navigator.clipboard.writeText(credentials);
                toast({ title: "Copiado!", description: "Credenciais copiadas para a área de transferência." });
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copiar Tudo
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
              <TableHead>Código Personalizado</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans?.map((plan) => (
              <TableRow key={plan.id} data-testid={`row-plan-${plan.id}`}>
                <TableCell data-testid={`text-plan-name-${plan.id}`}>
                  <div className="flex flex-col">
                    <span className="font-medium">{plan.nome}</span>
                    {(plan as any).isPersonalizado && (
                      <Badge variant="outline" className="mt-1 w-fit text-xs">
                        <Crown className="h-3 w-3 mr-1" />
                        Personalizado
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span>R$ {plan.valor}</span>
                    {(plan as any).valorPrimeiraCobranca && (
                      <span className="text-xs text-muted-foreground">
                        1ª: R$ {(plan as any).valorPrimeiraCobranca}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>{plan.periodicidade}</TableCell>
                <TableCell>
                  {(plan as any).codigoPersonalizado ? (
                    <div className="flex items-center gap-2">
                      <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                        {(plan as any).codigoPersonalizado}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          navigator.clipboard.writeText((plan as any).codigoPersonalizado);
                          toast({ title: "Código copiado!" });
                        }}
                        data-testid={`button-copy-code-${plan.id}`}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={plan.ativo ? "default" : "secondary"}>
                    {plan.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`button-edit-plan-${plan.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <PlanForm
                          onSubmit={(data) => updatePlanMutation.mutate({ id: plan.id, data })}
                          isPending={updatePlanMutation.isPending}
                          initialData={plan}
                        />
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deletePlanMutation.mutate(plan.id)}
                      data-testid={`button-delete-plan-${plan.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
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
    // Campos do Mercado Pago
    isPersonalizado: (initialData as any)?.isPersonalizado ?? false,
    codigoPersonalizado: (initialData as any)?.codigoPersonalizado || "",
    valorPrimeiraCobranca: (initialData as any)?.valorPrimeiraCobranca || "",
    frequenciaDias: (initialData as any)?.frequenciaDias || 30,
    trialDias: (initialData as any)?.trialDias || 0,
  });
  
  const [conversasIlimitadas, setConversasIlimitadas] = useState(initialData?.limiteConversas === -1);
  const [agentesIlimitados, setAgentesIlimitados] = useState(initialData?.limiteAgentes === -1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = {
      ...formData,
      // Garantir que valor seja string (decimal no banco)
      valor: String(formData.valor),
      limiteConversas: conversasIlimitadas ? -1 : formData.limiteConversas,
      limiteAgentes: agentesIlimitados ? -1 : formData.limiteAgentes,
      // valorPrimeiraCobranca deve ser string ou null (decimal no banco)
      valorPrimeiraCobranca: formData.valorPrimeiraCobranca ? String(formData.valorPrimeiraCobranca) : null,
      frequenciaDias: parseInt(formData.frequenciaDias as any) || 30,
      trialDias: parseInt(formData.trialDias as any) || 0,
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
        
        {/* Seção Mercado Pago - Plano Personalizado */}
        <div className="border-t pt-4 mt-4">
          <h4 className="text-sm font-medium mb-4 flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Configurações Mercado Pago
          </h4>
          
          <div className="grid gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="isPersonalizado"
                checked={formData.isPersonalizado}
                onCheckedChange={(checked) => setFormData({ ...formData, isPersonalizado: checked })}
                data-testid="switch-plan-personalizado"
              />
              <Label htmlFor="isPersonalizado">Plano Personalizado (com código exclusivo)</Label>
            </div>
            
            {formData.isPersonalizado && (
              <div className="grid gap-2">
                <Label htmlFor="codigoPersonalizado">Código do Plano Personalizado</Label>
                <Input
                  id="codigoPersonalizado"
                  value={formData.codigoPersonalizado}
                  onChange={(e) => setFormData({ ...formData, codigoPersonalizado: e.target.value.toUpperCase() })}
                  placeholder="Ex: CLIENTE123, PARCEIRO_PREMIUM"
                  data-testid="input-codigo-personalizado"
                />
                <p className="text-xs text-muted-foreground">
                  O cliente usará este código para acessar este plano exclusivo
                </p>
              </div>
            )}
            
            <div className="grid gap-2">
              <Label htmlFor="valorPrimeiraCobranca">Valor da 1ª Cobrança - Implementação (R$)</Label>
              <Input
                id="valorPrimeiraCobranca"
                type="number"
                step="0.01"
                value={formData.valorPrimeiraCobranca}
                onChange={(e) => setFormData({ ...formData, valorPrimeiraCobranca: e.target.value })}
                placeholder="Ex: 499.90 (deixe vazio se igual ao valor mensal)"
                data-testid="input-valor-primeira-cobranca"
              />
              <p className="text-xs text-muted-foreground">
                Taxa de implementação na primeira cobrança. Deixe vazio para usar o valor padrão do plano.
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="frequenciaDias">Frequência de Cobrança (dias)</Label>
                <Input
                  id="frequenciaDias"
                  type="number"
                  value={formData.frequenciaDias}
                  onChange={(e) => setFormData({ ...formData, frequenciaDias: e.target.value })}
                  placeholder="30"
                  data-testid="input-frequencia-dias"
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="trialDias">Período de Teste (dias)</Label>
                <Input
                  id="trialDias"
                  type="number"
                  value={formData.trialDias}
                  onChange={(e) => setFormData({ ...formData, trialDias: e.target.value })}
                  placeholder="0"
                  data-testid="input-trial-dias"
                />
              </div>
            </div>
          </div>
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

// Coupon interface
interface Coupon {
  id: string;
  code: string;
  discountType: string;
  discountValue: string;
  finalPrice: string;
  isActive: boolean;
  maxUses: number | null;
  currentUses: number;
  validFrom: string | null;
  validUntil: string | null;
  applicablePlans: string[] | null;
  createdAt: string;
}

// CouponsManager Component
function CouponsManager() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newFinalPrice, setNewFinalPrice] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newValidUntil, setNewValidUntil] = useState("");
  const [newIsActive, setNewIsActive] = useState(true);
  const [newApplicablePlans, setNewApplicablePlans] = useState<string[]>([]);

  const { data: coupons, isLoading, refetch } = useQuery<Coupon[]>({
    queryKey: ["/api/admin/coupons"],
  });

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const createCouponMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/admin/coupons", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
      toast({ title: "Cupom criado com sucesso!" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar cupom", description: error.message, variant: "destructive" });
    },
  });

  const updateCouponMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PUT", `/api/admin/coupons/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
      toast({ title: "Cupom atualizado com sucesso!" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar cupom", description: error.message, variant: "destructive" });
    },
  });

  const deleteCouponMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/coupons/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
      toast({ title: "Cupom excluído com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao excluir cupom", description: error.message, variant: "destructive" });
    },
  });

  const toggleCouponMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await apiRequest("PUT", `/api/admin/coupons/${id}`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar cupom", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setNewCode("");
    setNewFinalPrice("");
    setNewMaxUses("");
    setNewValidUntil("");
    setNewIsActive(true);
    setNewApplicablePlans([]);
    setEditingCoupon(null);
  };

  const openEditDialog = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setNewCode(coupon.code);
    setNewFinalPrice(coupon.finalPrice);
    setNewMaxUses(coupon.maxUses?.toString() || "");
    setNewValidUntil(coupon.validUntil ? coupon.validUntil.split('T')[0] : "");
    setNewIsActive(coupon.isActive);
    setNewApplicablePlans(coupon.applicablePlans || []);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!newCode.trim()) {
      toast({ title: "Código é obrigatório", variant: "destructive" });
      return;
    }
    if (!newFinalPrice || Number(newFinalPrice) <= 0) {
      toast({ title: "Preço final inválido", variant: "destructive" });
      return;
    }

    const data = {
      code: newCode.toUpperCase(),
      finalPrice: newFinalPrice,
      maxUses: newMaxUses ? parseInt(newMaxUses) : null,
      validUntil: newValidUntil ? new Date(newValidUntil).toISOString() : null,
      isActive: newIsActive,
      applicablePlans: newApplicablePlans.length > 0 ? newApplicablePlans : null,
    };

    if (editingCoupon) {
      updateCouponMutation.mutate({ id: editingCoupon.id, data });
    } else {
      createCouponMutation.mutate(data);
    }
  };

  const togglePlanSelection = (planTipo: string) => {
    setNewApplicablePlans(prev => 
      prev.includes(planTipo) 
        ? prev.filter(p => p !== planTipo)
        : [...prev, planTipo]
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Cupons de Desconto</h2>
          <p className="text-muted-foreground">Gerencie cupons promocionais para seus planos</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Cupom
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingCoupon ? "Editar Cupom" : "Criar Novo Cupom"}</DialogTitle>
              <DialogDescription>
                {editingCoupon ? "Edite os detalhes do cupom" : "Configure um novo cupom de desconto"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="code">Código do Cupom</Label>
                <Input
                  id="code"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  placeholder="Ex: BLACKFRIDAY, WELCOME2025"
                  className="uppercase"
                />
                <p className="text-xs text-muted-foreground">
                  Use nomes únicos e difíceis de adivinhar
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="finalPrice">Preço Final (R$)</Label>
                <Input
                  id="finalPrice"
                  type="number"
                  step="0.01"
                  value={newFinalPrice}
                  onChange={(e) => setNewFinalPrice(e.target.value)}
                  placeholder="Ex: 29.00"
                />
                <p className="text-xs text-muted-foreground">
                  Preço mensal que o cliente pagará com este cupom
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxUses">Limite de Usos (opcional)</Label>
                <Input
                  id="maxUses"
                  type="number"
                  value={newMaxUses}
                  onChange={(e) => setNewMaxUses(e.target.value)}
                  placeholder="Deixe vazio para ilimitado"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="validUntil">Válido Até (opcional)</Label>
                <Input
                  id="validUntil"
                  type="date"
                  value={newValidUntil}
                  onChange={(e) => setNewValidUntil(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Aplicável aos Planos</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {[
                    { tipo: "mensal", label: "Mensal (R$ 99,99)" },
                    { tipo: "padrao", label: "Padrão" },
                    { tipo: "implementacao", label: "Implementação (R$ 700)" },
                    { tipo: "implementacao_mensal", label: "Impl. + Mensal (R$ 799)" },
                  ].map((plan) => (
                    <Badge 
                      key={plan.tipo}
                      variant={newApplicablePlans.includes(plan.tipo) ? "default" : "outline"}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => togglePlanSelection(plan.tipo)}
                    >
                      {newApplicablePlans.includes(plan.tipo) && <Check className="h-3 w-3 mr-1" />}
                      {plan.label}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Deixe vazio para aplicar a todos os planos
                </p>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="isActive">Cupom Ativo</Label>
                <Switch
                  id="isActive"
                  checked={newIsActive}
                  onCheckedChange={setNewIsActive}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={createCouponMutation.isPending || updateCouponMutation.isPending}
              >
                {(createCouponMutation.isPending || updateCouponMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingCoupon ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Preço Final</TableHead>
                <TableHead>Usos</TableHead>
                <TableHead>Planos</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhum cupom cadastrado
                  </TableCell>
                </TableRow>
              )}
              {coupons?.map((coupon) => (
                <TableRow key={coupon.id}>
                  <TableCell className="font-mono font-bold">{coupon.code}</TableCell>
                  <TableCell className="font-semibold text-green-600">
                    R$ {Number(coupon.finalPrice).toFixed(2).replace('.', ',')}
                  </TableCell>
                  <TableCell>
                    {coupon.currentUses}/{coupon.maxUses || "∞"}
                  </TableCell>
                  <TableCell>
                    {coupon.applicablePlans?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {coupon.applicablePlans.map((p: string) => (
                          <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">Todos</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {coupon.validUntil 
                      ? new Date(coupon.validUntil).toLocaleDateString('pt-BR')
                      : <span className="text-muted-foreground">Sem limite</span>
                    }
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={coupon.isActive}
                      onCheckedChange={(checked) => toggleCouponMutation.mutate({ id: coupon.id, isActive: checked })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => openEditDialog(coupon)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Excluir cupom ${coupon.code}?`)) {
                            deleteCouponMutation.mutate(coupon.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dicas de uso */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">💡 Dicas para Cupons</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Use nomes únicos e difíceis de adivinhar (ex: BLACKFRIDAY2025, PARCEIRO10)</p>
          <p>• Evite padrões óbvios como PROMO1, PROMO2, DESCONTO10</p>
          <p>• Configure limite de usos para promoções limitadas</p>
          <p>• Defina data de validade para campanhas temporárias</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// RESELLERS MANAGER - Gerenciamento de Revendedores White-Label
// ============================================================================

interface Reseller {
  id: string;
  userId: string;
  companyName: string;
  companyDescription?: string;
  logoUrl?: string;
  subdomain?: string;
  customDomain?: string;
  domainVerified?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  clientMonthlyPrice?: string;
  clientSetupFee?: string;
  costPerClient?: string;
  maxClients?: number;
  supportEmail?: string;
  supportPhone?: string;
  welcomeMessage?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  user?: { name: string; email: string };
  clientCount?: number;
}

function ResellersManager() {
  const { toast } = useToast();
  const [selectedReseller, setSelectedReseller] = useState<Reseller | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [makeResellerDialogOpen, setMakeResellerDialogOpen] = useState(false);
  const [selectedUserForReseller, setSelectedUserForReseller] = useState<string>("");

  // Buscar revendedores
  const { data: resellers, isLoading, refetch } = useQuery<Reseller[]>({
    queryKey: ["/api/admin/resellers"],
  });

  // Buscar usuários para atribuir plano de revenda
  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  // Mutation para ativar/desativar revendedor
  const toggleResellerMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const response = await apiRequest("PUT", `/api/admin/resellers/${id}/status`, { active });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resellers"] });
      toast({ title: "Status atualizado com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para tornar usuário revendedor
  const makeResellerMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("POST", `/api/admin/users/${userId}/make-reseller`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/resellers"] });
      toast({ title: "Usuário agora é revendedor!" });
      setMakeResellerDialogOpen(false);
      setSelectedUserForReseller("");
    },
    onError: (error: any) => {
      toast({ title: "Erro ao tornar revendedor", description: error.message, variant: "destructive" });
    },
  });

  // Ver detalhes do revendedor
  const handleViewDetails = async (reseller: Reseller) => {
    try {
      const response = await apiRequest("GET", `/api/admin/resellers/${reseller.id}`);
      const data = await response.json();
      setSelectedReseller(data.reseller);
      setIsDetailsDialogOpen(true);
    } catch (error: any) {
      toast({ title: "Erro ao carregar detalhes", description: error.message, variant: "destructive" });
    }
  };

  // Filtrar revendedores
  const filteredResellers = resellers?.filter(r => 
    r.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.user?.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Usuários que ainda não são revendedores
  const nonResellerUsers = users?.filter(u => 
    !resellers?.some(r => r.userId === u.id)
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Revendedores White-Label</h2>
          <p className="text-muted-foreground">
            Gerencie revendedores que possuem marca própria no sistema
          </p>
        </div>
        <Dialog open={makeResellerDialogOpen} onOpenChange={setMakeResellerDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Tornar Revendedor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tornar Usuário em Revendedor</DialogTitle>
              <DialogDescription>
                Selecione um usuário para atribuir o plano de revenda (R$700/mês).
                O usuário poderá criar clientes white-label.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Selecione o Usuário</Label>
                <Select value={selectedUserForReseller} onValueChange={setSelectedUserForReseller}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um usuário..." />
                  </SelectTrigger>
                  <SelectContent>
                    {nonResellerUsers?.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-muted p-4 rounded-lg text-sm space-y-2">
                <p className="font-medium">O que acontece:</p>
                <ul className="list-disc list-inside text-muted-foreground">
                  <li>Usuário recebe assinatura do Plano Revenda</li>
                  <li>Pode personalizar logo, cores e domínio</li>
                  <li>Pode criar clientes por R$49,99/cada</li>
                  <li>Clientes veem apenas a marca do revendedor</li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMakeResellerDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => selectedUserForReseller && makeResellerMutation.mutate(selectedUserForReseller)}
                disabled={!selectedUserForReseller || makeResellerMutation.isPending}
              >
                {makeResellerMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Barra de busca */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por empresa, nome ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revendedores</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resellers?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ativos</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {resellers?.filter(r => r.isActive).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {resellers?.reduce((acc, r) => acc + (r.clientCount || 0), 0) || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Mensal Est.</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {((resellers?.length || 0) * 700 + (resellers?.reduce((acc, r) => acc + (r.clientCount || 0), 0) || 0) * 49.99).toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de revendedores */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Revendedores</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredResellers?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum revendedor encontrado</p>
              <p className="text-sm">Clique em "Tornar Revendedor" para adicionar</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Subdomínio</TableHead>
                  <TableHead>Clientes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResellers?.map((reseller) => (
                  <TableRow key={reseller.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {reseller.logoUrl ? (
                          <img src={reseller.logoUrl} alt="" className="h-8 w-8 rounded object-contain bg-muted" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{reseller.companyName}</p>
                          {reseller.customDomain && (
                            <p className="text-xs text-muted-foreground">{reseller.customDomain}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{reseller.user?.name || '-'}</p>
                        <p className="text-xs text-muted-foreground">{reseller.user?.email || '-'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {reseller.subdomain ? (
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {reseller.subdomain}.agentezap.com
                        </code>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{reseller.clientCount || 0} clientes</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={reseller.isActive ? "default" : "destructive"}>
                        {reseller.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetails(reseller)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleResellerMutation.mutate({ 
                            id: reseller.id, 
                            active: !reseller.isActive 
                          })}
                        >
                          {reseller.isActive ? (
                            <Lock className="h-4 w-4 text-red-500" />
                          ) : (
                            <Check className="h-4 w-4 text-green-500" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog de detalhes */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Revendedor</DialogTitle>
          </DialogHeader>
          {selectedReseller && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Empresa</Label>
                  <p className="font-medium">{selectedReseller.companyName}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Responsável</Label>
                  <p className="font-medium">{selectedReseller.user?.name || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p>{selectedReseller.user?.email || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Subdomínio</Label>
                  <p>{selectedReseller.subdomain ? `${selectedReseller.subdomain}.agentezap.com` : '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Domínio Customizado</Label>
                  <p>{selectedReseller.customDomain || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Clientes</Label>
                  <p>{selectedReseller.clientCount || 0}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Preço para Clientes</Label>
                  <p>R$ {selectedReseller.clientMonthlyPrice || '99.99'}/mês</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Custo por Cliente</Label>
                  <p>R$ {selectedReseller.costPerClient || '49.99'}/mês</p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Cores da Marca</Label>
                <div className="flex gap-2 mt-2">
                  <div 
                    className="w-8 h-8 rounded border" 
                    style={{ backgroundColor: selectedReseller.primaryColor || '#000000' }}
                    title="Cor Primária"
                  />
                  <div 
                    className="w-8 h-8 rounded border" 
                    style={{ backgroundColor: selectedReseller.secondaryColor || '#ffffff' }}
                    title="Cor Secundária"
                  />
                  <div 
                    className="w-8 h-8 rounded border" 
                    style={{ backgroundColor: selectedReseller.accentColor || '#22c55e' }}
                    title="Cor de Destaque"
                  />
                </div>
              </div>
              {selectedReseller.companyDescription && (
                <div>
                  <Label className="text-muted-foreground">Descrição</Label>
                  <p className="text-sm">{selectedReseller.companyDescription}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Informações sobre o sistema de revenda */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">💼 Sistema de Revenda White-Label</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Revendedores pagam R$700/mês pelo plano de revenda</p>
          <p>• Cada cliente criado custa R$49,99/mês para o revendedor</p>
          <p>• Revendedores podem definir preço de venda para seus clientes</p>
          <p>• Clientes do revendedor veem apenas a marca personalizada</p>
          <p>• Subdomínio ou domínio próprio para cada revendedor</p>
        </CardContent>
      </Card>
    </div>
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
    <>
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

    {/* Mercado Pago Configuration */}
    <MercadoPagoConfig />
    
    {/* Annual Discount Configuration */}
    <AnnualDiscountConfig />
    </>
  );
}

// Mercado Pago Configuration Component
function MercadoPagoConfig() {
  const { toast } = useToast();
  const [publicKey, setPublicKey] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [isTestMode, setIsTestMode] = useState(true);
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [testing, setTesting] = useState(false);

  // Fetch current credentials
  const { data: mpCredentials, isLoading, refetch } = useQuery<{
    configured: boolean;
    isTestMode: boolean;
    publicKey: string;
    accessToken: string;
    clientId: string;
    clientSecret: string;
  }>({
    queryKey: ["/api/admin/mercadopago/credentials"],
  });

  // Update state when credentials are loaded
  useEffect(() => {
    if (mpCredentials) {
      setPublicKey(mpCredentials.publicKey || "");
      setAccessToken(mpCredentials.accessToken || "");
      setClientId(mpCredentials.clientId || "");
      setClientSecret(mpCredentials.clientSecret || "");
      setIsTestMode(mpCredentials.isTestMode ?? true);
    }
  }, [mpCredentials]);

  const saveCredentialsMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PUT", "/api/admin/mercadopago/credentials", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mercadopago/credentials"] });
      toast({ title: "Credenciais do Mercado Pago salvas com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao salvar credenciais", description: error.message, variant: "destructive" });
    },
  });

  const testConnection = async () => {
    setTesting(true);
    try {
      const response = await apiRequest("POST", "/api/admin/mercadopago/test");
      const data = await response.json();
      if (data.success) {
        toast({ 
          title: "✅ Conexão com Mercado Pago OK!", 
          description: data.message 
        });
      } else {
        toast({ 
          title: "❌ Erro na conexão", 
          description: data.message,
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      toast({ 
        title: "❌ Erro ao testar conexão", 
        description: error.message,
        variant: "destructive" 
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    saveCredentialsMutation.mutate({
      publicKey,
      accessToken,
      clientId,
      clientSecret,
      isTestMode,
    });
  };

  // Fill with test credentials
  const fillTestCredentials = () => {
    setPublicKey("TEST-224d6148-83a6-43fc-bded-659e7be60eb6");
    setAccessToken("TEST-7853790746726235-122922-014a7c91c63452a78e2732d7f5bf24a0-1105684259");
    setIsTestMode(true);
    toast({ title: "Credenciais de teste preenchidas" });
  };

  // Fill with production credentials
  const fillProdCredentials = () => {
    setPublicKey("APP_USR-c6880571-f1e5-4c5b-adba-d78ec125d570");
    setAccessToken("APP_USR-7853790746726235-122922-c063f3f0183988a1216419552a24f097-1105684259");
    setClientId("7853790746726235");
    setClientSecret("NDT5vcvhWXvFj8eBcJkjbwmddeDNOhNh");
    setIsTestMode(false);
    toast({ title: "Credenciais de produção preenchidas" });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-mercadopago-config">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Mercado Pago - Assinaturas
        </CardTitle>
        <CardDescription>
          Configure suas credenciais do Mercado Pago para cobranças recorrentes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick fill buttons */}
        <div className="flex gap-2 flex-wrap">
          <Button 
            type="button" 
            variant="outline" 
            size="sm"
            onClick={fillTestCredentials}
          >
            <TestTube className="h-4 w-4 mr-2" />
            Usar Credenciais de Teste
          </Button>
          <Button 
            type="button" 
            variant="outline" 
            size="sm"
            onClick={fillProdCredentials}
          >
            <Key className="h-4 w-4 mr-2" />
            Usar Credenciais de Produção
          </Button>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center justify-between border rounded-lg p-3">
          <div className="space-y-0.5">
            <Label className="font-medium">Modo de Operação</Label>
            <p className="text-sm text-muted-foreground">
              {isTestMode ? "Modo de Teste (sandbox)" : "Modo de Produção (real)"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={isTestMode ? "text-muted-foreground" : "text-green-600 font-medium"}>Produção</span>
            <Switch
              checked={isTestMode}
              onCheckedChange={setIsTestMode}
            />
            <span className={isTestMode ? "text-yellow-600 font-medium" : "text-muted-foreground"}>Teste</span>
          </div>
        </div>

        {/* Public Key */}
        <div className="space-y-2">
          <Label htmlFor="mpPublicKey">Public Key</Label>
          <Input
            id="mpPublicKey"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder={isTestMode ? "TEST-..." : "APP_USR-..."}
          />
        </div>

        {/* Access Token */}
        <div className="space-y-2">
          <Label htmlFor="mpAccessToken">Access Token</Label>
          <div className="relative">
            <Input
              id="mpAccessToken"
              type={showAccessToken ? "text" : "password"}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={isTestMode ? "TEST-..." : "APP_USR-..."}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowAccessToken(!showAccessToken)}
            >
              {showAccessToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Client ID and Secret (only for production) */}
        {!isTestMode && (
          <>
            <div className="space-y-2">
              <Label htmlFor="mpClientId">Client ID</Label>
              <Input
                id="mpClientId"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Seu Client ID"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mpClientSecret">Client Secret</Label>
              <div className="relative">
                <Input
                  id="mpClientSecret"
                  type={showClientSecret ? "text" : "password"}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Seu Client Secret"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowClientSecret(!showClientSecret)}
                >
                  {showClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-2">
          <Button 
            onClick={handleSave}
            disabled={saveCredentialsMutation.isPending || !publicKey || !accessToken}
          >
            {saveCredentialsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Credenciais
          </Button>
          <Button 
            variant="outline"
            onClick={testConnection}
            disabled={testing || !accessToken}
          >
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Testar Conexão
          </Button>
        </div>

        {/* Status indicator */}
        {mpCredentials?.configured && (
          <div className="flex items-center gap-2 text-sm text-green-600 mt-2">
            <CheckCircle className="h-4 w-4" />
            Mercado Pago configurado ({mpCredentials.isTestMode ? "teste" : "produção"})
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Annual Discount Configuration Component
function AnnualDiscountConfig() {
  const { toast } = useToast();
  const [discountPercent, setDiscountPercent] = useState<number>(5);
  const [isEnabled, setIsEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch current config
  const { data: config, isLoading, refetch } = useQuery<{ percent: number; enabled: boolean }>({
    queryKey: ["/api/system-config/annual-discount"],
  });

  // Update state when config loads
  useEffect(() => {
    if (config) {
      setDiscountPercent(config.percent || 5);
      setIsEnabled(config.enabled !== false);
    }
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest("POST", "/api/admin/annual-discount", {
        percent: discountPercent,
        enabled: isEnabled,
      });
      toast({ title: "✅ Desconto anual atualizado!" });
      refetch();
    } catch (error: any) {
      toast({ title: "❌ Erro ao salvar", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-annual-discount-config">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          Desconto Plano Anual
        </CardTitle>
        <CardDescription>
          Configure o desconto oferecido para clientes que pagam o plano anual (12 meses)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable/Disable toggle */}
        <div className="flex items-center justify-between border rounded-lg p-3">
          <div className="space-y-0.5">
            <Label className="font-medium">Desconto Anual</Label>
            <p className="text-sm text-muted-foreground">
              {isEnabled ? "Desconto ativo para pagamentos anuais" : "Desconto desativado"}
            </p>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={setIsEnabled}
          />
        </div>

        {/* Discount percentage */}
        <div className="space-y-2">
          <Label htmlFor="discountPercent">Porcentagem de Desconto (%)</Label>
          <div className="flex items-center gap-2">
            <Input
              id="discountPercent"
              type="number"
              min="0"
              max="50"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Math.min(50, Math.max(0, Number(e.target.value))))}
              className="w-24"
              disabled={!isEnabled}
            />
            <span className="text-lg font-bold text-green-600">%</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Ex: Com {discountPercent}% de desconto, um plano de R$ 99,99/mês custará{" "}
            <span className="font-bold text-green-600">
              R$ {(99.99 * 12 * (1 - discountPercent / 100)).toFixed(2).replace(".", ",")}
            </span>{" "}
            por ano (economia de R$ {(99.99 * 12 * (discountPercent / 100)).toFixed(2).replace(".", ",")})
          </p>
        </div>

        {/* Save button */}
        <Button 
          onClick={handleSave}
          disabled={saving}
        >
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar Configuração
        </Button>
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

// Subscriptions History Manager - Complete view of all subscriptions and payment history
function SubscriptionsHistoryManager() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSubscription, setSelectedSubscription] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Fetch all subscriptions with payment info
  const { data: subscriptions, isLoading: loadingSubscriptions } = useQuery({
    queryKey: ["/api/admin/subscriptions"],
  });

  // Fetch payment history for selected subscription
  const { data: paymentHistory, isLoading: loadingHistory } = useQuery({
    queryKey: ["/api/admin/payment-history", selectedSubscription],
    queryFn: async () => {
      const url = selectedSubscription 
        ? `/api/admin/payment-history?subscriptionId=${selectedSubscription}`
        : "/api/admin/payment-history";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    },
  });

  // Fetch subscription statistics
  const { data: stats } = useQuery({
    queryKey: ["/api/admin/subscription-stats"],
  });

  const formatCurrency = (value: string | number | null | undefined) => {
    if (!value) return "R$ 0,00";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(num);
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateString));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Aprovado</Badge>;
      case "rejected":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Recusado</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pendente</Badge>;
      case "active":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Ativo</Badge>;
      case "cancelled":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Cancelado</Badge>;
      case "expired":
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Expirado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredSubscriptions = (subscriptions as any[])?.filter((sub: any) => {
    const matchesSearch = !searchTerm || 
      sub.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.mpSubscriptionId?.includes(searchTerm);
    
    const matchesStatus = statusFilter === "all" || sub.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  }) || [];

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Assinaturas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(stats as any)?.totalSubscriptions || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Assinaturas Ativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{(stats as any)?.activeSubscriptions || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Recebido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {formatCurrency((stats as any)?.totalRevenue)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pagamentos Rejeitados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{(stats as any)?.rejectedPayments || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5" />
            Assinaturas e Histórico de Cobranças
          </CardTitle>
          <CardDescription>
            Visualize todas as assinaturas e histórico completo de pagamentos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por email, nome ou ID da assinatura..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
                <SelectItem value="expired">Expirados</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Subscriptions Table */}
          {loadingSubscriptions ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Próx. Cobrança</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>ID MercadoPago</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubscriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhuma assinatura encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSubscriptions.map((sub: any) => (
                    <TableRow 
                      key={sub.id}
                      className={selectedSubscription === sub.id ? "bg-muted/50" : ""}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{sub.user?.name || "Sem nome"}</p>
                          <p className="text-xs text-muted-foreground">{sub.user?.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{sub.plan?.nome || "N/A"}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(sub.status)}</TableCell>
                      <TableCell className="text-sm">
                        {sub.dataInicio ? new Date(sub.dataInicio).toLocaleDateString("pt-BR") : "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {sub.nextPaymentDate ? new Date(sub.nextPaymentDate).toLocaleDateString("pt-BR") : "-"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(sub.plan?.preco)}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {sub.mpSubscriptionId ? sub.mpSubscriptionId.substring(0, 12) + "..." : "-"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={selectedSubscription === sub.id ? "default" : "outline"}
                          onClick={() => setSelectedSubscription(
                            selectedSubscription === sub.id ? null : sub.id
                          )}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Histórico
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Payment History for Selected Subscription */}
      {selectedSubscription && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Histórico de Pagamentos
            </CardTitle>
            <CardDescription>
              Cobranças da assinatura selecionada
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (paymentHistory as any[])?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum pagamento registrado para esta assinatura
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Líquido</TableHead>
                    <TableHead>Taxa MP</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detalhe</TableHead>
                    <TableHead>ID MP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(paymentHistory as any[])?.map((payment: any) => (
                    <TableRow key={payment.id}>
                      <TableCell className="text-sm">
                        {formatDate(payment.paymentDate || payment.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {payment.paymentType === "first_payment" ? "1ª Parcela" : 
                           payment.paymentType === "setup_fee" ? "Taxa Impl." :
                           payment.paymentType === "recurring" ? "Recorrente" : payment.paymentType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell className="text-green-600">
                        {formatCurrency(payment.netAmount)}
                      </TableCell>
                      <TableCell className="text-red-500 text-sm">
                        {formatCurrency(payment.feeAmount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <CreditCard className="w-3 h-3" />
                          <span className="capitalize text-sm">
                            {payment.cardBrand || payment.paymentMethod || "-"}
                          </span>
                          {payment.cardLastFourDigits && (
                            <span className="text-muted-foreground">
                              •••• {payment.cardLastFourDigits}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(payment.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                        {payment.statusDetail || "-"}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {payment.mpPaymentId || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Full Payment History */}
      {!selectedSubscription && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Últimos Pagamentos (Todos os Clientes)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (paymentHistory as any[])?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum pagamento registrado
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>ID MP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(paymentHistory as any[])?.slice(0, 50).map((payment: any) => (
                    <TableRow key={payment.id}>
                      <TableCell className="text-sm">
                        {formatDate(payment.paymentDate || payment.createdAt)}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{payment.payerEmail || "-"}</span>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell>{getStatusBadge(payment.status)}</TableCell>
                      <TableCell>
                        <span className="capitalize text-sm">
                          {payment.cardBrand || payment.paymentMethod || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {payment.mpPaymentId || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
