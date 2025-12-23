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

  // Função para verificar se este card é o plano ativo
  const isPlanActive = (tipo: string) => {
    if (!hasActiveSubscription) return false;
    if (tipo === "mensal" && isCurrentMensal) return true;
    if (tipo === "anual" && isCurrentAnual) return true;
    if (tipo === "implementacao" && isCurrentImplementacao) return true;
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
      if (tipo === "implementacao") {
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
    if (tipo === "implementacao") {
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
      answer: "No plano anual você garante o preço atual por 12 meses. Mesmo que o preço aumente, você continua pagando o mesmo valor. Além disso, economiza 5% (R$ 59,40 no ano)."
    },
    {
      question: "O que é a Implementação Completa?",
      answer: "É um serviço onde nossa equipe configura toda a IA para você: personaliza o agente, treina com suas informações e acompanha por 30 dias com reuniões semanais. Após o primeiro mês, continua apenas R$ 99/mês."
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
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">
            {hasActiveSubscription ? "Faça upgrade do seu plano" : "Escolha seu plano"}
          </h1>
          {hasActiveSubscription && (
            <p className="text-gray-500 dark:text-gray-400">
              Você está no plano <span className="font-medium text-gray-900 dark:text-white">{currentSubscription?.plan?.nome}</span>
            </p>
          )}
        </div>

        <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-3 mb-12">
          
          {/* PLANO MENSAL */}
          <Card className={cn(
            "relative flex flex-col border rounded-2xl transition-all duration-200",
            isPlanActive("mensal") 
              ? "border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-900/50" 
              : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
          )}>
            <CardHeader className="pb-4 pt-6 px-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Mensal</h3>
                {isPlanActive("mensal") && (
                  <Badge variant="outline" className="text-xs border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400">
                    Seu plano atual
                  </Badge>
                )}
              </div>
              
              <div className="flex items-baseline gap-1">
                <span className="text-sm text-gray-500">R$</span>
                <span className="text-4xl font-bold text-gray-900 dark:text-white">99</span>
                <span className="text-gray-500 text-sm">/mês</span>
              </div>
              
              <p className="text-sm text-gray-500 mt-2">Flexibilidade total</p>
            </CardHeader>

            <CardContent className="flex-1 px-6 pb-4">
              <ul className="space-y-3">
                {[
                  "IA atendendo 24/7",
                  "Conversas ilimitadas",
                  "1 agente IA personalizado",
                  "Suporte via WhatsApp",
                  "Cancele quando quiser"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                    <Check className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter className="px-6 pb-6 pt-2">
              <Button
                className={cn("w-full h-11 rounded-lg font-medium", getButtonConfig("mensal").className)}
                onClick={() => handleSelectPlan("mensal")}
                disabled={getButtonConfig("mensal").disabled || createSubscriptionMutation.isPending}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "mensal" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  getButtonConfig("mensal").text
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* PLANO ANUAL */}
          <Card className={cn(
            "relative flex flex-col border-2 rounded-2xl transition-all duration-200",
            isPlanActive("anual") 
              ? "border-green-400 dark:border-green-500 bg-green-50/30 dark:bg-green-950/20" 
              : "border-green-500 dark:border-green-400 shadow-lg shadow-green-500/10"
          )}>
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <Badge className={cn(
                "px-3 py-1 text-xs font-semibold rounded-full",
                isPlanActive("anual") 
                  ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border border-green-300" 
                  : "bg-green-600 text-white"
              )}>
                {isPlanActive("anual") ? "Seu plano atual" : "Mais popular"}
              </Badge>
            </div>
            
            <CardHeader className="pb-4 pt-8 px-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Anual</h3>
                {!isPlanActive("anual") && (
                  <Badge className="bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 text-xs">
                    5% OFF
                  </Badge>
                )}
              </div>
              
              <div className="space-y-1">
                <div className="text-sm text-gray-400 line-through">R$ 1.188/ano</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm text-gray-500">R$</span>
                  <span className="text-4xl font-bold text-green-600 dark:text-green-500">1.128</span>
                  <span className="text-gray-500 text-sm">/ano</span>
                </div>
                <p className="text-xs text-gray-500">(equivale a R$ 94,05/mês)</p>
              </div>
              
              <p className="text-sm text-green-600 dark:text-green-400 font-medium mt-2">
                Preço travado por 12 meses
              </p>
            </CardHeader>

            <CardContent className="flex-1 px-6 pb-4">
              <ul className="space-y-3">
                {[
                  { text: "Tudo do plano mensal", highlight: false },
                  { text: "Preço GARANTIDO por 1 ano", highlight: true },
                  { text: "Economia de R$ 59,40", highlight: false },
                  { text: "Imune a reajustes futuros", highlight: true },
                  { text: "Prioridade no suporte", highlight: false }
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                    <Check className={cn(
                      "w-4 h-4 flex-shrink-0 mt-0.5",
                      feature.highlight ? "text-green-600" : "text-green-500"
                    )} />
                    <span className={feature.highlight ? "font-medium text-green-700 dark:text-green-400" : ""}>
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter className="px-6 pb-6 pt-2">
              <Button
                className={cn("w-full h-11 rounded-lg font-medium", getButtonConfig("anual").className)}
                onClick={() => handleSelectPlan("anual")}
                disabled={getButtonConfig("anual").disabled || createSubscriptionMutation.isPending}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "anual" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  getButtonConfig("anual").text
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* PLANO IMPLEMENTAÇÃO */}
          <Card className={cn(
            "relative flex flex-col border-2 rounded-2xl transition-all duration-200",
            isPlanActive("implementacao") 
              ? "border-purple-400 dark:border-purple-500 bg-purple-50/30 dark:bg-purple-950/20" 
              : "border-purple-400 dark:border-purple-500"
          )}>
            <div className="absolute -top-3 left-4">
              <Badge className={cn(
                "px-3 py-1 text-xs font-semibold rounded-full",
                isPlanActive("implementacao") 
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border border-purple-300" 
                  : "bg-purple-600 text-white"
              )}>
                {isPlanActive("implementacao") ? "Seu plano atual" : "Done for you"}
              </Badge>
            </div>
            
            <CardHeader className="pb-4 pt-8 px-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Implementação</h3>
              </div>
              
              <div className="flex items-baseline gap-1">
                <span className="text-sm text-gray-500">R$</span>
                <span className="text-4xl font-bold text-purple-600 dark:text-purple-500">700</span>
                <span className="text-gray-500 text-sm">1º mês</span>
              </div>
              
              <p className="text-sm text-purple-600 dark:text-purple-400 font-medium mt-2">
                Fazemos tudo por você
              </p>
            </CardHeader>

            <CardContent className="flex-1 px-6 pb-4">
              <ul className="space-y-3">
                {[
                  "Configuração completa da IA",
                  "Personalização para seu negócio",
                  "30 dias de acompanhamento",
                  "Ajustes ilimitados",
                  "Reuniões semanais"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                    <Check className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-center text-gray-600 dark:text-gray-400">
                  Após configuração: <span className="font-semibold text-gray-900 dark:text-white">R$ 99/mês</span>
                </p>
              </div>
            </CardContent>

            <CardFooter className="px-6 pb-6 pt-2">
              <Button
                className={cn("w-full h-11 rounded-lg font-medium", getButtonConfig("implementacao").className)}
                onClick={() => handleSelectPlan("implementacao")}
                disabled={getButtonConfig("implementacao").disabled || createSubscriptionMutation.isPending}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "implementacao" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  getButtonConfig("implementacao").text
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="flex flex-wrap justify-center gap-6 md:gap-12 py-6 border-t border-b border-gray-200 dark:border-gray-800 mb-12">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Shield className="w-4 h-4 text-green-600" />
            <span>7 dias de garantia</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Zap className="w-4 h-4 text-blue-600" />
            <span>Pagamento seguro via PIX</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
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
