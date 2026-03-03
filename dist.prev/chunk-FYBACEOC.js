import {
  getMistralClient
} from "./chunk-YCIPFGXJ.js";
import {
  db
} from "./chunk-HIRAYR4B.js";
import {
  systemConfig
} from "./chunk-WF5ZUJEW.js";

// server/llm.ts
import { eq } from "drizzle-orm";
var llmConfigCache = null;
var LLM_CONFIG_CACHE_TTL_MS = 5 * 60 * 1e3;
var MISTRAL_VALIDATED_MODELS = [
  { model: "mistral-medium-latest", ratePerMinute: 10.5, delaySeconds: 6, successRate: 22.6 },
  { model: "mistral-medium-2312", ratePerMinute: 6, delaySeconds: 10, successRate: 13 },
  { model: "mistral-medium", ratePerMinute: 6, delaySeconds: 10, successRate: 12.8 },
  { model: "mistral-large-2411", ratePerMinute: 3, delaySeconds: 20, successRate: 6.3 },
  // Tier 2 - menos testados mas podem funcionar
  { model: "mistral-large-latest", ratePerMinute: 3, delaySeconds: 20, successRate: 5 },
  { model: "mistral-large-2407", ratePerMinute: 3, delaySeconds: 20, successRate: 5 },
  { model: "mistral-large-2402", ratePerMinute: 3, delaySeconds: 20, successRate: 5 }
];
var MISTRAL_FALLBACK_MODELS = MISTRAL_VALIDATED_MODELS.map((m) => m.model);
var MISTRAL_EXTERNAL_FALLBACK_DELAY_MS = 30 * 1e3;
var mistralQueueStatus = {
  firstFailureTime: null,
  totalAttempts: 0,
  lastAttemptTime: 0,
  roundRobinIndex: 0
};
var CIRCUIT_BREAKER_THRESHOLD = 5;
var CIRCUIT_BREAKER_RESET_MS = 60 * 1e3;
var circuitBreaker = {
  consecutiveFailures: 0,
  lastFailureTime: 0,
  isOpen: false
};
function isCircuitBreakerOpen() {
  if (!circuitBreaker.isOpen) return false;
  const elapsed = Date.now() - circuitBreaker.lastFailureTime;
  if (elapsed >= CIRCUIT_BREAKER_RESET_MS) {
    console.log(`\u{1F504} [CIRCUIT BREAKER] Resetando ap\xF3s ${Math.round(elapsed / 1e3)}s - tentando Mistral novamente`);
    circuitBreaker.isOpen = false;
    circuitBreaker.consecutiveFailures = 0;
    return false;
  }
  const remaining = Math.ceil((CIRCUIT_BREAKER_RESET_MS - elapsed) / 1e3);
  console.log(`\u{1F6E1}\uFE0F [CIRCUIT BREAKER] ABERTO - pulando Mistral, direto para fallback (reset em ${remaining}s)`);
  return true;
}
function recordCircuitBreakerFailure() {
  circuitBreaker.consecutiveFailures++;
  circuitBreaker.lastFailureTime = Date.now();
  if (circuitBreaker.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && !circuitBreaker.isOpen) {
    circuitBreaker.isOpen = true;
    console.log(`\u{1F6E1}\uFE0F [CIRCUIT BREAKER] ABERTO! ${circuitBreaker.consecutiveFailures} falhas consecutivas - pulando Mistral por ${CIRCUIT_BREAKER_RESET_MS / 1e3}s`);
  }
}
function recordCircuitBreakerSuccess() {
  if (circuitBreaker.consecutiveFailures > 0) {
    console.log(`\u2705 [CIRCUIT BREAKER] Sucesso! Resetando contador de falhas (era ${circuitBreaker.consecutiveFailures})`);
  }
  circuitBreaker.consecutiveFailures = 0;
  circuitBreaker.isOpen = false;
}
function canFallbackToExternal() {
  if (!mistralQueueStatus.firstFailureTime) {
    return false;
  }
  const timeElapsed = Date.now() - mistralQueueStatus.firstFailureTime;
  const canFallback = timeElapsed >= MISTRAL_EXTERNAL_FALLBACK_DELAY_MS;
  if (canFallback) {
    console.log(`\u2705 [MISTRAL QUEUE] Passaram ${Math.round(timeElapsed / 1e3)}s (${Math.round(timeElapsed / 6e4)} min) - LIBERADO para fallback externo`);
  } else {
    const remaining = Math.ceil((MISTRAL_EXTERNAL_FALLBACK_DELAY_MS - timeElapsed) / 1e3);
    console.log(`\u23F3 [MISTRAL QUEUE] Aguardando ${remaining}s (${Math.round(remaining / 60)} min) antes de fallback externo...`);
  }
  return canFallback;
}
function registerMistralFailure() {
  if (!mistralQueueStatus.firstFailureTime) {
    mistralQueueStatus.firstFailureTime = Date.now();
    console.log(`\u{1F6A8} [MISTRAL QUEUE] Primeira falha registrada - iniciando timer de 5 minutos`);
  }
  mistralQueueStatus.totalAttempts++;
  mistralQueueStatus.lastAttemptTime = Date.now();
}
function clearMistralQueueStatus() {
  if (mistralQueueStatus.firstFailureTime) {
    console.log(`\u2705 [MISTRAL QUEUE] Fila limpa ap\xF3s ${mistralQueueStatus.totalAttempts} tentativas`);
  }
  mistralQueueStatus.firstFailureTime = null;
  mistralQueueStatus.totalAttempts = 0;
  mistralQueueStatus.roundRobinIndex = 0;
}
function getNextMistralModelRoundRobin() {
  const modelConfig = MISTRAL_VALIDATED_MODELS[mistralQueueStatus.roundRobinIndex];
  mistralQueueStatus.roundRobinIndex = (mistralQueueStatus.roundRobinIndex + 1) % MISTRAL_VALIDATED_MODELS.length;
  console.log(`\u{1F504} [MISTRAL QUEUE] Round-robin: ${modelConfig.model} (delay: ${modelConfig.delaySeconds}s, rate: ${modelConfig.ratePerMinute}/min)`);
  return {
    model: modelConfig.model,
    delay: modelConfig.delaySeconds * 1e3
  };
}
function getMistralQueueInfo() {
  const timeElapsed = mistralQueueStatus.firstFailureTime ? Date.now() - mistralQueueStatus.firstFailureTime : 0;
  const timeUntilFallback = Math.max(0, MISTRAL_EXTERNAL_FALLBACK_DELAY_MS - timeElapsed);
  return {
    isInFailureMode: mistralQueueStatus.firstFailureTime !== null,
    timeUntilFallback: Math.ceil(timeUntilFallback / 1e3),
    totalAttempts: mistralQueueStatus.totalAttempts,
    currentModelIndex: mistralQueueStatus.roundRobinIndex,
    models: MISTRAL_VALIDATED_MODELS
  };
}
var mistralModelCooldowns = /* @__PURE__ */ new Map();
var MISTRAL_MODEL_COOLDOWN_MS = 30 * 1e3;
function clearExpiredMistralCooldowns() {
  const now = Date.now();
  let cleared = 0;
  for (const [model, cooldown] of mistralModelCooldowns.entries()) {
    if (cooldown.cooldownUntil < now) {
      mistralModelCooldowns.delete(model);
      cleared++;
    }
  }
  if (cleared > 0) {
    console.log(`\u{1F504} [MISTRAL] Limpou ${cleared} cooldowns expirados`);
  }
}
function getNextAvailableMistralModel(preferredModel, excludeModels = []) {
  const now = Date.now();
  clearExpiredMistralCooldowns();
  if (!excludeModels.includes(preferredModel)) {
    const preferredCooldown = mistralModelCooldowns.get(preferredModel);
    if (!preferredCooldown || preferredCooldown.cooldownUntil < now) {
      console.log(`\u2705 [MISTRAL ROTATION] Usando modelo do admin: ${preferredModel}`);
      return preferredModel;
    }
    const remainingCooldown = Math.ceil((preferredCooldown.cooldownUntil - now) / 1e3);
    console.log(`\u23F3 [MISTRAL ROTATION] Modelo do admin ${preferredModel} em cooldown por ${remainingCooldown}s, buscando fallback...`);
  }
  for (const model of MISTRAL_FALLBACK_MODELS) {
    if (excludeModels.includes(model)) continue;
    const cooldown = mistralModelCooldowns.get(model);
    if (cooldown && cooldown.cooldownUntil > now) continue;
    console.log(`\u{1F504} [MISTRAL ROTATION] Usando fallback: ${model}`);
    return model;
  }
  console.log(`\u274C [MISTRAL ROTATION] Nenhum modelo dispon\xEDvel! Todos em cooldown ou j\xE1 tentados.`);
  return null;
}
function markMistralModelRateLimited(model) {
  const existing = mistralModelCooldowns.get(model);
  const cooldownMultiplier = existing ? Math.min(existing.rateLimitCount + 1, 3) : 1;
  const cooldownMs = MISTRAL_MODEL_COOLDOWN_MS * cooldownMultiplier;
  mistralModelCooldowns.set(model, {
    model,
    cooldownUntil: Date.now() + cooldownMs,
    rateLimitCount: (existing?.rateLimitCount || 0) + 1
  });
  console.log(`\u{1F6AB} [MISTRAL ROTATION] Modelo ${model} em COOLDOWN por ${cooldownMs / 1e3}s (rate limit #${(existing?.rateLimitCount || 0) + 1})`);
  const now = Date.now();
  const available = MISTRAL_FALLBACK_MODELS.filter((m) => {
    const cd = mistralModelCooldowns.get(m);
    return !cd || cd.cooldownUntil < now;
  });
  console.log(`\u{1F4CA} [MISTRAL ROTATION] Fallbacks dispon\xEDveis: ${available.length > 0 ? available.join(", ") : "NENHUM"}`);
}
function getMistralModelStatus() {
  const now = Date.now();
  return MISTRAL_FALLBACK_MODELS.map((model) => {
    const cooldown = mistralModelCooldowns.get(model);
    return {
      model,
      available: !cooldown || cooldown.cooldownUntil < now,
      cooldownRemaining: cooldown ? Math.max(0, Math.ceil((cooldown.cooldownUntil - now) / 1e3)) : 0,
      rateLimitCount: cooldown?.rateLimitCount || 0
    };
  });
}
var LLM_MAX_RETRIES = 3;
var LLM_INITIAL_DELAY_MS = 1e3;
async function withRetryLLM(operation, operationName = "LLM API call", maxRetries = LLM_MAX_RETRIES, initialDelayMs = LLM_INITIAL_DELAY_MS) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`\u{1F504} [LLM RETRY] ${operationName} - Tentativa ${attempt}/${maxRetries}...`);
      const result = await operation();
      if (attempt > 1) {
        console.log(`\u2705 [LLM RETRY] ${operationName} - SUCESSO na tentativa ${attempt}/${maxRetries}!`);
      }
      return result;
    } catch (error) {
      lastError = error;
      const statusCode = error?.status || error?.statusCode || (error?.message?.match(/error: (\d+)/)?.[1] ? parseInt(error.message.match(/error: (\d+)/)[1]) : null);
      const isRateLimit = statusCode === 429 || error?.message?.toLowerCase()?.includes("rate limit") || error?.message?.toLowerCase()?.includes("too many requests");
      if (isRateLimit) {
        console.log(`\u26A1 [LLM RETRY] ${operationName} - RATE LIMIT! Lan\xE7ando para rota\xE7\xE3o de modelos...`);
        throw error;
      }
      const isRetryable = statusCode === 500 || // Server error
      statusCode === 502 || // Bad gateway
      statusCode === 503 || // Service unavailable
      statusCode === 504 || // Gateway timeout
      statusCode === 520 || // Cloudflare error
      statusCode === 521 || // Cloudflare error
      statusCode === 522 || // Cloudflare timeout
      statusCode === 523 || // Cloudflare error
      statusCode === 524 || // Cloudflare timeout
      error?.code === "ECONNRESET" || error?.code === "ETIMEDOUT" || error?.code === "ENOTFOUND" || error?.code === "ECONNREFUSED" || error?.code === "UND_ERR_CONNECT_TIMEOUT" || error?.message?.toLowerCase()?.includes("timeout") || error?.message?.toLowerCase()?.includes("connection") || error?.message?.toLowerCase()?.includes("overloaded") || error?.message?.toLowerCase()?.includes("temporarily unavailable");
      if (!isRetryable || attempt === maxRetries) {
        console.error(`\u274C [LLM RETRY] ${operationName} - ESGOTOU ${maxRetries} tentativas!`);
        console.error(`   \u2514\u2500 Erro final: ${error?.message || error}`);
        console.error(`   \u2514\u2500 Status: ${statusCode || "N/A"}`);
        console.error(`   \u2514\u2500 Retryable: ${isRetryable ? "SIM" : "N\xC3O"}`);
        throw error;
      }
      const jitter = Math.random() * 500;
      const delay = initialDelayMs * Math.pow(2, attempt - 1) + jitter;
      console.log(`\u26A0\uFE0F [LLM RETRY] ${operationName} - FALHOU tentativa ${attempt}/${maxRetries}`);
      console.log(`   \u2514\u2500 Erro: ${error?.message || "Unknown"}`);
      console.log(`   \u2514\u2500 Status: ${statusCode || "N/A"}`);
      console.log(`   \u2514\u2500 Pr\xF3xima tentativa em: ${Math.round(delay / 1e3)}s`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError || new Error(`${operationName} falhou ap\xF3s ${maxRetries} tentativas`);
}
function invalidateLLMConfigCache() {
  llmConfigCache = null;
  console.log(`[LLM] Cache de configura\xE7\xE3o invalidado`);
}
async function getLLMConfig() {
  if (llmConfigCache && Date.now() - llmConfigCache.timestamp < LLM_CONFIG_CACHE_TTL_MS) {
    return {
      provider: llmConfigCache.provider,
      groqApiKey: llmConfigCache.groqApiKey,
      groqModel: llmConfigCache.groqModel,
      openrouterApiKey: llmConfigCache.openrouterApiKey,
      openrouterModel: llmConfigCache.openrouterModel,
      openrouterProvider: llmConfigCache.openrouterProvider,
      mistralApiKey: llmConfigCache.mistralApiKey,
      mistralModel: llmConfigCache.mistralModel,
      nvidiaApiKey: llmConfigCache.nvidiaApiKey,
      nvidiaModel: llmConfigCache.nvidiaModel
    };
  }
  try {
    const configs = await db.select().from(systemConfig).where(eq(systemConfig.chave, "llm_provider"));
    const groqKeyResult = await db.select().from(systemConfig).where(eq(systemConfig.chave, "groq_api_key"));
    const groqModelResult = await db.select().from(systemConfig).where(eq(systemConfig.chave, "groq_model"));
    const openrouterKeyResult = await db.select().from(systemConfig).where(eq(systemConfig.chave, "openrouter_api_key"));
    const openrouterModelResult = await db.select().from(systemConfig).where(eq(systemConfig.chave, "openrouter_model"));
    const openrouterProviderResult = await db.select().from(systemConfig).where(eq(systemConfig.chave, "openrouter_provider"));
    const mistralKeyResult = await db.select().from(systemConfig).where(eq(systemConfig.chave, "mistral_api_key"));
    const mistralModelResult = await db.select().from(systemConfig).where(eq(systemConfig.chave, "mistral_model"));
    const nvidiaKeyResult = await db.select().from(systemConfig).where(eq(systemConfig.chave, "nvidia_api_key"));
    const nvidiaModelResult = await db.select().from(systemConfig).where(eq(systemConfig.chave, "nvidia_model"));
    const provider = configs[0]?.valor || "mistral";
    const groqApiKey = groqKeyResult[0]?.valor || "";
    const groqModel = groqModelResult[0]?.valor || "openai/gpt-oss-20b";
    const openrouterApiKey = openrouterKeyResult[0]?.valor || "";
    const openrouterModel = openrouterModelResult[0]?.valor || "google/gemma-3-4b-it:free";
    const openrouterProvider = openrouterProviderResult[0]?.valor || "auto";
    const mistralApiKey = mistralKeyResult[0]?.valor || "";
    const mistralModel = mistralModelResult[0]?.valor || "mistral-medium-latest";
    const nvidiaApiKey = nvidiaKeyResult[0]?.valor || process.env.NVIDIA_API_KEY || "";
    const nvidiaModel = nvidiaModelResult[0]?.valor || "nvidia/llama-3.3-nemotron-super-49b-v1";
    llmConfigCache = { provider, groqApiKey, groqModel, openrouterApiKey, openrouterModel, openrouterProvider, mistralApiKey, mistralModel, nvidiaApiKey, nvidiaModel, timestamp: Date.now() };
    console.log(`[LLM] Config loaded: provider=${provider}, model=${provider === "openrouter" ? openrouterModel : provider === "groq" ? groqModel : provider === "nvidia" ? nvidiaModel : mistralModel}, openrouterProvider=${openrouterProvider}${nvidiaApiKey ? ", nvidia=CONFIGURED" : ""}`);
    return { provider, groqApiKey, groqModel, openrouterApiKey, openrouterModel, openrouterProvider, mistralApiKey, mistralModel, nvidiaApiKey, nvidiaModel };
  } catch (error) {
    console.error("[LLM] Erro ao carregar configura\xE7\xE3o:", error);
    return { provider: "mistral", groqApiKey: "", groqModel: "openai/gpt-oss-20b", openrouterApiKey: "", openrouterModel: "google/gemma-3-4b-it:free", openrouterProvider: "auto", mistralApiKey: "", mistralModel: "mistral-medium-latest", nvidiaApiKey: "", nvidiaModel: "nvidia/llama-3.3-nemotron-super-49b-v1" };
  }
}
async function callOpenRouterAPI(messages, apiKey, options) {
  const model = options?.model || "google/gemma-3-4b-it:free";
  const providerSlug = options?.openrouterProvider || "auto";
  const isAutoProvider = providerSlug === "auto" || providerSlug === "";
  console.log(`[LLM] \u{1F680} Chamando OpenRouter API com modelo: ${model}, provider: ${isAutoProvider ? "auto (OpenRouter escolhe)" : providerSlug}`);
  return await withRetryLLM(async () => {
    const requestBody = {
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 500
    };
    if (!isAutoProvider) {
      requestBody.provider = {
        order: [providerSlug],
        allow_fallbacks: true
        // Permitir fallback para outros providers se necessário
      };
    }
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://agentezap.online",
        "X-Title": "AgenteZap"
      },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LLM] OpenRouter API error: ${response.status} - ${errorText}`);
      const error = new Error(`OpenRouter API error: ${response.status}`);
      error.status = response.status;
      error.statusCode = response.status;
      throw error;
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    console.log(`[LLM] \u2705 OpenRouter respondeu com ${content?.length || 0} caracteres (provider: ${providerSlug})`);
    return typeof content === "string" ? content : "";
  }, `OpenRouter API (${model})`);
}
async function callGroqAPI(messages, apiKey, options) {
  const model = options?.model || "openai/gpt-oss-20b";
  console.log(`[LLM] \u{1F680} Chamando Groq API com modelo: ${model}`);
  return await withRetryLLM(async () => {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 500
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LLM] Groq API error: ${response.status} - ${errorText}`);
      const error = new Error(`Groq API error: ${response.status}`);
      error.status = response.status;
      error.statusCode = response.status;
      throw error;
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    console.log(`[LLM] \u2705 Groq respondeu com ${content?.length || 0} caracteres`);
    return typeof content === "string" ? content : "";
  }, `Groq API (${model})`);
}
async function callNvidiaAPI(messages, apiKey, options) {
  const model = options?.model || "nvidia/llama-3.3-nemotron-super-49b-v1";
  console.log(`[LLM] \u{1F7E2} Chamando NVIDIA NIM API com modelo: ${model}`);
  return await withRetryLLM(async () => {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 1024
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LLM] NVIDIA NIM API error: ${response.status} - ${errorText}`);
      const error = new Error(`NVIDIA NIM API error: ${response.status}`);
      error.status = response.status;
      error.statusCode = response.status;
      throw error;
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    console.log(`[LLM] \u2705 NVIDIA NIM respondeu com ${content?.length || 0} caracteres`);
    return typeof content === "string" ? content : "";
  }, `NVIDIA NIM API (${model})`);
}
async function callMistralAPI(messages, options) {
  const mistral = await getMistralClient();
  if (!mistral) {
    console.error("[LLM] Mistral client n\xE3o dispon\xEDvel");
    return "";
  }
  const adminModel = options?.model || "mistral-small-latest";
  const triedModels = [];
  clearExpiredMistralCooldowns();
  console.log(`[LLM] \u{1F3AF} Modelo escolhido pelo admin: ${adminModel}`);
  const maxModelAttempts = 15;
  let lastError = null;
  for (let modelAttempt = 1; modelAttempt <= maxModelAttempts; modelAttempt++) {
    const currentModel = getNextAvailableMistralModel(adminModel, triedModels);
    if (!currentModel) {
      console.error("[LLM] \u274C Nenhum modelo Mistral dispon\xEDvel ap\xF3s tentar todos os fallbacks!");
      break;
    }
    triedModels.push(currentModel);
    const isAdminModel = currentModel === adminModel;
    console.log(`[LLM] \u{1F680} Chamando Mistral - Modelo: ${currentModel} ${isAdminModel ? "(ADMIN)" : "(FALLBACK)"} [${modelAttempt}/${maxModelAttempts}]`);
    try {
      const result = await withRetryLLM(async () => {
        const response = await mistral.chat.complete({
          model: currentModel,
          messages,
          temperature: options?.temperature ?? 0.7,
          maxTokens: options?.maxTokens ?? 500
        });
        const content = response.choices?.[0]?.message?.content;
        console.log(`[LLM] \u2705 Mistral (${currentModel}) respondeu com ${typeof content === "string" ? content.length : 0} caracteres`);
        return typeof content === "string" ? content : "";
      }, `Mistral API (${currentModel})`, 2, 1500);
      return result;
    } catch (error) {
      lastError = error;
      const isRateLimit = error?.status === 429 || error?.statusCode === 429 || error?.message?.toLowerCase()?.includes("rate limit") || error?.message?.toLowerCase()?.includes("too many requests");
      if (isRateLimit) {
        console.log(`\u26A0\uFE0F [LLM] Rate limit no modelo ${currentModel} - buscando fallback...`);
        markMistralModelRateLimited(currentModel);
        continue;
      }
      console.error(`\u274C [LLM] Erro n\xE3o-recuper\xE1vel no Mistral (${currentModel}): ${error?.message || error}`);
      throw error;
    }
  }
  console.error(`\u274C [LLM] Todos os ${triedModels.length} modelos Mistral falharam! Tentados: ${triedModels.join(", ")}`);
  throw lastError || new Error("Todos os modelos Mistral falharam");
}
async function callGroq(messages, options) {
  try {
    const formattedMessages = typeof messages === "string" ? [{ role: "user", content: messages }] : messages;
    const config = await getLLMConfig();
    if (config.provider === "openrouter" && config.openrouterApiKey && config.openrouterApiKey.length > 20) {
      try {
        return await callOpenRouterAPI(formattedMessages, config.openrouterApiKey, {
          ...options,
          model: options?.model || config.openrouterModel,
          openrouterProvider: config.openrouterProvider
          // 🎯 Provider dinâmico!
        });
      } catch (openrouterError) {
        console.error("[LLM] Erro no OpenRouter, tentando fallback para Groq:", openrouterError);
        if (config.groqApiKey && config.groqApiKey.length > 20) {
          return await callGroqAPI(formattedMessages, config.groqApiKey, {
            ...options,
            model: options?.model || config.groqModel
          });
        }
      }
    }
    if (config.provider === "nvidia" && config.nvidiaApiKey && config.nvidiaApiKey.length > 20) {
      try {
        return await callNvidiaAPI(formattedMessages, config.nvidiaApiKey, {
          ...options,
          model: options?.model || config.nvidiaModel
        });
      } catch (nvidiaError) {
        console.error("[LLM] Erro no NVIDIA NIM, tentando fallback para OpenRouter:", nvidiaError);
        if (config.openrouterApiKey && config.openrouterApiKey.length > 20) {
          return await callOpenRouterAPI(formattedMessages, config.openrouterApiKey, {
            ...options,
            model: options?.model || config.openrouterModel,
            openrouterProvider: config.openrouterProvider
          });
        }
        if (config.groqApiKey && config.groqApiKey.length > 20) {
          return await callGroqAPI(formattedMessages, config.groqApiKey, {
            ...options,
            model: options?.model || config.groqModel
          });
        }
      }
    }
    if (config.provider === "groq" && config.groqApiKey && config.groqApiKey.length > 20) {
      try {
        return await callGroqAPI(formattedMessages, config.groqApiKey, {
          ...options,
          model: options?.model || config.groqModel
        });
      } catch (groqError) {
        console.error("[LLM] Erro no Groq, tentando fallback para Mistral:", groqError);
        return await callMistralAPI(formattedMessages, options);
      }
    }
    return await callMistralAPI(formattedMessages, options);
  } catch (error) {
    console.error("[LLM] Erro ao chamar LLM:", error);
    return "";
  }
}
async function getCurrentProvider() {
  const config = await getLLMConfig();
  return config.provider;
}
async function chatComplete(params) {
  const config = await getLLMConfig();
  const hasOpenRouterKey = config.openrouterApiKey && config.openrouterApiKey.length > 20;
  const hasGroqKey = config.groqApiKey && config.groqApiKey.length > 20;
  const hasMistralKey = config.mistralApiKey && config.mistralApiKey.length > 10 || !!process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.length > 10;
  const hasNvidiaKey = config.nvidiaApiKey && config.nvidiaApiKey.length > 20;
  if (!hasOpenRouterKey && !hasGroqKey && !hasMistralKey && !hasNvidiaKey) {
    console.error("\u274C [LLM] ERRO: Nenhuma API key configurada!");
    console.error("   \u2514\u2500 Configure uma chave em: Admin \u2192 Configura\xE7\xF5es \u2192 Provedor de IA");
    console.error("   \u2514\u2500 Provider atual: " + config.provider);
    throw new Error("API key n\xE3o configurada. Configure uma chave de API em: Admin \u2192 Configura\xE7\xF5es \u2192 Provedor de IA (LLM)");
  }
  if (config.provider === "nvidia" && hasNvidiaKey) {
    try {
      const model = config.nvidiaModel || "nvidia/llama-3.3-nemotron-super-49b-v1";
      console.log(`[LLM] \u{1F7E2} chatComplete via NVIDIA NIM com modelo: ${model}`);
      const data = await withRetryLLM(async () => {
        const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${config.nvidiaApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model,
            messages: params.messages,
            max_tokens: params.maxTokens ?? 1024,
            temperature: params.temperature ?? 0.7
          })
        });
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[LLM] NVIDIA NIM API error: ${response.status} - ${errorText}`);
          const error = new Error(`NVIDIA NIM API error: ${response.status}`);
          error.status = response.status;
          error.statusCode = response.status;
          throw error;
        }
        return await response.json();
      }, `NVIDIA NIM chatComplete (${model})`);
      const responseContent = data.choices?.[0]?.message?.content;
      const promptTokens = data.usage?.prompt_tokens;
      const completionTokens = data.usage?.completion_tokens;
      console.log(`[LLM] \u2705 NVIDIA NIM chatComplete respondeu`);
      console.log(`[LLM] \u{1F4CA} Tokens: prompt=${promptTokens || "N/A"}, completion=${completionTokens || "N/A"}`);
      console.log(`[LLM] \u{1F4CA} Response length: ${responseContent?.length || 0} chars`);
      return {
        choices: data.choices?.map((c) => ({
          message: { content: c.message?.content ?? null },
          finishReason: c.finish_reason
        })) || []
      };
    } catch (nvidiaError) {
      console.error("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
      console.error("\u{1F504} [LLM FALLBACK] NVIDIA NIM FALHOU!");
      console.error(`   \u2514\u2500 Erro: ${nvidiaError?.message || nvidiaError}`);
      console.error("\u{1F504} [LLM FALLBACK] Tentando fallback para OpenRouter/Groq/Mistral...");
      console.error("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
    }
  }
  if (config.provider === "mistral" && hasMistralKey && !isCircuitBreakerOpen()) {
    const adminModel = config.mistralModel || "mistral-small-latest";
    const triedModels = [];
    clearExpiredMistralCooldowns();
    console.log(`[LLM] \u{1F3AF} chatComplete via Mistral - Modelo do admin: ${adminModel}`);
    const maxModelAttempts = 5;
    let lastMistralError = null;
    for (let modelAttempt = 1; modelAttempt <= maxModelAttempts; modelAttempt++) {
      const currentModel = getNextAvailableMistralModel(adminModel, triedModels);
      if (!currentModel) {
        console.log(`\u26A0\uFE0F [LLM] Nenhum modelo Mistral dispon\xEDvel, tentando fallback para outros providers...`);
        break;
      }
      triedModels.push(currentModel);
      const isAdminModel = currentModel === adminModel;
      console.log(`[LLM] \u{1F680} Mistral chatComplete - Modelo: ${currentModel} ${isAdminModel ? "(ADMIN)" : "(FALLBACK)"} [${modelAttempt}/${maxModelAttempts}]`);
      try {
        const mistral2 = await getMistralClient();
        const mistralResponse2 = await withRetryLLM(async () => {
          return await mistral2.chat.complete({
            model: currentModel,
            messages: params.messages,
            maxTokens: params.maxTokens ?? 500,
            temperature: params.temperature ?? 0.7,
            randomSeed: params.randomSeed
          });
        }, `Mistral chatComplete (${currentModel})`, 1, 1500);
        console.log(`[LLM] \u2705 Mistral chatComplete (${currentModel}) respondeu`);
        clearMistralQueueStatus();
        recordCircuitBreakerSuccess();
        return {
          choices: mistralResponse2.choices?.map((c) => ({
            message: { content: c.message?.content ?? null },
            finishReason: c.finishReason
          })) || []
        };
      } catch (mistralError) {
        lastMistralError = mistralError;
        const isRateLimit = mistralError?.status === 429 || mistralError?.statusCode === 429 || mistralError?.message?.toLowerCase()?.includes("rate limit") || mistralError?.message?.toLowerCase()?.includes("too many requests");
        if (isRateLimit) {
          console.log(`\u26A0\uFE0F [LLM] Rate limit no modelo ${currentModel} - buscando fallback...`);
          markMistralModelRateLimited(currentModel);
          continue;
        }
        console.error(`\u274C [LLM] Erro no Mistral (${currentModel}): ${mistralError?.message || mistralError}`);
        break;
      }
    }
    console.error("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
    console.error(`\u{1F504} [LLM FALLBACK] Mistral FALHOU ap\xF3s tentar ${triedModels.length} modelos: ${triedModels.join(", ")}`);
    recordCircuitBreakerFailure();
    registerMistralFailure();
    if (!canFallbackToExternal()) {
      const { model: nextModel, delay } = getNextMistralModelRoundRobin();
      console.log(`\u23F3 [LLM QUEUE] Aguardando ${delay / 1e3}s antes de retentar ${nextModel}...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        const mistral2 = await getMistralClient();
        const retryResponse = await mistral2.chat.complete({
          model: nextModel,
          messages: params.messages,
          maxTokens: params.maxTokens ?? 500,
          temperature: params.temperature ?? 0.7,
          randomSeed: params.randomSeed
        });
        console.log(`[LLM] \u2705 Mistral (${nextModel}) respondeu ap\xF3s aguardar delay!`);
        clearMistralQueueStatus();
        recordCircuitBreakerSuccess();
        return {
          choices: retryResponse.choices?.map((c) => ({
            message: { content: c.message?.content ?? null },
            finishReason: c.finishReason
          })) || []
        };
      } catch (retryError) {
        console.log(`\u26A0\uFE0F [LLM QUEUE] ${nextModel} falhou novamente, continuando tentativas...`);
        markMistralModelRateLimited(nextModel);
        throw new Error(`Mistral em rate limit - aguardando fila (${getMistralQueueInfo().timeUntilFallback}s restantes para fallback)`);
      }
    }
    console.log(`\u2705 [LLM QUEUE] 5 minutos atingidos - liberando fallback para NVIDIA/OpenRouter/Groq`);
    clearMistralQueueStatus();
    if (hasNvidiaKey) {
      console.error("\u{1F504} [LLM FALLBACK] Tentando NVIDIA NIM como fallback (ultra-r\xE1pido)...");
      console.error("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
      try {
        const nvidiaFallbackModel = config.nvidiaModel || "nvidia/llama-3.3-nemotron-super-49b-v1";
        console.log(`[LLM] \u{1F198} NVIDIA NIM FALLBACK - Modelo: ${nvidiaFallbackModel}`);
        const nvidiaFallbackResponse = await withRetryLLM(async () => {
          const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${config.nvidiaApiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: nvidiaFallbackModel,
              messages: params.messages,
              max_tokens: params.maxTokens ?? 1024,
              temperature: params.temperature ?? 0.7
            })
          });
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[LLM] NVIDIA NIM FALLBACK error: ${response.status} - ${errorText}`);
            const error = new Error(`NVIDIA NIM FALLBACK error: ${response.status}`);
            error.status = response.status;
            throw error;
          }
          return await response.json();
        }, `NVIDIA NIM FALLBACK (${nvidiaFallbackModel})`, 2, 1500);
        console.log(`[LLM] \u2705 NVIDIA NIM FALLBACK respondeu com sucesso!`);
        return {
          choices: nvidiaFallbackResponse.choices?.map((c) => ({
            message: { content: c.message?.content ?? null },
            finishReason: c.finish_reason
          })) || []
        };
      } catch (nvidiaFallbackError) {
        console.error(`\u274C [LLM] NVIDIA NIM FALLBACK tamb\xE9m falhou: ${nvidiaFallbackError?.message}`);
      }
    }
    if (hasOpenRouterKey) {
      console.error("\u{1F504} [LLM FALLBACK] Tentando OpenRouter como fallback...");
      console.error("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
      try {
        const fallbackModel = config.openrouterModel || "google/gemma-3-4b-it:free";
        console.log(`[LLM] \u{1F198} OpenRouter FALLBACK - Modelo: ${fallbackModel}`);
        const fallbackResponse = await withRetryLLM(async () => {
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${config.openrouterApiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://agentezap.online",
              "X-Title": "AgenteZap"
            },
            body: JSON.stringify({
              model: fallbackModel,
              messages: params.messages,
              max_tokens: params.maxTokens ?? 500,
              temperature: params.temperature ?? 0.7
            })
          });
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[LLM] OpenRouter FALLBACK error: ${response.status} - ${errorText}`);
            const error = new Error(`OpenRouter FALLBACK error: ${response.status}`);
            error.status = response.status;
            throw error;
          }
          return await response.json();
        }, `OpenRouter FALLBACK (${fallbackModel})`, 3, 2e3);
        console.log(`[LLM] \u2705 OpenRouter FALLBACK respondeu com sucesso!`);
        return {
          choices: fallbackResponse.choices?.map((c) => ({
            message: { content: c.message?.content ?? null },
            finishReason: c.finish_reason
          })) || []
        };
      } catch (openrouterFallbackError) {
        console.error(`\u274C [LLM] OpenRouter FALLBACK tamb\xE9m falhou: ${openrouterFallbackError?.message}`);
      }
    }
    if (hasOpenRouterKey) {
      console.error("\u{1F504} [LLM FALLBACK] Tentando OpenRouter (mistral-nemo) como \xFAltimo fallback...");
      console.error("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
      try {
        const fallbackModel = "mistralai/mistral-nemo";
        console.log(`[LLM] \u{1F198} OpenRouter mistral-nemo FALLBACK - Modelo: ${fallbackModel}`);
        const nemoFallbackResponse = await withRetryLLM(async () => {
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${config.openrouterApiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://agentezap.online",
              "X-Title": "AgenteZap"
            },
            body: JSON.stringify({
              model: fallbackModel,
              messages: params.messages,
              max_tokens: params.maxTokens ?? 500,
              temperature: params.temperature ?? 0.7
            })
          });
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[LLM] OpenRouter mistral-nemo FALLBACK error: ${response.status} - ${errorText}`);
            const error = new Error(`OpenRouter mistral-nemo FALLBACK error: ${response.status}`);
            error.status = response.status;
            throw error;
          }
          return await response.json();
        }, `OpenRouter mistral-nemo FALLBACK`, 3, 2e3);
        console.log(`[LLM] \u2705 OpenRouter mistral-nemo FALLBACK respondeu!`);
        return {
          choices: nemoFallbackResponse.choices?.map((c) => ({
            message: { content: c.message?.content ?? null },
            finishReason: c.finish_reason
          })) || []
        };
      } catch (nemoFallbackError) {
        console.error(`\u274C [LLM] OpenRouter mistral-nemo FALLBACK tamb\xE9m falhou: ${nemoFallbackError?.message}`);
      }
    }
    console.error("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
    console.error("\u274C [LLM] TODOS OS PROVIDERS FALHARAM!");
    console.error("   \u2514\u2500 Mistral: Todos os modelos em rate limit");
    console.error("   \u2514\u2500 NVIDIA NIM: " + (hasNvidiaKey ? "Falhou" : "N\xE3o configurado"));
    console.error("   \u2514\u2500 OpenRouter: " + (hasOpenRouterKey ? "Falhou" : "N\xE3o configurado"));
    console.error("   \u2514\u2500 OpenRouter (mistral-nemo): " + (hasOpenRouterKey ? "Falhou" : "N\xE3o configurado"));
    console.error("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
    throw lastMistralError || new Error("Todos os provedores de LLM falharam");
  }
  if (config.provider === "openrouter" && config.openrouterApiKey && config.openrouterApiKey.length > 20) {
    try {
      const model = config.openrouterModel;
      const modelToProviderMap = {
        "google/gemma-3-4b-it:free": "auto",
        // Validado: 71.7% sucesso
        "google/gemma-3-4b-it": "auto",
        "google/gemma-3n-e4b-it": "together",
        "google/gemma-3n-e2b-it": "together",
        "google/gemma-3n-e4b-it:free": "together",
        "google/gemma-3n-e2b-it:free": "together"
      };
      const autoProvider = modelToProviderMap[model] || "auto";
      const configuredProvider = config.openrouterProvider || "auto";
      const providerSlug = autoProvider !== "auto" ? autoProvider : configuredProvider;
      console.log(`[LLM] \u{1F680} chatComplete via OpenRouter com modelo: ${model}, provider: ${providerSlug} (auto-detected: ${autoProvider}, configured: ${configuredProvider})`);
      const data = await withRetryLLM(async () => {
        const requestBody = {
          model,
          messages: params.messages,
          max_tokens: params.maxTokens ?? 500,
          temperature: params.temperature ?? 0.7
        };
        if (providerSlug !== "auto") {
          requestBody.provider = {
            order: [providerSlug],
            allow_fallbacks: true
            // ✅ Permitir fallback se provider não tiver o modelo
          };
        }
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${config.openrouterApiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://agentezap.online",
            "X-Title": "AgenteZap"
          },
          body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[LLM] OpenRouter API error: ${response.status} - ${errorText}`);
          const error = new Error(`OpenRouter API error: ${response.status}`);
          error.status = response.status;
          error.statusCode = response.status;
          throw error;
        }
        return await response.json();
      }, `OpenRouter chatComplete (${model} via ${providerSlug})`);
      const responseContent = data.choices?.[0]?.message?.content;
      const finishReason = data.choices?.[0]?.finish_reason;
      const promptTokens = data.usage?.prompt_tokens;
      const completionTokens = data.usage?.completion_tokens;
      console.log(`[LLM] \u2705 OpenRouter chatComplete respondeu (provider: ${providerSlug})`);
      console.log(`[LLM] \u{1F4CA} Tokens: prompt=${promptTokens || "N/A"}, completion=${completionTokens || "N/A"}`);
      console.log(`[LLM] \u{1F4CA} finish_reason: ${finishReason || "N/A"}`);
      console.log(`[LLM] \u{1F4CA} Response length: ${responseContent?.length || 0} chars`);
      if (!responseContent || responseContent.length === 0) {
        console.warn(`[LLM] \u26A0\uFE0F RESPOSTA VAZIA do OpenRouter! finish_reason=${finishReason}`);
        console.warn(`[LLM] \u26A0\uFE0F Full response: ${JSON.stringify(data).substring(0, 500)}`);
      } else {
        console.log(`[LLM] \u{1F4DD} Response preview: "${responseContent.substring(0, 100)}..."`);
      }
      return {
        choices: data.choices?.map((c) => ({
          message: { content: c.message?.content ?? null },
          finishReason: c.finish_reason
        })) || []
      };
    } catch (openrouterError) {
      console.error("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
      console.error("\u{1F504} [LLM FALLBACK] OpenRouter FALHOU ap\xF3s 3 tentativas!");
      console.error(`   \u2514\u2500 Erro: ${openrouterError?.message || openrouterError}`);
      console.error("\u{1F504} [LLM FALLBACK] Tentando NVIDIA NIM antes do Groq...");
      console.error("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
      if (hasNvidiaKey) {
        try {
          const nvidiaModel = config.nvidiaModel || "nvidia/llama-3.3-nemotron-super-49b-v1";
          console.log(`[LLM] \u{1F504} NVIDIA NIM fallback (ap\xF3s OpenRouter falhar) com modelo: ${nvidiaModel}`);
          const nvidiaContent = await callNvidiaAPI(
            params.messages,
            config.nvidiaApiKey,
            {
              model: nvidiaModel,
              maxTokens: params.maxTokens ?? 500,
              temperature: params.temperature ?? 0.7
            }
          );
          console.log(`[LLM] \u2705 NVIDIA NIM respondeu como fallback do OpenRouter!`);
          return {
            choices: [{
              message: { content: nvidiaContent },
              finishReason: "stop"
            }]
          };
        } catch (nvidiaFallbackError) {
          console.error(`[LLM] \u274C NVIDIA NIM fallback tamb\xE9m falhou: ${nvidiaFallbackError?.message}`);
        }
      }
    }
  }
  if ((config.provider === "groq" || config.provider === "openrouter" || config.provider === "nvidia" || config.provider === "mistral") && config.openrouterApiKey && config.openrouterApiKey.length > 20) {
    try {
      const lastResortModel = "mistralai/mistral-nemo";
      console.log(`[LLM] \u{1F680} chatComplete via OpenRouter (\xFAltimo recurso) com modelo: ${lastResortModel}`);
      const data = await withRetryLLM(async () => {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${config.openrouterApiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://agentezap.online",
            "X-Title": "AgenteZap"
          },
          body: JSON.stringify({
            model: lastResortModel,
            messages: params.messages,
            max_tokens: params.maxTokens ?? 500,
            temperature: params.temperature ?? 0.7
          })
        });
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[LLM] OpenRouter (mistral-nemo) API error: ${response.status} - ${errorText}`);
          const error = new Error(`OpenRouter (mistral-nemo) API error: ${response.status}`);
          error.status = response.status;
          error.statusCode = response.status;
          throw error;
        }
        return await response.json();
      }, `OpenRouter mistral-nemo (\xFAltimo recurso)`);
      console.log(`[LLM] \u2705 OpenRouter mistral-nemo respondeu como \xFAltimo recurso`);
      return {
        choices: data.choices?.map((c) => ({
          message: { content: c.message?.content ?? null },
          finishReason: c.finish_reason
        })) || []
      };
    } catch (lastResortError) {
      console.error("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
      console.error("\u{1F504} [LLM FALLBACK] OpenRouter mistral-nemo FALHOU!");
      console.error(`   \u2514\u2500 Erro: ${lastResortError?.message || lastResortError}`);
      console.error("\u{1F504} [LLM FALLBACK] Tentando Mistral como \xFAltimo recurso absoluto...");
      console.error("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
    }
  }
  console.log("\u{1F198} [LLM FALLBACK FINAL] Usando Mistral como \xFAltimo recurso!");
  const mistralModel = config.mistralModel || "mistral-small-latest";
  console.log(`[LLM] \u{1F680} chatComplete via Mistral (fallback) com modelo: ${mistralModel}`);
  const mistral = await getMistralClient();
  const mistralResponse = await withRetryLLM(async () => {
    return await mistral.chat.complete({
      model: mistralModel,
      // Usar modelo configurado no admin
      messages: params.messages,
      maxTokens: params.maxTokens ?? 500,
      temperature: params.temperature ?? 0.7,
      randomSeed: params.randomSeed
    });
  }, `Mistral fallback (${mistralModel})`, 3, 2e3);
  console.log(`[LLM] \u2705 Mistral chatComplete respondeu`);
  return {
    choices: mistralResponse.choices?.map((c) => ({
      message: { content: c.message?.content ?? null },
      finishReason: c.finishReason
    })) || []
  };
}
async function getLLMClient() {
  return {
    chat: {
      complete: chatComplete
    }
  };
}
async function generateWithLLM(systemPrompt, userMessage, options) {
  try {
    const response = await chatComplete({
      model: options?.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      maxTokens: options?.maxTokens || 500,
      temperature: options?.temperature ?? 0.7
    });
    if (!response || !response.choices || response.choices.length === 0) {
      throw new Error("No response from LLM");
    }
    return response.choices[0].message.content || "";
  } catch (error) {
    console.error("[LLM] Error generating text:", error);
    throw new Error(`Failed to generate text: ${error.message}`);
  }
}
async function classifyMediaWithLLM(input) {
  const startTime = Date.now();
  try {
    console.log(`
\u{1F916} [MEDIA AI] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`);
    console.log(`\u{1F916} [MEDIA AI] Iniciando classifica\xE7\xE3o de m\xEDdia com LLM...`);
    const { clientMessage, conversationHistory, mediaLibrary, sentMedias = [], aiResponseText } = input;
    const availableMedia = mediaLibrary.filter((m) => {
      const alreadySent = sentMedias.some((sent) => sent.toUpperCase() === m.name.toUpperCase());
      return !alreadySent && m.isActive !== false;
    });
    if (availableMedia.length === 0) {
      console.log(`\u{1F916} [MEDIA AI] \u274C Nenhuma m\xEDdia dispon\xEDvel`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: "Nenhuma m\xEDdia dispon\xEDvel" };
    }
    const aiIntendedToSendMedia = aiResponseText ? detectMediaSendingIntent(aiResponseText) : false;
    if (aiIntendedToSendMedia) {
      console.log(`\u{1F916} [MEDIA AI] \u{1F3AF} IA principal EXPRESSOU INTEN\xC7\xC3O de enviar m\xEDdia na resposta!`);
      console.log(`\u{1F916} [MEDIA AI] \u{1F4AC} Resposta IA: "${aiResponseText.substring(0, 150)}..."`);
    }
    const clientMsgCount = conversationHistory.filter((m) => !m.fromMe).length;
    const isFirstMessage = clientMsgCount <= 1;
    const recentHistory = conversationHistory.slice(-10).map((m) => `${m.fromMe ? "Agente" : "Cliente"}: ${m.text || "(sem texto)"}`).join("\n");
    const mediaListForAI = availableMedia.map((m, i) => `${i + 1}. NOME: "${m.name}" | TIPO: ${m.type} | QUANDO USAR: ${m.whenToUse || "n\xE3o especificado"}`).join("\n");
    const systemPrompt = `Voc\xEA \xE9 um sistema de classifica\xE7\xE3o de m\xEDdia para um chatbot de WhatsApp.
Sua tarefa \xE9 analisar a conversa e decidir SE e QUAL m\xEDdia deve ser enviada ao cliente.

## REGRAS IMPORTANTES:
1. Se for PRIMEIRA MENSAGEM do cliente (sauda\xE7\xE3o como "oi", "ol\xE1", "bom dia"), procure por m\xEDdia de boas-vindas/in\xEDcio
2. Apenas recomende m\xEDdia se for CLARAMENTE RELEVANTE para o contexto
3. N\xC3O recomende m\xEDdia se o cliente estiver fazendo perguntas espec\xEDficas que n\xE3o precisam de m\xEDdia
4. Leia o campo "QUANDO USAR" de cada m\xEDdia para entender quando \xE9 apropriado enviar
5. Se nenhuma m\xEDdia for claramente apropriada, responda com NO_MEDIA
6. Confian\xE7a deve ser entre 0-100 (apenas envie se > 60)
${aiIntendedToSendMedia ? `
## \u{1F6A8} CONTEXTO CR\xCDTICO: A IA PRINCIPAL J\xC1 DECIDIU ENVIAR M\xCDDIA!
A IA que gerou a resposta ao cliente J\xC1 EXPRESSOU INTEN\xC7\xC3O de enviar m\xEDdia.
Ela disse algo como "vou te enviar", "segue o v\xEDdeo", "aqui est\xE1 o \xE1udio", etc.
Portanto, voc\xEA DEVE encontrar a m\xEDdia mais adequada para enviar.
N\xC3O responda NO_MEDIA a menos que NENHUMA m\xEDdia seja remotamente relevante.
A confian\xE7a m\xEDnima DEVE ser 70+ quando a IA j\xE1 decidiu enviar.
` : ""}
## RESPONDA APENAS EM JSON:
{"decision": "SEND" ou "NO_MEDIA", "mediaName": "NOME_EXATO_DA_MIDIA" ou null, "confidence": 0-100, "reason": "explica\xE7\xE3o breve"}`;
    const userPrompt = `## CONTEXTO:
\xC9 a primeira mensagem do cliente? ${isFirstMessage ? "SIM" : "N\xC3O"}
Mensagem atual do cliente: "${clientMessage}"
${aiResponseText ? `
## RESPOSTA DA IA PRINCIPAL (que ser\xE1 enviada ao cliente):
"${aiResponseText.substring(0, 500)}"
` : ""}
## HIST\xD3RICO RECENTE:
${recentHistory || "(primeira intera\xE7\xE3o)"}

## M\xCDDIAS DISPON\xCDVEIS:
${mediaListForAI}

## M\xCDDIAS J\xC1 ENVIADAS (n\xE3o repetir):
${sentMedias.join(", ") || "nenhuma"}

Analise e decida se alguma m\xEDdia deve ser enviada. Responda APENAS o JSON.`;
    const response = await chatComplete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      maxTokens: 150,
      temperature: 0.1
      // Baixa para decisões mais consistentes
    });
    const elapsedMs = Date.now() - startTime;
    if (!response || !response.choices || response.choices.length === 0) {
      console.log(`\u{1F916} [MEDIA AI] \u274C Sem resposta da API (${elapsedMs}ms)`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: "Sem resposta da API" };
    }
    const rawResponse = response.choices[0].message.content;
    console.log(`\u{1F916} [MEDIA AI] \u{1F4E5} Resposta bruta (${elapsedMs}ms): ${rawResponse}`);
    let jsonToParse = null;
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonToParse = jsonMatch[0];
    } else {
      const incompleteMatch = rawResponse.match(/\{[\s\S]*/);
      if (incompleteMatch) {
        let attempt = incompleteMatch[0].trim();
        attempt = attempt.replace(/```json\s*/gi, "").replace(/```\s*$/gi, "");
        const openBraces = (attempt.match(/\{/g) || []).length;
        const closeBraces = (attempt.match(/\}/g) || []).length;
        const missingBraces = openBraces - closeBraces;
        if (missingBraces > 0) {
          attempt += "}".repeat(missingBraces);
          console.log(`\u{1F916} [MEDIA AI] \u{1F527} JSON consertado (adicionado ${missingBraces} chave(s) faltante(s))`);
        }
        jsonToParse = attempt;
      }
    }
    if (!jsonToParse) {
      console.log(`\u{1F916} [MEDIA AI] \u26A0\uFE0F N\xE3o conseguiu extrair JSON`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: "Resposta n\xE3o \xE9 JSON v\xE1lido" };
    }
    try {
      jsonToParse = jsonToParse.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
      const parsed = JSON.parse(jsonToParse);
      const confidenceThreshold = aiIntendedToSendMedia ? 20 : 40;
      const result = {
        shouldSend: parsed.decision === "SEND" && parsed.confidence >= confidenceThreshold,
        mediaName: parsed.mediaName || null,
        confidence: parsed.confidence || 0,
        reason: parsed.reason || "Sem raz\xE3o especificada"
      };
      console.log(`\u{1F916} [MEDIA AI] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`);
      if (result.shouldSend) {
        console.log(`\u{1F916} [MEDIA AI] \u2705 DECIS\xC3O: ENVIAR "${result.mediaName}"`);
      } else {
        console.log(`\u{1F916} [MEDIA AI] \u274C DECIS\xC3O: N\xC3O ENVIAR (threshold=${confidenceThreshold}%)`);
        if (parsed.confidence >= 30 && parsed.confidence < confidenceThreshold) {
          console.log(`\u{1F916} [MEDIA AI] \u26A0\uFE0F ATEN\xC7\xC3O: Confian\xE7a ${parsed.confidence}% pr\xF3xima do threshold`);
        }
      }
      console.log(`\u{1F916} [MEDIA AI] \u{1F4CA} Confian\xE7a: ${result.confidence}%`);
      console.log(`\u{1F916} [MEDIA AI] \u{1F4A1} Raz\xE3o: ${result.reason}`);
      console.log(`\u{1F916} [MEDIA AI] \u23F1\uFE0F Tempo: ${elapsedMs}ms`);
      console.log(`\u{1F916} [MEDIA AI] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
`);
      return result;
    } catch (parseError) {
      console.log(`\u{1F916} [MEDIA AI] \u26A0\uFE0F Erro ao parsear JSON: ${parseError}`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: "Erro ao parsear resposta" };
    }
  } catch (error) {
    console.error(`\u{1F916} [MEDIA AI] \u274C ERRO: ${error.message}`);
    return { shouldSend: false, mediaName: null, confidence: 0, reason: `Erro: ${error.message}` };
  }
}
function detectMediaSendingIntent(aiResponseText) {
  if (!aiResponseText) return false;
  const normalized = aiResponseText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const mediaIntentPatterns = [
    // Frases de envio direto
    /vou\s+te\s+enviar/,
    /vou\s+enviar/,
    /ja\s+te\s+envio/,
    /te\s+envio\s+/,
    /te\s+mando\s+/,
    /vou\s+te\s+mandar/,
    /vou\s+mandar/,
    /enviando\s+(o|a|um|uma|esse|essa|este|esta|pra|para)/,
    /segue\s+(o|a|um|uma)\s+(video|audio|imagem|documento|pdf|foto|arquivo|material)/,
    /aqui\s+esta\s+(o|a|um|uma)\s+(video|audio|imagem|documento|pdf|foto|arquivo|material)/,
    /confira?\s+(o|a|esse|essa|este|esta)\s+(video|audio|imagem|documento|pdf|foto|arquivo|material)/,
    /olha?\s+(o|a|esse|essa|este|esta)\s+(video|audio|imagem|documento|pdf|foto|arquivo|material)/,
    /assista\s+(o|a|esse|essa|este|esta)/,
    /ouca\s+(o|a|esse|essa|este|esta)/,
    /veja\s+(o|a|esse|essa|este|esta)\s+(video|audio|imagem|documento|pdf|foto|arquivo|material)/,
    /da\s+uma\s+olhada\s+n(o|a|esse|essa)/,
    /deixa\s+eu\s+te\s+(enviar|mandar|mostrar|passar)/,
    /to\s+te\s+enviando/,
    /estou\s+te\s+enviando/,
    /ja\s+estou\s+enviando/,
    /preparei\s+(um|uma|esse|essa)\s+(video|audio|imagem|documento|material)/,
    /tenho\s+(um|uma)\s+(video|audio|imagem|material)\s+(pra|para)\s+(voce|vc|ti)/,
    // Frases indicando conteúdo multimídia  
    /vai\s+receber\s+(o|a|um|uma)/,
    /pode\s+assistir/,
    /pode\s+ouvir/,
    /pode\s+conferir\s+(o|a|esse|essa|no|na)\s*(video|audio)/
  ];
  for (const pattern of mediaIntentPatterns) {
    if (pattern.test(normalized)) {
      return true;
    }
  }
  return false;
}

export {
  getMistralQueueInfo,
  clearExpiredMistralCooldowns,
  getMistralModelStatus,
  withRetryLLM,
  invalidateLLMConfigCache,
  getLLMConfig,
  callGroq,
  getCurrentProvider,
  chatComplete,
  getLLMClient,
  generateWithLLM,
  classifyMediaWithLLM,
  detectMediaSendingIntent
};
