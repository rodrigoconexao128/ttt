import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, CheckCircle } from "lucide-react";
import { useState, useEffect } from "react";
import type { Payment, Subscription, Plan } from "@shared/schema";

export default function SubscribePage() {
  const { id } = useParams();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [copiedPix, setCopiedPix] = useState(false);

  const { data: subscription, isLoading: subscriptionLoading } = useQuery<(Subscription & { plan: Plan }) | null>({
    queryKey: ["/api/subscriptions/current"],
  });

  const { data: payment, isLoading: paymentLoading } = useQuery<Payment>({
    queryKey: ["/api/payment", id],
    enabled: !!id && !!subscription,
  });

  const generatePixMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const response = await apiRequest("POST", "/api/payments/generate-pix", { subscriptionId });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/payment", id], data);
      toast({ title: "PIX gerado com sucesso!" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro ao gerar PIX", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Auto-generate PIX when subscription is ready and no payment exists
  useEffect(() => {
    if (
      id && 
      subscription && 
      subscription.status === "pending" && 
      !payment && 
      !paymentLoading && 
      !generatePixMutation.isPending && 
      !generatePixMutation.isSuccess
    ) {
      generatePixMutation.mutate(id);
    }
  }, [id, subscription, payment, paymentLoading, generatePixMutation]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPix(true);
    toast({ title: "Código PIX copiado!" });
    setTimeout(() => setCopiedPix(false), 2000);
  };

  if (subscriptionLoading || paymentLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" data-testid="loader-subscription" />
      </div>
    );
  }

  if (!subscription || subscription.id !== id) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="py-12">
              <p className="text-center text-muted-foreground">
                Assinatura não encontrada. 
                <Button 
                  variant="ghost" 
                  onClick={() => setLocation("/plans")}
                  data-testid="link-back-to-plans"
                >
                  Voltar para planos
                </Button>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold" data-testid="text-subscribe-title">
            Finalizar Assinatura
          </h1>
          <p className="text-muted-foreground">
            Plano: {subscription.plan.nome} - R$ {subscription.couponPrice || subscription.plan.valor}
            {subscription.couponPrice && subscription.couponCode && (
              <span className="ml-2 text-xs text-green-600 dark:text-green-400 font-medium">
                (com cupom {subscription.couponCode})
              </span>
            )}
          </p>
        </div>

        {subscription.status === "active" && (
          <Card className="border-green-200 dark:border-green-800">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <CardTitle className="text-green-700 dark:text-green-300">
                  Assinatura Ativa!
                </CardTitle>
              </div>
              <CardDescription>
                Seu pagamento foi aprovado e sua assinatura está ativa até {" "}
                {subscription.dataFim ? new Date(subscription.dataFim).toLocaleDateString("pt-BR") : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => setLocation("/")}
                data-testid="button-go-to-dashboard"
              >
                Ir para o Dashboard
              </Button>
            </CardContent>
          </Card>
        )}

        {subscription.status === "pending" && !payment && (
          <Card data-testid="card-generate-pix">
            <CardHeader>
              <CardTitle>Gerando Pagamento PIX...</CardTitle>
              <CardDescription>
                Aguarde um momento enquanto geramos seu código de pagamento.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </CardContent>
          </Card>
        )}

        {payment && payment.status === "pending" && (
          <Card data-testid="card-pix-payment">
            <CardHeader>
              <CardTitle>Pagamento via PIX</CardTitle>
              <CardDescription>
                Escaneie o QR Code ou copie o código PIX abaixo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-lg">
                  <img 
                    src={payment.pixQrCode!} 
                    alt="QR Code PIX" 
                    className="w-64 h-64"
                    data-testid="img-pix-qrcode"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Código PIX Copia e Cola:</p>
                <div className="flex gap-2">
                  <div className="flex-1 p-3 bg-muted rounded-md text-sm font-mono break-all">
                    {payment.pixCode}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(payment.pixCode!)}
                    data-testid="button-copy-pix"
                  >
                    {copiedPix ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Após realizar o pagamento, aguarde a aprovação do administrador. 
                  Você receberá uma notificação quando sua assinatura for ativada.
                </p>
              </div>

              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Valor: <span className="font-bold">R$ {payment.valor}</span>
                </p>
              </div>

              <div className="flex justify-center">
                <a
                  href={`https://wa.me/5517981679818?text=${encodeURIComponent(
                    `Olá! Enviei o comprovante do pagamento da assinatura ${subscription.plan.nome} (ID ${subscription.id}) no valor de R$ ${payment.valor}.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="default" data-testid="button-whatsapp-proof">
                    Enviar Comprovante via WhatsApp
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
