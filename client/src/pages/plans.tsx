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
      answer: "No plano anual você garante o preço atual por 12 meses. Isso significa que se o preço subir, você NÃO pagará a diferença, pois já fechou o valor anual. Além disso, economiza 5% (R$ 59,40 no ano)."
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
    <div className="flex-1 overflow-auto bg-[#F6F6F7] dark:bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">
            {hasActiveSubscription ? "Faça upgrade do seu plano" : "Escolha seu plano"}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg max-w-2xl mx-auto">
            {hasActiveSubscription 
              ? `Você está no plano ${currentSubscription?.plan?.nome}. Escolha uma opção abaixo para evoluir.`
              : "Comece a automatizar suas vendas hoje mesmo com a melhor IA do mercado."}
          </p>
        </div>

        <div className="grid gap-6 md:gap-8 grid-cols-1 md:grid-cols-3 mb-16">
          
          {/* PLANO MENSAL */}
          <Card className={cn(
            "relative flex flex-col border-2 rounded-3xl transition-all duration-300 overflow-hidden",
            isPlanActive("mensal") 
              ? "border-gray-300 bg-white dark:bg-gray-900" 
              : "border-transparent bg-white dark:bg-gray-900 shadow-sm hover:shadow-xl hover:-translate-y-1"
          )}>
            <CardHeader className="pb-6 pt-8 px-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Mensal</h3>
                {isPlanActive("mensal") && (
                  <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">
                    Atual
                  </Badge>
                )}
              </div>
              
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-semibold text-gray-900 dark:text-white">R$</span>
                <span className="text-6xl font-black text-gray-900 dark:text-white tracking-tighter">99</span>
                <span className="text-gray-500 text-lg font-medium">/mês</span>
              </div>
              
              <p className="text-gray-500 mt-4 font-medium leading-relaxed">Ideal para validar seu processo de vendas com IA.</p>
            </CardHeader>

            <CardContent className="flex-1 px-8 pb-6">
              <div className="h-px bg-gray-100 dark:bg-gray-800 mb-6" />
              <ul className="space-y-4">
                {[
                  "IA atendendo 24/7",
                  "Conversas ilimitadas",
                  "1 agente IA personalizado",
                  "Suporte via WhatsApp",
                  "Sem fidelidade, cancele quando quiser"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                    <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                    </div>
                    <span className="text-[15px] font-medium">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter className="px-8 pb-10 pt-2">
              <Button
                className={cn(
                  "w-full h-14 rounded-2xl font-bold text-lg transition-all active:scale-95", 
                  isPlanActive("mensal") 
                    ? "bg-gray-100 text-gray-400 cursor-default" 
                    : "bg-gray-900 text-white hover:bg-black dark:bg-white dark:text-gray-900"
                )}
                onClick={() => handleSelectPlan("mensal")}
                disabled={getButtonConfig("mensal").disabled || createSubscriptionMutation.isPending}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "mensal" ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  isPlanActive("mensal") ? "Plano Atual" : "Selecionar Mensal"
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* PLANO ANUAL */}
          <Card className={cn(
            "relative flex flex-col border-2 rounded-3xl transition-all duration-300 overflow-hidden scale-105 z-10",
            isPlanActive("anual") 
              ? "border-green-500 bg-white dark:bg-gray-900 shadow-2xl shadow-green-500/20" 
              : "border-green-500 bg-white dark:bg-gray-900 shadow-xl shadow-green-500/10 hover:shadow-2xl hover:shadow-green-500/20"
          )}>
            <div className="absolute top-0 right-0">
              <div className="bg-green-500 text-white text-[10px] font-black px-4 py-1 rounded-bl-xl uppercase tracking-widest">
                Mais Popular
              </div>
            </div>
            
            <CardHeader className="pb-6 pt-10 px-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Anual</h3>
                <Badge className="bg-green-100 text-green-700 border-none font-bold">
                  ECONOMIZE 5%
                </Badge>
              </div>
              
              <div className="space-y-1">
                <div className="text-lg text-gray-400 line-through font-medium decoration-2">R$ 1.188</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-semibold text-green-600">R$</span>
                  <span className="text-6xl font-black text-green-600 tracking-tighter">1.128</span>
                  <span className="text-gray-500 text-lg font-medium">/ano</span>
                </div>
                <p className="text-sm text-green-600/80 font-bold bg-green-50 dark:bg-green-900/20 inline-block px-2 py-0.5 rounded-md mt-2">
                  Equivale a R$ 94,05/mês
                </p>
              </div>
            </CardHeader>

            <CardContent className="flex-1 px-8 pb-6">
              <div className="h-px bg-gray-100 dark:bg-gray-800 mb-6" />
              <ul className="space-y-4">
                {[
                  { text: "Tudo do plano mensal", highlight: false },
                  { text: "Preço TRAVADO por 1 ano", highlight: true },
                  { text: "Economia real de R$ 59,40", highlight: false },
                  { text: "Prioridade total no suporte", highlight: true },
                  { text: "Acesso antecipado a funções", highlight: true }
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                    <div className={cn(
                      "mt-1 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center",
                      feature.highlight ? "bg-green-500" : "bg-green-50 dark:bg-green-900/20"
                    )}>
                      <Check className={cn(
                        "w-3.5 h-3.5",
                        feature.highlight ? "text-white" : "text-green-600 dark:text-green-400"
                      )} />
                    </div>
                    <span className={cn(
                      "text-[15px] font-medium",
                      feature.highlight ? "text-green-700 dark:text-green-400 font-bold" : ""
                    )}>
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter className="px-8 pb-10 pt-2">
              <Button
                className={cn(
                  "w-full h-14 rounded-2xl font-black text-lg shadow-lg transition-all active:scale-95", 
                  isPlanActive("anual") 
                    ? "bg-gray-100 text-gray-400 cursor-default" 
                    : "bg-green-600 text-white hover:bg-green-700 hover:shadow-green-500/30"
                )}
                onClick={() => handleSelectPlan("anual")}
                disabled={getButtonConfig("anual").disabled || createSubscriptionMutation.isPending}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "anual" ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  isPlanActive("anual") ? "Plano Atual" : "Selecionar Anual"
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* PLANO IMPLEMENTAÇÃO */}
          <Card className={cn(
            "relative flex flex-col border-2 rounded-3xl transition-all duration-300 overflow-hidden",
            isPlanActive("implementacao") 
              ? "border-purple-300 bg-white dark:bg-gray-900" 
              : "border-transparent bg-white dark:bg-gray-900 shadow-sm hover:shadow-xl hover:-translate-y-1"
          )}>
            <CardHeader className="pb-6 pt-8 px-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">VIP</h3>
                {isPlanActive("implementacao") && (
                  <Badge variant="outline" className="bg-purple-100 text-purple-600 border-purple-200">
                    Atual
                  </Badge>
                )}
              </div>
              
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-semibold text-purple-600">R$</span>
                <span className="text-6xl font-black text-purple-600 tracking-tighter">700</span>
                <span className="text-gray-500 text-lg font-medium">/setup</span>
              </div>
              
              <p className="text-gray-500 mt-4 font-medium leading-relaxed">Nós construímos sua máquina de vendas completa.</p>
            </CardHeader>

            <CardContent className="flex-1 px-8 pb-6">
              <div className="h-px bg-gray-100 dark:bg-gray-800 mb-6" />
              <ul className="space-y-4">
                {[
                  "Configuração completa da IA",
                  "Personalização estratégica",
                  "30 dias de acompanhamento VIP",
                  "Ajustes ilimitados no setup",
                  "Reuniões de alinhamento"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                    <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <span className="text-[15px] font-medium">{feature}</span>
                  </li>
                ))}
              </ul>
              
              <div className="mt-8 p-4 bg-purple-50/50 dark:bg-purple-900/10 rounded-2xl border border-purple-100 dark:border-purple-900/30">
                <p className="text-sm text-center text-purple-700 dark:text-purple-400 font-bold">
                  Manutenção após setup: <span className="text-gray-900 dark:text-white">R$ 99/mês</span>
                </p>
              </div>
            </CardContent>

            <CardFooter className="px-8 pb-10 pt-2">
              <Button
                className={cn(
                  "w-full h-14 rounded-2xl font-bold text-lg transition-all active:scale-95", 
                  isPlanActive("implementacao") 
                    ? "bg-gray-100 text-gray-400 cursor-default" 
                    : "bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-500/20"
                )}
                onClick={() => handleSelectPlan("implementacao")}
                disabled={getButtonConfig("implementacao").disabled || createSubscriptionMutation.isPending}
              >
                {createSubscriptionMutation.isPending && selectedPlan === "implementacao" ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  isPlanActive("implementacao") ? "Plano Atual" : "Contratar VIP"
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

        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-8">
            Perguntas frequentes
          </h2>
          
          <div className="grid gap-4">
            {faqItems.map((item, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden transition-all hover:border-gray-300"
              >
                <button
                  onClick={() => setFaqOpen(faqOpen === index ? null : index)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left transition-colors"
                >
                  <span className="text-base font-bold text-gray-900 dark:text-white">
                    {item.question}
                  </span>
                  <div className={cn(
                    "w-8 h-8 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center transition-transform duration-200",
                    faqOpen === index ? "rotate-180" : ""
                  )}>
                    <ChevronDown className="w-5 h-5 text-gray-500" />
                  </div>
                </button>
                {faqOpen === index && (
                  <div className="px-6 pb-6 animate-in fade-in slide-in-from-top-2 duration-200">
                    <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
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
