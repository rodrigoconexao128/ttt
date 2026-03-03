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
  Clock,
  Upload,
  FileImage
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getAuthToken, refreshSession } from "@/lib/supabase";
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
  
  // Estado para parcelamento (apenas planos de implementação)
  const [installments, setInstallments] = useState<number>(1);
  const [installmentOptions, setInstallmentOptions] = useState<Array<{
    installments: number;
    installment_rate: number;
    installment_amount: number;
    total_amount: number;
    recommended_message: string;
    payment_method_option_id?: string;
  }>>([]);
  const [loadingInstallments, setLoadingInstallments] = useState(false);
  const [currentBin, setCurrentBin] = useState<string>("");
  
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
  
  // Estados para upload de comprovante PIX
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  // Resetar estados de parcelas quando o modal abre ou subscriptionId muda
  useEffect(() => {
    if (open) {
      setCurrentBin(""); // Força nova busca de parcelas
      setInstallmentOptions([]);
      setInstallments(1);
    }
  }, [open, subscriptionId]);

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

  // ═══════════════════════════════════════════════════════════════════
  // VERIFICAR SE PIX MANUAL ESTÁ ATIVADO NO ADMIN
  // Se sim, forçar método de pagamento para PIX e esconder opção cartão
  // ═══════════════════════════════════════════════════════════════════
  const { data: checkoutConfig } = useQuery({
    queryKey: ["checkout-config"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/checkout/config");
      return res.json();
    },
    enabled: open,
  });
  
  const pixManualEnabled = checkoutConfig?.pix_manual_enabled === true;
  
  // ═══════════════════════════════════════════════════════════════════
  // BUSCAR DOCUMENTO SALVO DO USUÁRIO PARA PRÉ-PREENCHER
  // ═══════════════════════════════════════════════════════════════════
  const { data: savedDocument } = useQuery({
    queryKey: ["user-document"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/user/document");
      return res.json();
    },
    enabled: open,
  });
  
  // Pré-preencher documento salvo quando carregar
  useEffect(() => {
    if (savedDocument && open) {
      if (savedDocument.document_type && !docType) {
        setDocType(savedDocument.document_type);
      }
      if (savedDocument.document_number && !docNumber) {
        setDocNumber(savedDocument.document_number);
      }
    }
  }, [savedDocument, open]);
  
  // Forçar PIX quando pix_manual_enabled está ativo
  useEffect(() => {
    if (pixManualEnabled && paymentMethod !== "pix") {
      setPaymentMethod("pix");
    }
  }, [pixManualEnabled, paymentMethod]);

  // ═══════════════════════════════════════════════════════════════════
  // AUTO-GERAR PIX QUANDO MODAL ABRIR COM PIX SELECIONADO
  // ═══════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (open && paymentMethod === "pix" && !pixData && !isProcessing && subscriptionId && email) {
      console.log("[Auto-PIX] Gerando PIX automaticamente...");
      handlePixSubmit();
    }
  }, [open, paymentMethod, subscriptionId, email]);

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

  // ═══════════════════════════════════════════════════════════════════════════════
  // BUSCAR PARCELAS REAIS DA API DO MERCADO PAGO
  // Usa mp.getInstallments() para obter opções com juros corretos
  // ═══════════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const fetchInstallments = async () => {
      const clean = cardNumber.replace(/\s/g, "");
      // BIN são os primeiros 6-8 dígitos do cartão
      const bin = clean.slice(0, 8);
      
      // Calcular o valor a cobrar - prioriza valorPrimeiraCobranca para planos de implementação
      const planPrice = plan?.valor || plan?.price || "0";
      const setupFee = plan?.valorPrimeiraCobranca ? parseFloat(plan.valorPrimeiraCobranca) : 0;
      const monthlyPriceCalc = subscription?.couponPrice ? parseFloat(subscription.couponPrice) : parseFloat(planPrice);
      
      // Se tiver taxa de setup (implementação), usa ela, senão usa o preço mensal
      const hasSetupFeeCalc = setupFee > 0 && setupFee !== monthlyPriceCalc;
      const amountToCharge = hasSetupFeeCalc ? setupFee : monthlyPriceCalc;
      
      // Só buscar se: tiver MP, tiver pelo menos 6 dígitos do cartão, e tiver um valor válido
      if (!mpInstanceRef.current || bin.length < 6 || !amountToCharge || amountToCharge < 1) {
        return;
      }
      
      // Criar chave única combinando BIN + valor para detectar mudanças de plano
      const cacheKey = `${bin}_${amountToCharge.toFixed(2)}`;
      
      // Evitar buscas repetidas para o mesmo BIN + valor
      if (cacheKey === currentBin) return;
      
      setLoadingInstallments(true);
      setCurrentBin(cacheKey);
      
      try {
        console.log("[Installments] Buscando parcelas para BIN:", bin, "Valor:", amountToCharge);
        
        const installmentsResponse = await mpInstanceRef.current.getInstallments({
          amount: String(amountToCharge),
          bin: bin,
          paymentTypeId: 'credit_card'
        });
        
        if (installmentsResponse && installmentsResponse.length > 0) {
          const payerCosts = installmentsResponse[0].payer_costs || [];
          console.log("[Installments] Opções recebidas:", payerCosts.length);
          
          // Mapear as opções de parcelas
          const options = payerCosts.map((cost: any) => ({
            installments: cost.installments,
            installment_rate: cost.installment_rate,
            installment_amount: cost.installment_amount,
            total_amount: cost.total_amount,
            recommended_message: cost.recommended_message,
            payment_method_option_id: cost.payment_method_option_id,
          }));
          
          setInstallmentOptions(options);
          
          // Resetar parcelas selecionadas para 1x se não houver opção válida
          if (!options.find((o: any) => o.installments === installments)) {
            setInstallments(1);
          }
        } else {
          console.log("[Installments] Nenhuma opção disponível");
          setInstallmentOptions([]);
        }
      } catch (err) {
        console.error("[Installments] Erro ao buscar parcelas:", err);
        setInstallmentOptions([]);
      } finally {
        setLoadingInstallments(false);
      }
    };
    
    // Debounce para evitar muitas chamadas durante digitação
    const timeoutId = setTimeout(fetchInstallments, 500);
    return () => clearTimeout(timeoutId);
  }, [cardNumber, plan, subscription, mpReady]);

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

  // Mutation para cartão - VERSÃO 2025: Dois tokens para cobrança imediata + assinatura recorrente
  // Token 1 (paymentToken): Para cobrança IMEDIATA via /v1/payments (pode ser parcelado)
  // Token 2 (subscriptionToken): Para assinatura recorrente via /preapproval (começa no próximo mês)
  const createSubscription = useMutation({
    mutationFn: async (tokens: { paymentToken: string; subscriptionToken: string }) => {
      const paymentMethodMap: Record<string, string> = {
        visa: "visa", mastercard: "master", amex: "amex", elo: "elo", hipercard: "hipercard"
      };
      const paymentMethodId = cardBrand ? paymentMethodMap[cardBrand] || "visa" : "visa";
      
      const res = await apiRequest("POST", "/api/subscriptions/create-mp-subscription", {
        subscriptionId,
        paymentToken: tokens.paymentToken,         // Token para pagamento imediato
        subscriptionToken: tokens.subscriptionToken, // Token para assinatura recorrente
        payerEmail: email,
        paymentMethodId,
        cardholderName: cardHolder,
        identificationNumber: docNumber.replace(/\D/g, ""),
        identificationType: docType,
        installments: installments, // Número de parcelas para o primeiro pagamento
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

  // ═══════════════════════════════════════════════════════════════════════════════
  // UPLOAD DE COMPROVANTE PIX - Libera acesso temporário
  // ═══════════════════════════════════════════════════════════════════════════════
  const handleReceiptUpload = async () => {
    if (!receiptFile) {
      toast({ title: "Erro", description: "Selecione um arquivo para enviar.", variant: "destructive" });
      return;
    }
    if (!subscriptionId) {
      toast({ title: "Erro", description: "Assinatura não encontrada. Recarregue a página.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      // Calcular amount: usar pixData se disponível, senão calcular do plano
      const planPrice = plan?.valor || plan?.price || "0";
      const setupFee = plan?.valorPrimeiraCobranca ? parseFloat(plan.valorPrimeiraCobranca) : 0;
      const monthlyPrice = subscription?.couponPrice ? parseFloat(subscription.couponPrice) : parseFloat(planPrice);
      const hasSetupFee = setupFee > 0 && setupFee !== monthlyPrice;
      const fallbackAmount = hasSetupFee ? setupFee : monthlyPrice;

      const uploadAmount = pixData?.amount ?? fallbackAmount;
      const uploadPaymentId = pixData?.paymentId || `manual_${subscriptionId}`;

      const buildFormData = () => {
        const formData = new FormData();
        formData.append("receipt", receiptFile);
        formData.append("subscriptionId", subscriptionId);
        formData.append("paymentId", uploadPaymentId);
        formData.append("amount", uploadAmount.toString());
        return formData;
      };

      const memberToken = localStorage.getItem("memberToken");
      let token = memberToken || await getAuthToken();

      const doUpload = async (authToken: string | null) => {
        const headers: Record<string, string> = {};
        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
        }
        return fetch("/api/payment-receipts/upload", {
          method: "POST",
          body: buildFormData(),
          credentials: "include",
          headers
        });
      };

      let response = await doUpload(token);

      if (response.status === 401 && memberToken) {
        token = await getAuthToken();
        if (token) {
          response = await doUpload(token);
        }
      }

      if (response.status === 401 && !memberToken) {
        const refreshed = await refreshSession();
        if (refreshed) {
          token = await getAuthToken();
          response = await doUpload(token);
        }
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro ao enviar comprovante");
      }

      setUploadSuccess(true);
      setShowUploadModal(false);
      setReceiptFile(null);
      
      toast({ 
        title: "Comprovante enviado!", 
        description: "Seu acesso foi liberado. Aguarde a confirmação do administrador." 
      });
      
      // Fechar modal principal e notificar sucesso
      setTimeout(() => {
        onOpenChange(false);
        if (onSuccess) onSuccess();
      }, 2000);
      
    } catch (error: any) {
      toast({ 
        title: "Erro ao enviar", 
        description: error.message || "Tente novamente mais tarde.", 
        variant: "destructive" 
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validar tipo de arquivo (imagens e PDF)
      const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
      if (!validTypes.includes(file.type)) {
        toast({ 
          title: "Formato inválido", 
          description: "Envie uma imagem (JPG, PNG, GIF, WebP) ou PDF.", 
          variant: "destructive" 
        });
        return;
      }
      // Validar tamanho (máximo 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({ 
          title: "Arquivo muito grande", 
          description: "O arquivo deve ter no máximo 5MB.", 
          variant: "destructive" 
        });
        return;
      }
      setReceiptFile(file);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // HANDLE SUBMIT - VERSÃO 2025: Gerar DOIS tokens para cobrança imediata + assinatura
  // ═══════════════════════════════════════════════════════════════════════════════
  // O MercadoPago.js permite gerar múltiplos tokens do mesmo cartão
  // Token 1 (paymentToken): Será usado para /v1/payments (cobrança IMEDIATA)
  // Token 2 (subscriptionToken): Será usado para /preapproval (assinatura recorrente)
  // ═══════════════════════════════════════════════════════════════════════════════
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
      
      // Dados do cartão para criar os tokens
      const cardData = {
        cardNumber: cardNumber.replace(/\s/g, ""),
        cardholderName: cardHolder,
        cardExpirationMonth: expirationMonth,
        cardExpirationYear: "20" + expirationYear,
        securityCode: cvv,
        identificationType: docType,
        identificationNumber: docNumber.replace(/\D/g, ""),
      };
      
      // ═══════════════════════════════════════════════════════════════════
      // GERAR DOIS TOKENS DO MESMO CARTÃO
      // Cada token só pode ser usado UMA vez, por isso precisamos de dois
      // ═══════════════════════════════════════════════════════════════════
      console.log("[Subscribe] Gerando dois tokens para pagamento imediato + assinatura...");
      
      // Token 1: Para pagamento imediato via /v1/payments
      const paymentToken = await mpInstanceRef.current.createCardToken(cardData);
      if (paymentToken?.error || paymentToken?.message) {
        throw new Error(paymentToken.error || paymentToken.message || "Erro ao processar cartão (token 1)");
      }
      if (!paymentToken || !paymentToken.id) {
        throw new Error("Não foi possível processar os dados do cartão (token 1).");
      }
      console.log("[Subscribe] Token 1 (pagamento) criado:", paymentToken.id.substring(0, 20) + "...");
      
      // Token 2: Para assinatura recorrente via /preapproval
      const subscriptionToken = await mpInstanceRef.current.createCardToken(cardData);
      if (subscriptionToken?.error || subscriptionToken?.message) {
        throw new Error(subscriptionToken.error || subscriptionToken.message || "Erro ao processar cartão (token 2)");
      }
      if (!subscriptionToken || !subscriptionToken.id) {
        throw new Error("Não foi possível processar os dados do cartão (token 2).");
      }
      console.log("[Subscribe] Token 2 (assinatura) criado:", subscriptionToken.id.substring(0, 20) + "...");
      
      // Enviar ambos os tokens para o backend
      createSubscription.mutate({
        paymentToken: paymentToken.id,
        subscriptionToken: subscriptionToken.id,
      });
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
  
  // Verificar se é plano de implementação elegível para parcelamento
  // Permite parcelar se: tem valor de implementação >= R$100, é plano tipo implementacao, ou é plano anual
  const isImplementationPlan = hasSetupFee || plan?.tipo === "implementacao" || plan?.tipo === "implementacao_mensal";
  const canInstallment = (isImplementationPlan || isAnnual) && totalInitial >= 100;
  
  // Calcular valor da parcela baseado nas opções da API ou valor total
  const selectedInstallmentOption = installmentOptions.find(o => o.installments === installments);
  const installmentValue = selectedInstallmentOption 
    ? selectedInstallmentOption.installment_amount 
    : totalInitial;

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
                  <span>{pixManualEnabled ? "Pagamento 100% seguro via PIX" : "Pagamento 100% seguro via Mercado Pago"}</span>
                </div>
              </div>
            </div>

            {/* LADO DIREITO - Formulário (Light) - Shopify style */}
            <div className="w-full md:w-[58%] p-8 md:p-10 bg-[#fafafa]">
              {/* Seleção de método */}
              <div className="mb-4 space-y-2">
                {/* Opção Cartão de Crédito - ESCONDIDA quando PIX manual está ativo */}
                {!pixManualEnabled && (
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
                )}

                {/* Opção PIX - Sempre visível, com texto diferente para PIX manual */}
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
                      {pixManualEnabled ? "Manual" : "Imediato"}
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

                  {/* Seletor de Parcelas - usa dados REAIS da API do Mercado Pago */}
                  {canInstallment && (
                    <div className="p-4 bg-muted/40 border border-border rounded-lg">
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        {isAnnual ? "Parcelamento do plano anual" : "Parcelamento da implementação"}
                      </label>
                      
                      {loadingInstallments ? (
                        <div className="flex items-center justify-center py-3 text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          <span className="text-sm">Carregando opções de parcelas...</span>
                        </div>
                      ) : installmentOptions.length > 0 ? (
                        <select
                          value={installments}
                          onChange={(e) => setInstallments(Number(e.target.value))}
                          className="w-full h-12 rounded-md border border-input bg-background px-3 text-base font-medium"
                        >
                          {installmentOptions.map((option) => (
                            <option key={option.installments} value={option.installments}>
                              {option.recommended_message}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-center py-3">
                          <p className="text-sm text-gray-600">
                            {cardNumber.replace(/\s/g, "").length < 6 
                              ? "Digite o número do cartão para ver as opções de parcelamento"
                              : "À vista: R$ " + totalInitial.toFixed(2).replace(".", ",")}
                          </p>
                        </div>
                      )}
                      
                      {/* Nota para planos com implementação (não anuais) */}
                      {installmentOptions.length > 0 && !isAnnual && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          A mensalidade de R$ {monthlyPrice.toFixed(2).replace(".", ",")}/{periodLabel} será cobrada somente a partir do mês seguinte à confirmação do pagamento da implementação.
                        </p>
                      )}
                      
                      {/* Nota para planos anuais */}
                      {installmentOptions.length > 0 && isAnnual && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Pagamento único parcelado no cartão de crédito. Seu plano anual estará ativo por 12 meses.
                        </p>
                      )}
                    </div>
                  )}

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
                    ) : isAnnual ? (
                      installments > 1 
                        ? `Pagar em ${installments}x de R$ ${installmentValue.toFixed(2).replace(".", ",")}`
                        : `Pagar R$ ${totalInitial.toFixed(2).replace(".", ",")} à vista`
                    ) : installments > 1 ? (
                      `Assinar em ${installments}x de R$ ${installmentValue.toFixed(2).replace(".", ",")}`
                    ) : (
                      `Assinar por R$ ${totalInitial.toFixed(2).replace(".", ",")}`
                    )}
                  </Button>
                  
                  {(isProcessing || createSubscription.isPending) && (
                    <div className="p-3 bg-muted/40 border border-border rounded-lg text-sm text-center text-foreground">
                      <p className="font-medium">Estamos processando seu pagamento</p>
                      <p className="text-xs mt-1 text-muted-foreground">Por favor, aguarde. Isso pode levar alguns segundos.</p>
                    </div>
                  )}
                </form>
              )}

              {/* FORM PIX - AUTO-GERA AUTOMATICAMENTE */}
              {paymentMethod === "pix" && !pixData && (
                <div className="space-y-3 text-center py-8">
                  {error && (
                    <div className="p-2 bg-red-50 border border-red-200 rounded text-red-600 text-xs mb-4">
                      {error}
                      <button
                        onClick={() => { setError(null); handlePixSubmit(); }}
                        className="block mx-auto mt-2 text-xs text-primary underline"
                      >
                        Tentar novamente
                      </button>
                    </div>
                  )}

                  {!error && (
                    <>
                      <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin text-green-600" />
                      <p className="text-base font-medium text-gray-700">Gerando QR Code PIX...</p>
                      <p className="text-sm text-gray-500">Aguarde alguns instantes</p>
                    </>
                  )}

                  {/* Fallback: permitir enviar comprovante mesmo sem QR Code */}
                  {error && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm text-gray-600 mb-2">Já fez o pagamento PIX por outra via?</p>
                      <button
                        onClick={() => setShowUploadModal(true)}
                        className="text-sm text-primary hover:text-primary/80 underline underline-offset-2 font-medium"
                      >
                        Enviar comprovante de pagamento
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* PIX QR CODE */}
              {paymentMethod === "pix" && pixData && (
                <div className="space-y-4 text-center">
                  {pixData.qrCodeBase64 && (
                    <img 
                      src={pixData.qrCodeBase64.startsWith('data:') ? pixData.qrCodeBase64 : `data:image/png;base64,${pixData.qrCodeBase64}`}
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

                  <div className="text-left bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-600 mb-2">Pix Copia e Cola</p>
                    <code className="block text-[11px] leading-relaxed font-mono text-gray-800 break-all">
                      {pixData.qrCode}
                    </code>
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

                  {/* Botão "Já paguei" - minimalista */}
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="text-xs text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
                  >
                    Já paguei? Enviar comprovante
                  </button>

                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal de Upload do Comprovante - fora do bloco pixData para funcionar sempre */}
        {showUploadModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Enviar Comprovante</h3>
                <button 
                  onClick={() => {
                    setShowUploadModal(false);
                    setReceiptFile(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <p className="text-sm text-gray-600 mb-4">
                Envie o comprovante de pagamento PIX para liberarmos seu acesso.
              </p>

              {/* Área de upload */}
              <div 
                onClick={() => receiptInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
              >
                <input
                  ref={receiptInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {receiptFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileImage className="w-10 h-10 text-green-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {receiptFile.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {(receiptFile.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-10 h-10 text-gray-400" />
                    <span className="text-sm text-gray-500">
                      Clique para selecionar o comprovante
                    </span>
                    <span className="text-xs text-gray-400">
                      Imagem ou PDF (máx. 5MB)
                    </span>
                  </div>
                )}
              </div>

              {/* Botões */}
              <div className="flex gap-3 mt-6">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowUploadModal(false);
                    setReceiptFile(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleReceiptUpload}
                  disabled={!receiptFile || isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Enviar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
