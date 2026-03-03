import {
  editarPromptViaIA
} from "./chunk-4FPPFWWJ.js";
import "./chunk-FYBACEOC.js";
import "./chunk-YCIPFGXJ.js";
import {
  pool
} from "./chunk-HIRAYR4B.js";
import "./chunk-WF5ZUJEW.js";
import "./chunk-KFQGP6VL.js";

// server/promptHistoryService.ts
async function salvarVersaoPrompt(params) {
  const {
    userId,
    configType = "ai_agent_config",
    promptContent,
    editSummary = null,
    editType = "manual",
    editDetails = []
  } = params;
  try {
    console.log(`[HistoryService] \u{1F4DD} Salvando nova vers\xE3o para user ${userId}, tipo: ${editType}`);
    const currentVersionResult = await pool.query(
      `SELECT id, version_number, prompt_content 
       FROM prompt_versions 
       WHERE user_id = $1 AND config_type = $2 AND is_current = true
       LIMIT 1`,
      [userId, configType]
    );
    if (currentVersionResult.rows.length > 0) {
      const currentVersion = currentVersionResult.rows[0];
      if (currentVersion.prompt_content === promptContent) {
        console.log(`[HistoryService] \u26A0\uFE0F DUPLICATA EVITADA! Conte\xFAdo id\xEAntico \xE0 vers\xE3o atual v${currentVersion.version_number}`);
        console.log(`[HistoryService] \u2139\uFE0F Retornando vers\xE3o existente (id: ${currentVersion.id})`);
        const existingVersionResult = await pool.query(
          `SELECT * FROM prompt_versions WHERE id = $1`,
          [currentVersion.id]
        );
        return existingVersionResult.rows[0];
      }
      console.log(`[HistoryService] \u2713 Conte\xFAdo diferente da v${currentVersion.version_number}, criando nova vers\xE3o`);
    } else {
      console.log(`[HistoryService] \u2139\uFE0F Nenhuma vers\xE3o atual encontrada, criando primeira vers\xE3o`);
    }
    const maxVersionResult = await pool.query(
      `SELECT COALESCE(MAX(version_number), 0) as max_version 
       FROM prompt_versions 
       WHERE user_id = $1 AND config_type = $2`,
      [userId, configType]
    );
    const nextVersion = (maxVersionResult.rows[0]?.max_version || 0) + 1;
    console.log(`[HistoryService] Pr\xF3ximo n\xFAmero de vers\xE3o: ${nextVersion}`);
    const updateResult = await pool.query(
      `UPDATE prompt_versions SET is_current = false 
       WHERE user_id = $1 AND config_type = $2 AND is_current = true
       RETURNING version_number`,
      [userId, configType]
    );
    if (updateResult.rows.length > 0) {
      console.log(`[HistoryService] \u{1F504} Vers\xF5es anteriores desmarcadas: ${updateResult.rows.map((r) => `v${r.version_number}`).join(", ")}`);
    }
    const insertResult = await pool.query(
      `INSERT INTO prompt_versions (
        user_id, config_type, version_number, prompt_content, 
        edit_summary, edit_type, edit_details, is_current
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      RETURNING *`,
      [userId, configType, nextVersion, promptContent, editSummary, editType, JSON.stringify(editDetails)]
    );
    const newVersion = insertResult.rows[0];
    if (configType === "ai_agent_config") {
      try {
        await pool.query(
          `UPDATE ai_agent_config SET prompt = $1, updated_at = now() WHERE user_id = $2`,
          [promptContent, userId]
        );
        console.log(`[HistoryService] Sync ai_agent_config.prompt for user ${userId}`);
      } catch (syncErr) {
        console.error("[HistoryService] Failed to sync ai_agent_config:", syncErr);
      }
    }
    console.log(`[HistoryService] \u2705 Nova vers\xE3o v${nextVersion} salva (id: ${newVersion.id}, is_current: true, prompt length: ${promptContent.length})`);
    return newVersion;
  } catch (error) {
    console.error("[HistoryService] \u274C Erro ao salvar vers\xE3o:", error);
    return null;
  }
}
async function listarVersoes(userId, configType = "ai_agent_config", limite = 50) {
  try {
    const result = await pool.query(
      `SELECT * FROM prompt_versions 
       WHERE user_id = $1 AND config_type = $2 
       ORDER BY version_number DESC 
       LIMIT $3`,
      [userId, configType, limite]
    );
    return result.rows || [];
  } catch (error) {
    console.error("[HistoryService] Erro ao listar vers\xF5es:", error);
    return [];
  }
}
async function obterVersao(versionId) {
  try {
    const result = await pool.query(
      `SELECT * FROM prompt_versions WHERE id = $1`,
      [versionId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error("[HistoryService] Erro ao obter vers\xE3o:", error);
    return null;
  }
}
async function obterVersaoAtual(userId, configType = "ai_agent_config") {
  try {
    const result = await pool.query(
      `SELECT * FROM prompt_versions 
       WHERE user_id = $1 AND config_type = $2 AND is_current = true
       ORDER BY version_number DESC, created_at DESC
       LIMIT 1`,
      [userId, configType]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error("[HistoryService] Erro ao obter vers\xE3o atual:", error);
    return null;
  }
}
async function restaurarVersao(versionId, userId) {
  try {
    const versaoOriginal = await obterVersao(versionId);
    if (!versaoOriginal) {
      console.error("[HistoryService] Vers\xE3o n\xE3o encontrada:", versionId);
      return null;
    }
    const novaVersao = await salvarVersaoPrompt({
      userId,
      configType: versaoOriginal.config_type,
      promptContent: versaoOriginal.prompt_content,
      editSummary: `Restaurado da vers\xE3o ${versaoOriginal.version_number}`,
      editType: "restore",
      editDetails: [{ restored_from: versionId, original_version: versaoOriginal.version_number }]
    });
    return novaVersao;
  } catch (error) {
    console.error("[HistoryService] Erro ao restaurar vers\xE3o:", error);
    return null;
  }
}
async function salvarMensagemChat(params) {
  const {
    userId,
    configType = "ai_agent_config",
    role,
    content,
    versionId = null,
    metadata = {}
  } = params;
  try {
    const result = await pool.query(
      `INSERT INTO prompt_edit_chat (
        user_id, config_type, role, content, version_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [userId, configType, role, content, versionId, JSON.stringify(metadata)]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error("[HistoryService] Erro ao salvar mensagem de chat:", error);
    return null;
  }
}
async function listarChatHistory(userId, configType = "ai_agent_config", limite = 100) {
  try {
    console.log(`[HistoryService] \u{1F4DC} Buscando chat history para user ${userId}, limite ${limite}`);
    const result = await pool.query(
      `SELECT * FROM (
         SELECT * FROM prompt_edit_chat 
         WHERE user_id = $1 AND config_type = $2 
         ORDER BY created_at DESC 
         LIMIT $3
       ) sub
       ORDER BY created_at ASC`,
      [userId, configType, limite]
    );
    console.log(`[HistoryService] \u2705 Retornando ${result.rows?.length || 0} mensagens`);
    if (result.rows?.length > 0) {
      console.log(`[HistoryService] Primeira: "${result.rows[0].content?.substring(0, 50)}..."`);
      console.log(`[HistoryService] \xDAltima: "${result.rows[result.rows.length - 1].content?.substring(0, 50)}..."`);
    }
    return result.rows || [];
  } catch (error) {
    console.error("[HistoryService] \u274C Erro ao listar chat:", error);
    return [];
  }
}
async function limparChatHistory(userId, configType = "ai_agent_config") {
  try {
    await pool.query(
      `DELETE FROM prompt_edit_chat WHERE user_id = $1 AND config_type = $2`,
      [userId, configType]
    );
    return true;
  } catch (error) {
    console.error("[HistoryService] Erro ao limpar chat:", error);
    return false;
  }
}
async function editarPromptComHistorico(userId, promptAtual, instrucaoUsuario, apiKey, configType = "ai_agent_config") {
  const mensagemUsuario = await salvarMensagemChat({
    userId,
    configType,
    role: "user",
    content: instrucaoUsuario
  });
  const resultado = await editarPromptViaIA(
    promptAtual,
    instrucaoUsuario,
    apiKey,
    "mistral"
  );
  let novaVersao = null;
  if (resultado.success && resultado.novoPrompt !== promptAtual) {
    novaVersao = await salvarVersaoPrompt({
      userId,
      configType,
      promptContent: resultado.novoPrompt,
      editSummary: resultado.mensagemChat,
      editType: "ia",
      editDetails: resultado.detalhes
    });
  }
  const mensagemAssistente = await salvarMensagemChat({
    userId,
    configType,
    role: "assistant",
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
export {
  editarPromptComHistorico,
  limparChatHistory,
  listarChatHistory,
  listarVersoes,
  obterVersao,
  obterVersaoAtual,
  restaurarVersao,
  salvarMensagemChat,
  salvarVersaoPrompt
};
