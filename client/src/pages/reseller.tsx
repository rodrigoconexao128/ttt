/**
 * Reseller Dashboard - Painel do Revendedor White-Label
 * 
 * Esta página é acessada por usuários que possuem o plano de revenda.
 * Funcionalidades:
 * - Dashboard com métricas
 * - Criação e gerenciamento de clientes
 * - Detalhes completos do cliente (pagamentos, status, conexão)
 * - Reset de senha de clientes
 * - Marcar pagamentos como pagos manualmente
 * - Histórico de pagamentos
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect, useRef } from "react";
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
  AlertCircle,
  Wifi,
  WifiOff,
  Key,
  FileText,
  Phone,
  Mail,
  Calendar,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  ArrowLeft
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
  // Campos PIX
  pixKey?: string;
  pixKeyType?: string; // cpf, cnpj, email, phone, random
  // Ciclo de cobrança
  billingDay?: number;
  nextPaymentDate?: string;
  resellerStatus?: string;
}

interface ResellerClient {
  id: string;
  userId: string;
  status: string;
  monthlyCost?: string;
  clientPrice?: string;
  isFreeClient?: boolean;
  activatedAt?: string;
  suspendedAt?: string;
  cancelledAt?: string;
  createdAt?: string;
  nextPaymentDate?: string;
  billingDay?: number;
  user?: {
    name: string;
    email: string;
    phone?: string;
  };
}

interface ClientDetails {
  client: {
    id: string;
    status: string;
    monthlyCost: string;
    clientPrice: string;
    isFreeClient: boolean;
    activatedAt?: string;
    suspendedAt?: string;
    cancelledAt?: string;
    nextPaymentDate?: string;
    createdAt: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    createdAt: string;
    onboardingCompleted: boolean;
  } | null;
  connection: {
    id: string;
    isConnected: boolean;
    phoneNumber?: string;
    updatedAt: string;
  } | null;
  subscription: {
    id: string;
    status: string;
    dataInicio?: string;
    dataFim?: string;
  } | null;
  payments: Payment[];
  stats: {
    totalConversations: number;
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
  paymentMethod?: string;
  description?: string;
  referenceMonth?: string;
  dueDate?: string;
  createdAt: string;
  paidAt?: string;
}

// Interface para fatura pendente
interface PendingInvoice {
  referenceMonth: string;
  dueDate: Date;
  amount: number;
  status: 'pending' | 'overdue' | 'upcoming';
  daysUntilDue: number;
}

// Interface para assinatura do revendedor (o que ele paga ao sistema)
interface ResellerSubscription {
  activeClients: number;
  costPerClient: number;
  totalMonthly: number;
  billingDay: number;
  currentInvoice: {
    id: number;
    referenceMonth: string;
    dueDate: string;
    activeClients: number;
    unitPrice: string;
    totalAmount: string;
    status: string;
  } | null;
  pendingInvoices: {
    id: number;
    referenceMonth: string;
    dueDate: string;
    activeClients: number;
    totalAmount: string;
    status: string;
  }[];
  resellerStatus: string;
  daysPastDue: number;
}

// Interface para fatura do revendedor
interface ResellerInvoice {
  id: number;
  resellerId: string;
  referenceMonth: string;
  dueDate: string;
  activeClients: number;
  unitPrice: string;
  totalAmount: string;
  status: string;
  paymentMethod?: string;
  mpPaymentId?: string;
  paidAt?: string;
  createdAt: string;
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
  
  // Estados para pagamento com cartão
  const [cardNumber, setCardNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [docType, setDocType] = useState("CPF");
  const [docNumber, setDocNumber] = useState("");
  const [cardBrand, setCardBrand] = useState<string | null>(null);
  const [mpReady, setMpReady] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [isProcessingCard, setIsProcessingCard] = useState(false);
  const mpInstanceRef = useRef<any>(null);

  // Estados para detalhes do cliente
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [isClientDetailsOpen, setIsClientDetailsOpen] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [newPasswordForReset, setNewPasswordForReset] = useState("");
  
  // Estados para pagamento baseado em fatura mensal
  const [selectedInvoice, setSelectedInvoice] = useState<PendingInvoice | null>(null);
  const [isMarkPaidOpen, setIsMarkPaidOpen] = useState(false);
  const [markPaidAmount, setMarkPaidAmount] = useState("");
  const [markPaidDescription, setMarkPaidDescription] = useState("");

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

  // Buscar detalhes do cliente selecionado
  const { data: clientDetails, isLoading: isLoadingClientDetails, refetch: refetchClientDetails } = useQuery<ClientDetails>({
    queryKey: ["/api/reseller/clients", selectedClientId, "details"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reseller/clients/${selectedClientId}/details`);
      return res.json();
    },
    enabled: !!selectedClientId && isClientDetailsOpen,
  });

  // Buscar chave pública MercadoPago para pagamento com cartão
  const { data: mpConfig } = useQuery({
    queryKey: ["mp-public-key"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/mercadopago/public-key");
      return res.json();
    },
    enabled: !!resellerStatus?.hasResellerPlan,
  });

  // Inicializar MercadoPago SDK
  useEffect(() => {
    if (!mpConfig?.publicKey) return;
    
    const initMP = () => {
      if ((window as any).MercadoPago && mpConfig.publicKey) {
        try {
          mpInstanceRef.current = new (window as any).MercadoPago(mpConfig.publicKey, { locale: 'pt-BR' });
          setMpReady(true);
        } catch (err) {
          console.error("Erro ao inicializar MercadoPago:", err);
        }
      }
    };
    
    if ((window as any).MercadoPago) {
      initMP();
    } else {
      const script = document.createElement("script");
      script.src = "https://sdk.mercadopago.com/js/v2";
      script.async = true;
      script.onload = initMP;
      document.body.appendChild(script);
    }
  }, [mpConfig]);

  // Detectar bandeira do cartão
  useEffect(() => {
    const clean = cardNumber.replace(/\s/g, "");
    if (clean.length >= 4) {
      if (/^4/.test(clean)) setCardBrand("visa");
      else if (/^5[1-5]/.test(clean) || /^2/.test(clean)) setCardBrand("mastercard");
      else if (/^3[47]/.test(clean)) setCardBrand("amex");
      else if (/^(636368|438935|504175|451416|636297|506|4576|4011)/.test(clean)) setCardBrand("elo");
      else if (/^(606282|3841)/.test(clean)) setCardBrand("hipercard");
      else setCardBrand(null);
    } else setCardBrand(null);
  }, [cardNumber]);

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

  // Mutation para atualizar campos específicos do revendedor (inline updates)
  const updateResellerMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PUT", "/api/reseller/profile", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/profile"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
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

  // Mutation para resetar senha do cliente
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ clientId, newPassword }: { clientId: string; newPassword?: string }) => {
      const response = await apiRequest("POST", `/api/reseller/clients/${clientId}/reset-password`, {
        newPassword,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "✅ Senha resetada!",
        description: `Nova senha: ${data.newPassword}`,
      });
      setIsResetPasswordOpen(false);
      setNewPasswordForReset("");
    },
    onError: (error: any) => {
      toast({ title: "Erro ao resetar senha", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para confirmar pagamento de fatura mensal
  const markAsPaidMutation = useMutation({
    mutationFn: async ({ clientId, amount, description, referenceMonth, dueDate }: { 
      clientId: string; 
      amount?: string; 
      description?: string;
      referenceMonth?: string;
      dueDate?: string;
    }) => {
      const response = await apiRequest("POST", `/api/reseller/clients/${clientId}/mark-paid`, {
        amount,
        description,
        paymentMethod: 'manual',
        referenceMonth,
        dueDate,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients", selectedClientId, "details"] });
      toast({ 
        title: "✅ Pagamento confirmado!",
        description: `Fatura de R$ ${data.payment.amount} confirmada com sucesso.`,
      });
      setIsMarkPaidOpen(false);
      setMarkPaidAmount("");
      setMarkPaidDescription("");
      setSelectedInvoice(null);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao confirmar pagamento", description: error.message, variant: "destructive" });
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
    // Limpar campos do cartão
    setCardNumber("");
    setExpiryDate("");
    setCvv("");
    setCardHolder("");
    setDocNumber("");
    setCardError(null);
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
    } else if (paymentMethod === "credit_card") {
      // Para cartão, ir direto para o formulário de cartão (sem chamar API primeiro)
      setCheckoutStep("payment");
    } else {
      // Iniciar checkout com PIX
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

  // Abrir detalhes do cliente
  const openClientDetails = (clientId: string) => {
    setSelectedClientId(clientId);
    setIsClientDetailsOpen(true);
  };

  // Fechar detalhes do cliente
  const closeClientDetails = () => {
    setSelectedClientId(null);
    setIsClientDetailsOpen(false);
  };

  // Abrir modal de reset de senha
  const openResetPassword = () => {
    setNewPasswordForReset("");
    setIsResetPasswordOpen(true);
  };

  // Calcular faturas pendentes/vencidas do cliente
  const getClientInvoices = (): PendingInvoice[] => {
    if (!clientDetails?.client) return [];
    
    const invoices: PendingInvoice[] = [];
    const now = new Date();
    const clientPrice = parseFloat(clientDetails.client.clientPrice || '0');
    
    if (clientPrice <= 0 || clientDetails.client.isFreeClient) return [];
    
    // Pegar a data de ativação ou criação como base
    const activatedAt = clientDetails.client.activatedAt 
      ? new Date(clientDetails.client.activatedAt) 
      : new Date(clientDetails.client.createdAt);
    
    // Encontrar meses que já foram pagos
    const paidMonths = new Set(
      clientDetails.payments
        .filter(p => p.status === 'approved')
        .map(p => p.referenceMonth || '')
        .filter(m => m)
    );
    
    // Calcular meses desde a ativação até agora + 1 mês futuro (para antecipar)
    const monthsToShow = [];
    const startDate = new Date(activatedAt.getFullYear(), activatedAt.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0); // Próximo mês
    
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      monthsToShow.push(new Date(currentDate));
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    // Gerar faturas para cada mês
    for (const month of monthsToShow) {
      const referenceMonth = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      
      // Pular se já foi pago
      if (paidMonths.has(referenceMonth)) continue;
      
      // Calcular data de vencimento (dia 10 do mês seguinte por padrão)
      const billingDay = profile?.billingDay || 10;
      const dueDate = new Date(month.getFullYear(), month.getMonth() + 1, billingDay);
      
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      let status: 'pending' | 'overdue' | 'upcoming' = 'upcoming';
      if (daysUntilDue < 0) {
        status = 'overdue';
      } else if (daysUntilDue <= 30) {
        status = 'pending';
      }
      
      // Só mostrar faturas vencidas, pendentes (próximas 30 dias) ou próximo mês para antecipar
      if (status === 'upcoming' && daysUntilDue > 60) continue;
      
      invoices.push({
        referenceMonth,
        dueDate,
        amount: clientPrice,
        status,
        daysUntilDue
      });
    }
    
    // Ordenar por data de vencimento
    return invoices.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  };

  // Abrir modal de confirmar pagamento de fatura específica
  const openPayInvoice = (invoice: PendingInvoice) => {
    setSelectedInvoice(invoice);
    setMarkPaidAmount(invoice.amount.toString());
    setMarkPaidDescription(`Mensalidade ${new Date(invoice.referenceMonth + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`);
    setIsMarkPaidOpen(true);
  };

  // Handler para resetar senha
  const handleResetPassword = () => {
    if (!selectedClientId) return;
    resetPasswordMutation.mutate({
      clientId: selectedClientId,
      newPassword: newPasswordForReset || undefined,
    });
  };

  // Handler para confirmar pagamento de fatura
  const handleMarkAsPaid = () => {
    if (!selectedClientId || !selectedInvoice) return;
    markAsPaidMutation.mutate({
      clientId: selectedClientId,
      amount: markPaidAmount || undefined,
      description: markPaidDescription || undefined,
      referenceMonth: selectedInvoice.referenceMonth,
      dueDate: selectedInvoice.dueDate.toISOString(),
    });
  };

  // Formatadores de cartão
  const formatCardNumber = (v: string) => v.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  const formatExpiryDate = (v: string) => {
    const clean = v.replace(/\D/g, "").slice(0, 4);
    return clean.length >= 2 ? `${clean.slice(0, 2)}/${clean.slice(2)}` : clean;
  };
  const formatDoc = (v: string) => {
    const clean = v.replace(/\D/g, "");
    if (docType === "CPF") {
      return clean.slice(0, 11)
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})/, "$1-$2");
    }
    return clean.slice(0, 14)
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d{1,2})/, "$1-$2");
  };

  // Handler para pagamento com cartão de crédito
  const handleCardPayment = async () => {
    if (!mpInstanceRef.current) {
      setCardError("Sistema de pagamento não inicializado. Recarregue a página.");
      return;
    }
    
    if (!cardNumber || !expiryDate || !cvv || !cardHolder || !docNumber) {
      setCardError("Preencha todos os campos do cartão.");
      return;
    }
    
    setIsProcessingCard(true);
    setCardError(null);

    try {
      const [expirationMonth, expirationYear] = expiryDate.split("/");
      
      // Dados do cartão para tokenização
      const cardData = {
        cardNumber: cardNumber.replace(/\s/g, ""),
        cardholderName: cardHolder,
        cardExpirationMonth: expirationMonth,
        cardExpirationYear: "20" + expirationYear,
        securityCode: cvv,
        identificationType: docType,
        identificationNumber: docNumber.replace(/\D/g, ""),
      };
      
      // Criar token do cartão
      const cardToken = await mpInstanceRef.current.createCardToken(cardData);
      if (cardToken?.error || cardToken?.message) {
        throw new Error(cardToken.error || cardToken.message || "Erro ao processar cartão");
      }
      if (!cardToken || !cardToken.id) {
        throw new Error("Não foi possível processar os dados do cartão.");
      }

      // Determinar o método de pagamento
      const paymentMethodMap: Record<string, string> = {
        visa: "visa", mastercard: "master", amex: "amex", elo: "elo", hipercard: "hipercard"
      };
      const paymentMethodId = cardBrand ? paymentMethodMap[cardBrand] || "visa" : "visa";

      // Enviar checkout com token do cartão
      const response = await apiRequest("POST", "/api/reseller/clients/checkout", {
        name: newClientName,
        email: newClientEmail,
        phone: newClientPhone,
        password: newClientPassword,
        clientPrice: parseFloat(newClientPrice),
        paymentMethod: "credit_card",
        cardData: {
          token: cardToken.id,
          paymentMethodId,
          payerEmail: newClientEmail,
          installments: 1,
        },
      });

      const result = await response.json();

      if (result.success) {
        if (result.requiresPayment && result.error) {
          // Pagamento em processamento
          toast({ title: "Pagamento em processamento", description: result.error });
          setPendingPaymentId(result.paymentId);
          setCheckoutStep("payment");
        } else {
          // Pagamento aprovado - cliente criado
          queryClient.invalidateQueries({ queryKey: ["/api/reseller/clients"] });
          queryClient.invalidateQueries({ queryKey: ["/api/reseller/dashboard"] });
          toast({ title: "✅ Pagamento aprovado!", description: "Cliente criado com sucesso!" });
          setCheckoutStep("success");
        }
      } else {
        setCardError(result.message || "Erro ao processar pagamento");
      }
    } catch (err: any) {
      let errorMessage = "Verifique os dados do cartão.";
      const errMsg = String(err?.message || err?.error || String(err) || "").toLowerCase();
      
      if (errMsg.includes("card token") || errMsg.includes("service not found") || errMsg.includes("secure") || errMsg.includes("https")) {
        errorMessage = "⚠️ Pagamento seguro requer HTTPS.";
      } else if (err?.cause?.[0]?.code) {
        const code = err.cause[0].code;
        if (code === "205" || code === "E205") errorMessage = "Número do cartão inválido.";
        else if (code === "208" || code === "E208") errorMessage = "Mês de validade inválido.";
        else if (code === "209" || code === "E209") errorMessage = "Ano de validade inválido.";
        else if (code === "224" || code === "E224") errorMessage = "Código CVV inválido.";
      } else if (errMsg) {
        errorMessage = errMsg;
      }
      
      setCardError(errorMessage);
    } finally {
      setIsProcessingCard(false);
    }
  };

  // Limpar campos de cartão ao resetar formulário
  const resetCardForm = () => {
    setCardNumber("");
    setExpiryDate("");
    setCvv("");
    setCardHolder("");
    setDocNumber("");
    setCardError(null);
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

      {/* Tabs - 5 abas: Dashboard, Clientes, Recebimentos, Minha Assinatura, Configurações */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="clients" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Clientes</span>
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Recebimentos</span>
          </TabsTrigger>
          <TabsTrigger value="my-subscription" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Minha Assinatura</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Config</span>
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
                        <DialogTitle>
                          {paymentMethod === "pix" ? "Pagamento PIX" : "Pagamento com Cartão"}
                        </DialogTitle>
                        <DialogDescription>
                          {paymentMethod === "pix" 
                            ? "Escaneie o QR Code ou copie o código PIX para pagar"
                            : "Preencha os dados do seu cartão de crédito"
                          }
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        {/* PAGAMENTO PIX */}
                        {paymentMethod === "pix" && (
                          <>
                            {pixQrCode && (
                              <div className="flex justify-center">
                                <img 
                                  src={pixQrCode.startsWith('data:') ? pixQrCode : `data:image/png;base64,${pixQrCode}`} 
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
                          </>
                        )}

                        {/* PAGAMENTO COM CARTÃO */}
                        {paymentMethod === "credit_card" && (
                          <div className="space-y-4">
                            <div>
                              <Label className="text-sm font-medium mb-1.5 block">Número do cartão</Label>
                              <div className="relative">
                                <Input
                                  placeholder="0000 0000 0000 0000"
                                  value={cardNumber}
                                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                                  maxLength={19}
                                  className="h-10"
                                />
                                {cardBrand && (
                                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold uppercase text-primary">
                                    {cardBrand}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-sm font-medium mb-1.5 block">Validade</Label>
                                <Input
                                  placeholder="MM/AA"
                                  value={expiryDate}
                                  onChange={(e) => setExpiryDate(formatExpiryDate(e.target.value))}
                                  maxLength={5}
                                  className="h-10"
                                />
                              </div>
                              <div>
                                <Label className="text-sm font-medium mb-1.5 block">CVV</Label>
                                <Input
                                  placeholder="000"
                                  value={cvv}
                                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                  maxLength={4}
                                  className="h-10"
                                />
                              </div>
                            </div>

                            <div>
                              <Label className="text-sm font-medium mb-1.5 block">Nome no cartão</Label>
                              <Input
                                placeholder="NOME COMPLETO"
                                value={cardHolder}
                                onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                                className="h-10"
                              />
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <select
                                value={docType}
                                onChange={(e) => setDocType(e.target.value)}
                                className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                              >
                                <option value="CPF">CPF</option>
                                <option value="CNPJ">CNPJ</option>
                              </select>
                              <Input
                                placeholder="Documento"
                                value={docNumber}
                                onChange={(e) => setDocNumber(formatDoc(e.target.value))}
                                className="col-span-2 h-10"
                              />
                            </div>

                            {cardError && (
                              <div className="p-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-xs">
                                {cardError}
                              </div>
                            )}

                            {!mpReady && (
                              <div className="p-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded text-amber-600 dark:text-amber-400 text-xs">
                                ⚠️ Sistema de pagamento carregando...
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <DialogFooter className="flex-col sm:flex-row gap-2">
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setCheckoutStep("form");
                            setPixCode("");
                            setPixQrCode("");
                            resetCardForm();
                          }}
                        >
                          Voltar
                        </Button>
                        {paymentMethod === "pix" ? (
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
                        ) : (
                          <Button 
                            onClick={handleCardPayment}
                            disabled={isProcessingCard || !mpReady}
                          >
                            {isProcessingCard && (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            <CreditCard className="h-4 w-4 mr-2" />
                            {isProcessingCard ? "Processando..." : `Pagar R$ ${parseFloat(newClientPrice).toFixed(2).replace('.', ',')}`}
                          </Button>
                        )}
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
                    <TableHead>Valor Mensal</TableHead>
                    <TableHead>Conexão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Desde</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients?.map((client) => (
                    <TableRow key={client.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openClientDetails(client.id)}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Users className="h-4 w-4 text-primary" />
                          </div>
                          <span>{client.user?.name || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{client.user?.email || '-'}</TableCell>
                      <TableCell>
                        <span className="font-medium text-green-600">
                          R$ {client.clientPrice || profile?.clientMonthlyPrice || '99.99'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {/* Status será atualizado quando abrir detalhes */}
                        <Badge variant="outline" className="gap-1">
                          <Wifi className="h-3 w-3" />
                          Ver
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          client.status === 'active' ? 'default' :
                          client.status === 'suspended' ? 'secondary' :
                          client.status === 'pending' ? 'outline' :
                          'destructive'
                        } className="gap-1">
                          {client.status === 'active' && <CheckCircle2 className="h-3 w-3" />}
                          {client.status === 'suspended' && <Pause className="h-3 w-3" />}
                          {client.status === 'pending' && <Clock className="h-3 w-3" />}
                          {client.status === 'cancelled' && <XCircle className="h-3 w-3" />}
                          {client.status === 'active' ? 'Ativo' :
                           client.status === 'suspended' ? 'Suspenso' :
                           client.status === 'pending' ? 'Pendente' :
                           'Cancelado'}
                        </Badge>
                        {client.isFreeClient && (
                          <Badge variant="outline" className="ml-1 text-green-600 border-green-600">
                            Gratuito
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {client.activatedAt ? new Date(client.activatedAt).toLocaleDateString('pt-BR') : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openClientDetails(client.id)}
                            title="Ver detalhes"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                          {client.status === 'active' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => suspendClientMutation.mutate(client.id)}
                              disabled={suspendClientMutation.isPending}
                              title="Suspender"
                            >
                              <Pause className="h-4 w-4 text-orange-500" />
                            </Button>
                          )}
                          {client.status === 'suspended' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => reactivateClientMutation.mutate(client.id)}
                              disabled={reactivateClientMutation.isPending}
                              title="Reativar"
                            >
                              <Play className="h-4 w-4 text-green-500" />
                            </Button>
                          )}
                          {client.status !== 'cancelled' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm('Tem certeza que deseja cancelar este cliente?')) {
                                  cancelClientMutation.mutate(client.id);
                                }
                              }}
                              disabled={cancelClientMutation.isPending}
                              title="Cancelar"
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

        {/* Payments Tab - Agora chamado "Recebimentos" - pagamentos que você RECEBEU dos clientes */}
        <TabsContent value="payments" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Recebimentos dos Clientes</h2>
              <p className="text-sm text-muted-foreground">
                Pagamentos que você recebeu dos seus clientes
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

        {/* My Subscription Tab - O que você PAGA ao sistema */}
        <TabsContent value="my-subscription" className="space-y-6">
          <MySubscriptionTab profile={profile} />
        </TabsContent>

        {/* Settings Tab - Configurações e PIX */}
        <TabsContent value="settings" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Configuração do PIX */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Chave PIX para Recebimento
                </CardTitle>
                <CardDescription>
                  Configure sua chave PIX para receber pagamentos dos seus clientes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de Chave PIX</Label>
                  <select
                    className="w-full p-2 border rounded-lg bg-background"
                    value={profile?.pixKeyType || ''}
                    onChange={(e) => {
                      updateResellerMutation.mutate({
                        pixKeyType: e.target.value,
                      });
                    }}
                  >
                    <option value="">Selecione o tipo</option>
                    <option value="cpf">CPF</option>
                    <option value="cnpj">CNPJ</option>
                    <option value="email">Email</option>
                    <option value="phone">Telefone</option>
                    <option value="random">Chave Aleatória</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Chave PIX</Label>
                  <Input
                    placeholder={
                      profile?.pixKeyType === 'cpf' ? '000.000.000-00' :
                      profile?.pixKeyType === 'cnpj' ? '00.000.000/0000-00' :
                      profile?.pixKeyType === 'email' ? 'seu@email.com' :
                      profile?.pixKeyType === 'phone' ? '+55 11 99999-9999' :
                      'Cole sua chave aleatória'
                    }
                    value={profile?.pixKey || ''}
                    onChange={(e) => {
                      // Será salvo ao clicar em salvar
                    }}
                    onBlur={(e) => {
                      if (e.target.value !== profile?.pixKey) {
                        updateResellerMutation.mutate({
                          pixKey: e.target.value,
                        });
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nome do Titular</Label>
                  <Input
                    placeholder="Nome completo do titular da conta"
                    value={(profile as any)?.pixHolderName || ''}
                    onBlur={(e) => {
                      if (e.target.value !== (profile as any)?.pixHolderName) {
                        updateResellerMutation.mutate({
                          pixHolderName: e.target.value,
                        });
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nome do Banco</Label>
                  <Input
                    placeholder="Ex: Nubank, Inter, Itaú, Bradesco"
                    value={(profile as any)?.pixBankName || ''}
                    onBlur={(e) => {
                      if (e.target.value !== (profile as any)?.pixBankName) {
                        updateResellerMutation.mutate({
                          pixBankName: e.target.value,
                        });
                      }
                    }}
                  />
                </div>
                {profile?.pixKey && profile?.pixKeyType && (
                  <div className="p-3 border rounded-lg bg-green-50 dark:bg-green-950">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm font-medium">PIX configurado!</span>
                    </div>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      Seus clientes verão essa chave para fazer os pagamentos
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Preços para Clientes */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Preços para Seus Clientes
                </CardTitle>
                <CardDescription>
                  Configure os valores que você cobra dos seus clientes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Mensalidade Padrão (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={profile?.clientMonthlyPrice || '99.99'}
                    onChange={(e) => {
                      updateResellerMutation.mutate({
                        clientMonthlyPrice: e.target.value,
                      });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Valor padrão cobrado mensalmente de cada cliente
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Taxa de Setup (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={profile?.clientSetupFee || '0'}
                    onChange={(e) => {
                      updateResellerMutation.mutate({
                        clientSetupFee: e.target.value,
                      });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Taxa única de ativação (opcional)
                  </p>
                </div>
                <div className="pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Seu custo por cliente:</span>
                    <span className="font-medium">R$ {profile?.costPerClient || '49.99'}/mês</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm text-muted-foreground">Seu lucro por cliente:</span>
                    <span className="font-medium text-green-600">
                      R$ {(Number(profile?.clientMonthlyPrice || 99.99) - Number(profile?.costPerClient || 49.99)).toFixed(2)}/mês
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Branding */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Sua Marca
                </CardTitle>
                <CardDescription>
                  Personalize a aparência do seu sistema
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome da Empresa</Label>
                  <Input
                    value={profile?.companyName || ''}
                    onChange={(e) => {
                      updateResellerMutation.mutate({
                        companyName: e.target.value,
                      });
                    }}
                    placeholder="Nome da sua empresa"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-2">
                    <Label className="text-xs">Cor Primária</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={profile?.primaryColor || '#000000'}
                        onChange={(e) => {
                          updateResellerMutation.mutate({
                            primaryColor: e.target.value,
                          });
                        }}
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Cor Secundária</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={profile?.secondaryColor || '#ffffff'}
                        onChange={(e) => {
                          updateResellerMutation.mutate({
                            secondaryColor: e.target.value,
                          });
                        }}
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Destaque</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={profile?.accentColor || '#22c55e'}
                        onChange={(e) => {
                          updateResellerMutation.mutate({
                            accentColor: e.target.value,
                          });
                        }}
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contato */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Informações de Contato
                </CardTitle>
                <CardDescription>
                  Esses dados serão exibidos para seus clientes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Email de Suporte</Label>
                  <Input
                    type="email"
                    value={profile?.supportEmail || ''}
                    onChange={(e) => {
                      updateResellerMutation.mutate({
                        supportEmail: e.target.value,
                      });
                    }}
                    placeholder="suporte@suaempresa.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone/WhatsApp</Label>
                  <Input
                    value={profile?.supportPhone || ''}
                    onChange={(e) => {
                      updateResellerMutation.mutate({
                        supportPhone: e.target.value,
                      });
                    }}
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mensagem de Boas-vindas</Label>
                  <Textarea
                    value={profile?.welcomeMessage || ''}
                    onChange={(e) => {
                      updateResellerMutation.mutate({
                        welcomeMessage: e.target.value,
                      });
                    }}
                    placeholder="Mensagem personalizada para seus clientes..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog Centralizado de Detalhes do Cliente */}
      <Dialog open={isClientDetailsOpen} onOpenChange={setIsClientDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {isLoadingClientDetails ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : clientDetails ? (
            <>
              <DialogHeader className="space-y-4 pb-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-8 w-8 text-primary" />
                  </div>
                  <div className="flex-1">
                    <DialogTitle className="text-2xl">{clientDetails.user?.name || 'Cliente'}</DialogTitle>
                    <DialogDescription className="flex items-center gap-2 mt-1">
                      <Mail className="h-4 w-4" />
                      {clientDetails.user?.email}
                    </DialogDescription>
                  </div>
                  <Badge variant={
                    clientDetails.client.status === 'active' ? 'default' :
                    clientDetails.client.status === 'suspended' ? 'secondary' :
                    'destructive'
                  } className="text-sm py-1 px-3">
                    {clientDetails.client.status === 'active' ? '✅ Ativo' :
                     clientDetails.client.status === 'suspended' ? '⏸️ Suspenso' :
                     clientDetails.client.status === 'pending' ? '⏳ Pendente' :
                     '❌ Cancelado'}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="space-y-6">
                {/* Status de Conexão WhatsApp */}
                <Card className={cn(
                  "border-2",
                  clientDetails.connection?.isConnected 
                    ? "border-green-500 bg-green-50 dark:bg-green-950" 
                    : "border-orange-500 bg-orange-50 dark:bg-orange-950"
                )}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {clientDetails.connection?.isConnected ? (
                          <Wifi className="h-6 w-6 text-green-600" />
                        ) : (
                          <WifiOff className="h-6 w-6 text-orange-600" />
                        )}
                        <div>
                          <p className="font-medium">
                            {clientDetails.connection?.isConnected ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'}
                          </p>
                          {clientDetails.connection?.phoneNumber && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {clientDetails.connection.phoneNumber}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Conversas</p>
                        <p className="text-lg font-bold">{clientDetails.stats.totalConversations}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Informações Financeiras */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Informações Financeiras
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">Valor Mensal</p>
                        <p className="text-2xl font-bold text-green-600">
                          R$ {clientDetails.client.clientPrice || '99.99'}
                        </p>
                        {clientDetails.client.isFreeClient && (
                          <Badge variant="outline" className="mt-2 text-green-600">🎁 Cliente Demo</Badge>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">Seu Custo</p>
                        <p className="text-2xl font-bold">
                          R$ {clientDetails.client.monthlyCost || '49.99'}
                        </p>
                        <Badge variant="outline" className="mt-2">
                          Lucro: R$ {(
                            parseFloat(clientDetails.client.clientPrice || '99.99') - 
                            parseFloat(clientDetails.client.monthlyCost || '49.99')
                          ).toFixed(2)}
                        </Badge>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Datas Importantes */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Datas
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between p-2 bg-muted/50 rounded">
                      <span className="text-muted-foreground">Cadastro</span>
                      <span>{clientDetails.user?.createdAt ? new Date(clientDetails.user.createdAt).toLocaleDateString('pt-BR') : '-'}</span>
                    </div>
                    <div className="flex justify-between p-2 bg-muted/50 rounded">
                      <span className="text-muted-foreground">Ativação</span>
                      <span>{clientDetails.client.activatedAt ? new Date(clientDetails.client.activatedAt).toLocaleDateString('pt-BR') : '-'}</span>
                    </div>
                    {clientDetails.client.nextPaymentDate && (
                      <div className="flex justify-between p-2 bg-muted/50 rounded">
                        <span className="text-muted-foreground">Próximo Pagamento</span>
                        <span className="font-medium">{new Date(clientDetails.client.nextPaymentDate).toLocaleDateString('pt-BR')}</span>
                      </div>
                    )}
                    {clientDetails.client.suspendedAt && (
                      <div className="flex justify-between p-2 bg-orange-50 dark:bg-orange-950 rounded">
                        <span className="text-orange-600">Suspenso em</span>
                        <span className="text-orange-600">{new Date(clientDetails.client.suspendedAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Faturas Pendentes/Vencidas */}
                {!clientDetails.client.isFreeClient && parseFloat(clientDetails.client.clientPrice || '0') > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Faturas
                    </h3>
                    {(() => {
                      const invoices = getClientInvoices();
                      if (invoices.length === 0) {
                        return (
                          <Card className="border-green-200 bg-green-50 dark:bg-green-950">
                            <CardContent className="p-4 text-center">
                              <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-2" />
                              <p className="text-green-700 dark:text-green-300">Todas as faturas pagas!</p>
                            </CardContent>
                          </Card>
                        );
                      }
                      return (
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {invoices.map((invoice) => (
                            <div 
                              key={invoice.referenceMonth}
                              className={cn(
                                "flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors",
                                invoice.status === 'overdue' && "border-red-300 bg-red-50 dark:bg-red-950",
                                invoice.status === 'pending' && "border-yellow-300 bg-yellow-50 dark:bg-yellow-950",
                                invoice.status === 'upcoming' && "border-blue-300 bg-blue-50 dark:bg-blue-950"
                              )}
                              onClick={() => openPayInvoice(invoice)}
                            >
                              <div>
                                <p className="font-medium">
                                  {new Date(invoice.referenceMonth + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Vence: {invoice.dueDate.toLocaleDateString('pt-BR')}
                                </p>
                              </div>
                              <div className="text-right flex items-center gap-2">
                                <div>
                                  <p className="font-bold">R$ {invoice.amount.toFixed(2)}</p>
                                  <Badge variant={
                                    invoice.status === 'overdue' ? 'destructive' :
                                    invoice.status === 'pending' ? 'outline' :
                                    'secondary'
                                  } className="text-xs">
                                    {invoice.status === 'overdue' ? `⚠️ Vencida há ${Math.abs(invoice.daysUntilDue)} dias` :
                                     invoice.status === 'pending' ? `⏳ Vence em ${invoice.daysUntilDue} dias` :
                                     '🔜 Antecipar'}
                                  </Badge>
                                </div>
                                <Button size="sm" variant={invoice.status === 'overdue' ? 'destructive' : 'outline'}>
                                  {invoice.status === 'overdue' ? 'Pagar' : 
                                   invoice.status === 'pending' ? 'Confirmar' : 
                                   'Antecipar'}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Histórico de Pagamentos */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Histórico de Pagamentos
                  </h3>
                  {clientDetails.payments.length === 0 ? (
                    <Card>
                      <CardContent className="p-4 text-center text-muted-foreground">
                        Nenhum pagamento registrado
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {clientDetails.payments.filter(p => p.status === 'approved').map((payment) => (
                        <div 
                          key={payment.id} 
                          className="flex items-center justify-between p-3 border rounded-lg bg-green-50/50 dark:bg-green-950/20"
                        >
                          <div>
                            <p className="font-medium">R$ {payment.amount}</p>
                            <p className="text-xs text-muted-foreground">
                              {payment.referenceMonth 
                                ? new Date(payment.referenceMonth + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
                                : payment.description || payment.paymentType
                              }
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant="default" className="mb-1 bg-green-600">
                              ✅ Pago
                            </Badge>
                            <p className="text-xs text-muted-foreground">
                              {payment.paidAt 
                                ? new Date(payment.paidAt).toLocaleDateString('pt-BR')
                                : new Date(payment.createdAt).toLocaleDateString('pt-BR')
                              }
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Ações */}
                <Separator />
                <div className="space-y-3">
                  <h3 className="font-semibold">Ações</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Reset de Senha */}
                    <Dialog open={isResetPasswordOpen} onOpenChange={setIsResetPasswordOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full gap-2">
                          <Key className="h-4 w-4" />
                          Resetar Senha
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Resetar Senha do Cliente</DialogTitle>
                          <DialogDescription>
                            Gere uma nova senha para {clientDetails.user?.name}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Nova Senha (deixe em branco para gerar automaticamente)</Label>
                            <Input
                              type="text"
                              value={newPasswordForReset}
                              onChange={(e) => setNewPasswordForReset(e.target.value)}
                              placeholder="Deixe vazio para gerar automaticamente"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsResetPasswordOpen(false)}>
                            Cancelar
                          </Button>
                          <Button 
                            onClick={handleResetPassword}
                            disabled={resetPasswordMutation.isPending}
                          >
                            {resetPasswordMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Resetar Senha
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {/* Dialog de Confirmar Pagamento */}
                    <Dialog open={isMarkPaidOpen} onOpenChange={(open) => {
                      setIsMarkPaidOpen(open);
                      if (!open) setSelectedInvoice(null);
                    }}>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Confirmar Pagamento</DialogTitle>
                          <DialogDescription>
                            {selectedInvoice && (
                              <>
                                Confirme o recebimento da fatura de{' '}
                                <strong>{new Date(selectedInvoice.referenceMonth + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</strong>
                              </>
                            )}
                          </DialogDescription>
                        </DialogHeader>
                        {selectedInvoice && (
                          <div className="space-y-4 py-4">
                            <div className={cn(
                              "p-4 rounded-lg border-2",
                              selectedInvoice.status === 'overdue' && "border-red-300 bg-red-50 dark:bg-red-950",
                              selectedInvoice.status === 'pending' && "border-yellow-300 bg-yellow-50 dark:bg-yellow-950",
                              selectedInvoice.status === 'upcoming' && "border-blue-300 bg-blue-50 dark:bg-blue-950"
                            )}>
                              <div className="flex justify-between items-center">
                                <div>
                                  <p className="text-sm text-muted-foreground">Valor da Fatura</p>
                                  <p className="text-2xl font-bold">R$ {selectedInvoice.amount.toFixed(2)}</p>
                                </div>
                                <Badge variant={selectedInvoice.status === 'overdue' ? 'destructive' : 'outline'}>
                                  {selectedInvoice.status === 'overdue' ? '⚠️ Vencida' :
                                   selectedInvoice.status === 'pending' ? '⏳ A vencer' :
                                   '🔜 Antecipação'}
                                </Badge>
                              </div>
                              <div className="mt-2 text-sm text-muted-foreground">
                                <p>Vencimento: {selectedInvoice.dueDate.toLocaleDateString('pt-BR')}</p>
                                <p>Referência: {new Date(selectedInvoice.referenceMonth + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Observação (opcional)</Label>
                              <Input
                                value={markPaidDescription}
                                onChange={(e) => setMarkPaidDescription(e.target.value)}
                                placeholder="Ex: PIX recebido, Dinheiro..."
                              />
                            </div>
                          </div>
                        )}
                        <DialogFooter>
                          <Button variant="outline" onClick={() => {
                            setIsMarkPaidOpen(false);
                            setSelectedInvoice(null);
                          }}>
                            Cancelar
                          </Button>
                          <Button 
                            onClick={handleMarkAsPaid}
                            disabled={markAsPaidMutation.isPending}
                            variant={selectedInvoice?.status === 'overdue' ? 'destructive' : 'default'}
                          >
                            {markAsPaidMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            ✅ Confirmar Pagamento
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {/* Suspender/Reativar */}
                    {clientDetails.client.status === 'active' && (
                      <Button 
                        variant="outline" 
                        className="w-full gap-2 text-orange-600 hover:text-orange-700"
                        onClick={() => {
                          suspendClientMutation.mutate(selectedClientId!);
                          closeClientDetails();
                        }}
                      >
                        <Pause className="h-4 w-4" />
                        Suspender
                      </Button>
                    )}
                    {clientDetails.client.status === 'suspended' && (
                      <Button 
                        variant="outline" 
                        className="w-full gap-2 text-green-600 hover:text-green-700"
                        onClick={() => {
                          reactivateClientMutation.mutate(selectedClientId!);
                          closeClientDetails();
                        }}
                      >
                        <Play className="h-4 w-4" />
                        Reativar
                      </Button>
                    )}

                    {/* Cancelar */}
                    {clientDetails.client.status !== 'cancelled' && (
                      <Button 
                        variant="outline" 
                        className="w-full gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => {
                          if (confirm('Tem certeza que deseja cancelar este cliente? Esta ação não pode ser desfeita.')) {
                            cancelClientMutation.mutate(selectedClientId!);
                            closeClientDetails();
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Cancelar Cliente
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Cliente não encontrado
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Componente separado para a aba "Minha Assinatura"
function MySubscriptionTab({ profile }: { profile: ResellerProfile | undefined }) {
  const { toast } = useToast();
  const [isPayPixOpen, setIsPayPixOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [pixData, setPixData] = useState<{
    qrCode: string;
    qrCodeBase64: string;
    amount: number;
    referenceMonth: string;
  } | null>(null);
  const [isGeneratingPix, setIsGeneratingPix] = useState(false);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);

  // Buscar dados da assinatura do revendedor
  const { data: subscription, isLoading, refetch } = useQuery<ResellerSubscription>({
    queryKey: ["/api/reseller/my-subscription"],
    refetchInterval: 30000, // Atualizar a cada 30 segundos
  });

  // Buscar histórico de faturas
  const { data: invoices, isLoading: isLoadingInvoices } = useQuery<ResellerInvoice[]>({
    queryKey: ["/api/reseller/my-invoices"],
  });

  // Gerar PIX para pagamento
  const generatePix = async (invoiceId: number) => {
    setIsGeneratingPix(true);
    try {
      const response = await apiRequest("POST", `/api/reseller/my-invoices/${invoiceId}/pay-pix`);
      const data = await response.json();
      setPixData(data);
      setSelectedInvoiceId(invoiceId);
      setIsPayPixOpen(true);
    } catch (error: any) {
      toast({
        title: "Erro ao gerar PIX",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPix(false);
    }
  };

  // Verificar status do pagamento
  const checkPayment = async (invoiceId: number) => {
    setIsCheckingPayment(true);
    try {
      const response = await apiRequest("GET", `/api/reseller/my-invoices/${invoiceId}/check-payment`);
      const data = await response.json();
      if (data.status === 'paid') {
        toast({
          title: "Pagamento confirmado!",
          description: "Sua fatura foi paga com sucesso.",
        });
        setIsPayPixOpen(false);
        setPixData(null);
        refetch();
      } else {
        toast({
          title: "Pagamento ainda não confirmado",
          description: "Continue aguardando ou tente novamente em alguns segundos.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro ao verificar pagamento",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCheckingPayment(false);
    }
  };

  // Copiar código PIX
  const copyPixCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: "Copiado!",
      description: "Código PIX copiado para a área de transferência",
    });
  };

  // Formatar mês de referência
  const formatMonth = (monthStr: string | undefined | null) => {
    if (!monthStr) return 'Mês indisponível';
    const parts = monthStr.split('-');
    if (parts.length !== 2) return monthStr;
    const [year, month] = parts;
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const monthIndex = parseInt(month) - 1;
    if (monthIndex < 0 || monthIndex > 11) return monthStr;
    return `${months[monthIndex]}/${year}`;
  };

  // Status badge color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-500">Pago</Badge>;
      case 'pending':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Pendente</Badge>;
      case 'overdue':
        return <Badge variant="destructive">Vencido</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
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
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Minha Assinatura</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie suas faturas com o sistema AgenteZap
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Card de Status Principal */}
      <Card className={cn(
        "border-2",
        subscription?.resellerStatus === 'blocked' && "border-red-500 bg-red-50 dark:bg-red-950",
        subscription?.resellerStatus === 'overdue' && "border-yellow-500 bg-yellow-50 dark:bg-yellow-950",
        subscription?.resellerStatus === 'active' && "border-green-500"
      )}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Resumo da Assinatura
            </CardTitle>
            {subscription?.resellerStatus === 'blocked' && (
              <Badge variant="destructive" className="animate-pulse">BLOQUEADO</Badge>
            )}
            {subscription?.resellerStatus === 'overdue' && (
              <Badge className="bg-yellow-500 animate-pulse">VENCIDO</Badge>
            )}
            {subscription?.resellerStatus === 'active' && (
              <Badge className="bg-green-500">EM DIA</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <Users className="h-6 w-6 mx-auto mb-2 text-blue-500" />
              <p className="text-2xl font-bold">{subscription?.activeClients || 0}</p>
              <p className="text-sm text-muted-foreground">Clientes Ativos</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <DollarSign className="h-6 w-6 mx-auto mb-2 text-green-500" />
              <p className="text-2xl font-bold">R$ {subscription?.costPerClient?.toFixed(2) || '49.99'}</p>
              <p className="text-sm text-muted-foreground">Por Cliente</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <CreditCard className="h-6 w-6 mx-auto mb-2 text-purple-500" />
              <p className="text-2xl font-bold">R$ {subscription?.totalMonthly?.toFixed(2) || '0.00'}</p>
              <p className="text-sm text-muted-foreground">Total Mensal</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <Calendar className="h-6 w-6 mx-auto mb-2 text-orange-500" />
              <p className="text-2xl font-bold">Dia {subscription?.billingDay || 10}</p>
              <p className="text-sm text-muted-foreground">Vencimento</p>
            </div>
          </div>

          {/* Aviso de Bloqueio */}
          {subscription?.resellerStatus === 'blocked' && (
            <div className="mt-4 p-4 bg-red-100 dark:bg-red-900 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <AlertCircle className="h-5 w-5" />
                <span className="font-semibold">Sua conta está bloqueada!</span>
              </div>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                Você está com {subscription.daysPastDue} dias de atraso. Regularize sua situação para liberar o acesso dos seus clientes.
              </p>
            </div>
          )}

          {/* Aviso de Vencimento */}
          {subscription?.resellerStatus === 'overdue' && (
            <div className="mt-4 p-4 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
              <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
                <Clock className="h-5 w-5" />
                <span className="font-semibold">Fatura vencida!</span>
              </div>
              <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                Você tem {subscription.daysPastDue} dias de atraso. Pague até 10 dias para evitar o bloqueio.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Faturas Pendentes */}
      {subscription?.pendingInvoices && subscription.pendingInvoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Faturas Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {subscription.pendingInvoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-semibold">{formatMonth(invoice.referenceMonth)}</p>
                    <p className="text-sm text-muted-foreground">
                      Vencimento: {new Date(invoice.dueDate).toLocaleDateString('pt-BR')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {invoice.activeClients} clientes
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold">R$ {parseFloat(invoice.totalAmount).toFixed(2)}</p>
                    {getStatusBadge(invoice.status)}
                    <div className="mt-2">
                      <Button 
                        size="sm" 
                        onClick={() => generatePix(invoice.id)}
                        disabled={isGeneratingPix}
                      >
                        {isGeneratingPix ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <CreditCard className="h-4 w-4 mr-2" />
                        )}
                        Pagar com PIX
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Histórico de Faturas */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Faturas</CardTitle>
          <CardDescription>Todas as suas faturas com o sistema</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingInvoices ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : invoices?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma fatura ainda</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referência</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Clientes</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pago em</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices?.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {formatMonth(invoice.referenceMonth)}
                    </TableCell>
                    <TableCell>
                      {new Date(invoice.dueDate).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell>{invoice.activeClients}</TableCell>
                    <TableCell className="font-semibold">
                      R$ {parseFloat(invoice.totalAmount).toFixed(2)}
                    </TableCell>
                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                    <TableCell>
                      {invoice.paidAt 
                        ? new Date(invoice.paidAt).toLocaleDateString('pt-BR')
                        : '-'
                      }
                    </TableCell>
                    <TableCell>
                      {invoice.status !== 'paid' && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => generatePix(invoice.id)}
                          disabled={isGeneratingPix}
                        >
                          Pagar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal de Pagamento PIX */}
      <Dialog open={isPayPixOpen} onOpenChange={setIsPayPixOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Pagar com PIX
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR Code ou copie o código PIX
            </DialogDescription>
          </DialogHeader>

          {pixData && (
            <div className="space-y-4">
              {/* Info da fatura */}
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Fatura de</p>
                <p className="text-lg font-semibold">{formatMonth(pixData.referenceMonth)}</p>
                <p className="text-2xl font-bold text-green-600">
                  R$ {pixData.amount.toFixed(2)}
                </p>
              </div>

              {/* QR Code */}
              {pixData.qrCodeBase64 && (
                <div className="flex justify-center">
                  <img 
                    src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                    alt="QR Code PIX"
                    className="w-48 h-48 border rounded-lg"
                  />
                </div>
              )}

              {/* Código PIX para copiar */}
              <div className="space-y-2">
                <Label>Código PIX (Copia e Cola)</Label>
                <div className="flex gap-2">
                  <Input 
                    value={pixData.qrCode} 
                    readOnly 
                    className="text-xs"
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => copyPixCode(pixData.qrCode)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Botão de verificar pagamento */}
              <Button 
                className="w-full" 
                onClick={() => selectedInvoiceId && checkPayment(selectedInvoiceId)}
                disabled={isCheckingPayment}
              >
                {isCheckingPayment ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Já paguei! Verificar pagamento
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                O pagamento é processado automaticamente. Se já pagou, clique em verificar.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
