import {
  storage
} from "./chunk-YM465ECG.js";

// server/mercadoPagoService.ts
var MP_API_BASE = "https://api.mercadopago.com";
var MercadoPagoService = class {
  credentials = null;
  /**
   * Carrega credenciais do banco de dados
   */
  async loadCredentials() {
    try {
      const keys = [
        "mercadopago_public_key",
        "mercadopago_access_token",
        "mercadopago_client_id",
        "mercadopago_client_secret",
        "mercadopago_test_mode"
      ];
      const configMap = await storage.getSystemConfigs(keys);
      const publicKey = configMap.get("mercadopago_public_key");
      const accessToken = configMap.get("mercadopago_access_token");
      const clientId = configMap.get("mercadopago_client_id");
      const clientSecret = configMap.get("mercadopago_client_secret");
      const testMode = configMap.get("mercadopago_test_mode");
      if (!publicKey || !accessToken) {
        console.log("[MercadoPago] Credenciais n\xE3o configuradas");
        return null;
      }
      this.credentials = {
        publicKey,
        accessToken,
        clientId: clientId || void 0,
        clientSecret: clientSecret || void 0,
        isTestMode: testMode === "true"
      };
      return this.credentials;
    } catch (error) {
      console.error("[MercadoPago] Erro ao carregar credenciais:", error);
      return null;
    }
  }
  /**
   * Salva credenciais no banco de dados
   */
  async saveCredentials(creds) {
    try {
      if (creds.publicKey !== void 0) {
        await storage.updateSystemConfig("mercadopago_public_key", creds.publicKey);
      }
      if (creds.accessToken !== void 0) {
        await storage.updateSystemConfig("mercadopago_access_token", creds.accessToken);
      }
      if (creds.clientId !== void 0) {
        await storage.updateSystemConfig("mercadopago_client_id", creds.clientId);
      }
      if (creds.clientSecret !== void 0) {
        await storage.updateSystemConfig("mercadopago_client_secret", creds.clientSecret);
      }
      if (creds.isTestMode !== void 0) {
        await storage.updateSystemConfig("mercadopago_test_mode", creds.isTestMode.toString());
      }
      await this.loadCredentials();
      console.log("[MercadoPago] Credenciais salvas com sucesso");
    } catch (error) {
      console.error("[MercadoPago] Erro ao salvar credenciais:", error);
      throw error;
    }
  }
  /**
   * Retorna credenciais atuais (sem expor dados sensíveis)
   */
  async getCredentialsInfo() {
    const creds = await this.loadCredentials();
    if (!creds) {
      return { configured: false, isTestMode: false };
    }
    return {
      configured: true,
      isTestMode: creds.isTestMode,
      publicKeyPreview: creds.publicKey.substring(0, 20) + "..."
    };
  }
  /**
   * Faz requisição autenticada para API do Mercado Pago
   */
  async apiRequest(method, endpoint, body) {
    const creds = this.credentials || await this.loadCredentials();
    if (!creds) {
      throw new Error("Credenciais do Mercado Pago n\xE3o configuradas");
    }
    const url = `${MP_API_BASE}${endpoint}`;
    const options = {
      method,
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json"
      }
    };
    if (body && method !== "GET") {
      options.body = JSON.stringify(body);
    }
    console.log(`[MercadoPago] ${method} ${endpoint}`);
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) {
      console.error("[MercadoPago] API Error:", data);
      throw new Error(data.message || `API Error: ${response.status}`);
    }
    return data;
  }
  /**
   * Cria um plano de assinatura no Mercado Pago
   */
  async createPlan(params) {
    const body = {
      reason: params.reason,
      auto_recurring: {
        frequency: params.autoRecurring.frequency,
        frequency_type: params.autoRecurring.frequencyType,
        transaction_amount: params.autoRecurring.transactionAmount,
        currency_id: params.autoRecurring.currencyId,
        repetitions: params.autoRecurring.repetitions,
        free_trial: params.autoRecurring.freeTrial ? {
          frequency: params.autoRecurring.freeTrial.frequency,
          frequency_type: params.autoRecurring.freeTrial.frequencyType
        } : void 0
      },
      back_url: params.backUrl
    };
    const plan = await this.apiRequest("POST", "/preapproval_plan", body);
    console.log("[MercadoPago] Plano criado:", plan.id);
    return plan;
  }
  /**
   * Busca um plano pelo ID
   */
  async getPlan(planId) {
    return this.apiRequest("GET", `/preapproval_plan/${planId}`);
  }
  /**
   * Lista todos os planos
   */
  async listPlans() {
    return this.apiRequest("GET", "/preapproval_plan/search");
  }
  /**
   * Cria uma assinatura (preapproval) - sem plano associado
   * Retorna um link de pagamento
   */
  async createSubscription(params) {
    const body = {
      reason: params.reason,
      external_reference: params.externalReference,
      payer_email: params.payerEmail,
      auto_recurring: {
        frequency: params.autoRecurring.frequency,
        frequency_type: params.autoRecurring.frequencyType,
        transaction_amount: params.autoRecurring.transactionAmount,
        currency_id: params.autoRecurring.currencyId,
        start_date: params.autoRecurring.startDate,
        end_date: params.autoRecurring.endDate
      },
      back_url: params.backUrl,
      status: params.status || "pending"
    };
    if (params.preapprovalPlanId) {
      body.preapproval_plan_id = params.preapprovalPlanId;
    }
    const subscription = await this.apiRequest("POST", "/preapproval", body);
    console.log("[MercadoPago] Assinatura criada:", subscription.id, "Link:", subscription.init_point);
    return subscription;
  }
  /**
   * Busca uma assinatura pelo ID
   */
  async getSubscription(subscriptionId) {
    return this.apiRequest("GET", `/preapproval/${subscriptionId}`);
  }
  /**
   * Busca assinatura por external_reference
   */
  async searchSubscriptionByReference(reference) {
    const result = await this.apiRequest(
      "GET",
      `/preapproval/search?external_reference=${reference}`
    );
    return result.results?.[0] || null;
  }
  /**
   * Atualiza uma assinatura
   */
  async updateSubscription(subscriptionId, data) {
    return this.apiRequest("PUT", `/preapproval/${subscriptionId}`, data);
  }
  /**
   * Cancela uma assinatura
   */
  async cancelSubscription(subscriptionId) {
    return this.updateSubscription(subscriptionId, { status: "cancelled" });
  }
  /**
   * Pausa uma assinatura
   */
  async pauseSubscription(subscriptionId) {
    return this.updateSubscription(subscriptionId, { status: "paused" });
  }
  /**
   * Reativa uma assinatura
   */
  async resumeSubscription(subscriptionId) {
    return this.updateSubscription(subscriptionId, { status: "authorized" });
  }
  /**
   * Processa webhook do Mercado Pago
   */
  async processWebhook(topic, data) {
    console.log(`[MercadoPago] Webhook recebido - Topic: ${topic}`, data);
    switch (topic) {
      case "subscription_preapproval":
        await this.handleSubscriptionWebhook(data);
        break;
      case "subscription_authorized_payment":
        await this.handlePaymentWebhook(data);
        break;
      case "subscription_preapproval_plan":
        await this.handlePlanWebhook(data);
        break;
      default:
        console.log(`[MercadoPago] Webhook n\xE3o tratado: ${topic}`);
    }
  }
  async handleSubscriptionWebhook(data) {
    if (!data.id) return;
    try {
      const mpSubscription = await this.getSubscription(data.id);
      console.log(`[MercadoPago] Assinatura atualizada: ${mpSubscription.id} - Status: ${mpSubscription.status}`);
      if (mpSubscription.external_reference) {
        const localSubscriptionId = mpSubscription.external_reference.replace("sub_", "");
        let status = "pending";
        if (mpSubscription.status === "authorized") status = "active";
        else if (mpSubscription.status === "cancelled") status = "cancelled";
        else if (mpSubscription.status === "paused") status = "paused";
        console.log(`[MercadoPago] Atualizando assinatura local: ${localSubscriptionId} para status: ${status}`);
      }
    } catch (error) {
      console.error("[MercadoPago] Erro ao processar webhook de assinatura:", error);
    }
  }
  async handlePaymentWebhook(data) {
    console.log("[MercadoPago] Pagamento de assinatura recebido:", data);
  }
  async handlePlanWebhook(data) {
    console.log("[MercadoPago] Plano atualizado:", data);
  }
  /**
   * Verifica se as credenciais estão válidas
   */
  async testConnection() {
    try {
      const creds = await this.loadCredentials();
      if (!creds) {
        return { success: false, message: "Credenciais n\xE3o configuradas" };
      }
      const plans = await this.listPlans();
      return {
        success: true,
        message: `Conex\xE3o OK! ${plans.results?.length || 0} planos encontrados.`,
        data: { plansCount: plans.results?.length || 0, isTestMode: creds.isTestMode }
      };
    } catch (error) {
      return { success: false, message: error.message || "Erro ao testar conex\xE3o" };
    }
  }
};
var mercadoPagoService = new MercadoPagoService();

export {
  mercadoPagoService
};
