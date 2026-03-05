import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useBranding } from "@/hooks/useBranding";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Settings, LogOut, Smartphone, Bot, CreditCard, LayoutDashboard, AlertCircle, Send, Kanban, Users, Tags, Filter, Plug, CalendarClock, BedDouble, Wrench, ChevronDown, Megaphone, Brain, Upload, BookUser, Bell, Rocket, Sparkles, Receipt, Ban, Building2, FormInput, Package, UtensilsCrossed, ClipboardList, Mic, Workflow, Ticket, HelpCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
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
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ConversationsList } from "@/components/conversations-list";
import { ChatArea } from "@/components/chat-area";
import { ContactDetailsPanel } from "@/components/contact-details-panel";
import { ConnectionPanel } from "@/components/connection-panel";
import { DashboardStats } from "@/components/dashboard-stats";
import { LimitReachedTopBanner } from "@/components/usage-limit-banner";
import { SuspensionBanner } from "@/components/suspension-banner";
import MyAgent from "@/pages/my-agent";
import PlansPage from "@/pages/plans";
import SubscribePage from "@/pages/subscribe";
import SettingsPage from "@/pages/settings";
import MassSendPage from "@/pages/mass-send";
import CampaignsPage from "@/pages/campaigns";
import KanbanPage from "@/pages/kanban";
import ContactsPage from "@/pages/contacts";
import SyncedContactsPage from "@/pages/synced-contacts";
import TagsPage from "@/pages/tags";
import FunnelPage from "@/pages/funnel";
import IntegrationsPage from "@/pages/integrations";
import SchedulingPage from "@/pages/scheduling";
import ReservationsPage from "@/pages/reservations";
import LeadQualificationPage from "@/pages/lead-qualification";
import MediaLibraryPage from "@/pages/media-library";
import ContactListsPage from "@/pages/contact-lists";
import SmartNotifierPage from "@/pages/smart-notifier";
import FollowupConfigPage from "@/pages/followup-config";
import PaymentHistoryPage from "@/pages/payment-history";
import MySubscriptionPage from "@/pages/my-subscription";
import ExclusionListPage from "@/pages/exclusion-list";
import CustomFieldsPage from "@/pages/custom-fields";
import ProductsPage from "@/pages/products";
import DeliveryMenuPage from "@/pages/delivery-menu";
import DeliveryOrdersPage from "@/pages/delivery-orders";
import DeliveryReportsPage from "@/pages/delivery-reports";
import SalonMenuPage from "@/pages/salon-menu";
import SalonAppointmentsPage from "@/pages/salon-appointments";
import AudioConfigPage from "@/pages/audio-config";
import FlowBuilderPage from "@/pages/flow-builder";
import ToolsMenuPage from "@/pages/tools-menu";
import ToolsSegmentPage from "@/pages/tools-segment";
import TicketsPage from "@/pages/TicketsPage";
import TicketDetailPage from "@/pages/TicketDetailPage";
import TicketCreatePage from "@/pages/TicketCreatePage";
import HelpCenterPage from "@/pages/help-center";
import { UpgradeBanner } from "@/components/upgrade-cta";
import { useLocation, useRoute } from "wouter";
import type { WhatsappConnection, AiAgentConfig, Subscription, Plan, Conversation } from "@shared/schema";
import { supabase, refreshSession } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

// Interface para status de suspensão
interface SuspensionStatus {
  suspended: boolean;
  reason?: string;
  type?: string;
  suspendedAt?: string;
  refundedAt?: string;
  refundAmount?: number;
}

// Interface for /api/usage response (canonical entitlement source)
interface UsageData {
  agentMessagesCount: number;
  limit: number;
  remaining: number;
  isLimitReached: boolean;
  hasActiveSubscription: boolean;
  planName: string | null;
}
export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading, user } = useAuth();
  const isMember = (user as any)?.isMember;
  const permissions = (user as any)?.memberData?.permissions || {};
  
  const { branding } = useBranding(); // Get white-label branding
  const { data: subscription } = useQuery<Subscription & { plan: Plan } | null>({
    queryKey: ["/api/subscriptions/current"],
    enabled: !!isAuthenticated,
  });
  // Canonical entitlement check from /api/usage (considers reseller + SaaS + expiration)
  const { data: usageData } = useQuery<UsageData>({
    queryKey: ["/api/usage"],
    enabled: !!isAuthenticated,
    refetchInterval: 60000, // 60s ao invés de 30s
    staleTime: 30000,
  });
  // True subscription active status (from canonical helper, not just subscription.status)
  const isEffectivelyPaid = usageData?.hasActiveSubscription ?? false;
  // Verificar status de suspensão do usuário
  const { data: suspensionStatus } = useQuery<SuspensionStatus>({
    queryKey: ["/api/user/suspension-status"],
    enabled: !!isAuthenticated,
    refetchInterval: 60000, // Verificar a cada minuto
  });
  const isSuspended = suspensionStatus?.suspended || false;
  // Verificar se usuário é revendedor
  const { data: resellerStatus } = useQuery<{ hasResellerPlan: boolean }>({
    queryKey: ["/api/reseller/status"],
    enabled: !!isAuthenticated,
  });
  const isReseller = resellerStatus?.hasResellerPlan || false;
  
  // Buscar plano atribuído (se houver)
  const { data: assignedPlanResponse } = useQuery<{ hasAssignedPlan: boolean; plan?: Plan & { valor?: number } }>({
    queryKey: ["/api/user/assigned-plan"],
    enabled: !!isAuthenticated,
  });
  
  // Extrair o plano da resposta
  const assignedPlanData = assignedPlanResponse?.plan;

  const [selectedView, setSelectedView] = useState<"conversations" | "connection" | "stats" | "agent">("conversations");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showContactPanel, setShowContactPanel] = useState(false);
  const [location, setLocation] = useLocation();
  const [autologinLoading, setAutologinLoading] = useState<boolean>(false);
  const [autologinError, setAutologinError] = useState<string | null>(null);
  
  // 🔗 Extrair conversationId da URL se estiver na rota /conversas/:conversationId
  const [, conversationParams] = useRoute("/conversas/:conversationId");
  const urlConversationId = conversationParams?.conversationId;
  
  // 📌 Sincronizar selectedConversationId com a URL
  useEffect(() => {
    if (urlConversationId && urlConversationId !== selectedConversationId) {
      setSelectedConversationId(urlConversationId);
    }
  }, [urlConversationId]);
  
  const isConversasRoute = location.startsWith("/conversas");
  const isConexaoRoute = location.startsWith("/conexao");
  const isMeuAgenteRoute = location.startsWith("/meu-agente-ia");
  const isMediaLibraryRoute = location.startsWith("/biblioteca-midias");
  const isPlansRoute = location.startsWith("/plans");
  const isSettingsRoute = location.startsWith("/settings");
  const isSubscribeRoute = location.startsWith("/subscribe/");
  const isMassSendRoute = location.startsWith("/envio-em-massa");
  const isCampaignsRoute = location.startsWith("/campanhas");
  const isKanbanRoute = location.startsWith("/kanban");
  const isContactsRoute = location.startsWith("/contatos") && !location.startsWith("/contatos-sincronizados");
  const isSyncedContactsRoute = location.startsWith("/contatos-sincronizados");
  const isTagsRoute = location.startsWith("/etiquetas");
  const isFunnelRoute = location.startsWith("/funil");
  const isIntegrationsRoute = location.startsWith("/integracoes");
  const isSchedulingRoute = location.startsWith("/agendamentos");
  const isReservationsRoute = location.startsWith("/reservas");
  const isLeadQualificationRoute = location.startsWith("/qualificacao");
  const isContactListsRoute = location.startsWith("/listas-contatos");
  const isNotifierRoute = location.startsWith("/notificador");
  const isFollowupRoute = location.startsWith("/followup");
  const isPaymentHistoryRoute = location.startsWith("/payment-history") || location.startsWith("/historico-pagamentos");
  const isMySubscriptionRoute = location.startsWith("/minha-assinatura");
  const isExclusionListRoute = location.startsWith("/lista-exclusao");
  const isCustomFieldsRoute = location.startsWith("/campos-personalizados");
  const isProductsRoute = location.startsWith("/produtos");
  const isDeliveryMenuRoute = location.startsWith("/delivery-cardapio");
  const isDeliveryOrdersRoute = location.startsWith("/delivery-pedidos");
  const isDeliveryReportsRoute = location.startsWith("/delivery-relatorios");
  const isSalonMenuRoute = location.startsWith("/salon-menu");
  const isSalonAppointmentsRoute = location.startsWith("/salon-agendamentos");
  const isAudioConfigRoute = location.startsWith("/falar-por-audio");
  const isFlowBuilderRoute = location.startsWith("/construtor-fluxo");
  const isToolsMenuRoute = location === "/ferramentas";
  const isToolsSegmentRoute = location.startsWith("/ferramentas/");
  const isTicketsRoute = location.startsWith("/tickets");
  const isHelpCenterRoute = location.startsWith("/ajuda");
  const isTicketsNewRoute = location === "/tickets/new";
  const [matchTicketsDetail] = useRoute("/tickets/:id");
  const isTicketsDetailRoute = matchTicketsDetail && location !== "/tickets/new" && location !== "/tickets";
  const isDashboardMode =
    !isConversasRoute &&
    !isConexaoRoute &&
    !isMeuAgenteRoute &&
    !isMediaLibraryRoute &&
    !isPlansRoute &&
    !isSettingsRoute &&
    !isSubscribeRoute &&
    !isMassSendRoute &&
    !isCampaignsRoute &&
    !isKanbanRoute &&
    !isContactsRoute &&
    !isSyncedContactsRoute &&
    !isTagsRoute &&
    !isFunnelRoute &&
    !isIntegrationsRoute &&
    !isSchedulingRoute &&
    !isReservationsRoute &&
    !isLeadQualificationRoute &&
    !isContactListsRoute &&
    !isNotifierRoute &&
    !isFollowupRoute &&
    !isPaymentHistoryRoute &&
    !isMySubscriptionRoute &&
    !isExclusionListRoute &&
    !isCustomFieldsRoute &&
    !isProductsRoute &&
    !isDeliveryMenuRoute &&
    !isDeliveryOrdersRoute &&
    !isDeliveryReportsRoute &&
    !isSalonMenuRoute &&
    !isSalonAppointmentsRoute &&
    !isAudioConfigRoute &&
    !isFlowBuilderRoute &&
    !isTicketsRoute &&
    !isHelpCenterRoute &&
    !isToolsMenuRoute &&
    !isToolsSegmentRoute;
  const isToolsRoute =
    isMassSendRoute ||
    isCampaignsRoute ||
    isKanbanRoute ||
    isContactsRoute ||
    isSyncedContactsRoute ||
    isTagsRoute ||
    isFunnelRoute ||
    isIntegrationsRoute ||
    isSchedulingRoute ||
    isReservationsRoute ||
    isLeadQualificationRoute ||
    isContactListsRoute ||
    isNotifierRoute ||
    isFollowupRoute ||
    isExclusionListRoute ||
    isCustomFieldsRoute ||
    isProductsRoute ||
    isDeliveryMenuRoute ||
    isDeliveryOrdersRoute ||
    isDeliveryReportsRoute ||
    isSalonMenuRoute ||
    isSalonAppointmentsRoute ||
    isAudioConfigRoute ||
    isFlowBuilderRoute ||
    isTicketsRoute ||
    isToolsMenuRoute ||
    isToolsSegmentRoute;
  
  // Rotas do menu Configurações
  const isConfigRoute =
    isPlansRoute ||
    isSettingsRoute ||
    isSubscribeRoute ||
    isPaymentHistoryRoute ||
    isMySubscriptionRoute;
  
  // Start tools collapsed by default; open only when user clicks or route requires it
  const [toolsOpen, setToolsOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [toolsPickerOpen, setToolsPickerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 🔗 Handler para selecionar conversa e atualizar URL
  const handleSelectConversation = (conversationId: string | null) => {
    setSelectedConversationId(conversationId);
    if (conversationId) {
      setLocation(`/conversas/${conversationId}`);
    } else {
      setLocation("/conversas");
    }
  };

  const goToSection = (view: "conversations" | "connection" | "stats" | "agent") => {
    setSelectedView(view);
    // Atualizar URL conforme a view
    if (view === "conversations") {
      setLocation("/conversas");
      setSelectedConversationId(null); // Limpar conversa selecionada ao voltar para lista
    } else if (view === "connection") {
      setLocation("/conexao");
    } else if (view === "agent") {
      setLocation("/meu-agente-ia");
    } else if (view === "stats") {
      setLocation("/dashboard");
    }
  };

  // Sincronizar view com a rota atual
  useEffect(() => {
    if (isConversasRoute) {
      setSelectedView("conversations");
    } else if (isConexaoRoute) {
      setSelectedView("connection");
    } else if (isMeuAgenteRoute) {
      setSelectedView("agent");
    } else if (isDashboardMode) {
      setSelectedView("stats");
    }
  }, [isConversasRoute, isConexaoRoute, isMeuAgenteRoute, isDashboardMode]);

  useEffect(() => {
    if (isToolsRoute) {
      setSidebarOpen(false);
      setToolsOpen(true);
    }
  }, [isToolsRoute]);

  const handleLogout = async () => {
    try {
      // Verificar se é membro da equipe
      const memberToken = localStorage.getItem("memberToken");
      
      if (memberToken) {
        // Logout de membro
        try {
          await fetch("/api/team-members/logout", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${memberToken}`,
            },
            credentials: "include",
          });
        } catch (err) {
          console.warn("Falha ao chamar /api/team-members/logout:", err);
        }
        
        // Limpar localStorage de membro
        localStorage.removeItem("memberToken");
        localStorage.removeItem("memberData");
      } else {
        // Logout de usuário normal
        try {
          // Limpa a sessão local do Supabase (token)
          await supabase.auth.signOut();
        } catch (err) {
          console.error("Erro ao sair (supabase):", err);
        }

        try {
          // Limpa a sessão de servidor (se existir)
          await fetch("/api/logout", { credentials: "include" });
        } catch (err) {
          console.warn("Falha ao chamar /api/logout:", err);
        }
      }

      try {
        // Limpa cache de consultas relacionadas a auth
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        await queryClient.clear();
      } catch {}

      // Redireciona para tela de login apropriada
      setLocation(memberToken ? "/membro-login" : "/login");
    } catch (error) {
      console.error("Erro durante logout:", error);
      // Forçar redirecionamento mesmo se houver erro
      setLocation("/login");
    }
  };

  // Autologin effect: tries to exchange token from URL for a session
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) return;

    let mounted = true;
    (async () => {
      setAutologinLoading(true);
      try {
        const res = await fetch("/api/autologin/" + encodeURIComponent(token));
        if (res.ok) {
          const data = await res.json();
          const { access_token, refresh_token } = data || {};
          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
            // Remove only the `token` param; preserve remaining params and hash
            const cleanParams = new URLSearchParams(window.location.search);
            cleanParams.delete("token");
            const cleanSearch = cleanParams.toString();
            const cleanUrl = window.location.pathname + (cleanSearch ? "?" + cleanSearch : "") + window.location.hash;
            window.history.replaceState({}, "", cleanUrl);
            try {
              await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
            } catch {}
            return;
          }
        }
        setAutologinError("⚠️ Este link expirou ou já foi usado. Solicite um novo link pelo WhatsApp.");
      } catch (e) {
        setAutologinError("⚠️ Este link expirou ou já foi usado. Solicite um novo link pelo WhatsApp.");
      } finally {
        if (mounted) setAutologinLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    // Aguardar antes de redirecionar para login
    // Isso dá tempo para o token ser recuperado/refreshed do localStorage
    if (!isLoading && !isAuthenticated && !autologinLoading && !autologinError) {
      const timer = setTimeout(async () => {
        // 🔄 ANTES de redirecionar, tenta refresh da sessão
        // (pode ser que o token expirou mas o refresh token ainda é válido)
        try {
          console.log("[DASHBOARD] Não autenticado, tentando refresh antes de redirecionar...");
          const refreshed = await refreshSession();
          if (refreshed) {
            console.log("[DASHBOARD] ✅ Refresh bem sucedido, cancelando redirect");
            // Invalidar query para re-fetch com novo token
            queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
            return; // NÃO redirecionar - sessão foi recuperada
          }
        } catch (e) {
          console.warn("[DASHBOARD] Erro ao tentar refresh:", e);
        }

        // Verificar novamente se virou autenticado (pode ter mudado enquanto refreshava)
        const currentUser = queryClient.getQueryData(["/api/auth/user"]);
        if (currentUser) {
          console.log("[DASHBOARD] Usuário encontrado no cache após refresh, cancelando redirect");
          return;
        }
        
        // Realmente não autenticado - redirecionar
        toast({
          title: "Não autorizado",
          description: "Você precisa fazer login. Redirecionando...",
          variant: "destructive",
        });
        setTimeout(() => {
          setLocation("/login");
        }, 500);
      }, 2000); // ⚡ 2 segundos (antes 4s) - getAuthToken() agora faz refresh proativo
      
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, isLoading, toast, setLocation, autologinLoading, autologinError]);

  const { data: connection } = useQuery<WhatsappConnection>({
    queryKey: ["/api/whatsapp/connection"],
    enabled: isAuthenticated,
  });

  const { data: agentConfig } = useQuery<AiAgentConfig | null>({
    queryKey: ["/api/agent/config"],
    enabled: !!isAuthenticated,
    staleTime: 60000,
  });

  // Query para buscar os dados da conversa selecionada (para o painel de detalhes)
  const { data: selectedConversation } = useQuery<Conversation>({
    queryKey: ["/api/conversation", selectedConversationId],
    enabled: !!selectedConversationId,
  });

type ToolNavItem = {
  label: string;
  icon: LucideIcon;
  tooltip: string;
  isActive: boolean;
  testId: string;
  href?: string;
  action?: () => void;
  subItems?: ToolNavItem[];
};

const toolsNavigation: ToolNavItem[] = [
  { label: "Inteligência Artificial",
    icon: Bot,
    tooltip: "Meu Agente IA",
    isActive: isDashboardMode && selectedView === "agent",
    testId: "button-nav-ai",
    action: () => {
      goToSection("agent");
    },
  },
  // [PARTE 5] Menu "Robô / Fluxo" removido - Fluxo agora fica em Meu Agente IA (aba Fluxo)
  { 
    label: "🏪 Ferramentas por Segmento", 
    href: "/ferramentas",
    icon: Wrench, 
    tooltip: "Ferramentas personalizadas por tipo de negócio", 
    isActive: isToolsMenuRoute || isToolsSegmentRoute, 
    testId: "button-nav-tools-menu",
  },
  { 
    label: "🍕 Delivery", 
    icon: UtensilsCrossed, 
    tooltip: "Cardápio e pedidos do delivery", 
    isActive: isDeliveryMenuRoute || isDeliveryOrdersRoute || isDeliveryReportsRoute, 
    testId: "button-nav-delivery",
    subItems: [
      { label: "📦 Cardápio", href: "/delivery-cardapio", icon: UtensilsCrossed, tooltip: "Cardápio para pedidos delivery", isActive: isDeliveryMenuRoute, testId: "button-nav-delivery-menu" },
      { label: "Pedidos", href: "/delivery-pedidos", icon: ClipboardList, tooltip: "Painel de pedidos delivery", isActive: isDeliveryOrdersRoute, testId: "button-nav-delivery-orders" },
      { label: "📊 Relatórios", href: "/delivery-relatorios", icon: ClipboardList, tooltip: "Relatórios de vendas e faturamento", isActive: isDeliveryReportsRoute, testId: "button-nav-delivery-reports" },
    ]
  },
  { 
    label: "💇 Salão de Beleza", 
    icon: CalendarClock, 
    tooltip: "Agendamentos para salão de beleza", 
    isActive: isSalonMenuRoute || isSalonAppointmentsRoute, 
    testId: "button-nav-salon",
    subItems: [
      { label: "⚙️ Configuração", href: "/salon-menu", icon: CalendarClock, tooltip: "Configurar salão, serviços e profissionais", isActive: isSalonMenuRoute, testId: "button-nav-salon-menu" },
      { label: "📅 Agendamentos", href: "/salon-agendamentos", icon: CalendarClock, tooltip: "Ver agendamentos do salão", isActive: isSalonAppointmentsRoute, testId: "button-nav-salon-appointments" },
    ]
  },
  { label: "📅 Agendamentos", href: "/agendamentos", icon: CalendarClock, tooltip: "Painel de agendamentos", isActive: isSchedulingRoute, testId: "button-nav-scheduling" },
  { label: "Follow-up Inteligente", href: "/followup", icon: Sparkles, tooltip: "Mensagens automáticas para recuperar conversas", isActive: isFollowupRoute, testId: "button-nav-followup" },
  { label: "Lista de Exclusão", href: "/lista-exclusao", icon: Ban, tooltip: "Números que a IA não deve responder", isActive: isExclusionListRoute, testId: "button-nav-exclusion-list" },
  // Tickets removido de Ferramentas - agora está no menu principal como "Suporte"
  { label: "Falar por Áudio", href: "/falar-por-audio", icon: Mic, tooltip: "Respostas em áudio com TTS", isActive: isAudioConfigRoute, testId: "button-nav-audio-config" },
  { label: "Notificador Inteligente", href: "/notificador", icon: Bell, tooltip: "Notificações automáticas", isActive: isNotifierRoute, testId: "button-nav-notifier" },
  { label: "Biblioteca de Mídias", href: "/biblioteca-midias", icon: Upload, tooltip: "Áudios, imagens e vídeos do agente", isActive: isMediaLibraryRoute, testId: "button-nav-media-library" },
  { label: "Qualificação de Lead", href: "/qualificacao", icon: Brain, tooltip: "Análise por IA das conversas", isActive: isLeadQualificationRoute, testId: "button-nav-lead-qualification" },
  { label: "Envio em Massa", href: "/envio-em-massa", icon: Send, tooltip: "Envio em massa", isActive: isMassSendRoute, testId: "button-nav-masssend" },
  { label: "Listas de Contatos", href: "/listas-contatos", icon: BookUser, tooltip: "Gerenciar listas de contatos", isActive: isContactListsRoute, testId: "button-nav-contact-lists" },
  { label: "Campanhas", href: "/campanhas", icon: Megaphone, tooltip: "Campanhas", isActive: isCampaignsRoute, testId: "button-nav-campaigns" },
  { label: "Kanban", href: "/kanban", icon: Kanban, tooltip: "Kanban", isActive: isKanbanRoute, testId: "button-nav-kanban" },
    { label: "Contatos", href: "/contatos", icon: Users, tooltip: "Contatos", isActive: isContactsRoute, testId: "button-nav-contacts" },
    { label: "Contatos Sincronizados", href: "/contatos-sincronizados", icon: Smartphone, tooltip: "Contatos do WhatsApp", isActive: isSyncedContactsRoute, testId: "button-nav-synced-contacts" },
    { label: "Etiquetas", href: "/etiquetas", icon: Tags, tooltip: "Etiquetas", isActive: isTagsRoute, testId: "button-nav-tags" },
    { label: "Campos Personalizados", href: "/campos-personalizados", icon: FormInput, tooltip: "Campos personalizados de contatos", isActive: isCustomFieldsRoute, testId: "button-nav-custom-fields" },
    { label: "Catálogo de Produtos", href: "/produtos", icon: Package, tooltip: "Lista de produtos e preços", isActive: isProductsRoute, testId: "button-nav-products" },
    { label: "Funil", href: "/funil", icon: Filter, tooltip: "Funil de vendas", isActive: isFunnelRoute, testId: "button-nav-funnel" },
    { label: "Integrações", href: "/integracoes", icon: Plug, tooltip: "Integrações", isActive: isIntegrationsRoute, testId: "button-nav-integrations" },
    { label: "Reservas", href: "/reservas", icon: BedDouble, tooltip: "Reservas", isActive: isReservationsRoute, testId: "button-nav-reservations" },
  ];

  // Menu de Configurações separado do Ferramentas
  const configNavigation: ToolNavItem[] = [
    { label: "Configurações", href: "/settings", icon: Settings, tooltip: "Configurações da conta", isActive: isSettingsRoute, testId: "button-settings" },
    { label: "Membros", href: "/settings", icon: Users, tooltip: "Gerenciar equipe", isActive: false, testId: "button-nav-team" },
    { label: "Minha Assinatura", href: "/minha-assinatura", icon: Receipt, tooltip: "Ver minha assinatura e pagamentos", isActive: isMySubscriptionRoute, testId: "button-nav-my-subscription" },
    { label: "Planos", href: "/plans", icon: CreditCard, tooltip: "Ver planos disponíveis", isActive: isPlansRoute || isSubscribeRoute, testId: "button-nav-plans" },
  ];

  const filteredToolsNavigation = toolsNavigation.filter(item => {
    // Restrição temporária: Itens visíveis apenas para rodrigo4@gmail.com
    const restrictedToRodrigo = ["Contatos", "Integrações", "Qualificação de Lead"];
    if (restrictedToRodrigo.includes(item.label)) {
      if (user?.email !== "rodrigo4@gmail.com") return false;
    }

    if (!isMember) return true;
    
    // Regras de bloqueio explícito para membros
    const blockedForMembers = [
      "Minha Assinatura", 
      "Inteligência Artificial",
      "Lista de Exclusão",
      "Notificador Inteligente",
      "Qualificação de Lead",
      "Integrações",
      "Campos Personalizados",
      "Catálogo de Produtos",
      "Membros"
    ];
    if (blockedForMembers.includes(item.label)) return false;

    // Regras baseadas em permissão
    if (item.label === "Kanban") return permissions.canMoveKanban;
    if (item.label === "Listas de Contatos" || item.label === "Contatos") return permissions.canEditContacts;
    if (item.label === "Campanhas" || item.label === "Envio em Massa") return permissions.canSendMessages;
    
    // Por padrão permite ferramentas operacionais (Agendamentos, Reservas, etc)
    return true;
  });

  const filteredConfigNavigation = configNavigation.filter(item => {
    if (!isMember) return true;
    // Membros não acessam configurações de conta/planos
    return false;
  });

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Banner de Suspensão - Prioridade máxima */}
      {isSuspended && (
        <SuspensionBanner 
          suspensionReason={suspensionStatus?.reason}
          suspensionType={suspensionStatus?.type}
          refundedAt={suspensionStatus?.refundedAt}
          refundAmount={suspensionStatus?.refundAmount}
        />
      )}
      
      {/* Banner fixo no topo quando limite atingido (só mostra se não estiver suspenso) */}
      {!isSuspended && <LimitReachedTopBanner />}
      
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center justify-between px-2 py-2">
            {sidebarOpen && (
              <div className="flex items-center gap-2 text-sm font-semibold animate-in fade-in zoom-in-95 duration-200">
                {branding.logoUrl ? (
                  <img src={branding.logoUrl} alt={branding.companyName} className="w-5 h-5 object-contain" />
                ) : (
                  <Bot className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="truncate" style={branding.isWhiteLabel ? { color: branding.primaryColor } : undefined}>
                  {branding.companyName}
                </span>
              </div>
            )}
            <SidebarTrigger className={cn("h-7 w-7", !sidebarOpen && "mx-auto")} />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
            <SidebarMenu>
              {(!isMember || permissions.canViewDashboard) && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => goToSection("stats")}
                  isActive={isDashboardMode && selectedView === "stats"}
                  tooltip="Visão geral"
                  data-testid="button-nav-stats"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              )}
              {(!isMember || permissions.canViewConversations) && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => goToSection("conversations")}
                  isActive={isDashboardMode && selectedView === "conversations"}
                  tooltip="Conversas"
                  data-testid="button-nav-conversations"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Conversas</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              )}
              {/* Conexão: Membros podem ver para conectar WhatsApp (solicitado pelo usuário) */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => goToSection("connection")}
                  isActive={isDashboardMode && selectedView === "connection"}
                  tooltip="Conexão WhatsApp"
                  data-testid="button-nav-connection"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Conexão</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              
              {/* Meu Agente IA: Apenas dono pode configurar */}
              {!isMember && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => goToSection("agent")}
                  isActive={isDashboardMode && selectedView === "agent"}
                  tooltip="Meu Agente IA"
                  data-testid="button-nav-agent"
                >
                  <Bot className="w-4 h-4" />
                  <span>Meu Agente IA</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              )}

              {/* Central de Ajuda / Tutoriais */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isHelpCenterRoute}
                  tooltip="Central de Ajuda"
                  data-testid="button-nav-help-center"
                >
                  <Link href="/ajuda">
                    <BookUser className="w-4 h-4" />
                    <span>Central de Ajuda</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Menu de Revenda - visível apenas para revendedores (nunca para membros) */}
              {isReseller && !isMember && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    tooltip="Painel de Revenda"
                    data-testid="button-nav-reseller"
                  >
                    <Link href="/revenda">
                      <Building2 className="w-4 h-4" />
                      <span>Minha Revenda</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem className="mt-4 pt-3 border-t border-sidebar-border/50">
                <Collapsible open={toolsOpen} onOpenChange={setToolsOpen} className="group">
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      tooltip="Ferramentas"
                      isActive={isToolsRoute}
                      data-testid="button-nav-tools"
                      aria-expanded={toolsOpen}
                    >
                      <Wrench className="w-4 h-4" />
                      <span>Ferramentas</span>
                      <ChevronDown
                        className={cn(
                          "ml-auto h-3.5 w-3.5 transition-transform",
                          toolsOpen ? "rotate-180" : "rotate-0"
                        )}
                      />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1 pt-1">
                    {filteredToolsNavigation.map((item) => (
                      <div key={item.label} className="pl-4">
                        {item.subItems ? (
                          // Item com subitens (submenu)
                          <Collapsible defaultOpen={item.isActive} className="w-full">
                            <CollapsibleTrigger asChild>
                              <SidebarMenuButton
                                size="sm"
                                className="text-xs w-full"
                                tooltip={item.tooltip}
                                isActive={item.isActive}
                                data-testid={item.testId}
                              >
                                <span className="flex items-center gap-2 w-full">
                                  <item.icon className="w-3.5 h-3.5" />
                                  <span>{item.label}</span>
                                  <ChevronDown className="ml-auto h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
                                </span>
                              </SidebarMenuButton>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="space-y-0.5 pt-0.5 pl-4">
                              {item.subItems.map((subItem) => (
                                <SidebarMenuButton
                                  key={subItem.label}
                                  asChild
                                  size="sm"
                                  className="text-xs"
                                  tooltip={subItem.tooltip}
                                  isActive={subItem.isActive}
                                  data-testid={subItem.testId}
                                >
                                  <Link href={subItem.href!}>
                                    <span className="flex items-center gap-2">
                                      <subItem.icon className="w-3 h-3" />
                                      <span>{subItem.label}</span>
                                    </span>
                                  </Link>
                                </SidebarMenuButton>
                              ))}
                            </CollapsibleContent>
                          </Collapsible>
                        ) : item.href ? (
                          <SidebarMenuButton
                            asChild
                            size="sm"
                            className="text-xs"
                            tooltip={item.tooltip}
                            isActive={item.isActive}
                            data-testid={item.testId}
                          >
                            <Link href={item.href}>
                              <span className="flex items-center gap-2">
                                <item.icon className="w-3.5 h-3.5" />
                                <span>{item.label}</span>
                              </span>
                            </Link>
                          </SidebarMenuButton>
                        ) : (
                          <SidebarMenuButton
                            size="sm"
                            className="text-xs"
                            tooltip={item.tooltip}
                            isActive={item.isActive}
                            data-testid={item.testId}
                            onClick={item.action}
                          >
                            <span className="flex items-center gap-2">
                              <item.icon className="w-3.5 h-3.5" />
                              <span>{item.label}</span>
                            </span>
                          </SidebarMenuButton>
                        )}
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>

              {/* Menu de Configurações - separado de Ferramentas */}
              <SidebarMenuItem className="mt-2 pt-2 border-t border-sidebar-border/30">
                <Collapsible open={configOpen} onOpenChange={setConfigOpen} className="group">
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      tooltip="Configurações"
                      isActive={isConfigRoute}
                      data-testid="button-nav-config"
                      aria-expanded={configOpen}
                    >
                      <Settings className="w-4 h-4" />
                      <span>Configurações</span>
                      <ChevronDown
                        className={cn(
                          "ml-auto h-3.5 w-3.5 transition-transform",
                          configOpen ? "rotate-180" : "rotate-0"
                        )}
                      />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1 pt-1">
                    {filteredConfigNavigation.map((item) => (
                      <div key={item.label} className="pl-4">
                        <SidebarMenuButton
                          asChild
                          size="sm"
                          className="text-xs"
                          tooltip={item.tooltip}
                          isActive={item.isActive}
                          data-testid={item.testId}
                        >
                          <Link href={item.href!}>
                            <span className="flex items-center gap-2">
                              <item.icon className="w-3.5 h-3.5" />
                              <span>{item.label}</span>
                            </span>
                          </Link>
                        </SidebarMenuButton>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarSeparator />
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Sair" data-testid="button-logout" onClick={handleLogout}>
                <span className="flex items-center gap-2">
                  <LogOut className="w-4 h-4" />
                  <span>Sair</span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {/* Lógica dinâmica de botões baseada no plano ativo */}
            {(() => {
              // Use canonical entitlement (considers reseller + SaaS + expiration)
              const hasActiveSub = isEffectivelyPaid;
              const planTipo = subscription?.plan?.tipo;
              const planPeriodicidade = subscription?.plan?.periodicidade;
              const isMensal = hasActiveSub && (planTipo === 'padrao' || planTipo === 'mensal' || (!planTipo && planPeriodicidade === 'mensal'));
              const isAnual = hasActiveSub && planTipo === 'anual';
              const isImplementacao = hasActiveSub && planTipo === 'implementacao';

              // Se não tem plano ativo, mostra o botão principal
              if (!hasActiveSub) {
                // Usar 'valor' que é o campo correto da API (fallback para 'preco')
                const rawValue = (assignedPlanData as any)?.valor ?? (assignedPlanData as any)?.preco;
                const planValue = rawValue != null
                  ? `R$${Number(rawValue).toFixed(2).replace('.', ',')}` 
                  : 'R$99,99';
                const planName = assignedPlanData?.nome || 'Plano Ilimitado';
                
                return (
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      tooltip={`Assinar ${planName}`}
                      className="mt-2 bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:from-blue-700 hover:to-violet-700 hover:text-white transition-all duration-300 shadow-md"
                    >
                      <a href="https://agentezap.online/plans" rel="noopener noreferrer" className="flex items-center gap-2 font-bold justify-center">
                        <Rocket className="w-4 h-4 animate-pulse" />
                        <span>{planName} {planValue}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }
              
              // Tem plano mensal: mostrar upgrade anual + implementação
              if (isMensal) {
                return (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton 
                        asChild 
                        tooltip="Economize 5% com plano anual" 
                        className="mt-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 hover:text-white transition-all duration-300 shadow-md"
                      >
                        <a href="https://agentezap.online/plans" rel="noopener noreferrer" className="flex items-center gap-2 font-bold justify-center">
                          <Rocket className="w-4 h-4" />
                          <span>Upgrade → Anual</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton 
                        asChild 
                        tooltip="Configuração VIP completa" 
                        className="mt-1 bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 hover:text-white transition-all duration-300 shadow-md"
                      >
                        <a href="https://agentezap.online/plans" rel="noopener noreferrer" className="flex items-center gap-2 font-bold justify-center">
                          <Wrench className="w-4 h-4" />
                          <span>Implementação VIP</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
                );
              }
              
              // Tem plano anual: mostrar só implementação
              if (isAnual) {
                return (
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      tooltip="Configuração VIP completa" 
                      className="mt-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 hover:text-white transition-all duration-300 shadow-md"
                    >
                      <a href="https://agentezap.online/plans" rel="noopener noreferrer" className="flex items-center gap-2 font-bold justify-center">
                        <Wrench className="w-4 h-4" />
                        <span>Implementação VIP</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }
              
              // Tem implementação: mostrar upgrade anual (se fizer sentido)
              if (isImplementacao) {
                return (
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      tooltip="Garanta o preço por 12 meses" 
                      className="mt-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 hover:text-white transition-all duration-300 shadow-md"
                    >
                      <a href="https://agentezap.online/plans" rel="noopener noreferrer" className="flex items-center gap-2 font-bold justify-center">
                        <Rocket className="w-4 h-4" />
                        <span>Migrar p/ Anual</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }
              
              return null;
            })()}
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="h-screen overflow-hidden">
        {/* Mobile Header com logo e botão sair */}
        {!isConversasRoute && !(isDashboardMode && selectedView === "conversations") && (
          <div className="md:hidden sticky top-0 z-50 bg-background border-b border-border/60">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                {branding.logoUrl ? (
                  <img src={branding.logoUrl} alt={branding.companyName} className="w-6 h-6 object-contain" />
                ) : (
                  <Bot className="w-6 h-6 text-primary" />
                )}
                <span className="font-bold text-lg" style={branding.isWhiteLabel ? { color: branding.primaryColor } : undefined}>
                  {branding.companyName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleLogout}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="w-4 h-4 mr-1" />
                  Sair
                </Button>
              </div>
            </div>
            {/* Sticky CTA de upgrade - Ocultar na tela de criação de agente para priorizar o input */}
            {/* Use canonical entitlement: hide if user is effectively paid (SaaS or reseller) */}
            {!isEffectivelyPaid && !isMeuAgenteRoute && selectedView !== "agent" && (
              <UpgradeBanner />
            )}
          </div>
        )}
        <div
          className={cn(
            "flex overflow-hidden md:pb-0",
            // No /conversas o próprio chat controla header/input. Evita faixa branca no fim.
            (isConversasRoute || (isDashboardMode && selectedView === "conversations"))
              ? "h-[100dvh] pb-0"
              : "h-[calc(100dvh-3rem-env(safe-area-inset-top))] pb-[calc(4.5rem+env(safe-area-inset-bottom))]"
          )}
        >
          {isPlansRoute && (
            <div className="flex-1 overflow-auto">
              <PlansPage />
            </div>
          )}
          {isMassSendRoute && (
            <div className="flex-1 overflow-auto">
              <MassSendPage />
            </div>
          )}
          {isContactListsRoute && (
            <div className="flex-1 overflow-auto">
              <ContactListsPage />
            </div>
          )}
          {isCampaignsRoute && (
            <div className="flex-1 overflow-auto">
              <CampaignsPage />
            </div>
          )}
          {isKanbanRoute && (
            <div className="flex-1 overflow-auto">
              <KanbanPage />
            </div>
          )}
          {isContactsRoute && (
            <div className="flex-1 overflow-auto">
              <ContactsPage />
            </div>
          )}
          {isSyncedContactsRoute && (
            <div className="flex-1 overflow-auto">
              <SyncedContactsPage />
            </div>
          )}
          {isTagsRoute && (
            <div className="flex-1 overflow-auto">
              <TagsPage />
            </div>
          )}
          {isFunnelRoute && (
            <div className="flex-1 overflow-auto">
              <FunnelPage />
            </div>
          )}
          {isIntegrationsRoute && (
            <div className="flex-1 overflow-auto">
              <IntegrationsPage />
            </div>
          )}
          {isLeadQualificationRoute && (
            <div className="flex-1 overflow-auto">
              <LeadQualificationPage />
            </div>
          )}
          {isMediaLibraryRoute && (
            <div className="flex-1 overflow-auto p-6">
              <MediaLibraryPage />
            </div>
          )}
          {isSchedulingRoute && (
            <div className="flex-1 overflow-auto">
              <SchedulingPage />
            </div>
          )}
          {isReservationsRoute && (
            <div className="flex-1 overflow-auto">
              <ReservationsPage />
            </div>
          )}
          {isSettingsRoute && (
            <div className="flex-1 overflow-auto">
              <SettingsPage />
            </div>
          )}
          {isSubscribeRoute && (
            <div className="flex-1 overflow-auto">
              <SubscribePage />
            </div>
          )}
          {isNotifierRoute && (
            <div className="flex-1 overflow-auto">
              <SmartNotifierPage />
            </div>
          )}
          {isFollowupRoute && (
            <div className="flex-1 overflow-auto">
              <FollowupConfigPage />
            </div>
          )}
          {isPaymentHistoryRoute && (
            <div className="flex-1 overflow-auto">
              <PaymentHistoryPage />
            </div>
          )}
          {isMySubscriptionRoute && (
            <div className="flex-1 overflow-auto">
              <MySubscriptionPage />
            </div>
          )}
          {isExclusionListRoute && (
            <div className="flex-1 overflow-auto">
              <ExclusionListPage />
            </div>
          )}
          {isCustomFieldsRoute && (
            <div className="flex-1 overflow-auto">
              <CustomFieldsPage />
            </div>
          )}
          {isProductsRoute && (
            <div className="flex-1 overflow-auto">
              <ProductsPage />
            </div>
          )}
          {isDeliveryMenuRoute && (
            <div className="flex-1 overflow-auto">
              <DeliveryMenuPage />
            </div>
          )}
          {isDeliveryOrdersRoute && (
            <div className="flex-1 overflow-auto">
              <DeliveryOrdersPage />
            </div>
          )}
          {isDeliveryReportsRoute && (
            <div className="flex-1 overflow-auto">
              <DeliveryReportsPage />
            </div>
          )}
          {isSalonMenuRoute && (
            <div className="flex-1 overflow-auto">
              <SalonMenuPage />
            </div>
          )}
          {isSalonAppointmentsRoute && (
            <div className="flex-1 overflow-auto">
              <SalonAppointmentsPage />
            </div>
          )}
          {isAudioConfigRoute && (
            <div className="flex-1 overflow-auto">
              <AudioConfigPage />
            </div>
          )}
          {isFlowBuilderRoute && (
            <div className="flex-1 overflow-auto">
              <FlowBuilderPage />
            </div>
          )}
          {isToolsMenuRoute && (
            <div className="flex-1 overflow-auto">
              <ToolsMenuPage />
            </div>
          )}
          {isToolsSegmentRoute && (
            <div className="flex-1 overflow-auto">
              <ToolsSegmentPage />
            </div>
          )}
          
          {isTicketsNewRoute && (
            <div className="flex-1 overflow-auto">
              <TicketCreatePage />
            </div>
          )}
          
          {isTicketsDetailRoute && (
            <div className="flex-1 overflow-auto">
              <TicketDetailPage />
            </div>
          )}
          
          {isTicketsRoute && !isTicketsNewRoute && !isTicketsDetailRoute && (
            <div className="flex-1 overflow-auto">
              <TicketsPage />
            </div>
          )}

          {isHelpCenterRoute && (
            <div className="flex-1 overflow-auto">
              <HelpCenterPage />
            </div>
          )}

          {/* Dashboard Stats */}
          {isDashboardMode && selectedView === "stats" && (
            <div className="flex-1 overflow-auto">
              <DashboardStats connection={connection} />
            </div>
          )}

          {/* Connection Panel */}
          {(isConexaoRoute || (isDashboardMode && selectedView === "connection")) && (
            <div className="flex-1 overflow-auto">
              {autologinLoading && !isAuthenticated ? (
                <div className="h-full w-full flex items-center justify-center">
                  <div className="text-sm text-muted-foreground">Autenticando... Aguarde.</div>
                </div>
              ) : autologinError && !isAuthenticated ? (
                <div className="p-4">
                  <Card className="border-amber-200 bg-amber-50 text-amber-800">{autologinError}</Card>
                </div>
              ) : (
                isAuthenticated && <ConnectionPanel />
              )}
            </div>
          )}

          {/* My Agent */}
          {(isMeuAgenteRoute || (isDashboardMode && selectedView === "agent")) && (
            <div className="flex-1 overflow-auto">
              <MyAgent />
            </div>
          )}

          {/* Conversations */}
          {(isConversasRoute || (isDashboardMode && selectedView === "conversations")) && (
            <>
              {/* Lista de conversas - esconde no mobile quando uma conversa está selecionada */}
              <div className={`w-full md:w-80 border-r bg-card flex flex-col h-full overflow-hidden ${selectedConversationId ? 'hidden md:flex' : 'flex'}`}>
                <ConversationsList
                  connectionId={connection?.id}
                  selectedConversationId={selectedConversationId}
                  onSelectConversation={handleSelectConversation}
                />
              </div>
              {/* Área do chat - esconde no mobile quando nenhuma conversa está selecionada */}
              <div className={`flex-1 flex h-full overflow-hidden ${!selectedConversationId ? 'hidden md:flex' : 'flex'}`}>
                <div className="flex-1 flex flex-col overflow-hidden">
                {false && (
                  <div className="p-4 space-y-3">
                    {!agentConfig && (
                      <Card className="p-4 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" />
                          <div className="space-y-2">
                            <h3 className="font-semibold text-orange-900 dark:text-orange-100">Configure seu Agente IA</h3>
                            <p className="text-sm text-orange-800 dark:text-orange-200">Defina seu agente para automatizar respostas.</p>
                            <Button variant="outline" size="sm" onClick={() => goToSection("agent")} data-testid="onboarding-configure-agent">
                              <Bot className="w-4 h-4 mr-2" />
                              Configurar Agente
                            </Button>
                          </div>
                        </div>
                      </Card>
                    )}
                    {!connection?.isConnected && (
                      <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
                        <div className="flex items-start gap-3">
                          <Smartphone className="w-5 h-5 text-blue-600 mt-0.5" />
                          <div className="space-y-2">
                            <h3 className="font-semibold text-blue-900 dark:text-blue-100">Conecte seu WhatsApp</h3>
                            <p className="text-sm text-blue-800 dark:text-blue-200">Escaneie o QR Code para começar a conversar.</p>
                            <Button variant="outline" size="sm" onClick={() => goToSection("connection")} data-testid="onboarding-connect-whatsapp">
                              Conectar WhatsApp
                            </Button>
                          </div>
                        </div>
                      </Card>
                    )}
                  </div>
                )}
                <ChatArea 
                  conversationId={selectedConversationId} 
                  connectionId={connection?.id}
                  onBack={() => handleSelectConversation(null)}
                  onOpenContactPanel={() => setShowContactPanel(true)}
                />
                </div>
                {/* Painel de Detalhes do Contato - apenas desktop */}
                {showContactPanel && selectedConversation && (
                  <div className="hidden md:flex">
                    <ContactDetailsPanel
                      conversation={selectedConversation}
                      connectionId={connection?.id}
                      onClose={() => setShowContactPanel(false)}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        {/* Mobile bottom navigation */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
          <div className={`grid ${isMember ? 'grid-cols-5' : 'grid-cols-6'} text-[10px]`}>
            <button
              className={`flex flex-col items-center py-2.5 gap-0.5 ${isDashboardMode && selectedView === "stats" ? "text-primary font-medium" : "text-muted-foreground"}`}
              onClick={() => goToSection("stats")}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span>Início</span>
            </button>
            <button
              className={`flex flex-col items-center py-2.5 gap-0.5 ${isDashboardMode && selectedView === "conversations" || isConversasRoute ? "text-primary font-medium" : "text-muted-foreground"}`}
              onClick={() => goToSection("conversations")}
            >
              <MessageCircle className="w-5 h-5" />
              <span>Conversas</span>
            </button>
            <button
              className={`flex flex-col items-center py-2.5 gap-0.5 ${isDashboardMode && selectedView === "connection" || isConexaoRoute ? "text-primary font-medium" : "text-muted-foreground"}`}
              onClick={() => goToSection("connection")}
            >
              <Smartphone className="w-5 h-5" />
              <span>Conexão</span>
            </button>
            
            {!isMember && (
            <button
              className={`flex flex-col items-center py-2.5 gap-0.5 ${isDashboardMode && selectedView === "agent" || isMeuAgenteRoute ? "text-primary font-medium" : "text-muted-foreground"}`}
              onClick={() => goToSection("agent")}
            >
              <Bot className="w-5 h-5" />
              <span>Agente</span>
            </button>
            )}

            {/* Ajuda - Acesso rápido mobile */}
            <button
              className={`flex flex-col items-center py-2.5 gap-0.5 ${isHelpCenterRoute ? "text-primary font-medium" : "text-muted-foreground"}`}
              onClick={() => setLocation("/ajuda")}
            >
              <HelpCircle className="w-5 h-5" />
              <span>Ajuda</span>
            </button>

            <button
              className={`flex flex-col items-center py-2.5 gap-0.5 ${isToolsRoute ? "text-primary font-medium" : "text-muted-foreground"}`}
              onClick={() => setToolsPickerOpen(true)}
            >
              <Wrench className="w-5 h-5" />
              <span>Menu</span>
            </button>
          </div>
        </div>

        {/* Drawer de seleção de ferramentas (mobile) */}
        <Drawer open={toolsPickerOpen} onOpenChange={setToolsPickerOpen}>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <DrawerTitle className="text-left">Menu</DrawerTitle>
                  <DrawerDescription className="text-left">Todas as funcionalidades do AgenteZap</DrawerDescription>
                </div>
              </div>
            </DrawerHeader>
            
            {/* Aviso sobre configuração desktop */}
            <div className="px-4 pb-3">
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-xs text-blue-700 dark:text-blue-300 text-center">
                  💻 Para melhor experiência em configurações avançadas, use o computador
                </p>
              </div>
            </div>
            
            <div className="px-4 pb-4 overflow-y-auto max-h-[55vh]">
              <div className="space-y-2">
                {filteredToolsNavigation.map((item) => (
                  <div key={item.testId} className="rounded-xl border border-border/60 bg-card">
                    {item.subItems ? (
                      <Collapsible defaultOpen={item.isActive} className="w-full">
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            data-testid={item.testId}
                            className={cn(
                              "w-full px-3 py-3 flex items-center gap-3 text-left text-sm font-medium transition-colors",
                              item.isActive
                                ? "text-primary"
                                : "text-foreground hover:bg-accent"
                            )}
                          >
                            <span
                              className={cn(
                                "w-9 h-9 rounded-lg flex items-center justify-center",
                                item.isActive ? "bg-primary/10" : "bg-muted"
                              )}
                            >
                              <item.icon className="w-4 h-4" />
                            </span>
                            <span className="flex-1">
                              <span className="block">{item.label}</span>
                              <span className="block text-xs text-muted-foreground">Toque para ver opções</span>
                            </span>
                            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-3 pb-3">
                          <div className="space-y-1 pt-1">
                            {item.subItems.map((subItem) => (
                              <button
                                key={subItem.testId}
                                type="button"
                                data-testid={subItem.testId}
                                className={cn(
                                  "w-full rounded-lg px-3 py-2 flex items-center gap-2 text-sm transition-colors",
                                  subItem.isActive
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "text-foreground hover:bg-accent"
                                )}
                                onClick={() => {
                                  if (subItem.href) {
                                    setLocation(subItem.href);
                                  } else if (subItem.action) {
                                    subItem.action();
                                  }
                                  setToolsPickerOpen(false);
                                }}
                              >
                                <subItem.icon className="w-4 h-4" />
                                <span>{subItem.label}</span>
                              </button>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      <button
                        type="button"
                        data-testid={item.testId}
                        className={cn(
                          "w-full px-3 py-3 flex items-center gap-3 text-left text-sm font-medium transition-colors",
                          item.isActive
                            ? "text-primary"
                            : "text-foreground hover:bg-accent"
                        )}
                        onClick={() => {
                          if (item.href) {
                            setLocation(item.href);
                          } else if (item.action) {
                            item.action();
                          }
                          setToolsPickerOpen(false);
                        }}
                      >
                        <span
                          className={cn(
                            "w-9 h-9 rounded-lg flex items-center justify-center",
                            item.isActive ? "bg-primary/10" : "bg-muted"
                          )}
                        >
                          <item.icon className="w-4 h-4" />
                        </span>
                        <span>{item.label}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Footer com botão Fechar */}
            <div className="px-4 py-4 border-t border-border/60 bg-background">
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => setToolsPickerOpen(false)}
              >
                Fechar Menu
              </Button>
            </div>
            
            {/* Use canonical entitlement: hide if user is effectively paid (SaaS or reseller) */}
            {!isEffectivelyPaid && (
              <div className="p-4 pt-0">
                <UpgradeBanner />
              </div>
            )}
          </DrawerContent>
        </Drawer>
      </SidebarInset>
    </SidebarProvider>
    </>
  );
}





