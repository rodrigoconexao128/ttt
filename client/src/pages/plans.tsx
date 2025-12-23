import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Check, Loader2, Shield, Zap, Lock, ArrowRight, Crown, Headphones, TrendingUp, Clock, AlertTriangle, Sparkles } from "lucide-react";
import type { Plan, Subscription } from "@shared/schema";
import { useState } from "react";

export default function PlansPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const { data: plans, isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const { data: currentSubscription, isLoading: subscriptionLoading } = useQuery<(Subscription & { plan: Plan }) | null>({
    queryKey: ["/api/subscriptions/current"],
  });

  const createSubscriptionMutation = useMutation<Subscription, Error, string>({
    mutationFn: async (planId: string) => {
      const response = await apiRequest("POST", "/api/subscriptions/create", { planId });
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
  
  // Detectar qual plano está ativo
  const activePlanType = currentSubscription?.plan?.tipo || 
    (currentSubscription?.plan?.periodicidade === "mensal" ? "padrao" : null);

  // Função para verificar se este card é o plano ativo
  const isPlanActive = (tipo: string) => {
    if (!hasActiveSubscription || !currentSubscription?.plan) return false;
    
    // Normalizar tipos para comparação
    const currentType = activePlanType || "padrao";
    
    if (tipo === "mensal") return currentType === "padrao" || currentType === "mensal";
    if (tipo === "anual") return currentType === "anual";
    if (tipo === "implementacao") return currentType === "implementacao";
    
    return false;
  };

  const handleSelectPlan = (tipo: string) => {
    const backendPlan = plans?.find(p => {
      if (tipo === "mensal") return p.tipo === "padrao" || (!p.tipo && p.periodicidade === "mensal");
      if (tipo === "anual") return p.tipo === "anual";
      if (tipo === "implementacao") return p.tipo === "implementacao";
      return false;
    });

    if (backendPlan) {
      setSelectedPlan(tipo);
      createSubscriptionMutation.mutate(backendPlan.id);
    } else if (plans && plans.length > 0) {
      setSelectedPlan(tipo);
      createSubscriptionMutation.mutate(plans[0].id);
    } else {
      toast({
        title: "Plano não disponível",
        description: "Entre em contato com o suporte",
        variant: "destructive"
      });
    }
  };

  // Texto do botão baseado no estado
  const getButtonConfig = (tipo: string) => {
    const isActive = isPlanActive(tipo);
    const isCurrentMensal = isPlanActive("mensal");
    
    if (isActive) {
      return { text: "Seu Plano Atual", disabled: true, variant: "outline" as const, className: "bg-green-50 border-green-300 text-green-700 dark:bg-green-950 dark:border-green-700 dark:text-green-300" };
    }
    
    if (hasActiveSubscription) {
      // Usuário tem plano ativo, mostrar opção de upgrade/migrar
      if (tipo === "anual" && isCurrentMensal) {
        return { text: "Upgrade → Economize 5%", disabled: false, variant: "default" as const, className: "bg-green-500 hover:bg-green-600" };
      }
      if (tipo === "implementacao") {
        return { text: "Contratar Implementação", disabled: false, variant: "default" as const, className: "bg-purple-500 hover:bg-purple-600" };
      }
      return { text: "Migrar para este Plano", disabled: false, variant: "default" as const, className: "" };
    }
    
    // Sem plano ativo
    if (tipo === "anual") {
      return { text: "Garantir Preço por 1 Ano", disabled: false, variant: "default" as const, className: "bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/25" };
    }
    if (tipo === "implementacao") {
      return { text: "Começar com Suporte VIP", disabled: false, variant: "default" as const, className: "bg-purple-500 hover:bg-purple-600 shadow-lg shadow-purple-500/25" };
    }
    return { text: "Começar Agora", disabled: false, variant: "default" as const, className: "" };
  };

  return (
    <div className="flex-1 overflow-auto bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-10 space-y-8">
        
        {/* Header - Compacto e focado */}
        <div className="text-center space-y-3">
          <h1 className="text-2xl md:text-4xl font-bold text-gray-900 dark:text-white" data-testid="text-plans-title">
            Escolha seu plano
          </h1>
          <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
            IA que atende como humano, 24/7 no WhatsApp
          </p>
        </div>

        {/* Alerta de urgência - Gatilho mental */}
        <div className="flex items-center justify-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg max-w-xl mx-auto">
          <TrendingUp className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200 text-center">
            <span className="font-semibold">Preços podem subir a qualquer momento.</span>{" "}
            <span className="hidden sm:inline">Garanta o valor atual.</span>
          </p>
        </div>

        {/* Cards de Planos - Grid responsivo */}
        <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-3">
          
          {/* PLANO MENSAL */}
          <Card className={`relative flex flex-col border transition-all duration-300 hover:shadow-lg ${
            isPlanActive("mensal") 
              ? "border-green-400 bg-green-50/50 dark:bg-green-950/20" 
              : "border-gray-200 dark:border-gray-700"
          }`}>
            {isPlanActive("mensal") && (
              <div className="absolute -top-3 left-4">
                <Badge className="bg-green-500 text-white text-xs px-2 py-0.5">
                  <Check className="w-3 h-3 mr-1" />
                  ATIVO
                </Badge>
              </div>
            )}
            
            <CardHeader className="text-center pb-2 pt-6">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                <Zap className="w-6 h-6 text-blue-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Mensal</h3>
              <p className="text-sm text-gray-500">Flexibilidade total</p>
              
              <div className="mt-4">
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">R$ 99</span>
                  <span className="text-gray-500">/mês</span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex-1 pt-4">
              <ul className="space-y-2.5">
                {[
                  "IA atendendo 24/7",
                  "Conversas ilimitadas",
                  "1 agente IA personalizado",
                  "Suporte via WhatsApp",
                  "Cancele quando quiser"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter className="pt-4">
              <Button
                className={`w-full h-11 font-medium ${getButtonConfig("mensal").className}`}
                variant={getButtonConfig("mensal").variant}
                onClick={() => handleSelectPlan("mensal")}
                disabled={getButtonConfig("mensal").disabled || createSubscriptionMutation.isPending}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "mensal" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {!getButtonConfig("mensal").disabled && <ArrowRight className="mr-2 h-4 w-4" />}
                    {getButtonConfig("mensal").text}
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* PLANO ANUAL - DESTAQUE */}
          <Card className={`relative flex flex-col border-2 transition-all duration-300 hover:shadow-xl md:scale-105 ${
            isPlanActive("anual") 
              ? "border-green-400 bg-green-50/50 dark:bg-green-950/20" 
              : "border-green-500 dark:border-green-400 shadow-lg shadow-green-500/10"
          }`}>
            {/* Badge superior */}
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
              <Badge className={`px-3 py-1 text-xs font-bold shadow-md ${
                isPlanActive("anual") 
                  ? "bg-green-500 text-white" 
                  : "bg-gradient-to-r from-green-500 to-emerald-500 text-white"
              }`}>
                {isPlanActive("anual") ? (
                  <><Check className="w-3 h-3 mr-1" /> ATIVO</>
                ) : (
                  <><Sparkles className="w-3 h-3 mr-1" /> MAIS ESCOLHIDO</>
                )}
              </Badge>
            </div>
            
            <CardHeader className="text-center pb-2 pt-6">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                <Shield className="w-6 h-6 text-green-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Anual</h3>
              <p className="text-sm text-green-600 font-medium">Preço travado por 12 meses</p>
              
              <div className="mt-4">
                <div className="text-sm text-gray-400 line-through">R$ 99/mês</div>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-3xl md:text-4xl font-bold text-green-600">R$ 94,05</span>
                  <span className="text-gray-500">/mês</span>
                </div>
                <Badge className="mt-2 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs">
                  5% OFF + Preço Garantido
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="flex-1 pt-4">
              <ul className="space-y-2.5">
                {[
                  "Tudo do plano mensal",
                  "Preço CONGELADO por 1 ano",
                  "Economia de R$ 59,40/ano",
                  "Prioridade no suporte",
                  "Proteção contra reajustes"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className={i === 1 || i === 4 ? "font-medium text-green-700 dark:text-green-300" : ""}>{feature}</span>
                  </li>
                ))}
              </ul>
              
              {/* Destaque visual - Gatilho de escassez */}
              <div className="mt-4 p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-gray-700 dark:text-gray-300">
                    <span className="font-semibold block mb-1">Proteção de Preço:</span>
                    Garanta este valor por 1 ano. Se o plano mensal subir, você não paga nada a mais.
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-4">
              <Button
                className={`w-full h-11 font-semibold text-white ${getButtonConfig("anual").className}`}
                onClick={() => handleSelectPlan("anual")}
                disabled={getButtonConfig("anual").disabled || createSubscriptionMutation.isPending}
                variant={getButtonConfig("anual").disabled ? "outline" : "default"}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "anual" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {!getButtonConfig("anual").disabled && <Shield className="mr-2 h-4 w-4" />}
                    {getButtonConfig("anual").text}
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* PLANO IMPLEMENTAÇÃO */}
          <Card className={`relative flex flex-col border-2 transition-all duration-300 hover:shadow-lg ${
            isPlanActive("implementacao") 
              ? "border-green-400 bg-green-50/50 dark:bg-green-950/20" 
              : "border-purple-400 dark:border-purple-500"
          }`}>
            {isPlanActive("implementacao") ? (
              <div className="absolute -top-3 left-4">
                <Badge className="bg-green-500 text-white text-xs px-2 py-0.5">
                  <Check className="w-3 h-3 mr-1" />
                  ATIVO
                </Badge>
              </div>
            ) : (
              <div className="absolute -top-3 left-4">
                <Badge className="bg-purple-500 text-white text-xs px-2 py-0.5">
                  DONE FOR YOU
                </Badge>
              </div>
            )}
            
            <CardHeader className="text-center pb-2 pt-6">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                <Crown className="w-6 h-6 text-purple-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Implementação</h3>
              <p className="text-sm text-purple-600 font-medium">Fazemos tudo por você</p>
              
              <div className="mt-4">
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-3xl md:text-4xl font-bold text-purple-600">R$ 700</span>
                  <span className="text-gray-500 text-sm">1° mês</span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex-1 pt-4">
              <ul className="space-y-2.5">
                {[
                  "Configuração completa da IA",
                  "Personalização para seu negócio",
                  "30 dias de acompanhamento",
                  "Ajustes ilimitados",
                  "Reuniões semanais"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <Check className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              
              {/* Destaque: Após 1° mês */}
              <div className="mt-4 p-3 bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-950/50 dark:to-violet-950/50 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="flex items-center justify-center gap-2">
                  <Clock className="w-4 h-4 text-purple-500" />
                  <div className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                    Já no próximo mês: <span className="text-lg">R$ 99/mês</span>
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-4">
              <Button
                className={`w-full h-11 font-medium text-white ${getButtonConfig("implementacao").className}`}
                onClick={() => handleSelectPlan("implementacao")}
                disabled={getButtonConfig("implementacao").disabled || createSubscriptionMutation.isPending}
                variant={getButtonConfig("implementacao").disabled ? "outline" : "default"}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "implementacao" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {!getButtonConfig("implementacao").disabled && <Crown className="mr-2 h-4 w-4" />}
                    {getButtonConfig("implementacao").text}
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Garantias - Compacto para mobile */}
        <div className="grid grid-cols-3 gap-2 md:gap-4 mt-8">
          <div className="flex flex-col items-center text-center p-3 md:p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-2">
              <Shield className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
            </div>
            <h4 className="font-semibold text-xs md:text-sm text-gray-900 dark:text-white">7 dias</h4>
            <p className="text-[10px] md:text-xs text-gray-500 hidden md:block">Garantia total</p>
          </div>

          <div className="flex flex-col items-center text-center p-3 md:p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mb-2">
              <Lock className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
            </div>
            <h4 className="font-semibold text-xs md:text-sm text-gray-900 dark:text-white">PIX Seguro</h4>
            <p className="text-[10px] md:text-xs text-gray-500 hidden md:block">Pagamento instantâneo</p>
          </div>

          <div className="flex flex-col items-center text-center p-3 md:p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center mb-2">
              <Headphones className="w-5 h-5 md:w-6 md:h-6 text-purple-600" />
            </div>
            <h4 className="font-semibold text-xs md:text-sm text-gray-900 dark:text-white">Suporte</h4>
            <p className="text-[10px] md:text-xs text-gray-500 hidden md:block">Via WhatsApp</p>
          </div>
        </div>

        {/* Sem planos */}
        {(!plans || plans.length === 0) && (
          <div className="text-center py-12">
            <p className="text-gray-500">Nenhum plano disponível. Entre em contato com o suporte.</p>
          </div>
        )}
      </div>
    </div>
  );
}

