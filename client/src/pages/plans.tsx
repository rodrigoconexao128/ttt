import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Check, Loader2, Shield, Zap, Crown, ChevronDown, ChevronUp, Tag, Key, Copy, Clock, Sparkles, Star, Gift, Calendar, CreditCard } from "lucide-react";
import type { Plan, Subscription } from "@shared/schema";
import { useState, useEffect, useRef } from "react";
import { QrCode, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { SubscribeModal } from "@/components/subscribe-modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api";

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE: Página de Plano de Revenda com QR Code PIX e Upload de Comprovante
// ═══════════════════════════════════════════════════════════════════════════════
interface ResellerPlanPageProps {
  resellerPlan: {
    isResellerClient: boolean;
    status?: string;
    reseller?: {
      companyName: string;
      supportEmail?: string;
      supportPhone?: string;
      pixKey?: string;
      pixKeyType?: string;
      pixHolderName?: string;
      pixBankName?: string;
    };
    plan?: {
      name: string;
      price: string;
      features: string[];
    };
  };
  createResellerSubscriptionMutation: any;
  setSelectedPlan: (plan: string) => void;
  setPendingSubscriptionId: (id: string | null) => void;
  setSubscribeModalOpen: (open: boolean) => void;
}

function ResellerPlanPage({ 
  resellerPlan, 
  createResellerSubscriptionMutation, 
  setSelectedPlan,
  setPendingSubscriptionId,
  setSubscribeModalOpen
}: ResellerPlanPageProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [loadingPix, setLoadingPix] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [pendingSubscription, setPendingSubscription] = useState<any>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  // Criar assinatura e gerar PIX
  const handleActivatePlan = async () => {
    setSelectedPlan("reseller");
    
    try {
      // Criar assinatura via API
      const response = await apiClient.post('/api/reseller-client/subscription/create', {});
      const subscription = response.data;
      setPendingSubscription(subscription);
      setPendingSubscriptionId(subscription.id);
      
      // Gerar QR Code PIX
      await generatePixForSubscription(subscription.id);
    } catch (error: any) {
      toast({
        title: "Erro ao criar assinatura",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive"
      });
    }
  };

  // Gerar QR Code PIX via API
  const generatePixForSubscription = async (subscriptionId: string) => {
    setLoadingPix(true);
    try {
      const response = await apiClient.post('/api/payments/generate-pix', { subscriptionId });
      const data = response.data;
      
      setPixQrCode(data.pixQrCode);
      setPixCode(data.pixCode);
    } catch (error: any) {
      console.error("Erro ao gerar PIX:", error);
      toast({
        title: "Erro ao gerar QR Code",
        description: error.message || "Tente copiar a chave PIX manualmente",
        variant: "destructive"
      });
    } finally {
      setLoadingPix(false);
    }
  };

  // Upload de comprovante
  const handleReceiptUpload = async () => {
    if (!receiptFile || !pendingSubscription) {
      toast({ title: "Erro", description: "Selecione um arquivo", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("receipt", receiptFile);
      formData.append("subscriptionId", pendingSubscription.id);
      formData.append("paymentId", `manual_${pendingSubscription.id}`);
      formData.append("amount", resellerPlan.plan?.price || "0");

      const response = await fetch("/api/payment-receipts/upload", {
        method: "POST",
        body: formData,
        credentials: "include"
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      setUploadSuccess(true);
      toast({
        title: "Comprovante enviado!",
        description: "Seu acesso foi liberado. Aguarde a confirmação do administrador."
      });

      setTimeout(() => {
        setShowUploadModal(false);
        setLocation("/my-subscription");
      }, 2000);
    } catch (error: any) {
      toast({
        title: "Erro ao enviar",
        description: error.message || "Tente novamente",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const copyPixCode = () => {
    if (pixCode) {
      navigator.clipboard.writeText(pixCode);
      toast({ title: "Código PIX copiado!" });
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-white dark:bg-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-12">
        <div className="text-center mb-8">
          <Badge className="mb-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-0">
            Plano Exclusivo
          </Badge>
          <h1 className="text-xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">
            {resellerPlan.reseller?.companyName || "Seu Revendedor"}
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Assine agora e tenha acesso completo à plataforma
          </p>
        </div>

        <Card className="border-2 border-purple-500/50 shadow-lg">
          <CardHeader className="text-center pb-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Crown className="h-6 w-6 text-purple-500" />
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {resellerPlan.plan?.name}
              </h2>
            </div>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-4xl font-bold text-purple-600">
                R$ {Number(resellerPlan.plan?.price || 0).toFixed(2).replace('.', ',')}
              </span>
              <span className="text-gray-500">/mês</span>
            </div>
          </CardHeader>
          
          <CardContent className="pt-0">
            <div className="space-y-3 py-4">
              {resellerPlan.plan?.features.map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span className="text-gray-600 dark:text-gray-300">{feature}</span>
                </div>
              ))}
            </div>
            
            {/* Seção de Pagamento PIX */}
            {resellerPlan.reseller?.pixKey && (
              <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
                {!pixQrCode && !loadingPix && (
                  <div className="text-center">
                    <p className="text-lg font-bold text-yellow-800 dark:text-yellow-200 mb-2">
                      💰 Pague via PIX
                    </p>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-4">
                      Clique abaixo para gerar o QR Code
                    </p>
                    <Button 
                      onClick={handleActivatePlan}
                      className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                      disabled={createResellerSubscriptionMutation.isPending}
                    >
                      {createResellerSubscriptionMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <QrCode className="h-4 w-4 mr-2" />
                      )}
                      Gerar QR Code PIX
                    </Button>
                  </div>
                )}

                {loadingPix && (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-yellow-600" />
                    <p className="mt-2 text-sm text-yellow-700">Gerando QR Code...</p>
                  </div>
                )}

                {pixQrCode && !loadingPix && (
                  <div className="text-center space-y-4">
                    <p className="text-lg font-bold text-yellow-800 dark:text-yellow-200">
                      📱 Escaneie para pagar
                    </p>
                    
                    {/* QR Code */}
                    <div className="flex justify-center">
                      <img 
                        src={pixQrCode} 
                        alt="QR Code PIX" 
                        className="w-48 h-48 rounded-lg border-2 border-yellow-300"
                      />
                    </div>

                    {/* Valor */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-3">
                      <p className="text-sm text-gray-500">Valor</p>
                      <p className="text-2xl font-bold text-purple-600">
                        R$ {Number(resellerPlan.plan?.price || 0).toFixed(2).replace('.', ',')}
                      </p>
                    </div>

                    {/* Copia e Cola */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-left">
                      <p className="text-xs font-medium text-gray-500 mb-1">Pix Copia e Cola</p>
                      <code className="block text-[10px] leading-relaxed font-mono text-gray-800 break-all bg-gray-100 dark:bg-gray-700 p-2 rounded">
                        {pixCode}
                      </code>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full mt-2"
                        onClick={copyPixCode}
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copiar Código
                      </Button>
                    </div>

                    {/* Dados bancários */}
                    <div className="space-y-2 text-left">
                      {resellerPlan.reseller.pixHolderName && (
                        <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded p-2 text-sm">
                          <span className="text-gray-500">Titular:</span>
                          <span className="font-medium">{resellerPlan.reseller.pixHolderName}</span>
                        </div>
                      )}
                      {resellerPlan.reseller.pixBankName && (
                        <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded p-2 text-sm">
                          <span className="text-gray-500">Banco:</span>
                          <span className="font-medium">{resellerPlan.reseller.pixBankName}</span>
                        </div>
                      )}
                    </div>

                    {/* Botão "Já paguei" */}
                    <Button 
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => setShowUploadModal(true)}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Já paguei? Enviar comprovante
                    </Button>

                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      Após o pagamento, clique em "Já paguei" para enviar o comprovante
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
          
          <CardFooter className="flex flex-col gap-4">
            {/* Informações de contato do revendedor */}
            {(resellerPlan.reseller?.supportEmail || resellerPlan.reseller?.supportPhone) && (
              <div className="text-center text-sm text-gray-500">
                <p>Dúvidas? Entre em contato:</p>
                {resellerPlan.reseller?.supportEmail && (
                  <p className="font-medium">{resellerPlan.reseller.supportEmail}</p>
                )}
                {resellerPlan.reseller?.supportPhone && (
                  <p className="font-medium">{resellerPlan.reseller.supportPhone}</p>
                )}
              </div>
            )}
          </CardFooter>
        </Card>
      </div>

      {/* Modal de Upload de Comprovante */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar Comprovante PIX</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {uploadSuccess ? (
              <div className="text-center py-4">
                <Check className="h-12 w-12 text-green-500 mx-auto mb-2" />
                <p className="text-lg font-medium text-green-700">Comprovante enviado!</p>
                <p className="text-sm text-gray-500">Seu acesso foi liberado.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  Envie o comprovante de pagamento para liberarmos seu acesso.
                </p>

                <div 
                  onClick={() => receiptInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-purple-500 transition-colors"
                >
                  <input
                    ref={receiptInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  {receiptFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <Check className="h-8 w-8 text-green-500" />
                      <span className="text-sm font-medium">{receiptFile.name}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-gray-400" />
                      <span className="text-sm text-gray-500">Clique para selecionar</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowUploadModal(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleReceiptUpload}
                    disabled={!receiptFile || isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Enviar
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Componente de Cronômetro de Escassez
function ScarcityTimer({ onExpire, className }: { onExpire?: () => void; className?: string }) {
  const [timeLeft, setTimeLeft] = useState(() => {
    // Recuperar tempo restante do localStorage ou iniciar com 10 minutos
    const saved = localStorage.getItem("scarcity_timer_end");
    if (saved) {
      const remaining = Math.max(0, parseInt(saved) - Date.now());
      return Math.floor(remaining / 1000);
    }
    // Novo timer de 10 minutos
    const endTime = Date.now() + 10 * 60 * 1000;
    localStorage.setItem("scarcity_timer_end", endTime.toString());
    return 10 * 60;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Reiniciar timer
          const endTime = Date.now() + 10 * 60 * 1000;
          localStorage.setItem("scarcity_timer_end", endTime.toString());
          onExpire?.();
          return 10 * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onExpire]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className={cn("flex items-center gap-2 text-emerald-600 dark:text-emerald-400", className)}>
      <Clock className="h-4 w-4 animate-pulse" />
      <span className="font-mono font-bold">
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </span>
    </div>
  );
}

interface CouponValidation {
  valid: boolean;
  finalPrice?: string;
  discountType?: string;
  code?: string;
  applicablePlans?: string[] | null;
}

interface CustomPlanValidation {
  valid: boolean;
  plan?: Plan & { valorPrimeiraCobranca?: string };
  message?: string;
}

// Interface para plano de revenda
interface ResellerPlan {
  isResellerClient: boolean;
  reseller?: {
    companyName: string;
    supportEmail?: string;
    supportPhone?: string;
    pixKey?: string;
    pixKeyType?: string;
    pixHolderName?: string;
    pixBankName?: string;
  };
  plan?: {
    name: string;
    price: string;
    features: string[];
  };
}

export default function PlansPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidation | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  
  // Estado para controlar quando o usuário quer ver outros planos além do atribuído
  const [showAllPlans, setShowAllPlans] = useState(false);
  
  // Estado para plano personalizado
  const [customPlanCode, setCustomPlanCode] = useState("");
  const [customPlan, setCustomPlan] = useState<CustomPlanValidation | null>(null);
  const [isValidatingCustomPlan, setIsValidatingCustomPlan] = useState(false);

  // Estado para modal de subscribe
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
  const [pendingSubscriptionId, setPendingSubscriptionId] = useState<string | null>(null);

  // Verificar se é cliente de revenda
  const { data: resellerPlan, isLoading: resellerPlanLoading } = useQuery<ResellerPlan>({
    queryKey: ["/api/user/reseller-plan"],
  });

  // Verificar se tem plano atribuído via link
  const { data: assignedPlanData, isLoading: assignedPlanLoading } = useQuery<{
    hasAssignedPlan: boolean;
    plan?: Plan & { valorPrimeiraCobranca?: string };
  }>({
    queryKey: ["/api/user/assigned-plan"],
  });

  const { data: plans, isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const { data: currentSubscription, isLoading: subscriptionLoading } = useQuery<(Subscription & { plan: Plan }) | null>({
    queryKey: ["/api/subscriptions/current"],
  });

  const validateCoupon = async () => {
    if (!couponCode.trim()) {
      toast({ title: "Digite um código de cupom", variant: "destructive" });
      return;
    }
    
    setIsValidatingCoupon(true);
    try {
      const response = await apiRequest("POST", "/api/coupons/validate", { code: couponCode.trim() });
      const data = await response.json();
      
      if (data.valid) {
        setAppliedCoupon(data);
        toast({ 
          title: "Cupom aplicado com sucesso!", 
          description: `Preço especial: R$ ${Number(data.finalPrice).toFixed(2).replace('.', ',')}/mês` 
        });
      } else {
        toast({ title: data.message || "Cupom inválido", variant: "destructive" });
        setAppliedCoupon(null);
      }
    } catch (error: any) {
      const errorData = await error?.response?.json?.() || {};
      toast({ title: errorData.message || "Cupom inválido", variant: "destructive" });
      setAppliedCoupon(null);
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
  };

  // Validação de código de plano personalizado
  const validateCustomPlanCode = async () => {
    if (!customPlanCode.trim()) {
      toast({ title: "Digite o código do seu plano personalizado", variant: "destructive" });
      return;
    }
    
    setIsValidatingCustomPlan(true);
    try {
      const response = await apiRequest("POST", "/api/plans/validate-code", { code: customPlanCode.trim() });
      const data = await response.json();
      
      if (data.valid) {
        setCustomPlan(data);
        toast({ 
          title: "Plano personalizado encontrado!", 
          description: `${data.plan.nome} - R$ ${Number(data.plan.valor).toFixed(2).replace('.', ',')}/mês` 
        });
      } else {
        toast({ title: data.message || "Código não encontrado", variant: "destructive" });
        setCustomPlan(null);
      }
    } catch (error: any) {
      const errorData = await error?.response?.json?.() || {};
      toast({ title: errorData.message || "Código inválido", variant: "destructive" });
      setCustomPlan(null);
    } finally {
      setIsValidatingCustomPlan(false);
    }
  };

  const removeCustomPlan = () => {
    setCustomPlan(null);
    setCustomPlanCode("");
    // Se tinha um plano atribuído via link, mostrar todos os planos agora
    if (assignedPlanData?.hasAssignedPlan) {
      setShowAllPlans(true);
    }
  };

  // Auto-preencher customPlan quando usuário tem plano atribuído via link
  // Mas NÃO preencher se o usuário optou por ver outros planos
  useEffect(() => {
    if (assignedPlanData?.hasAssignedPlan && assignedPlanData?.plan && !customPlan && !showAllPlans) {
      setCustomPlan({
        valid: true,
        plan: assignedPlanData.plan
      });
    }
  }, [assignedPlanData, customPlan, showAllPlans]);

  const handleSelectCustomPlan = () => {
    if (customPlan?.plan) {
      setSelectedPlan("personalizado");
      createSubscriptionMutation.mutate({ planId: customPlan.plan.id });
    }
  };

  const createSubscriptionMutation = useMutation<Subscription, Error, { planId: string; couponCode?: string }>({
    mutationFn: async ({ planId, couponCode }) => {
      const response = await apiRequest("POST", "/api/subscriptions/create", { planId, couponCode });
      const data = await response.json();
      return data as Subscription;
    },
    onSuccess: (data: Subscription) => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions/current"] });
      toast({ title: "Assinatura criada! Agora realize o pagamento." });
      // Abrir modal ao invés de redirecionar
      setPendingSubscriptionId(data.id);
      setSubscribeModalOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar assinatura",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation específica para clientes de revenda
  const createResellerSubscriptionMutation = useMutation<Subscription, Error, void>({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/reseller-client/subscription/create", {});
      const data = await response.json();
      return data as Subscription;
    },
    onSuccess: (data: Subscription) => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions/current"] });
      toast({ title: "Assinatura criada! Agora realize o pagamento." });
      setPendingSubscriptionId(data.id);
      setSubscribeModalOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar assinatura",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (plansLoading || subscriptionLoading || resellerPlanLoading || assignedPlanLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-green-500" />
      </div>
    );
  }

  const hasActiveSubscription = currentSubscription?.status === "active";
  
  // Para clientes de revenda: verificar se tem status ativo no resellerPlan
  const isResellerClientActive = resellerPlan?.isResellerClient && resellerPlan.status === 'active';
  
  // Detectar qual plano está ativo baseado no tipo
  const activePlanTipo = currentSubscription?.plan?.tipo;
  const activePlanValor = currentSubscription?.plan?.valor ? Number(currentSubscription.plan.valor) : 0;
  const isCurrentMensal = hasActiveSubscription && (activePlanTipo === "padrao" || activePlanTipo === "mensal");
  const isCurrentAnual = hasActiveSubscription && activePlanTipo === "anual";
  const isCurrentImplementacao = hasActiveSubscription && activePlanTipo === "implementacao";
  const isCurrentImplementacaoMensal = hasActiveSubscription && activePlanTipo === "implementacao_mensal";
  // Detectar se está no plano promo mensal (valor <= 50) - para mostrar opção de upgrade para promo anual
  const isCurrentPromoMensal = hasActiveSubscription && activePlanValor <= 50 && activePlanValor > 0;

  // Função para verificar se este card é o plano ativo
  const isPlanActive = (tipo: string) => {
    if (!hasActiveSubscription) return false;
    if (tipo === "mensal" && isCurrentMensal) return true;
    if (tipo === "anual" && isCurrentAnual) return true;
    if (tipo === "implementacao" && isCurrentImplementacao) return true;
    if (tipo === "implementacao_mensal" && isCurrentImplementacaoMensal) return true;
    return false;
  };

  const showAssignedPlan = assignedPlanData?.hasAssignedPlan && assignedPlanData?.plan;
  // Mostra o plano mensal + anual quando:
  // 1. Não tem plano atribuído via link E
  // 2. Não está em modo "ver todos os planos"
  const showMensalAndAnual = !showAssignedPlan && !showAllPlans;
  const showCouponSection = false;

  // Preço a exibir (com ou sem cupom)
  const getDisplayPrice = () => {
    if (appliedCoupon?.finalPrice) {
      return Number(appliedCoupon.finalPrice).toFixed(2).replace('.', ',');
    }
    return "99,99";
  };

  const handleSelectPlan = (tipo: string) => {
    const backendPlan = plans?.find(p => {
      // Para o plano mensal, buscar especificamente "Plano Mensal" por nome para evitar conflito com outros planos do tipo "padrao"
      if (tipo === "mensal") return p.nome === "Plano Mensal" || (p.tipo === "padrao" && p.valor === "99.99");
      if (tipo === "anual") return p.tipo === "anual" || p.nome === "Plano Anual + Setup";
      if (tipo === "implementacao") return p.tipo === "implementacao";
      if (tipo === "implementacao_mensal") return p.tipo === "implementacao_mensal";
      return false;
    });

    if (backendPlan) {
      setSelectedPlan(tipo);
      // Pass coupon code if applied and applicable to this plan
      const couponCode = appliedCoupon?.code && 
        (!appliedCoupon.applicablePlans || appliedCoupon.applicablePlans.length === 0 || appliedCoupon.applicablePlans.includes(tipo))
        ? appliedCoupon.code
        : undefined;
      createSubscriptionMutation.mutate({ planId: backendPlan.id, couponCode });
    } else if (plans && plans.length > 0) {
      setSelectedPlan(tipo);
      createSubscriptionMutation.mutate({ planId: plans[0].id, couponCode: appliedCoupon?.code });
    } else {
      toast({
        title: "Plano não disponível",
        description: "Entre em contato com o suporte",
        variant: "destructive"
      });
    }
  };

  // Configuração do botão baseado no estado
  const getButtonConfig = (tipo: string) => {
    const isActive = isPlanActive(tipo);
    
    if (isActive) {
      return { 
        text: "Seu plano atual", 
        disabled: true, 
        className: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 cursor-default hover:bg-gray-100 dark:hover:bg-gray-800" 
      };
    }
    
    if (hasActiveSubscription) {
      if (tipo === "implementacao" || tipo === "implementacao_mensal") {
        return { 
          text: "Contratar Implementação", 
          disabled: false, 
          className: "bg-purple-600 hover:bg-purple-700 text-white" 
        };
      }
      if (tipo === "anual") {
        return { text: "Upgrade para Anual", disabled: false, className: "bg-primary text-primary-foreground hover:bg-primary/90" };
      }
      return { text: "Migrar para este plano", disabled: false, className: "bg-blue-600 hover:bg-blue-700 text-white" };
    }
    
    if (tipo === "mensal") {
      return { text: appliedCoupon ? `Assinar por R$ ${getDisplayPrice()}` : "Assinar Mensal", disabled: false, className: "bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 text-white" };
    }
    if (tipo === "anual") {
      return { text: "Assinar Anual + Setup", disabled: false, className: "bg-primary text-primary-foreground hover:bg-primary/90" };
    }
    if (tipo === "implementacao" || tipo === "implementacao_mensal") {
      return { text: "Contratar Implementação", disabled: false, className: "bg-purple-600 hover:bg-purple-700 text-white" };
    }
    return { text: "Assinar", disabled: false, className: "bg-blue-600 hover:bg-blue-700 text-white" };
  };

  const faqItems = [
    {
      question: "Como funciona o período de teste?",
      answer: "Você pode testar o sistema por 7 dias com garantia total. Se não ficar satisfeito, devolvemos 100% do valor sem perguntas."
    },
    {
      question: "Posso cancelar a qualquer momento?",
      answer: "Sim! Não há fidelidade. Você pode cancelar quando quiser diretamente pelo painel, sem burocracia."
    },
    {
      question: "O que está incluso em todos os planos?",
      answer: "Todos os planos incluem: IA atendendo 24/7, conversas ilimitadas, 1 agente personalizado, suporte via WhatsApp e atualizações gratuitas."
    },
    {
      question: "O que é a Implementação Completa?",
      answer: "É um serviço onde nossa equipe configura toda a IA para você: personaliza o agente, treina com suas informações e acompanha por 30 dias com reuniões semanais. Após o primeiro mês, continua apenas R$ 99,99/mês."
    },
    {
      question: "Preciso ter conhecimento técnico?",
      answer: "Não! O sistema é simples e intuitivo. E se tiver qualquer dúvida, nosso suporte está disponível via WhatsApp."
    },
    {
      question: "Como funciona o pagamento?",
      answer: "Pagamento via PIX, instantâneo e seguro. O acesso é liberado imediatamente após a confirmação."
    }
  ].filter(item => showCouponSection || item.question !== "Como funciona o cupom de desconto?");

  // Se é cliente de revenda, sempre mostrar plano da revenda (com ou sem assinatura tradicional)
  if (resellerPlan?.isResellerClient && resellerPlan.plan) {
    return (
      <ResellerPlanPage 
        resellerPlan={resellerPlan}
        createResellerSubscriptionMutation={createResellerSubscriptionMutation}
        setSelectedPlan={setSelectedPlan}
        setPendingSubscriptionId={setPendingSubscriptionId}
        setSubscribeModalOpen={setSubscribeModalOpen}
      />
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-white dark:bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 py-6 md:py-12">
        
        <div className="text-center mb-6 md:mb-8">
          <h1 className="text-xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-1 md:mb-2">
            {hasActiveSubscription ? "Faça upgrade do seu plano" : "Escolha seu plano"}
          </h1>
          {hasActiveSubscription && (
            <p className="text-xs md:text-base text-gray-500 dark:text-gray-400">
              Você está no plano <span className="font-medium text-gray-900 dark:text-white">{currentSubscription?.plan?.nome}</span>
            </p>
          )}
        </div>

        {showCouponSection && (
          <div className="max-w-sm mx-auto mb-8">
            {appliedCoupon ? (
              <div className="relative bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40 rounded-2xl p-4 border border-green-200/60 dark:border-green-700/40 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                      <Check className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">Cupom aplicado</p>
                      <p className="font-bold text-gray-900 dark:text-white text-lg tracking-wide">{appliedCoupon.code}</p>
                    </div>
                  </div>
                  <button 
                    onClick={removeCoupon}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors p-2"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-3 pt-3 border-t border-green-200/50 dark:border-green-700/30">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Novo valor mensal:</span>
                    <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                      R$ {getDisplayPrice()}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <details className="group">
                <summary className="cursor-pointer flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors py-2 select-none">
                  <Tag className="w-4 h-4" />
                  <span>Tem um cupom de desconto?</span>
                  <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="mt-4 animate-in slide-in-from-top-2 duration-200">
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="Digite o código"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      className="h-11 rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 focus:border-green-500 focus:ring-green-500/20 uppercase font-medium text-center tracking-widest transition-all"
                      onKeyDown={(e) => e.key === 'Enter' && validateCoupon()}
                    />
                    <Button 
                      onClick={validateCoupon}
                      disabled={isValidatingCoupon || !couponCode.trim()}
                      className="h-11 px-6 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                    >
                      {isValidatingCoupon ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Aplicar"
                      )}
                    </Button>
                  </div>
                </div>
              </details>
            )}
          </div>
        )}

        {/* Seção de Plano Personalizado ou Campo de Busca - SEMPRE VISÍVEL */}
        <div className="max-w-sm mx-auto mb-8">
          <details className="group" open={customPlan?.valid ? false : undefined}>
            <summary className="cursor-pointer flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors py-2 select-none">
              <Key className="w-4 h-4" />
              <span>Tem um código de plano exclusivo?</span>
              <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-4 animate-in slide-in-from-top-2 duration-200">
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Digite o código do plano"
                  value={customPlanCode}
                  onChange={(e) => setCustomPlanCode(e.target.value.toUpperCase())}
                  className="h-11 rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 focus:border-purple-500 focus:ring-purple-500/20 uppercase font-medium text-center tracking-widest transition-all"
                  onKeyDown={(e) => e.key === 'Enter' && validateCustomPlanCode()}
                />
                <Button 
                  onClick={validateCustomPlanCode}
                  disabled={isValidatingCustomPlan || !customPlanCode.trim()}
                  className="h-11 px-6 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                >
                  {isValidatingCustomPlan ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Buscar"
                  )}
                </Button>
              </div>
            </div>
          </details>
        </div>

        {/* Plano Personalizado - Layout lado a lado quando tem anual */}
        {customPlan?.valid && customPlan.plan && (
          (() => {
            const isAssignedPlan = showAssignedPlan && assignedPlanData?.plan?.id === customPlan.plan.id;
            const hasPromoAnual = isAssignedPlan && Number(customPlan.plan.valor) <= 50;
            return (
          <div className={cn(
            "mb-12",
            hasPromoAnual 
              ? "grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto" 
              : "max-w-md mx-auto"
          )}>
            <Card className={cn(
              "relative flex flex-col border rounded-2xl transition-all duration-200 hover:shadow-md",
              "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
            )}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="px-3 py-1 text-xs font-semibold rounded-full shadow-sm bg-gray-900 text-white">
                  {isAssignedPlan ? "Oferta exclusiva" : "Plano personalizado"}
                </Badge>
              </div>
              
              <CardHeader className="pb-4 pt-8 px-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{customPlan.plan.nome}</h3>
                  <button 
                    onClick={removeCustomPlan}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors p-2"
                    title="Remover plano"
                  >
                    ✕
                  </button>
                </div>
                
                {customPlan.plan.valorPrimeiraCobranca && (
                  <div className="mb-3 p-3 rounded-lg border bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-800">
                    <p className="text-xs mb-1 text-gray-600 dark:text-gray-400">1ª cobrança (implementação)</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm text-gray-500 font-medium">R$</span>
                      <span className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                        {Number(customPlan.plan.valorPrimeiraCobranca).toFixed(2).replace('.', ',').split(',')[0]}
                      </span>
                      <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
                        ,{Number(customPlan.plan.valorPrimeiraCobranca).toFixed(2).split('.')[1]}
                      </span>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-baseline gap-1">
                  <span className="text-sm text-gray-500 font-medium">R$</span>
                  <span className="text-5xl font-bold tracking-tight text-gray-900 dark:text-white">
                    {Number(customPlan.plan.valor).toFixed(2).replace('.', ',').split(',')[0]}
                  </span>
                  <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                    ,{Number(customPlan.plan.valor).toFixed(2).split('.')[1]}
                  </span>
                  <span className="text-gray-500 text-sm font-medium">/mês</span>
                  </div>
                  {isAssignedPlan && (
                    <ScarcityTimer className="text-xs md:text-sm text-gray-500" />
                  )}
                </div>
                
                <p className="text-sm font-medium mt-3 text-gray-500">
                  {isAssignedPlan ? "Oferta exclusiva do seu link" : "Plano configurado para você"}
                </p>
              </CardHeader>

              <CardContent className="flex-1 px-6 pb-4">
                <Button
                  className="w-full h-12 rounded-xl font-semibold text-base shadow-sm transition-all hover:scale-[1.02] bg-gray-900 hover:bg-gray-800 text-white mb-5"
                  onClick={handleSelectCustomPlan}
                  disabled={createSubscriptionMutation.isPending}
                >
                  {createSubscriptionMutation.isPending && selectedPlan === "personalizado" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Assinar Plano Mensal"
                  )}
                </Button>
                <ul className="space-y-4">
                  {(customPlan.plan.features && Array.isArray(customPlan.plan.features) && customPlan.plan.features.length > 0
                    ? customPlan.plan.features
                    : [
                        "IA atendendo 24/7",
                        "Conversas ilimitadas",
                        "1 agente IA personalizado",
                        "Suporte via WhatsApp",
                        "Atualizações gratuitas",
                        "Cancele quando quiser"
                      ]
                  ).map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                      <div className="mt-0.5 p-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
                        <Check className="w-3 h-3 flex-shrink-0 text-gray-600 dark:text-gray-400" />
                      </div>
                      <span className="font-medium">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Card do Plano Anual Promo - Mostra quando é plano promo de R$ 49,99 */}
            {isAssignedPlan && Number(customPlan.plan.valor) <= 50 && (
              <Card className="relative flex flex-col border rounded-2xl transition-all duration-200 hover:shadow-md border-primary/30 bg-white dark:bg-gray-900 hover:border-primary/50">
                <div className="absolute -top-3 left-6 flex items-center gap-2">
                  <Badge className="px-3 py-1 text-xs font-semibold rounded-full shadow-sm bg-primary/10 text-primary border border-primary/20">
                    Recomendado
                  </Badge>
                </div>
                
                <CardHeader className="pb-4 pt-8 px-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 rounded-xl bg-primary/10">
                      <Gift className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Anual + Setup</h3>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs flex items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        12x no cartão de crédito
                      </Badge>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm text-gray-500 font-medium">R$</span>
                      <span className="text-5xl font-bold text-primary tracking-tight">599</span>
                      <span className="text-xl font-bold text-primary">,88</span>
                      <span className="text-gray-500 text-sm font-medium">/ano</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/20">
                    <p className="text-sm text-primary font-semibold flex items-center gap-2">
                      <Star className="w-4 h-4 text-primary" />
                      Setup Inicial incluído no plano
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                      Nossa equipe configura toda a IA para você
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 px-6 pb-4">
                  <Button
                    className="w-full h-12 rounded-xl font-semibold text-base shadow-sm transition-all hover:scale-[1.02] bg-primary text-primary-foreground hover:bg-primary/90 mb-5"
                    onClick={() => {
                      const promoAnualPlan = plans?.find(p => p.tipo === "promo_anual" || p.nome === "Plano Promo Ilimitado Anual");
                      if (promoAnualPlan) {
                        setSelectedPlan("promo_anual");
                        createSubscriptionMutation.mutate({ planId: promoAnualPlan.id });
                      }
                    }}
                    disabled={createSubscriptionMutation.isPending}
                  >
                    {createSubscriptionMutation.isPending && selectedPlan === "promo_anual" ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : hasActiveSubscription ? (
                      "Upgrade para Anual"
                    ) : (
                      "Assinar Anual + Setup"
                    )}
                  </Button>
                  <ul className="space-y-3">
                    {[
                      "Setup Inicial por um profissional",
                      "IA configurada e pronta para uso",
                      "Agente de IA ilimitado 24h",
                      "Atendimento WhatsApp ilimitado",
                      "Cardápios e catálogos visuais",
                      "Suporte prioritário",
                      "Notificador Inteligente"
                    ].map((feature, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <div className="mt-0.5 p-0.5 rounded-full bg-primary/10">
                          <Check className="w-3 h-3 text-primary flex-shrink-0" />
                        </div>
                        <span className="font-medium">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
            );
          })()
        )}

        {/* Mostra os planos padrão quando não tem plano personalizado OU quando showAllPlans está ativo */}
        {(!customPlan?.valid || showAllPlans) && (
          <>
            {/* Mobile: Cards empilhados estilo Shopify */}
            <div className="space-y-3 md:hidden mb-8">
          
          {/* PLANO MENSAL - Mobile Card */}
          <div 
            className={cn(
              "border rounded-2xl p-4 transition-all",
              isPlanActive("mensal") 
                ? "border-primary bg-primary/5" 
                : "border-gray-200 dark:border-gray-800"
            )}
            onClick={() => !isPlanActive("mensal") && handleSelectPlan("mensal")}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Mensal Ilimitado</h3>
                  {isPlanActive("mensal") && (
                    <Badge variant="outline" className="text-[10px] border-gray-300">
                      Seu plano atual
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-2">Flexibilidade total para seu negócio</p>
              </div>
              <div className="text-right">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">R$ 99,99</span>
                </div>
                <span className="text-xs text-gray-500">/mês</span>
              </div>
            </div>
            {!isPlanActive("mensal") && (
              <Button
                className="w-full mt-4 h-11 rounded-xl font-semibold bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800"
                onClick={(e) => { e.stopPropagation(); handleSelectPlan("mensal"); }}
                disabled={createSubscriptionMutation.isPending}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "mensal" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Assinar Mensal"
                )}
              </Button>
            )}
            <ul className="mt-3 space-y-1.5">
              {["IA atendendo 24/7", "Conversas ilimitadas", "Cancele quando quiser"].map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <Check className="w-3.5 h-3.5 text-gray-500" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* PLANO ANUAL + SETUP - Mobile Card (sempre visível) */}
          <div 
            className={cn(
              "relative border rounded-2xl p-4 transition-all",
              isPlanActive("anual") 
                ? "border-primary bg-primary/5" 
                : "border-primary/30 bg-white dark:bg-gray-900 hover:border-primary/50"
            )}
          >
            <div className="absolute -top-3 left-4">
              <Badge className="bg-primary/10 text-primary border border-primary/20 text-[10px] font-semibold px-3 py-1">
                Recomendado
              </Badge>
            </div>
            <div className="flex items-start justify-between mt-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Anual + Setup Grátis</h3>
                  {isPlanActive("anual") && (
                    <Badge variant="outline" className="text-[10px] border-amber-400">
                      Seu plano atual
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Gift className="w-4 h-4 text-primary" />
                  <p className="text-xs text-primary font-semibold">Setup inicial incluso</p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-2xl font-bold text-primary">R$ 1.199,88</span>
                </div>
                <span className="text-xs text-gray-500">/ano</span>
                <div className="mt-1">
                  <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] flex items-center gap-1">
                    <CreditCard className="w-2.5 h-2.5" />
                    12x no cartão de crédito
                  </Badge>
                </div>
              </div>
            </div>
            <div className="mt-3 p-2 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-xs text-primary font-medium text-center">
                <span className="font-bold">Setup Inicial incluído</span> — nossa equipe configura tudo para você
              </p>
            </div>
            {!isPlanActive("anual") && (
              <Button
                className="w-full mt-4 h-11 rounded-xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={(e) => { e.stopPropagation(); handleSelectPlan("anual"); }}
                disabled={createSubscriptionMutation.isPending}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "anual" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Gift className="w-4 h-4 mr-2" />
                    Assinar Anual + Setup
                  </>
                )}
              </Button>
            )}
            <ul className="mt-3 space-y-1.5">
              {["Profissional configura sua IA", "Você não precisa fazer nada", "Preço fixo por 12 meses"].map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <Check className="w-3.5 h-3.5 text-primary" />
                  <span className="font-medium">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* PLANO PROMO ANUAL - Mobile - Mostrar quando usuário está no promo mensal */}
          {isCurrentPromoMensal && (
            <div className="relative border rounded-2xl p-4 transition-all border-primary/30 bg-white dark:bg-gray-900 hover:border-primary/50">
              <Badge className="absolute -top-2.5 left-4 bg-primary/10 text-primary border border-primary/20 text-[10px] font-semibold px-2.5 py-0.5">
                Recomendado
              </Badge>
              <div className="flex items-start justify-between mt-1">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Gift className="w-4 h-4 text-primary" />
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">Anual + Setup</h3>
                  </div>
                  <p className="text-xs text-primary font-medium">Setup Inicial incluído no plano</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-primary">R$ 599,88</span>
                  <p className="text-[10px] text-gray-500">/ano</p>
                  <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] mt-1 flex items-center gap-1">
                    <CreditCard className="w-2.5 h-2.5" />
                    12x no cartão de crédito
                  </Badge>
                </div>
              </div>
              <div className="mt-3 p-2 bg-primary/5 rounded-lg border border-primary/20">
                <p className="text-xs text-primary font-medium text-center flex items-center justify-center gap-1">
                  <Star className="w-3 h-3" />
                  <span className="font-bold">Setup Inicial incluído</span> — nossa equipe configura tudo para você
                </p>
              </div>
              <Button
                className="w-full mt-4 h-11 rounded-xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  const promoAnualPlan = plans?.find(p => p.tipo === "promo_anual" || p.nome === "Plano Promo Ilimitado Anual");
                  if (promoAnualPlan) {
                    setSelectedPlan("promo_anual");
                    createSubscriptionMutation.mutate({ planId: promoAnualPlan.id });
                  }
                }}
                disabled={createSubscriptionMutation.isPending}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "promo_anual" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Gift className="w-4 h-4 mr-2" />
                    Upgrade para Anual
                  </>
                )}
              </Button>
              <ul className="mt-3 space-y-1.5">
                {["Setup Inicial por um profissional", "IA configurada e pronta para uso", "Economia de R$ 400 vs mensal"].map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <Check className="w-3.5 h-3.5 text-primary" />
                    <span className="font-medium">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!showMensalAndAnual && (
            <div 
              className={cn(
                "relative border rounded-2xl p-4 transition-all",
                isPlanActive("implementacao") 
                  ? "border-purple-400 bg-purple-50/50 dark:bg-purple-950/20" 
                  : "border-purple-200 dark:border-purple-800"
              )}
            >
              <Badge className="absolute -top-2.5 left-4 bg-purple-600 text-white text-[10px] font-semibold px-2.5 py-0.5">
                ✨ PERSONALIZADA
              </Badge>
              <div className="flex items-start justify-between mt-1">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Implementação</h3>
                  <p className="text-xs text-purple-700 dark:text-purple-400 font-medium">Nós configuramos tudo para você</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-purple-600">R$ 700</span>
                  <p className="text-[10px] text-gray-500">único</p>
                </div>
              </div>
              <div className="mt-3 p-2 bg-purple-50 dark:bg-purple-950/30 rounded-lg text-center border border-purple-100 dark:border-purple-800/50">
                <p className="text-xs text-purple-700 dark:text-purple-300">
                  Você receberá a IA <span className="font-bold">pronta e funcionando</span>
                </p>
              </div>
              {!isPlanActive("implementacao") && (
                <Button
                  className="w-full mt-3 h-11 rounded-xl font-semibold bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => handleSelectPlan("implementacao")}
                  disabled={createSubscriptionMutation.isPending}
                >
                  {createSubscriptionMutation.isPending && selectedPlan === "implementacao" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Contratar Implementação"
                  )}
                </Button>
              )}
              <ul className="mt-3 space-y-1.5">
                {["Configuração 100% personalizada", "30 dias de acompanhamento", "Reuniões semanais de ajuste"].map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <Check className="w-3.5 h-3.5 text-purple-600" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!showMensalAndAnual && (
            <div 
              className={cn(
                "relative border rounded-2xl p-4 transition-all mt-3",
                isPlanActive("implementacao_mensal") 
                  ? "border-purple-400 bg-purple-50/50 dark:bg-purple-950/20" 
                  : "border-purple-200 dark:border-purple-800"
              )}
            >
              <Badge className="absolute -top-2.5 left-4 bg-purple-600 text-white text-[10px] font-semibold px-2.5 py-0.5">
                NOVO
              </Badge>
              <div className="flex items-start justify-between mt-1">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Implementação Mensal</h3>
                  <p className="text-xs text-purple-700 dark:text-purple-400 font-medium">Diluído na mensalidade</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-purple-600">R$ 199,99</span>
                  <p className="text-[10px] text-gray-500">/mês</p>
                </div>
              </div>
              {!isPlanActive("implementacao_mensal") && (
                <Button
                  className="w-full mt-3 h-11 rounded-xl font-semibold bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => handleSelectPlan("implementacao_mensal")}
                  disabled={createSubscriptionMutation.isPending}
                >
                  {createSubscriptionMutation.isPending && selectedPlan === "implementacao_mensal" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Contratar Implementação"
                  )}
                </Button>
              )}
              <ul className="mt-3 space-y-1.5">
                {["Configuração completa da IA", "Personalização do agente", "Suporte prioritário"].map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <Check className="w-3.5 h-3.5 text-purple-600" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Desktop: Grid original */}
        <div className={cn(
          "hidden md:grid gap-4 md:gap-6 mb-12",
          showMensalAndAnual ? "grid-cols-1 md:grid-cols-2 max-w-4xl mx-auto" : "grid-cols-1 md:grid-cols-3"
        )}>
          
          {/* PLANO MENSAL */}
          <Card className={cn(
            "relative flex flex-col border rounded-2xl transition-all duration-200",
            isPlanActive("mensal") 
              ? "border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-900/50" 
              : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md"
          )}>
            <CardHeader className="pb-4 pt-6 px-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Mensal Ilimitado</h3>
                {isPlanActive("mensal") ? (
                  <Badge variant="outline" className="text-xs border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400">
                    Seu plano atual
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 font-medium">
                    Comece sem riscos
                  </Badge>
                )}
              </div>
              
              <div className="flex items-baseline gap-1">
                <span className="text-sm text-gray-500 font-medium">R$</span>
                <span className="text-5xl font-bold text-gray-900 dark:text-white tracking-tight">99</span>
                <span className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">,99</span>
                <span className="text-gray-500 text-sm font-medium">/mês</span>
              </div>
              
              <p className="text-sm text-gray-500 mt-3 font-medium">Flexibilidade total para seu negócio</p>
            </CardHeader>

            <CardContent className="flex-1 px-6 pb-4">
              <Button
                className={cn("w-full h-12 rounded-xl font-semibold text-base shadow-sm transition-all hover:scale-[1.02] mb-5", getButtonConfig("mensal").className)}
                onClick={() => handleSelectPlan("mensal")}
                disabled={getButtonConfig("mensal").disabled || createSubscriptionMutation.isPending}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "mensal" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  getButtonConfig("mensal").text
                )}
              </Button>
              <ul className="space-y-4">
                {[
                  "IA atendendo 24/7",
                  "Conversas ilimitadas",
                  "1 agente IA personalizado",
                  "Suporte via WhatsApp",
                  "Cancele quando quiser"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                    <div className="mt-0.5 p-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
                      <Check className="w-3 h-3 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                    </div>
                    <span className="font-medium">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* PLANO ANUAL + SETUP GRÁTIS - Desktop */}
          {showMensalAndAnual && (
            <Card className={cn(
              "relative flex flex-col border rounded-2xl transition-all duration-200",
              isPlanActive("anual") 
                ? "border-primary bg-primary/5" 
                : "border-primary/30 bg-white dark:bg-gray-900 hover:border-primary/50 hover:shadow-md"
            )}>
              <div className="absolute -top-3 left-6 flex items-center gap-2">
                <Badge className={cn(
                  "px-3 py-1 text-xs font-semibold rounded-full border",
                  isPlanActive("anual") 
                    ? "bg-primary/10 text-primary border-primary/20" 
                    : "bg-primary/10 text-primary border-primary/20"
                )}>
                  {isPlanActive("anual") ? "Seu plano atual" : "Recomendado"}
                </Badge>
              </div>
              
              <CardHeader className="pb-4 pt-8 px-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-xl bg-primary/10">
                    <Gift className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Anual + Setup</h3>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs flex items-center gap-1">
                      <CreditCard className="w-3 h-3" />
                      12x no cartão de crédito
                    </Badge>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm text-gray-500 font-medium">R$</span>
                    <span className="text-5xl font-bold text-primary tracking-tight">1.199</span>
                    <span className="text-xl font-bold text-primary">,88</span>
                    <span className="text-gray-500 text-sm font-medium">/ano</span>
                  </div>
                </div>
                
                <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/20">
                  <p className="text-sm text-primary font-semibold flex items-center gap-2">
                    <Star className="w-4 h-4 text-primary" />
                    Setup Inicial incluído no plano
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                    Nossa equipe configura toda a IA para você
                  </p>
                </div>
              </CardHeader>

              <CardContent className="flex-1 px-6 pb-4">
                <Button
                  className={cn("w-full h-12 rounded-xl font-semibold text-base shadow-sm transition-all hover:scale-[1.02] mb-5", getButtonConfig("anual").className)}
                  onClick={() => handleSelectPlan("anual")}
                  disabled={getButtonConfig("anual").disabled || createSubscriptionMutation.isPending}
                >
                  {createSubscriptionMutation.isPending && selectedPlan === "anual" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    getButtonConfig("anual").text
                  )}
                </Button>
                <ul className="space-y-3">
                  {[
                    "Setup Inicial por um profissional",
                    "IA configurada e pronta para uso",
                    "Agente de IA ilimitado 24h",
                    "Atendimento WhatsApp ilimitado",
                    "Cardápios e catálogos visuais",
                    "Suporte prioritário",
                    "Notificador Innteligente"
                  ].map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                      <div className="mt-0.5 p-0.5 rounded-full bg-primary/10">
                        <Check className="w-3 h-3 text-primary flex-shrink-0" />
                      </div>
                      <span className="font-medium">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* PLANO PROMO ANUAL - Desktop - Mostrar quando usuário está no promo mensal */}
          {isCurrentPromoMensal && (
            <Card className="relative flex flex-col border rounded-2xl transition-all duration-200 hover:shadow-md border-primary/30 bg-white dark:bg-gray-900 hover:border-primary/50">
              <div className="absolute -top-3 left-6 flex items-center gap-2">
                <Badge className="px-3 py-1 text-xs font-semibold rounded-full shadow-sm bg-primary/10 text-primary border border-primary/20">
                  Recomendado
                </Badge>
              </div>
              
              <CardHeader className="pb-4 pt-8 px-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-xl bg-primary/10">
                    <Gift className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Anual + Setup</h3>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs flex items-center gap-1">
                      <CreditCard className="w-3 h-3" />
                      12x no cartão de crédito
                    </Badge>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm text-gray-500 font-medium">R$</span>
                    <span className="text-5xl font-bold text-primary tracking-tight">599</span>
                    <span className="text-xl font-bold text-primary">,88</span>
                    <span className="text-gray-500 text-sm font-medium">/ano</span>
                  </div>
                </div>
                
                <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/20">
                  <p className="text-sm text-primary font-semibold flex items-center gap-2">
                    <Star className="w-4 h-4 text-primary" />
                    Setup Inicial incluído no plano
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                    Nossa equipe configura toda a IA para você
                  </p>
                </div>
              </CardHeader>

              <CardContent className="flex-1 px-6 pb-4">
                <Button
                  className="w-full h-12 rounded-xl font-semibold text-base shadow-sm transition-all hover:scale-[1.02] bg-primary text-primary-foreground hover:bg-primary/90 mb-5"
                  onClick={() => {
                    const promoAnualPlan = plans?.find(p => p.tipo === "promo_anual" || p.nome === "Plano Promo Ilimitado Anual");
                    if (promoAnualPlan) {
                      setSelectedPlan("promo_anual");
                      createSubscriptionMutation.mutate({ planId: promoAnualPlan.id });
                    }
                  }}
                  disabled={createSubscriptionMutation.isPending}
                >
                  {createSubscriptionMutation.isPending && selectedPlan === "promo_anual" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Calendar className="w-4 h-4 mr-2" />
                      Assinar Plano Anual Promo
                    </>
                  )}
                </Button>
                <ul className="space-y-3">
                  {[
                    "Setup Inicial por um profissional",
                    "IA configurada e pronta para uso",
                    "Agente de IA ilimitado 24h",
                    "Atendimento WhatsApp ilimitado",
                    "Cardápios e catálogos visuais",
                    "Suporte prioritário",
                    "Notificador Inteligente"
                  ].map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                      <div className="mt-0.5 p-0.5 rounded-full bg-primary/10">
                        <Check className="w-3 h-3 text-primary flex-shrink-0" />
                      </div>
                      <span className="font-medium">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {!showMensalAndAnual && (
          <>
          {/* PLANO IMPLEMENTAÇÃO */}
          <Card className={cn(
            "relative flex flex-col border rounded-2xl transition-all duration-200",
            isPlanActive("implementacao") 
              ? "border-purple-400 dark:border-purple-500 bg-purple-50/30 dark:bg-purple-950/20" 
              : "border-purple-200 dark:border-purple-800 hover:border-purple-400 dark:hover:border-purple-600 hover:shadow-md"
          )}>
            <div className="absolute -top-3 left-6">
              <Badge className={cn(
                "px-3 py-1 text-xs font-semibold rounded-full shadow-sm",
                isPlanActive("implementacao") 
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border border-purple-300" 
                  : "bg-purple-600 text-white"
              )}>
                {isPlanActive("implementacao") ? "Seu plano atual" : "✨ Personalizada para você"}
              </Badge>
            </div>
            
            <CardHeader className="pb-4 pt-8 px-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Implementação</h3>
              </div>
              
              <div className="flex items-baseline gap-1">
                <span className="text-sm text-gray-500 font-medium">R$</span>
                <span className="text-5xl font-bold text-purple-600 dark:text-purple-500 tracking-tight">700</span>
                <span className="text-gray-500 text-sm font-medium">único</span>
              </div>
              
              <p className="text-sm text-purple-700 dark:text-purple-400 font-medium mt-3">
                Nós configuramos tudo para você
              </p>
            </CardHeader>

            <CardContent className="flex-1 px-6 pb-4">
              <Button
                className={cn("w-full h-12 rounded-xl font-semibold text-base shadow-sm transition-all hover:scale-[1.02] mb-5", getButtonConfig("implementacao").className)}
                onClick={() => handleSelectPlan("implementacao")}
                disabled={getButtonConfig("implementacao").disabled || createSubscriptionMutation.isPending}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "implementacao" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  getButtonConfig("implementacao").text
                )}
              </Button>
              <ul className="space-y-4">
                {[
                  "Configuração 100% personalizada",
                  "Treinamento da IA com seus dados",
                  "30 dias de acompanhamento",
                  "Ajustes ilimitados",
                  "Reuniões semanais"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                    <div className="mt-0.5 p-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30">
                      <Check className="w-3 h-3 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                    </div>
                    <span className="font-medium">{feature}</span>
                  </li>
                ))}
              </ul>
              
              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-center text-gray-600 dark:text-gray-400">
                  Após configuração: <span className="font-bold text-gray-900 dark:text-white">R$ 99,99/mês</span>
                </p>
              </div>
            </CardContent>

          </Card>

          {/* PLANO IMPLEMENTAÇÃO MENSAL */}
          <Card className={cn(
            "relative flex flex-col border rounded-2xl transition-all duration-200",
            isPlanActive("implementacao_mensal") 
              ? "border-purple-400 dark:border-purple-500 bg-purple-50/30 dark:bg-purple-950/20" 
              : "border-purple-200 dark:border-purple-800 hover:border-purple-400 dark:hover:border-purple-600 hover:shadow-md"
          )}>
            <div className="absolute -top-3 left-6">
              <Badge className={cn(
                "px-3 py-1 text-xs font-semibold rounded-full shadow-sm",
                isPlanActive("implementacao_mensal") 
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border border-purple-300" 
                  : "bg-purple-600 text-white"
              )}>
                {isPlanActive("implementacao_mensal") ? "Seu plano atual" : "NOVO"}
              </Badge>
            </div>
            
            <CardHeader className="pb-4 pt-8 px-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Implementação Mensal</h3>
              </div>
              
              <div className="flex items-baseline gap-1">
                <span className="text-sm text-gray-500 font-medium">R$</span>
                <span className="text-5xl font-bold text-purple-600 dark:text-purple-500 tracking-tight">199</span>
                <span className="text-2xl font-bold text-purple-600 dark:text-purple-500 tracking-tight">,99</span>
                <span className="text-gray-500 text-sm font-medium">/mês</span>
              </div>
              
              <p className="text-sm text-purple-700 dark:text-purple-400 font-medium mt-3">
                Diluído na mensalidade
              </p>
            </CardHeader>

            <CardContent className="flex-1 px-6 pb-4">
              <Button
                className={cn("w-full h-12 rounded-xl font-semibold text-base shadow-sm transition-all hover:scale-[1.02] mb-5", getButtonConfig("implementacao_mensal").className)}
                onClick={() => handleSelectPlan("implementacao_mensal")}
                disabled={getButtonConfig("implementacao_mensal").disabled || createSubscriptionMutation.isPending}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "implementacao_mensal" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  getButtonConfig("implementacao_mensal").text
                )}
              </Button>
              <ul className="space-y-4">
                {[
                  "Configuração completa da IA",
                  "Personalização para seu negócio",
                  "Treinamento inicial",
                  "Suporte prioritário",
                  "Mensalidade fixa"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                    <div className="mt-0.5 p-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30">
                      <Check className="w-3 h-3 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                    </div>
                    <span className="font-medium">{feature}</span>
                  </li>
                ))}
              </ul>
              
              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-center text-gray-600 dark:text-gray-400">
                  Sem taxa de adesão alta
                </p>
              </div>
            </CardContent>

          </Card>
          </>
          )}
        </div>
          </>
        )}

        {/* Garantias */}
        <div className="flex flex-col md:flex-row flex-wrap justify-center gap-3 md:gap-12 py-4 md:py-6 border-t border-b border-gray-200 dark:border-gray-800 mb-8 md:mb-12">
          <div className="flex items-center justify-center gap-2 text-xs md:text-sm text-gray-600 dark:text-gray-400">
            <Shield className="w-4 h-4 text-green-600" />
            <span>7 dias de garantia</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs md:text-sm text-gray-600 dark:text-gray-400">
            <Zap className="w-4 h-4 text-blue-600" />
            <span>Pagamento seguro via PIX</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs md:text-sm text-gray-600 dark:text-gray-400">
            <Crown className="w-4 h-4 text-purple-600" />
            <span>Suporte via WhatsApp</span>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white text-center mb-6">
            Perguntas frequentes
          </h2>
          
          <div className="space-y-2">
            {faqItems.map((item, index) => (
              <div 
                key={index}
                className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => setFaqOpen(faqOpen === index ? null : index)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {item.question}
                  </span>
                  {faqOpen === index ? (
                    <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  )}
                </button>
                {faqOpen === index && (
                  <div className="px-4 pb-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {item.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {(!plans || plans.length === 0) && (
          <div className="text-center py-12">
            <p className="text-gray-500">Nenhum plano disponível. Entre em contato com o suporte.</p>
          </div>
        )}
      </div>

      {/* Modal de Subscribe - Estilo Shopify */}
      <SubscribeModal
        open={subscribeModalOpen}
        onOpenChange={setSubscribeModalOpen}
        subscriptionId={pendingSubscriptionId}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/subscriptions/current"] });
          setLocation("/my-subscription");
        }}
      />
    </div>
  );
}
