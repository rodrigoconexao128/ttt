import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Check, Loader2, Shield, Zap, Crown, ChevronDown, ChevronUp } from "lucide-react";
import type { Plan, Subscription } from "@shared/schema";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function PlansPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

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
  
  // Detectar qual plano está ativo baseado no tipo
  const activePlanTipo = currentSubscription?.plan?.tipo;
  const isCurrentMensal = hasActiveSubscription && (activePlanTipo === "padrao" || activePlanTipo === "mensal");
  const isCurrentAnual = hasActiveSubscription && activePlanTipo === "anual";
  const isCurrentImplementacao = hasActiveSubscription && activePlanTipo === "implementacao";
  const isCurrentImplementacaoMensal = hasActiveSubscription && activePlanTipo === "implementacao_mensal";

  // Função para verificar se este card é o plano ativo
  const isPlanActive = (tipo: string) => {
    if (!hasActiveSubscription) return false;
    if (tipo === "mensal" && isCurrentMensal) return true;
    if (tipo === "anual" && isCurrentAnual) return true;
    if (tipo === "implementacao" && isCurrentImplementacao) return true;
    if (tipo === "implementacao_mensal" && isCurrentImplementacaoMensal) return true;
    return false;
  };

  const handleSelectPlan = (tipo: string) => {
    const backendPlan = plans?.find(p => {
      if (tipo === "mensal") return p.tipo === "padrao" || (!p.tipo && p.periodicidade === "mensal");
      if (tipo === "anual") return p.tipo === "anual";
      if (tipo === "implementacao") return p.tipo === "implementacao";
      if (tipo === "implementacao_mensal") return p.tipo === "implementacao_mensal";
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
      if (tipo === "anual" && isCurrentMensal) {
        return { 
          text: "Fazer upgrade para o Anual", 
          disabled: false, 
          className: "bg-green-600 hover:bg-green-700 text-white" 
        };
      }
      if (tipo === "mensal" && isCurrentAnual) {
        return { 
          text: "Você já tem plano superior", 
          disabled: true, 
          className: "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed hover:bg-gray-100" 
        };
      }
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
      return { text: "Assinar Mensal", disabled: false, className: "bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 text-white" };
    }
    if (tipo === "anual") {
      return { text: "Assinar Anual", disabled: false, className: "bg-green-600 hover:bg-green-700 text-white" };
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
      question: "Qual a diferença do plano Anual?",
      answer: "No plano anual você garante o preço atual por 12 meses. Isso significa que se o preço subir, você NÃO pagará a diferença, pois já fechou o valor anual. Além disso, economiza 5% (R$ 59,40 no ano)."
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
          <p className="text-xs md:text-base text-gray-500 dark:text-gray-400">
            {hasActiveSubscription ? (
              <>Você está no plano <span className="font-medium text-gray-900 dark:text-white">{currentSubscription?.plan?.nome}</span></>
            ) : (
              "Comece a usar por $ 1/mês durante 3 meses"
            )}
          </p>
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

          {/* PLANO ANUAL - Mobile Card (Destacado) */}
          <div 
            className={cn(
              "relative border-2 rounded-2xl p-4 transition-all",
              isPlanActive("anual") 
                ? "border-green-500 bg-green-50/50 dark:bg-green-950/20" 
                : "border-green-500 bg-green-50/30 dark:bg-green-950/10 shadow-lg"
            )}
          >
            <Badge className="absolute -top-2.5 left-4 bg-green-600 text-white text-[10px] font-bold px-2.5 py-0.5">
              MELHOR CUSTO-BENEFÍCIO
            </Badge>
            <div className="flex items-start justify-between mt-1">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Anual</h3>
                  <Badge className="bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0">
                    ECONOMIZE 5%
                  </Badge>
                </div>
                <p className="text-xs text-green-700 dark:text-green-400 font-medium flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Preço travado por 12 meses
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-xs text-gray-400 line-through">R$ 1.199</span>
                  <span className="text-2xl font-bold text-green-600 ml-1">R$ 1.128</span>
                </div>
                <span className="text-xs text-gray-500">/ano</span>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5">
              {["Tudo do plano mensal", "Preço GARANTIDO por 1 ano", "Imune a reajustes futuros"].map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <Check className="w-3.5 h-3.5 text-green-600" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            {!isPlanActive("anual") && (
              <Button
                className="w-full mt-4 h-11 rounded-xl font-bold bg-green-600 hover:bg-green-700 text-white"
                onClick={() => handleSelectPlan("anual")}
                disabled={createSubscriptionMutation.isPending && selectedPlan === "anual"}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "anual" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Selecionar Anual"
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
              ACELERE RESULTADOS
            </Badge>
            <div className="flex items-start justify-between mt-1">
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Implementação</h3>
                <p className="text-xs text-purple-700 dark:text-purple-400 font-medium">Nós configuramos tudo para você</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-purple-600">R$ 700</span>
                <p className="text-[10px] text-gray-500">1º mês</p>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5">
              {["Configuração completa da IA", "30 dias de acompanhamento", "Reuniões semanais"].map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <Check className="w-3.5 h-3.5 text-purple-600" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-center">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Após configuração: <span className="font-bold text-gray-900 dark:text-white">R$ 99,99/mês</span>
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
        <div className="hidden md:grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4 mb-12">
          
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

          {/* PLANO ANUAL */}
          <Card className={cn(
            "relative flex flex-col border-2 rounded-2xl transition-all duration-200 transform md:-translate-y-4 z-10",
            isPlanActive("anual") 
              ? "border-green-500 dark:border-green-500 bg-green-50/30 dark:bg-green-950/20" 
              : "border-green-500 dark:border-green-400 shadow-xl shadow-green-500/10 hover:shadow-2xl hover:shadow-green-500/20"
          )}>
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 w-full text-center">
              <Badge className={cn(
                "px-4 py-1.5 text-sm font-bold rounded-full shadow-sm uppercase tracking-wide",
                isPlanActive("anual") 
                  ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border border-green-300" 
                  : "bg-green-600 text-white border-2 border-white dark:border-gray-950"
              )}>
                {isPlanActive("anual") ? "Seu plano atual" : "Melhor Custo-Benefício"}
              </Badge>
            </div>
            
            <CardHeader className="pb-4 pt-10 px-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Anual</h3>
                {!isPlanActive("anual") && (
                  <Badge className="bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 text-xs font-bold px-2 py-1">
                    ECONOMIZE 5%
                  </Badge>
                )}
              </div>
              
              <div className="space-y-1">
                <div className="text-sm text-gray-400 line-through font-medium">R$ 1.199/ano</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm text-gray-500 font-medium">R$</span>
                  <span className="text-5xl font-bold text-green-600 dark:text-green-500 tracking-tight">1.128</span>
                  <span className="text-gray-500 text-sm font-medium">/ano</span>
                </div>
                <p className="text-xs text-gray-500 font-medium">(equivale a R$ 94,00/mês)</p>
              </div>
              
              <p className="text-sm text-green-700 dark:text-green-400 font-semibold mt-3 flex items-center gap-1.5">
                <Shield className="w-4 h-4" />
                Preço travado por 12 meses
              </p>
            </CardHeader>

            <CardContent className="flex-1 px-6 pb-4">
              <ul className="space-y-4">
                {[
                  { text: "Tudo do plano mensal", highlight: false },
                  { text: "Preço GARANTIDO por 1 ano", highlight: true },
                  { text: "Economia de R$ 59,40", highlight: false },
                  { text: "Imune a reajustes futuros", highlight: true },
                  { text: "Prioridade no suporte", highlight: true }
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                    <div className={cn(
                      "mt-0.5 p-0.5 rounded-full",
                      feature.highlight ? "bg-green-100 dark:bg-green-900/50" : "bg-gray-100 dark:bg-gray-800"
                    )}>
                      <Check className={cn(
                        "w-3 h-3 flex-shrink-0",
                        feature.highlight ? "text-green-600 dark:text-green-400" : "text-gray-600 dark:text-gray-400"
                      )} />
                    </div>
                    <span className={cn(
                      "font-medium",
                      feature.highlight ? "text-green-800 dark:text-green-300 font-semibold" : ""
                    )}>
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter className="px-6 pb-8 pt-2">
              <Button
                className={cn("w-full h-12 rounded-xl font-bold text-base shadow-md transition-all hover:scale-[1.02] hover:shadow-lg", getButtonConfig("anual").className)}
                onClick={() => handleSelectPlan("anual")}
                disabled={getButtonConfig("anual").disabled || createSubscriptionMutation.isPending}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "anual" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  getButtonConfig("anual").text
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
                {isPlanActive("implementacao") ? "Seu plano atual" : "Acelere seus resultados"}
              </Badge>
            </div>
            
            <CardHeader className="pb-4 pt-8 px-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Implementação</h3>
              </div>
              
              <div className="flex items-baseline gap-1">
                <span className="text-sm text-gray-500 font-medium">R$</span>
                <span className="text-5xl font-bold text-purple-600 dark:text-purple-500 tracking-tight">700</span>
                <span className="text-gray-500 text-sm font-medium">1º mês</span>
              </div>
              
              <p className="text-sm text-purple-700 dark:text-purple-400 font-medium mt-3">
                Nós configuramos tudo para você
              </p>
            </CardHeader>

            <CardContent className="flex-1 px-6 pb-4">
              <ul className="space-y-4">
                {[
                  "Configuração completa da IA",
                  "Personalização para seu negócio",
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
