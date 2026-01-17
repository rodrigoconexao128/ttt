import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Check, Loader2, Shield, Zap, Crown, ChevronDown, ChevronUp, Tag, Key, Copy, Clock, Sparkles } from "lucide-react";
import type { Plan, Subscription } from "@shared/schema";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { SubscribeModal } from "@/components/subscribe-modal";

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
  };

  // Auto-preencher customPlan quando usuário tem plano atribuído via link
  useEffect(() => {
    if (assignedPlanData?.hasAssignedPlan && assignedPlanData?.plan && !customPlan) {
      setCustomPlan({
        valid: true,
        plan: assignedPlanData.plan
      });
    }
  }, [assignedPlanData, customPlan]);

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
  const isCurrentMensal = hasActiveSubscription && (activePlanTipo === "padrao" || activePlanTipo === "mensal");
  const isCurrentImplementacao = hasActiveSubscription && activePlanTipo === "implementacao";
  const isCurrentImplementacaoMensal = hasActiveSubscription && activePlanTipo === "implementacao_mensal";

  // Função para verificar se este card é o plano ativo
  const isPlanActive = (tipo: string) => {
    if (!hasActiveSubscription) return false;
    if (tipo === "mensal" && isCurrentMensal) return true;
    if (tipo === "implementacao" && isCurrentImplementacao) return true;
    if (tipo === "implementacao_mensal" && isCurrentImplementacaoMensal) return true;
    return false;
  };

  const showAssignedPlan = assignedPlanData?.hasAssignedPlan && assignedPlanData?.plan;
  const showOnlyMensal = !showAssignedPlan;
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
      return { text: "Migrar para este plano", disabled: false, className: "bg-blue-600 hover:bg-blue-700 text-white" };
    }
    
    if (tipo === "mensal") {
      return { text: appliedCoupon ? `Assinar por R$ ${getDisplayPrice()}` : "Assinar Mensal", disabled: false, className: "bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 text-white" };
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
                  {resellerPlan.plan.name}
                </h2>
              </div>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-4xl font-bold text-purple-600">
                  R$ {Number(resellerPlan.plan.price).toFixed(2).replace('.', ',')}
                </span>
                <span className="text-gray-500">/mês</span>
              </div>
            </CardHeader>
            
            <CardContent className="pt-0">
              <div className="space-y-3 py-4">
                {resellerPlan.plan.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span className="text-gray-600 dark:text-gray-300">{feature}</span>
                  </div>
                ))}
              </div>
              
              {/* Seção de Pagamento PIX */}
              {resellerPlan.reseller?.pixKey && (
                <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="text-center mb-4">
                    <p className="text-lg font-bold text-yellow-800 dark:text-yellow-200">
                      💰 Pague via PIX
                    </p>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      Faça o pagamento e envie o comprovante
                    </p>
                  </div>
                  
                  {/* Dados bancários */}
                  <div className="space-y-2">
                    {/* Titular */}
                    {resellerPlan.reseller.pixHolderName && (
                      <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-2">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">👤</span>
                          <span className="text-sm text-muted-foreground">Titular:</span>
                        </div>
                        <span className="font-medium text-sm">{resellerPlan.reseller.pixHolderName}</span>
                      </div>
                    )}
                    
                    {/* Banco */}
                    {resellerPlan.reseller.pixBankName && (
                      <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-2">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">🏦</span>
                          <span className="text-sm text-muted-foreground">Banco:</span>
                        </div>
                        <span className="font-medium text-sm">{resellerPlan.reseller.pixBankName}</span>
                      </div>
                    )}
                    
                    {/* Chave PIX */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">🔑</span>
                          <span className="text-sm text-muted-foreground">
                            PIX ({resellerPlan.reseller.pixKeyType?.toUpperCase()}):
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(resellerPlan.reseller!.pixKey!);
                            toast({ title: "✅ Chave PIX copiada!" });
                          }}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copiar
                        </Button>
                      </div>
                      <code className="block mt-2 text-center font-mono bg-gray-100 dark:bg-gray-700 px-3 py-2 rounded text-sm break-all">
                        {resellerPlan.reseller.pixKey}
                      </code>
                    </div>
                  </div>
                  
                  {/* Botão WhatsApp */}
                  {resellerPlan.reseller?.supportPhone && (
                    <div className="mt-4">
                      <Button
                        className="w-full"
                        style={{ 
                          backgroundColor: '#25D366',
                          color: 'white'
                        }}
                        onClick={() => {
                          const phone = resellerPlan.reseller?.supportPhone?.replace(/\D/g, '');
                          const message = encodeURIComponent(
                            `Olá! Fiz o pagamento de R$ ${Number(resellerPlan.plan!.price).toFixed(2).replace('.', ',')} via PIX para ativar minha assinatura. Segue o comprovante:`
                          );
                          window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
                        }}
                      >
                        📲 Enviar Comprovante via WhatsApp
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
            
            <CardFooter className="flex flex-col gap-4">
              <Button 
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
                size="lg"
                onClick={() => {
                  // Usar a rota específica para clientes de revenda
                  setSelectedPlan("reseller");
                  createResellerSubscriptionMutation.mutate();
                }}
                disabled={createResellerSubscriptionMutation.isPending}
              >
                {createResellerSubscriptionMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Ativar Plano
                  </>
                )}
              </Button>
              
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

        {/* Modal de subscribe */}
        <SubscribeModal
          isOpen={subscribeModalOpen}
          onClose={() => {
            setSubscribeModalOpen(false);
            setPendingSubscriptionId(null);
          }}
          subscriptionId={pendingSubscriptionId || ""}
        />
      </div>
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

        {/* Seção de Plano Personalizado ou Campo de Busca */}
        {!customPlan?.valid && (
          <div className="max-w-sm mx-auto mb-8">
            <details className="group">
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
        )}

        {/* Plano Personalizado - Centralizado */}
        {customPlan?.valid && customPlan.plan ? (
          (() => {
            const isAssignedPlan = showAssignedPlan && assignedPlanData?.plan?.id === customPlan.plan.id;
            return (
          <div className="max-w-md mx-auto mb-12">
            <Card className={cn(
              "relative flex flex-col border rounded-2xl transition-all duration-200 hover:shadow-md",
              isAssignedPlan
                ? "border-emerald-200 dark:border-emerald-800 hover:border-emerald-300 dark:hover:border-emerald-700"
                : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
            )}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className={cn(
                  "px-3 py-1 text-xs font-semibold rounded-full shadow-sm",
                  isAssignedPlan ? "bg-emerald-600 text-white" : "bg-gray-900 text-white"
                )}>
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
                  <div className={cn(
                    "mb-3 p-3 rounded-lg border",
                    isAssignedPlan
                      ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                      : "bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-800"
                  )}>
                    <p className={cn(
                      "text-xs mb-1",
                      isAssignedPlan ? "text-emerald-600 dark:text-emerald-400" : "text-gray-600 dark:text-gray-400"
                    )}>1ª cobrança (implementação)</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm text-gray-500 font-medium">R$</span>
                      <span className={cn(
                        "text-3xl font-bold tracking-tight",
                        isAssignedPlan ? "text-emerald-600 dark:text-emerald-500" : "text-gray-900 dark:text-white"
                      )}>
                        {Number(customPlan.plan.valorPrimeiraCobranca).toFixed(2).replace('.', ',').split(',')[0]}
                      </span>
                      <span className={cn(
                        "text-lg font-bold tracking-tight",
                        isAssignedPlan ? "text-emerald-600 dark:text-emerald-500" : "text-gray-900 dark:text-white"
                      )}>
                        ,{Number(customPlan.plan.valorPrimeiraCobranca).toFixed(2).split('.')[1]}
                      </span>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-baseline gap-1">
                  <span className="text-sm text-gray-500 font-medium">R$</span>
                  <span className={cn(
                    "text-5xl font-bold tracking-tight",
                    isAssignedPlan ? "text-emerald-600 dark:text-emerald-500" : "text-gray-900 dark:text-white"
                  )}>
                    {Number(customPlan.plan.valor).toFixed(2).replace('.', ',').split(',')[0]}
                  </span>
                  <span className={cn(
                    "text-2xl font-bold tracking-tight",
                    isAssignedPlan ? "text-emerald-600 dark:text-emerald-500" : "text-gray-900 dark:text-white"
                  )}>
                    ,{Number(customPlan.plan.valor).toFixed(2).split('.')[1]}
                  </span>
                  <span className="text-gray-500 text-sm font-medium">/mês</span>
                  </div>
                  {isAssignedPlan && (
                    <ScarcityTimer className="text-xs md:text-sm" />
                  )}
                </div>
                
                <p className={cn(
                  "text-sm font-medium mt-3",
                  isAssignedPlan ? "text-emerald-700 dark:text-emerald-400" : "text-gray-600 dark:text-gray-400"
                )}>
                  {isAssignedPlan ? "Oferta exclusiva do seu link" : "Plano configurado para você"}
                </p>
              </CardHeader>

              <CardContent className="flex-1 px-6 pb-4">
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
                      <div className={cn(
                        "mt-0.5 p-0.5 rounded-full",
                        isAssignedPlan ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-gray-100 dark:bg-gray-800/60"
                      )}>
                        <Check className={cn(
                          "w-3 h-3 flex-shrink-0",
                          isAssignedPlan ? "text-emerald-600 dark:text-emerald-400" : "text-gray-600 dark:text-gray-300"
                        )} />
                      </div>
                      <span className="font-medium">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="px-6 pb-8 pt-2">
                <Button
                  className={cn(
                    "w-full h-12 rounded-xl font-semibold text-base shadow-sm transition-all hover:scale-[1.02]",
                    isAssignedPlan ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-gray-900 hover:bg-gray-800 text-white"
                  )}
                  onClick={handleSelectCustomPlan}
                  disabled={createSubscriptionMutation.isPending}
                >
                  {createSubscriptionMutation.isPending && selectedPlan === "personalizado" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    isAssignedPlan ? "Assinar Plano Promo" : "Assinar Plano"
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>
            );
          })()
        ) : (
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
                  <span className="text-xs text-gray-500 line-through">R$ 149</span>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white ml-1">R$ 99,99</span>
                </div>
                <span className="text-xs text-gray-500">/mês</span>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5">
              {["IA atendendo 24/7", "Conversas ilimitadas", "Cancele quando quiser"].map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <Check className="w-3.5 h-3.5 text-gray-500" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            {!isPlanActive("mensal") && (
              <Button
                className="w-full mt-4 h-11 rounded-xl font-semibold bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800"
                onClick={(e) => { e.stopPropagation(); handleSelectPlan("mensal"); }}
                disabled={createSubscriptionMutation.isPending}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "mensal" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Selecionar Mensal"
                )}
              </Button>
            )}
          </div>

          {!showOnlyMensal && (
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
              <ul className="mt-3 space-y-1.5">
                {["Configuração 100% personalizada", "30 dias de acompanhamento", "Reuniões semanais de ajuste"].map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <Check className="w-3.5 h-3.5 text-purple-600" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
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
            </div>
          )}

          {!showOnlyMensal && (
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
              <ul className="mt-3 space-y-1.5">
                {["Configuração completa da IA", "Personalização do agente", "Suporte prioritário"].map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <Check className="w-3.5 h-3.5 text-purple-600" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
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
            </div>
          )}
        </div>

        {/* Desktop: Grid original */}
        <div className={cn(
          "hidden md:grid gap-4 md:gap-6 mb-12",
          showOnlyMensal ? "grid-cols-1 max-w-md mx-auto" : "grid-cols-1 md:grid-cols-3"
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

            <CardFooter className="px-6 pb-8 pt-2">
              <Button
                className={cn("w-full h-12 rounded-xl font-semibold text-base shadow-sm transition-all hover:scale-[1.02]", getButtonConfig("mensal").className)}
                onClick={() => handleSelectPlan("mensal")}
                disabled={getButtonConfig("mensal").disabled || createSubscriptionMutation.isPending}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "mensal" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  getButtonConfig("mensal").text
                )}
              </Button>
            </CardFooter>
          </Card>

          {!showOnlyMensal && (
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

            <CardFooter className="px-6 pb-8 pt-2">
              <Button
                className={cn("w-full h-12 rounded-xl font-semibold text-base shadow-sm transition-all hover:scale-[1.02]", getButtonConfig("implementacao").className)}
                onClick={() => handleSelectPlan("implementacao")}
                disabled={getButtonConfig("implementacao").disabled || createSubscriptionMutation.isPending}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "implementacao" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  getButtonConfig("implementacao").text
                )}
              </Button>
            </CardFooter>
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

            <CardFooter className="px-6 pb-8 pt-2">
              <Button
                className={cn("w-full h-12 rounded-xl font-semibold text-base shadow-sm transition-all hover:scale-[1.02]", getButtonConfig("implementacao_mensal").className)}
                onClick={() => handleSelectPlan("implementacao_mensal")}
                disabled={getButtonConfig("implementacao_mensal").disabled || createSubscriptionMutation.isPending}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "implementacao_mensal" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  getButtonConfig("implementacao_mensal").text
                )}
              </Button>
            </CardFooter>
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
