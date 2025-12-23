import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Check, Loader2, Sparkles, Shield, Clock, Users, Star, Zap, Gift, Lock, ArrowRight, Crown, Headphones } from "lucide-react";
import type { Plan, Subscription } from "@shared/schema";
import { useState } from "react";

// Tipos dos planos que vamos exibir
interface PlanCard {
  id: string;
  tipo: "mensal" | "anual" | "implementacao";
  nome: string;
  subtitulo: string;
  valor: number;
  valorOriginal?: number;
  periodo: string;
  desconto?: number;
  badge?: string;
  destaque?: boolean;
  features: string[];
  beneficiosExtra?: string[];
  cor: string;
  icon: React.ReactNode;
}

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
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const hasActiveSubscription = currentSubscription?.status === "active";

  // Dados dos planos com design personalizado
  const planCards: PlanCard[] = [
    {
      id: "mensal",
      tipo: "mensal",
      nome: "Plano Mensal",
      subtitulo: "Flexibilidade total",
      valor: 99,
      periodo: "/mês",
      features: [
        "IA atendendo 24/7 no WhatsApp",
        "Conversas ilimitadas",
        "1 agente IA personalizado",
        "Respostas automáticas inteligentes",
        "Suporte técnico via WhatsApp",
        "Atualizações gratuitas",
        "Cancele quando quiser"
      ],
      cor: "border-gray-200 dark:border-gray-700",
      icon: <Zap className="w-6 h-6 text-blue-500" />
    },
    {
      id: "anual",
      tipo: "anual",
      nome: "Plano Anual",
      subtitulo: "Valor congelado por 12 meses",
      valor: 94.05,
      valorOriginal: 99,
      periodo: "/mês",
      desconto: 5,
      badge: "5% OFF",
      destaque: true,
      features: [
        "Tudo do Plano Mensal +",
        "Preço GARANTIDO por 12 meses",
        "Mesmo que o preço suba, você paga o mesmo",
        "Economia de R$ 59,40 no ano",
        "Prioridade no suporte",
        "Acesso antecipado a novidades"
      ],
      beneficiosExtra: [
        "🛡️ Proteção contra reajustes",
        "💰 Economia garantida"
      ],
      cor: "border-2 border-green-500 dark:border-green-400 shadow-xl",
      icon: <Shield className="w-6 h-6 text-green-500" />
    },
    {
      id: "implementacao",
      tipo: "implementacao",
      nome: "Implementação Completa",
      subtitulo: "Nós fazemos tudo por você",
      valor: 700,
      periodo: " no 1° mês",
      badge: "RECOMENDADO",
      features: [
        "Configuração completa da IA",
        "Personalização do agente para seu negócio",
        "Treinamento da IA com suas informações",
        "Integração com seu WhatsApp",
        "30 dias de acompanhamento dedicado",
        "Ajustes ilimitados no primeiro mês",
        "Reuniões de alinhamento semanais"
      ],
      beneficiosExtra: [
        "📞 Suporte VIP por 30 dias",
        "🎯 IA perfeita para seu negócio",
        "⚡ Após 1° mês: R$99/mês"
      ],
      cor: "border-2 border-purple-500 dark:border-purple-400",
      icon: <Crown className="w-6 h-6 text-purple-500" />
    }
  ];

  const handleSelectPlan = (planCard: PlanCard) => {
    // Buscar o plano correspondente do backend
    const backendPlan = plans?.find(p => {
      if (planCard.tipo === "mensal") return p.tipo === "padrao" || (!p.tipo && p.periodicidade === "mensal");
      if (planCard.tipo === "anual") return p.tipo === "anual";
      if (planCard.tipo === "implementacao") return p.tipo === "implementacao";
      return false;
    });

    if (backendPlan) {
      setSelectedPlan(planCard.id);
      createSubscriptionMutation.mutate(backendPlan.id);
    } else {
      // Se não encontrar no backend, usar o primeiro plano disponível
      if (plans && plans.length > 0) {
        setSelectedPlan(planCard.id);
        createSubscriptionMutation.mutate(plans[0].id);
      } else {
        toast({
          title: "Plano não disponível",
          description: "Entre em contato com o suporte",
          variant: "destructive"
        });
      }
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <Badge className="inline-flex items-center gap-2 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-4 py-2 rounded-full text-sm font-semibold">
            <Sparkles className="w-4 h-4" />
            Escolha o plano ideal para seu negócio
          </Badge>
          
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent" data-testid="text-plans-title">
            Planos AgenteZap
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            IA que atende seus clientes como um humano, 24 horas por dia, 7 dias por semana
          </p>
        </div>

        {/* Status de assinatura ativa */}
        {hasActiveSubscription && (
          <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl p-6 flex items-center justify-center gap-4">
            <Check className="w-6 h-6 text-green-600" />
            <p className="text-center text-green-700 dark:text-green-300 font-medium">
              Você já possui uma assinatura ativa do plano <strong>{currentSubscription!.plan.nome}</strong>
            </p>
          </div>
        )}

        {/* Cards de Planos */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {planCards.map((planCard) => (
            <Card 
              key={planCard.id} 
              className={`relative flex flex-col transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 ${planCard.cor} ${planCard.destaque ? 'scale-[1.02] lg:scale-105' : ''}`}
              data-testid={`card-plan-${planCard.id}`}
            >
              {/* Badge */}
              {planCard.badge && (
                <div className={`absolute -top-3 left-1/2 transform -translate-x-1/2 z-10`}>
                  <Badge 
                    className={`px-4 py-1 text-sm font-bold shadow-lg ${
                      planCard.tipo === "anual" 
                        ? "bg-green-500 text-white" 
                        : planCard.tipo === "implementacao"
                        ? "bg-purple-500 text-white"
                        : "bg-blue-500 text-white"
                    }`}
                  >
                    {planCard.badge}
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center pb-4">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  {planCard.icon}
                </div>
                
                <CardTitle className="text-2xl font-bold" data-testid={`text-plan-name-${planCard.id}`}>
                  {planCard.nome}
                </CardTitle>
                
                <CardDescription className="text-base">
                  {planCard.subtitulo}
                </CardDescription>

                <div className="mt-4">
                  {planCard.valorOriginal && (
                    <div className="text-sm text-muted-foreground line-through mb-1">
                      R$ {planCard.valorOriginal.toFixed(2)}{planCard.periodo}
                    </div>
                  )}
                  
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold">
                      R$ {planCard.valor.toFixed(2).replace('.', ',')}
                    </span>
                    <span className="text-muted-foreground text-lg">{planCard.periodo}</span>
                  </div>
                  
                  {planCard.desconto && (
                    <Badge variant="secondary" className="mt-2 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
                      <Gift className="w-3 h-3 mr-1" />
                      Economia de {planCard.desconto}%
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex-1 space-y-4">
                {/* Features */}
                <div className="space-y-3">
                  {planCard.features.map((feature, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Benefícios extras */}
                {planCard.beneficiosExtra && (
                  <div className={`mt-4 p-4 rounded-xl ${
                    planCard.tipo === "anual" 
                      ? "bg-green-50 dark:bg-green-950" 
                      : "bg-purple-50 dark:bg-purple-950"
                  }`}>
                    {planCard.beneficiosExtra.map((beneficio, index) => (
                      <div key={index} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {beneficio}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>

              <CardFooter className="pt-4">
                <Button
                  className={`w-full h-12 text-base font-semibold transition-all ${
                    planCard.destaque 
                      ? "bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/30" 
                      : planCard.tipo === "implementacao"
                      ? "bg-purple-500 hover:bg-purple-600 text-white shadow-lg shadow-purple-500/30"
                      : ""
                  }`}
                  onClick={() => handleSelectPlan(planCard)}
                  disabled={createSubscriptionMutation.isPending || hasActiveSubscription}
                  data-testid={`button-subscribe-${planCard.id}`}
                >
                  {createSubscriptionMutation.isPending && selectedPlan === planCard.id ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-2 h-5 w-5" />
                  )}
                  {hasActiveSubscription ? "Plano Ativo" : "Começar Agora"}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Seção de garantias */}
        <div className="grid md:grid-cols-3 gap-6 mt-12">
          <div className="flex items-center gap-4 p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <Shield className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h4 className="font-bold text-gray-900 dark:text-white">Garantia de 7 dias</h4>
              <p className="text-sm text-muted-foreground">Devolução integral se não gostar</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <Lock className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h4 className="font-bold text-gray-900 dark:text-white">Pagamento Seguro</h4>
              <p className="text-sm text-muted-foreground">PIX com verificação instantânea</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
              <Headphones className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h4 className="font-bold text-gray-900 dark:text-white">Suporte Humanizado</h4>
              <p className="text-sm text-muted-foreground">Atendimento real via WhatsApp</p>
            </div>
          </div>
        </div>

        {/* FAQ Rápido */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-8 mt-8">
          <h3 className="text-2xl font-bold text-center mb-8">Perguntas Frequentes</h3>
          
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="space-y-2">
              <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-500" />
                O que é o plano anual com 5% de desconto?
              </h4>
              <p className="text-sm text-muted-foreground">
                Ao assinar o plano anual, você garante o valor de R$94,05/mês por 12 meses. 
                Mesmo que o preço suba no futuro, você continua pagando o mesmo valor durante todo o período.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-500" />
                Como funciona a Implementação Completa?
              </h4>
              <p className="text-sm text-muted-foreground">
                Pagando R$700 no primeiro mês, nossa equipe configura toda a IA para você. 
                Fazemos toda personalização, treinamento e acompanhamos por 30 dias. 
                Após o 1° mês, fica apenas R$99/mês.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-500" />
                Preciso ter conhecimento técnico?
              </h4>
              <p className="text-sm text-muted-foreground">
                Não! A plataforma é intuitiva e temos suporte para ajudar em tudo. 
                Se preferir, escolha a Implementação Completa e nós fazemos tudo por você.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-500" />
                Posso cancelar a qualquer momento?
              </h4>
              <p className="text-sm text-muted-foreground">
                Sim! No plano mensal você pode cancelar quando quiser. 
                No plano anual, você tem garantia de 7 dias para cancelamento com reembolso total.
              </p>
            </div>
          </div>
        </div>

        {/* Planos não encontrados */}
        {(!plans || plans.length === 0) && (
          <Card>
            <CardContent className="py-12">
              <p className="text-center text-muted-foreground">
                Nenhum plano disponível no momento. Entre em contato com o suporte.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

