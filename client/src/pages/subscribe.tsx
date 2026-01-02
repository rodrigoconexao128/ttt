import { useState, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Loader2, 
  Check, 
  Shield, 
  Lock, 
  CreditCard, 
  ArrowLeft,
  AlertCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════════════════════
// CHECKOUT PREMIUM - DESIGN SHOPIFY STYLE - v2.1
// Layout Split: Esquerda (Dark/Info) | Direita (Light/Form)
// Foco total em conversão e confiança
// ═══════════════════════════════════════════════════════════════════════════════

declare global {
  interface Window {
    MercadoPago: any;
  }
}

// Traduções PT-BR para erros do Mercado Pago
const MP_ERROR_TRANSLATIONS: Record<string, string> = {
  // Erros de cartão rejeitado
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
  
  // Erros de validação de campos
  "invalid_card_number": "Número do cartão inválido.",
  "invalid_expiration_date": "Data de validade inválida.",
  "invalid_security_code": "Código de segurança (CVV) inválido.",
  "invalid_holder_name": "Nome do titular deve conter apenas letras.",
  "invalid_identification": "CPF/CNPJ inválido. Verifique o número.",
  "card_token_creation_failed": "Erro ao processar o cartão. Tente novamente.",
  
  // Erros adicionais do MP
  "pending_contingency": "Pagamento em análise. Aguarde a confirmação.",
  "pending_review_manual": "Pagamento em revisão manual.",
  "rejected": "Pagamento rejeitado. Tente outro cartão.",
  "cancelled": "Pagamento cancelado.",
  "refunded": "Pagamento estornado.",
  "charged_back": "Pagamento contestado.",
  
  // Erros de SDK
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

export default function Subscribe() {
  const [location, setLocation] = useLocation();
  const [, params] = useRoute("/subscribe/:id");
  const subscriptionId = params?.id || null;
  const { toast } = useToast();

  // Estados do formulário
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvv, setCvv] = useState("");
  const [docType, setDocType] = useState("CPF");
  const [docNumber, setDocNumber] = useState("");
  const [email, setEmail] = useState(""); // Email para o MP
  const [isProcessing, setIsProcessing] = useState(false);
  const [mpReady, setMpReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardBrand, setCardBrand] = useState<string | null>(null);
  
  const mpInstanceRef = useRef<any>(null);

  // Buscar assinatura e plano
  const { data: subscription, isLoading: subscriptionLoading } = useQuery({
    queryKey: ["subscription", subscriptionId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/subscriptions/${subscriptionId}`);
      return res.json();
    },
    enabled: !!subscriptionId,
  });

  const plan = subscription?.plan;

  // Buscar config MP
  const { data: mpConfig } = useQuery({
    queryKey: ["mp-public-key"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/mercadopago/public-key");
      return res.json();
    },
  });

  // Inicializar MP
  useEffect(() => {
    if (!mpConfig?.publicKey) return;
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
  }, [mpConfig]);

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

  // Mutation
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
      if (data.status === "approved") {
        toast({ 
          title: "🎉 Assinatura ativada com sucesso!", 
          description: "Cobranças automáticas configuradas. Bem-vindo ao AgenteZap!" 
        });
        setTimeout(() => setLocation("/dashboard"), 2000);
      } else if (data.initPoint) {
        // Fallback mode: user needs to complete payment via init_point
        toast({ 
          title: "Finalize seu pagamento", 
          description: "Clique no botão para completar a assinatura." 
        });
        // Open init_point to complete payment
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
      console.log("Iniciando createCardToken...");
      const cardToken = await mpInstanceRef.current.createCardToken({
        cardNumber: cardNumber.replace(/\s/g, ""),
        cardholderName: cardHolder,
        cardExpirationMonth: expirationMonth,
        cardExpirationYear: "20" + expirationYear,
        securityCode: cvv,
        identificationType: docType,
        identificationNumber: docNumber.replace(/\D/g, ""),
      });
      console.log("cardToken result:", cardToken);
      
      // Verificar se o resultado contém erro (MP pode retornar erro no objeto)
      if (cardToken?.error || cardToken?.message) {
        const errorText = cardToken.error || cardToken.message || "Erro ao processar cartão";
        console.log("Erro no cardToken:", errorText);
        throw new Error(errorText);
      }
      
      if (!cardToken || !cardToken.id) {
        throw new Error("Não foi possível processar os dados do cartão. Verifique as informações.");
      }
      
      createSubscription.mutate(cardToken.id);
    } catch (err: any) {
      console.error("Erro token:", err);
      console.error("Erro message:", err?.message);
      console.error("Erro tipo:", typeof err);
      // Mensagens de erro detalhadas
      let errorMessage = "Verifique os dados do cartão.";
      
      // Captura qualquer forma do erro
      const errMsg = String(err?.message || err?.error || err?.errorMessage || String(err) || "").toLowerCase();
      console.error("errMsg:", errMsg);
      
      // Detectar erros de HTTPS/SSL (comum em localhost)
      if (errMsg.includes("card token") || 
          errMsg.includes("service not found") ||
          errMsg.includes("token service") ||
          errMsg.includes("secure") ||
          errMsg.includes("https") ||
          errMsg.includes("ssl") ||
          errMsg.includes("insecure")) {
        errorMessage = "⚠️ Pagamento seguro requer HTTPS. Em produção (Railway), o pagamento funcionará normalmente.";
      } else if (err?.cause?.[0]?.code) {
        const code = err.cause[0].code;
        if (code === "205" || code === "E205") errorMessage = "Número do cartão inválido.";
        else if (code === "208" || code === "E208") errorMessage = "Mês de validade inválido.";
        else if (code === "209" || code === "E209") errorMessage = "Ano de validade inválido.";
        else if (code === "212" || code === "E212") errorMessage = "Documento inválido.";
        else if (code === "214" || code === "E214") errorMessage = "Documento inválido.";
        else if (code === "220" || code === "E220") errorMessage = "Banco emissor não permitido.";
        else if (code === "221" || code === "E221") errorMessage = "Nome do titular inválido.";
        else if (code === "224" || code === "E224") errorMessage = "Código de segurança (CVV) inválido.";
        else if (code === "325") errorMessage = "Mês de validade inválido.";
        else if (code === "326") errorMessage = "Ano de validade inválido.";
      } else if (errMsg) {
        errorMessage = translateMPError(errMsg);
      }
      
      setError(errorMessage);
      setIsProcessing(false);
    }
  };

  if (subscriptionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!plan) return null;

  // Extrair valores do plano (campos do banco: nome, valor, valorPrimeiraCobranca)
  const planName = plan.nome || plan.name || "Plano";
  const planPrice = plan.valor || plan.price || "0";
  const setupFee = plan.valorPrimeiraCobranca ? parseFloat(plan.valorPrimeiraCobranca) : 0;
  const monthlyPrice = subscription?.couponPrice ? parseFloat(subscription.couponPrice) : parseFloat(planPrice);
  const hasSetupFee = setupFee > 0 && setupFee !== monthlyPrice;
  const frequencyDays = plan.frequenciaDias || 30;
  const isAnnual = frequencyDays >= 360 || plan.tipo === "anual";
  const periodLabel = isAnnual ? "ano" : "mês";

  // Calcular valor total inicial (setup + primeiro mês ou apenas mensal)
  const totalInitial = hasSetupFee ? setupFee : monthlyPrice;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      
      {/* LADO ESQUERDO - DARK (Informações e Valor) */}
      <div className="w-full lg:w-[45%] bg-[#1a1a1a] text-white p-6 lg:p-12 flex flex-col justify-between relative overflow-hidden">
        {/* Background Pattern sutil */}
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute right-0 top-0 w-64 h-64 bg-primary/20 blur-[100px] rounded-full" />
          <div className="absolute left-0 bottom-0 w-64 h-64 bg-blue-500/20 blur-[100px] rounded-full" />
        </div>

        <div className="relative z-10">
          <div className="mb-8">
            <Button 
              variant="ghost" 
              className="text-gray-400 hover:text-white pl-0 -ml-2 mb-6"
              onClick={() => setLocation("/plans")}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para planos
            </Button>
            
            <h1 className="text-2xl lg:text-3xl font-bold mb-2">
              {hasSetupFee ? (
                <>
                  Implementação + Plano por{" "}
                  <span className="text-primary">R$ {totalInitial.toFixed(2).replace(".", ",")}</span>
                </>
              ) : (
                <>
                  Volte aos negócios por{" "}
                  <span className="text-primary">R$ {monthlyPrice.toFixed(2).replace(".", ",")}</span>
                </>
              )}
            </h1>
            <p className="text-gray-400 text-sm lg:text-base">
              Desbloqueie todo o potencial da sua operação com o plano {planName}.
            </p>
          </div>

          <div className="space-y-6">
            {hasSetupFee && (
              <div className="flex items-start gap-3">
                <div className="mt-1 bg-yellow-500/20 p-1 rounded-full">
                  <Check className="w-4 h-4 text-yellow-400" />
                </div>
                <div>
                  <p className="font-medium">Hoje: R$ {setupFee.toFixed(2).replace(".", ",")} (Implementação)</p>
                  <p className="text-sm text-gray-400">Configuração completa do seu agente + suporte VIP.</p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <div className="mt-1 bg-primary/20 p-1 rounded-full">
                <Check className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">Ativação Imediata</p>
                <p className="text-sm text-gray-400">Comece a usar todas as ferramentas agora mesmo.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1 bg-primary/20 p-1 rounded-full">
                <Check className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">
                  {hasSetupFee 
                    ? `Depois: R$ ${monthlyPrice.toFixed(2).replace(".", ",")}/${periodLabel}` 
                    : `Hoje: R$ ${monthlyPrice.toFixed(2).replace(".", ",")}/${periodLabel}`}
                </p>
                <p className="text-sm text-gray-400">Preço fixo, sem surpresas na fatura.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1 bg-primary/20 p-1 rounded-full">
                <Check className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">Sempre: Sem fidelidade</p>
                <p className="text-sm text-gray-400">Cancele quando quiser, sem multas ou taxas.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-8 lg:mt-0 pt-8 border-t border-white/10">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Shield className="w-4 h-4" />
            <span>Pagamento 100% seguro via Mercado Pago</span>
          </div>
        </div>
      </div>

      {/* LADO DIREITO - LIGHT (Formulário) */}
      <div className="w-full lg:w-[55%] bg-white p-6 lg:p-12 flex flex-col justify-center">
        <div className="max-w-md mx-auto w-full">
          
          <div className="mb-8 border rounded-lg p-4 bg-gray-50 flex items-center justify-between cursor-pointer border-primary ring-1 ring-primary/20">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border-[5px] border-primary bg-white" />
              <span className="font-medium text-gray-900">Cartão de crédito</span>
            </div>
            <div className="flex gap-1">
              <img src="https://img.icons8.com/color/48/visa.png" alt="Visa" className="h-6" />
              <img src="https://img.icons8.com/color/48/mastercard.png" alt="Master" className="h-6" />
              <img src="https://img.icons8.com/color/48/amex.png" alt="Amex" className="h-6" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            
            <div className="relative">
              <Input
                placeholder="Número do cartão"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                maxLength={19}
                className="h-12 pl-10 bg-white border-gray-300 focus:border-primary focus:ring-primary"
                required
              />
              <CreditCard className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
              <div className="absolute right-3 top-3.5">
                {cardBrand && <span className="text-xs font-bold uppercase text-gray-500">{cardBrand}</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                placeholder="Validade (MM/AA)"
                value={expiryDate}
                onChange={(e) => setExpiryDate(formatExpiryDate(e.target.value))}
                maxLength={5}
                className="h-12 bg-white border-gray-300 focus:border-primary focus:ring-primary"
                required
              />
              <div className="relative">
                <Input
                  placeholder="CVV"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  maxLength={4}
                  className="h-12 bg-white border-gray-300 focus:border-primary focus:ring-primary"
                  required
                />
                <Lock className="absolute right-3 top-3.5 h-4 w-4 text-gray-400" />
              </div>
            </div>

            <Input
              placeholder="Nome impresso no cartão"
              value={cardHolder}
              onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
              className="h-12 bg-white border-gray-300 focus:border-primary focus:ring-primary"
              required
            />

            <div className="grid grid-cols-3 gap-4">
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="col-span-1 h-12 rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-primary focus:ring-primary"
              >
                <option value="CPF">CPF</option>
                <option value="CNPJ">CNPJ</option>
              </select>
              <Input
                placeholder="Número do documento"
                value={docNumber}
                onChange={(e) => setDocNumber(formatDoc(e.target.value))}
                className="col-span-2 h-12 bg-white border-gray-300 focus:border-primary focus:ring-primary"
                required
              />
            </div>

            <Input
              type="email"
              placeholder="Seu melhor e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 bg-white border-gray-300 focus:border-primary focus:ring-primary"
              required
            />

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full h-14 text-lg font-bold bg-black hover:bg-gray-800 text-white shadow-lg transition-all mt-4"
              disabled={isProcessing || !mpReady}
            >
              {isProcessing ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : hasSetupFee ? (
                `Pagar R$ ${totalInitial.toFixed(2).replace(".", ",")}`
              ) : (
                `Assinar por R$ ${monthlyPrice.toFixed(2).replace(".", ",")}/${periodLabel}`
              )}
            </Button>

            <p className="text-xs text-center text-gray-500 mt-4">
              {hasSetupFee ? (
                <>
                  Hoje você paga R$ {setupFee.toFixed(2).replace(".", ",")} (implementação). 
                  A partir de {new Date(new Date().setDate(new Date().getDate() + frequencyDays)).toLocaleDateString('pt-BR')}, 
                  será cobrado R$ {monthlyPrice.toFixed(2).replace(".", ",")}/{periodLabel} automaticamente. Cancele a qualquer momento.
                </>
              ) : (
                <>
                  Renova automaticamente em {new Date(new Date().setDate(new Date().getDate() + frequencyDays)).toLocaleDateString('pt-BR')} 
                  {" "}no plano {planName} por R$ {monthlyPrice.toFixed(2).replace(".", ",")}/{periodLabel}. Cancele a qualquer momento.
                </>
              )}
            </p>

          </form>
        </div>
      </div>
    </div>
  );
}
