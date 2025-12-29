/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🗄️ SERVIÇO DE HISTÓRICO DE EDIÇÃO DE PROMPTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Gerencia:
 * 1. Histórico de versões do prompt (para restaurar)
 * 2. Histórico de chat (conversa natural sobre as edições)
 * 
 * Usa Supabase como backend via API REST.
 */

import { db } from './db';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export interface PromptVersion {
  id: string;
  user_id: string;
  config_type: 'ai_agent_config' | 'business_agent_config';
  version_number: number;
  prompt_content: string;
  edit_summary: string | null;
  edit_type: 'manual' | 'ia' | 'restore' | 'template';
  edit_details: any[];
  created_at: Date;
  is_current: boolean;
}

export interface PromptEditChatMessage {
  id: string;
  user_id: string;
  config_type: 'ai_agent_config' | 'business_agent_config';
  role: 'user' | 'assistant';
  content: string;
  version_id: string | null;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface SaveVersionParams {
  userId: string;
  configType?: 'ai_agent_config' | 'business_agent_config';
  promptContent: string;
  editSummary?: string;
  editType?: 'manual' | 'ia' | 'restore' | 'template';
  editDetails?: any[];
}

export interface SaveChatMessageParams {
  userId: string;
  configType?: 'ai_agent_config' | 'business_agent_config';
  role: 'user' | 'assistant';
  content: string;
  versionId?: string;
  metadata?: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÕES DE VERSÃO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Salva uma nova versão do prompt
 */
export async function salvarVersaoPrompt(params: SaveVersionParams): Promise<PromptVersion | null> {
  const {
    userId,
    configType = 'ai_agent_config',
    promptContent,
    editSummary = null,
    editType = 'manual',
    editDetails = []
  } = params;
  
  try {
    // Busca o próximo número de versão
    const [maxVersion] = await db.execute<{ max_version: number }>(
      `SELECT COALESCE(MAX(version_number), 0) as max_version 
       FROM prompt_versions 
       WHERE user_id = $1 AND config_type = $2`,
      [userId, configType]
    );
    
    const nextVersion = (maxVersion?.max_version || 0) + 1;
    
    // Remove flag is_current das versões anteriores
    await db.execute(
      `UPDATE prompt_versions SET is_current = false 
       WHERE user_id = $1 AND config_type = $2`,
      [userId, configType]
    );
    
    // Insere nova versão
    const [newVersion] = await db.execute<PromptVersion>(
      `INSERT INTO prompt_versions (
        user_id, config_type, version_number, prompt_content, 
        edit_summary, edit_type, edit_details, is_current
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      RETURNING *`,
      [userId, configType, nextVersion, promptContent, editSummary, editType, JSON.stringify(editDetails)]
    );
    
    console.log(`[HistoryService] Nova versão ${nextVersion} salva para user ${userId}`);
    return newVersion;
    
  } catch (error) {
    console.error('[HistoryService] Erro ao salvar versão:', error);
    return null;
  }
}

/**
 * Lista todas as versões de um usuário
 */
export async function listarVersoes(
  userId: string, 
  configType: string = 'ai_agent_config',
  limite: number = 50
): Promise<PromptVersion[]> {
  try {
    const versoes = await db.execute<PromptVersion>(
      `SELECT * FROM prompt_versions 
       WHERE user_id = $1 AND config_type = $2 
       ORDER BY version_number DESC 
       LIMIT $3`,
      [userId, configType, limite]
    );
    
    return versoes || [];
  } catch (error) {
    console.error('[HistoryService] Erro ao listar versões:', error);
    return [];
  }
}

/**
 * Obtém uma versão específica
 */
export async function obterVersao(versionId: string): Promise<PromptVersion | null> {
  try {
    const [versao] = await db.execute<PromptVersion>(
      `SELECT * FROM prompt_versions WHERE id = $1`,
      [versionId]
    );
    
    return versao || null;
  } catch (error) {
    console.error('[HistoryService] Erro ao obter versão:', error);
    return null;
  }
}

/**
 * Obtém a versão atual (is_current = true)
 */
export async function obterVersaoAtual(
  userId: string, 
  configType: string = 'ai_agent_config'
): Promise<PromptVersion | null> {
  try {
    const [versao] = await db.execute<PromptVersion>(
      `SELECT * FROM prompt_versions 
       WHERE user_id = $1 AND config_type = $2 AND is_current = true`,
      [userId, configType]
    );
    
    return versao || null;
  } catch (error) {
    console.error('[HistoryService] Erro ao obter versão atual:', error);
    return null;
  }
}

/**
 * Restaura uma versão anterior
 * Cria uma nova versão com o conteúdo da versão selecionada
 */
export async function restaurarVersao(
  versionId: string, 
  userId: string
): Promise<PromptVersion | null> {
  try {
    const versaoOriginal = await obterVersao(versionId);
    
    if (!versaoOriginal) {
      console.error('[HistoryService] Versão não encontrada:', versionId);
      return null;
    }
    
    // Cria nova versão com o conteúdo restaurado
    const novaVersao = await salvarVersaoPrompt({
      userId,
      configType: versaoOriginal.config_type,
      promptContent: versaoOriginal.prompt_content,
      editSummary: `Restaurado da versão ${versaoOriginal.version_number}`,
      editType: 'restore',
      editDetails: [{ restored_from: versionId, original_version: versaoOriginal.version_number }]
    });
    
    return novaVersao;
  } catch (error) {
    console.error('[HistoryService] Erro ao restaurar versão:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÕES DE CHAT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Salva uma mensagem no histórico de chat
 */
export async function salvarMensagemChat(params: SaveChatMessageParams): Promise<PromptEditChatMessage | null> {
  const {
    userId,
    configType = 'ai_agent_config',
    role,
    content,
    versionId = null,
    metadata = {}
  } = params;
  
  try {
    const [mensagem] = await db.execute<PromptEditChatMessage>(
      `INSERT INTO prompt_edit_chat (
        user_id, config_type, role, content, version_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [userId, configType, role, content, versionId, JSON.stringify(metadata)]
    );
    
    return mensagem;
  } catch (error) {
    console.error('[HistoryService] Erro ao salvar mensagem de chat:', error);
    return null;
  }
}

/**
 * Lista o histórico de chat de um usuário
 */
export async function listarChatHistory(
  userId: string, 
  configType: string = 'ai_agent_config',
  limite: number = 100
): Promise<PromptEditChatMessage[]> {
  try {
    const mensagens = await db.execute<PromptEditChatMessage>(
      `SELECT * FROM prompt_edit_chat 
       WHERE user_id = $1 AND config_type = $2 
       ORDER BY created_at ASC 
       LIMIT $3`,
      [userId, configType, limite]
    );
    
    return mensagens || [];
  } catch (error) {
    console.error('[HistoryService] Erro ao listar chat:', error);
    return [];
  }
}

/**
 * Limpa o histórico de chat (mantém versões)
 */
export async function limparChatHistory(
  userId: string, 
  configType: string = 'ai_agent_config'
): Promise<boolean> {
  try {
    await db.execute(
      `DELETE FROM prompt_edit_chat WHERE user_id = $1 AND config_type = $2`,
      [userId, configType]
    );
    return true;
  } catch (error) {
    console.error('[HistoryService] Erro ao limpar chat:', error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÃO COMBINADA: Editar e Salvar Histórico
// ═══════════════════════════════════════════════════════════════════════════

import { editarPromptViaIA, ResultadoEdicao } from './promptEditService';

/**
 * Edita o prompt via IA e salva no histórico
 * Esta é a função principal que combina tudo:
 * 1. Salva mensagem do usuário no chat
 * 2. Chama a IA para editar
 * 3. Salva a resposta da IA no chat
 * 4. Se houve edição, salva nova versão
 * 5. Retorna resultado completo
 */
export async function editarPromptComHistorico(
  userId: string,
  promptAtual: string,
  instrucaoUsuario: string,
  apiKey: string,
  configType: 'ai_agent_config' | 'business_agent_config' = 'ai_agent_config'
): Promise<{
  resultado: ResultadoEdicao;
  versao: PromptVersion | null;
  mensagensChat: { user: PromptEditChatMessage | null; assistant: PromptEditChatMessage | null };
}> {
  
  // 1. Salva mensagem do usuário no chat
  const mensagemUsuario = await salvarMensagemChat({
    userId,
    configType,
    role: 'user',
    content: instrucaoUsuario
  });
  
  // 2. Chama a IA para editar
  const resultado = await editarPromptViaIA(
    promptAtual,
    instrucaoUsuario,
    apiKey,
    'mistral'
  );
  
  // 3. Salva nova versão se houve edição bem-sucedida
  let novaVersao: PromptVersion | null = null;
  if (resultado.success && resultado.novoPrompt !== promptAtual) {
    novaVersao = await salvarVersaoPrompt({
      userId,
      configType,
      promptContent: resultado.novoPrompt,
      editSummary: resultado.mensagemChat,
      editType: 'ia',
      editDetails: resultado.detalhes
    });
  }
  
  // 4. Salva resposta da IA no chat (com referência à versão criada)
  const mensagemAssistente = await salvarMensagemChat({
    userId,
    configType,
    role: 'assistant',
    content: resultado.mensagemChat,
    versionId: novaVersao?.id,
    metadata: {
      edicoes_aplicadas: resultado.edicoesAplicadas,
      edicoes_falharam: resultado.edicoesFalharam,
      success: resultado.success
    }
  });
  
  return {
    resultado,
    versao: novaVersao,
    mensagensChat: {
      user: mensagemUsuario,
      assistant: mensagemAssistente
    }
  };
}
