import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useBranding } from "@/hooks/useBranding";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Settings, LogOut, Smartphone, Bot, CreditCard, LayoutDashboard, AlertCircle, Send, Kanban, Users, Tags, Filter, Plug, CalendarClock, BedDouble, Wrench, ChevronDown, Megaphone, Brain, Upload, BookUser, Bell, Rocket, Sparkles, Receipt, Ban, Building2 } from "lucide-react";
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
} from "@/components/ui/sidebar";
import { ConversationsList } from "@/components/conversations-list";
import { ChatArea } from "@/components/chat-area";
import { ConnectionPanel } from "@/components/connection-panel";
import { DashboardStats } from "@/components/dashboard-stats";
import { LimitReachedTopBanner } from "@/components/usage-limit-banner";
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
import { UpgradeBanner } from "@/components/upgrade-cta";
import { useLocation, useRoute } from "wouter";
import type { WhatsappConnection, AiAgentConfig, Subscription, Plan } from "@shared/schema";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const { branding } = useBranding(); // Get white-label branding
  const { data: subscription } = useQuery<Subscription & { plan: Plan } | null>({
    queryKey: ["/api/subscriptions/current"],
    enabled: !!isAuthenticated,
  });
  // Verificar se usuário é revendedor
  const { data: resellerStatus } = useQuery<{ hasResellerPlan: boolean }>({
    queryKey: ["/api/reseller/status"],
    enabled: !!isAuthenticated,
  });
  const isReseller = resellerStatus?.hasResellerPlan || false;
  const [selectedView, setSelectedView] = useState<"conversations" | "connection" | "stats" | "agent">("conversations");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [location, setLocation] = useLocation();
  
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
    !isExclusionListRoute;
  const isToolsRoute =
    isPlansRoute ||
    isSettingsRoute ||
    isSubscribeRoute ||
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
    isPaymentHistoryRoute ||
    isMySubscriptionRoute ||
    isExclusionListRoute;
  // Start tools collapsed by default; open only when user clicks or route requires it
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsPickerOpen, setToolsPickerOpen] = useState(false);

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
      setToolsOpen(true);
    }
  }, [isToolsRoute]);

  const handleLogout = async () => {
    try {
      // Limpa a sessÃ£o local do Supabase (token)
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Erro ao sair (supabase):", err);
    }

    try {
      // Limpa a sessÃ£o de servidor (se existir)
      await fetch("/api/logout", { credentials: "include" });
    } catch (err) {
      console.warn("Falha ao chamar /api/logout:", err);
    }

    try {
      // Limpa cache de consultas relacionadas a auth
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.clear();
    } catch {}

    // Redireciona para tela de login
    setLocation("/login");
  };

  useEffect(() => {
    // Aguardar pelo menos 2 segundos antes de redirecionar para login
    // Isso dá tempo para o token ser recuperado do localStorage
    if (!isLoading && !isAuthenticated) {
      const timer = setTimeout(() => {
        // Verificar novamente antes de redirecionar
        // (pode ter sido uma race condition)
        toast({
          title: "Não autorizado",
          description: "Você precisa fazer login. Redirecionando...",
          variant: "destructive",
        });
        setTimeout(() => {
          setLocation("/login");
        }, 500);
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, isLoading, toast, setLocation]);

  const { data: connection } = useQuery<WhatsappConnection>({
    queryKey: ["/api/whatsapp/connection"],
    enabled: isAuthenticated,
  });

  const { data: agentConfig } = useQuery<AiAgentConfig | null>({
    queryKey: ["/api/agent/config"],
  });

type ToolNavItem = {
  label: string;
  icon: LucideIcon;
  tooltip: string;
  isActive: boolean;
  testId: string;
  href?: string;
  action?: () => void;
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
  { label: "Follow-up Inteligente", href: "/followup", icon: Sparkles, tooltip: "Mensagens automáticas para recuperar conversas", isActive: isFollowupRoute, testId: "button-nav-followup" },
  { label: "Lista de Exclusão", href: "/lista-exclusao", icon: Ban, tooltip: "Números que a IA não deve responder", isActive: isExclusionListRoute, testId: "button-nav-exclusion-list" },
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
    { label: "Funil", href: "/funil", icon: Filter, tooltip: "Funil de vendas", isActive: isFunnelRoute, testId: "button-nav-funnel" },
    { label: "Integrações", href: "/integracoes", icon: Plug, tooltip: "Integrações", isActive: isIntegrationsRoute, testId: "button-nav-integrations" },
    { label: "Agendamentos", href: "/agendamentos", icon: CalendarClock, tooltip: "Agendamentos", isActive: isSchedulingRoute, testId: "button-nav-scheduling" },
    { label: "Reservas", href: "/reservas", icon: BedDouble, tooltip: "Reservas", isActive: isReservationsRoute, testId: "button-nav-reservations" },
    { label: "Planos", href: "/plans", icon: CreditCard, tooltip: "Planos e assinatura", isActive: isPlansRoute || isSubscribeRoute, testId: "button-nav-plans" },
    { label: "Minha Assinatura", href: "/minha-assinatura", icon: Receipt, tooltip: "Ver minha assinatura e pagamentos", isActive: isMySubscriptionRoute, testId: "button-nav-my-subscription" },
    { label: "Configurações", href: "/settings", icon: Settings, tooltip: "Configurações", isActive: isSettingsRoute, testId: "button-settings" },
  ];

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
      {/* Banner fixo no topo quando limite atingido */}
      <LimitReachedTopBanner />
      
      <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="px-2 py-1.5 text-sm font-semibold flex items-center gap-2">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.companyName} className="w-5 h-5 object-contain" />
            ) : (
              <Bot className="w-4 h-4 text-muted-foreground" />
            )}
            <span style={branding.isWhiteLabel ? { color: branding.primaryColor } : undefined}>
              {branding.companyName}
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => goToSection("stats")}
                  isActive={isDashboardMode && selectedView === "stats"}
                  tooltip="VisÃ£o geral"
                  data-testid="button-nav-stats"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
              {/* Menu de Revenda - visível apenas para revendedores */}
              {isReseller && (
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
                    {toolsNavigation.map((item) => (
                      <div key={item.label} className="pl-4">
                        {item.href ? (
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
              const hasActiveSub = subscription?.status === 'active';
              const planTipo = subscription?.plan?.tipo;
              const planPeriodicidade = subscription?.plan?.periodicidade;
              const isMensal = hasActiveSub && (planTipo === 'padrao' || planTipo === 'mensal' || (!planTipo && planPeriodicidade === 'mensal'));
              const isAnual = hasActiveSub && planTipo === 'anual';
              const isImplementacao = hasActiveSub && planTipo === 'implementacao';
              
              // Se não tem plano ativo, mostra o botão principal
              if (!hasActiveSub) {
                return (
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      tooltip="Assinar Plano Ilimitado" 
                      className="mt-2 bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:from-blue-700 hover:to-violet-700 hover:text-white transition-all duration-300 shadow-md"
                    >
                      <a href="https://agentezap.online/plans" rel="noopener noreferrer" className="flex items-center gap-2 font-bold justify-center">
                        <Rocket className="w-4 h-4 animate-pulse" />
                        <span>Plano Ilimitado R$99</span>
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
            {!subscription?.plan && !isMeuAgenteRoute && selectedView !== "agent" && (
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
          
          {/* Dashboard Stats */}
          {isDashboardMode && selectedView === "stats" && (
            <div className="flex-1 overflow-auto">
              <DashboardStats connection={connection} />
            </div>
          )}

          {/* Connection Panel */}
          {(isConexaoRoute || (isDashboardMode && selectedView === "connection")) && (
            <div className="flex-1 overflow-auto">
              <ConnectionPanel />
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
              <div className={`flex-1 flex flex-col h-full overflow-hidden ${!selectedConversationId ? 'hidden md:flex' : 'flex'}`}>
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
                />
              </div>
            </>
          )}
        </div>
        {/* Mobile bottom navigation */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-5 text-[10px]">
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
            <button
              className={`flex flex-col items-center py-2.5 gap-0.5 ${isDashboardMode && selectedView === "agent" || isMeuAgenteRoute ? "text-primary font-medium" : "text-muted-foreground"}`}
              onClick={() => goToSection("agent")}
            >
              <Bot className="w-5 h-5" />
              <span>Agente</span>
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
              <div className="grid grid-cols-3 gap-2.5">
                {toolsNavigation.map((item) => (
                  <button
                    key={item.testId}
                    className={cn(
                      "border rounded-xl p-3 flex flex-col items-center gap-1.5 text-[10px] leading-tight transition-all active:scale-95",
                      item.isActive 
                        ? "border-primary bg-primary/5 text-primary font-medium" 
                        : "border-border bg-card text-foreground hover:bg-accent"
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
                    <div className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center",
                      item.isActive ? "bg-primary/10" : "bg-muted"
                    )}>
                      <item.icon className="w-4 h-4" />
                    </div>
                    <span className="text-center">{item.label}</span>
                  </button>
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
            
            {(!subscription || subscription.status !== 'active') && (
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





