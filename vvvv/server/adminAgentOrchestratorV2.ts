import { chatComplete } from './llm';
import { executeAction, PendingAction } from './actionExecutorV2';
import { storage } from './storage';
import { listarVersoes } from './promptHistoryService';
import { db } from './db';
import { agentMediaLibrary } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import type { ChatMessage } from './llm';

// Re-export PendingAction so adminAgentService.ts (T3) can import from here
export type { PendingAction } from './actionExecutorV2';

// ─────────────────────────────────────────────────────────────────────────────
// Pattern helpers
// ─────────────────────────────────────────────────────────────────────────────

// Word-boundary safe patterns for intent parsing
const AFFIRMATIVE_PATTERNS: Array<string | RegExp> = [
  /^\b(sim|pode|ok|s|y|yes)\b/i,
  /\b(confirmo|certo|vai|bora|feito|exato|perfeito|claro)\b/i,
  /^(com\s+certeza|tá\s+bom|beleza|blz)\b/i,
];

const NEGATIVE_PATTERNS: Array<string | RegExp> = [
  /^\b(não|nao|n|no)\b/i,
  /\b(cancela|para|esquece)\b/i,
  /^(deixa\s+(pra\s+lá|de)?)\b/i,
];

/**
 * Checks if text affirms a pending action using word-boundary matching to avoid
 * false positives from substring matches. Requires explicit standalone intent.
 */
function isAffirmative(text: string): boolean {
  const norm = text.toLowerCase().trim();
  return AFFIRMATIVE_PATTERNS.some(p => p.test(norm));
}

/**
 * Checks if text negates a pending action using word-boundary matching to avoid
 * false positives from substring matches. Requires explicit standalone intent.
 */
function isNegative(text: string): boolean {
  const norm = text.toLowerCase().trim();
  return NEGATIVE_PATTERNS.some(p => p.test(norm));
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt builder
// ─────────────────────────────────────────────────────────────────────────────

function buildOrchestratorSystemPrompt(
  userId: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  mediaInfo?: string,
  accountStatus?: string,
  promptSummary?: string,
  mediaLibrarySummary?: string,
): string {
  const historyCtx =
    conversationHistory.length > 0
      ? `\n\nÚltimas mensagens:\n${conversationHistory
          .slice(-6)
          .map(m => `${m.role === 'user' ? 'Cliente' : 'Assistente'}: ${m.content}`)
          .join('\n')}`
      : '';

  const mediaCtx = mediaInfo ? `\n\nMídia recebida: ${mediaInfo}` : '';
  const accountCtx = accountStatus ? `\n\nStatus da conta: ${accountStatus}` : '';
  const promptCtx = promptSummary ? `\n\nPrompt atual (resumo): ${promptSummary}` : '';
  const mediaLibCtx = mediaLibrarySummary ? `\n\nBiblioteca de mídia: ${mediaLibrarySummary}` : '';

  return `Você é o assistente de configuração do AgenteZap para o usuário ${userId}.
Seu objetivo é entender o que o usuário quer fazer e retornar SOMENTE JSON válido — sem texto adicional.

Ações disponíveis:
- EDITAR_PROMPT: editar o prompt do agente (parâmetro: descricaoMudanca)
- SALVAR_MIDIA: salvar uma mídia na biblioteca (parâmetros: name, mediaUrl, mediaType, whenToUse, description)
- GERAR_LINK_CONEXAO: gerar link de acesso direto ao painel de conexão
- INFORMAR_PLANOS: informar os planos disponíveis e preços
- NENHUMA: resposta informativa, sem ação técnica
${historyCtx}${mediaCtx}${accountCtx}${promptCtx}${mediaLibCtx}

Responda SEMPRE neste formato JSON exato (sem markdown, sem texto fora do JSON):
{
  "resposta": "Mensagem amigável para o usuário",
  "acao": {
    "tipo": "NENHUMA",
    "parametros": {}
  },
  "requerConfirmacao": false
}

Regras:
- Se a ação for destrutiva ou irreversível (editar prompt), defina requerConfirmacao=true
- Para SALVAR_MIDIA: use requerConfirmacao=false quando AMBOS mediaUrl E whenToUse estiverem presentes — salve imediatamente. Use requerConfirmacao=true SOMENTE se faltar mediaUrl ou whenToUse.
- Para GERAR_LINK_CONEXAO e INFORMAR_PLANOS, requerConfirmacao=false
- Responda em português brasileiro

Instruções de tom e linguagem para o campo "resposta" (o que o cliente vê):
- Escreva como um atendente humano, caloroso e empático — nunca como um robô ou sistema
- Adapte o tom ao contexto: seja acolhedor com clientes novos curiosos, prestativo com quem já tem conta
- Use linguagem natural do dia a dia; emojis são bem-vindos quando o contexto for leve e amigável
- NUNCA mencione termos técnicos internos na resposta: JSON, ações, EDITAR_PROMPT, SALVAR_MIDIA, requerConfirmacao, parâmetros, etc.
- Se o cliente mudar de assunto, acompanhe naturalmente — não reinicie o fluxo nem repita apresentações
- Se a intenção não estiver clara, faça UMA pergunta aberta e amigável; evite listar opções como se fosse um menu
- A resposta deve soar como se viesse de uma pessoa real que se importa com o sucesso do cliente`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM call + parse
// ─────────────────────────────────────────────────────────────────────────────

interface OrchestratorLLMResult {
  resposta: string;
  acao: { tipo: string; parametros: Record<string, any> };
  requerConfirmacao: boolean;
}

const LLM_FALLBACK: OrchestratorLLMResult = {
  resposta: 'Desculpe, tive uma dificuldade técnica. Como posso ajudar?',
  acao: { tipo: 'NENHUMA', parametros: {} },
  requerConfirmacao: false,
};

async function callOrchestratorLLM(
  messageText: string,
  systemPrompt: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<OrchestratorLLMResult> {
  // Keep last 10 exchanges (20 messages) to stay within context limits
  const historySlice = conversationHistory.slice(-20);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...historySlice.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: messageText },
  ];

  try {
    const response = await chatComplete({ messages, maxTokens: 800, temperature: 0.4 });
    const raw = response.choices?.[0]?.message?.content || '';

    // Strip optional markdown fences
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    const parsed = JSON.parse(cleaned) as OrchestratorLLMResult;
    return parsed;
  } catch (e) {
    console.error('[OrchestratorV2] JSON inválido retornado pelo LLM:', e);
    return LLM_FALLBACK;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping helpers
// ─────────────────────────────────────────────────────────────────────────────

function mapLLMTypeToPendingActionType(
  llmTipo: string,
): PendingAction['type'] {
  switch (llmTipo) {
    case 'EDITAR_PROMPT':       return 'edit_prompt';
    case 'SALVAR_MIDIA':        return 'save_media';
    case 'GERAR_LINK_CONEXAO':  return 'GERAR_LINK_CONEXAO';
    case 'INFORMAR_PLANOS':     return 'INFORMAR_PLANOS';
    default:                    return 'NENHUMA';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export async function processActiveClientMessage(
  phoneNumber: string,
  messageText: string,
  userId: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  pendingAction: PendingAction | undefined,
  mediaType?: string,
  mediaUrl?: string,
): Promise<{ responseText: string; newPendingAction?: PendingAction }> {
  console.log(`[OrchestratorV2] Mensagem de ${phoneNumber}, pendingAction=${pendingAction?.type ?? 'none'}`);

  // ── Branch 1: There is an active pending action ────────────────────────────
  if (pendingAction) {
    // 1a. Expired — fall through to LLM
    if (pendingAction.expiresAt < Date.now()) {
      console.log('[OrchestratorV2] pendingAction expirado — chamando LLM');
    } else {
      // 1b. Affirmative confirmation
      if (isAffirmative(messageText)) {
        console.log('[OrchestratorV2] Confirmação afirmativa — executando ação');
        const result = await executeAction(pendingAction, userId);
        return { responseText: result.responseText };
      }

      // 1c. Negative cancellation
      if (isNegative(messageText)) {
        console.log('[OrchestratorV2] Cancelamento — descartando pendingAction');
        return { responseText: 'Ok, cancelei. Como posso ajudar?' };
      }

      // 1d. Ambiguous — repeat confirmation question, keep pending action alive
      console.log('[OrchestratorV2] Resposta ambígua — mantendo pendingAction e pedindo confirmação');
      return {
        responseText: `${pendingAction.proposedText}\n\nConfirma? (sim / não)`,
        newPendingAction: pendingAction,
      };
    }
  }

  // ── Branch 2: Call the orchestrator LLM ───────────────────────────────────
  const mediaInfo =
    mediaType && mediaUrl ? `${mediaType} → ${mediaUrl}` : undefined;

  // Fetch actual context from storage
  let accountStatus: string | undefined;
  let promptSummary: string | undefined;
  let mediaLibrarySummary: string | undefined;

  try {
    // 1. Fetch subscription/account status
    const subscription = await storage.getUserSubscription(userId);
    if (subscription && subscription.plan) {
      accountStatus = `${subscription.plan.name || subscription.plan.planName || 'Ativo'} (ativo)`;
    }
  } catch (e) {
    console.warn('[OrchestratorV2] Erro ao buscar assinatura:', e);
  }

  try {
    // 2. Fetch prompt versions count and summary
    const versions = await listarVersoes(userId);
    if (versions && versions.length > 0) {
      const current = versions.find(v => v.is_current) || versions[0];
      const versionNumber = current.version_number || versions.length;
      promptSummary = `${versions.length} versão${versions.length > 1 ? 's' : ''} (v${versionNumber} atual)`;
    } else {
      promptSummary = 'Nenhuma versão registrada';
    }
  } catch (e) {
    console.warn('[OrchestratorV2] Erro ao buscar versões de prompt:', e);
  }

  try {
    // 3. Fetch media library summary
    const mediaRecords = await db
      .select()
      .from(agentMediaLibrary)
      .where(eq(agentMediaLibrary.userId, userId))
      .orderBy(desc(agentMediaLibrary.id))
      .limit(5);

    if (mediaRecords && mediaRecords.length > 0) {
      const names = mediaRecords.map(m => m.name).join(', ');
      mediaLibrarySummary = `${mediaRecords.length} mídia${mediaRecords.length > 1 ? 's' : ''} (${names})`;
    } else {
      mediaLibrarySummary = 'Nenhuma mídia salva';
    }
  } catch (e) {
    console.warn('[OrchestratorV2] Erro ao buscar biblioteca de mídia:', e);
  }

  const systemPrompt = buildOrchestratorSystemPrompt(
    userId,
    conversationHistory,
    mediaInfo,
    accountStatus,
    promptSummary,
    mediaLibrarySummary
  );
  const llmResult = await callOrchestratorLLM(messageText, systemPrompt, conversationHistory);

  const actionTipo = llmResult.acao?.tipo || 'NENHUMA';
  const actionParams: Record<string, any> = llmResult.acao?.parametros || {};

  console.log(
    `[OrchestratorV2] LLM decidiu: tipo="${actionTipo}", requerConfirmacao=${llmResult.requerConfirmacao}`,
  );

  // Enrich media params with what was received in the message
  if (actionTipo === 'SALVAR_MIDIA') {
    if (mediaUrl)  actionParams.mediaUrl  = actionParams.mediaUrl  || mediaUrl;
    if (mediaType) actionParams.mediaType = actionParams.mediaType || mediaType;

    // If both required fields are now present, override the LLM's confirmation request
    // so the media is saved immediately in one turn (not deferred to a second "sim" message).
    const hasUrl  = String(actionParams.mediaUrl || actionParams.storageUrl || '').trim();
    const hasWhen = String(actionParams.whenToUse || '').trim();
    if (hasUrl && hasWhen && llmResult.requerConfirmacao) {
      console.log('[OrchestratorV2] SALVAR_MIDIA: mediaUrl + whenToUse presentes — forçando requerConfirmacao=false para execução imediata');
      llmResult.requerConfirmacao = false;
    }
  }

  const mappedType = mapLLMTypeToPendingActionType(actionTipo);

  // ── 2a. Action with confirmation required ──────────────────────────────────
  if (llmResult.requerConfirmacao) {
    const newPendingAction: PendingAction = {
      type: mappedType,
      payload: actionParams,
      proposedText: llmResult.resposta,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    };
    console.log(`[OrchestratorV2] Criando pendingAction tipo="${mappedType}", expira em 10min`);
    return { responseText: `${llmResult.resposta}\n\nConfirma? (sim / não)`, newPendingAction };
  }

  // ── 2b. No action — return LLM response text directly ─────────────────────
  if (actionTipo === 'NENHUMA') {
    return { responseText: llmResult.resposta };
  }

  // ── 2c. Execute action immediately (no confirmation needed) ───────────────
  // Guard: for SALVAR_MIDIA, both mediaUrl and whenToUse must be present
  if (actionTipo === 'SALVAR_MIDIA') {
    const hasMediaUrl = String(actionParams.mediaUrl || actionParams.storageUrl || '').trim();
    const hasWhenToUse = String(actionParams.whenToUse || '').trim();

    if (!hasMediaUrl || !hasWhenToUse) {
      console.log('[OrchestratorV2] SALVAR_MIDIA bloqueado: faltam mediaUrl ou whenToUse');
      const missing: string[] = [];
      if (!hasMediaUrl) missing.push('a URL/localização da mídia');
      if (!hasWhenToUse) missing.push('o contexto de quando usar');
      return {
        responseText: `⚠️ Para salvar a mídia corretamente, preciso que você me diga ${missing.join(' e ')}. Pode detalhar?`,
      };
    }
  }

  const ephemeralAction: PendingAction = {
    type: mappedType,
    payload: actionParams,
    proposedText: llmResult.resposta,
    expiresAt: Date.now() + 60_000, // not persisted, but set a safe expiry
  };

  const result = await executeAction(ephemeralAction, userId);
  return { responseText: result.responseText };
}
