import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CreditCard, 
  CalendarDays, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle,
  QrCode,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Receipt,
  TrendingUp,
  Ban,
  ArrowRight,
  Percent,
  CalendarClock,
  AlertTriangle
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { format, isPast, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useLocation } from "wouter";

// Formatação de moeda BR
function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "R$ 0,00";
  const numericValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numericValue)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numericValue);
}

interface PaymentRecord {
  id: number;
  mpPaymentId: string;
  amount: string;
  status: string;
  statusDetail: string;
  paymentType: string;
  paymentMethod: string;
  processedAt: string;
  createdAt: string;
  dueDate: string;
}

interface SubscriptionData {
  subscription: {
    id: string;
    status: string;
    dataInicio: string;
    dataFim: string;
    nextPaymentDate: string;
    couponCode: string | null;
    couponPrice: string | null;
    daysRemaining: number;
    needsPayment: boolean;
    payerEmail: string;
    paymentMethod: string | null; // mercadopago, pix_manual, card
    mpSubscriptionId: string | null; // Se tem assinatura de cartão
    cardLastFourDigits?: string | null;
    cardBrand?: string | null;
  } | null;
  plan: {
    id: string;
    nome: string;
    valor: string;
    tipo: string;
    creditos: number;
    descricao: string;
  } | null;
  payments: PaymentRecord[];
  stats: {
    totalPaid: number;
    totalPayments: number;
    approvedPayments: number;
    failedPayments: number;
  };
}
interface PixData {
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  paymentId: number;
  amount: number;
  expirationDate: string;
}

export default function MySubscription() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [showPixDialog, setShowPixDialog] = useState(false);
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [timeLeft, setTimeLeft] = useState("");
  
  // Novos estados para funcionalidades adicionais
  const [showChangePlanDialog, setShowChangePlanDialog] = useState(false);
  const [showPaymentMethodDialog, setShowPaymentMethodDialog] = useState(false);
  const [showAnnualDialog, setShowAnnualDialog] = useState(false);
  const [showAdvancePaymentDialog, setShowAdvancePaymentDialog] = useState(false);

  const { data, isLoading, refetch } = useQuery<SubscriptionData>({
    queryKey: ["/api/my-subscription"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Buscar desconto anual do sistema
  const { data: annualConfig } = useQuery({
    queryKey: ["annual-discount-config"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/system-config/annual-discount");
      return res.json();
    },
  });

  const annualDiscountPercent = annualConfig?.percent || 5;
  const annualDiscountEnabled = annualConfig?.enabled !== false;

  const generatePixMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const response = await apiRequest("POST", "/api/my-subscription/generate-pix", { subscriptionId });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.status === "pending") {
        setPixData({
          qrCode: data.qrCode,
          qrCodeBase64: data.qrCodeBase64,
          ticketUrl: data.ticketUrl,
          paymentId: data.paymentId,
          amount: data.amount,
          expirationDate: data.expirationDate,
        });
        setShowPixDialog(true);
      } else {
        toast({
          title: "Erro",
          description: data.message || "Erro ao gerar PIX",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para gerar PIX de pagamento anual
  const generateAnnualPixMutation = useMutation({
    mutationFn: async ({ subscriptionId, discountPercent }: { subscriptionId: string, discountPercent: number }) => {
      const response = await apiRequest("POST", "/api/my-subscription/generate-annual-pix", { subscriptionId, discountPercent });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.status === "pending") {
        setPixData({
          qrCode: data.qrCode,
          qrCodeBase64: data.qrCodeBase64,
          ticketUrl: data.ticketUrl,
          paymentId: data.paymentId,
          amount: data.amount,
          expirationDate: data.expirationDate,
        });
        setShowAnnualDialog(false);
        setShowPixDialog(true);
        toast({
          title: "PIX Anual Gerado!",
          description: `Valor total com ${data.discountPercent}% de desconto: ${formatCurrency(data.amount)}`,
        });
      } else {
        toast({
          title: "Erro",
          description: data.message || "Erro ao gerar PIX anual",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para cobrar no cartão (pagamento anual)
  const chargeAnnualCardMutation = useMutation({
    mutationFn: async ({ subscriptionId, discountPercent }: { subscriptionId: string, discountPercent: number }) => {
      const response = await apiRequest("POST", "/api/my-subscription/charge-annual-card", { subscriptionId, discountPercent });
      return response.json();
    },
    onSuccess: (data) => {
      setShowAnnualDialog(false);
      toast({
        title: "Pagamento Processado!",
        description: data.message || "Pagamento anual cobrado com sucesso no cartão.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/my-subscription"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Countdown timer for PIX
  useEffect(() => {
    if (!pixData?.expirationDate) return;
    
    const interval = setInterval(() => {
      const now = new Date();
      const expiration = new Date(pixData.expirationDate);
      const diff = expiration.getTime() - now.getTime();
      
      if (diff <= 0) {
        setTimeLeft("Expirado");
        clearInterval(interval);
        return;
      }
      
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, "0")}`);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [pixData?.expirationDate]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copiado!",
        description: "Código PIX copiado para a área de transferência",
      });
    } catch (err) {
      toast({
        title: "Erro",
        description: "Não foi possível copiar",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500">Ativa</Badge>;
      case "pending_pix":
        return <Badge className="bg-yellow-500">Aguardando PIX</Badge>;
      case "canceled":
        return <Badge className="bg-red-500">Cancelada</Badge>;
      case "expired":
        return <Badge className="bg-gray-500">Expirada</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPaymentStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "rejected":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "pending":
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getPaymentStatusText = (status: string) => {
    switch (status) {
      case "approved":
        return "Aprovado";
      case "rejected":
        return "Recusado";
      case "pending":
        return "Pendente";
      case "in_process":
        return "Em processamento";
      case "refunded":
        return "Reembolsado";
      default:
        return status;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const { subscription, plan, payments, stats } = data || {};

  if (!subscription) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card className="max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <CardTitle>Nenhuma Assinatura</CardTitle>
            <CardDescription>
              Você ainda não possui uma assinatura ativa
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Ban className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <p className="text-muted-foreground mb-6">
              Escolha um plano para começar a usar todos os recursos do AgenteZap
            </p>
            <Button onClick={() => window.location.href = "/plans"}>
              Ver Planos Disponíveis
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Minha Assinatura</h1>
          <p className="text-muted-foreground">Gerencie sua assinatura e pagamentos</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                {getStatusBadge(subscription.status)}
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Dias Restantes</p>
                <p className="text-2xl font-bold">{subscription.daysRemaining}</p>
              </div>
              <CalendarDays className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Pago</p>
                <p className="text-2xl font-bold">{formatCurrency(stats?.totalPaid || 0)}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pagamentos</p>
                <p className="text-2xl font-bold">{stats?.approvedPayments || 0}/{stats?.totalPayments || 0}</p>
              </div>
              <Receipt className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Próxima Fatura - Novo Card Destacado */}
        <Card className="md:col-span-2 border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Receipt className="w-5 h-5 text-primary" />
              Próxima Fatura
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              // Usar nextPaymentDate se existir, senão usar dataFim (data de vencimento da assinatura)
              const nextPaymentDateStr = subscription.nextPaymentDate || subscription.dataFim;
              const nextPayment = nextPaymentDateStr ? new Date(nextPaymentDateStr) : null;
              const isOverdue = nextPayment && isPast(nextPayment);
              const monthlyValue = subscription.couponPrice 
                ? parseFloat(subscription.couponPrice) 
                : parseFloat(plan?.valor || "0");
              
              // Verificar se é assinatura com cartão (tem mpSubscriptionId)
              const hasCardSubscription = !!subscription.mpSubscriptionId;
              
              return (
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-full ${isOverdue ? 'bg-red-100' : 'bg-primary/10'}`}>
                      <CalendarDays className={`w-6 h-6 ${isOverdue ? 'text-red-600' : 'text-primary'}`} />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Vencimento</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xl font-bold">
                          {nextPayment 
                            ? format(nextPayment, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                            : "Não definido"}
                        </p>
                        {isOverdue && (
                          <Badge variant="destructive" className="flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            VENCIDA
                          </Badge>
                        )}
                      </div>
                      {/* Mostrar forma de pagamento se tiver cartão */}
                      {hasCardSubscription && subscription.cardLastFourDigits && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <CreditCard className="w-3 h-3" />
                          Cartão •••• {subscription.cardLastFourDigits}
                          {subscription.cardBrand && ` (${subscription.cardBrand})`}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Valor</p>
                      <p className="text-2xl font-bold text-primary">
                        {formatCurrency(monthlyValue)}
                      </p>
                    </div>
                    
                    {/* Se tem assinatura com cartão, cobrança é automática */}
                    {hasCardSubscription ? (
                      <div className="text-center">
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Cobrança Automática
                        </Badge>
                      </div>
                    ) : (
                      /* Só mostrar botão de pagar antecipado para PIX */
                      <Button 
                        onClick={() => generatePixMutation.mutate(subscription.id)}
                        disabled={generatePixMutation.isPending}
                        className={isOverdue ? "bg-red-600 hover:bg-red-700" : ""}
                      >
                        {generatePixMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <QrCode className="w-4 h-4 mr-2" />
                            {isOverdue ? "Pagar Agora" : "Pagar Antecipado"}
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Subscription Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Detalhes do Plano
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Plano</span>
              <span className="font-medium">{plan?.nome || "N/A"}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Valor</span>
              <span className="font-medium">
                {subscription.couponPrice 
                  ? (
                    <span>
                      <span className="line-through text-sm text-gray-400 mr-2">
                        {formatCurrency(parseFloat(plan?.valor || "0"))}
                      </span>
                      {formatCurrency(parseFloat(subscription.couponPrice))}
                    </span>
                  )
                  : formatCurrency(parseFloat(plan?.valor || "0"))
                }
                <span className="text-sm text-muted-foreground">/mês</span>
              </span>
            </div>
            {subscription.couponCode && (
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Cupom Aplicado</span>
                <Badge variant="secondary">{subscription.couponCode}</Badge>
              </div>
            )}
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Créditos/Mês</span>
              <span className="font-medium">{plan?.creditos?.toLocaleString() || "0"}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Início</span>
              <span className="font-medium">
                {subscription.dataInicio 
                  ? format(new Date(subscription.dataInicio), "dd/MM/yyyy", { locale: ptBR })
                  : "N/A"}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Vencimento</span>
              <span className="font-medium">
                {subscription.dataFim 
                  ? format(new Date(subscription.dataFim), "dd/MM/yyyy", { locale: ptBR })
                  : "N/A"}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">Próximo Pagamento</span>
              <span className="font-medium">
                {subscription.nextPaymentDate 
                  ? format(new Date(subscription.nextPaymentDate), "dd/MM/yyyy", { locale: ptBR })
                  : "N/A"}
              </span>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            {(subscription.status === "pending_pix" || subscription.needsPayment) && (
              <Button 
                className="w-full" 
                onClick={() => generatePixMutation.mutate(subscription.id)}
                disabled={generatePixMutation.isPending}
              >
                {generatePixMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Gerando PIX...
                  </>
                ) : (
                  <>
                    <QrCode className="w-4 h-4 mr-2" />
                    {subscription.status === "pending_pix" ? "Pagar com PIX" : "Renovar Assinatura"}
                  </>
                )}
              </Button>
            )}
            
            {/* Botões de Ação */}
            <div className="w-full grid grid-cols-1 gap-2 mt-2 pt-2 border-t">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setLocation("/plans")}
                className="w-full"
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Alterar Plano
              </Button>
              
              {annualDiscountEnabled && subscription.status === "active" && plan?.tipo !== "anual" && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowAnnualDialog(true)}
                  className="w-full border-green-200 text-green-700 hover:bg-green-50"
                >
                  <Percent className="w-4 h-4 mr-2" />
                  Pagar Anual ({annualDiscountPercent}% desconto)
                </Button>
              )}
              
              {/* Antecipar Pagamento - SÓ PARA PIX (sem assinatura de cartão) */}
              {subscription.status === "active" && 
               subscription.daysRemaining <= 30 && 
               !subscription.mpSubscriptionId && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => generatePixMutation.mutate(subscription.id)}
                  className="w-full border-blue-200 text-blue-700 hover:bg-blue-50"
                  disabled={generatePixMutation.isPending}
                >
                  <CalendarClock className="w-4 h-4 mr-2" />
                  Antecipar Pagamento
                </Button>
              )}
              
              {/* Para clientes sem cartão cadastrado - opção de cadastrar */}
              {subscription.status === "active" && !subscription.mpSubscriptionId && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowPaymentMethodDialog(true)}
                  className="w-full border-purple-200 text-purple-700 hover:bg-purple-50"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Cadastrar Cartão (cobrança automática)
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>

        {/* Payment History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Histórico de Pagamentos
            </CardTitle>
            <CardDescription>
              {stats?.approvedPayments} aprovados, {stats?.failedPayments} recusados
            </CardDescription>
          </CardHeader>
          <CardContent>
            {payments && payments.length > 0 ? (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {payments.map((payment) => (
                  <div 
                    key={payment.id} 
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {getPaymentStatusIcon(payment.status)}
                      <div>
                        <p className="font-medium text-sm">
                          {formatCurrency(parseFloat(payment.amount))}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {payment.processedAt 
                            ? format(new Date(payment.processedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })
                            : format(new Date(payment.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={payment.status === "approved" ? "default" : "secondary"}>
                        {getPaymentStatusText(payment.status)}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {payment.paymentMethod === "pix" ? "PIX" : payment.paymentMethod}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Receipt className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum pagamento registrado</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alert for PIX pending */}
      {subscription.status === "pending_pix" && (
        <Card className="mt-6 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">
                  Pagamento Pendente
                </h3>
                <p className="text-yellow-700 dark:text-yellow-300 text-sm mt-1">
                  Sua assinatura está aguardando o pagamento via PIX. Clique no botão "Pagar com PIX" 
                  para gerar um novo código QR e completar o pagamento.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alert for renewal */}
      {subscription.status === "active" && subscription.daysRemaining <= 5 && subscription.daysRemaining > 0 && (
        <Card className="mt-6 border-blue-500 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <CalendarDays className="w-6 h-6 text-blue-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-blue-800 dark:text-blue-200">
                  Renovação em Breve
                </h3>
                <p className="text-blue-700 dark:text-blue-300 text-sm mt-1">
                  Sua assinatura vence em {subscription.daysRemaining} dias. Renove agora para continuar 
                  utilizando todos os recursos do AgenteZap sem interrupções.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PIX Dialog */}
      <Dialog open={showPixDialog} onOpenChange={setShowPixDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Pagamento via PIX</DialogTitle>
            <DialogDescription className="text-center">
              Escaneie o QR Code ou copie o código para pagar
            </DialogDescription>
          </DialogHeader>
          
          {pixData && (
            <div className="space-y-4">
              {/* QR Code */}
              <div className="flex justify-center">
                {pixData.qrCodeBase64 && (
                  <img 
                    src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                    alt="QR Code PIX"
                    className="w-48 h-48 border rounded-lg"
                  />
                )}
              </div>
              
              {/* Amount */}
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Valor</p>
                <p className="text-2xl font-bold text-primary">
                  {formatCurrency(pixData.amount)}
                </p>
              </div>
              
              {/* Timer */}
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Expira em</p>
                <p className={`text-lg font-mono ${timeLeft === "Expirado" ? "text-red-500" : "text-yellow-600"}`}>
                  {timeLeft}
                </p>
              </div>
              
              {/* Copy Code Button */}
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => copyToClipboard(pixData.qrCode)}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copiar Código PIX
              </Button>
              
              {/* Open in App */}
              {pixData.ticketUrl && (
                <Button 
                  variant="ghost" 
                  className="w-full" 
                  onClick={() => window.open(pixData.ticketUrl, "_blank")}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir no App do Banco
                </Button>
              )}
              
              <p className="text-xs text-center text-muted-foreground">
                O pagamento será confirmado automaticamente em alguns segundos após a conclusão.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Plano Anual */}
      <Dialog open={showAnnualDialog} onOpenChange={setShowAnnualDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="w-5 h-5 text-green-600" />
              Pagar Plano Anual
            </DialogTitle>
            <DialogDescription>
              Economize {annualDiscountPercent}% pagando 12 meses de uma vez!
            </DialogDescription>
          </DialogHeader>
          
          {plan && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">Plano Atual</span>
                  <span className="font-medium">{plan.nome}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">Valor Mensal</span>
                  <span className="font-medium">
                    {subscription?.couponPrice 
                      ? formatCurrency(parseFloat(subscription.couponPrice))
                      : formatCurrency(parseFloat(plan.valor))}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">12 meses (sem desconto)</span>
                  <span className="font-medium line-through text-gray-400">
                    {formatCurrency(
                      (subscription?.couponPrice 
                        ? parseFloat(subscription.couponPrice) 
                        : parseFloat(plan.valor)) * 12
                    )}
                  </span>
                </div>
                <div className="border-t border-green-200 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-green-700">Total com {annualDiscountPercent}% OFF</span>
                    <span className="text-xl font-bold text-green-600">
                      {formatCurrency(
                        (subscription?.couponPrice 
                          ? parseFloat(subscription.couponPrice) 
                          : parseFloat(plan.valor)) * 12 * (1 - annualDiscountPercent / 100)
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-green-600 mt-1">
                    Você economiza {formatCurrency(
                      (subscription?.couponPrice 
                        ? parseFloat(subscription.couponPrice) 
                        : parseFloat(plan.valor)) * 12 * (annualDiscountPercent / 100)
                    )}!
                  </p>
                </div>
              </div>
              
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                {/* Se tem cartão cadastrado, mostrar opção de cobrar no cartão */}
                {subscription?.mpSubscriptionId && subscription?.cardLastFourDigits && (
                  <Button 
                    className="w-full bg-purple-600 hover:bg-purple-700"
                    onClick={() => chargeAnnualCardMutation.mutate({ 
                      subscriptionId: subscription.id, 
                      discountPercent: annualDiscountPercent 
                    })}
                    disabled={chargeAnnualCardMutation.isPending}
                  >
                    {chargeAnnualCardMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CreditCard className="w-4 h-4 mr-2" />
                    )}
                    Cobrar no Cartão •••• {subscription.cardLastFourDigits}
                  </Button>
                )}
                
                {/* Opção de PIX sempre disponível */}
                <Button 
                  className={`w-full ${subscription?.mpSubscriptionId ? 'bg-green-500 hover:bg-green-600' : 'bg-green-600 hover:bg-green-700'}`}
                  onClick={() => generateAnnualPixMutation.mutate({ 
                    subscriptionId: subscription!.id, 
                    discountPercent: annualDiscountPercent 
                  })}
                  disabled={generateAnnualPixMutation.isPending}
                >
                  {generateAnnualPixMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <QrCode className="w-4 h-4 mr-2" />
                  )}
                  Pagar Anual com PIX
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setShowAnnualDialog(false)}
                >
                  Cancelar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Dialog para cadastrar cartão (clientes PIX manual) */}
      <Dialog open={showPaymentMethodDialog} onOpenChange={setShowPaymentMethodDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-purple-600" />
              Cadastrar Cartão para Cobrança Automática
            </DialogTitle>
            <DialogDescription>
              Com o cartão cadastrado, suas mensalidades serão cobradas automaticamente no dia do vencimento.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-purple-600 mt-0.5" />
                <div>
                  <p className="font-medium text-purple-800 dark:text-purple-200">Vantagens</p>
                  <ul className="text-sm text-purple-700 dark:text-purple-300 mt-1 space-y-1">
                    <li>• Cobrança automática no vencimento</li>
                    <li>• Sem risco de esquecer de pagar</li>
                    <li>• Sua assinatura nunca será interrompida</li>
                    <li>• Você pode cancelar a qualquer momento</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button 
                className="w-full bg-purple-600 hover:bg-purple-700"
                onClick={() => {
                  setShowPaymentMethodDialog(false);
                  setLocation("/plans?action=upgrade-card");
                }}
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Cadastrar Cartão Agora
              </Button>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => setShowPaymentMethodDialog(false)}
              >
                Continuar com PIX
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
