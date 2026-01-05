import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { 
  Loader2, 
  Check, 
  Shield, 
  Lock, 
  CreditCard, 
  X,
  QrCode,
  Copy,
  CheckCircle2,
  Clock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

// ═══════════════════════════════════════════════════════════════════════════════
// SUBSCRIBE MODAL - SHOPIFY STYLE POPUP
// Design compacto que aparece como overlay sobre a página de planos
// ═══════════════════════════════════════════════════════════════════════════════

declare global {
  interface Window {
    MercadoPago: any;
  }
}

// Traduções PT-BR para erros do Mercado Pago
const MP_ERROR_TRANSLATIONS: Record<string, string> = {
  "cc_rejected_bad_filled_card_number": "Número do cartão incorreto. Verifique e tente novamente.",
  "cc_rejected_bad_filled_date": "Data de validade incorreta.",
  "cc_rejected_bad_filled_other": "Dados do cartão incorretos. Verifique todas as informações.",
  "cc_rejected_bad_filled_security_code": "Código de segurança (CVV) incorreto.",
  "cc_rejected_blacklist": "Este cartão não pode ser utilizado. Tente outro cartão.",
  "cc_rejected_call_for_authorize": "Autorize a compra ligando para seu banco.",
  "cc_rejected_card_disabled": "Cartão desativado. Entre em contato com seu banco.",
  "cc_rejected_card_error": "Erro no cartão. Tente outro cartão.",
  "cc_rejected_duplicated_payment": "Este pagamento já foi realizado anteriormente.",
  "cc_rejected_high_risk": "Pagamento recusado por motivos de segurança.",
  "cc_rejected_insufficient_amount": "Saldo insuficiente no cartão.",
  "cc_rejected_invalid_installments": "Número de parcelas inválido.",
  "cc_rejected_max_attempts": "Limite de tentativas excedido. Tente mais tarde.",
  "cc_rejected_other_reason": "Pagamento não autorizado pelo banco.",
  "invalid_card_number": "Número do cartão inválido.",
  "invalid_expiration_date": "Data de validade inválida.",
  "invalid_security_code": "Código de segurança (CVV) inválido.",
  "invalid_holder_name": "Nome do titular deve conter apenas letras.",
  "invalid_identification": "CPF/CNPJ inválido. Verifique o número.",
  "card_token_creation_failed": "Erro ao processar o cartão. Tente novamente.",
  "pending_contingency": "Pagamento em análise. Aguarde a confirmação.",
  "pending_review_manual": "Pagamento em revisão manual.",
  "rejected": "Pagamento rejeitado. Tente outro cartão.",
  "cancelled": "Pagamento cancelado.",
  "refunded": "Pagamento estornado.",
  "charged_back": "Pagamento contestado.",
  "Card token service not found": "Conexão segura necessária (HTTPS).",
  "secure context": "Use conexão segura (HTTPS) para pagamentos.",
};

function translateMPError(error: string): string {
  if (MP_ERROR_TRANSLATIONS[error]) return MP_ERROR_TRANSLATIONS[error];
  for (const [key, translation] of Object.entries(MP_ERROR_TRANSLATIONS)) {
    if (error.toLowerCase().includes(key.toLowerCase())) return translation;
  }
  return error;
}

interface SubscribeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptionId: string | null;
  onSuccess?: () => void;
}

export function SubscribeModal({ open, onOpenChange, subscriptionId, onSuccess }: SubscribeModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  // Estados do formulário
  const [paymentMethod, setPaymentMethod] = useState<"card" | "pix">("card");
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvv, setCvv] = useState("");
  const [docType, setDocType] = useState("CPF");
  const [docNumber, setDocNumber] = useState("");
  const [email, setEmail] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [mpReady, setMpReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardBrand, setCardBrand] = useState<string | null>(null);
  
  // Estados para PIX
  const [pixData, setPixData] = useState<{
    qrCode: string;
    qrCodeBase64: string;
    paymentId: string;
    expirationDate: string;
    amount: number;
  } | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const [pixTimeLeft, setPixTimeLeft] = useState<number>(30 * 60); // 30 minutos em segundos
  
  const mpInstanceRef = useRef<any>(null);
  const pixPollingRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-preencher email do usuário logado
  useEffect(() => {
    if (user?.email && !email) {
      setEmail(user.email);
    }
  }, [user, email]);

  // Buscar assinatura e plano
  const { data: subscription, isLoading: subscriptionLoading } = useQuery({
    queryKey: ["subscription", subscriptionId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/subscriptions/${subscriptionId}`);
      return res.json();
    },
    enabled: !!subscriptionId && open,
  });

  const plan = subscription?.plan;

  // Buscar config MP
  const { data: mpConfig } = useQuery({
    queryKey: ["mp-public-key"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/mercadopago/public-key");
      return res.json();
    },
    enabled: open,
  });

  // Inicializar MP
  useEffect(() => {
    if (!mpConfig?.publicKey || !open) return;
    const initMP = () => {
      if (window.MercadoPago && mpConfig.publicKey) {
        try {
          mpInstanceRef.current = new window.MercadoPago(mpConfig.publicKey, { locale: 'pt-BR' });
          setMpReady(true);
        } catch (err) {
          console.error("Erro MP:", err);
        }
      }
    };
    if (window.MercadoPago) initMP();
    else {
      const script = document.createElement("script");
      script.src = "https://sdk.mercadopago.com/js/v2";
      script.async = true;
      script.onload = initMP;
      document.body.appendChild(script);
    }
  }, [mpConfig, open]);

  // Detectar bandeira
  useEffect(() => {
    const clean = cardNumber.replace(/\s/g, "");
    if (clean.length >= 4) {
      if (/^4/.test(clean)) setCardBrand("visa");
      else if (/^5[1-5]/.test(clean) || /^2/.test(clean)) setCardBrand("mastercard");
      else if (/^3[47]/.test(clean)) setCardBrand("amex");
      else if (/^(636368|438935|504175|451416|636297|506|4576|4011)/.test(clean)) setCardBrand("elo");
      else if (/^(606282|3841)/.test(clean)) setCardBrand("hipercard");
      else setCardBrand(null);
    } else setCardBrand(null);
  }, [cardNumber]);

  // Formatters
  const formatCardNumber = (v: string) => v.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  const formatExpiryDate = (v: string) => {
    const clean = v.replace(/\D/g, "").slice(0, 4);
    return clean.length >= 2 ? `${clean.slice(0, 2)}/${clean.slice(2)}` : clean;
  };
  const formatDoc = (v: string) => {
    const clean = v.replace(/\D/g, "");
    if (docType === "CPF") {
      return clean.slice(0, 11)
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})/, "$1-$2");
    }
    return clean.slice(0, 14)
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d{1,2})/, "$1-$2");
  };

  // Mutation para cartão
  const createSubscription = useMutation({
    mutationFn: async (cardToken: string) => {
      const paymentMethodMap: Record<string, string> = {
        visa: "visa", mastercard: "master", amex: "amex", elo: "elo", hipercard: "hipercard"
      };
      const paymentMethodId = cardBrand ? paymentMethodMap[cardBrand] || "visa" : "visa";
      
      const res = await apiRequest("POST", "/api/subscriptions/create-mp-subscription", {
        subscriptionId,
        token: cardToken,
        payerEmail: email,
        paymentMethodId,
        cardholderName: cardHolder,
        identificationNumber: docNumber.replace(/\D/g, ""),
        identificationType: docType,
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erro ao criar assinatura");
      }
      return res.json();
    },
    onSuccess: (data) => {
      // Pagamento já aprovado anteriormente
      if (data.status === "approved" && data.mpPaymentId) {
        toast({ 
          title: "✅ Pagamento já processado!", 
          description: "Sua assinatura está sendo ativada." 
        });
        setIsProcessing(false);
        onOpenChange(false);
        onSuccess?.();
        return;
      }
      
      // Pagamento em processamento
      if (data.status === "in_process" || data.status === "pending") {
        toast({ 
          title: "⏳ Pagamento em processamento", 
          description: "Aguarde a confirmação. Não clique novamente." 
        });
        setIsProcessing(false);
        return;
      }
      
      if (data.status === "approved") {
        toast({ 
          title: "🎉 Assinatura ativada com sucesso!", 
          description: "Cobranças automáticas configuradas." 
        });
        setIsProcessing(false);
        onOpenChange(false);
        onSuccess?.();
      } else if (data.initPoint) {
        toast({ 
          title: "Finalize seu pagamento", 
          description: "Redirecionando para completar a assinatura..." 
        });
        // Manter isProcessing=true enquanto redireciona
        setTimeout(() => {
          window.location.href = data.initPoint;
        }, 1500);
      } else {
        setError(data.message || "Pagamento não aprovado");
        setIsProcessing(false);
      }
    },
    onError: (err: Error) => {
      setError(translateMPError(err.message));
      setIsProcessing(false);
    }
  });

  // Mutation para PIX
  const createPixSubscription = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/subscriptions/create-pix-subscription", {
        subscriptionId,
        payerEmail: email,
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Erro ao gerar PIX");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.status === "pending" && data.qrCode) {
        setPixData({
          qrCode: data.qrCode,
          qrCodeBase64: data.qrCodeBase64,
          paymentId: data.paymentId,
          expirationDate: data.expirationDate,
          amount: data.amount,
        });
        setIsProcessing(false);
        startPixPolling(data.paymentId);
        toast({ 
          title: "PIX gerado!", 
          description: "Escaneie o QR Code ou copie o código para pagar." 
        });
      } else {
        setError(data.message || "Erro ao gerar PIX");
        setIsProcessing(false);
      }
    },
    onError: (err: Error) => {
      setError(err.message);
      setIsProcessing(false);
    }
  });

  // Polling PIX
  const checkPixStatus = async (paymentId: string) => {
    try {
      const res = await apiRequest("GET", `/api/subscriptions/check-pix-status/${paymentId}`);
      const data = await res.json();
      
      if (data.status === "approved") {
        if (pixPollingRef.current) {
          clearInterval(pixPollingRef.current);
          pixPollingRef.current = null;
        }
        toast({ 
          title: "🎉 Pagamento PIX confirmado!", 
          description: "Sua assinatura foi ativada com sucesso!" 
        });
        onOpenChange(false);
        onSuccess?.();
      } else if (data.status === "rejected" || data.status === "cancelled") {
        if (pixPollingRef.current) {
          clearInterval(pixPollingRef.current);
          pixPollingRef.current = null;
        }
        setError("Pagamento PIX não aprovado. Tente novamente.");
        setPixData(null);
      }
    } catch (error) {
      console.error("Erro ao verificar PIX:", error);
    }
  };

  const startPixPolling = (paymentId: string) => {
    pixPollingRef.current = setInterval(() => {
      checkPixStatus(paymentId);
    }, 3000);
    
    setTimeout(() => {
      if (pixPollingRef.current) {
        clearInterval(pixPollingRef.current);
        pixPollingRef.current = null;
      }
    }, 30 * 60 * 1000);
  };

  useEffect(() => {
    return () => {
      if (pixPollingRef.current) {
        clearInterval(pixPollingRef.current);
      }
    };
  }, []);

  // Cronômetro do PIX
  useEffect(() => {
    if (!pixData) {
      setPixTimeLeft(30 * 60);
      return;
    }
    
    const timer = setInterval(() => {
      setPixTimeLeft(prev => {
        if (prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [pixData]);

  const formatPixTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const copyPixCode = () => {
    if (pixData?.qrCode) {
      navigator.clipboard.writeText(pixData.qrCode);
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 3000);
      toast({ title: "Código PIX copiado!", description: "Cole no app do seu banco." });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mpInstanceRef.current) {
      setError("Sistema de pagamento não inicializado. Recarregue a página.");
      return;
    }
    setIsProcessing(true);
    setError(null);

    try {
      const [expirationMonth, expirationYear] = expiryDate.split("/");
      const cardToken = await mpInstanceRef.current.createCardToken({
        cardNumber: cardNumber.replace(/\s/g, ""),
        cardholderName: cardHolder,
        cardExpirationMonth: expirationMonth,
        cardExpirationYear: "20" + expirationYear,
        securityCode: cvv,
        identificationType: docType,
        identificationNumber: docNumber.replace(/\D/g, ""),
      });
      
      if (cardToken?.error || cardToken?.message) {
        throw new Error(cardToken.error || cardToken.message || "Erro ao processar cartão");
      }
      
      if (!cardToken || !cardToken.id) {
        throw new Error("Não foi possível processar os dados do cartão.");
      }
      
      createSubscription.mutate(cardToken.id);
    } catch (err: any) {
      let errorMessage = "Verifique os dados do cartão.";
      const errMsg = String(err?.message || err?.error || String(err) || "").toLowerCase();
      
      if (errMsg.includes("card token") || errMsg.includes("service not found") || errMsg.includes("secure") || errMsg.includes("https")) {
        errorMessage = "⚠️ Pagamento seguro requer HTTPS.";
      } else if (err?.cause?.[0]?.code) {
        const code = err.cause[0].code;
        if (code === "205" || code === "E205") errorMessage = "Número do cartão inválido.";
        else if (code === "208" || code === "E208") errorMessage = "Mês de validade inválido.";
        else if (code === "209" || code === "E209") errorMessage = "Ano de validade inválido.";
        else if (code === "224" || code === "E224") errorMessage = "Código CVV inválido.";
      } else if (errMsg) {
        errorMessage = translateMPError(errMsg);
      }
      
      setError(errorMessage);
      setIsProcessing(false);
    }
  };

  const handlePixSubmit = () => {
    setIsProcessing(true);
    setError(null);
    createPixSubscription.mutate();
  };

  if (!subscriptionId) return null;

  // Extrair valores do plano
  const planName = plan?.nome || plan?.name || "Plano";
  const planPrice = plan?.valor || plan?.price || "0";
  const setupFee = plan?.valorPrimeiraCobranca ? parseFloat(plan.valorPrimeiraCobranca) : 0;
  const monthlyPrice = subscription?.couponPrice ? parseFloat(subscription.couponPrice) : parseFloat(planPrice);
  const hasSetupFee = setupFee > 0 && setupFee !== monthlyPrice;
  const frequencyDays = plan?.frequenciaDias || 30;
  const isAnnual = frequencyDays >= 360 || plan?.tipo === "anual";
  const periodLabel = isAnnual ? "ano" : "mês";
  const totalInitial = hasSetupFee ? setupFee : monthlyPrice;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[95vw] sm:w-[90vw] md:w-[85vw] lg:w-[80vw] max-w-6xl max-h-[95vh] overflow-hidden p-0 border-0 shadow-2xl"
        aria-describedby={undefined}
      >
        <VisuallyHidden>
          <DialogTitle>Pagamento via {paymentMethod === 'pix' ? 'PIX' : 'Cartão de Crédito'}</DialogTitle>
        </VisuallyHidden>
        {subscriptionLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex max-h-[95vh] flex-col overflow-y-auto md:flex-row">
            {/* LADO ESQUERDO - Info (Dark) - Shopify style */}
            <div className="w-full md:w-[42%] bg-gradient-to-br from-[#1a1a1a] to-[#2d2d2d] text-white p-8 md:p-10">
              <div className="mb-6">
                <h2 className="text-xl font-bold mb-1">
                  {hasSetupFee ? "Implementação + Plano" : "Volte aos negócios"}
                </h2>
                <p className="text-2xl font-bold text-primary">
                  R$ {totalInitial.toFixed(2).replace(".", ",")}
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  Plano {planName}
                </p>
              </div>

              <div className="space-y-4">
                {hasSetupFee && (
                  <div className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-yellow-400 mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm">Hoje: R$ {setupFee.toFixed(2).replace(".", ",")} (Implementação)</p>
                      <p className="text-xs text-gray-400">Configuração completa + suporte VIP</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Ativação Imediata</p>
                    <p className="text-xs text-gray-400">Comece a usar agora</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-sm">
                      {hasSetupFee 
                        ? `Depois: R$ ${monthlyPrice.toFixed(2).replace(".", ",")}/${periodLabel}` 
                        : `R$ ${monthlyPrice.toFixed(2).replace(".", ",")}/${periodLabel}`}
                    </p>
                    <p className="text-xs text-gray-400">Preço fixo, sem surpresas</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Sem fidelidade</p>
                    <p className="text-xs text-gray-400">Cancele quando quiser</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Shield className="w-3 h-3" />
                  <span>Pagamento 100% seguro via Mercado Pago</span>
                </div>
              </div>
            </div>

            {/* LADO DIREITO - Formulário (Light) - Shopify style */}
            <div className="w-full md:w-[58%] p-8 md:p-10 bg-[#fafafa]">
              {/* Seleção de método */}
              <div className="mb-4 space-y-2">
                <div 
                  className={cn(
                    "border rounded-lg p-3 flex items-center justify-between cursor-pointer transition-all",
                    paymentMethod === "card" 
                      ? "border-primary ring-1 ring-primary/20 bg-gray-50" 
                      : "border-gray-200 hover:border-gray-300"
                  )}
                  onClick={() => { setPaymentMethod("card"); setPixData(null); setError(null); }}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2",
                      paymentMethod === "card" ? "border-[4px] border-primary" : "border-gray-300"
                    )} />
                    <CreditCard className="w-4 h-4 text-gray-600" />
                    <span className="font-medium text-sm">Cartão de crédito</span>
                  </div>
                  <div className="flex gap-1">
                    <img src="https://img.icons8.com/color/48/visa.png" alt="Visa" className="h-4" />
                    <img src="https://img.icons8.com/color/48/mastercard.png" alt="Master" className="h-4" />
                  </div>
                </div>

                <div 
                  className={cn(
                    "border rounded-lg p-3 flex items-center justify-between cursor-pointer transition-all",
                    paymentMethod === "pix" 
                      ? "border-green-500 ring-1 ring-green-500/20 bg-green-50" 
                      : "border-gray-200 hover:border-gray-300"
                  )}
                  onClick={() => { setPaymentMethod("pix"); setError(null); }}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2",
                      paymentMethod === "pix" ? "border-[4px] border-green-500" : "border-gray-300"
                    )} />
                    <QrCode className="w-4 h-4 text-green-600" />
                    <span className="font-medium text-sm">PIX</span>
                    <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                      Imediato
                    </span>
                  </div>
                </div>
              </div>

              {/* FORM CARTÃO */}
              {paymentMethod === "card" && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">Número do cartão</label>
                    <div className="relative">
                      <Input
                        placeholder="0000 0000 0000 0000"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                        maxLength={19}
                        className="h-12 text-base bg-white border-gray-200 focus:border-gray-400 focus:ring-0"
                        required
                      />
                      {cardBrand && (
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold uppercase text-primary">
                          {cardBrand}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">Validade</label>
                      <Input
                        placeholder="MM/AA"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(formatExpiryDate(e.target.value))}
                        maxLength={5}
                        className="h-12 text-base bg-white border-gray-200 focus:border-gray-400 focus:ring-0"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">CVV</label>
                      <Input
                        placeholder="000"
                        value={cvv}
                        onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        maxLength={4}
                        className="h-12 text-base bg-white border-gray-200 focus:border-gray-400 focus:ring-0"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">Nome no cartão</label>
                    <Input
                      placeholder="NOME COMPLETO"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                      className="h-12 text-base bg-white border-gray-200 focus:border-gray-400 focus:ring-0"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                      className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm"
                    >
                      <option value="CPF">CPF</option>
                      <option value="CNPJ">CNPJ</option>
                    </select>
                    <Input
                      placeholder="Documento"
                      value={docNumber}
                      onChange={(e) => setDocNumber(formatDoc(e.target.value))}
                      className="col-span-2 h-10 text-sm"
                      required
                    />
                  </div>

                  {error && (
                    <div className="p-2 bg-red-50 border border-red-200 rounded text-red-600 text-xs">
                      {error}
                    </div>
                  )}

                  <Button 
                    type="submit" 
                    disabled={isProcessing || !mpReady || createSubscription.isPending}
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-base font-semibold"
                  >
                    {isProcessing || createSubscription.isPending ? (
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Processando pagamento...</span>
                        </div>
                        <span className="text-xs opacity-80">Aguarde, não clique novamente</span>
                      </div>
                    ) : (
                      `Assinar por R$ ${totalInitial.toFixed(2).replace(".", ",")}`
                    )}
                  </Button>
                  
                  {(isProcessing || createSubscription.isPending) && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm text-center">
                      <p className="font-medium">⏳ Estamos processando seu pagamento</p>
                      <p className="text-xs mt-1">Por favor, aguarde. Isso pode levar alguns segundos.</p>
                    </div>
                  )}
                </form>
              )}

              {/* FORM PIX */}
              {paymentMethod === "pix" && !pixData && (
                <div className="space-y-3">
                  {error && (
                    <div className="p-2 bg-red-50 border border-red-200 rounded text-red-600 text-xs">
                      {error}
                    </div>
                  )}

                  <Button 
                    onClick={handlePixSubmit}
                    disabled={isProcessing}
                    className="w-full h-10 bg-green-600 hover:bg-green-700"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Gerando PIX...
                      </>
                    ) : (
                      <>
                        <QrCode className="w-4 h-4 mr-2" />
                        Gerar QR Code PIX
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* PIX QR CODE */}
              {paymentMethod === "pix" && pixData && (
                <div className="space-y-4 text-center">
                  {pixData.qrCodeBase64 && (
                    <img 
                      src={pixData.qrCodeBase64}
                      alt="QR Code PIX"
                      className="w-40 h-40 mx-auto border rounded-lg"
                    />
                  )}
                  
                  <div>
                    <p className="text-sm text-gray-500">Valor</p>
                    <p className="text-xl font-bold text-primary">
                      R$ {pixData.amount.toFixed(2).replace(".", ",")}
                    </p>
                  </div>
                  
                  {/* Cronômetro */}
                  <div className="flex items-center justify-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span className="text-sm text-gray-600">Expira em</span>
                    <span className={`font-mono text-lg font-bold ${pixTimeLeft < 300 ? 'text-red-500' : 'text-green-600'}`}>
                      {formatPixTime(pixTimeLeft)}
                    </span>
                  </div>

                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={copyPixCode}
                  >
                    {pixCopied ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar Código PIX
                      </>
                    )}
                  </Button>

                  <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Aguardando pagamento...</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
