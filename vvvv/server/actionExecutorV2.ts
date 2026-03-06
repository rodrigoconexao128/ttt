import { editarPromptComHistorico } from './promptHistoryService';
import { insertAgentMedia } from './mediaService';
import { generateAutologinLink } from './autologinService';
import { storage } from './storage';
import { getLLMConfig } from './llm';
import { pool } from './db';
import {
  createTestAccountWithCredentials,
  buildStructuredAccountDeliveryText,
  getClientSession,
  updateClientSession,
  createClientSession,
} from './adminAgentService';
import { generatePixQRCode } from './pixService';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Busca o token de simulador mais recente para um userId
 */
export async function getSimulatorTokenForUser(userId: string): Promise<string | null> {
  try {
    const result = await pool.query(
      `SELECT token FROM admin_test_tokens
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    return result.rows[0]?.token || null;
  } catch (e) {
    console.warn('[ExecutorV2] Erro ao buscar simulator token:', e);
    return null;
  }
}

/**
 * Monta o link do simulador a partir de um token
 */
export function buildSimulatorUrl(token: string): string {
  const baseUrl = (process.env.APP_URL || 'https://agentezap.online').replace(/\/+$/, '');
  return `${baseUrl}/test/${token}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PendingAction {
  /**
   * 'edit_prompt' and 'save_media' are used for stored confirmation flows.
   * 'GERAR_LINK_CONEXAO', 'INFORMAR_PLANOS', 'NENHUMA' are ephemeral action
   * types produced by the orchestrator and passed directly to executeAction
   * when requerConfirmacao = false.
   */
  type: 'edit_prompt' | 'save_media' | 'GERAR_LINK_CONEXAO' | 'GERAR_LINK_PLANOS' | 'INFORMAR_PLANOS' | 'NENHUMA' | 'criar_agente' | 'registrar_pagamento';
  payload: Record<string, any>;
  proposedText: string;
  expiresAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

function getPLANS_INFO(): string {
  const plansUrl = process.env.AGENTEZAP_PLANS_URL || 'https://agentezap.online/plans';
  return `
💼 *Nossos Planos*

⭐ *Starter*: R$ 97/mês
  • 1 agente IA
  • Até 500 conversas/mês
  • Suporte por email

🚀 *Pro*: R$ 197/mês
  • 1 agente IA
  • Conversas ilimitadas
  • Recursos avançados
  • Prioridade de resposta

🔥 *Business*: R$ 397/mês
  • Até 3 agentes IA
  • Conversas ilimitadas
  • Todos os recursos
  • Suporte prioritário

👉 Assine agora em:
${plansUrl}
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export async function executeAction(
  pendingAction: PendingAction,
  userId: string,
): Promise<{ success: boolean; responseText: string }> {
  console.log(`[ExecutorV2] Executando ação tipo="${pendingAction.type}" para userId=${userId}`);

  switch (pendingAction.type) {
    // ── Editar prompt do agente ──────────────────────────────────────────────
    case 'edit_prompt': {
      try {
        const agentConfig = await storage.getAgentConfig(userId);
        const promptAtual = agentConfig?.prompt || '';
        const config = await getLLMConfig();
        const apiKey = config.mistralApiKey || process.env.MISTRAL_API_KEY || '';
        const instrucao = String(pendingAction.payload.descricaoMudanca || '');

        console.log(`[ExecutorV2] Editando prompt (${promptAtual.length} chars) com instrução: "${instrucao.slice(0, 80)}..."`);
        const result = await editarPromptComHistorico(userId, promptAtual, instrucao, apiKey);

        if (result.resultado.success) {
          const summary = (result.resultado as any).summary || (result.resultado as any).editSummary || '';
          let responseText = `✅ Prompt atualizado com sucesso!${summary ? ` ${summary}` : ''}`;

          // T4: Always include simulator link after editing prompt
          const simToken = await getSimulatorTokenForUser(userId);
          if (simToken) {
            responseText += `\n\n🔗 Teste como ficou: ${buildSimulatorUrl(simToken)}`;
          }

          return {
            success: true,
            responseText,
          };
        } else {
          const err = (result.resultado as any).error || 'erro desconhecido';
          console.warn('[ExecutorV2] editarPromptComHistorico retornou failure:', err);
          return { success: false, responseText: `❌ Não foi possível editar o prompt: ${err}` };
        }
      } catch (e: any) {
        console.error('[ExecutorV2] Erro ao editar prompt:', e);
        return { success: false, responseText: '❌ Ocorreu um erro ao editar o prompt. Tente novamente.' };
      }
    }

    // ── Salvar mídia na biblioteca ────────────────────────────────────────────
    case 'save_media': {
      try {
        const storageUrl: string = String(pendingAction.payload.mediaUrl || pendingAction.payload.storageUrl || '').trim();
        const whenToUse: string = String(pendingAction.payload.whenToUse || '').trim();

        // Validate required context: both URL and usage description must be present
        if (!storageUrl || !whenToUse) {
          console.log('[ExecutorV2] Mídia incompleta: faltam URL ou contexto de uso');
          const missing: string[] = [];
          if (!storageUrl) missing.push('URL/localização da mídia');
          if (!whenToUse) missing.push('contexto de quando usar');
          return {
            success: false,
            responseText: `❌ Para salvar a mídia, preciso de mais informações: ${missing.join(' e ')}. Pode detalhar?`,
          };
        }

        const name: string =
          String(pendingAction.payload.name || '').trim() ||
          `Mídia ${new Date().toLocaleDateString('pt-BR')}`;
        const mediaType: string = String(pendingAction.payload.mediaType || 'image');
        const description: string =
          String(pendingAction.payload.description || '').trim() || whenToUse;

        console.log(`[ExecutorV2] Salvando mídia "${name}" tipo "${mediaType}" com contexto: "${whenToUse.slice(0, 50)}..."`);
        const inserted = await insertAgentMedia({
          userId,
          name,
          storageUrl,
          mediaType,
          whenToUse,
          description,
        });

        if (inserted) {
          return {
            success: true,
            responseText: `✅ Mídia *${inserted.name}* salva com sucesso!\nVou usá-la quando: "${whenToUse}".`,
          };
        } else {
          return { success: false, responseText: '❌ Não foi possível salvar a mídia. Tente novamente.' };
        }
      } catch (e: any) {
        console.error('[ExecutorV2] Erro ao salvar mídia:', e);
        return { success: false, responseText: '❌ Ocorreu um erro ao salvar a mídia. Tente novamente.' };
      }
    }

    // ── Gerar link de conexão (autologin) ─────────────────────────────────────
    case 'GERAR_LINK_CONEXAO': {
      try {
        console.log('[ExecutorV2] Gerando link de conexão para userId:', userId);
        const url = await generateAutologinLink(userId, '/conexao');
        return {
          success: true,
          responseText: `🔗 Seu link de acesso direto para conectar o WhatsApp:\n${url}\n\n⚠️ Válido por *60 minutos*. Não compartilhe com outras pessoas.`,
        };
      } catch (e: any) {
        console.error('[ExecutorV2] Erro ao gerar link de conexão:', e);
        return { success: false, responseText: '❌ Não foi possível gerar o link. Tente novamente.' };
      }
    }

    // ── Gerar link de planos (autologin) ─────────────────────────────────────
    case 'GERAR_LINK_PLANOS': {
      try {
        console.log('[ExecutorV2] Gerando link de planos para userId:', userId);
        const url = await generateAutologinLink(userId, '/plans');
        return {
          success: true,
          responseText: `🔗 Link direto para escolher seu plano (já entra logado):\n${url}\n\n⚠️ Válido por *60 minutos*.\n\n💡 Após pagar, clique em "Eu já paguei" na página ou envie o comprovante aqui pelo WhatsApp.`,
        };
      } catch (e: any) {
        console.error('[ExecutorV2] Erro ao gerar link de planos:', e);
        return { success: false, responseText: '❌ Não foi possível gerar o link de planos. Tente novamente.' };
      }
    }

    // ── Informar planos ───────────────────────────────────────────────────────
    case 'INFORMAR_PLANOS': {
      console.log('[ExecutorV2] Retornando informações de planos');
      let plansText = getPLANS_INFO();
      // Se o cliente já tem conta, adicionar oferta de link direto
      if (userId && userId.length > 10) {
        plansText += '\n\n👉 Quer assinar agora? É só pedir e eu te mando o link direto pra você entrar logado e escolher o plano!';
      }
      return { success: true, responseText: plansText };
    }

    // ── Sem ação (resposta livre do LLM) ──────────────────────────────────────
    case 'NENHUMA': {
      console.log('[ExecutorV2] Tipo NENHUMA — retornando proposedText');
      return { success: true, responseText: pendingAction.proposedText };
    }

    // ── Criar agente de teste ────────────────────────────────────────────────
    case 'criar_agente': {
      try {
        const phoneNumber = String(pendingAction.payload.phoneNumber || '').trim();
        if (!phoneNumber) {
          return { success: false, responseText: '❌ Número de telefone não informado para criação de conta.' };
        }

        // Get or create session for the phone number
        let session = getClientSession(phoneNumber);
        if (!session) {
          session = createClientSession(phoneNumber);
        }

        // Apply agent config from tool call params
        const agentConfig = { ...session.agentConfig };
        if (pendingAction.payload.nomeEmpresa) {
          agentConfig.company = pendingAction.payload.nomeEmpresa;
        }
        if (pendingAction.payload.ramoAtuacao) {
          agentConfig.role = pendingAction.payload.ramoAtuacao;
        }
        if (pendingAction.payload.descricaoAtendimento) {
          agentConfig.prompt = pendingAction.payload.descricaoAtendimento;
        }

        session = updateClientSession(phoneNumber, { agentConfig });

        console.log(`[ExecutorV2] Criando agente para ${phoneNumber}: empresa=${agentConfig.company}, ramo=${agentConfig.role}`);

        const testResult = await createTestAccountWithCredentials(session);

        if (!testResult.success || !testResult.email || !testResult.simulatorToken) {
          return {
            success: false,
            responseText: '❌ Não foi possível criar a conta de teste. Tente novamente em alguns segundos.',
          };
        }

        const credentials = {
          email: testResult.email,
          password: testResult.password,
          loginUrl: testResult.loginUrl || 'https://agentezap.online',
          simulatorToken: testResult.simulatorToken,
          isExistingAccount: testResult.isExistingAccount === true,
        };

        // Update session with account info
        // V23j: NÃO sobrescrever userId — createTestAccountWithCredentials já definiu o UUID correto
        updateClientSession(phoneNumber, {
          flowState: 'active',
          email: credentials.email,
          lastGeneratedPassword: credentials.password,
        });

        const deliveryText = buildStructuredAccountDeliveryText(session, credentials as any);

        // V23k: Include real credentials in tool result so LLM doesn't fabricate fake ones
        const simulatorUrl = buildSimulatorUrl(credentials.simulatorToken);
        const fullDelivery = `${deliveryText}\n\n⚠️ CREDENCIAIS REAIS (copiar EXATAMENTE — NÃO modifique):\n📧 E-mail REAL: ${credentials.email}\n🔑 Senha REAL: ${credentials.password}\n🔗 Link do simulador: ${simulatorUrl}\n⚠️ O cliente SÓ consegue acessar com este email e senha exatos. NÃO invente outros.`;

        console.log(`[ExecutorV2] Agente criado: ${credentials.email} (token: ${credentials.simulatorToken})`);

        return {
          success: true,
          responseText: fullDelivery,
        };
      } catch (e: any) {
        console.error('[ExecutorV2] Erro ao criar agente:', e);
        return { success: false, responseText: '❌ Ocorreu um erro ao criar o agente. Tente novamente.' };
      }
    }

    // ── Registrar pagamento ───────────────────────────────────────────────────
    case 'registrar_pagamento': {
      try {
        const phoneNumber = String(pendingAction.payload.phoneNumber || '').trim();
        const comprovanteUrl = String(pendingAction.payload.comprovanteUrl || '').trim();
        const valorInformado = String(pendingAction.payload.valorInformado || '').trim();
        const planoEscolhido = String(pendingAction.payload.planoEscolhido || '').trim();

        console.log(`[ExecutorV2] Registrando pagamento: phone=${phoneNumber}, comprovante=${comprovanteUrl ? 'SIM' : 'NÃO'}, valor=${valorInformado}, plano=${planoEscolhido}`);

        // Notify owner about the payment
        const ownerMsg = [
          '💰 *NOVO PAGAMENTO RECEBIDO*',
          '',
          `📱 Telefone: ${phoneNumber}`,
          planoEscolhido ? `📋 Plano: ${planoEscolhido}` : '',
          valorInformado ? `💵 Valor: ${valorInformado}` : '',
          comprovanteUrl ? `🖼️ Comprovante: ${comprovanteUrl}` : '(sem comprovante)',
          '',
          '⏳ Ativar plano no painel admin.',
        ].filter(Boolean).join('\n');

        // Log the payment notification (actual WhatsApp send is handled by the caller)
        console.log(`[ExecutorV2] Notificação de pagamento:\n${ownerMsg}`);

        // Update session to payment_pending
        if (phoneNumber) {
          updateClientSession(phoneNumber, {
            flowState: 'payment_pending' as any,
            awaitingPaymentProof: false,
          });
        }

        return {
          success: true,
          responseText: '✅ Comprovante recebido! Vou verificar o pagamento e ativar seu plano. Isso geralmente leva alguns minutos. Te aviso assim que estiver tudo pronto! 🚀',
        };
      } catch (e: any) {
        console.error('[ExecutorV2] Erro ao registrar pagamento:', e);
        return { success: false, responseText: '❌ Ocorreu um erro ao registrar o pagamento. Tente novamente.' };
      }
    }

    default: {
      console.warn('[ExecutorV2] Tipo de ação desconhecido:', (pendingAction as any).type);
      return { success: false, responseText: '❌ Ação desconhecida.' };
    }
  }
}
