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
  timestamp: number;
}
let llmConfigCache: LLMConfigCache | null = null;
const LLM_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

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
      
      // Verificar se é um erro que vale a pena tentar novamente
      const isRetryable = 
        statusCode === 429 || // Rate limit
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
        error?.message?.toLowerCase()?.includes('rate limit') ||
        error?.message?.toLowerCase()?.includes('timeout') ||
        error?.message?.toLowerCase()?.includes('connection') ||
        error?.message?.toLowerCase()?.includes('overloaded') ||
        error?.message?.toLowerCase()?.includes('temporarily unavailable') ||
        error?.message?.toLowerCase()?.includes('too many requests');
      
      if (!isRetryable || attempt === maxRetries) {
        console.error(`❌ [LLM RETRY] ${operationName} - ESGOTOU ${maxRetries} tentativas!`);
        console.error(`   └─ Erro final: ${error?.message || error}`);
        console.error(`   └─ Status: ${statusCode || 'N/A'}`);
        console.error(`   └─ Retryable: ${isRetryable ? 'SIM' : 'NÃO'}`);
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s... com jitter aleatório
      const jitter = Math.random() * 500; // 0-500ms de jitter
      const delay = (initialDelayMs * Math.pow(2, attempt - 1)) + jitter;
      
      console.log(`⚠️ [LLM RETRY] ${operationName} - FALHOU tentativa ${attempt}/${maxRetries}`);
      console.log(`   └─ Erro: ${error?.message || 'Unknown'}`);
      console.log(`   └─ Status: ${statusCode || 'N/A'}`);
      console.log(`   └─ Próxima tentativa em: ${Math.round(delay)}ms`);
      
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
 */
async function getLLMConfig(): Promise<{ 
  provider: string; 
  groqApiKey: string; 
  groqModel: string;
  openrouterApiKey: string;
  openrouterModel: string;
}> {
  // Verificar cache
  if (llmConfigCache && (Date.now() - llmConfigCache.timestamp < LLM_CONFIG_CACHE_TTL_MS)) {
    return {
      provider: llmConfigCache.provider,
      groqApiKey: llmConfigCache.groqApiKey,
      groqModel: llmConfigCache.groqModel,
      openrouterApiKey: llmConfigCache.openrouterApiKey,
      openrouterModel: llmConfigCache.openrouterModel
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
    
    const provider = configs[0]?.valor || 'mistral';
    const groqApiKey = groqKeyResult[0]?.valor || '';
    const groqModel = groqModelResult[0]?.valor || 'openai/gpt-oss-20b';
    const openrouterApiKey = openrouterKeyResult[0]?.valor || '';
    const openrouterModel = openrouterModelResult[0]?.valor || 'openai/gpt-oss-20b';
    
    // Salvar no cache
    llmConfigCache = { provider, groqApiKey, groqModel, openrouterApiKey, openrouterModel, timestamp: Date.now() };
    
    console.log(`[LLM] Config loaded: provider=${provider}, model=${provider === 'openrouter' ? openrouterModel : (provider === 'groq' ? groqModel : 'mistral-small-latest')}`);
    return { provider, groqApiKey, groqModel, openrouterApiKey, openrouterModel };
  } catch (error) {
    console.error('[LLM] Erro ao carregar configuração:', error);
    return { provider: 'mistral', groqApiKey: '', groqModel: 'openai/gpt-oss-20b', openrouterApiKey: '', openrouterModel: 'openai/gpt-oss-20b' };
  }
}

/**
 * Chama o OpenRouter API COM RETRY AUTOMÁTICO
 * Implementa exponential backoff para lidar com rate limits e erros temporários
 */
async function callOpenRouterAPI(
  messages: ChatMessage[],
  apiKey: string,
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  const model = options?.model || 'meta-llama/llama-3.3-70b-instruct:free';
  
  console.log(`[LLM] 🚀 Chamando OpenRouter API com modelo: ${model}`);
  
  // 🔄 Usar retry automático para lidar com erros temporários
  return await withRetryLLM(async () => {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://agentezap.online',
        'X-Title': 'AgenteZap'
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
      console.error(`[LLM] OpenRouter API error: ${response.status} - ${errorText}`);
      // Criar erro com status para que withRetryLLM possa identificar
      const error = new Error(`OpenRouter API error: ${response.status}`) as any;
      error.status = response.status;
      error.statusCode = response.status;
      throw error;
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    console.log(`[LLM] ✅ OpenRouter respondeu com ${content?.length || 0} caracteres`);
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
 * Chama o Mistral API
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
  
  console.log(`[LLM] 🚀 Chamando Mistral API com modelo: ${options?.model || 'mistral-small-latest'}`);
  
  const response = await mistral.chat.complete({
    model: options?.model || 'mistral-small-latest',
    messages: messages,
    temperature: options?.temperature ?? 0.7,
    maxTokens: options?.maxTokens ?? 500,
  });
  
  const content = response.choices?.[0]?.message?.content;
  console.log(`[LLM] ✅ Mistral respondeu com ${typeof content === 'string' ? content.length : 0} caracteres`);
  return typeof content === 'string' ? content : '';
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
          model: options?.model || config.openrouterModel
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
  
  // Se provider é OpenRouter e tem API key válida
  if (config.provider === 'openrouter' && config.openrouterApiKey && config.openrouterApiKey.length > 20) {
    try {
      // SEMPRE usar o modelo do OpenRouter configurado no admin
      // Ignorar o params.model pois pode ser um modelo do Mistral (ex: mistral-small-latest)
      const model = config.openrouterModel;
      console.log(`[LLM] 🚀 chatComplete via OpenRouter com modelo correto: ${model} (provider=${config.provider})`);
      
      // 🔄 Usar retry automático para lidar com erros temporários
      const data = await withRetryLLM(async () => {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.openrouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://agentezap.online',
            'X-Title': 'AgenteZap'
          },
          body: JSON.stringify({
            model,
            messages: params.messages,
            max_tokens: params.maxTokens ?? 500,
            temperature: params.temperature ?? 0.7,
            provider: {
              order: ['hyperbolic'],  // Priorizar Hyperbolic (mais barato: $0.04/M input e output)
              allow_fallbacks: true   // Permite outros providers se Hyperbolic falhar
            }
          }),
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
      }, `OpenRouter chatComplete (${model})`);
      
      console.log(`[LLM] ✅ OpenRouter chatComplete respondeu`);
      
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
  console.log(`[LLM] 🚀 chatComplete via Mistral (fallback) com modelo: mistral-small-latest`);
  const mistral = await getMistralClient();
  
  const mistralResponse = await mistral.chat.complete({
    model: 'mistral-small-latest', // Mistral só aceita modelos Mistral
    messages: params.messages as any,
    maxTokens: params.maxTokens ?? 500,
    temperature: params.temperature ?? 0.7,
    randomSeed: params.randomSeed,
  });
  
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
    
    // Tentar extrair JSON
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(`🤖 [MEDIA AI] ⚠️ Não conseguiu extrair JSON`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: 'Resposta não é JSON válido' };
    }
    
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      
      const result: MediaClassificationResult = {
        shouldSend: parsed.decision === 'SEND' && parsed.confidence >= 60,
        mediaName: parsed.mediaName || null,
        confidence: parsed.confidence || 0,
        reason: parsed.reason || 'Sem razão especificada'
      };
      
      console.log(`🤖 [MEDIA AI] ════════════════════════════════════════════════`);
      if (result.shouldSend) {
        console.log(`🤖 [MEDIA AI] ✅ DECISÃO: ENVIAR "${result.mediaName}"`);
      } else {
        console.log(`🤖 [MEDIA AI] ❌ DECISÃO: NÃO ENVIAR`);
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
