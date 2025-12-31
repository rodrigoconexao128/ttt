import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Check, Loader2, Shield, Zap, Crown, ChevronDown, ChevronUp, Tag } from "lucide-react";
import type { Plan, Subscription } from "@shared/schema";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface CouponValidation {
  valid: boolean;
  finalPrice?: string;
  discountType?: string;
  code?: string;
  applicablePlans?: string[] | null;
}

export default function PlansPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidation | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

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

  const createSubscriptionMutation = useMutation<Subscription, Error, { planId: string; couponCode?: string }>({
    mutationFn: async ({ planId, couponCode }) => {
      const response = await apiRequest("POST", "/api/subscriptions/create", { planId, couponCode });
      const data = await response.json();
      return data as Subscription;
    },
    onSuccess: (data: Subscription) => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions/current"] });
      toast({ title: "Assinatura criada! Agora realize o pagamento." });
      setLocation(`/subscribe/${data.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar assinatura",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (plansLoading || subscriptionLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-green-500" />
      </div>
    );
  }

  const hasActiveSubscription = currentSubscription?.status === "active";
  
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

  // Preço a exibir (com ou sem cupom)
  const getDisplayPrice = () => {
    if (appliedCoupon?.finalPrice) {
      return Number(appliedCoupon.finalPrice).toFixed(2).replace('.', ',');
    }
    return "99,99";
  };

  const handleSelectPlan = (tipo: string) => {
    const backendPlan = plans?.find(p => {
      if (tipo === "mensal") return p.tipo === "padrao" || (!p.tipo && p.periodicidade === "mensal");
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
      question: "Como funciona o cupom de desconto?",
      answer: "Se você tem um cupom promocional, digite no campo de cupom e clique em 'Aplicar'. O desconto será aplicado automaticamente no preço mensal."
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
  ];

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

        {/* Seção de Cupom de Desconto - Design Minimalista */}
        <div className="max-w-sm mx-auto mb-8">
          {appliedCoupon ? (
            /* Cupom Aplicado - Feedback Visual Claro */
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
            /* Campo de Cupom - Colapsável e Discreto */
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
                disabled={createSubscriptionMutation.isPending && selectedPlan === "mensal"}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "mensal" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Selecionar Mensal"
                )}
              </Button>
            )}
          </div>

          {/* PLANO IMPLEMENTAÇÃO - Mobile Card */}
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
                disabled={createSubscriptionMutation.isPending && selectedPlan === "implementacao"}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "implementacao" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Contratar Implementação"
                )}
              </Button>
            )}
          </div>

          {/* PLANO IMPLEMENTAÇÃO MENSAL - Mobile Card */}
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
                disabled={createSubscriptionMutation.isPending && selectedPlan === "implementacao_mensal"}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "implementacao_mensal" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Contratar Implementação"
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Desktop: Grid original */}
        <div className="hidden md:grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-3 mb-12">
          
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
        </div>

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
    </div>
  );
}
