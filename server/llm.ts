/**
 * LLM Service - Stub para compatibilidade
 * 
 * Este módulo fornece funções para chamadas de LLM (Large Language Models)
 * Usando Mistral como backend (já disponível no projeto)
 */

import { getMistralClient } from './mistralClient';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function callGroq(
  messages: ChatMessage[] | string,
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  try {
    const mistral = await getMistralClient();
    
    if (!mistral) {
      console.error('[LLM] Mistral client não disponível');
      // ❌ NÃO retornar mensagem genérica - retornar string vazia para caller decidir
      return '';
    }
    
    // ✅ Suportar tanto array de ChatMessage quanto string simples
    const formattedMessages: ChatMessage[] = typeof messages === 'string' 
      ? [{ role: 'user' as const, content: messages }]
      : messages;
    
    const response = await mistral.chat.complete({
      model: options?.model || 'mistral-small-latest',
      messages: formattedMessages,
      temperature: options?.temperature ?? 0.7,
      maxTokens: options?.maxTokens ?? 500,
    });
    
    const content = response.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : '';
  } catch (error) {
    console.error('[LLM] Erro ao chamar Mistral:', error);
    // ❌ REMOVIDO FALLBACK GENÉRICO - retornar vazio para caller tratar
    return '';
  }
}
