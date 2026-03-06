/**
 * Admin Agent Tool Calling — Motor de decisão autônomo via LLM Tool Calling
 *
 * Substitui o sistema de stages/regex por chamadas nativas de ferramentas (Mistral).
 * O LLM decide autonomamente qual ferramenta usar com base no contexto da conversa.
 *
 * Feature flag: ADMIN_TOOL_CALLING=true
 *
 * Ferramentas disponíveis:
 *   1. informar_planos   — Retorna tabela de planos e preços
 *   2. gerar_link_conexao — Gera link auto-login para conectar WhatsApp (QR Code)
 *   3. gerar_link_planos  — Gera link auto-login para página de planos/assinatura
 *   4. editar_prompt      — Edita o prompt do agente IA do cliente
 *   5. salvar_midia       — Salva mídia na biblioteca do agente
 *   6. criar_agente       — Cria conta de teste + agente IA completo
 *   7. registrar_pagamento — Registra comprovante de pagamento PIX
 */

import { getMistralClient } from './mistralClient';
import { chatComplete, type ChatMessage } from './llm';
import { executeAction, type PendingAction } from './actionExecutorV2';
import { storage } from './storage';
import { listarVersoes } from './promptHistoryService';
import { db } from './db';
import { agentMediaLibrary } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

// ─────────────────────────────────────────────────────────────────────────────
// Tool Definitions (Mistral Function Calling format)
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'informar_planos',
      description:
        'Retorna a tabela de planos disponíveis do AgenteZap com preços e recursos. Use quando o cliente perguntar sobre preços, planos, quanto custa, assinatura, etc.',
      parameters: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'gerar_link_conexao',
      description:
        'Gera um link de auto-login direto para a página de conexão do WhatsApp (QR Code). Use quando o cliente quiser conectar o WhatsApp, escanear QR Code, parear número, etc.',
      parameters: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'gerar_link_planos',
      description:
        'Gera um link de auto-login direto para a página de planos/assinatura. Use quando o cliente quiser assinar, ativar um plano, pagar, ou pedir o link de assinatura. O cliente clica e já entra logado na página de planos.',
      parameters: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'editar_prompt',
      description:
        'Edita/calibra o prompt do agente IA do cliente com base numa instrução de mudança. Use quando o cliente pedir para mudar comportamento, tom, adicionar instruções, etc.',
      parameters: {
        type: 'object' as const,
        properties: {
          descricaoMudanca: {
            type: 'string' as const,
            description: 'Descrição detalhada da mudança desejada no prompt do agente.',
          },
        },
        required: ['descricaoMudanca'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'salvar_midia',
      description:
        'Salva uma mídia (imagem, vídeo, áudio, documento) na biblioteca do agente para uso automático. Use quando o cliente enviar uma mídia e explicar quando usá-la.',
      parameters: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string' as const,
            description: 'Nome descritivo da mídia (ex: "Cardápio", "Foto da loja").',
          },
          mediaUrl: {
            type: 'string' as const,
            description: 'URL da mídia enviada pelo cliente.',
          },
          mediaType: {
            type: 'string' as const,
            description: 'Tipo da mídia: image, video, audio ou document.',
          },
          whenToUse: {
            type: 'string' as const,
            description: 'Contexto de quando o agente deve usar essa mídia (ex: "quando pedirem cardápio").',
          },
          description: {
            type: 'string' as const,
            description: 'Descrição breve da mídia.',
          },
        },
        required: ['name', 'whenToUse'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'criar_agente',
      description:
        'Cria uma conta de teste gratuita com um agente IA personalizado para o negócio do cliente. Use quando já tiver informações suficientes sobre o negócio (nome da empresa, tipo de atendimento) e o cliente quiser testar ou criar o agente. Também use quando o cliente disser que quer experimentar, testar, criar seu agente, etc.',
      parameters: {
        type: 'object' as const,
        properties: {
          nomeEmpresa: {
            type: 'string' as const,
            description: 'Nome da empresa/negócio do cliente.',
          },
          ramoAtuacao: {
            type: 'string' as const,
            description: 'Ramo de atuação (ex: pizzaria, barbearia, loja de roupas, clínica).',
          },
          descricaoAtendimento: {
            type: 'string' as const,
            description: 'Como o agente deve se comportar, o que deve responder, tom de voz, etc.',
          },
        },
        required: ['nomeEmpresa'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'registrar_pagamento',
      description:
        'Registra um comprovante de pagamento PIX enviado pelo cliente. Use quando o cliente enviar um comprovante, dizer que pagou, ou perguntar sobre confirmação de pagamento.',
      parameters: {
        type: 'object' as const,
        properties: {
          comprovanteUrl: {
            type: 'string' as const,
            description: 'URL da imagem do comprovante de pagamento.',
          },
          valorInformado: {
            type: 'string' as const,
            description: 'Valor informado pelo cliente (se mencionado).',
          },
          planoEscolhido: {
            type: 'string' as const,
            description: 'Plano escolhido pelo cliente (starter, pro, business).',
          },
        },
        required: [],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// System Prompt
// ─────────────────────────────────────────────────────────────────────────────

function buildToolCallingSystemPrompt(
  phoneNumber: string,
  userId: string | undefined,
  contextInfo: {
    accountStatus?: string;
    promptSummary?: string;
    mediaLibrarySummary?: string;
    agentConfig?: { name?: string; company?: string; role?: string };
  },
): string {
  const isExistingClient = Boolean(userId);

  const accountCtx = contextInfo.accountStatus
    ? `\nStatus da conta: ${contextInfo.accountStatus}`
    : '\nCliente ainda não tem conta (novo lead).';

  const promptCtx = contextInfo.promptSummary
    ? `\nPrompt do agente: ${contextInfo.promptSummary}`
    : '';

  const mediaLibCtx = contextInfo.mediaLibrarySummary
    ? `\nBiblioteca de mídia: ${contextInfo.mediaLibrarySummary}`
    : '';

  const companyCtx = contextInfo.agentConfig?.company
    ? `\nEmpresa do cliente: ${contextInfo.agentConfig.company}`
    : '';

  const clientTypeInstructions = isExistingClient
    ? `
CLIENTE EXISTENTE (já tem conta):
- Este cliente JÁ tem conta e agente criado. NUNCA ofereça ou use criar_agente.
- Foco: ajudar com configuração, edição de prompt, cadastro de mídias, planos e conexão do WhatsApp.
- Se ele pedir mudanças no agente, use editar_prompt diretamente.
- Se quiser assinar um plano, use gerar_link_planos para enviar o link com auto-login.
- Se quiser conectar o WhatsApp, use gerar_link_conexao.
- Após editar o prompt, sempre informe o link do simulador para testar as mudanças.`
    : `
CLIENTE NOVO (sem conta):
- Este é um lead novo. Apresente-se brevemente como Rodrigo do AgenteZap.
- Descubra o negócio dele (nome da empresa, ramo, como quer que o agente atenda).
- Quando tiver informação suficiente (pelo menos nome da empresa), use criar_agente para criar a conta de teste gratuita.
- Não peça informações demais — o mínimo é o nome da empresa. Ramo e descrição são opcionais.`;

  return `Você é o Rodrigo, consultor comercial do AgenteZap — uma plataforma que permite criar agentes de IA para atendimento via WhatsApp.

Seu papel:
- Receber leads interessados em automação de atendimento
- Entender o negócio do cliente (nome, ramo, como quer que o agente atenda)
- Quando tiver informações suficientes, usar a ferramenta criar_agente para gerar uma conta de teste gratuita
- Ajudar clientes ativos a configurar e calibrar seu agente
- Responder dúvidas sobre planos e preços
- Enviar links com auto-login para assinar plano (gerar_link_planos) e conectar WhatsApp (gerar_link_conexao)

Informações do contexto:
Telefone: ${phoneNumber}
${userId ? `UserId: ${userId}` : 'Sem conta criada'}${accountCtx}${promptCtx}${mediaLibCtx}${companyCtx}
${clientTypeInstructions}

REGRAS IMPORTANTES:
1. Seja natural, empático e conversacional — como um atendente humano real
2. NUNCA mencione JSON, ferramentas, tool_calls, parâmetros ou termos técnicos internos
3. Use as ferramentas disponíveis quando a situação exigir — não peça "confirmação" antes de usar, execute direto
4. Para CRIAR AGENTE: colete pelo menos o nome da empresa antes. Se o cliente já disse o tipo de negócio, crie direto
5. Para EDITAR PROMPT: execute direto quando o cliente pedir uma mudança específica
6. Para clientes NOVOS: apresente-se brevemente, pergunte sobre o negócio, e quando tiver informação suficiente, crie o agente
7. Para clientes que já TÊM CONTA: ajude com configurações, edições de prompt, mídia, planos
8. Emojis são bem-vindos em contextos leves e amigáveis
9. Se a intenção não estiver clara, faça UMA pergunta aberta — nunca liste opções como menu
10. Adapte o tom: acolhedor com novos, prestativo com ativos, direto com quem tem pressa
11. NUNCA diga "aguarde", "espere", "um momento" ou "já busco" — os resultados das ferramentas chegam INSTANTANEAMENTE. Quando chamar uma ferramenta, INCLUA o resultado dela diretamente na sua resposta final. Ex: se chamou informar_planos, apresente os planos na mesma mensagem.
12. Após executar uma ferramenta, SEMPRE apresente o resultado completo ao cliente na mesma mensagem. Nunca diga que vai buscar algo sem mostrar o resultado.
13. Após informar os planos, OFEREÇA enviar o link direto para assinar usando gerar_link_planos (se o cliente tiver conta).
14. NUNCA diga que ativou, liberou ou assinou o plano do cliente. A ativação SEMPRE exige pagamento no site. Se o cliente pagar por PIX, use registrar_pagamento.
15. Após criar ou editar o agente, SEMPRE inclua o link do simulador para o cliente testar as mudanças.
16. PROIBIDO FABRICAR URLs: NUNCA invente, crie ou escreva URLs manualmente. Links de planos, conexão e simulador são gerados EXCLUSIVAMENTE pelas ferramentas gerar_link_planos, gerar_link_conexao e criar_agente. Se o cliente pedir um link, CHAME a ferramenta correspondente — NUNCA escreva uma URL por conta própria.
17. Se o cliente pedir link para PLANOS/ASSINATURA → chame gerar_link_planos. Se pedir link para CONEXÃO/WHATSAPP → chame gerar_link_conexao. Se pedir para CRIAR CONTA → chame criar_agente. SEMPRE use a ferramenta, NUNCA gere o link na mensagem.
18. URLs válidas SOMENTE vêm do resultado das ferramentas. Qualquer URL que você escrever diretamente será INVÁLIDA e causará erro para o cliente.

CADASTRO DE MÍDIAS:
19. Quando o cliente enviar uma mídia (imagem, áudio, documento, vídeo), PERGUNTE o nome que ele quer dar para essa mídia e em qual situação o agente deve enviá-la ao cliente dele. Exemplo: "Essa imagem é o quê? Em qual momento o agente deve enviar ela?"
20. Quando tiver o nome e o contexto de uso, use salvar_midia imediatamente. Preencha TODOS os campos: name (nome descritivo), whenToUse (quando o agente deve enviar esta mídia — esse campo é OBRIGATÓRIO), description (descrição do conteúdo), mediaType (image/audio/video/document).
21. A URL da mídia já é preenchida automaticamente pelo sistema — NÃO invente URLs de mídia. Se o campo mediaUrl não vier automaticamente, peça ao cliente para reenviar a mídia.
22. Para clientes que já têm conta, o userId é usado automaticamente. A mídia fica vinculada ao agente do cliente.
23. Se o cliente enviar uma mídia sem contexto, SEMPRE pergunte antes de salvar. Nunca salve mídia sem saber o nome e quando usar.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context gathering
// ─────────────────────────────────────────────────────────────────────────────

async function gatherClientContext(userId: string | undefined): Promise<{
  accountStatus?: string;
  promptSummary?: string;
  mediaLibrarySummary?: string;
}> {
  const ctx: {
    accountStatus?: string;
    promptSummary?: string;
    mediaLibrarySummary?: string;
  } = {};

  if (!userId) return ctx;

  try {
    const subscription = await storage.getUserSubscription(userId);
    if (subscription && subscription.plan) {
      ctx.accountStatus = `${(subscription.plan as any).name || (subscription.plan as any).planName || 'Ativo'} (ativo)`;
    } else {
      ctx.accountStatus = 'Conta criada (plano gratuito de teste)';
    }
  } catch (e) {
    console.warn('[ToolCalling] Erro ao buscar assinatura:', e);
  }

  try {
    const versions = await listarVersoes(userId);
    if (versions && versions.length > 0) {
      const current = versions.find((v: any) => v.is_current) || versions[0];
      const versionNumber = (current as any).version_number || versions.length;
      ctx.promptSummary = `${versions.length} versão${versions.length > 1 ? 's' : ''} (v${versionNumber} atual)`;
    } else {
      ctx.promptSummary = 'Nenhuma versão registrada';
    }
  } catch (e) {
    console.warn('[ToolCalling] Erro ao buscar versões de prompt:', e);
  }

  try {
    const mediaRecords = await db
      .select()
      .from(agentMediaLibrary)
      .where(eq(agentMediaLibrary.userId, userId))
      .orderBy(desc(agentMediaLibrary.id))
      .limit(5);

    if (mediaRecords && mediaRecords.length > 0) {
      const names = mediaRecords.map((m: any) => m.name).join(', ');
      ctx.mediaLibrarySummary = `${mediaRecords.length} mídia${mediaRecords.length > 1 ? 's' : ''} (${names})`;
    } else {
      ctx.mediaLibrarySummary = 'Nenhuma mídia salva';
    }
  } catch (e) {
    console.warn('[ToolCalling] Erro ao buscar biblioteca de mídia:', e);
  }

  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// URL fabrication detection — replaces hallucinated URLs with warning
// ─────────────────────────────────────────────────────────────────────────────

const APP_DOMAIN = (process.env.APP_URL || 'https://agentezap.online').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const APP_BASE_URL = process.env.APP_URL || 'https://agentezap.online';

interface SanitizeResult {
  text: string;
  hadFabricatedPlansUrl: boolean;
  hadFabricatedConexaoUrl: boolean;
}

function sanitizeFabricatedUrls(text: string): SanitizeResult {
  // Valid URLs are only those from our own domain (agentezap.online)
  // Any URL from other domains (agentezap.com, agentezap.com.br, etc.) is fabricated
  const urlPattern = /https?:\/\/[^\s\)>\]"']+/gi;
  let result = text;
  let hadFabricatedPlansUrl = false;
  let hadFabricatedConexaoUrl = false;
  const matches = text.match(urlPattern);
  if (!matches) return { text, hadFabricatedPlansUrl: false, hadFabricatedConexaoUrl: false };

  for (const url of matches) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      // Allow our real domain
      if (hostname === APP_DOMAIN || hostname === 'www.' + APP_DOMAIN) continue;

      // Allow Supabase storage URLs
      if (hostname.includes('supabase.co')) continue;

      // Allow common media URLs (imgur, etc)
      if (hostname.includes('imgur.com') || hostname.includes('i.imgur.com')) continue;

      // Detect fabricated URLs and classify them
      const isFabricated = hostname.includes('agentezap') || url.includes('simulador') || url.includes('assinatura') || url.includes('token=');
      if (isFabricated) {
        console.warn(`[ToolCalling] URL fabricada detectada e removida: ${url}`);

        // Classify: plans-related or conexao-related?
        const lowerUrl = url.toLowerCase();
        if (lowerUrl.includes('plan') || lowerUrl.includes('assin') || lowerUrl.includes('pricing') || lowerUrl.includes('checkout')) {
          hadFabricatedPlansUrl = true;
        }
        if (lowerUrl.includes('conex') || lowerUrl.includes('qr') || lowerUrl.includes('parear') || lowerUrl.includes('whatsapp')) {
          hadFabricatedConexaoUrl = true;
        }
        // If not classified, default to plans (most common)
        if (!hadFabricatedPlansUrl && !hadFabricatedConexaoUrl) {
          hadFabricatedPlansUrl = true;
        }

        result = result.replace(url, '{{LINK_PLACEHOLDER}}');
      }
    } catch {
      // Not a valid URL, skip
    }
  }

  return { text: result, hadFabricatedPlansUrl, hadFabricatedConexaoUrl };
}

/**
 * Sanitize response and auto-inject real links when LLM fabricates URLs.
 * If fabricated plan/conexao URLs are detected, calls the real tool and replaces placeholder.
 */
async function sanitizeAndInjectRealLinks(
  responseText: string,
  userId: string | undefined,
  phoneNumber: string,
): Promise<string> {
  const { text, hadFabricatedPlansUrl, hadFabricatedConexaoUrl } = sanitizeFabricatedUrls(responseText);

  if (!hadFabricatedPlansUrl && !hadFabricatedConexaoUrl) {
    return text; // No fabrication detected, return as-is
  }

  let result = text;

  // Auto-inject real plans link
  if (hadFabricatedPlansUrl && userId) {
    try {
      console.log('[ToolCalling] Auto-injetando link REAL de planos (LLM fabricou URL)');
      const toolResult = await executeToolCall('gerar_link_planos', {}, userId, phoneNumber);
      const parsed = JSON.parse(toolResult);
      if (parsed.success && parsed.message) {
        // Extract the real URL from the tool result
        const realUrlMatch = parsed.message.match(/https?:\/\/[^\s\)>\]"']+/i);
        if (realUrlMatch) {
          result = result.replace(/\{\{LINK_PLACEHOLDER\}\}/g, realUrlMatch[0]);
          console.log(`[ToolCalling] Link real de planos injetado: ${realUrlMatch[0]}`);
        } else {
          result = result.replace(/\{\{LINK_PLACEHOLDER\}\}/g, `${APP_BASE_URL}/plans`);
        }
      } else {
        result = result.replace(/\{\{LINK_PLACEHOLDER\}\}/g, `${APP_BASE_URL}/plans`);
      }
    } catch (err) {
      console.error('[ToolCalling] Erro ao gerar link real de planos:', err);
      result = result.replace(/\{\{LINK_PLACEHOLDER\}\}/g, `${APP_BASE_URL}/plans`);
    }
  } else if (hadFabricatedPlansUrl) {
    // No userId — can't generate autologin, use generic URL
    result = result.replace(/\{\{LINK_PLACEHOLDER\}\}/g, `${APP_BASE_URL}/plans`);
  }

  // Auto-inject real conexao link
  if (hadFabricatedConexaoUrl && userId) {
    try {
      console.log('[ToolCalling] Auto-injetando link REAL de conexão (LLM fabricou URL)');
      const toolResult = await executeToolCall('gerar_link_conexao', {}, userId, phoneNumber);
      const parsed = JSON.parse(toolResult);
      if (parsed.success && parsed.message) {
        const realUrlMatch = parsed.message.match(/https?:\/\/[^\s\)>\]"']+/i);
        if (realUrlMatch) {
          result = result.replace(/\{\{LINK_PLACEHOLDER\}\}/g, realUrlMatch[0]);
          console.log(`[ToolCalling] Link real de conexão injetado: ${realUrlMatch[0]}`);
        } else {
          result = result.replace(/\{\{LINK_PLACEHOLDER\}\}/g, `${APP_BASE_URL}/conexao`);
        }
      } else {
        result = result.replace(/\{\{LINK_PLACEHOLDER\}\}/g, `${APP_BASE_URL}/conexao`);
      }
    } catch (err) {
      console.error('[ToolCalling] Erro ao gerar link real de conexão:', err);
      result = result.replace(/\{\{LINK_PLACEHOLDER\}\}/g, `${APP_BASE_URL}/conexao`);
    }
  } else if (hadFabricatedConexaoUrl) {
    result = result.replace(/\{\{LINK_PLACEHOLDER\}\}/g, `${APP_BASE_URL}/conexao`);
  }

  // Clean up any remaining placeholders
  result = result.replace(/\{\{LINK_PLACEHOLDER\}\}/g, '[link indisponível no momento]');

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool execution bridge — maps tool calls to actionExecutorV2
// ─────────────────────────────────────────────────────────────────────────────

async function executeToolCall(
  toolName: string,
  toolArgs: Record<string, any>,
  userId: string | undefined,
  phoneNumber: string,
  mediaType?: string,
  mediaUrl?: string,
): Promise<string> {
  console.log(`[ToolCalling] Executando tool: ${toolName}`, JSON.stringify(toolArgs).slice(0, 200));

  // Map tool names to PendingAction types
  const toolToActionType: Record<string, PendingAction['type']> = {
    informar_planos: 'INFORMAR_PLANOS',
    gerar_link_conexao: 'GERAR_LINK_CONEXAO',
    gerar_link_planos: 'GERAR_LINK_PLANOS',
    editar_prompt: 'edit_prompt',
    salvar_midia: 'save_media',
    criar_agente: 'criar_agente',
    registrar_pagamento: 'registrar_pagamento',
  };

  const actionType = toolToActionType[toolName];
  if (!actionType) {
    return JSON.stringify({ success: false, error: `Ferramenta "${toolName}" não reconhecida.` });
  }

  // For tools that don't require userId (informar_planos on new leads)
  if (!userId && actionType !== 'INFORMAR_PLANOS' && actionType !== 'criar_agente' && actionType !== 'registrar_pagamento') {
    return JSON.stringify({ success: false, error: 'Cliente não tem conta ativa. Crie uma conta primeiro com criar_agente.' });
  }

  // Enrich media params from message context
  if (toolName === 'salvar_midia') {
    if (mediaUrl && !toolArgs.mediaUrl) toolArgs.mediaUrl = mediaUrl;
    if (mediaType && !toolArgs.mediaType) toolArgs.mediaType = mediaType;
  }

  if (toolName === 'registrar_pagamento') {
    if (mediaUrl && !toolArgs.comprovanteUrl) toolArgs.comprovanteUrl = mediaUrl;
  }

  // Build PendingAction and delegate to executeAction
  const pendingAction: PendingAction = {
    type: actionType,
    payload: { ...toolArgs, phoneNumber },
    proposedText: '',
    expiresAt: Date.now() + 60_000,
  };

  try {
    const result = await executeAction(pendingAction, userId || phoneNumber);
    return JSON.stringify({ success: result.success, message: result.responseText });
  } catch (err: any) {
    console.error(`[ToolCalling] Erro ao executar tool ${toolName}:`, err);
    return JSON.stringify({ success: false, error: err?.message || 'Erro interno ao executar ação.' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON-in-text fallback parser
// ─────────────────────────────────────────────────────────────────────────────

interface FallbackToolCall {
  tool: string;
  arguments: Record<string, any>;
}

function parseFallbackToolCalls(text: string): FallbackToolCall[] {
  // Try to find JSON block with tool_calls array
  const patterns = [
    /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i,
    /(\{[\s\S]*"tool_calls"[\s\S]*\})/i,
    /(\{[\s\S]*"ferramenta"[\s\S]*\})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
          return parsed.tool_calls.map((tc: any) => ({
            tool: tc.name || tc.tool || tc.function,
            arguments: tc.arguments || tc.params || tc.parametros || {},
          }));
        }
        if (parsed.ferramenta) {
          return [{
            tool: parsed.ferramenta,
            arguments: parsed.argumentos || parsed.parametros || {},
          }];
        }
      } catch {
        // Continue trying other patterns
      }
    }
  }

  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export — Multi-turn tool calling loop
// ─────────────────────────────────────────────────────────────────────────────

const MAX_TOOL_ROUNDS = 3;

export async function processToolCallingMessage(
  phoneNumber: string,
  messageText: string,
  userId: string | undefined,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  agentConfig?: { name?: string; company?: string; role?: string },
  mediaType?: string,
  mediaUrl?: string,
  sendIntermediateMessage?: (text: string) => Promise<void>,
): Promise<{ responseText: string }> {
  console.log(`[ToolCalling] Processando mensagem de ${phoneNumber}, userId=${userId || 'novo'}, msg="${messageText.slice(0, 60)}"`);

  // 1. Gather context
  const context = await gatherClientContext(userId);

  // 2. Build system prompt
  const systemPrompt = buildToolCallingSystemPrompt(phoneNumber, userId, {
    ...context,
    agentConfig,
  });

  // 3. Build messages array with conversation history
  const historySlice = conversationHistory.slice(-20); // Last 10 exchanges
  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...historySlice.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: messageText },
  ];

  // Add media annotation if present
  if (mediaType && mediaType !== 'text' && mediaType !== 'chat' && mediaUrl) {
    messages.push({
      role: 'user',
      content: `[O cliente enviou uma mídia do tipo "${mediaType}". URL: ${mediaUrl}]`,
    });
  }

  // 4. Try native tool calling via Mistral SDK (with retry for 429)
  try {
    const mistral = await getMistralClient();
    let finalResponse = '';

    const callMistralWithRetry = async (params: any, retries = 2): Promise<any> => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await mistral.chat.complete(params);
        } catch (err: any) {
          const is429 = err?.statusCode === 429 || err?.message?.includes('429') || err?.message?.includes('Rate limit');
          if (is429 && attempt < retries) {
            const delay = (attempt + 1) * 2000; // 2s, 4s
            console.log(`[ToolCalling] Rate limit 429 — retry ${attempt + 1} em ${delay}ms`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw err;
        }
      }
    };

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      console.log(`[ToolCalling] Round ${round + 1}/${MAX_TOOL_ROUNDS}`);

      const response = await callMistralWithRetry({
        model: 'mistral-small-latest',
        messages: messages as any,
        tools: TOOL_DEFINITIONS as any,
        toolChoice: 'auto' as any,
        maxTokens: 1024,
        temperature: 0.4,
      });

      const choice = response.choices?.[0];
      if (!choice) {
        console.error('[ToolCalling] LLM retornou sem choices');
        break;
      }

      const assistantMessage = choice.message;
      const toolCalls = (assistantMessage as any)?.toolCalls;

      // If no tool calls, we have the final text response
      if (!toolCalls || toolCalls.length === 0) {
        finalResponse = assistantMessage?.content as string || '';
        console.log(`[ToolCalling] Resposta final (round ${round + 1}): "${finalResponse.slice(0, 100)}..."`);
        break;
      }

      // Add assistant message with tool calls to history
      messages.push(assistantMessage);

      // Execute each tool call
      for (const tc of toolCalls) {
        const fnName = tc.function?.name || '';
        let fnArgs: Record<string, any> = {};

        try {
          fnArgs = typeof tc.function?.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : tc.function?.arguments || {};
        } catch {
          console.warn(`[ToolCalling] Falha ao parsear argumentos do tool ${fnName}`);
        }

        console.log(`[ToolCalling] Tool call: ${fnName}(${JSON.stringify(fnArgs).slice(0, 150)})`);

        // V23j: Enviar mensagem intermediária ANTES de operações longas
        if (fnName === 'criar_agente' && sendIntermediateMessage) {
          try {
            await sendIntermediateMessage('⏳ Estou preparando sua conta de teste agora, um momento...');
            console.log('[ToolCalling] Mensagem intermediária enviada antes de criar_agente');
          } catch (err) {
            console.warn('[ToolCalling] Falha ao enviar mensagem intermediária:', err);
          }
        }

        const toolResult = await executeToolCall(fnName, fnArgs, userId, phoneNumber, mediaType, mediaUrl);

        // Add tool result to messages for next round
        messages.push({
          role: 'tool',
          toolCallId: tc.id,
          name: fnName,
          content: toolResult,
        });
      }

      // If this was the last round, force a text response
      if (round === MAX_TOOL_ROUNDS - 1) {
        console.log('[ToolCalling] Max rounds atingido — forçando resposta de texto');
        const finalResp = await callMistralWithRetry({
          model: 'mistral-small-latest',
          messages: messages as any,
          maxTokens: 800,
          temperature: 0.4,
        });
        finalResponse = finalResp.choices?.[0]?.message?.content as string || '';
      }
    }

    if (finalResponse) {
      const sanitized = await sanitizeAndInjectRealLinks(finalResponse, userId, phoneNumber);
      return { responseText: sanitized };
    }
  } catch (err: any) {
    console.error('[ToolCalling] Erro no tool calling nativo, tentando fallback JSON-in-text:', err?.message || err);

    // If tools were already executed (tool result messages exist), extract their results
    // so the fallback can include them instead of losing the data
    const toolResultMessages = messages.filter((m: any) => m.role === 'tool');
    if (toolResultMessages.length > 0) {
      console.log(`[ToolCalling] ${toolResultMessages.length} tool(s) já executada(s) — usando resultados diretos`);
      const results = toolResultMessages.map((m: any) => {
        try {
          const parsed = JSON.parse(m.content);
          return parsed.message || parsed.error || m.content;
        } catch {
          return m.content;
        }
      });
      // If we have tool results, return them directly (the tool already did the work)
      const combinedResult = results.join('\n\n');
      if (combinedResult && combinedResult.length > 10) {
        const sanitizedCombined = await sanitizeAndInjectRealLinks(combinedResult, userId, phoneNumber);
        return { responseText: sanitizedCombined };
      }
    }
  }

  // 5. Fallback: JSON-in-text via chatComplete (works with any provider)
  console.log('[ToolCalling] Usando fallback JSON-in-text');
  return processWithJsonFallback(messages, userId, phoneNumber, mediaType, mediaUrl);
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON-in-text fallback (when native tool calling fails)
// ─────────────────────────────────────────────────────────────────────────────

async function processWithJsonFallback(
  messages: any[],
  userId: string | undefined,
  phoneNumber: string,
  mediaType?: string,
  mediaUrl?: string,
): Promise<{ responseText: string }> {
  // Append instruction for JSON tool calling format
  const toolNames = TOOL_DEFINITIONS.map(t => t.function.name).join(', ');
  const fallbackInstruction = `

INSTRUÇÃO ESPECIAL: Se você precisar executar uma ação, inclua EXATAMENTE este formato JSON no início da sua resposta:
\`\`\`json
{"tool_calls": [{"name": "NOME_DA_FERRAMENTA", "arguments": {PARAMETROS}}]}
\`\`\`

Ferramentas disponíveis: ${toolNames}
Depois do JSON, escreva a mensagem normal para o cliente.
Se NÃO precisar de ação, responda normalmente sem JSON.`;

  // Modify system message to include fallback instruction
  const fallbackMessages: ChatMessage[] = messages.map((m, i) => {
    if (i === 0 && m.role === 'system') {
      return { role: 'system' as const, content: m.content + fallbackInstruction };
    }
    // Only include user/assistant/system messages (skip tool messages)
    if (['user', 'assistant', 'system'].includes(m.role)) {
      return { role: m.role as 'user' | 'assistant' | 'system', content: m.content || '' };
    }
    return null;
  }).filter(Boolean) as ChatMessage[];

  try {
    const response = await chatComplete({ messages: fallbackMessages, maxTokens: 1024, temperature: 0.4 });
    let rawText = response.choices?.[0]?.message?.content || '';

    // Check for embedded tool calls
    const toolCalls = parseFallbackToolCalls(rawText);
    if (toolCalls.length > 0) {
      // Remove JSON block from response text
      rawText = rawText
        .replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/gi, '')
        .replace(/\{[\s\S]*"tool_calls"[\s\S]*?\}/i, '')
        .trim();

      // Execute tool calls
      const results: string[] = [];
      for (const tc of toolCalls) {
        const result = await executeToolCall(tc.tool, tc.arguments, userId, phoneNumber, mediaType, mediaUrl);
        results.push(result);
      }

      // If we have remaining text, return it enriched with tool results
      if (rawText) {
        const sanitizedFallback = await sanitizeAndInjectRealLinks(rawText, userId, phoneNumber);
        return { responseText: sanitizedFallback };
      }

      // Otherwise, generate a response incorporating tool results
      const toolResultsSummary = results.map(r => {
        try {
          const parsed = JSON.parse(r);
          return parsed.message || parsed.error || r;
        } catch {
          return r;
        }
      }).join('\n');

      return { responseText: toolResultsSummary };
    }

    // No tool calls — return text as-is
    const sanitizedNoTool = await sanitizeAndInjectRealLinks(rawText || 'Desculpe, tive uma dificuldade técnica. Como posso ajudar?', userId, phoneNumber);
    return { responseText: sanitizedNoTool };
  } catch (err: any) {
    console.error('[ToolCalling] Fallback falhou:', err?.message || err);
    return { responseText: 'Desculpe, estou com uma dificuldade momentânea. Pode tentar novamente em alguns segundos?' };
  }
}
