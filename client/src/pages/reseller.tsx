/**
 * Reseller Dashboard - Painel do Revendedor White-Label
 * 
 * Esta página é acessada por usuários que possuem o plano de revenda.
 * Funcionalidades:
 * - Configuração de branding (logo, cores, domínio)
 * - Criação e gerenciamento de clientes
 * - Métricas e faturamento
 * - Histórico de pagamentos
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { 
  Loader2, 
  Plus, 
  Users, 
  DollarSign, 
  Building2, 
  Settings, 
  Palette, 
  Globe, 
  RefreshCw, 
  Check, 
  X, 
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  Pause,
  Play,
  Trash2,
  CreditCard,
  TrendingUp,
  AlertCircle
} from "lucide-react";

interface ResellerProfile {
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
}

interface ResellerClient {
  id: string;
  userId: string;
  status: string;
  monthlyCost?: string;
  activatedAt?: string;
  suspendedAt?: string;
  cancelledAt?: string;
  createdAt?: string;
  user?: {
    name: string;
    email: string;
    phone?: string;
  };
}

interface DashboardMetrics {
  totalClients: number;
  activeClients: number;
  suspendedClients: number;
  cancelledClients: number;
  totalRevenue: number;
  monthlyRevenue: number;
  monthlyCost: number;
  monthlyProfit: number;
}

interface Payment {
  id: string;
  amount: string;
  status: string;
  paymentType: string;
  description?: string;
  createdAt: string;
  paidAt?: string;
}

export default function ResellerDashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("dashboard");
  
  // Estados para o formulário de perfil
  const [companyName, setCompanyName] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#000000");
  const [secondaryColor, setSecondaryColor] = useState("#ffffff");
  const [accentColor, setAccentColor] = useState("#22c55e");
  const [clientMonthlyPrice, setClientMonthlyPrice] = useState("99.99");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  
  // Estados para criar cliente
  const [isCreateClientOpen, setIsCreateClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientPassword, setNewClientPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newClientPrice, setNewClientPrice] = useState("99.99");
  const [createAsFree, setCreateAsFree] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "credit_card">("pix");
  
  // Estados para checkout
  const [checkoutStep, setCheckoutStep] = useState<"form" | "payment" | "success">("form");
  const [pixCode, setPixCode] = useState("");
  const [pixQrCode, setPixQrCode] = useState("");
  const [pendingPaymentId, setPendingPaymentId] = useState("");
  const [checkingPayment, setCheckingPayment] = useState(false);

  // Verificar status de revendedor
  const { data: resellerStatus, isLoading: isLoadingStatus } = useQuery<{
    hasResellerPlan: boolean;
    reseller: ResellerProfile | null;
  }>({
    queryKey: ["/api/reseller/status"],
  });

  // Buscar perfil do revendedor
  const { data: profile, isLoading: isLoadingProfile, refetch: refetchProfile } = useQuery<ResellerProfile>({
    queryKey: ["/api/reseller/profile"],
    enabled: !!resellerStatus?.hasResellerPlan,
  });

  // Verificar se tem slot de cliente gratuito disponível
  const { data: freeClientData, refetch: refetchFreeClient } = useQuery<{
    available: boolean;
    used: number;
    limit: number;
  }>({
    queryKey: ["/api/reseller/free-client-available"],
    enabled: !!resellerStatus?.hasResellerPlan,
  });

  // Buscar clientes
  const { data: clients, isLoading: isLoadingClients, refetch: refetchClients } = useQuery<ResellerClient[]>({
    queryKey: ["/api/reseller/clients"],
    enabled: !!resellerStatus?.hasResellerPlan,
  });

  // Buscar métricas
  const { data: metrics, isLoading: isLoadingMetrics } = useQuery<DashboardMetrics>({
    queryKey: ["/api/reseller/dashboard"],
    enabled: !!resellerStatus?.hasResellerPlan,
  });

  // Buscar histórico de pagamentos
  const { data: payments, isLoading: isLoadingPayments } = useQuery<Payment[]>({
    queryKey: ["/api/reseller/payments"],
    enabled: !!resellerStatus?.hasResellerPlan,
  });

  // Atualizar formulário quando perfil carrega
  useEffect(() => {
    if (profile) {
      setCompanyName(profile.companyName || "");
      setCompanyDescription(profile.companyDescription || "");
      setSubdomain(profile.subdomain || "");
      setPrimaryColor(profile.primaryColor || "#000000");
      setSecondaryColor(profile.secondaryColor || "#ffffff");
      setAccentColor(profile.accentColor || "#22c55e");
      setClientMonthlyPrice(profile.clientMonthlyPrice || "99.99");
      setSupportEmail(profile.supportEmail || "");
      setSupportPhone(profile.supportPhone || "");
      setWelcomeMessage(profile.welcomeMessage || "");
    }
  }, [profile]);

  // Mutation para salvar/criar perfil
  const saveProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      const method = profile ? "PUT" : "POST";
      const response = await apiRequest(method, "/api/reseller/profile", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/profile"] });
      toast({ title: "Perfil salvo com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao salvar perfil", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para criar cliente gratuito
  const createFreeClientMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/reseller/clients/free", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/free-client-available"] });
      setCheckoutStep("success");
      toast({ title: "Cliente gratuito criado com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar cliente", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para checkout (PIX ou Cartão)
  const checkoutMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/reseller/clients/checkout", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.pixCode && data.pixQrCode) {
        // Pagamento PIX
        setPixCode(data.pixCode);
        setPixQrCode(data.pixQrCode);
        setPendingPaymentId(data.paymentId);
        setCheckoutStep("payment");
      } else if (data.paymentUrl) {
        // Pagamento Cartão - redireciona para checkout
        window.open(data.paymentUrl, '_blank');
        setCheckoutStep("payment");
        setPendingPaymentId(data.paymentId);
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro no checkout", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para confirmar pagamento PIX
  const confirmPixMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const response = await apiRequest("POST", `/api/reseller/payments/${paymentId}/confirm`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reseller/dashboard"] });
        setCheckoutStep("success");
        toast({ title: "Pagamento confirmado! Cliente criado com sucesso." });
      } else {
        toast({ title: "Pagamento pendente", description: "Aguardando confirmação do pagamento." });
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro ao verificar pagamento", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para criar cliente (legado - para compatibilidade)
  const createClientMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/reseller/clients", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/dashboard"] });
      setIsCreateClientOpen(false);
      resetCreateClientForm();
      
      if (data.paymentUrl) {
        toast({ 
          title: "Cliente criado!", 
          description: "Você será redirecionado para o pagamento." 
        });
        setTimeout(() => {
          window.open(data.paymentUrl, '_blank');
        }, 1000);
      } else {
        toast({ title: "Cliente criado com sucesso!" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar cliente", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para suspender cliente
  const suspendClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const response = await apiRequest("POST", `/api/reseller/clients/${clientId}/suspend`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/dashboard"] });
      toast({ title: "Cliente suspenso" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao suspender", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para reativar cliente
  const reactivateClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const response = await apiRequest("POST", `/api/reseller/clients/${clientId}/reactivate`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/dashboard"] });
      toast({ title: "Cliente reativado" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao reativar", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para cancelar cliente
  const cancelClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const response = await apiRequest("POST", `/api/reseller/clients/${clientId}/cancel`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/dashboard"] });
      toast({ title: "Cliente cancelado" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao cancelar", description: error.message, variant: "destructive" });
    },
  });

  const resetCreateClientForm = () => {
    setNewClientName("");
    setNewClientEmail("");
    setNewClientPhone("");
    setNewClientPassword("");
    setNewClientPrice("99.99");
    setCreateAsFree(false);
    setPaymentMethod("pix");
    setCheckoutStep("form");
    setPixCode("");
    setPixQrCode("");
    setPendingPaymentId("");
  };

  const handleSaveProfile = () => {
    if (!companyName.trim()) {
      toast({ title: "Nome da empresa é obrigatório", variant: "destructive" });
      return;
    }

    saveProfileMutation.mutate({
      companyName,
      companyDescription,
      subdomain: subdomain || undefined,
      primaryColor,
      secondaryColor,
      accentColor,
      clientMonthlyPrice,
      supportEmail: supportEmail || undefined,
      supportPhone: supportPhone || undefined,
      welcomeMessage: welcomeMessage || undefined,
    });
  };

  const handleCreateClient = () => {
    if (!newClientName.trim() || !newClientEmail.trim() || !newClientPassword.trim()) {
      toast({ title: "Nome, email e senha são obrigatórios", variant: "destructive" });
      return;
    }

    if (!newClientPrice || parseFloat(newClientPrice) <= 0) {
      toast({ title: "Informe o valor mensal que você cobrará do cliente", variant: "destructive" });
      return;
    }

    if (createAsFree && freeClientData?.available) {
      // Criar cliente gratuito
      createFreeClientMutation.mutate({
        name: newClientName,
        email: newClientEmail,
        phone: newClientPhone,
        password: newClientPassword,
        clientPrice: newClientPrice,
      });
    } else {
      // Iniciar checkout pago
      checkoutMutation.mutate({
        name: newClientName,
        email: newClientEmail,
        phone: newClientPhone,
        password: newClientPassword,
        clientPrice: newClientPrice,
        paymentMethod,
      });
    }
  };

  const handleCheckPayment = async () => {
    if (!pendingPaymentId) return;
    setCheckingPayment(true);
    try {
      await confirmPixMutation.mutateAsync(pendingPaymentId);
    } finally {
      setCheckingPayment(false);
    }
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewClientPassword(password);
    setShowPassword(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!" });
  };

  // Se está carregando status
  if (isLoadingStatus) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Se não tem plano de revenda
  if (!resellerStatus?.hasResellerPlan) {
    return (
      <div className="container max-w-2xl py-16 text-center">
        <AlertCircle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-4">Acesso Restrito</h1>
        <p className="text-muted-foreground mb-8">
          Você não possui um plano de revenda ativo. 
          Para se tornar um revendedor white-label, entre em contato com o suporte.
        </p>
        <div className="space-y-4">
          <Button onClick={() => setLocation("/dashboard")}>
            Voltar ao Dashboard
          </Button>
          <p className="text-sm text-muted-foreground">
            O plano de revenda custa R$700/mês e permite criar clientes com sua própria marca.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-8 w-8" />
            Painel do Revendedor
          </h1>
          <p className="text-muted-foreground">
            Gerencie sua marca e clientes white-label
          </p>
        </div>
        {profile?.subdomain && (
          <Button variant="outline" onClick={() => window.open(`https://${profile.subdomain}.agentezap.com`, '_blank')}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Ver Meu Site
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="clients" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Clientes
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Pagamentos
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
          {/* Métricas */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Clientes</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics?.totalClients || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Clientes Ativos</CardTitle>
                <Check className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{metrics?.activeClients || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Receita Mensal</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">R$ {metrics?.monthlyRevenue?.toFixed(2) || '0.00'}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Lucro Mensal</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  R$ {metrics?.monthlyProfit?.toFixed(2) || '0.00'}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Resumo Rápido */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Sua Marca</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  {profile?.logoUrl ? (
                    <img src={profile.logoUrl} alt="Logo" className="h-16 w-16 rounded object-contain bg-muted" />
                  ) : (
                    <div className="h-16 w-16 rounded bg-muted flex items-center justify-center">
                      <Building2 className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-lg">{profile?.companyName || 'Não configurado'}</p>
                    {profile?.subdomain && (
                      <p className="text-sm text-muted-foreground">
                        {profile.subdomain}.agentezap.com
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <div 
                    className="w-8 h-8 rounded border" 
                    style={{ backgroundColor: profile?.primaryColor || '#000000' }}
                    title="Cor Primária"
                  />
                  <div 
                    className="w-8 h-8 rounded border" 
                    style={{ backgroundColor: profile?.secondaryColor || '#ffffff' }}
                    title="Cor Secundária"
                  />
                  <div 
                    className="w-8 h-8 rounded border" 
                    style={{ backgroundColor: profile?.accentColor || '#22c55e' }}
                    title="Cor de Destaque"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Preços</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Seu custo por cliente:</span>
                  <span className="font-medium">R$ {profile?.costPerClient || '49.99'}/mês</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Seu preço de venda:</span>
                  <span className="font-medium">R$ {profile?.clientMonthlyPrice || '99.99'}/mês</span>
                </div>
                <div className="flex justify-between items-center border-t pt-2">
                  <span className="text-muted-foreground">Lucro por cliente:</span>
                  <span className="font-medium text-green-600">
                    R$ {(Number(profile?.clientMonthlyPrice || 99.99) - Number(profile?.costPerClient || 49.99)).toFixed(2)}/mês
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Clients Tab */}
        <TabsContent value="clients" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Seus Clientes</h2>
              <p className="text-sm text-muted-foreground">
                Gerencie os clientes que usam sua marca
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetchClients()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
              <Dialog open={isCreateClientOpen} onOpenChange={(open) => {
                setIsCreateClientOpen(open);
                if (!open) resetCreateClientForm();
              }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Cliente
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  {checkoutStep === "form" && (
                    <>
                      <DialogHeader>
                        <DialogTitle>Criar Novo Cliente</DialogTitle>
                        <DialogDescription>
                          {freeClientData?.available ? (
                            <span className="text-green-600 font-medium">
                              🎁 Você tem 1 cliente gratuito disponível para demonstração!
                            </span>
                          ) : (
                            <>Taxa de R$ 49,99 para criar cliente</>
                          )}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        {/* Dados do cliente */}
                        <div className="space-y-2">
                          <Label>Nome Completo *</Label>
                          <Input
                            value={newClientName}
                            onChange={(e) => setNewClientName(e.target.value)}
                            placeholder="Nome do cliente"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Email *</Label>
                          <Input
                            type="email"
                            value={newClientEmail}
                            onChange={(e) => setNewClientEmail(e.target.value)}
                            placeholder="email@exemplo.com"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Telefone</Label>
                          <Input
                            value={newClientPhone}
                            onChange={(e) => setNewClientPhone(e.target.value)}
                            placeholder="(11) 99999-9999"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Senha Inicial *</Label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Input
                                type={showPassword ? "text" : "password"}
                                value={newClientPassword}
                                onChange={(e) => setNewClientPassword(e.target.value)}
                                placeholder="Senha do cliente"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                            <Button variant="outline" onClick={generatePassword}>
                              Gerar
                            </Button>
                          </div>
                          {newClientPassword && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs"
                              onClick={() => copyToClipboard(newClientPassword)}
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Copiar senha
                            </Button>
                          )}
                        </div>

                        {/* Preço mensal que o revendedor vai cobrar */}
                        <div className="space-y-2 border-t pt-4">
                          <Label>Valor Mensal que Você Cobrará do Cliente *</Label>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">R$</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={newClientPrice}
                              onChange={(e) => setNewClientPrice(e.target.value)}
                              placeholder="99.99"
                              className="w-32"
                            />
                            <span className="text-sm text-muted-foreground">/mês</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Este valor será mostrado para o cliente na página de planos.
                          </p>
                        </div>

                        {/* Opção de cliente gratuito */}
                        {freeClientData?.available && (
                          <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-green-700 dark:text-green-300">Criar como Cliente Gratuito</Label>
                                <p className="text-xs text-green-600 dark:text-green-400">
                                  Use seu cliente demo gratuito ({freeClientData.used}/{freeClientData.limit} usado)
                                </p>
                              </div>
                              <Switch
                                checked={createAsFree}
                                onCheckedChange={setCreateAsFree}
                              />
                            </div>
                          </div>
                        )}

                        {/* Método de pagamento (se não for gratuito) */}
                        {!createAsFree && (
                          <div className="space-y-2 border-t pt-4">
                            <Label>Forma de Pagamento</Label>
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                type="button"
                                variant={paymentMethod === "pix" ? "default" : "outline"}
                                className="w-full"
                                onClick={() => setPaymentMethod("pix")}
                              >
                                <DollarSign className="h-4 w-4 mr-2" />
                                PIX
                              </Button>
                              <Button
                                type="button"
                                variant={paymentMethod === "credit_card" ? "default" : "outline"}
                                className="w-full"
                                onClick={() => setPaymentMethod("credit_card")}
                              >
                                <CreditCard className="h-4 w-4 mr-2" />
                                Cartão
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateClientOpen(false)}>
                          Cancelar
                        </Button>
                        <Button 
                          onClick={handleCreateClient}
                          disabled={createFreeClientMutation.isPending || checkoutMutation.isPending}
                        >
                          {(createFreeClientMutation.isPending || checkoutMutation.isPending) && (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          )}
                          {createAsFree ? "Criar Cliente Gratuito" : `Pagar R$ 49,99 via ${paymentMethod === "pix" ? "PIX" : "Cartão"}`}
                        </Button>
                      </DialogFooter>
                    </>
                  )}

                  {checkoutStep === "payment" && (
                    <>
                      <DialogHeader>
                        <DialogTitle>Pagamento PIX</DialogTitle>
                        <DialogDescription>
                          Escaneie o QR Code ou copie o código PIX para pagar
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        {pixQrCode && (
                          <div className="flex justify-center">
                            <img 
                              src={`data:image/png;base64,${pixQrCode}`} 
                              alt="QR Code PIX" 
                              className="w-48 h-48 border rounded-lg"
                            />
                          </div>
                        )}
                        {pixCode && (
                          <div className="space-y-2">
                            <Label>Código PIX Copia e Cola</Label>
                            <div className="flex gap-2">
                              <Input 
                                value={pixCode} 
                                readOnly 
                                className="font-mono text-xs"
                              />
                              <Button variant="outline" onClick={() => copyToClipboard(pixCode)}>
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                        <div className="text-center text-sm text-muted-foreground">
                          <p>Após o pagamento, clique em "Verificar Pagamento"</p>
                          <p className="text-xs">O pagamento é confirmado automaticamente em até 1 minuto</p>
                        </div>
                      </div>
                      <DialogFooter className="flex-col sm:flex-row gap-2">
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setCheckoutStep("form");
                            setPixCode("");
                            setPixQrCode("");
                          }}
                        >
                          Voltar
                        </Button>
                        <Button 
                          onClick={handleCheckPayment}
                          disabled={checkingPayment || confirmPixMutation.isPending}
                        >
                          {(checkingPayment || confirmPixMutation.isPending) && (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          )}
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Verificar Pagamento
                        </Button>
                      </DialogFooter>
                    </>
                  )}

                  {checkoutStep === "success" && (
                    <>
                      <DialogHeader>
                        <DialogTitle className="text-green-600">✅ Cliente Criado com Sucesso!</DialogTitle>
                        <DialogDescription>
                          O cliente foi criado e já pode acessar o sistema.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
                          <p className="font-medium">{newClientName}</p>
                          <p className="text-sm text-muted-foreground">{newClientEmail}</p>
                          {newClientPassword && (
                            <div className="mt-2 pt-2 border-t">
                              <p className="text-sm">Senha: <code className="bg-muted px-2 py-1 rounded">{newClientPassword}</code></p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs mt-1"
                                onClick={() => copyToClipboard(`Email: ${newClientEmail}\nSenha: ${newClientPassword}`)}
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                Copiar credenciais
                              </Button>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground text-center">
                          Envie as credenciais acima para seu cliente
                        </p>
                      </div>
                      <DialogFooter>
                        <Button onClick={() => {
                          setIsCreateClientOpen(false);
                          resetCreateClientForm();
                          refetchClients();
                        }}>
                          Fechar
                        </Button>
                      </DialogFooter>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {isLoadingClients ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : clients?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Nenhum cliente ainda</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Clique em "Novo Cliente" para criar seu primeiro cliente
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Desde</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients?.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">{client.user?.name || '-'}</TableCell>
                      <TableCell>{client.user?.email || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={
                          client.status === 'active' ? 'default' :
                          client.status === 'suspended' ? 'secondary' :
                          client.status === 'pending' ? 'outline' :
                          'destructive'
                        }>
                          {client.status === 'active' ? 'Ativo' :
                           client.status === 'suspended' ? 'Suspenso' :
                           client.status === 'pending' ? 'Pendente' :
                           'Cancelado'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {client.activatedAt ? new Date(client.activatedAt).toLocaleDateString('pt-BR') : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {client.status === 'active' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => suspendClientMutation.mutate(client.id)}
                              disabled={suspendClientMutation.isPending}
                            >
                              <Pause className="h-4 w-4" />
                            </Button>
                          )}
                          {client.status === 'suspended' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => reactivateClientMutation.mutate(client.id)}
                              disabled={reactivateClientMutation.isPending}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          {client.status !== 'cancelled' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (confirm('Tem certeza que deseja cancelar este cliente?')) {
                                  cancelClientMutation.mutate(client.id);
                                }
                              }}
                              disabled={cancelClientMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* Branding Tab */}
        <TabsContent value="branding" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Informações da Empresa */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Informações da Empresa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome da Empresa *</Label>
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Sua Empresa LTDA"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={companyDescription}
                    onChange={(e) => setCompanyDescription(e.target.value)}
                    placeholder="Breve descrição da sua empresa"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email de Suporte</Label>
                  <Input
                    type="email"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    placeholder="suporte@suaempresa.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone de Suporte</Label>
                  <Input
                    value={supportPhone}
                    onChange={(e) => setSupportPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Cores e Visual */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Cores da Marca
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Cor Primária</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-16 h-10 p-1"
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      placeholder="#000000"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cor Secundária</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="w-16 h-10 p-1"
                    />
                    <Input
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      placeholder="#ffffff"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cor de Destaque</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-16 h-10 p-1"
                    />
                    <Input
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      placeholder="#22c55e"
                    />
                  </div>
                </div>

                {/* Preview das cores */}
                <div className="mt-4 p-4 rounded-lg border">
                  <p className="text-sm text-muted-foreground mb-2">Preview:</p>
                  <div 
                    className="p-4 rounded-lg"
                    style={{ backgroundColor: secondaryColor, color: primaryColor }}
                  >
                    <p className="font-bold">{companyName || 'Nome da Empresa'}</p>
                    <button 
                      className="mt-2 px-4 py-2 rounded"
                      style={{ backgroundColor: accentColor, color: secondaryColor }}
                    >
                      Botão de Exemplo
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Domínio */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Domínio
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Subdomínio</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={subdomain}
                      onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="suaempresa"
                      className="flex-1"
                    />
                    <span className="text-muted-foreground">.agentezap.com</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Apenas letras minúsculas, números e hífen
                  </p>
                </div>
                {profile?.customDomain && (
                  <div className="space-y-2">
                    <Label>Domínio Customizado</Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-muted px-3 py-2 rounded text-sm">
                        {profile.customDomain}
                      </code>
                      <Badge variant={profile.domainVerified ? "default" : "secondary"}>
                        {profile.domainVerified ? "Verificado" : "Pendente"}
                      </Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Configurações de Preço */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Preço para Clientes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Mensalidade (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="49.99"
                    value={clientMonthlyPrice}
                    onChange={(e) => setClientMonthlyPrice(e.target.value)}
                    placeholder="99.99"
                  />
                  <p className="text-xs text-muted-foreground">
                    Valor mínimo: R$ 49,99 (seu custo por cliente)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Mensagem de Boas-Vindas</Label>
                  <Textarea
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    placeholder="Mensagem exibida para novos clientes ao fazer login"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Botão Salvar */}
          <div className="flex justify-end">
            <Button 
              onClick={handleSaveProfile}
              disabled={saveProfileMutation.isPending}
              size="lg"
            >
              {saveProfileMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Configurações
            </Button>
          </div>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Histórico de Pagamentos</h2>
              <p className="text-sm text-muted-foreground">
                Cobranças por criação de clientes
              </p>
            </div>
          </div>

          {isLoadingPayments ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : payments?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CreditCard className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Nenhum pagamento registrado</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments?.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        {new Date(payment.createdAt).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>{payment.description || 'Criação de cliente'}</TableCell>
                      <TableCell className="font-medium">R$ {payment.amount}</TableCell>
                      <TableCell>
                        <Badge variant={
                          payment.status === 'approved' ? 'default' :
                          payment.status === 'pending' ? 'outline' :
                          'destructive'
                        }>
                          {payment.status === 'approved' ? 'Pago' :
                           payment.status === 'pending' ? 'Pendente' :
                           'Rejeitado'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
