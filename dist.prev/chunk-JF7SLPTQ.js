import {
  mercadoPagoService
} from "./chunk-EMJDESES.js";
import {
  storage,
  supabase
} from "./chunk-LNV4NOA2.js";

// server/pixService.ts
import QRCode from "qrcode";
async function generatePixQRCode(paymentData) {
  try {
    const pixKeyConfig = await storage.getSystemConfig("pix_key");
    const merchantNameConfig = await storage.getSystemConfig("merchant_name");
    const merchantCityConfig = await storage.getSystemConfig("merchant_city");
    const pixKeyRaw = paymentData.pixKeyOverride || pixKeyConfig?.valor || "rodrigoconexao128@gmail.com";
    const merchantNameRaw = merchantNameConfig?.valor || "RODRIGO MACEDO";
    const merchantCityRaw = merchantCityConfig?.valor || "COSMORAMA";
    let pixKey = String(pixKeyRaw).replace(/\s+/g, "").trim();
    const cleanKey = pixKey.replace(/\+55/g, "");
    let onlyDigits = cleanKey.replace(/\D/g, "");
    if (onlyDigits.length >= 10 && onlyDigits.length <= 13) {
      if (onlyDigits.length >= 12 && onlyDigits.startsWith("55")) {
        onlyDigits = onlyDigits.substring(2);
      }
      pixKey = "+55" + onlyDigits;
    }
    const baseId = String(paymentData.subscriptionId || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const randomSuffix = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 10);
    const txid = (baseId + randomSuffix).substring(0, 25) || "TX" + Date.now().toString().substring(0, 23);
    const valorNum = typeof paymentData.valor === "string" ? parseFloat(String(paymentData.valor).replace(",", ".")) : Number(paymentData.valor || 0);
    const valor = Number.isFinite(valorNum) && valorNum > 0 ? Number(valorNum.toFixed(2)) : 0.01;
    const sanitize = (s, max) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ]/g, "").replace(/\s+/g, " ").trim().toUpperCase().slice(0, max);
    const name = sanitize(merchantNameRaw, 25);
    const city = sanitize(merchantCityRaw, 15);
    const message = sanitize(`Pagamento ${paymentData.planNome || ""}`, 50);
    const tlv = (id, value) => id + String(value.length).padStart(2, "0") + value;
    const maids = tlv("00", "br.gov.bcb.pix") + tlv("01", pixKey);
    const merchantAccountInfo = tlv("26", maids);
    const amount = valor.toFixed(2);
    const base = "" + tlv("00", "01") + tlv("01", "11") + merchantAccountInfo + tlv("52", "0000") + tlv("53", "986") + tlv("54", amount) + tlv("58", "BR") + tlv("59", name) + tlv("60", city) + tlv("62", tlv("05", txid));
    const crcInput = base + "6304";
    let crc = 65535;
    for (let i = 0; i < crcInput.length; i++) {
      crc ^= crcInput.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = crc & 32768 ? crc << 1 ^ 4129 : crc << 1;
        crc &= 65535;
      }
    }
    const crcHex = crc.toString(16).toUpperCase().padStart(4, "0");
    const payload = crcInput + crcHex;
    console.log("[PIX Generation]", {
      pixKeyRaw,
      pixKeyFormatted: pixKey,
      amount: valor,
      txid,
      payload: payload.substring(0, 100) + "..."
    });
    const pixQrCode = await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", type: "image/png", margin: 1, width: 300 });
    return { pixCode: payload, pixQrCode };
  } catch (error) {
    console.error("Error generating PIX QR Code:", error);
    throw error;
  }
}

// server/resellerService.ts
import { v4 as uuidv4 } from "uuid";
var ResellerService = class {
  /**
   * Obtém o ID do plano a ser usado para clientes de revenda
   * Usa o plano mensal padrão ou cria um plano especial se necessário
   */
  async getResellerClientPlanId() {
    const plans = await storage.getActivePlans();
    const monthlyPlan = plans.find(
      (p) => (p.tipo === "padrao" || p.tipo === "mensal") && p.nome?.toLowerCase().includes("mensal")
    );
    if (monthlyPlan) {
      return monthlyPlan.id.toString();
    }
    if (plans.length > 0) {
      return plans[0].id.toString();
    }
    throw new Error("Nenhum plano dispon\xEDvel no sistema");
  }
  /**
   * Verifica se um usuário tem plano de revenda ativo
   */
  async hasResellerPlan(userId) {
    const subscription = await storage.getUserSubscription(userId);
    if (!subscription || subscription.status !== "active") {
      return false;
    }
    const plan = await storage.getPlan(subscription.planId);
    return plan?.tipo === "revenda";
  }
  /**
   * Configura um usuário como revendedor (cria registro na tabela resellers)
   */
  async setupReseller(userId, data) {
    try {
      const existingReseller = await storage.getResellerByUserId(userId);
      if (existingReseller) {
        const updated = await storage.updateReseller(existingReseller.id, {
          ...data,
          costPerClient: "49.99"
          // Custo fixo por cliente
        });
        return { success: true, reseller: updated };
      }
      if (data.subdomain) {
        const isAvailable = await storage.isSubdomainAvailable(data.subdomain);
        if (!isAvailable) {
          return { success: false, error: "Subdom\xEDnio j\xE1 est\xE1 em uso" };
        }
      }
      const reseller = await storage.createReseller({
        userId,
        companyName: data.companyName,
        companyDescription: data.companyDescription,
        subdomain: data.subdomain,
        primaryColor: data.primaryColor || "#000000",
        secondaryColor: data.secondaryColor || "#ffffff",
        accentColor: data.accentColor || "#22c55e",
        clientMonthlyPrice: data.clientMonthlyPrice || "99.99",
        clientSetupFee: data.clientSetupFee || "0",
        costPerClient: "49.99",
        supportEmail: data.supportEmail,
        supportPhone: data.supportPhone,
        welcomeMessage: data.welcomeMessage,
        isActive: true,
        domainVerified: false
      });
      return { success: true, reseller };
    } catch (error) {
      console.error("[ResellerService] Erro ao configurar revendedor:", error);
      return { success: false, error: error.message };
    }
  }
  /**
   * Verifica se o revendedor já usou seu cliente gratuito
   */
  async hasFreeClientSlot(resellerId) {
    const freeClients = await storage.countFreeResellerClients(resellerId);
    return freeClients === 0;
  }
  /**
   * Cria um cliente GRATUITO para demonstração (1 por revendedor)
   */
  async createFreeClient(params) {
    const { resellerId, name, email, phone, password, clientPrice } = params;
    try {
      const reseller = await storage.getReseller(resellerId);
      if (!reseller || !reseller.isActive) {
        return { success: false, error: "Revendedor n\xE3o encontrado ou inativo" };
      }
      const hasFreeSlot = await this.hasFreeClientSlot(resellerId);
      if (!hasFreeSlot) {
        return { success: false, error: "Voc\xEA j\xE1 possui um cliente de demonstra\xE7\xE3o gratuito" };
      }
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return { success: false, error: "Este email j\xE1 est\xE1 cadastrado" };
      }
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, phone }
      });
      if (authError || !authData.user) {
        console.error("[ResellerService] Erro ao criar usu\xE1rio:", authError);
        return { success: false, error: authError?.message || "Erro ao criar usu\xE1rio" };
      }
      const user = await storage.upsertUser({
        id: authData.user.id,
        email,
        name,
        phone,
        role: "user",
        resellerId: reseller.id,
        onboardingCompleted: false
      });
      const resellerClient = await storage.createResellerClient({
        resellerId,
        userId: user.id,
        status: "active",
        monthlyCost: "0",
        // Gratuito para o revendedor também
        clientPrice: clientPrice || reseller.clientMonthlyPrice || "99.99",
        isFreeClient: true,
        activatedAt: /* @__PURE__ */ new Date()
      });
      const planId = await this.getResellerClientPlanId();
      const plan = await storage.getPlan(planId);
      const now = /* @__PURE__ */ new Date();
      const dataFim = new Date(now);
      if (plan && plan.periodicidade === "anual") {
        dataFim.setFullYear(dataFim.getFullYear() + 1);
      } else {
        dataFim.setMonth(dataFim.getMonth() + 1);
      }
      await storage.createSubscription({
        userId: user.id,
        planId,
        status: "active",
        dataInicio: now,
        dataFim,
        paymentMethod: "reseller_free"
      });
      console.log(`[ResellerService] Cliente gratuito ${email} criado para revendedor ${resellerId}`);
      return {
        success: true,
        clientId: resellerClient.id,
        userId: user.id,
        requiresPayment: false
      };
    } catch (error) {
      console.error("[ResellerService] Erro ao criar cliente gratuito:", error);
      return { success: false, error: error.message };
    }
  }
  /**
   * Cria checkout para novo cliente (PIX ou Cartão)
   * O revendedor paga R$ 49,99 por mês por cada cliente
   */
  async createClientCheckout(params) {
    const { resellerId, clientData, paymentMethod, cardData } = params;
    try {
      const reseller = await storage.getReseller(resellerId);
      if (!reseller || !reseller.isActive) {
        return { success: false, error: "Revendedor n\xE3o encontrado ou inativo" };
      }
      const activeClients = await storage.countActiveResellerClients(resellerId);
      if (activeClients >= (reseller.maxClients || 100)) {
        return { success: false, error: "Limite de clientes atingido" };
      }
      const existingUser = await storage.getUserByEmail(clientData.email);
      if (existingUser) {
        return { success: false, error: "Este email j\xE1 est\xE1 cadastrado" };
      }
      const costPerClient = Number(reseller.costPerClient || 49.99);
      const externalReference = `reseller_client_${uuidv4()}`;
      const resellerUser = await storage.getUser(reseller.userId);
      const payerEmail = resellerUser?.email || clientData.email;
      if (paymentMethod === "pix") {
        const pixManualConfig = await storage.getSystemConfig("pix_manual_enabled");
        const pixManualEnabled = pixManualConfig?.valor === "true";
        const payment = await storage.createResellerPayment({
          resellerId,
          amount: String(costPerClient),
          paymentType: "client_creation",
          status: "pending",
          payerEmail,
          paymentMethod: "pix",
          description: `Cria\xE7\xE3o de cliente: ${clientData.name} (${clientData.email})`
        });
        if (pixManualEnabled) {
          console.log("[ResellerService] Usando PIX Manual (chave PIX do sistema/plataforma)");
          try {
            const { pixCode, pixQrCode } = await generatePixQRCode({
              planNome: `Novo Cliente: ${clientData.name}`,
              valor: costPerClient,
              subscriptionId: payment.id
              // pixKeyOverride: undefined → usa a chave PIX do sistema (system_config.pix_key)
            });
            await storage.updateResellerPayment(payment.id, {
              statusDetail: JSON.stringify({
                clientData,
                externalReference,
                pixManual: true
              })
            });
            return {
              success: true,
              paymentId: payment.id,
              pixCode,
              pixQrCode,
              requiresPayment: true
            };
          } catch (error) {
            console.error("[ResellerService] Erro ao gerar PIX manual:", error);
            await storage.updateResellerPayment(payment.id, {
              status: "cancelled",
              statusDetail: JSON.stringify({ error: error.message })
            });
            return { success: false, error: "Erro ao gerar PIX. Tente novamente." };
          }
        } else {
          const creds = await mercadoPagoService.loadCredentials();
          if (!creds) {
            await storage.updateResellerPayment(payment.id, {
              status: "cancelled",
              statusDetail: JSON.stringify({ error: "MercadoPago n\xE3o configurado" })
            });
            return { success: false, error: "MercadoPago n\xE3o configurado" };
          }
          const pixPaymentData = {
            transaction_amount: costPerClient,
            payment_method_id: "pix",
            description: `AgentZap - Cria\xE7\xE3o de cliente: ${clientData.name}`,
            payer: {
              email: payerEmail
            },
            external_reference: `reseller_client_${payment.id}`,
            notification_url: `${process.env.BASE_URL || "https://agentezap.online"}/api/webhooks/mercadopago`,
            date_of_expiration: new Date(Date.now() + 30 * 60 * 1e3).toISOString()
          };
          const pixResponse = await fetch("https://api.mercadopago.com/v1/payments", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${creds.accessToken}`,
              "X-Idempotency-Key": `pix_reseller_${payment.id}_${Date.now()}`
            },
            body: JSON.stringify(pixPaymentData)
          });
          const pixResult = await pixResponse.json();
          console.log("[ResellerService] PIX Payment result:", {
            status: pixResult.status,
            statusDetail: pixResult.status_detail,
            id: pixResult.id,
            hasQrCode: !!pixResult.point_of_interaction?.transaction_data?.qr_code
          });
          if (pixResult.status === "pending" && pixResult.point_of_interaction?.transaction_data) {
            const transactionData = pixResult.point_of_interaction.transaction_data;
            await storage.updateResellerPayment(payment.id, {
              mpPaymentId: pixResult.id?.toString(),
              statusDetail: JSON.stringify({
                clientData,
                externalReference,
                mpPaymentId: pixResult.id
              })
            });
            return {
              success: true,
              paymentId: payment.id,
              pixCode: transactionData.qr_code,
              // Código Pix Copia e Cola
              pixQrCode: transactionData.qr_code_base64,
              // Imagem QR Code já em base64
              requiresPayment: true
            };
          } else {
            const errorMessage = pixResult.message || "Erro ao gerar PIX. Tente novamente.";
            console.error("[ResellerService] PIX Error:", pixResult);
            await storage.updateResellerPayment(payment.id, {
              status: "cancelled",
              statusDetail: JSON.stringify({ error: errorMessage })
            });
            return { success: false, error: errorMessage };
          }
        }
      } else if (paymentMethod === "credit_card" && cardData) {
        const creds = await mercadoPagoService.loadCredentials();
        if (!creds) {
          return { success: false, error: "MercadoPago n\xE3o configurado" };
        }
        const paymentBody = {
          transaction_amount: costPerClient,
          token: cardData.token,
          description: `AgentZap - Cliente ${clientData.name}`,
          installments: cardData.installments || 1,
          payment_method_id: "master",
          // Será detectado pelo token
          payer: {
            email: cardData.payerEmail || payerEmail
          },
          external_reference: externalReference
        };
        const response = await fetch("https://api.mercadopago.com/v1/payments", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${creds.accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(paymentBody)
        });
        const mpPayment = await response.json();
        if (mpPayment.status === "approved") {
          return await this.createPaidClient({
            resellerId,
            ...clientData,
            paymentId: mpPayment.id,
            paymentMethod: "credit_card"
          });
        } else if (mpPayment.status === "in_process" || mpPayment.status === "pending") {
          const payment = await storage.createResellerPayment({
            resellerId,
            amount: String(costPerClient),
            paymentType: "client_creation",
            status: "pending",
            mpPaymentId: mpPayment.id,
            payerEmail: cardData.payerEmail || payerEmail,
            paymentMethod: "credit_card",
            description: `Cria\xE7\xE3o de cliente: ${clientData.name}`,
            statusDetail: JSON.stringify({ clientData, externalReference })
          });
          return {
            success: true,
            paymentId: payment.id,
            requiresPayment: true,
            error: "Pagamento em processamento"
          };
        } else {
          return {
            success: false,
            error: `Pagamento rejeitado: ${mpPayment.status_detail || mpPayment.status}`
          };
        }
      }
      return { success: false, error: "M\xE9todo de pagamento inv\xE1lido" };
    } catch (error) {
      console.error("[ResellerService] Erro no checkout:", error);
      return { success: false, error: error.message };
    }
  }
  /**
   * Cria cliente após pagamento confirmado
   */
  async createPaidClient(params) {
    const { resellerId, name, email, phone, password, clientPrice, paymentId, paymentMethod } = params;
    try {
      const reseller = await storage.getReseller(resellerId);
      if (!reseller) {
        return { success: false, error: "Revendedor n\xE3o encontrado" };
      }
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, phone }
      });
      if (authError || !authData.user) {
        console.error("[ResellerService] Erro ao criar usu\xE1rio:", authError);
        return { success: false, error: authError?.message || "Erro ao criar usu\xE1rio" };
      }
      const user = await storage.upsertUser({
        id: authData.user.id,
        email,
        name,
        phone,
        role: "user",
        resellerId: reseller.id,
        onboardingCompleted: false
      });
      const resellerClient = await storage.createResellerClient({
        resellerId,
        userId: user.id,
        status: "active",
        monthlyCost: reseller.costPerClient || "49.99",
        clientPrice: clientPrice || reseller.clientMonthlyPrice || "99.99",
        isFreeClient: false,
        mpPaymentId: paymentId,
        mpStatus: "approved",
        activatedAt: /* @__PURE__ */ new Date()
      });
      await storage.createResellerPayment({
        resellerId,
        resellerClientId: resellerClient.id,
        amount: reseller.costPerClient || "49.99",
        paymentType: "client_creation",
        status: "approved",
        mpPaymentId: paymentId,
        paymentMethod,
        paidAt: /* @__PURE__ */ new Date(),
        description: `Cliente ${name} criado`
      });
      const planId = await this.getResellerClientPlanId();
      const plan = await storage.getPlan(planId);
      const now = /* @__PURE__ */ new Date();
      const dataFim = new Date(now);
      if (plan && plan.periodicidade === "anual") {
        dataFim.setFullYear(dataFim.getFullYear() + 1);
      } else {
        dataFim.setMonth(dataFim.getMonth() + 1);
      }
      await storage.createSubscription({
        userId: user.id,
        planId,
        status: "active",
        dataInicio: now,
        dataFim,
        paymentMethod: "reseller"
      });
      console.log(`[ResellerService] Cliente pago ${email} criado para revendedor ${resellerId}`);
      return {
        success: true,
        clientId: resellerClient.id,
        userId: user.id,
        requiresPayment: false
      };
    } catch (error) {
      console.error("[ResellerService] Erro ao criar cliente pago:", error);
      return { success: false, error: error.message };
    }
  }
  /**
   * Cria fatura granular para lista de clientes selecionados
   */
  async createGranularInvoice(resellerId, clientIds) {
    try {
      const reseller = await storage.getReseller(resellerId);
      if (!reseller) throw new Error("Revendedor n\xE3o encontrado");
      const unitPrice = Number(reseller.costPerClient || 49.99);
      let totalAmount = 0;
      const invoiceItems = [];
      for (const clientId of clientIds) {
        const client = await storage.getResellerClient(clientId);
        if (!client || client.resellerId !== resellerId) {
          console.warn(`Cliente ${clientId} inv\xE1lido para revendedor ${resellerId}`);
          continue;
        }
        totalAmount += unitPrice;
        invoiceItems.push({
          resellerClientId: clientId,
          amount: String(unitPrice),
          description: `Renova\xE7\xE3o SaaS - Cliente ${clientId}`
        });
      }
      if (invoiceItems.length === 0) {
        return { success: false, error: "Nenhum cliente v\xE1lido selecionado" };
      }
      const creds = await mercadoPagoService.loadCredentials();
      if (!creds) throw new Error("MercadoPago n\xE3o configurado na admin");
      const externalReference = `reseller_granular_${Date.now()}_${resellerId}`;
      const pixPaymentData = {
        transaction_amount: totalAmount,
        description: `Renova\xE7\xE3o de ${invoiceItems.length} clientes - Revenda`,
        payment_method_id: "pix",
        payer: {
          email: (await storage.getUser(reseller.userId))?.email || "reseller@agentezap.online",
          first_name: reseller.companyName
        },
        external_reference: externalReference,
        notification_url: `${process.env.BASE_URL || "https://agentezap.online"}/api/webhooks/mercadopago`
      };
      const pixResponse = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${creds.accessToken}`,
          "X-Idempotency-Key": externalReference
        },
        body: JSON.stringify(pixPaymentData)
      });
      const pixResult = await pixResponse.json();
      if (pixResult.status === "rejected") {
        return { success: false, error: "Pagamento rejeitado pelo Mercado Pago" };
      }
      const invoice = await storage.createResellerInvoiceWithItems(
        {
          resellerId,
          referenceMonth: (/* @__PURE__ */ new Date()).toISOString().slice(0, 7),
          // YYYY-MM
          dueDate: (/* @__PURE__ */ new Date()).toISOString(),
          // Hoje
          activeClients: invoiceItems.length,
          unitPrice: String(unitPrice),
          totalAmount: String(totalAmount),
          status: "pending",
          paymentMethod: "pix",
          mpPaymentId: String(pixResult.id)
        },
        invoiceItems
      );
      return {
        success: true,
        invoiceId: invoice.id,
        paymentUrl: pixResult.point_of_interaction?.transaction_data?.ticket_url,
        qrCode: pixResult.point_of_interaction?.transaction_data?.qr_code,
        totalAmount
      };
    } catch (error) {
      console.error("Erro ao criar fatura granular:", error);
      return { success: false, error: error.message };
    }
  }
  /**
   * Processa Webhook de pagamento granular (Pix Aprovado)
   */
  async processGranularPaymentWebhook(payment) {
    if (payment.status !== "approved") {
      console.log(`[ResellerService] Pagamento granular ${payment.id} n\xE3o aprovado (${payment.status})`);
      return;
    }
    const invoice = await storage.getResellerInvoiceByMpPaymentId(String(payment.id));
    if (!invoice) {
      console.error(`[ResellerService] Fatura granular n\xE3o encontrada para pagamento ${payment.id}`);
      return;
    }
    if (invoice.status === "paid") {
      console.log(`[ResellerService] Fatura ${invoice.id} j\xE1 est\xE1 paga.`);
      return;
    }
    await storage.updateResellerInvoice(invoice.id, {
      status: "paid",
      paidAt: /* @__PURE__ */ new Date(),
      paymentMethod: payment.payment_method_id
    });
    const items = await storage.getResellerInvoiceItems(invoice.id);
    for (const item of items) {
      if (!item.resellerClientId) continue;
      const client = await storage.getResellerClient(item.resellerClientId);
      if (!client) continue;
      let currentSaaSDate = client.saasPaidUntil ? new Date(client.saasPaidUntil) : /* @__PURE__ */ new Date();
      if (currentSaaSDate < /* @__PURE__ */ new Date()) {
        currentSaaSDate = /* @__PURE__ */ new Date();
      }
      const newExpirtyDate = new Date(currentSaaSDate);
      newExpirtyDate.setDate(newExpirtyDate.getDate() + 30);
      await storage.updateResellerClient(client.id, {
        saasPaidUntil: newExpirtyDate,
        saasStatus: "active"
      });
      console.log(`[ResellerService] SaaS renovado para cliente ${client.id} at\xE9 ${newExpirtyDate.toISOString()}`);
    }
  }
  /**
   * Confirma pagamento PIX e cria o cliente
   */
  async confirmPixPayment(paymentId) {
    try {
      const payment = await storage.getResellerPayment(paymentId);
      if (!payment) {
        return { success: false, error: "Pagamento n\xE3o encontrado" };
      }
      if (payment.status !== "pending") {
        return { success: false, error: "Pagamento j\xE1 foi processado" };
      }
      const paymentData = JSON.parse(payment.statusDetail || "{}");
      const clientData = paymentData.clientData;
      if (!clientData) {
        return { success: false, error: "Dados do cliente n\xE3o encontrados" };
      }
      await storage.updateResellerPayment(paymentId, {
        status: "approved",
        paidAt: /* @__PURE__ */ new Date()
      });
      return await this.createPaidClient({
        resellerId: payment.resellerId,
        ...clientData,
        paymentId,
        paymentMethod: "pix"
      });
    } catch (error) {
      console.error("[ResellerService] Erro ao confirmar PIX:", error);
      return { success: false, error: error.message };
    }
  }
  /**
   * Cria um cliente para o revendedor
   * - Cria o usuário no sistema
   * - Vincula ao revendedor
   * - Gera link de pagamento (R$ 49,99)
   */
  async createClient(params) {
    const { resellerId, name, email, phone, password } = params;
    try {
      const reseller = await storage.getReseller(resellerId);
      if (!reseller || !reseller.isActive) {
        return { success: false, error: "Revendedor n\xE3o encontrado ou inativo" };
      }
      const activeClients = await storage.countActiveResellerClients(resellerId);
      if (activeClients >= (reseller.maxClients || 100)) {
        return { success: false, error: "Limite de clientes atingido" };
      }
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return { success: false, error: "Este email j\xE1 est\xE1 cadastrado" };
      }
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          phone
        }
      });
      if (authError || !authData.user) {
        console.error("[ResellerService] Erro ao criar usu\xE1rio no Supabase Auth:", authError);
        return { success: false, error: authError?.message || "Erro ao criar usu\xE1rio" };
      }
      const user = await storage.upsertUser({
        id: authData.user.id,
        email,
        name,
        phone,
        role: "user",
        resellerId: reseller.id,
        onboardingCompleted: false
      });
      const resellerClient = await storage.createResellerClient({
        resellerId,
        userId: user.id,
        status: "pending",
        monthlyCost: reseller.costPerClient || "49.99"
      });
      const costPerClient = Number(reseller.costPerClient || 49.99);
      const externalReference = `reseller_client_${resellerClient.id}`;
      const resellerUser = await storage.getUser(reseller.userId);
      const payerEmail = resellerUser?.email || email;
      try {
        const mpSubscription = await mercadoPagoService.createSubscription({
          reason: `AgentZap - Cliente ${name}`,
          externalReference,
          payerEmail,
          autoRecurring: {
            frequency: 1,
            frequencyType: "months",
            transactionAmount: costPerClient,
            currencyId: "BRL"
          },
          backUrl: `${process.env.BASE_URL || "https://agentezap.com"}/reseller/clients?payment=success`
        });
        await storage.updateResellerClient(resellerClient.id, {
          mpSubscriptionId: mpSubscription.id,
          mpStatus: mpSubscription.status
        });
        await storage.createResellerPayment({
          resellerId,
          resellerClientId: resellerClient.id,
          amount: String(costPerClient),
          paymentType: "client_creation",
          status: "pending",
          payerEmail,
          description: `Cria\xE7\xE3o de conta para ${name}`
        });
        return {
          success: true,
          clientId: resellerClient.id,
          userId: user.id,
          paymentUrl: mpSubscription.init_point
        };
      } catch (mpError) {
        console.error("[ResellerService] Erro MercadoPago:", mpError);
        await storage.cancelResellerClient(resellerClient.id);
        return {
          success: false,
          error: `Erro ao criar pagamento: ${mpError.message}`
        };
      }
    } catch (error) {
      console.error("[ResellerService] Erro ao criar cliente:", error);
      return { success: false, error: error.message };
    }
  }
  /**
   * Processa webhook de pagamento do MercadoPago para cliente de revendedor
   */
  async processPaymentWebhook(externalReference, status, paymentId) {
    if (!externalReference.startsWith("reseller_client_")) {
      return;
    }
    const clientId = externalReference.replace("reseller_client_", "");
    const client = await storage.getResellerClient(clientId);
    if (!client) {
      console.error("[ResellerService] Cliente n\xE3o encontrado:", clientId);
      return;
    }
    if (status === "authorized" || status === "approved") {
      await storage.updateResellerClient(clientId, {
        status: "active",
        activatedAt: /* @__PURE__ */ new Date(),
        mpStatus: status
      });
      const payments = await storage.getResellerPayments(client.resellerId, 10);
      const pendingPayment = payments.find((p) => p.resellerClientId === clientId && p.status === "pending");
      if (pendingPayment) {
        await storage.updateResellerPayment(pendingPayment.id, {
          status: "approved",
          mpPaymentId: paymentId,
          paidAt: /* @__PURE__ */ new Date()
        });
      }
      console.log(`[ResellerService] Cliente ${clientId} ativado com sucesso`);
    } else if (status === "cancelled" || status === "rejected") {
      await storage.updateResellerClient(clientId, {
        status: "cancelled",
        cancelledAt: /* @__PURE__ */ new Date(),
        mpStatus: status
      });
      const payments = await storage.getResellerPayments(client.resellerId, 10);
      const pendingPayment = payments.find((p) => p.resellerClientId === clientId && p.status === "pending");
      if (pendingPayment) {
        await storage.updateResellerPayment(pendingPayment.id, {
          status: "rejected",
          statusDetail: status
        });
      }
      console.log(`[ResellerService] Cliente ${clientId} cancelado - pagamento: ${status}`);
    }
  }
  /**
   * Obtém estatísticas do dashboard do revendedor
   */
  async getDashboardStats(resellerId) {
    return storage.getResellerDashboardMetrics(resellerId);
  }
  /**
   * Detecta revendedor pelo host/domínio
   */
  async detectResellerByHost(host) {
    const hostname = host.split(":")[0];
    if (hostname.includes(".agentezap.com") || hostname.includes(".agentezap.com.br")) {
      const subdomain = hostname.split(".")[0];
      if (subdomain && subdomain !== "www" && subdomain !== "app" && subdomain !== "api") {
        const reseller2 = await storage.getResellerBySubdomain(subdomain);
        if (reseller2 && reseller2.isActive) {
          return { reseller: reseller2, isWhiteLabel: true };
        }
      }
    }
    const reseller = await storage.getResellerByDomain(hostname);
    if (reseller && reseller.isActive && reseller.domainVerified) {
      return { reseller, isWhiteLabel: true };
    }
    return null;
  }
  /**
   * Atualiza logo do revendedor
   */
  async updateLogo(resellerId, logoUrl) {
    try {
      await storage.updateReseller(resellerId, { logoUrl });
      return true;
    } catch (error) {
      console.error("[ResellerService] Erro ao atualizar logo:", error);
      return false;
    }
  }
  /**
   * Configura domínio customizado
   */
  async setupCustomDomain(resellerId, domain) {
    const isAvailable = await storage.isDomainAvailable(domain);
    if (!isAvailable) {
      return { success: false, error: "Dom\xEDnio j\xE1 est\xE1 em uso" };
    }
    await storage.updateReseller(resellerId, {
      customDomain: domain,
      domainVerified: false
    });
    return { success: true };
  }
  /**
   * Verifica domínio customizado (deve ser chamado após configurar DNS)
   */
  async verifyCustomDomain(resellerId) {
    const reseller = await storage.getReseller(resellerId);
    if (!reseller?.customDomain) {
      return { success: false, error: "Dom\xEDnio n\xE3o configurado" };
    }
    await storage.updateReseller(resellerId, { domainVerified: true });
    return { success: true };
  }
};
var resellerService = new ResellerService();
var resellerService_default = resellerService;

export {
  generatePixQRCode,
  resellerService,
  resellerService_default
};
