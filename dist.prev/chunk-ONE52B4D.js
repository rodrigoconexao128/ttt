// server/antiBanProtectionService.ts
var ANTI_BAN_CONFIG = {
  // ═══════════════════════════════════════════════════════════════════════════
  // DELAYS ENTRE MENSAGENS (valores realistas - 5 a 15 segundos)
  // ═══════════════════════════════════════════════════════════════════════════
  MIN_DELAY_MS: 5e3,
  // 5 segundos mínimo
  MAX_DELAY_MS: 15e3,
  // 15 segundos máximo
  // Delay após mensagem manual do DONO
  OWNER_MESSAGE_DELAY_MS: 5e3,
  // 5 segundos após dono enviar manualmente
  // ═══════════════════════════════════════════════════════════════════════════
  // SISTEMA DE LOTES - Pausa após 10 mensagens consecutivas
  // ═══════════════════════════════════════════════════════════════════════════
  BATCH_SIZE: 10,
  // Após 10 envios consecutivos
  BATCH_PAUSE_MS: 6e4,
  // Pausa de 1 MINUTO (60 segundos)
  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITANDO (typing indicator) - Simula digitação antes de enviar
  // ═══════════════════════════════════════════════════════════════════════════
  TYPING_ENABLED: true,
  // Habilitar simulação de digitação
  TYPING_MIN_MS: 1500,
  // 1.5 segundos mínimo digitando
  TYPING_MAX_MS: 4e3,
  // 4 segundos máximo digitando
  TYPING_CHARS_PER_SECOND: 35
  // Velocidade simulada de digitação
};
var AntiBanProtectionService = class {
  channelStats = /* @__PURE__ */ new Map();
  constructor() {
    console.log("\u{1F6E1}\uFE0F [ANTI-BAN v5.0] Sistema SIMPLIFICADO inicializado");
    console.log(`   \u{1F4CA} Delay entre msgs: ${ANTI_BAN_CONFIG.MIN_DELAY_MS / 1e3}-${ANTI_BAN_CONFIG.MAX_DELAY_MS / 1e3}s`);
    console.log(`   \u{1F4CA} Ap\xF3s msg do dono: +${ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS / 1e3}s`);
    console.log(`   \u{1F4CA} Lote: ${ANTI_BAN_CONFIG.BATCH_SIZE} msgs \u2192 pausa ${ANTI_BAN_CONFIG.BATCH_PAUSE_MS / 1e3}s`);
  }
  // ═══════════════════════════════════════════════════════════════════════════
  //  OBTER STATS DO CANAL
  // ═══════════════════════════════════════════════════════════════════════════
  getChannelStats(userId) {
    if (!this.channelStats.has(userId)) {
      this.channelStats.set(userId, {
        userId,
        consecutiveMessages: 0,
        lastMessageAt: 0,
        lastOwnerMessageAt: 0,
        lastOwnerMessageContact: null,
        isPaused: false,
        pauseEndAt: 0
      });
    }
    return this.channelStats.get(userId);
  }
  // ═══════════════════════════════════════════════════════════════════════════
  //  REGISTRAR MENSAGEM MANUAL DO DONO
  // ═══════════════════════════════════════════════════════════════════════════
  registerOwnerManualMessage(userId, contactNumber, _messageType) {
    const stats = this.getChannelStats(userId);
    const now = Date.now();
    stats.lastOwnerMessageAt = now;
    stats.lastOwnerMessageContact = contactNumber;
    stats.consecutiveMessages = 0;
    console.log(`\u{1F6E1}\uFE0F [ANTI-BAN v5.0] \u{1F464} Mensagem MANUAL do DONO detectada`);
    console.log(`   \u{1F4F1} Contato: ${contactNumber}`);
    console.log(`   \u{1F504} Contador de lote reiniciado`);
  }
  // ═══════════════════════════════════════════════════════════════════════════
  //  CALCULAR DELAY ANTES DE ENVIAR
  // ═══════════════════════════════════════════════════════════════════════════
  calculateDelay(userId, contactNumber) {
    const stats = this.getChannelStats(userId);
    const now = Date.now();
    if (stats.isPaused && now < stats.pauseEndAt) {
      const remainingPause = stats.pauseEndAt - now;
      console.log(`\u{1F6E1}\uFE0F [ANTI-BAN v5.0] \u23F8\uFE0F Canal em PAUSA de lote por mais ${Math.ceil(remainingPause / 1e3)}s`);
      return remainingPause;
    } else if (stats.isPaused) {
      stats.isPaused = false;
      stats.consecutiveMessages = 0;
      console.log(`\u{1F6E1}\uFE0F [ANTI-BAN v5.0] \u25B6\uFE0F Pausa de lote FINALIZADA - retomando`);
    }
    let delay = this.randomBetween(
      ANTI_BAN_CONFIG.MIN_DELAY_MS,
      ANTI_BAN_CONFIG.MAX_DELAY_MS
    );
    const timeSinceOwnerMessage = now - stats.lastOwnerMessageAt;
    if (timeSinceOwnerMessage < ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS && stats.lastOwnerMessageContact === contactNumber) {
      const extraDelay = ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS - timeSinceOwnerMessage;
      delay += extraDelay;
      console.log(`\u{1F6E1}\uFE0F [ANTI-BAN v5.0] \u{1F464} Dono enviou msg h\xE1 ${Math.ceil(timeSinceOwnerMessage / 1e3)}s - delay extra: ${Math.ceil(extraDelay / 1e3)}s`);
    }
    const timeSinceLastMessage = now - stats.lastMessageAt;
    if (timeSinceLastMessage < delay) {
      delay = Math.max(delay - timeSinceLastMessage, ANTI_BAN_CONFIG.MIN_DELAY_MS);
    }
    return delay;
  }
  // ═══════════════════════════════════════════════════════════════════════════
  //  REGISTRAR ENVIO DE MENSAGEM
  // ═══════════════════════════════════════════════════════════════════════════
  registerMessageSent(userId, contactNumber) {
    const stats = this.getChannelStats(userId);
    const now = Date.now();
    stats.lastMessageAt = now;
    stats.consecutiveMessages++;
    if (stats.consecutiveMessages >= ANTI_BAN_CONFIG.BATCH_SIZE) {
      stats.isPaused = true;
      stats.pauseEndAt = now + ANTI_BAN_CONFIG.BATCH_PAUSE_MS;
      console.log(`\u{1F6E1}\uFE0F [ANTI-BAN v5.0] \u{1F4E6} LOTE DE ${ANTI_BAN_CONFIG.BATCH_SIZE} MSGS ATINGIDO`);
      console.log(`   \u23F8\uFE0F Iniciando pausa de ${ANTI_BAN_CONFIG.BATCH_PAUSE_MS / 1e3} segundos (1 minuto)`);
      return {
        shouldPause: true,
        pauseDuration: ANTI_BAN_CONFIG.BATCH_PAUSE_MS
      };
    }
    console.log(`\u{1F6E1}\uFE0F [ANTI-BAN v5.0] \u2705 Msg enviada - Lote: ${stats.consecutiveMessages}/${ANTI_BAN_CONFIG.BATCH_SIZE}`);
    return { shouldPause: false, pauseDuration: 0 };
  }
  // ═══════════════════════════════════════════════════════════════════════════
  //  VERIFICAR SE PODE ENVIAR
  // ═══════════════════════════════════════════════════════════════════════════
  canSendMessage(userId) {
    const stats = this.getChannelStats(userId);
    const now = Date.now();
    if (stats.isPaused && now < stats.pauseEndAt) {
      const waitMs = stats.pauseEndAt - now;
      return {
        canSend: false,
        waitMs,
        reason: `Pausa de lote (${Math.ceil(waitMs / 1e3)}s restantes)`
      };
    }
    return { canSend: true, waitMs: 0, reason: "OK" };
  }
  // ═══════════════════════════════════════════════════════════════════════════
  //  CALCULAR DURAÇÃO DA DIGITAÇÃO
  // ═══════════════════════════════════════════════════════════════════════════
  calculateTypingDuration(messageLength) {
    const typingTime = messageLength / ANTI_BAN_CONFIG.TYPING_CHARS_PER_SECOND * 1e3;
    return Math.min(
      Math.max(typingTime, ANTI_BAN_CONFIG.TYPING_MIN_MS),
      ANTI_BAN_CONFIG.TYPING_MAX_MS
    );
  }
  // ═══════════════════════════════════════════════════════════════════════════
  //  UTILITÁRIOS
  // ═══════════════════════════════════════════════════════════════════════════
  randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  // ═══════════════════════════════════════════════════════════════════════════
  //  OBTER ESTATÍSTICAS
  // ═══════════════════════════════════════════════════════════════════════════
  getStats(userId) {
    const stats = this.getChannelStats(userId);
    const now = Date.now();
    return {
      consecutiveMessages: stats.consecutiveMessages,
      isPaused: stats.isPaused && now < stats.pauseEndAt,
      pauseRemainingMs: stats.isPaused ? Math.max(0, stats.pauseEndAt - now) : 0
    };
  }
  // Método para resetar contador (útil quando há interação do cliente)
  resetBatchCounter(userId) {
    const stats = this.getChannelStats(userId);
    stats.consecutiveMessages = 0;
    console.log(`\u{1F6E1}\uFE0F [ANTI-BAN v5.0] \u{1F504} Contador de lote resetado para ${userId.substring(0, 8)}...`);
  }
};
var GroupMetadataCache = class {
  cache = /* @__PURE__ */ new Map();
  TTL_MS = 30 * 60 * 1e3;
  // 30 minutos
  set(groupId, metadata) {
    this.cache.set(groupId, {
      ...metadata,
      fetchedAt: Date.now()
    });
    console.log(`\u{1F4E6} [GROUP-CACHE] Metadados cacheados para grupo ${groupId.substring(0, 20)}...`);
  }
  get(groupId) {
    const cached = this.cache.get(groupId);
    if (!cached) return null;
    if (Date.now() - cached.fetchedAt > this.TTL_MS) {
      this.cache.delete(groupId);
      return null;
    }
    return cached;
  }
  has(groupId) {
    const cached = this.get(groupId);
    return cached !== null;
  }
  delete(groupId) {
    this.cache.delete(groupId);
  }
  clear() {
    this.cache.clear();
  }
  // Limpar entradas expiradas periodicamente
  cleanup() {
    const now = Date.now();
    const keysToDelete = [];
    this.cache.forEach((value, key) => {
      if (now - value.fetchedAt > this.TTL_MS) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => this.cache.delete(key));
  }
};
var groupMetadataCache = new GroupMetadataCache();
setInterval(() => groupMetadataCache.cleanup(), 10 * 60 * 1e3);
async function simulateTyping(socket, jid, messageLength = 100) {
  if (!ANTI_BAN_CONFIG.TYPING_ENABLED || !socket) return;
  try {
    const duration = antiBanProtectionService.calculateTypingDuration(messageLength);
    await socket.sendPresenceUpdate("composing", jid);
    await new Promise((resolve) => setTimeout(resolve, duration));
    await socket.sendPresenceUpdate("paused", jid);
    console.log(`\u2328\uFE0F [TYPING] Simula\xE7\xE3o de digita\xE7\xE3o: ${Math.ceil(duration / 1e3)}s para ${jid.substring(0, 15)}...`);
  } catch (error) {
    console.warn(`\u26A0\uFE0F [TYPING] Erro ao simular digita\xE7\xE3o:`, error);
  }
}
var antiBanProtectionService = new AntiBanProtectionService();

// server/centralizedMessageSender.ts
var USE_POLLS_FOR_BUTTONS = false;
var SEND_CONTEXT_BEFORE_POLL = false;
var pollMappings = /* @__PURE__ */ new Map();
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1e3;
  const entries = Array.from(pollMappings.entries());
  for (const [msgId, mapping] of entries) {
    if (mapping.createdAt < oneHourAgo) {
      pollMappings.delete(msgId);
    }
  }
}, 10 * 60 * 1e3);
function getPollMapping(pollMsgId) {
  return pollMappings.get(pollMsgId);
}
function getButtonIdFromPollVote(pollMsgId, votedText) {
  const mapping = pollMappings.get(pollMsgId);
  if (!mapping) return null;
  const button = mapping.buttons.find((btn) => {
    const btnTitle = btn.reply?.title || btn.title || "";
    return btnTitle.toLowerCase() === votedText.toLowerCase();
  });
  if (button) {
    return button.reply?.id || button.id || votedText;
  }
  return votedText;
}
var CentralizedMessageSender = class {
  stats = /* @__PURE__ */ new Map();
  processing = /* @__PURE__ */ new Map();
  queues = /* @__PURE__ */ new Map();
  constructor() {
    console.log("\u{1F680} [CENTRALIZED-SENDER v3.0] Sistema com ENQUETES inicializado");
    console.log(`   \u{1F5F3}\uFE0F Polls: ${USE_POLLS_FOR_BUTTONS ? "ATIVADO" : "DESATIVADO"}`);
    console.log(`   \u23F1\uFE0F Delays: ${ANTI_BAN_CONFIG.MIN_DELAY_MS / 1e3}s - ${ANTI_BAN_CONFIG.MAX_DELAY_MS / 1e3}s`);
    console.log(`   \u2328\uFE0F Typing: ${ANTI_BAN_CONFIG.TYPING_ENABLED ? "ATIVADO" : "DESATIVADO"}`);
    console.log(`   \u{1F4E6} Batch: ${ANTI_BAN_CONFIG.BATCH_SIZE} msgs, pausa ${ANTI_BAN_CONFIG.BATCH_PAUSE_MS / 1e3}s`);
  }
  // ═══════════════════════════════════════════════════════════════════════════
  //  🗳️ REGISTRO DE POLL MAPPING
  // ═══════════════════════════════════════════════════════════════════════════
  registerPollMapping(pollMsgId, jid, buttons) {
    pollMappings.set(pollMsgId, {
      pollMsgId,
      jid,
      buttons,
      createdAt: Date.now()
    });
    console.log(`\u{1F5F3}\uFE0F [POLL-MAPPING] Registrado poll ${pollMsgId.substring(0, 10)}... com ${buttons.length} op\xE7\xF5es`);
  }
  // ═══════════════════════════════════════════════════════════════════════════
  //  📤 MÉTODO PRINCIPAL DE ENVIO
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Envia uma mensagem através do sistema anti-ban
   * ESTE É O ÚNICO MÉTODO QUE DEVE SER USADO PARA ENVIAR MENSAGENS
   */
  async sendMessage(options) {
    const { userId, jid, content, socket, origin, priority = "normal" } = options;
    if (!socket) {
      console.error(`\u274C [CENTRALIZED-SENDER] Socket n\xE3o fornecido para ${origin}`);
      return { success: false, error: "Socket n\xE3o dispon\xEDvel" };
    }
    if (!jid) {
      console.error(`\u274C [CENTRALIZED-SENDER] JID n\xE3o fornecido para ${origin}`);
      return { success: false, error: "JID n\xE3o fornecido" };
    }
    console.log(`\u{1F4E5} [CENTRALIZED-SENDER] Nova mensagem de [${origin}] para ${jid.substring(0, 15)}...`);
    if (options.isOwnerInitiated || priority === "urgent") {
      return this.sendImmediateWithMinimalDelay(options);
    }
    return this.enqueueAndProcess(options);
  }
  // ═══════════════════════════════════════════════════════════════════════════
  //  🔥 ENVIO IMEDIATO (para mensagens do dono)
  // ═══════════════════════════════════════════════════════════════════════════
  async sendImmediateWithMinimalDelay(options) {
    const { userId, jid, content, socket, origin, quotedMessage, skipTyping } = options;
    try {
      const delay = ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS;
      console.log(`\u26A1 [CENTRALIZED-SENDER] Envio priorit\xE1rio de [${origin}] - delay ${delay / 1e3}s`);
      if (!skipTyping && ANTI_BAN_CONFIG.TYPING_ENABLED) {
        await simulateTyping(socket, jid, this.getMessageLength(content));
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      const result = await socket.sendMessage(jid, content, {
        quoted: quotedMessage
      });
      this.recordSent(userId, origin, true);
      return {
        success: true,
        messageId: result?.key?.id || void 0,
        waitedMs: delay
      };
    } catch (error) {
      console.error(`\u274C [CENTRALIZED-SENDER] Erro no envio priorit\xE1rio:`, error);
      this.recordSent(userId, origin, false);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido"
      };
    }
  }
  // ═══════════════════════════════════════════════════════════════════════════
  //  📋 SISTEMA DE FILA
  // ═══════════════════════════════════════════════════════════════════════════
  async enqueueAndProcess(options) {
    const { userId } = options;
    return new Promise((resolve) => {
      if (!this.queues.has(userId)) {
        this.queues.set(userId, []);
      }
      const queue = this.queues.get(userId);
      queue.push({
        options,
        resolve,
        queuedAt: Date.now()
      });
      console.log(`\u{1F4CB} [CENTRALIZED-SENDER] Mensagem enfileirada. Fila de ${userId.substring(0, 8)}: ${queue.length} msgs`);
      if (!this.processing.get(userId)) {
        this.processQueue(userId);
      }
    });
  }
  async processQueue(userId) {
    if (this.processing.get(userId)) return;
    this.processing.set(userId, true);
    const queue = this.queues.get(userId) || [];
    console.log(`\u{1F504} [CENTRALIZED-SENDER] Iniciando processamento da fila de ${userId.substring(0, 8)}...`);
    while (queue.length > 0) {
      const item = queue.shift();
      const { options, resolve } = item;
      const { jid, content, socket, origin, quotedMessage, skipTyping } = options;
      try {
        const contactNumber = jid.replace("@s.whatsapp.net", "").replace("@g.us", "");
        const delay = antiBanProtectionService.calculateDelay(userId, contactNumber);
        console.log(`\u23F1\uFE0F [CENTRALIZED-SENDER] Aguardando ${Math.ceil(delay / 1e3)}s antes de enviar [${origin}]...`);
        if (!skipTyping && ANTI_BAN_CONFIG.TYPING_ENABLED) {
          await simulateTyping(socket, jid, this.getMessageLength(content));
        }
        await new Promise((r) => setTimeout(r, delay));
        const result = await socket.sendMessage(jid, content, {
          quoted: quotedMessage
        });
        antiBanProtectionService.registerMessageSent(userId, contactNumber);
        this.recordSent(userId, origin, true);
        console.log(`\u2705 [CENTRALIZED-SENDER] Mensagem enviada [${origin}] \u2192 ${jid.substring(0, 15)}...`);
        resolve({
          success: true,
          messageId: result?.key?.id || void 0,
          waitedMs: delay
        });
      } catch (error) {
        console.error(`\u274C [CENTRALIZED-SENDER] Erro ao enviar [${origin}]:`, error);
        this.recordSent(userId, origin, false);
        resolve({
          success: false,
          error: error instanceof Error ? error.message : "Erro desconhecido"
        });
      }
    }
    this.processing.set(userId, false);
    console.log(`\u2705 [CENTRALIZED-SENDER] Fila de ${userId.substring(0, 8)} processada`);
  }
  // ═══════════════════════════════════════════════════════════════════════════
  //  🛠️ MÉTODOS AUXILIARES
  // ═══════════════════════════════════════════════════════════════════════════
  isGroupJid(jid) {
    return jid.endsWith("@g.us");
  }
  getMessageLength(content) {
    if ("text" in content && typeof content.text === "string") {
      return content.text.length;
    }
    if ("caption" in content && typeof content.caption === "string") {
      return content.caption.length;
    }
    return 100;
  }
  recordSent(userId, origin, success) {
    if (!this.stats.has(userId)) {
      this.stats.set(userId, {
        totalSent: 0,
        totalFailed: 0,
        byOrigin: {},
        lastSentAt: 0
      });
    }
    const stats = this.stats.get(userId);
    if (success) {
      stats.totalSent++;
    } else {
      stats.totalFailed++;
    }
    stats.byOrigin[origin] = (stats.byOrigin[origin] || 0) + 1;
    stats.lastSentAt = Date.now();
  }
  // ═══════════════════════════════════════════════════════════════════════════
  //  📊 ESTATÍSTICAS
  // ═══════════════════════════════════════════════════════════════════════════
  getStats(userId) {
    return this.stats.get(userId) || null;
  }
  getQueueSize(userId) {
    return this.queues.get(userId)?.length || 0;
  }
  // ═══════════════════════════════════════════════════════════════════════════
  //  ⚡ MÉTODOS DE CONVENIÊNCIA
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Envia mensagem de texto
   */
  async sendText(userId, jid, text, socket, origin, options) {
    return this.sendMessage({
      userId,
      jid,
      content: { text },
      socket,
      origin,
      ...options
    });
  }
  /**
   * Envia imagem
   */
  async sendImage(userId, jid, image, caption, socket, origin, options) {
    const content = typeof image === "string" ? { image: { url: image }, caption } : { image, caption };
    return this.sendMessage({
      userId,
      jid,
      content,
      socket,
      origin,
      ...options
    });
  }
  /**
   * Envia vídeo
   */
  async sendVideo(userId, jid, video, caption, socket, origin, options) {
    const content = typeof video === "string" ? { video: { url: video }, caption } : { video, caption };
    return this.sendMessage({
      userId,
      jid,
      content,
      socket,
      origin,
      ...options
    });
  }
  /**
   * Envia áudio
   */
  async sendAudio(userId, jid, audio, ptt, socket, origin, options) {
    const content = typeof audio === "string" ? { audio: { url: audio }, ptt } : { audio, ptt };
    return this.sendMessage({
      userId,
      jid,
      content,
      socket,
      origin,
      ...options
    });
  }
  /**
   * Envia documento
   */
  async sendDocument(userId, jid, document, filename, mimetype, socket, origin, options) {
    const content = typeof document === "string" ? { document: { url: document }, fileName: filename, mimetype } : { document, fileName: filename, mimetype };
    return this.sendMessage({
      userId,
      jid,
      content,
      socket,
      origin,
      ...options
    });
  }
  /**
   * Envia botões usando ENQUETES (polls) do WhatsApp
   * @param payload - Pode ser objeto completo {body, buttons, header?, footer?} ou text simples
   * 
   * v3.0: Usa ENQUETES para simular botões interativos
   * FUNCIONA EM TODOS OS DISPOSITIVOS (Android, iOS, Web)
   */
  async sendButtons(userId, jid, payload, socket, origin, options) {
    if (typeof payload === "string") {
      return this.sendMessage({
        userId,
        jid,
        content: { text: payload },
        socket,
        origin,
        ...options
      });
    }
    if (!payload.body || !payload.buttons?.length) {
      return this.sendMessage({
        userId,
        jid,
        content: payload,
        socket,
        origin,
        ...options
      });
    }
    if (USE_POLLS_FOR_BUTTONS) {
      try {
        console.log(`\u{1F5F3}\uFE0F [POLL-BUTTONS] Enviando ${payload.buttons.length} op\xE7\xF5es como enquete para ${jid.substring(0, 15)}...`);
        if (SEND_CONTEXT_BEFORE_POLL) {
          let contextText = payload.body;
          if (payload.footer?.text) {
            contextText += `

${payload.footer.text}`;
          }
          const contactNumber = jid.replace(/@.*$/, "");
          const canSendResult = antiBanProtectionService.canSendMessage(userId);
          if (canSendResult.canSend) {
            const delay = antiBanProtectionService.calculateDelay(userId, contactNumber);
            await new Promise((r) => setTimeout(r, delay));
            await socket.sendMessage(jid, { text: contextText });
            antiBanProtectionService.registerMessageSent(userId, contactNumber);
            console.log(`\u{1F4DD} [POLL-BUTTONS] Texto de contexto enviado`);
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        const pollOptions = payload.buttons.map(
          (btn) => btn.reply?.title || btn.title || `Op\xE7\xE3o`
        );
        const pollName = payload.header?.text || "Selecione uma op\xE7\xE3o:";
        const pollResult = await socket.sendMessage(jid, {
          poll: {
            name: pollName,
            values: pollOptions,
            selectableCount: 1
            // Usuário só pode votar em UMA opção
          }
        });
        console.log(`\u2705 [POLL-BUTTONS] Enquete enviada com sucesso! ID: ${pollResult?.key?.id}`);
        if (pollResult?.key?.id) {
          this.registerPollMapping(pollResult.key.id, jid, payload.buttons);
        }
        this.recordSent(userId, origin, true);
        return {
          success: true,
          messageId: pollResult?.key?.id || void 0,
          waitedMs: 500
        };
      } catch (pollError) {
        console.error(`\u26A0\uFE0F [POLL-BUTTONS] Falha ao enviar enquete, usando fallback texto:`, pollError);
      }
    }
    let formattedText = payload.body;
    if (payload.footer?.text) {
      formattedText += `

${payload.footer.text}`;
    }
    if (payload.buttons && payload.buttons.length > 0) {
      formattedText += "\n\n*\u{1F4CB} Escolha uma op\xE7\xE3o:*\n";
      payload.buttons.forEach((btn, index) => {
        const number = index + 1;
        const title = btn.reply?.title || btn.title || `Op\xE7\xE3o ${number}`;
        formattedText += `
*${number}.* ${title}`;
      });
      formattedText += "\n\n_\u{1F446} Digite o n\xFAmero ou escreva sua escolha_";
    }
    console.log(`\u{1F522} [MENU-NUMERICO] Enviando ${payload.buttons?.length || 0} op\xE7\xF5es como texto numerado`);
    const content = { text: formattedText };
    console.log(`\u{1F4F1} [BUTTONS\u2192TEXT] Enviando ${payload.buttons?.length || 0} bot\xF5es como texto para ${jid.substring(0, 15)}...`);
    return this.sendMessage({
      userId,
      jid,
      content,
      socket,
      origin,
      ...options
    });
  }
  /**
   * Envia lista usando ENQUETES (polls) do WhatsApp
   * @param payload - Pode ser objeto completo {body, buttonText, sections, header?, footer?} ou text simples
   * 
   * v3.0: Usa ENQUETES para simular listas interativas
   * FUNCIONA EM TODOS OS DISPOSITIVOS (Android, iOS, Web)
   */
  async sendList(userId, jid, payload, socket, origin, options) {
    if (typeof payload === "string") {
      return this.sendMessage({
        userId,
        jid,
        content: { text: payload },
        socket,
        origin,
        ...options
      });
    }
    if (!payload.body || !payload.sections?.length) {
      return this.sendMessage({
        userId,
        jid,
        content: payload,
        socket,
        origin,
        ...options
      });
    }
    if (USE_POLLS_FOR_BUTTONS) {
      try {
        const totalItems2 = payload.sections.reduce((acc, s) => acc + (s.rows?.length || 0), 0);
        console.log(`\u{1F5F3}\uFE0F [POLL-LIST] Enviando lista com ${totalItems2} itens como enquete para ${jid.substring(0, 15)}...`);
        if (SEND_CONTEXT_BEFORE_POLL) {
          let contextText = payload.body;
          if (payload.footer?.text) {
            contextText += `

${payload.footer.text}`;
          }
          const contactNumber = jid.replace(/@.*$/, "");
          const canSendResult = antiBanProtectionService.canSendMessage(userId);
          if (canSendResult.canSend) {
            const delay = antiBanProtectionService.calculateDelay(userId, contactNumber);
            await new Promise((r) => setTimeout(r, delay));
            await socket.sendMessage(jid, { text: contextText });
            antiBanProtectionService.registerMessageSent(userId, contactNumber);
            console.log(`\u{1F4DD} [POLL-LIST] Texto de contexto enviado`);
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        const allItems = [];
        const buttonMappings = [];
        for (const section of payload.sections) {
          for (const row of section.rows || []) {
            allItems.push(row.title || "Op\xE7\xE3o");
            buttonMappings.push({
              reply: { id: row.id, title: row.title },
              id: row.id,
              title: row.title
            });
          }
        }
        const pollOptions = allItems.slice(0, 12);
        const limitedMappings = buttonMappings.slice(0, 12);
        const pollName = payload.header?.text || payload.buttonText || "Selecione uma op\xE7\xE3o:";
        const pollResult = await socket.sendMessage(jid, {
          poll: {
            name: pollName,
            values: pollOptions,
            selectableCount: 1
            // Usuário só pode votar em UMA opção
          }
        });
        console.log(`\u2705 [POLL-LIST] Enquete enviada com sucesso! ID: ${pollResult?.key?.id}`);
        if (pollResult?.key?.id) {
          this.registerPollMapping(pollResult.key.id, jid, limitedMappings);
        }
        this.recordSent(userId, origin, true);
        return {
          success: true,
          messageId: pollResult?.key?.id || void 0,
          waitedMs: 500
        };
      } catch (pollError) {
        console.error(`\u26A0\uFE0F [POLL-LIST] Falha ao enviar enquete, usando fallback texto:`, pollError);
      }
    }
    let formattedText = payload.body;
    if (payload.footer?.text) {
      formattedText += `

${payload.footer.text}`;
    }
    if (payload.sections && payload.sections.length > 0) {
      let itemIndex = 1;
      payload.sections.forEach((section) => {
        if (section.title) {
          formattedText += `

*\u{1F4C2} ${section.title}*`;
        }
        if (section.rows && section.rows.length > 0) {
          section.rows.forEach((row) => {
            formattedText += `
*${itemIndex}.* ${row.title}`;
            if (row.description) {
              formattedText += `
   _${row.description}_`;
            }
            itemIndex++;
          });
        }
      });
      formattedText += "\n\n_\u{1F446} Digite o n\xFAmero ou escreva sua escolha_";
    }
    const content = { text: formattedText };
    const totalItems = payload.sections?.reduce((acc, s) => acc + (s.rows?.length || 0), 0) || 0;
    console.log(`\u{1F4CB} [LIST\u2192TEXT] Enviando lista com ${totalItems} itens como texto para ${jid.substring(0, 15)}...`);
    return this.sendMessage({
      userId,
      jid,
      content,
      socket,
      origin,
      ...options
    });
  }
  /**
   * Reseta contador de batch (quando cliente interage)
   */
  resetBatchCounter(userId) {
    antiBanProtectionService.resetBatchCounter(userId);
  }
};
var centralizedMessageSender = new CentralizedMessageSender();
var centralizedMessageSender_default = centralizedMessageSender;

export {
  ANTI_BAN_CONFIG,
  antiBanProtectionService,
  getPollMapping,
  getButtonIdFromPollVote,
  centralizedMessageSender,
  centralizedMessageSender_default
};
