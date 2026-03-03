import {
  storage
} from "./chunk-JMMVYMYA.js";

// server/adminMediaStore.ts
var adminMediaCache = /* @__PURE__ */ new Map();
var lastCacheUpdate = /* @__PURE__ */ new Map();
var CACHE_TTL = 6e4;
async function reloadCache(adminId) {
  const now = Date.now();
  const cacheKey = adminId || "default";
  const lastUpdate = lastCacheUpdate.get(cacheKey) || 0;
  if (now - lastUpdate < CACHE_TTL && adminMediaCache.size > 0) {
    return;
  }
  try {
    const mediaList = await storage.getActiveAdminMedia();
    for (const media of mediaList) {
      adminMediaCache.set(media.id, {
        id: media.id,
        adminId: media.adminId,
        name: media.name,
        mediaType: media.mediaType,
        storageUrl: media.storageUrl,
        fileName: media.fileName || void 0,
        fileSize: media.fileSize || void 0,
        mimeType: media.mimeType || void 0,
        durationSeconds: media.durationSeconds || void 0,
        description: media.description,
        whenToUse: media.whenToUse || void 0,
        caption: media.caption || void 0,
        transcription: media.transcription || void 0,
        isActive: media.isActive,
        sendAlone: media.sendAlone,
        displayOrder: media.displayOrder,
        createdAt: media.createdAt?.toISOString() || (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    lastCacheUpdate.set(cacheKey, now);
    console.log(`\u{1F4C1} [AdminMediaStore] Cache recarregado: ${mediaList.length} m\xEDdias`);
  } catch (error) {
    console.error("\u{1F4C1} [AdminMediaStore] Erro ao recarregar cache:", error);
  }
}
async function getAdminMediaList(adminId) {
  await reloadCache(adminId);
  return Array.from(adminMediaCache.values()).filter((m) => m.isActive);
}
var getAdminMediaByName = async function(adminId, name) {
  await reloadCache(adminId);
  const normalizedName = name.toUpperCase().replace(/\s+/g, "_");
  const values = Array.from(adminMediaCache.values());
  for (const media of values) {
    if (media.name.toUpperCase() === normalizedName && media.isActive) {
      return media;
    }
  }
  return void 0;
};
async function getAdminMediasByPattern(adminId, pattern) {
  await reloadCache(adminId);
  const normalizedPattern = pattern.toUpperCase().replace(/\s+/g, "_");
  const results = [];
  const values = Array.from(adminMediaCache.values());
  for (const media of values) {
    if (media.adminId === adminId && media.isActive && media.name.toUpperCase().includes(normalizedPattern)) {
      results.push(media);
    }
  }
  return results;
}
async function addAdminMedia(media) {
  const saved = await storage.createAdminMedia(media);
  const adminMedia = {
    id: saved.id,
    adminId: saved.adminId,
    name: saved.name,
    mediaType: saved.mediaType,
    storageUrl: saved.storageUrl,
    fileName: saved.fileName || void 0,
    fileSize: saved.fileSize || void 0,
    mimeType: saved.mimeType || void 0,
    durationSeconds: saved.durationSeconds || void 0,
    description: saved.description,
    whenToUse: saved.whenToUse || void 0,
    caption: saved.caption || void 0,
    transcription: saved.transcription || void 0,
    isActive: saved.isActive,
    sendAlone: saved.sendAlone,
    displayOrder: saved.displayOrder,
    createdAt: saved.createdAt?.toISOString() || (/* @__PURE__ */ new Date()).toISOString()
  };
  adminMediaCache.set(saved.id, adminMedia);
  lastCacheUpdate.set(media.adminId, Date.now());
  console.log(`\u{1F4C1} [AdminMediaStore] M\xEDdia adicionada ao banco: ${media.name} (${media.mediaType})`);
  return adminMedia;
}
async function updateAdminMedia(id, updates) {
  const saved = await storage.updateAdminMedia(id, updates);
  if (!saved) return null;
  const adminMedia = {
    id: saved.id,
    adminId: saved.adminId,
    name: saved.name,
    mediaType: saved.mediaType,
    storageUrl: saved.storageUrl,
    fileName: saved.fileName || void 0,
    fileSize: saved.fileSize || void 0,
    mimeType: saved.mimeType || void 0,
    durationSeconds: saved.durationSeconds || void 0,
    description: saved.description,
    whenToUse: saved.whenToUse || void 0,
    caption: saved.caption || void 0,
    transcription: saved.transcription || void 0,
    isActive: saved.isActive,
    sendAlone: saved.sendAlone,
    displayOrder: saved.displayOrder,
    createdAt: saved.createdAt?.toISOString() || (/* @__PURE__ */ new Date()).toISOString()
  };
  adminMediaCache.set(id, adminMedia);
  if (saved.adminId) {
    lastCacheUpdate.set(saved.adminId, Date.now());
  }
  return adminMedia;
}
async function deleteAdminMedia(id, adminId) {
  const success = await storage.deleteAdminMedia(id);
  if (success) {
    adminMediaCache.delete(id);
    lastCacheUpdate.set(adminId, Date.now());
  }
  return success;
}
async function hasAdminMedia(id, adminId) {
  if (adminMediaCache.has(id)) return true;
  const media = await storage.getAdminMediaById(id);
  if (media) {
    const adminMedia = {
      id: media.id,
      adminId: media.adminId,
      name: media.name,
      mediaType: media.mediaType,
      storageUrl: media.storageUrl,
      fileName: media.fileName || void 0,
      fileSize: media.fileSize || void 0,
      mimeType: media.mimeType || void 0,
      durationSeconds: media.durationSeconds || void 0,
      description: media.description,
      whenToUse: media.whenToUse || void 0,
      caption: media.caption || void 0,
      transcription: media.transcription || void 0,
      isActive: media.isActive,
      sendAlone: media.sendAlone,
      displayOrder: media.displayOrder,
      createdAt: media.createdAt?.toISOString() || (/* @__PURE__ */ new Date()).toISOString()
    };
    adminMediaCache.set(id, adminMedia);
    return true;
  }
  return false;
}
async function getAdminMediaById(id) {
  if (adminMediaCache.has(id)) {
    return adminMediaCache.get(id);
  }
  const media = await storage.getAdminMediaById(id);
  if (!media) return void 0;
  const adminMedia = {
    id: media.id,
    adminId: media.adminId,
    name: media.name,
    mediaType: media.mediaType,
    storageUrl: media.storageUrl,
    fileName: media.fileName || void 0,
    fileSize: media.fileSize || void 0,
    mimeType: media.mimeType || void 0,
    durationSeconds: media.durationSeconds || void 0,
    description: media.description,
    whenToUse: media.whenToUse || void 0,
    caption: media.caption || void 0,
    transcription: media.transcription || void 0,
    isActive: media.isActive,
    sendAlone: media.sendAlone,
    displayOrder: media.displayOrder,
    createdAt: media.createdAt?.toISOString() || (/* @__PURE__ */ new Date()).toISOString()
  };
  adminMediaCache.set(id, adminMedia);
  return adminMedia;
}
function getAdminMediaCount() {
  return adminMediaCache.size;
}
async function forceReloadCache(adminId) {
  lastCacheUpdate.delete(adminId);
  await reloadCache(adminId);
}
var defaultTriggers = [
  { keywords: ["como funciona", "funciona assim", "deixa eu explicar", "vou te explicar", "te explico", "vale a pena"], mediaName: "COMO_FUNCIONA" },
  { keywords: ["v\xEDdeo", "demonstra", "ver na pr\xE1tica", "te mostro"], mediaName: "VIDEO_DEMONSTRACAO" },
  { keywords: ["pre\xE7o", "quanto custa", "valor", "investimento", "tabela"], mediaName: "TABELA_PRECOS" },
  { keywords: ["contrato", "termos", "documento"], mediaName: "PDF_CONTRATO" }
];
async function getActiveTriggers(adminId) {
  const mediaList = await getAdminMediaList(adminId);
  const allMediaNames = mediaList.map((m) => m.name);
  return defaultTriggers.filter((t) => allMediaNames.includes(t.mediaName));
}
async function getSmartTriggers(adminId) {
  const mediaList = await getAdminMediaList(adminId);
  const triggers = [];
  for (const media of mediaList) {
    if (media.whenToUse && media.whenToUse.length > 3) {
      const instructionStartWords = [
        "quando",
        "se",
        "caso",
        "ao",
        "para",
        "em",
        "nos",
        "nas",
        "no",
        "na",
        "o",
        "a",
        "os",
        "as",
        "um",
        "uma",
        "uns",
        "umas",
        "cliente",
        "usuario",
        "pessoa",
        "lead",
        "perguntar",
        "falar",
        "disser",
        "solicitar",
        "questionar",
        "pedir",
        "quiser",
        "sobre",
        "que",
        "como",
        "informar",
        "ver",
        "saber",
        "onde"
      ];
      const rawPhrases = media.whenToUse.toLowerCase().split(/[,;.]+/);
      for (let rawPhrase of rawPhrases) {
        let cleanPhrase = rawPhrase.trim();
        if (cleanPhrase.length < 2) continue;
        let changed2 = true;
        while (changed2 && cleanPhrase.length > 0) {
          changed2 = false;
          const firstWord = cleanPhrase.split(" ")[0];
          if (instructionStartWords.includes(firstWord)) {
            cleanPhrase = cleanPhrase.substring(firstWord.length).trim();
            changed2 = true;
          }
        }
        cleanPhrase = cleanPhrase.replace(/[^\w\sà-úÀ-Ú\-]/g, "").trim();
        if (cleanPhrase.length > 2) {
          const existing = triggers.find((t) => t.mediaName === media.name);
          if (existing) {
            if (!existing.keywords.includes(cleanPhrase)) {
              existing.keywords.push(cleanPhrase);
            }
          } else {
            triggers.push({
              keywords: [cleanPhrase],
              mediaName: media.name
            });
          }
        }
      }
      let fullText = media.whenToUse.toLowerCase().trim();
      let changed = true;
      while (changed && fullText.length > 0) {
        changed = false;
        const firstWord = fullText.split(" ")[0];
        if (instructionStartWords.includes(firstWord)) {
          fullText = fullText.substring(firstWord.length).trim();
          changed = true;
        }
      }
      if (fullText.length > 5) {
        const existing = triggers.find((t) => t.mediaName === media.name);
        if (existing && !existing.keywords.includes(fullText)) {
          existing.keywords.push(fullText);
        }
      }
    }
  }
  console.log(
    "\u{1F50D} [AdminMediaStore] DYNAMIC TRIGGERS GENERATED:",
    triggers.map((t) => `${t.mediaName}: [${t.keywords.join(", ")}]`).join(" | ")
  );
  const activeDefaultTriggers = await getActiveTriggers(adminId);
  for (const dt of activeDefaultTriggers) {
    const existing = triggers.find((t) => t.mediaName === dt.mediaName);
    if (existing) {
      existing.keywords.push(...dt.keywords);
    } else {
      triggers.push(dt);
    }
  }
  return triggers;
}
var generateAdminMediaPromptBlock = async function(adminId) {
  const mediaList = await getAdminMediaList(adminId);
  if (mediaList.length === 0) {
    return "";
  }
  const activeTriggers = await getSmartTriggers(adminId);
  let mediaBlock = `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u{1F4C1} M\xCDDIAS DISPON\xCDVEIS E REGRAS DE ENVIO
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
`;
  if (activeTriggers.length > 0) {
    mediaBlock += `
\u{1F6A8} GATILHOS OBRIGAT\xD3RIOS (Se falar isso, TEM que enviar a m\xEDdia):
`;
    for (const trigger of activeTriggers) {
      mediaBlock += `\u2022 Se falar "${trigger.keywords[0]}" ou similar \u2192 Use [ENVIAR_MIDIA:${trigger.mediaName}]
`;
    }
  }
  mediaBlock += `
\u{1F4CB} LISTA COMPLETA DE M\xCDDIAS (Use quando o contexto pedir):
`;
  for (const media of mediaList) {
    const tipo = media.mediaType === "audio" ? "\u{1F3A4} \xC1UDIO" : media.mediaType === "video" ? "\u{1F3A5} V\xCDDEO" : media.mediaType === "image" ? "\u{1F5BC}\uFE0F IMAGEM" : "\u{1F4C4} DOC";
    mediaBlock += `
${tipo}: ${media.name}
   \u{1F4DD} Descri\xE7\xE3o: ${media.description || "Sem descri\xE7\xE3o"}
   \u{1F3AF} Quando usar: ${media.whenToUse || "Quando relevante"}
   \u{1F449} Tag para enviar: [ENVIAR_MIDIA:${media.name}]
`;
  }
  mediaBlock += `
\u26A0\uFE0F REGRA CR\xCDTICA DE ENVIO:
Analise o campo "Quando usar" de cada m\xEDdia. Se a mensagem do usu\xE1rio corresponder \xE0 situa\xE7\xE3o descrita, VOC\xCA DEVE ENVIAR A M\xCDDIA.
N\xE3o ignore esta instru\xE7\xE3o. Se o usu\xE1rio perguntar algo que bate com "Quando usar", envie a tag [ENVIAR_MIDIA:NOME].
`;
  return mediaBlock;
};
var parseAdminMediaTags = function(responseText) {
  const mediaTagRegex = /\[ENVIAR_MIDIA:\s*([A-Z0-9_]+)\s*\]/gi;
  const mediaActions = [];
  let match;
  while ((match = mediaTagRegex.exec(responseText)) !== null) {
    const mediaName = match[1].toUpperCase().trim();
    mediaActions.push({
      type: "send_media",
      media_name: mediaName
    });
    console.log(`\u{1F4C1} [AdminMediaStore] Tag de m\xEDdia detectada: ${mediaName}`);
  }
  const cleanText = responseText.replace(/\[ENVIAR_MIDIA:\s*[A-Z0-9_]+\s*\]/gi, "").trim();
  return { cleanText, mediaActions };
};
function setMockAdminMediaStore(mocks) {
  if (mocks.generateAdminMediaPromptBlock) generateAdminMediaPromptBlock = mocks.generateAdminMediaPromptBlock;
  if (mocks.getAdminMediaByName) getAdminMediaByName = mocks.getAdminMediaByName;
  if (mocks.parseAdminMediaTags) parseAdminMediaTags = mocks.parseAdminMediaTags;
}

export {
  getAdminMediaList,
  getAdminMediaByName,
  getAdminMediasByPattern,
  addAdminMedia,
  updateAdminMedia,
  deleteAdminMedia,
  hasAdminMedia,
  getAdminMediaById,
  getAdminMediaCount,
  forceReloadCache,
  defaultTriggers,
  getActiveTriggers,
  getSmartTriggers,
  generateAdminMediaPromptBlock,
  parseAdminMediaTags,
  setMockAdminMediaStore
};
