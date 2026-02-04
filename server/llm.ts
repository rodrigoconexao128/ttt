/**
 * LLM Service - Provider Abstraction Layer
 * 
 * Este módulo fornece funções para chamadas de LLM (Large Language Models)
 * Suporta: OpenRouter (primário), Groq e Mistral (fallback)
 * 
 * Configuração via system_config:
 * - llm_provider: 'openrouter' | 'groq' | 'mistral'
 * - openrouter_api_key: Chave API do OpenRouter
 * - openrouter_model: Modelo do OpenRouter (ex: 'meta-llama/llama-3.3-70b-instruct:free')
 * - groq_api_key: Chave API do Groq
 * - groq_model: Modelo do Groq (ex: 'openai/gpt-oss-20b')
 */

import { getMistralClient } from './mistralClient';
import { db } from './db';
import { systemConfig } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ============================================================================
// 🚀 CACHE PARA CONFIGURAÇÕES LLM
// ============================================================================
interface LLMConfigCache {
  provider: string;
  groqApiKey: string;
  groqModel: string;
  openrouterApiKey: string;
  openrouterModel: string;
  openrouterProvider: string; // Provider específico do OpenRouter (ex: 'chutes', 'hyperbolic')
  mistralApiKey: string; // 🆕 Mistral API key do banco de dados
  mistralModel: string;  // 🆕 Mistral model selecionado
  timestamp: number;
}
let llmConfigCache: LLMConfigCache | null = null;
const LLM_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// ============================================================================
// 🔄 SISTEMA DE ROTAÇÃO DE MODELOS MISTRAL (FALLBACK INTELIGENTE)
// ============================================================================
// Versão: 3.0 - Sistema de Fila Inteligente com Delay de 5 Minutos
// 
// COMPORTAMENTO:
// 1. Tenta modelos Mistral em rotação round-robin
// 2. Se todos falharem, AGUARDA e RETENTA por até 5 MINUTOS
// 3. Só após 5 minutos de falhas contínuas, faz fallback para OpenRouter/Groq
// 4. Cada modelo tem delay específico baseado no rate limit testado
// 5. Respeita a fila por canal existente (human delay)

// ============================================================================
// 🔥 MODELOS VALIDADOS POR STRESS TEST (2 MINUTOS, 4128 REQUISIÇÕES)
// ============================================================================
// Data do teste: Atualizado após benchmark agressivo
// Total testados: 40+ modelos Mistral + OpenRouter
// Resultado: APENAS 4 modelos Mistral funcionam com sucesso consistente
//
// 🥇 mistral-medium-latest - 22.6% sucesso, 10.5 req/min, delay 6s
// 🥈 mistral-medium-2312 - 13.0% sucesso, 6 req/min, delay 10s
// 🥉 mistral-medium - 12.8% sucesso, 6 req/min, delay 10s
// 4️⃣ mistral-large-2411 - 6.3% sucesso, 3 req/min, delay 20s
//
// ⛔ BLOQUEADOS (100% rate limit): mistral-small-*, open-mistral-*, 
//    ministral-*, pixtral-*, codestral-*, mistral-tiny-*
// ============================================================================

// Interface para modelos com rate limit info
interface MistralModelConfig {
  model: string;
  ratePerMinute: number;
  delaySeconds: number;
  successRate: number;
}

// 🔥 MODELOS VALIDADOS ordenados por preferência
const MISTRAL_VALIDATED_MODELS: MistralModelConfig[] = [
  { model: 'mistral-medium-latest', ratePerMinute: 10.5, delaySeconds: 6, successRate: 22.6 },
  { model: 'mistral-medium-2312', ratePerMinute: 6, delaySeconds: 10, successRate: 13.0 },
  { model: 'mistral-medium', ratePerMinute: 6, delaySeconds: 10, successRate: 12.8 },
  { model: 'mistral-large-2411', ratePerMinute: 3, delaySeconds: 20, successRate: 6.3 },
  // Tier 2 - menos testados mas podem funcionar
  { model: 'mistral-large-latest', ratePerMinute: 3, delaySeconds: 20, successRate: 5.0 },
  { model: 'mistral-large-2407', ratePerMinute: 3, delaySeconds: 20, successRate: 5.0 },
  { model: 'mistral-large-2402', ratePerMinute: 3, delaySeconds: 20, successRate: 5.0 },
];

const MISTRAL_FALLBACK_MODELS = MISTRAL_VALIDATED_MODELS.map(m => m.model);

// ============================================================================
// 🕐 SISTEMA DE TRACKING PARA DELAY DE 5 MINUTOS
// ============================================================================
// Quando TODOS os modelos Mistral falham, não fazemos fallback imediatamente
// Em vez disso, esperamos até 5 minutos tentando repetidamente antes de fallback

interface MistralQueueStatus {
  firstFailureTime: number | null;  // Timestamp da primeira falha
  totalAttempts: number;            // Total de tentativas nesta sessão
  lastAttemptTime: number;          // Timestamp da última tentativa
  roundRobinIndex: number;          // Índice atual no round-robin
}

const MISTRAL_EXTERNAL_FALLBACK_DELAY_MS = 5 * 60 * 1000; // 5 minutos antes de fallback externo
const mistralQueueStatus: MistralQueueStatus = {
  firstFailureTime: null,
  totalAttempts: 0,
  lastAttemptTime: 0,
  roundRobinIndex: 0,
};

/**
 * Verifica se já passou tempo suficiente para fazer fallback para OpenRouter/Groq
 * Retorna true se podemos fazer fallback, false se devemos continuar tentando Mistral
 */
function canFallbackToExternal(): boolean {
  if (!mistralQueueStatus.firstFailureTime) {
    return false; // Nunca falhou, não precisa fallback
  }
  
  const timeElapsed = Date.now() - mistralQueueStatus.firstFailureTime;
  const canFallback = timeElapsed >= MISTRAL_EXTERNAL_FALLBACK_DELAY_MS;
  
  if (canFallback) {
    console.log(`✅ [MISTRAL QUEUE] Passaram ${Math.round(timeElapsed/1000)}s (${Math.round(timeElapsed/60000)} min) - LIBERADO para fallback externo`);
  } else {
    const remaining = Math.ceil((MISTRAL_EXTERNAL_FALLBACK_DELAY_MS - timeElapsed) / 1000);
    console.log(`⏳ [MISTRAL QUEUE] Aguardando ${remaining}s (${Math.round(remaining/60)} min) antes de fallback externo...`);
  }
  
  return canFallback;
}

/**
 * Registra falha no sistema de fila Mistral
 */
function registerMistralFailure(): void {
  if (!mistralQueueStatus.firstFailureTime) {
    mistralQueueStatus.firstFailureTime = Date.now();
    console.log(`🚨 [MISTRAL QUEUE] Primeira falha registrada - iniciando timer de 5 minutos`);
  }
  mistralQueueStatus.totalAttempts++;
  mistralQueueStatus.lastAttemptTime = Date.now();
}

/**
 * Limpa o status da fila após sucesso (reseta o timer de 5 min)
 */
function clearMistralQueueStatus(): void {
  if (mistralQueueStatus.firstFailureTime) {
    console.log(`✅ [MISTRAL QUEUE] Fila limpa após ${mistralQueueStatus.totalAttempts} tentativas`);
  }
  mistralQueueStatus.firstFailureTime = null;
  mistralQueueStatus.totalAttempts = 0;
  mistralQueueStatus.roundRobinIndex = 0;
}

/**
 * Obtém próximo modelo no round-robin e delay recomendado
 */
function getNextMistralModelRoundRobin(): { model: string; delay: number } {
  const modelConfig = MISTRAL_VALIDATED_MODELS[mistralQueueStatus.roundRobinIndex];
  
  // Avança índice para próxima chamada
  mistralQueueStatus.roundRobinIndex = 
    (mistralQueueStatus.roundRobinIndex + 1) % MISTRAL_VALIDATED_MODELS.length;
  
  console.log(`🔄 [MISTRAL QUEUE] Round-robin: ${modelConfig.model} (delay: ${modelConfig.delaySeconds}s, rate: ${modelConfig.ratePerMinute}/min)`);
  
  return {
    model: modelConfig.model,
    delay: modelConfig.delaySeconds * 1000
  };
}

/**
 * Retorna status da fila para exibição (ex: no admin)
 */
export function getMistralQueueInfo(): {
  isInFailureMode: boolean;
  timeUntilFallback: number;
  totalAttempts: number;
  currentModelIndex: number;
  models: MistralModelConfig[];
} {
  const timeElapsed = mistralQueueStatus.firstFailureTime 
    ? Date.now() - mistralQueueStatus.firstFailureTime 
    : 0;
  const timeUntilFallback = Math.max(0, MISTRAL_EXTERNAL_FALLBACK_DELAY_MS - timeElapsed);
  
  return {
    isInFailureMode: mistralQueueStatus.firstFailureTime !== null,
    timeUntilFallback: Math.ceil(timeUntilFallback / 1000),
    totalAttempts: mistralQueueStatus.totalAttempts,
    currentModelIndex: mistralQueueStatus.roundRobinIndex,
    models: MISTRAL_VALIDATED_MODELS,
  };
}

// Tracking de cooldown por modelo (APENAS para a sessão atual)
// Cooldown curto: apenas para evitar retry imediato na mesma mensagem
interface MistralModelCooldown {
  model: string;
  cooldownUntil: number; // timestamp de quando o cooldown termina
  rateLimitCount: number; // quantas vezes foi rate limited nesta sessão
}
const mistralModelCooldowns: Map<string, MistralModelCooldown> = new Map();
const MISTRAL_MODEL_COOLDOWN_MS = 30 * 1000; // 30 segundos de cooldown (curto, pois só afeta retries imediatos)

/**
 * Limpa cooldowns expirados - chamado no início de cada nova mensagem
 * Isso garante que na próxima mensagem o modelo do admin seja tentado novamente
 */
export function clearExpiredMistralCooldowns(): void {
  const now = Date.now();
  let cleared = 0;
  for (const [model, cooldown] of mistralModelCooldowns.entries()) {
    if (cooldown.cooldownUntil < now) {
      mistralModelCooldowns.delete(model);
      cleared++;
    }
  }
  if (cleared > 0) {
    console.log(`🔄 [MISTRAL] Limpou ${cleared} cooldowns expirados`);
  }
}

/**
 * Obtém o próximo modelo Mistral disponível para fallback
 * @param preferredModel Modelo escolhido pelo admin (sempre tenta primeiro)
 * @param excludeModels Modelos que já falharam nesta mensagem (para não repetir)
 * @returns O melhor modelo disponível ou null se todos falharam
 */
function getNextAvailableMistralModel(preferredModel: string, excludeModels: string[] = []): string | null {
  const now = Date.now();
  
  // Limpar cooldowns expirados
  clearExpiredMistralCooldowns();
  
  // 1. Se o modelo preferido NÃO está na lista de exclusão, usar ele
  if (!excludeModels.includes(preferredModel)) {
    const preferredCooldown = mistralModelCooldowns.get(preferredModel);
    if (!preferredCooldown || preferredCooldown.cooldownUntil < now) {
      console.log(`✅ [MISTRAL ROTATION] Usando modelo do admin: ${preferredModel}`);
      return preferredModel;
    }
    const remainingCooldown = Math.ceil((preferredCooldown.cooldownUntil - now) / 1000);
    console.log(`⏳ [MISTRAL ROTATION] Modelo do admin ${preferredModel} em cooldown por ${remainingCooldown}s, buscando fallback...`);
  }
  
  // 2. Procurar fallback na lista de modelos econômicos
  for (const model of MISTRAL_FALLBACK_MODELS) {
    // Pular se já foi tentado nesta mensagem
    if (excludeModels.includes(model)) continue;
    
    // Pular se está em cooldown
    const cooldown = mistralModelCooldowns.get(model);
    if (cooldown && cooldown.cooldownUntil > now) continue;
    
    console.log(`🔄 [MISTRAL ROTATION] Usando fallback: ${model}`);
    return model;
  }
  
  // 3. Se todos falharam, retornar null
  console.log(`❌ [MISTRAL ROTATION] Nenhum modelo disponível! Todos em cooldown ou já tentados.`);
  return null;
}

/**
 * Marca um modelo como em cooldown após rate limit
 * O cooldown é curto para não afetar próximas mensagens
 */
function markMistralModelRateLimited(model: string): void {
  const existing = mistralModelCooldowns.get(model);
  const cooldownMultiplier = existing ? Math.min(existing.rateLimitCount + 1, 3) : 1; // Max 3x cooldown (30s, 60s, 90s)
  const cooldownMs = MISTRAL_MODEL_COOLDOWN_MS * cooldownMultiplier;
  
  mistralModelCooldowns.set(model, {
    model,
    cooldownUntil: Date.now() + cooldownMs,
    rateLimitCount: (existing?.rateLimitCount || 0) + 1
  });
  
  console.log(`🚫 [MISTRAL ROTATION] Modelo ${model} em COOLDOWN por ${cooldownMs/1000}s (rate limit #${(existing?.rateLimitCount || 0) + 1})`);
  
  // Listar modelos de fallback disponíveis
  const now = Date.now();
  const available = MISTRAL_FALLBACK_MODELS.filter(m => {
    const cd = mistralModelCooldowns.get(m);
    return !cd || cd.cooldownUntil < now;
  });
  console.log(`📊 [MISTRAL ROTATION] Fallbacks disponíveis: ${available.length > 0 ? available.join(', ') : 'NENHUM'}`);
}

/**
 * Retorna status de todos os modelos Mistral (para debug/admin)
 */
export function getMistralModelStatus(): { model: string; available: boolean; cooldownRemaining: number; rateLimitCount: number }[] {
  const now = Date.now();
  return MISTRAL_FALLBACK_MODELS.map(model => {
    const cooldown = mistralModelCooldowns.get(model);
    return {
      model,
      available: !cooldown || cooldown.cooldownUntil < now,
      cooldownRemaining: cooldown ? Math.max(0, Math.ceil((cooldown.cooldownUntil - now) / 1000)) : 0,
      rateLimitCount: cooldown?.rateLimitCount || 0
    };
  });
}

// ============================================================================
// 🔄 FUNÇÃO DE RETRY COM EXPONENTIAL BACKOFF PARA CHAMADAS DE API LLM
// ============================================================================
const LLM_MAX_RETRIES = 3;
const LLM_INITIAL_DELAY_MS = 1000;

/**
 * Executa uma operação com retry automático e exponential backoff
 * Específica para chamadas de API LLM (OpenRouter, Groq, etc)
 * 🔄 EXPORTADA para uso em outros módulos
 */
export async function withRetryLLM<T>(
  operation: () => Promise<T>,
  operationName: string = "LLM API call",
  maxRetries: number = LLM_MAX_RETRIES,
  initialDelayMs: number = LLM_INITIAL_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Log de início de cada tentativa
      console.log(`🔄 [LLM RETRY] ${operationName} - Tentativa ${attempt}/${maxRetries}...`);
      
      const result = await operation();
      
      // Log de sucesso
      if (attempt > 1) {
        console.log(`✅ [LLM RETRY] ${operationName} - SUCESSO na tentativa ${attempt}/${maxRetries}!`);
      }
      
      return result;
    } catch (error: any) {
      lastError = error;
      
      // Extrair status code do erro (pode estar em diferentes formatos)
      const statusCode = error?.status || error?.statusCode || 
                        (error?.message?.match(/error: (\d+)/)?.[1] ? parseInt(error.message.match(/error: (\d+)/)[1]) : null);
      
      // 🔄 RATE LIMIT: Lançar IMEDIATAMENTE para permitir rotação de modelos
      // A rotação é feita na função que chama (chatComplete/callMistralAPI)
      const isRateLimit = statusCode === 429 || 
                          error?.message?.toLowerCase()?.includes('rate limit') ||
                          error?.message?.toLowerCase()?.includes('too many requests');
      
      if (isRateLimit) {
        console.log(`⚡ [LLM RETRY] ${operationName} - RATE LIMIT! Lançando para rotação de modelos...`);
        throw error; // Lançar imediatamente para rotação de modelos
      }
      
      // Verificar se é um erro que vale a pena tentar novamente (exceto rate limit, já tratado acima)
      const isRetryable = 
        statusCode === 500 || // Server error
        statusCode === 502 || // Bad gateway
        statusCode === 503 || // Service unavailable
        statusCode === 504 || // Gateway timeout
        statusCode === 520 || // Cloudflare error
        statusCode === 521 || // Cloudflare error
        statusCode === 522 || // Cloudflare timeout
        statusCode === 523 || // Cloudflare error
        statusCode === 524 || // Cloudflare timeout
        error?.code === 'ECONNRESET' ||
        error?.code === 'ETIMEDOUT' ||
        error?.code === 'ENOTFOUND' ||
        error?.code === 'ECONNREFUSED' ||
        error?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        error?.message?.toLowerCase()?.includes('timeout') ||
        error?.message?.toLowerCase()?.includes('connection') ||
        error?.message?.toLowerCase()?.includes('overloaded') ||
        error?.message?.toLowerCase()?.includes('temporarily unavailable');
      
      if (!isRetryable || attempt === maxRetries) {
        console.error(`❌ [LLM RETRY] ${operationName} - ESGOTOU ${maxRetries} tentativas!`);
        console.error(`   └─ Erro final: ${error?.message || error}`);
        console.error(`   └─ Status: ${statusCode || 'N/A'}`);
        console.error(`   └─ Retryable: ${isRetryable ? 'SIM' : 'NÃO'}`);
        throw error;
      }
      
      // Exponential backoff para erros de servidor (500, 502, etc.)
      const jitter = Math.random() * 500; // 0-500ms de jitter
      const delay = (initialDelayMs * Math.pow(2, attempt - 1)) + jitter;
      
      console.log(`⚠️ [LLM RETRY] ${operationName} - FALHOU tentativa ${attempt}/${maxRetries}`);
      console.log(`   └─ Erro: ${error?.message || 'Unknown'}`);
      console.log(`   └─ Status: ${statusCode || 'N/A'}`);
      console.log(`   └─ Próxima tentativa em: ${Math.round(delay / 1000)}s`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error(`${operationName} falhou após ${maxRetries} tentativas`);
}

/**
 * Invalida o cache de configuração LLM
 */
export function invalidateLLMConfigCache(): void {
  llmConfigCache = null;
  console.log(`[LLM] Cache de configuração invalidado`);
}

/**
 * Obtém configurações de LLM do banco de dados
 * 🔄 EXPORTADA para uso em outros módulos (aiAgent.ts, testAgentService.ts)
 */
export async function getLLMConfig(): Promise<{ 
  provider: string; 
  groqApiKey: string; 
  groqModel: string;
  openrouterApiKey: string;
  openrouterModel: string;
  openrouterProvider: string;
  mistralApiKey: string;
  mistralModel: string;
}> {
  // Verificar cache
  if (llmConfigCache && (Date.now() - llmConfigCache.timestamp < LLM_CONFIG_CACHE_TTL_MS)) {
    return {
      provider: llmConfigCache.provider,
      groqApiKey: llmConfigCache.groqApiKey,
      groqModel: llmConfigCache.groqModel,
      openrouterApiKey: llmConfigCache.openrouterApiKey,
      openrouterModel: llmConfigCache.openrouterModel,
      openrouterProvider: llmConfigCache.openrouterProvider,
      mistralApiKey: llmConfigCache.mistralApiKey,
      mistralModel: llmConfigCache.mistralModel
    };
  }
  
  try {
    const configs = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.chave, 'llm_provider'));
    
    const groqKeyResult = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.chave, 'groq_api_key'));
    
    const groqModelResult = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.chave, 'groq_model'));
    
    const openrouterKeyResult = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.chave, 'openrouter_api_key'));
    
    const openrouterModelResult = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.chave, 'openrouter_model'));
    
    const openrouterProviderResult = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.chave, 'openrouter_provider'));
    
    // 🆕 Fetch Mistral API key e model do banco de dados
    const mistralKeyResult = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.chave, 'mistral_api_key'));
    
    const mistralModelResult = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.chave, 'mistral_model'));
    
    const provider = configs[0]?.valor || 'mistral';
    const groqApiKey = groqKeyResult[0]?.valor || '';
    const groqModel = groqModelResult[0]?.valor || 'openai/gpt-oss-20b';
    const openrouterApiKey = openrouterKeyResult[0]?.valor || '';
    // 🥇 Default: google/gemma-3-4b-it:free - VALIDADO: 71.7% sucesso no stress test
    const openrouterModel = openrouterModelResult[0]?.valor || 'google/gemma-3-4b-it:free';
    const openrouterProvider = openrouterProviderResult[0]?.valor || 'auto'; // Default: auto (OpenRouter escolhe)
    const mistralApiKey = mistralKeyResult[0]?.valor || '';
    // 🥈 Default: mistral-medium-latest - VALIDADO: 22.6% sucesso, 10.5 req/min
    const mistralModel = mistralModelResult[0]?.valor || 'mistral-medium-latest';
    
    // Salvar no cache
    llmConfigCache = { provider, groqApiKey, groqModel, openrouterApiKey, openrouterModel, openrouterProvider, mistralApiKey, mistralModel, timestamp: Date.now() };
    
    console.log(`[LLM] Config loaded: provider=${provider}, model=${provider === 'openrouter' ? openrouterModel : (provider === 'groq' ? groqModel : mistralModel)}, openrouterProvider=${openrouterProvider}`);
    return { provider, groqApiKey, groqModel, openrouterApiKey, openrouterModel, openrouterProvider, mistralApiKey, mistralModel };
  } catch (error) {
    console.error('[LLM] Erro ao carregar configuração:', error);
    // 🔄 Defaults validados por stress test
    return { provider: 'mistral', groqApiKey: '', groqModel: 'openai/gpt-oss-20b', openrouterApiKey: '', openrouterModel: 'google/gemma-3-4b-it:free', openrouterProvider: 'auto', mistralApiKey: '', mistralModel: 'mistral-medium-latest' };
  }
}

/**
 * Chama o OpenRouter API COM RETRY AUTOMÁTICO
 * Implementa exponential backoff para lidar com rate limits e erros temporários
 * Suporta provider dinâmico configurado pelo admin (ex: 'together', 'chutes', etc)
 */
async function callOpenRouterAPI(
  messages: ChatMessage[],
  apiKey: string,
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    openrouterProvider?: string; // Provider dinâmico (ex: 'together', 'chutes', 'hyperbolic', 'auto')
  }
): Promise<string> {
  // 🥇 google/gemma-3-4b-it:free - VALIDADO por stress test: 71.7% sucesso, 19 req/min
  const model = options?.model || 'google/gemma-3-4b-it:free';
  const providerSlug = options?.openrouterProvider || 'auto'; // auto = OpenRouter escolhe o melhor
  
  // 🎯 Só pula provider se for explicitamente 'auto' ou vazio
  const isAutoProvider = providerSlug === 'auto' || providerSlug === '';
  
  console.log(`[LLM] 🚀 Chamando OpenRouter API com modelo: ${model}, provider: ${isAutoProvider ? 'auto (OpenRouter escolhe)' : providerSlug}`);
  
  // 🔄 Usar retry automático para lidar com erros temporários
  return await withRetryLLM(async () => {
    // Construir body da requisição
    const requestBody: any = {
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 500
    };
    
    // 🎯 Adiciona provider se NÃO for 'auto'
    if (!isAutoProvider) {
      requestBody.provider = {
        order: [providerSlug],
        allow_fallbacks: true  // Permitir fallback para outros providers se necessário
      };
    }
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://agentezap.online',
        'X-Title': 'AgenteZap'
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LLM] OpenRouter API error: ${response.status} - ${errorText}`);
      // Criar erro com status para que withRetryLLM possa identificar
      const error = new Error(`OpenRouter API error: ${response.status}`) as any;
      error.status = response.status;
      error.statusCode = response.status;
      throw error;
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    console.log(`[LLM] ✅ OpenRouter respondeu com ${content?.length || 0} caracteres (provider: ${providerSlug})`);
    return typeof content === 'string' ? content : '';
  }, `OpenRouter API (${model})`);
}

/**
 * Chama o Groq API diretamente COM RETRY AUTOMÁTICO
 * Implementa exponential backoff para lidar com rate limits e erros temporários
 */
async function callGroqAPI(
  messages: ChatMessage[],
  apiKey: string,
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  const model = options?.model || 'openai/gpt-oss-20b';
  
  console.log(`[LLM] 🚀 Chamando Groq API com modelo: ${model}`);
  
  // 🔄 Usar retry automático para lidar com erros temporários
  return await withRetryLLM(async () => {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 500,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LLM] Groq API error: ${response.status} - ${errorText}`);
      // Criar erro com status para que withRetryLLM possa identificar
      const error = new Error(`Groq API error: ${response.status}`) as any;
      error.status = response.status;
      error.statusCode = response.status;
      throw error;
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    console.log(`[LLM] ✅ Groq respondeu com ${content?.length || 0} caracteres`);
    return typeof content === 'string' ? content : '';
  }, `Groq API (${model})`);
}

/**
 * Chama o Mistral API COM ROTAÇÃO AUTOMÁTICA DE MODELOS
 * Quando um modelo atinge rate limit, rotaciona para o próximo disponível
 * 🔧 NOVA VERSÃO: Rotação inteligente entre modelos gratuitos
 */
async function callMistralAPI(
  messages: ChatMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  const mistral = await getMistralClient();
  
  if (!mistral) {
    console.error('[LLM] Mistral client não disponível');
    return '';
  }
  
  // 🔄 NOVA LÓGICA: Sempre tenta o modelo do admin primeiro
  // Se falhar, usa fallback para modelos econômicos
  const adminModel = options?.model || 'mistral-small-latest';
  const triedModels: string[] = []; // Modelos já tentados nesta mensagem
  
  // Limpar cooldowns expirados no início de cada mensagem
  clearExpiredMistralCooldowns();
  
  console.log(`[LLM] 🎯 Modelo escolhido pelo admin: ${adminModel}`);
  
  // 🔄 Tentar até 15 modelos diferentes (temos 24 modelos de fallback agora)
  const maxModelAttempts = 15;
  let lastError: Error | null = null;
  
  for (let modelAttempt = 1; modelAttempt <= maxModelAttempts; modelAttempt++) {
    // Obter próximo modelo (admin primeiro, depois fallbacks)
    const currentModel = getNextAvailableMistralModel(adminModel, triedModels);
    
    if (!currentModel) {
      console.error('[LLM] ❌ Nenhum modelo Mistral disponível após tentar todos os fallbacks!');
      break;
    }
    
    triedModels.push(currentModel);
    const isAdminModel = currentModel === adminModel;
    
    console.log(`[LLM] 🚀 Chamando Mistral - Modelo: ${currentModel} ${isAdminModel ? '(ADMIN)' : '(FALLBACK)'} [${modelAttempt}/${maxModelAttempts}]`);
    
    try {
      // 🔄 Usar retry para erros temporários (mas só 1 retry para rate limit)
      const result = await withRetryLLM(async () => {
        const response = await mistral.chat.complete({
          model: currentModel!,
          messages: messages,
          temperature: options?.temperature ?? 0.7,
          maxTokens: options?.maxTokens ?? 500,
        });
        
        const content = response.choices?.[0]?.message?.content;
        console.log(`[LLM] ✅ Mistral (${currentModel}) respondeu com ${typeof content === 'string' ? content.length : 0} caracteres`);
        return typeof content === 'string' ? content : '';
      }, `Mistral API (${currentModel})`, 2, 1500); // 2 retries, 1.5s delay
      
      return result;
      
    } catch (error: any) {
      lastError = error;
      
      // Verificar se é rate limit
      const isRateLimit = error?.status === 429 || 
                          error?.statusCode === 429 ||
                          error?.message?.toLowerCase()?.includes('rate limit') ||
                          error?.message?.toLowerCase()?.includes('too many requests');
      
      if (isRateLimit) {
        console.log(`⚠️ [LLM] Rate limit no modelo ${currentModel} - buscando fallback...`);
        markMistralModelRateLimited(currentModel);
        continue; // Tentar próximo modelo na lista de fallback
      }
      
      // Se não for rate limit, propagar erro (não adianta tentar outro modelo)
      console.error(`❌ [LLM] Erro não-recuperável no Mistral (${currentModel}): ${error?.message || error}`);
      throw error;
    }
  }
  
  console.error(`❌ [LLM] Todos os ${triedModels.length} modelos Mistral falharam! Tentados: ${triedModels.join(', ')}`);
  throw lastError || new Error('Todos os modelos Mistral falharam');
}

/**
 * Função principal de chamada LLM - usa provider configurado
 */
export async function callGroq(
  messages: ChatMessage[] | string,
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  try {
    // ✅ Suportar tanto array de ChatMessage quanto string simples
    const formattedMessages: ChatMessage[] = typeof messages === 'string' 
      ? [{ role: 'user' as const, content: messages }]
      : messages;
    
    // Obter configuração do provider
    const config = await getLLMConfig();
    
    // Se provider é OpenRouter e tem API key válida
    if (config.provider === 'openrouter' && config.openrouterApiKey && config.openrouterApiKey.length > 20) {
      try {
        return await callOpenRouterAPI(formattedMessages, config.openrouterApiKey, {
          ...options,
          model: options?.model || config.openrouterModel,
          openrouterProvider: config.openrouterProvider // 🎯 Provider dinâmico!
        });
      } catch (openrouterError) {
        console.error('[LLM] Erro no OpenRouter, tentando fallback para Groq:', openrouterError);
        // Fallback para Groq em caso de erro
        if (config.groqApiKey && config.groqApiKey.length > 20) {
          return await callGroqAPI(formattedMessages, config.groqApiKey, {
            ...options,
            model: options?.model || config.groqModel
          });
        }
      }
    }
    
    // Se provider é Groq e tem API key válida
    if (config.provider === 'groq' && config.groqApiKey && config.groqApiKey.length > 20) {
      try {
        return await callGroqAPI(formattedMessages, config.groqApiKey, {
          ...options,
          model: options?.model || config.groqModel
        });
      } catch (groqError) {
        console.error('[LLM] Erro no Groq, tentando fallback para Mistral:', groqError);
        // Fallback para Mistral em caso de erro
        return await callMistralAPI(formattedMessages, options);
      }
    }
    
    // Default: usar Mistral
    return await callMistralAPI(formattedMessages, options);
  } catch (error) {
    console.error('[LLM] Erro ao chamar LLM:', error);
    return '';
  }
}

/**
 * Função para obter o provider atual (para logs/debug)
 */
export async function getCurrentProvider(): Promise<string> {
  const config = await getLLMConfig();
  return config.provider;
}

/**
 * Interface compatível com resposta do Mistral
 */
export interface LLMChatResponse {
  choices: Array<{
    message: {
      content: string | null;
    };
    finishReason?: string;
  }>;
}

/**
 * Função de chat completo - substitui getMistralClient().chat.complete()
 * Usa o provider configurado (OpenRouter, Groq ou Mistral)
 * 🔄 COM RETRY AUTOMÁTICO para lidar com rate limits e erros temporários
 */
export async function chatComplete(params: {
  model?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  randomSeed?: number;
}): Promise<LLMChatResponse> {
  const config = await getLLMConfig();
  
  // 🔐 VERIFICAÇÃO DE API KEY - Verificar se pelo menos UM provider tem chave configurada
  const hasOpenRouterKey = config.openrouterApiKey && config.openrouterApiKey.length > 20;
  const hasGroqKey = config.groqApiKey && config.groqApiKey.length > 20;
  // 🔧 CORRIGIDO: Verificar Mistral key do banco de dados OU variável de ambiente
  const hasMistralKey = (config.mistralApiKey && config.mistralApiKey.length > 10) || (!!process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.length > 10);
  
  if (!hasOpenRouterKey && !hasGroqKey && !hasMistralKey) {
    console.error('❌ [LLM] ERRO: Nenhuma API key configurada!');
    console.error('   └─ Configure uma chave em: Admin → Configurações → Provedor de IA');
    console.error('   └─ Provider atual: ' + config.provider);
    throw new Error('API key não configurada. Configure uma chave de API em: Admin → Configurações → Provedor de IA (LLM)');
  }
  
  // 🎯 Se provider é Mistral e tem API key válida - USAR COM ROTAÇÃO DE MODELOS
  if (config.provider === 'mistral' && hasMistralKey) {
    const adminModel = config.mistralModel || 'mistral-small-latest';
    const triedModels: string[] = []; // Modelos já tentados nesta mensagem
    
    // Limpar cooldowns expirados no início de cada mensagem
    clearExpiredMistralCooldowns();
    
    console.log(`[LLM] 🎯 chatComplete via Mistral - Modelo do admin: ${adminModel}`);
    
    // 🔄 Tentar até 15 modelos diferentes (temos 24 modelos de fallback agora)
    const maxModelAttempts = 15;
    let lastMistralError: Error | null = null;
    
    for (let modelAttempt = 1; modelAttempt <= maxModelAttempts; modelAttempt++) {
      // Obter próximo modelo (admin primeiro, depois fallbacks)
      const currentModel = getNextAvailableMistralModel(adminModel, triedModels);
      
      if (!currentModel) {
        console.log(`⚠️ [LLM] Nenhum modelo Mistral disponível, tentando fallback para outros providers...`);
        break; // Sair do loop e tentar OpenRouter/Groq
      }
      
      triedModels.push(currentModel);
      const isAdminModel = currentModel === adminModel;
      
      console.log(`[LLM] 🚀 Mistral chatComplete - Modelo: ${currentModel} ${isAdminModel ? '(ADMIN)' : '(FALLBACK)'} [${modelAttempt}/${maxModelAttempts}]`);
      
      try {
        const mistral = await getMistralClient();
        
        // 🔄 Usar retry para erros temporários (2 retries por modelo)
        const mistralResponse = await withRetryLLM(async () => {
          return await mistral.chat.complete({
            model: currentModel,
            messages: params.messages as any,
            maxTokens: params.maxTokens ?? 500,
            temperature: params.temperature ?? 0.7,
            randomSeed: params.randomSeed,
          });
        }, `Mistral chatComplete (${currentModel})`, 2, 1500);
        
        console.log(`[LLM] ✅ Mistral chatComplete (${currentModel}) respondeu`);
        
        // ✅ SUCESSO! Limpar status da fila de falhas
        clearMistralQueueStatus();
        
        return {
          choices: mistralResponse.choices?.map((c: any) => ({
            message: { content: c.message?.content ?? null },
            finishReason: c.finishReason
          })) || []
        };
        
      } catch (mistralError: any) {
        lastMistralError = mistralError;
        
        // Verificar se é rate limit
        const isRateLimit = mistralError?.status === 429 || 
                            mistralError?.statusCode === 429 ||
                            mistralError?.message?.toLowerCase()?.includes('rate limit') ||
                            mistralError?.message?.toLowerCase()?.includes('too many requests');
        
        if (isRateLimit) {
          console.log(`⚠️ [LLM] Rate limit no modelo ${currentModel} - buscando fallback...`);
          markMistralModelRateLimited(currentModel);
          continue; // Tentar próximo modelo
        }
        
        // Se não for rate limit, logar e continuar para fallback de provider
        console.error(`❌ [LLM] Erro no Mistral (${currentModel}): ${mistralError?.message || mistralError}`);
        break; // Sair do loop e tentar OpenRouter/Groq
      }
    }
    
    // Se chegou aqui, todos os modelos Mistral falharam
    console.error('═══════════════════════════════════════════════════════════════');
    console.error(`🔄 [LLM FALLBACK] Mistral FALHOU após tentar ${triedModels.length} modelos: ${triedModels.join(', ')}`);
    
    // � NOVO: Registrar falha e verificar se pode fazer fallback externo
    registerMistralFailure();
    
    // 🕐 VERIFICAR SE PASSARAM 5 MINUTOS - Se não, AGUARDA e RETENTA Mistral
    if (!canFallbackToExternal()) {
      // Obter próximo modelo no round-robin com delay apropriado
      const { model: nextModel, delay } = getNextMistralModelRoundRobin();
      
      console.log(`⏳ [LLM QUEUE] Aguardando ${delay/1000}s antes de retentar ${nextModel}...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Retentar com o próximo modelo do round-robin
      try {
        const mistral = await getMistralClient();
        const retryResponse = await mistral.chat.complete({
          model: nextModel,
          messages: params.messages as any,
          maxTokens: params.maxTokens ?? 500,
          temperature: params.temperature ?? 0.7,
          randomSeed: params.randomSeed,
        });
        
        console.log(`[LLM] ✅ Mistral (${nextModel}) respondeu após aguardar delay!`);
        clearMistralQueueStatus(); // Sucesso! Limpar fila
        
        return {
          choices: retryResponse.choices?.map((c: any) => ({
            message: { content: c.message?.content ?? null },
            finishReason: c.finishReason
          })) || []
        };
      } catch (retryError: any) {
        console.log(`⚠️ [LLM QUEUE] ${nextModel} falhou novamente, continuando tentativas...`);
        markMistralModelRateLimited(nextModel);
        // Não fazer fallback ainda - deixar próxima chamada tentar novamente
        throw new Error(`Mistral em rate limit - aguardando fila (${getMistralQueueInfo().timeUntilFallback}s restantes para fallback)`);
      }
    }
    
    // ✅ PASSARAM 5 MINUTOS - Agora pode fazer fallback para OpenRouter/Groq
    console.log(`✅ [LLM QUEUE] 5 minutos atingidos - liberando fallback para OpenRouter/Groq`);
    clearMistralQueueStatus(); // Limpar status para próxima sessão
    
    // 🔄 Tentar fallback para OpenRouter
    if (hasOpenRouterKey) {
      console.error('🔄 [LLM FALLBACK] Tentando OpenRouter como fallback...');
      console.error('═══════════════════════════════════════════════════════════════');
      
      try {
        // ✅ EXECUTAR OpenRouter imediatamente como fallback
        // 🥇 google/gemma-3-4b-it:free - VALIDADO: 71.7% sucesso, 19 req/min
        const fallbackModel = config.openrouterModel || 'google/gemma-3-4b-it:free';
        console.log(`[LLM] 🆘 OpenRouter FALLBACK - Modelo: ${fallbackModel}`);
        
        const fallbackResponse = await withRetryLLM(async () => {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.openrouterApiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://agentezap.online',
              'X-Title': 'AgenteZap'
            },
            body: JSON.stringify({
              model: fallbackModel,
              messages: params.messages,
              max_tokens: params.maxTokens ?? 500,
              temperature: params.temperature ?? 0.7,
            }),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[LLM] OpenRouter FALLBACK error: ${response.status} - ${errorText}`);
            const error = new Error(`OpenRouter FALLBACK error: ${response.status}`) as any;
            error.status = response.status;
            throw error;
          }
          
          return await response.json();
        }, `OpenRouter FALLBACK (${fallbackModel})`, 3, 2000);
        
        console.log(`[LLM] ✅ OpenRouter FALLBACK respondeu com sucesso!`);
        return {
          choices: fallbackResponse.choices?.map((c: any) => ({
            message: { content: c.message?.content ?? null },
            finishReason: c.finish_reason
          })) || []
        };
      } catch (openrouterFallbackError: any) {
        console.error(`❌ [LLM] OpenRouter FALLBACK também falhou: ${openrouterFallbackError?.message}`);
        // Continua para tentar Groq
      }
    }
    
    // 🔄 Tentar fallback para Groq se disponível e OpenRouter falhou
    if (hasGroqKey) {
      console.error('🔄 [LLM FALLBACK] Tentando Groq como fallback...');
      console.error('═══════════════════════════════════════════════════════════════');
      
      try {
        const fallbackModel = config.groqModel || 'llama3-70b-8192';
        console.log(`[LLM] 🆘 Groq FALLBACK - Modelo: ${fallbackModel}`);
        
        const groqFallbackResponse = await withRetryLLM(async () => {
          const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.groqApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: fallbackModel,
              messages: params.messages,
              max_tokens: params.maxTokens ?? 500,
              temperature: params.temperature ?? 0.7,
            }),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[LLM] Groq FALLBACK error: ${response.status} - ${errorText}`);
            const error = new Error(`Groq FALLBACK error: ${response.status}`) as any;
            error.status = response.status;
            throw error;
          }
          
          return await response.json();
        }, `Groq FALLBACK (${fallbackModel})`, 3, 2000);
        
        console.log(`[LLM] ✅ Groq FALLBACK respondeu com sucesso!`);
        return {
          choices: groqFallbackResponse.choices?.map((c: any) => ({
            message: { content: c.message?.content ?? null },
            finishReason: c.finish_reason
          })) || []
        };
      } catch (groqFallbackError: any) {
        console.error(`❌ [LLM] Groq FALLBACK também falhou: ${groqFallbackError?.message}`);
      }
    }
    
    // ❌ Todos os fallbacks falharam
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('❌ [LLM] TODOS OS PROVIDERS FALHARAM!');
    console.error('   └─ Mistral: Todos os modelos em rate limit');
    console.error('   └─ OpenRouter: ' + (hasOpenRouterKey ? 'Falhou' : 'Não configurado'));
    console.error('   └─ Groq: ' + (hasGroqKey ? 'Falhou' : 'Não configurado'));
    console.error('═══════════════════════════════════════════════════════════════');
    throw lastMistralError || new Error('Todos os provedores de LLM falharam');
  }
  
  // Se provider é OpenRouter e tem API key válida (usado quando provider=openrouter)
  if (config.provider === 'openrouter' && config.openrouterApiKey && config.openrouterApiKey.length > 20) {
    try {
      // SEMPRE usar o modelo do OpenRouter configurado no admin
      // Ignorar o params.model pois pode ser um modelo do Mistral (ex: mistral-small-latest)
      const model = config.openrouterModel;
      
      // 🎯 PROVIDER: usar 'auto' para OpenRouter decidir o melhor
      // google/gemma-3-4b-it:free validado por stress test com 71.7% sucesso
      const modelToProviderMap: Record<string, string> = {
        'google/gemma-3-4b-it:free': 'auto',  // Validado: 71.7% sucesso
        'google/gemma-3-4b-it': 'auto',
        'google/gemma-3n-e4b-it': 'together',
        'google/gemma-3n-e2b-it': 'together',
        'google/gemma-3n-e4b-it:free': 'together',
        'google/gemma-3n-e2b-it:free': 'together',
      };
      
      // Usar provider específico do modelo, ou 'auto' para deixar OpenRouter decidir
      const autoProvider = modelToProviderMap[model] || 'auto';
      const configuredProvider = config.openrouterProvider || 'auto';
      
      // Se o modelo precisa de provider específico, usar esse; senão, usar o configurado
      const providerSlug = autoProvider !== 'auto' ? autoProvider : configuredProvider;
      
      console.log(`[LLM] 🚀 chatComplete via OpenRouter com modelo: ${model}, provider: ${providerSlug} (auto-detected: ${autoProvider}, configured: ${configuredProvider})`);
      
      // 🔄 Usar retry automático para lidar com erros temporários
      const data = await withRetryLLM(async () => {
        // 🎯 Construir body da requisição
        // Se provider é 'auto', NÃO incluir campo provider (OpenRouter decide)
        // Se provider é específico, incluir com allow_fallbacks: true
        const requestBody: any = {
          model,
          messages: params.messages,
          max_tokens: params.maxTokens ?? 500,
          temperature: params.temperature ?? 0.7,
        };
        
        // Só adicionar provider se NÃO for 'auto'
        if (providerSlug !== 'auto') {
          requestBody.provider = {
            order: [providerSlug],
            allow_fallbacks: true  // ✅ Permitir fallback se provider não tiver o modelo
          };
        }
        
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.openrouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://agentezap.online',
            'X-Title': 'AgenteZap'
          },
          body: JSON.stringify(requestBody),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[LLM] OpenRouter API error: ${response.status} - ${errorText}`);
          // Criar erro com status para que withRetryLLM possa identificar
          const error = new Error(`OpenRouter API error: ${response.status}`) as any;
          error.status = response.status;
          error.statusCode = response.status;
          throw error;
        }
        
        return await response.json();
      }, `OpenRouter chatComplete (${model} via ${providerSlug})`);
      
      // 🔍 DEBUG: Log detalhado da resposta do OpenRouter
      const responseContent = data.choices?.[0]?.message?.content;
      const finishReason = data.choices?.[0]?.finish_reason;
      const promptTokens = data.usage?.prompt_tokens;
      const completionTokens = data.usage?.completion_tokens;
      
      console.log(`[LLM] ✅ OpenRouter chatComplete respondeu (provider: ${providerSlug})`);
      console.log(`[LLM] 📊 Tokens: prompt=${promptTokens || 'N/A'}, completion=${completionTokens || 'N/A'}`);
      console.log(`[LLM] 📊 finish_reason: ${finishReason || 'N/A'}`);
      console.log(`[LLM] 📊 Response length: ${responseContent?.length || 0} chars`);
      
      if (!responseContent || responseContent.length === 0) {
        console.warn(`[LLM] ⚠️ RESPOSTA VAZIA do OpenRouter! finish_reason=${finishReason}`);
        console.warn(`[LLM] ⚠️ Full response: ${JSON.stringify(data).substring(0, 500)}`);
      } else {
        console.log(`[LLM] 📝 Response preview: "${responseContent.substring(0, 100)}..."`);
      }
      
      return {
        choices: data.choices?.map((c: any) => ({
          message: { content: c.message?.content ?? null },
          finishReason: c.finish_reason
        })) || []
      };
    } catch (openrouterError: any) {
      console.error('═══════════════════════════════════════════════════════════════');
      console.error('🔄 [LLM FALLBACK] OpenRouter FALHOU após 3 tentativas!');
      console.error(`   └─ Erro: ${openrouterError?.message || openrouterError}`);
      console.error('🔄 [LLM FALLBACK] Iniciando fallback para Groq...');
      console.error('═══════════════════════════════════════════════════════════════');
      // Continua para tentar Groq
    }
  }
  
  // Se provider é Groq e tem API key válida
  if ((config.provider === 'groq' || config.provider === 'openrouter') && config.groqApiKey && config.groqApiKey.length > 20) {
    try {
      // Se provider é OpenRouter mas caiu no fallback, usar modelo do Groq
      // Se provider é Groq, usar o modelo do Groq configurado
      const model = config.groqModel;
      console.log(`[LLM] 🚀 chatComplete via Groq com modelo: ${model}`);
      
      // 🔄 Usar retry automático para Groq também
      const data = await withRetryLLM(async () => {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: params.messages,
            max_tokens: params.maxTokens ?? 500,
            temperature: params.temperature ?? 0.7,
            seed: params.randomSeed,
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[LLM] Groq API error: ${response.status} - ${errorText}`);
          const error = new Error(`Groq API error: ${response.status}`) as any;
          error.status = response.status;
          error.statusCode = response.status;
          throw error;
        }
        
        return await response.json();
      }, `Groq chatComplete (${model})`);
      
      console.log(`[LLM] ✅ Groq chatComplete respondeu`);
      
      return {
        choices: data.choices?.map((c: any) => ({
          message: { content: c.message?.content ?? null },
          finishReason: c.finish_reason
        })) || []
      };
    } catch (groqError: any) {
      console.error('═══════════════════════════════════════════════════════════════');
      console.error('🔄 [LLM FALLBACK] Groq FALHOU após 3 tentativas!');
      console.error(`   └─ Erro: ${groqError?.message || groqError}`);
      console.error('🔄 [LLM FALLBACK] Iniciando fallback FINAL para Mistral...');
      console.error('═══════════════════════════════════════════════════════════════');
    }
  }
  
  // Fallback para Mistral (ÚLTIMO RECURSO - após OpenRouter e Groq falharem)
  console.log('🆘 [LLM FALLBACK FINAL] Usando Mistral como último recurso!');
  const mistralModel = config.mistralModel || 'mistral-small-latest';
  console.log(`[LLM] 🚀 chatComplete via Mistral (fallback) com modelo: ${mistralModel}`);
  const mistral = await getMistralClient();
  
  // 🔄 Usar retry automático mesmo no fallback (delay maior: 2s)
  const mistralResponse = await withRetryLLM(async () => {
    return await mistral.chat.complete({
      model: mistralModel, // Usar modelo configurado no admin
      messages: params.messages as any,
      maxTokens: params.maxTokens ?? 500,
      temperature: params.temperature ?? 0.7,
      randomSeed: params.randomSeed,
    });
  }, `Mistral fallback (${mistralModel})`, 3, 2000);
  
  console.log(`[LLM] ✅ Mistral chatComplete respondeu`);
  
  return {
    choices: mistralResponse.choices?.map((c: any) => ({
      message: { content: c.message?.content ?? null },
      finishReason: c.finishReason
    })) || []
  };
}

/**
 * Objeto wrapper que simula interface do getMistralClient()
 * Permite usar: const client = await getLLMClient(); client.chat.complete(...)
 */
export async function getLLMClient() {
  return {
    chat: {
      complete: chatComplete
    }
  };
}

/**
 * Gera texto usando o LLM configurado (Groq ou Mistral)
 * Substitui generateWithMistral para usar o provider configurado no admin
 */
export async function generateWithLLM(
  systemPrompt: string,
  userMessage: string,
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<string> {
  try {
    const response = await chatComplete({
      model: options?.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      maxTokens: options?.maxTokens || 500,
      temperature: options?.temperature ?? 0.7,
    });
    
    if (!response || !response.choices || response.choices.length === 0) {
      throw new Error("No response from LLM");
    }
    
    return (response.choices[0].message.content as string) || "";
  } catch (error: any) {
    console.error("[LLM] Error generating text:", error);
    throw new Error(`Failed to generate text: ${error.message}`);
  }
}

// ==================== MEDIA CLASSIFICATION ====================

/**
 * Tipos para classificação de mídia
 */
export interface MediaClassificationInput {
  clientMessage: string;
  conversationHistory: Array<{ text: string; fromMe: boolean }>;
  mediaLibrary: Array<{ 
    name: string; 
    type: string; 
    whenToUse?: string;
    isActive?: boolean;
  }>;
  sentMedias?: string[];
}

export interface MediaClassificationResult {
  shouldSend: boolean;
  mediaName: string | null;
  confidence: number;
  reason: string;
}

/**
 * Classifica qual mídia deve ser enviada baseado na conversa
 * Usa o LLM configurado (Groq ou Mistral)
 */
export async function classifyMediaWithLLM(
  input: MediaClassificationInput
): Promise<MediaClassificationResult> {
  const startTime = Date.now();
  
  try {
    console.log(`\n🤖 [MEDIA AI] ════════════════════════════════════════════════`);
    console.log(`🤖 [MEDIA AI] Iniciando classificação de mídia com LLM...`);
    
    const { clientMessage, conversationHistory, mediaLibrary, sentMedias = [] } = input;
    
    // Filtrar mídias já enviadas e inativas
    const availableMedia = mediaLibrary.filter(m => {
      const alreadySent = sentMedias.some(sent => sent.toUpperCase() === m.name.toUpperCase());
      return !alreadySent && m.isActive !== false;
    });
    
    if (availableMedia.length === 0) {
      console.log(`🤖 [MEDIA AI] ❌ Nenhuma mídia disponível`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: 'Nenhuma mídia disponível' };
    }
    
    // Detectar se é primeira mensagem
    const clientMsgCount = conversationHistory.filter(m => !m.fromMe).length;
    const isFirstMessage = clientMsgCount <= 1;
    
    // Formatar histórico recente (últimas 5 mensagens)
    const recentHistory = conversationHistory
      .slice(-10)
      .map(m => `${m.fromMe ? 'Agente' : 'Cliente'}: ${m.text || '(sem texto)'}`)
      .join('\n');
    
    // Formatar biblioteca de mídia
    const mediaListForAI = availableMedia
      .map((m, i) => `${i + 1}. NOME: "${m.name}" | TIPO: ${m.type} | QUANDO USAR: ${m.whenToUse || 'não especificado'}`)
      .join('\n');
    
    // Prompt de classificação
    const systemPrompt = `Você é um sistema de classificação de mídia para um chatbot de WhatsApp.
Sua tarefa é analisar a conversa e decidir SE e QUAL mídia deve ser enviada ao cliente.

## REGRAS IMPORTANTES:
1. Se for PRIMEIRA MENSAGEM do cliente (saudação como "oi", "olá", "bom dia"), procure por mídia de boas-vindas/início
2. Apenas recomende mídia se for CLARAMENTE RELEVANTE para o contexto
3. NÃO recomende mídia se o cliente estiver fazendo perguntas específicas que não precisam de mídia
4. Leia o campo "QUANDO USAR" de cada mídia para entender quando é apropriado enviar
5. Se nenhuma mídia for claramente apropriada, responda com NO_MEDIA
6. Confiança deve ser entre 0-100 (apenas envie se > 60)

## RESPONDA APENAS EM JSON:
{"decision": "SEND" ou "NO_MEDIA", "mediaName": "NOME_EXATO_DA_MIDIA" ou null, "confidence": 0-100, "reason": "explicação breve"}`;

    const userPrompt = `## CONTEXTO:
É a primeira mensagem do cliente? ${isFirstMessage ? 'SIM' : 'NÃO'}
Mensagem atual do cliente: "${clientMessage}"

## HISTÓRICO RECENTE:
${recentHistory || '(primeira interação)'}

## MÍDIAS DISPONÍVEIS:
${mediaListForAI}

## MÍDIAS JÁ ENVIADAS (não repetir):
${sentMedias.join(', ') || 'nenhuma'}

Analise e decida se alguma mídia deve ser enviada. Responda APENAS o JSON.`;

    const response = await chatComplete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      maxTokens: 150,
      temperature: 0.1, // Baixa para decisões mais consistentes
    });
    
    const elapsedMs = Date.now() - startTime;
    
    if (!response || !response.choices || response.choices.length === 0) {
      console.log(`🤖 [MEDIA AI] ❌ Sem resposta da API (${elapsedMs}ms)`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: 'Sem resposta da API' };
    }
    
    const rawResponse = response.choices[0].message.content as string;
    console.log(`🤖 [MEDIA AI] 📥 Resposta bruta (${elapsedMs}ms): ${rawResponse}`);
    
    // 🔧 FIX: Extração robusta de JSON com fallback para JSON incompleto
    let jsonToParse: string | null = null;
    
    // Tentar extrair JSON completo primeiro
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonToParse = jsonMatch[0];
    } else {
      // Tentar consertar JSON incompleto (sem } final)
      const incompleteMatch = rawResponse.match(/\{[\s\S]*/);
      if (incompleteMatch) {
        let attempt = incompleteMatch[0].trim();
        // Remover markdown se existir
        attempt = attempt.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '');
        // Contar { e } para adicionar os faltantes
        const openBraces = (attempt.match(/\{/g) || []).length;
        const closeBraces = (attempt.match(/\}/g) || []).length;
        const missingBraces = openBraces - closeBraces;
        if (missingBraces > 0) {
          attempt += '}'.repeat(missingBraces);
          console.log(`🤖 [MEDIA AI] 🔧 JSON consertado (adicionado ${missingBraces} chave(s) faltante(s))`);
        }
        jsonToParse = attempt;
      }
    }
    
    if (!jsonToParse) {
      console.log(`🤖 [MEDIA AI] ⚠️ Não conseguiu extrair JSON`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: 'Resposta não é JSON válido' };
    }
    
    try {
      // Limpar markdown code blocks se presentes
      jsonToParse = jsonToParse.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
      const parsed = JSON.parse(jsonToParse);
      
      // 🔧 FIX: Reduzir threshold de confiança de 60% para 40% para não perder mídias
      // A IA é muito conservadora e precisa de threshold mais baixo
      const confidenceThreshold = 40;
      
      const result: MediaClassificationResult = {
        shouldSend: parsed.decision === 'SEND' && parsed.confidence >= confidenceThreshold,
        mediaName: parsed.mediaName || null,
        confidence: parsed.confidence || 0,
        reason: parsed.reason || 'Sem razão especificada'
      };
      
      console.log(`🤖 [MEDIA AI] ════════════════════════════════════════════════`);
      if (result.shouldSend) {
        console.log(`🤖 [MEDIA AI] ✅ DECISÃO: ENVIAR "${result.mediaName}"`);
      } else {
        console.log(`🤖 [MEDIA AI] ❌ DECISÃO: NÃO ENVIAR (threshold=${confidenceThreshold}%)`);
        // 🔧 FIX: Log extra para debug quando confidence está entre 40-60%
        if (parsed.confidence >= 30 && parsed.confidence < confidenceThreshold) {
          console.log(`🤖 [MEDIA AI] ⚠️ ATENÇÃO: Confiança ${parsed.confidence}% próxima do threshold`);
        }
      }
      console.log(`🤖 [MEDIA AI] 📊 Confiança: ${result.confidence}%`);
      console.log(`🤖 [MEDIA AI] 💡 Razão: ${result.reason}`);
      console.log(`🤖 [MEDIA AI] ⏱️ Tempo: ${elapsedMs}ms`);
      console.log(`🤖 [MEDIA AI] ════════════════════════════════════════════════\n`);
      
      return result;
    } catch (parseError) {
      console.log(`🤖 [MEDIA AI] ⚠️ Erro ao parsear JSON: ${parseError}`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: 'Erro ao parsear resposta' };
    }
    
  } catch (error: any) {
    console.error(`🤖 [MEDIA AI] ❌ ERRO: ${error.message}`);
    // Em caso de erro, retorna "não enviar" para não quebrar o fluxo
    return { shouldSend: false, mediaName: null, confidence: 0, reason: `Erro: ${error.message}` };
  }
}
