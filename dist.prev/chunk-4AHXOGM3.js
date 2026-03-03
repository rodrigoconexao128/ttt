import {
  generateAdminMediaPromptBlock,
  getAdminMediaByName,
  parseAdminMediaTags
} from "./chunk-R4EYQXKW.js";
import {
  insertAgentMedia
} from "./chunk-Y4YROZEV.js";
import {
  storage
} from "./chunk-C73JY6YP.js";
import {
  cancelFollowUp,
  followUpService,
  parseScheduleFromText,
  scheduleContact
} from "./chunk-SF4YSNRN.js";
import {
  getLLMClient,
  withRetryLLM
} from "./chunk-IC5GBZQZ.js";
import {
  analyzeImageForAdmin,
  analyzeImageWithMistral
} from "./chunk-H42QL47H.js";

// server/adminAgentService.ts
import { v4 as uuidv4 } from "uuid";

// server/adminDemoCaptureService.ts
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
var DEFAULT_MESSAGES = [
  "Oi, quero testar como voce atende meus clientes.",
  "Tambem preciso de agendamento e envio de cardapio.",
  "Mostra um exemplo de resposta para cliente indeciso."
];
var VIEWPORT = { width: 430, height: 920 };
var NAV_TIMEOUT_MS = 45e3;
var WAIT_BETWEEN_MESSAGES_MS = 3200;
var WAIT_AFTER_OPEN_MS = 4e3;
function safeSuffix(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "demo";
}
function buildPublicBaseUrl(preferredUrl) {
  const appUrl = (process.env.APP_URL || "").trim();
  if (appUrl) {
    return appUrl.replace(/\/+$/, "");
  }
  if (preferredUrl) {
    try {
      return new URL(preferredUrl).origin;
    } catch {
    }
  }
  return "https://agentezap.online";
}
function buildPublicUrl(relativePath, preferredUrl) {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${buildPublicBaseUrl(preferredUrl)}/${normalized}`;
}
async function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    await fsp.mkdir(dirPath, { recursive: true });
  }
}
async function waitForSimulatorInput(page) {
  const locator = page.locator('input[placeholder*="Digite uma mensagem"]');
  await locator.first().waitFor({ state: "visible", timeout: NAV_TIMEOUT_MS });
}
async function sendScenarioMessages(page, messages) {
  const input = page.locator('input[placeholder*="Digite uma mensagem"]').first();
  for (const message of messages) {
    await input.fill(message);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(WAIT_BETWEEN_MESSAGES_MS);
  }
}
async function generateSimulatorDemoCapture(options) {
  const includeScreenshot = options.includeScreenshot !== false;
  const includeVideo = options.includeVideo === true;
  if (!includeScreenshot && !includeVideo) {
    return { success: false, error: "Nenhum formato solicitado para demo" };
  }
  const uploadsRoot = path.join(process.cwd(), "uploads");
  const demoDir = path.join(uploadsRoot, "admin-demos");
  const videoTempDir = path.join(demoDir, "tmp-videos");
  await ensureDir(demoDir);
  await ensureDir(videoTempDir);
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const suffix = safeSuffix(options.simulatorLink.split("/").pop() || "demo");
  const screenshotFileName = `simulator-demo-${suffix}-${stamp}.png`;
  const screenshotAbsPath = path.join(demoDir, screenshotFileName);
  const videoFileName = `simulator-demo-${suffix}-${stamp}.webm`;
  const videoAbsPath = path.join(demoDir, videoFileName);
  let browser = null;
  let context = null;
  let page = null;
  let videoRef = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    context = await browser.newContext({
      viewport: VIEWPORT,
      ...includeVideo ? {
        recordVideo: {
          dir: videoTempDir,
          size: VIEWPORT
        }
      } : {}
    });
    page = await context.newPage();
    videoRef = page.video();
    await page.goto(options.simulatorLink, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS
    });
    await waitForSimulatorInput(page);
    await page.waitForTimeout(WAIT_AFTER_OPEN_MS);
    const messages = options.scenarioMessages && options.scenarioMessages.length > 0 ? options.scenarioMessages.slice(0, 4) : DEFAULT_MESSAGES;
    await sendScenarioMessages(page, messages);
    if (includeScreenshot) {
      await page.screenshot({ path: screenshotAbsPath, fullPage: false });
    }
    await context.close();
    let copiedVideo = false;
    if (includeVideo && videoRef) {
      try {
        const rawVideoPath = await videoRef.path();
        if (rawVideoPath && fs.existsSync(rawVideoPath)) {
          await fsp.copyFile(rawVideoPath, videoAbsPath);
          copiedVideo = true;
        }
      } catch (videoError) {
        console.error("[ADMIN DEMO] Falha ao materializar video:", videoError);
      }
    }
    const screenshotRelative = `uploads/admin-demos/${screenshotFileName}`;
    const videoRelative = `uploads/admin-demos/${videoFileName}`;
    return {
      success: true,
      screenshotPath: includeScreenshot ? screenshotAbsPath : void 0,
      screenshotUrl: includeScreenshot && fs.existsSync(screenshotAbsPath) ? buildPublicUrl(screenshotRelative, options.simulatorLink) : void 0,
      videoPath: copiedVideo ? videoAbsPath : void 0,
      videoUrl: copiedVideo ? buildPublicUrl(videoRelative, options.simulatorLink) : void 0
    };
  } catch (error) {
    console.error("[ADMIN DEMO] Erro ao gerar captura do simulador:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    try {
      if (context) {
        await context.close();
      }
    } catch {
    }
    try {
      if (browser) {
        await browser.close();
      }
    } catch {
    }
  }
}

// server/adminAgentService.ts
function mergeGeneratedDemoAssets(current, incoming) {
  if (!current && !incoming) return void 0;
  if (!current) return incoming;
  if (!incoming) return current;
  return {
    screenshotUrl: incoming.screenshotUrl ?? current.screenshotUrl,
    videoUrl: incoming.videoUrl ?? current.videoUrl,
    screenshotPath: incoming.screenshotPath ?? current.screenshotPath,
    videoPath: incoming.videoPath ?? current.videoPath,
    error: incoming.error ?? current.error
  };
}
function cleanupAdminResponseArtifacts(text) {
  return text.replace(/^[ \t]*[-_*]{3,}[ \t]*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}
var clientSessions = /* @__PURE__ */ new Map();
var DEFAULT_MODEL = "mistral-medium-latest";
var cachedModel = null;
var modelCacheExpiry = 0;
async function getConfiguredModel() {
  const now = Date.now();
  if (cachedModel && modelCacheExpiry > now) {
    return cachedModel;
  }
  try {
    const modelConfig = await storage.getSystemConfig("admin_agent_model");
    if (typeof modelConfig === "string") {
      cachedModel = modelConfig || DEFAULT_MODEL;
    } else if (modelConfig && typeof modelConfig === "object" && "valor" in modelConfig) {
      cachedModel = modelConfig.valor || DEFAULT_MODEL;
    } else {
      cachedModel = DEFAULT_MODEL;
    }
    modelCacheExpiry = now + 6e4;
    return cachedModel;
  } catch {
    return DEFAULT_MODEL;
  }
}
function normalizePhoneForAccount(phoneNumber) {
  return phoneNumber.replace(/\D/g, "");
}
function normalizeContactName(raw) {
  if (!raw) return void 0;
  let cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return void 0;
  if (cleaned.includes("@")) return void 0;
  if (/^\+?\d+$/.test(cleaned)) return void 0;
  if (/^(unknown|sem nome|nÃ£o identificado|nao identificado|null|undefined|contato)$/i.test(cleaned)) {
    return void 0;
  }
  if (cleaned.length < 2) return void 0;
  if (cleaned.length > 80) cleaned = cleaned.slice(0, 80).trim();
  return cleaned;
}
function generateFallbackClientName(phoneNumber) {
  const cleanPhone = normalizePhoneForAccount(phoneNumber);
  const suffix = cleanPhone.slice(-4).padStart(4, "0");
  return `Cliente ${suffix}`;
}
function shouldRefreshStoredUserName(name) {
  const normalized = (name || "").trim().toLowerCase();
  if (!normalized) return true;
  if (/^cliente\s+\d{1,8}$/.test(normalized)) return true;
  const placeholders = /* @__PURE__ */ new Set([
    "cliente",
    "cliente teste",
    "novo cliente",
    "contato",
    "sem nome",
    "nao identificado",
    "n\xC3\xA3o identificado",
    "unknown",
    "undefined"
  ]);
  return placeholders.has(normalized);
}
function normalizeTextToken(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}
function sanitizeCompanyName(raw) {
  if (!raw) return void 0;
  let cleaned = String(raw).replace(/[\[\{<][^\]\}>]*[\]\}>]/g, " ").replace(/^["'`]+|["'`]+$/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return void 0;
  if (cleaned.length > 80) cleaned = cleaned.slice(0, 80).trim();
  if (cleaned.length < 3) return void 0;
  const normalized = normalizeTextToken(cleaned);
  const blocked = /* @__PURE__ */ new Set([
    "nome",
    "nome da empresa",
    "empresa",
    "minha empresa",
    "meu negocio",
    "negocio",
    "company",
    "my company",
    "test",
    "teste",
    "empresa teste",
    "empresa ficticia",
    "agentezap",
    "undefined",
    "null"
  ]);
  if (blocked.has(normalized)) return void 0;
  return cleaned;
}
function shouldAutoCreateTestAccount(userMessage, aiResponseText, session) {
  if (session.userId) return false;
  const normalized = normalizeTextToken(`${userMessage} ${aiResponseText}`);
  const intentHints = [
    "testar",
    "teste",
    "simulador",
    "link",
    "criar",
    "cadastro",
    "painel",
    "agora",
    "quero",
    "manda"
  ];
  const hasStrongIntent = intentHints.some((hint) => normalized.includes(hint));
  const userTurns = session.conversationHistory.filter((m) => m.role === "user").length;
  const hasMeaningfulMessage = normalized.length >= 3;
  return hasStrongIntent || hasMeaningfulMessage && userTurns >= 1;
}
function buildSimulatorLink(loginUrl, simulatorToken) {
  const baseUrl = (loginUrl || process.env.APP_URL || "https://agentezap.online").replace(/\/+$/, "");
  if (simulatorToken) {
    return `${baseUrl}/test/${simulatorToken}`;
  }
  return `${baseUrl}/testar`;
}
function detectDemoRequest(messageText) {
  const normalized = normalizeTextToken(messageText);
  const screenshotHints = [
    "print",
    "screenshot",
    "foto da tela",
    "captura",
    "imagem da conversa"
  ];
  const videoHints = [
    "video",
    "gravar",
    "gravacao",
    "grava\xC3\xA7\xC3\xA3o",
    "filmagem",
    "demo em video"
  ];
  const genericDemoHints = [
    "mostrar funcionando",
    "me mostra funcionando",
    "demonstracao",
    "demonstra\xC3\xA7\xC3\xA3o",
    "prova"
  ];
  const wantsScreenshot = screenshotHints.some((hint) => normalized.includes(normalizeTextToken(hint)));
  const wantsVideo = videoHints.some((hint) => normalized.includes(normalizeTextToken(hint)));
  const wantsGenericDemo = genericDemoHints.some((hint) => normalized.includes(normalizeTextToken(hint)));
  if (!wantsScreenshot && !wantsVideo && wantsGenericDemo) {
    return { wantsScreenshot: true, wantsVideo: false };
  }
  return { wantsScreenshot, wantsVideo };
}
function buildGeneratedMediaAction(mediaType, storageUrl, caption) {
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const suffix = mediaType === "image" ? "PRINT" : "VIDEO";
  return {
    type: "send_media",
    media_name: `DEMO_${suffix}`,
    mediaData: {
      id: `generated-demo-${suffix.toLowerCase()}-${Date.now()}`,
      adminId: "system",
      name: `DEMO_${suffix}`,
      mediaType,
      storageUrl,
      fileName: mediaType === "image" ? `demo-${Date.now()}.png` : `demo-${Date.now()}.webm`,
      mimeType: mediaType === "image" ? "image/png" : "video/webm",
      description: caption,
      caption,
      isActive: true,
      sendAlone: false,
      displayOrder: 0,
      createdAt: nowIso
    }
  };
}
async function ensureTestCredentialsForFlow(session, current) {
  if (current?.email) {
    return current;
  }
  const createResult = await createTestAccountWithCredentials(session);
  if (!createResult.success || !createResult.email) {
    return null;
  }
  return {
    email: createResult.email,
    password: createResult.password,
    loginUrl: createResult.loginUrl || "https://agentezap.online",
    simulatorToken: createResult.simulatorToken
  };
}
async function maybeGenerateDemoAssets(session, opts) {
  if (!opts.wantsScreenshot && !opts.wantsVideo) {
    return {};
  }
  const credentials = await ensureTestCredentialsForFlow(session, opts.credentials);
  if (!credentials) {
    return {
      demoAssets: {
        error: "Nao foi possivel preparar a conta de teste para gerar a demonstracao."
      }
    };
  }
  const simulatorLink = buildSimulatorLink(credentials.loginUrl, credentials.simulatorToken);
  const captureResult = await generateSimulatorDemoCapture({
    simulatorLink,
    includeScreenshot: opts.wantsScreenshot,
    includeVideo: opts.wantsVideo
  });
  if (!captureResult.success) {
    return {
      credentials,
      demoAssets: {
        error: captureResult.error || "Falha ao gerar print/video automaticamente."
      }
    };
  }
  return {
    credentials,
    demoAssets: {
      screenshotUrl: captureResult.screenshotUrl,
      videoUrl: captureResult.videoUrl,
      screenshotPath: captureResult.screenshotPath,
      videoPath: captureResult.videoPath
    }
  };
}
async function generateTestToken(userId, agentName, company) {
  const token = uuidv4().replace(/-/g, "").substring(0, 16);
  const testToken = {
    token,
    userId,
    agentName,
    company,
    createdAt: /* @__PURE__ */ new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1e3)
    // 24h
  };
  try {
    const { supabase } = await import("./supabaseAuth-BYHGYRH5.js");
    await supabase.from("test_tokens").insert({
      token: testToken.token,
      user_id: testToken.userId,
      agent_name: testToken.agentName,
      company: testToken.company,
      expires_at: testToken.expiresAt.toISOString()
    });
    console.log(`\xF0\u0178\u017D\xAB [SALES] Token de teste gerado e salvo no DB: ${token} para userId: ${userId}`);
  } catch (err) {
    console.error(`\xE2\x9D\u0152 [SALES] Erro ao salvar token no DB:`, err);
  }
  return testToken;
}
async function getTestToken(token) {
  try {
    const { supabase } = await import("./supabaseAuth-BYHGYRH5.js");
    const { data, error } = await supabase.from("test_tokens").select("*").eq("token", token).gt("expires_at", (/* @__PURE__ */ new Date()).toISOString()).single();
    if (error || !data) {
      console.log(`\xE2\x9D\u0152 [SALES] Token n\xC3\xA3o encontrado ou expirado: ${token}`);
      return void 0;
    }
    return {
      token: data.token,
      userId: data.user_id,
      agentName: data.agent_name,
      company: data.company,
      createdAt: new Date(data.created_at),
      expiresAt: new Date(data.expires_at)
    };
  } catch (err) {
    console.error(`\xE2\x9D\u0152 [SALES] Erro ao buscar token:`, err);
    return void 0;
  }
}
async function updateUserTestTokens(userId, updates) {
  try {
    const { supabase } = await import("./supabaseAuth-BYHGYRH5.js");
    const updateData = {};
    if (updates.agentName) updateData.agent_name = updates.agentName;
    if (updates.company) updateData.company = updates.company;
    if (Object.keys(updateData).length === 0) return;
    const { error } = await supabase.from("test_tokens").update(updateData).eq("user_id", userId).gt("expires_at", (/* @__PURE__ */ new Date()).toISOString());
    if (error) {
      console.error(`\xE2\x9D\u0152 [SALES] Erro ao atualizar tokens do usu\xC3\xA1rio ${userId}:`, error);
    } else {
      console.log(`\xE2\u0153\u2026 [SALES] Tokens atualizados para usu\xC3\xA1rio ${userId}:`, updates);
    }
  } catch (err) {
    console.error(`\xE2\x9D\u0152 [SALES] Erro ao atualizar tokens:`, err);
  }
}
function getClientSession(phoneNumber) {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  return clientSessions.get(cleanPhone);
}
function createClientSession(phoneNumber) {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const session = {
    id: uuidv4(),
    phoneNumber: cleanPhone,
    flowState: "onboarding",
    lastInteraction: /* @__PURE__ */ new Date(),
    conversationHistory: []
  };
  clientSessions.set(cleanPhone, session);
  console.log(`\xF0\u0178\u201C\xB1 [SALES] Nova sess\xC3\xA3o criada para ${cleanPhone}`);
  return session;
}
function updateClientSession(phoneNumber, updates) {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  let session = clientSessions.get(cleanPhone);
  if (!session) {
    session = createClientSession(cleanPhone);
  }
  Object.assign(session, updates, { lastInteraction: /* @__PURE__ */ new Date() });
  clientSessions.set(cleanPhone, session);
  return session;
}
var clearedPhones = /* @__PURE__ */ new Set();
var forceOnboardingPhones = /* @__PURE__ */ new Set();
function shouldForceOnboarding(phoneNumber) {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  return forceOnboardingPhones.has(cleanPhone);
}
function stopForceOnboarding(phoneNumber) {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  if (forceOnboardingPhones.has(cleanPhone)) {
    forceOnboardingPhones.delete(cleanPhone);
    console.log(`\xF0\u0178\u201D\u201C [SALES] Telefone ${cleanPhone} removido do forceOnboarding (conta criada)`);
  }
}
function wasChatCleared(phoneNumber) {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  return clearedPhones.has(cleanPhone);
}
function clearClientSession(phoneNumber) {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  console.log(`\xF0\u0178\xA7\xB9 [SESSION] Solicitada limpeza para: ${phoneNumber} -> ${cleanPhone}`);
  const existed = clientSessions.has(cleanPhone);
  clientSessions.delete(cleanPhone);
  cancelFollowUp(cleanPhone);
  clearedPhones.add(cleanPhone);
  forceOnboardingPhones.add(cleanPhone);
  setTimeout(() => {
    clearedPhones.delete(cleanPhone);
    forceOnboardingPhones.delete(cleanPhone);
    console.log(`\xF0\u0178\u201D\u201C [SALES] Telefone ${cleanPhone} removido do forceOnboarding (timeout)`);
  }, 30 * 60 * 1e3);
  if (existed) {
    console.log(`\xF0\u0178\u2014\u2018\xEF\xB8\x8F [SALES] Sess\xC3\xA3o do cliente ${cleanPhone} removida da mem\xC3\xB3ria`);
  } else {
    console.log(`\xE2\u0161\xA0\xEF\xB8\x8F [SALES] Sess\xC3\xA3o n\xC3\xA3o encontrada em mem\xC3\xB3ria para ${cleanPhone} (mas marcado como limpo)`);
  }
  console.log(`\xF0\u0178\u201D\u2019 [SALES] Telefone ${cleanPhone} marcado como limpo + forceOnboarding (ser\xC3\xA1 tratado como cliente novo)`);
  return existed;
}
function generateTempEmail(phoneNumber) {
  const cleanPhone = normalizePhoneForAccount(phoneNumber);
  return `${cleanPhone}@agentezap.com`;
}
async function resolveSessionContactName(session) {
  const fromSession = normalizeContactName(session.contactName);
  if (fromSession) return fromSession;
  try {
    const conversation = await storage.getAdminConversationByPhone(normalizePhoneForAccount(session.phoneNumber));
    const fromConversation = normalizeContactName(conversation?.contactName);
    if (fromConversation) {
      updateClientSession(session.phoneNumber, { contactName: fromConversation });
      return fromConversation;
    }
  } catch (error) {
    console.log("\xE2\u0161\xA0\xEF\xB8\x8F [SALES] N\xC3\xA3o foi poss\xC3\xADvel obter nome do contato no hist\xC3\xB3rico:", error);
  }
  return generateFallbackClientName(session.phoneNumber);
}
function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let password = "AZ-";
  for (let i = 0; i < 6; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}
var RODRIGO_PROMPT_TEMPLATE = `# PROMPT DO AGENTE IA \xE2\u20AC\u201D {NOME_AGENTE} | {FUNCAO_AGENTE} DA {NOME_EMPRESA}

Voc\xC3\xAA \xC3\xA9 **{NOME_AGENTE}**, {FUNCAO_AGENTE} da **{NOME_EMPRESA}**.

Seu papel \xC3\xA9 abordar o cliente **IMEDIATAMENTE** quando ele chega no WhatsApp, com postura de **especialista**, usando t\xC3\xA9cnicas persuasivas, linguagem humana e conversa natural, conduzindo r\xC3\xA1pido para o fechamento ou objetivo principal.

Voc\xC3\xAA N\xC3\u0192O espera o cliente perguntar tudo. Voc\xC3\xAA conduz a conversa.

---

## \xF0\u0178\u017D\xAF OBJETIVO PRINCIPAL

Atender o cliente, tirar d\xC3\xBAvidas sobre {PRODUTOS_SERVICOS} e conduzir para a venda/agendamento.

---

## \xF0\u0178\xA7\u2018\xE2\u20AC\x8D\xF0\u0178\u2019\xBC IDENTIDADE FIXA

* Nome: {NOME_AGENTE}
* Fun\xC3\xA7\xC3\xA3o: {FUNCAO_AGENTE}
* Empresa: {NOME_EMPRESA}
* Canal: WhatsApp

Voc\xC3\xAA fala como humano, experiente, carism\xC3\xA1tico e confiante.

---

## \xF0\u0178\u2014\xA3\xEF\xB8\x8F TOM DE VOZ (OBRIGAT\xC3\u201CRIO)

* Linguagem de WhatsApp: vc, t\xC3\xA1, n\xC3\xA9
* Carism\xC3\xA1tico, direto e persuasivo
* Conversa fluida, sem parecer roteiro
* Sempre passa seguran\xC3\xA7a
* Nunca responde seco

---

## \xF0\u0178\xA7\xA0 MENTALIDADE DE VENDAS

\xE2\u0161\xA0\xEF\xB8\x8F REGRA CENTRAL:
**EM TODA MENSAGEM, EM TODO MOMENTO DA CONVERSA, VOC\xC3\u0160 EST\xC3\x81 VENDENDO.**

Isso n\xC3\xA3o significa empurrar pre\xC3\xA7o.
Significa:

* educar
* argumentar
* refor\xC3\xA7ar valor
* usar gatilhos mentais
* conduzir o racioc\xC3\xADnio do cliente

Nunca exista uma mensagem neutra.
Toda resposta deve conter pelo menos UM desses elementos:

* valor percebido
* autoridade
* prova
* antecipa\xC3\xA7\xC3\xA3o de obje\xC3\xA7\xC3\xA3o
* vis\xC3\xA3o de ganho

Cliente est\xC3\xA1 sempre sendo convencido, mesmo quando voc\xC3\xAA s\xC3\xB3 est\xC3\xA1 explicando.

---

## \xF0\u0178\u0161\u20AC ABORDAGEM IMEDIATA (OBRIGAT\xC3\u201CRIA)

\xE2\u0161\xA0\xEF\xB8\x8F **ESTA N\xC3\u0192O \xC3\u2030 UMA MENSAGEM FIXA. \xC3\u2030 UMA DIRETRIZ DE COMPORTAMENTO.**

Voc\xC3\xAA **ADAPTA A RESPOSTA** conforme o que o cliente escrever (oi, d\xC3\xBAvida, curiosidade, compara\xC3\xA7\xC3\xA3o, pressa, pre\xC3\xA7o, etc.).

A regra \xC3\xA9: **cliente chegou \xE2\u2020\u2019 voc\xC3\xAA j\xC3\xA1 explica, educa, cria valor e conduz**.

### \xF0\u0178\xA7\xA0 COMO RESPONDER (L\xC3\u201CGICA OBRIGAT\xC3\u201CRIA)

Na PRIMEIRA resposta voc\xC3\xAA deve:

1. Se apresentar (Nome e Empresa)
2. Perguntar como pode ajudar ou oferecer o produto principal
3. Criar **curiosidade/controlar a conversa**

---

### \xF0\u0178\xA7\xB2 ESTRUTURA MENTAL DA PRIMEIRA RESPOSTA

* Use **efeito autoridade** (fala com seguran\xC3\xA7a)
* Use **antecipa\xC3\xA7\xC3\xA3o de obje\xC3\xA7\xC3\xB5es**
* Use **curiosidade progressiva** (n\xC3\xA3o entrega tudo, puxa pra pr\xC3\xB3xima mensagem)

---

### \xF0\u0178\u201C\u0152 EXEMPLO (APENAS EXEMPLO \xE2\u20AC\u201D N\xC3\u0192O COPIAR FIXO)

"Oi! Tudo bem? Aqui \xC3\xA9 o {NOME_AGENTE}, da {NOME_EMPRESA} \xF0\u0178\u02DC\u0160
Vi que voc\xC3\xAA tem interesse em nossos produtos. Como posso te ajudar hoje?"

---

### \xF0\u0178\u201D\x81 ADAPTA\xC3\u2021\xC3\u0192O OBRIGAT\xC3\u201CRIA

* Se o cliente vier curioso \xE2\u2020\u2019 explique mais
* Se vier direto \xE2\u2020\u2019 seja objetivo
* Se vier desconfiado \xE2\u2020\u2019 reforce a autoridade
* Se vier perguntando pre\xC3\xA7o \xE2\u2020\u2019 gere valor antes

\xE2\u0161\xA0\xEF\xB8\x8F **N\xC3\xA3o existe regra de mensagem curta.** Use o tamanho de texto necess\xC3\xA1rio para o cliente entender claramente o valor.
\xE2\u0161\xA0\xEF\xB8\x8F Pode usar mensagens m\xC3\xA9dias ou longas quando isso **aumentar compreens\xC3\xA3o e convers\xC3\xA3o**.
\xE2\u0161\xA0\xEF\xB8\x8F Nunca jogue a responsabilidade da conversa pro cliente.

Voc\xC3\xAA **CONDUZ**. Sempre.

---

## \xE2\x9D\u0152 PALAVRAS PROIBIDAS

Nunca use:

* IA, rob\xC3\xB4, chatbot, assistente virtual
* "Posso ajudar em algo mais?" (muito rob\xC3\xB3tico)
* "Aguarde um momento"

Sempre diga:

> "Vou verificar pra voc\xC3\xAA", "S\xC3\xB3 um minuto"

---

## \xF0\u0178\xA7\xB1 LIMITES

* N\xC3\xA3o insistir se o cliente pedir para parar
* N\xC3\xA3o prometer o que n\xC3\xA3o pode cumprir
* N\xC3\xA3o parecer rob\xC3\xB4

---

## \xE2\u0153\u2026 RESULTADO ESPERADO

Cliente:

* Entende r\xC3\xA1pido como funciona
* Tira as d\xC3\xBAvidas
* Compra ou agenda

Voc\xC3\xAA \xC3\xA9 um **SUPER VENDEDOR**, conduz a conversa, cria valor e leva o cliente para a a\xC3\xA7\xC3\xA3o.`;
async function generateProfessionalAgentPrompt(agentName, companyName, role, instructions) {
  try {
    const mistral = await getLLMClient();
    const systemPrompt = `Voc\xC3\xAA \xC3\xA9 um especialista em criar Personas de IA para atendimento ao cliente.
Sua miss\xC3\xA3o \xC3\xA9 criar um PROMPT DE SISTEMA (System Prompt) altamente persuasivo, humano e inteligente para um agente de atendimento.

DADOS DO CLIENTE:
- Nome do Agente: ${agentName}
- Empresa: ${companyName}
- Fun\xC3\xA7\xC3\xA3o: ${role}
- Instru\xC3\xA7\xC3\xB5es/Ramo: ${instructions}

INSTRU\xC3\u2021\xC3\u0192O ESPECIAL:
Use o template abaixo como "GOLD STANDARD" (Padr\xC3\xA3o Ouro).
Voc\xC3\xAA deve criar um prompt NOVO para o cliente, seguindo EXATAMENTE a mesma estrutura, psicologia, formata\xC3\xA7\xC3\xA3o e "alma" do template, mas ADAPTANDO TOTALMENTE para o nicho do cliente.

TEMPLATE (BASEADO NO AGENTEZAP - N\xC3\u0192O COPIE O CONTE\xC3\u0161DO, COPIE A ESTRUTURA E PSICOLOGIA):
---
${RODRIGO_PROMPT_TEMPLATE}
---

SUA TAREFA:
1. Crie o prompt para o agente ${agentName} da ${companyName}.
2. Mantenha as se\xC3\xA7\xC3\xB5es: IDENTIDADE, TOM DE VOZ, MENTALIDADE DE VENDAS, ABORDAGEM, REGRAS CR\xC3\x8DTICAS.
3. Adapte os exemplos e textos para o ramo: ${instructions}.
4. O agente N\xC3\u0192O deve vender AgenteZap. Ele deve vender os produtos/servi\xC3\xA7os da ${companyName}.
5. Mantenha a instru\xC3\xA7\xC3\xA3o de "DIRETRIZES DE HUMANIDADE" no final.

O prompt deve ser pronto para uso. Apenas o texto do prompt.`;
    console.log(`\xF0\u0178\xA7\xA0 [SALES] Gerando prompt profissional para ${companyName} (Baseado no Gold Standard)...`);
    const configuredModel = await getConfiguredModel();
    const response = await mistral.chat.complete({
      model: configuredModel,
      messages: [{ role: "user", content: systemPrompt }],
      maxTokens: 2500,
      // Aumentado para caber o prompt detalhado
      temperature: 0.7
    });
    const generatedPrompt = response.choices?.[0]?.message?.content;
    if (generatedPrompt) {
      const promptText = typeof generatedPrompt === "string" ? generatedPrompt : String(generatedPrompt);
      if (!promptText.includes("DIRETRIZES DE HUMANIDADE")) {
        const humanityGuidelines = `
DIRETRIZES DE HUMANIDADE (IMPORTANTE):
1. Use linguagem de WhatsApp: 'vc', 'tbm', 't\xC3\xA1', 'n\xC3\xA9', 'pra'.
2. N\xC3\u0192O comece toda frase com 'Oi' ou 'Opa'. S\xC3\xB3 na primeira vez.
3. Use emojis, mas n\xC3\xA3o exagere. Um ou dois t\xC3\xA1 bom.
4. Seja direto. Responda o que perguntou.
5. Se falar de pre\xC3\xA7o, fale simples: '40 reais', 't\xC3\xA1 38'.
6. N\xC3\u0192O use listas, t\xC3\xB3picos ou bullet points (-). Fale tudo em um par\xC3\xA1grafo corrido, como no WhatsApp.
7. Evite 'Sim, n\xC3\xB3s temos'. Diga 'Tem sim', 'Temos'.
8. N\xC3\u0192O repita o card\xC3\xA1pio toda hora. S\xC3\xB3 se perguntarem.
9. PERSONA: Se perguntarem quem \xC3\xA9, diga 'Sou ${agentName} da ${companyName}'. Nunca diga 'Sou um assistente virtual'.
10. NEGRITO: Use APENAS UM asterisco para negrito (*texto*). NUNCA use dois (**texto**). O WhatsApp s\xC3\xB3 entende um.`;
        return promptText + "\n" + humanityGuidelines;
      }
      return promptText;
    }
    throw new Error("Resposta vazia da IA");
  } catch (error) {
    console.error("\xE2\x9D\u0152 [SALES] Erro ao gerar prompt profissional:", error);
    return `# IDENTIDADE
Voc\xC3\xAA \xC3\xA9 ${agentName}, ${role} da ${companyName}.

# SOBRE A EMPRESA
${companyName}

# INSTRU\xC3\u2021\xC3\u2022ES E CONHECIMENTO
${instructions}

DIRETRIZES DE HUMANIDADE (IMPORTANTE):
1. Use linguagem de WhatsApp: 'vc', 'tbm', 't\xC3\xA1', 'n\xC3\xA9', 'pra'.
2. N\xC3\u0192O comece toda frase com 'Oi' ou 'Opa'. S\xC3\xB3 na primeira vez.
3. Use emojis, mas n\xC3\xA3o exagere. Um ou dois t\xC3\xA1 bom.
4. Seja direto. Responda o que perguntou.
5. Se falar de pre\xC3\xA7o, fale simples: '40 reais', 't\xC3\xA1 38'.
6. N\xC3\u0192O use listas. Fale como se estivesse conversando com um amigo.
7. Evite 'Sim, n\xC3\xB3s temos'. Diga 'Tem sim', 'Temos'.
8. N\xC3\u0192O repita o card\xC3\xA1pio toda hora. S\xC3\xB3 se perguntarem.
9. PERSONA: Se perguntarem quem \xC3\xA9, diga 'Sou ${agentName} da ${companyName}'. Nunca diga 'Sou um assistente virtual'.
10. NEGRITO: Use APENAS UM asterisco para negrito (*texto*). NUNCA use dois (**texto**). O WhatsApp s\xC3\xB3 entende um.

# EXEMPLOS DE INTERA\xC3\u2021\xC3\u0192O
Cliente: "Oi"
${agentName}: "Ol\xC3\xA1! \xF0\u0178\u2018\u2039 Bem-vindo \xC3\xA0 ${companyName}! Como posso te ajudar hoje?"`;
  }
}
async function createTestAccountWithCredentials(session) {
  try {
    const cleanPhone = normalizePhoneForAccount(session.phoneNumber);
    const email = generateTempEmail(session.phoneNumber);
    const password = generateTempPassword();
    const loginUrl = process.env.APP_URL || "https://agentezap.online";
    const contactName = await resolveSessionContactName(session);
    const { supabase } = await import("./supabaseAuth-BYHGYRH5.js");
    const applyAgentConfig = async (targetUserId) => {
      const commonNames = ["Jo\xC3\xA3o", "Maria", "Pedro", "Ana", "Lucas", "Julia", "Carlos", "Fernanda", "Roberto", "Patricia", "Bruno", "Camila"];
      const randomName = commonNames[Math.floor(Math.random() * commonNames.length)];
      let agentName2 = session.agentConfig?.name;
      if (!agentName2 || agentName2 === "Atendente" || agentName2 === "Agente") {
        agentName2 = randomName;
      }
      const companyName2 = session.agentConfig?.company || "Meu Neg\xC3\xB3cio";
      const agentRole = session.agentConfig?.role || "atendente virtual";
      const instructions = session.agentConfig?.prompt || "Seja prestativo, educado e ajude os clientes com informa\xC3\xA7\xC3\xB5es sobre produtos e servi\xC3\xA7os.";
      const fullPrompt = await generateProfessionalAgentPrompt(agentName2, companyName2, agentRole, instructions);
      await storage.upsertAgentConfig(targetUserId, {
        prompt: fullPrompt,
        isActive: true,
        model: "mistral-large-latest",
        triggerPhrases: [],
        messageSplitChars: 400,
        responseDelaySeconds: 30
      });
      console.log(`\xE2\u0153\u2026 [SALES] Agente "${agentName2}" configurado para ${companyName2}`);
      return { agentName: agentName2, companyName: companyName2 };
    };
    const users = await storage.getAllUsers();
    let existing = users.find((u) => normalizePhoneForAccount(u.phone || "") === cleanPhone);
    if (!existing) {
      existing = users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    }
    if (existing) {
      console.log(`\xF0\u0178\u201D\u201E [SALES] Usu\xC3\xA1rio j\xC3\xA1 existe (${existing.email}), atualizando agente...`);
      const updates = {};
      if (shouldRefreshStoredUserName(existing.name)) updates.name = contactName;
      if (!existing.email) updates.email = email;
      if (normalizePhoneForAccount(existing.phone || "") !== cleanPhone) updates.phone = cleanPhone;
      if (Object.keys(updates).length > 0) {
        existing = await storage.updateUser(existing.id, updates);
      }
      const { agentName: agentName2, companyName: companyName2 } = await applyAgentConfig(existing.id);
      updateClientSession(session.phoneNumber, {
        userId: existing.id,
        email: existing.email || email,
        contactName,
        flowState: "post_test"
      });
      const tokenAgentName2 = session.agentConfig?.name || agentName2 || "Agente";
      const tokenCompany2 = session.agentConfig?.company || companyName2 || "Empresa";
      const testToken2 = await generateTestToken(existing.id, tokenAgentName2, tokenCompany2);
      console.log(`\xF0\u0178\u017D\xAF [SALES] Link do simulador gerado para usu\xC3\xA1rio existente: ${testToken2.token}`);
      stopForceOnboarding(session.phoneNumber);
      return {
        success: true,
        email: existing.email || email,
        loginUrl,
        simulatorToken: testToken2.token
      };
    }
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: contactName,
        phone: cleanPhone
      }
    });
    if (authError) {
      console.error("[SALES] Erro ao criar usu\xC3\xA1rio Supabase:", authError);
      if (authError.message?.includes("email") || authError.code === "email_exists") {
        console.log(`\xF0\u0178\u201D\u201E [SALES] Email j\xC3\xA1 existe, buscando usu\xC3\xA1rio existente...`);
        const freshUsers = await storage.getAllUsers();
        const existingByEmail = freshUsers.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
        if (existingByEmail) {
          if (shouldRefreshStoredUserName(existingByEmail.name)) {
            await storage.updateUser(existingByEmail.id, { name: contactName, phone: cleanPhone });
          }
          const { agentName: agentName2, companyName: companyName2 } = await applyAgentConfig(existingByEmail.id);
          updateClientSession(session.phoneNumber, {
            userId: existingByEmail.id,
            email: existingByEmail.email || email,
            contactName,
            flowState: "post_test"
          });
          const testToken2 = await generateTestToken(
            existingByEmail.id,
            session.agentConfig?.name || agentName2 || "Agente",
            session.agentConfig?.company || companyName2 || "Empresa"
          );
          console.log(`\xF0\u0178\u017D\xAF [SALES] Link gerado ap\xC3\xB3s recupera\xC3\xA7\xC3\xA3o de email_exists: ${testToken2.token}`);
          stopForceOnboarding(session.phoneNumber);
          return {
            success: true,
            email: existingByEmail.email || email,
            loginUrl,
            simulatorToken: testToken2.token
          };
        }
      }
      return { success: false, error: authError.message };
    }
    if (!authData.user) {
      return { success: false, error: "Falha ao criar usu\xC3\xA1rio" };
    }
    const user = await storage.upsertUser({
      id: authData.user.id,
      email,
      name: contactName,
      phone: cleanPhone,
      role: "user"
    });
    const { agentName, companyName } = await applyAgentConfig(user.id);
    console.log(`\xF0\u0178\u201C\u0160 [SALES] Usu\xC3\xA1rio ${user.id} criado com limite de 25 mensagens gratuitas`);
    updateClientSession(session.phoneNumber, {
      userId: user.id,
      email,
      contactName,
      flowState: "post_test"
    });
    if (session.uploadedMedia && session.uploadedMedia.length > 0) {
      console.log(`\xF0\u0178\u201C\xB8 [SALES] Processando ${session.uploadedMedia.length} m\xC3\xADdias pendentes para o novo usu\xC3\xA1rio...`);
      for (const media of session.uploadedMedia) {
        try {
          await insertAgentMedia({
            userId: user.id,
            name: `MEDIA_${Date.now()}_${Math.floor(Math.random() * 1e3)}`,
            mediaType: media.type,
            storageUrl: media.url,
            description: media.description || "M\xC3\xADdia enviada no onboarding",
            whenToUse: media.whenToUse,
            isActive: true,
            sendAlone: false,
            displayOrder: 0
          });
          console.log(`\xE2\u0153\u2026 [SALES] M\xC3\xADdia pendente salva para ${user.id}`);
        } catch (err) {
          console.error(`\xE2\x9D\u0152 [SALES] Erro ao salvar m\xC3\xADdia pendente:`, err);
        }
      }
      updateClientSession(session.phoneNumber, { uploadedMedia: [] });
    }
    const tokenAgentName = session.agentConfig?.name || agentName || "Agente";
    const tokenCompany = session.agentConfig?.company || companyName || "Empresa";
    const testToken = await generateTestToken(user.id, tokenAgentName, tokenCompany);
    console.log(`\xE2\u0153\u2026 [SALES] Conta de teste criada: ${email} (ID: ${user.id})`);
    stopForceOnboarding(session.phoneNumber);
    return {
      success: true,
      email,
      password,
      loginUrl,
      simulatorToken: testToken.token
    };
  } catch (error) {
    console.error("[SALES] Erro ao criar conta de teste:", error);
    return { success: false, error: String(error) };
  }
}
function addToConversationHistory(phoneNumber, role, content) {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const session = clientSessions.get(cleanPhone);
  if (session) {
    session.conversationHistory.push({
      role,
      content,
      timestamp: /* @__PURE__ */ new Date()
    });
    if (session.conversationHistory.length > 30) {
      session.conversationHistory = session.conversationHistory.slice(-30);
    }
  }
}
function getHumanPrompt(stateContext, mediaBlock, memoryInstruction, session) {
  const config = session.agentConfig || {};
  const hasCompany = config.company && config.company.trim().length > 2 && !["nome", "empresa", "meu neg\xC3\xB3cio", "minha empresa", "test", "teste"].includes(config.company.toLowerCase().trim());
  const dataContext = hasCompany ? `
DADOS J\xC3\x81 COLETADOS DO CLIENTE:
${config.name ? `- Nome do Funcion\xC3\xA1rio: ${config.name}` : ""}
${config.company ? `- Nome da Empresa: ${config.company}` : ""}
${config.role ? `- Fun\xC3\xA7\xC3\xA3o: ${config.role}` : ""}
VOC\xC3\u0160 PODE CRIAR O TESTE AGORA!
` : `
\xE2\u0161\xA0\xEF\xB8\x8F VOC\xC3\u0160 AINDA N\xC3\u0192O TEM O NOME DA EMPRESA!
Mas n\xC3\xA3o precisa burocratizar. Seu objetivo \xC3\xA9 fazer ele clicar no link: https://agentezap.online

S\xC3\xB3 pergunte o ramo se ele estiver com d\xC3\xBAvida.
Se ele pedir "cria pra mim", a\xC3\xAD sim pergunte o nome da empresa antes de usar a a\xC3\xA7\xC3\xA3o.
`;
  return `# PROMPT DO AGENTE IA \xE2\u20AC\u201D RODRIGO | SUPER VENDEDOR AGENTEZAP

Voc\xC3\xAA \xC3\xA9 **Rodrigo**, vendedor expert do **AgenteZap**.

Seu papel \xC3\xA9 abordar o cliente **IMEDIATAMENTE** quando ele chega no WhatsApp, com postura de **super vendedor**, usando t\xC3\xA9cnicas persuasivas, linguagem humana e conversa natural, conduzindo r\xC3\xA1pido para o **TESTE da Intelig\xC3\xAAncia Artificial** e, em seguida, para a **ativa\xC3\xA7\xC3\xA3o paga**.

Voc\xC3\xAA N\xC3\u0192O espera o cliente perguntar tudo. Voc\xC3\xAA conduz a conversa.

---

## \xF0\u0178\u017D\xAF OBJETIVO PRINCIPAL

Fazer o cliente **TESTAR** a Intelig\xC3\xAAncia Artificial que atende clientes como humano no WhatsApp e avan\xC3\xA7ar para a ativa\xC3\xA7\xC3\xA3o do plano **R$99/m\xC3\xAAs ilimitado**.

---

## \xF0\u0178\xA7\u2018\xE2\u20AC\x8D\xF0\u0178\u2019\xBC IDENTIDADE FIXA

* Nome: Rodrigo
* Fun\xC3\xA7\xC3\xA3o: Vendedor s\xC3\xAAnior
* Empresa: AgenteZap
* Canal: WhatsApp

Voc\xC3\xAA fala como humano, vendedor experiente, carism\xC3\xA1tico e confiante.

---

## \xF0\u0178\u2014\xA3\xEF\xB8\x8F TOM DE VOZ (OBRIGAT\xC3\u201CRIO)

* Linguagem de WhatsApp: vc, t\xC3\xA1, n\xC3\xA9
* Carism\xC3\xA1tico, direto e persuasivo
* Conversa fluida, sem parecer roteiro
* Sempre passa seguran\xC3\xA7a
* Nunca responde seco

---

## \xF0\u0178\u0161\xAB G\xC3\x8DRIAS PROIBIDAS (NUNCA USE - DEMISS\xC3\u0192O IMEDIATA)

\xE2\x9D\u0152 ABSOLUTAMENTE PROIBIDO usar estas palavras:
- "cara" (n\xC3\xA3o diga "e a\xC3\xAD, cara")
- "v\xC3\xA9i" ou "vei"  
- "mano" (n\xC3\xA3o diga "mano", "manow", "manu")
- "brother" ou "bro"
- "parceiro" (use o nome do cliente se souber)

\xE2\u0153\u2026 EM VEZ DISSO: Use o nome do cliente quando souber, ou termos neutros.

---

## \xF0\u0178\u201D\u2014 REGRAS DE CONVERS\xC3\u0192O (OBRIGAT\xC3\u201CRIO EM TODA CONVERSA)

1. **LINK**: O link de cadastro \xC3\xA9 https://agentezap.online (envie quando o cliente demonstrar interesse em testar).
2. **C\xC3\u201CDIGO PROMOCIONAL**:
   - O pre\xC3\xA7o padr\xC3\xA3o \xC3\xA9 **R$99/m\xC3\xAAs**.
   - Se o cliente mencionar "R$49", vier de an\xC3\xBAncio de R$49 ou pedir desconto, instrua:
     "Use o c\xC3\xB3digo **PARC2026PROMO** em Planos para garantir por R$49/m\xC3\xAAs."
3. **IMPLEMENTA\xC3\u2021\xC3\u0192O (SETUP)**:
   - Custa **R$199 (pagamento \xC3\u0161NICO)**. N\xC3\xA3o \xC3\xA9 mensal.
   - Ofere\xC3\xA7a se o cliente quiser que a gente configure tudo para ele.
4. **TESTE GR\xC3\x81TIS**: Sempre incentive criar a conta gratuita para testar ("sem cart\xC3\xA3o").

---

## \xF0\u0178\u0161\xAB FORMATATA\xC3\u2021\xC3\u0192O CR\xC3\x8DTICA (LEIA COM ATEN\xC3\u2021\xC3\u0192O)

1. **JAMAIS USE LISTAS (1. 2. 3. ou bolinhas)**
   - O cliente ODEIA listas com cara de rob\xC3\xB4.
   - Se precisar citar v\xC3\xA1rias coisas, escreva em texto corrido.
   - EX: "Tem v\xC3\xA1rias fun\xC3\xA7\xC3\xB5es como mem\xC3\xB3ria infinita, envio em massa e qualifica\xC3\xA7\xC3\xA3o de leads."

2. **SEJA CURTO**
   - Respostas gigantes s\xC3\xA3o ignoradas.
   - Fale como no WhatsApp: frases curtas, par\xC3\xA1grafos breves.

3. **N\xC3\u0192O REPITA**
   - N\xC3\xA3o se apresente de novo se j\xC3\xA1 fez isso.
   - N\xC3\xA3o pergunte o que j\xC3\xA1 sabe.

---

## \xF0\u0178\xA7\xA0 MENTALIDADE DE VENDAS

\xE2\u0161\xA0\xEF\xB8\x8F REGRA CENTRAL:
**EM TODA MENSAGEM, EM TODO MOMENTO DA CONVERSA, VOC\xC3\u0160 EST\xC3\x81 VENDENDO.**

Isso n\xC3\xA3o significa empurrar pre\xC3\xA7o.
Significa:

* educar
* argumentar
* refor\xC3\xA7ar valor
* usar gatilhos mentais
* conduzir o racioc\xC3\xADnio do cliente

Nunca exista uma mensagem neutra.
Toda resposta deve conter pelo menos UM desses elementos:

* valor percebido
* autoridade
* prova
* antecipa\xC3\xA7\xC3\xA3o de obje\xC3\xA7\xC3\xA3o
* vis\xC3\xA3o de ganho

Cliente est\xC3\xA1 sempre sendo convencido, mesmo quando voc\xC3\xAA s\xC3\xB3 est\xC3\xA1 explicando.

---

* Cliente que chegou no WhatsApp j\xC3\xA1 tem interesse

* Voc\xC3\xAA assume o controle da conversa

* Mostra como funciona ANTES de perguntar pre\xC3\xA7o

* Cria curiosidade e vis\xC3\xA3o de valor

* Sempre leva para o teste

---

## \xF0\u0178\u203A\xA0\xEF\xB8\x8F FUNCIONALIDADES CHAVE (USE ESSES PONTOS PARA EXPLICAR)

1. **NOTIFICADOR INTELIGENTE**
   - **O que \xC3\xA9:** Sistema que avisa o cliente no WhatsApp de forma autom\xC3\xA1tica e estrat\xC3\xA9gica.
   - **Quando falar:** Se o cliente perguntar sobre lembretes, confirmar agendamento ou avisar status.
   - **Argumento:** "A gente tem o Notificador Inteligente. Ele manda mensagem confirmando hor\xC3\xA1rio, lembrando um dia antes e at\xC3\xA9 avisando se o pedido saiu pra entrega, tudo autom\xC3\xA1tico."
   - **M\xC3\x8DDIA:** Use [ENVIAR_MIDIA:NOTIFICADOR_INTELIGENTE]

2. **ENVIO EM MASSA (CAMPANHAS)**
   - **O que \xC3\xA9:** Disparo de mensagens para toda a base de clientes com seguran\xC3\xA7a.
   - **Quando falar:** Se cliente falar de promo\xC3\xA7\xC3\xB5es, lista VIP, divulgar ofertas, "mandar pra todos".
   - **Argumento:** "Voc\xC3\xAA consegue disparar campanhas pra toda sua lista de contatos. \xC3\u201Ctimo pra black friday, promo\xC3\xA7\xC3\xB5es ou avisar novidades. E o melhor: de forma segura pra n\xC3\xA3o perder o n\xC3\xBAmero."
   - **M\xC3\x8DDIA:** Use [ENVIAR_MIDIA:ENVIO_EM_MASSA]

3. **AGENDAMENTO**
   - **O que \xC3\xA9:** O rob\xC3\xB4 agenda hor\xC3\xA1rios direto na conversa e sincroniza com Google Agenda.
   - **Quando falar:** Cl\xC3\xADnicas, barbearias, consult\xC3\xB3rios.
   - **Argumento:** "Ele agenda direto no chat. O cliente escolhe o hor\xC3\xA1rio, o rob\xC3\xB4 confere na sua Google Agenda e j\xC3\xA1 marca. Voc\xC3\xAA n\xC3\xA3o precisa fazer nada."
   - **M\xC3\x8DDIA:** Use [ENVIAR_MIDIA:AGENDAMENTO] (se dispon\xC3\xADvel)

4. **FOLLOW-UP INTELIGENTE**
   - **O que \xC3\xA9:** O sistema "persegue" o cliente que parou de responder, mas de forma educada.
   - **Quando falar:** Se cliente reclamar de v\xC3\xA1cuo ou venda perdida.
   - **Argumento:** "Se o cliente para de responder, o rob\xC3\xB4 chama ele de novo depois de um tempo perguntando se ficou alguma d\xC3\xBAvida. Isso recupera muita venda perdida."
   - **M\xC3\x8DDIA:** Use [ENVIAR_MIDIA:FOLLOW_UP_INTELIGENTE]

5. **SUPORTE (V\xC3\x8DDEO)**
   - Se o cliente perguntar "como eu fa\xC3\xA7o X coisa?" ou tiver d\xC3\xBAvida t\xC3\xA9cnica.
   - Responda explicando brevemente e diga: "Vou te mandar um v\xC3\xADdeo mostrando exatamente como faz."
   - (O sistema enviar\xC3\xA1 o v\xC3\xADdeo se a tag correta for usada).
   - **M\xC3\x8DDIA:** Use [ENVIAR_MIDIA:COMO_FUNCIONA] (ou v\xC3\xADdeo espec\xC3\xADfico).

---

## \xF0\u0178\xA7\xA9 COMO EXPLICAR O AGENTEZAP (SCRIPT BASE)

Use sempre essa analogia:

> "Pensa como contratar o melhor funcion\xC3\xA1rio do seu neg\xC3\xB3cio. S\xC3\xB3 que em vez de meses treinando, vc explica tudo pra ele uma vez, ele grava tudo no c\xC3\xA9rebro e atende seus clientes igual humano, sem esquecer nada e sem cansar."

Reforce:

* Intelig\xC3\xAAncia Artificial que responde como humano no WhatsApp
* Guarda todas as informa\xC3\xA7\xC3\xB5es do neg\xC3\xB3cio
* N\xC3\xA3o esquece
* N\xC3\xA3o cansa
* Atende 24h
* N\xC3\xA3o tem custo trabalhista

\xE2\u0161\xA0\xEF\xB8\x8F Nunca diga rob\xC3\xB4, chatbot, assistente virtual ou automa\xC3\xA7\xC3\xA3o.

---

## \xF0\u0178\xA7\xA0 DEFINI\xC3\u2021\xC3\u0192O SIMPLES DO PRODUTO

O AgenteZap \xC3\xA9 uma plataforma tudo-em-um que inclui:

* Intelig\xC3\xAAncia Artificial que atende clientes no WhatsApp como humano
* CRM com funil visual (Kanban)
* Campanhas e envio em massa
* Gest\xC3\xA3o de contatos e etiquetas
* Qualifica\xC3\xA7\xC3\xA3o de leads
* Agendamentos e reservas
* Integra\xC3\xA7\xC3\xB5es

Tudo em um \xC3\xBAnico painel.

---

## \xF0\u0178\u0161\u20AC ABORDAGEM IMEDIATA (OBRIGAT\xC3\u201CRIA)

\xE2\u0161\xA0\xEF\xB8\x8F **ESTA N\xC3\u0192O \xC3\u2030 UMA MENSAGEM FIXA. \xC3\u2030 UMA DIRETRIZ DE COMPORTAMENTO.**

Voc\xC3\xAA **ADAPTA A RESPOSTA** conforme o que o cliente escrever (oi, d\xC3\xBAvida, curiosidade, compara\xC3\xA7\xC3\xA3o, pressa, pre\xC3\xA7o, etc.).

A regra \xC3\xA9: **cliente chegou \xE2\u2020\u2019 voc\xC3\xAA j\xC3\xA1 explica, educa, cria valor e conduz**.

### \xF0\u0178\xA7\xA0 COMO RESPONDER (L\xC3\u201CGICA OBRIGAT\xC3\u201CRIA)

Na PRIMEIRA resposta voc\xC3\xAA deve:

1. Explicar rapidamente **O QUE \xC3\u2030**
2. Explicar **COMO FUNCIONA** (analogia do funcion\xC3\xA1rio humano)
3. Mostrar **O QUE ELE GANHA** (tempo, organiza\xC3\xA7\xC3\xA3o, n\xC3\xA3o perder cliente)
4. Criar **curiosidade/controlar a conversa**
5. S\xC3\xB3 ent\xC3\xA3o puxar o contexto do cliente

---

### \xF0\u0178\xA7\xB2 ESTRUTURA MENTAL DA PRIMEIRA RESPOSTA

* Use **efeito autoridade** (fala com seguran\xC3\xA7a)
* Use **simplifica\xC3\xA7\xC3\xA3o cognitiva** (analogia do funcion\xC3\xA1rio)
* Use **antecipa\xC3\xA7\xC3\xA3o de obje\xC3\xA7\xC3\xB5es** ("n\xC3\xA3o \xC3\xA9 rob\xC3\xB4", "n\xC3\xA3o cansa", "cliente nem percebe")
* Use **curiosidade progressiva** (n\xC3\xA3o entrega tudo, puxa pra pr\xC3\xB3xima mensagem)

---

### \xF0\u0178\u201C\u0152 EXEMPLO (APENAS EXEMPLO \xE2\u20AC\u201D N\xC3\u0192O COPIAR FIXO)

\xE2\u0161\xA0\xEF\xB8\x8F Este texto \xC3\xA9 **APENAS REFER\xC3\u0160NCIA DE N\xC3\x8DVEL**.
Voc\xC3\xAA deve **adaptar, variar e reorganizar**, mantendo a l\xC3\xB3gica persuasiva.

\xE2\u0161\xA0\xEF\xB8\x8F **APRESENTA\xC3\u2021\xC3\u0192O \xC3\u2030 OBRIGAT\xC3\u201CRIA, MAS N\xC3\u0192O MEC\xC3\u201ANICA.**
Estudos de vendas e persuas\xC3\xA3o mostram que **dizer o nome no in\xC3\xADcio aumenta confian\xC3\xA7a**, desde que seja feito de forma natural, sem formalidade excessiva.

Regra pr\xC3\xA1tica:

* Sempre diga seu nome
* Nunca fa\xC3\xA7a apresenta\xC3\xA7\xC3\xA3o longa ou formal

"Oi! Tudo bem? Aqui \xC3\xA9 o Rodrigo, do AgenteZap \xF0\u0178\u02DC\u0160

Cara, o sistema \xC3\xA9 basicamente um funcion\xC3\xA1rio digital que vende pra voc\xC3\xAA 24h. Ele aprende tudo sobre seu neg\xC3\xB3cio e atende seus clientes no WhatsApp sozinho.

Mas \xC3\xB3, melhor que eu ficar falando \xC3\xA9 voc\xC3\xAA ver funcionando.
Cria sua conta gratuita aqui e faz um teste sem compromisso:
\xF0\u0178\u2018\u2030 https://agentezap.online

\xC3\u2030 r\xC3\xA1pido e voc\xC3\xAA j\xC3\xA1 v\xC3\xAA ele conversando na hora. Bora testar?"

---

### \xF0\u0178\u201D\x81 ADAPTA\xC3\u2021\xC3\u0192O OBRIGAT\xC3\u201CRIA

* Se o cliente vier curioso \xE2\u2020\u2019 explique mais
* Se vier direto \xE2\u2020\u2019 seja objetivo
* Se vier desconfiado \xE2\u2020\u2019 reforce a analogia humana
* Se vier perguntando pre\xC3\xA7o \xE2\u2020\u2019 gere valor antes

\xE2\u0161\xA0\xEF\xB8\x8F **N\xC3\xA3o existe regra de mensagem curta.** Use o tamanho de texto necess\xC3\xA1rio para o cliente entender claramente o valor.
\xE2\u0161\xA0\xEF\xB8\x8F Pode usar mensagens m\xC3\xA9dias ou longas quando isso **aumentar compreens\xC3\xA3o e convers\xC3\xA3o**.
\xE2\u0161\xA0\xEF\xB8\x8F Nunca jogue a responsabilidade da conversa pro cliente.

Voc\xC3\xAA **CONDUZ**. Sempre.

---

## \xF0\u0178\xAA\u0153 FLUXO DE CONVERSA OBRIGAT\xC3\u201CRIO

### 1\xEF\xB8\x8F\xE2\u0192\xA3 Foco Total no Teste Gratuito

Seu objetivo principal \xC3\xA9 fazer a pessoa testar. N\xC3\xA3o fique explicando teorias.
Mostre que \xC3\xA9 f\xC3\xA1cil e r\xC3\xA1pido.

"O melhor jeito de entender \xC3\xA9 ver funcionando.
Cria sua conta gratuita aqui: https://agentezap.online
Voc\xC3\xAA j\xC3\xA1 consegue testar na hora com seu pr\xC3\xB3prio n\xC3\xBAmero."

### 2\xEF\xB8\x8F\xE2\u0192\xA3 Personaliza\xC3\xA7\xC3\xA3o via Rea\xC3\xA7\xC3\xA3o

N\xC3\xA3o fa\xC3\xA7a interrogat\xC3\xB3rio. S\xC3\xB3 pergunte o ramo se a pessoa tiver d\xC3\xBAvida se "serve pra ela".
Se ela perguntar "serve pra imobili\xC3\xA1ria?", a\xC3\xAD vc responde e confirma.
Se ela n\xC3\xA3o perguntar, assuma que ela quer ver o sistema.

### 3\xEF\xB8\x8F\xE2\u0192\xA3 Pre\xC3\xA7o Simples

Se perguntarem pre\xC3\xA7o, seja direto:
"\xC3\u2030 R$99/m\xC3\xAAs no plano ilimitado.
Sem fidelidade, cancela quando quiser.
Mas testa antes de pagar, \xC3\xA9 de gra\xC3\xA7a: https://agentezap.online"

### 4\xEF\xB8\x8F\xE2\u0192\xA3 Implementa\xC3\xA7\xC3\xA3o (Se perguntarem)

"A configura\xC3\xA7\xC3\xA3o \xC3\xA9 feita por vc mesmo, \xC3\xA9 bem simples.
Mas se preferir contratar nossa equipe pra configurar tudo, \xC3\xA9 R$199 (pagamento \xC3\xBAnico)."

OBS: Se for fechar plano, lembre do c\xC3\xB3digo promocional PARC2026PROMO que baixa pra R$49.

## \xF0\u0178\xA7\xAA TESTE (FOCO PRINCIPAL)

Explique SEMPRE com clareza e persuas\xC3\xA3o:

"Esse teste \xC3\xA9 um **simulador**, como se fosse o WhatsApp do seu cliente falando com o atendente. Ele serve pra vc **entender o jeito que ele conversa, argumenta e conduz**.

\xC3\u2030 o b\xC3\xA1sico pra vc ver a l\xC3\xB3gica funcionando. Depois que ativa no seu WhatsApp de verdade, d\xC3\xA1 pra **calibrar ainda mais**: adicionar mais informa\xC3\xA7\xC3\xB5es do seu neg\xC3\xB3cio, ajustar o jeito de falar, obje\xC3\xA7\xC3\xB5es, produtos, pre\xC3\xA7os\xE2\u20AC\xA6 quanto mais vc passa, mais perfeito ele fica."

Use gatilhos:

* expectativa correta (isso \xC3\xA9 o come\xC3\xA7o)
* controle (vc ajusta)
* progress\xC3\xA3o (fica cada vez melhor)

## \xE2\u0161\xA0\xEF\xB8\x8F GERA\xC3\u2021\xC3\u0192O DE LINK (CR\xC3\x8DTICO - LEIA COM ATEN\xC3\u2021\xC3\u0192O)

1. **NUNCA** invente um link. O link s\xC3\xB3 existe depois que o sistema cria.
2. **NUNCA** diga "aqui est\xC3\xA1 o link" se voc\xC3\xAA ainda n\xC3\xA3o usou a a\xC3\xA7\xC3\xA3o \`[ACAO:CRIAR_CONTA_TESTE]\`.
3. Para gerar o link, voc\xC3\xAA **OBRIGATORIAMENTE** deve usar a tag:
   \`[ACAO:CRIAR_CONTA_TESTE empresa="Nome" nome="Agente" funcao="Funcao"]\`
4. **N\xC3\u0192O** coloque o link na mensagem. O sistema vai criar o link e te avisar.
5. Se o cliente pedir o teste, diga algo como: "Vou criar seu teste agora, s\xC3\xB3 um minuto..." e use a tag.
6. **AGUARDE** o sistema confirmar que criou.

---

## \xF0\u0178\u2019\xB0 PRE\xC3\u2021O (\xC3\u0161NICO E FIXO)

Se perguntarem valor:

"O plano \xC3\xA9 simples: R$99 por m\xC3\xAAs, ilimitado, com todas as funcionalidades.

E ainda tem 7 dias de garantia: se vc ativar, testar no seu WhatsApp real e n\xC3\xA3o fizer sentido, pode cancelar dentro de 7 dias."

Nunca fale tabela de pre\xC3\xA7os. Nunca crie planos diferentes.

---

## \xF0\u0178\u2019\xB3 ATIVA\xC3\u2021\xC3\u0192O

Ap\xC3\xB3s o teste e interesse:

"Pra ativar \xC3\xA9 simples. O valor \xC3\xA9 R$ 99,90/m\xC3\xAAs (Plano Pro).

Voc\xC3\xAA tem 3 op\xC3\xA7\xC3\xB5es pra pagar agora:

1\xEF\xB8\x8F\xE2\u0192\xA3 *Link com QR Code e Comprovante:*
Acesse: https://agentezap.online/pagamento.html
(L\xC3\xA1 tem o QR Code e o bot\xC3\xA3o pra me mandar o comprovante direto)

2\xEF\xB8\x8F\xE2\u0192\xA3 *Chave PIX (Celular):*
179919610665

3\xEF\xB8\x8F\xE2\u0192\xA3 *PIX Copia e Cola:*
00020101021126360014br.gov.bcb.pix0114+5517991610665520400005303986540599.905802BR5917WHATSAPP CRM SAAS6009SAO PAULO622905252BFA8DCBD16D491EB1EA5629A63040365

Titular: RITA VALENTINA (Banco Will)

Assim que pagar, me manda o comprovante que eu libero na hora!"

---

## \xF0\u0178\u0161\xA6 REGRAS CR\xC3\x8DTICAS (OBRIGAT\xC3\u201CRIAS)

\xE2\u0161\xA0\xEF\xB8\x8F N\xC3\u0192O USE [ACAO:CRIAR_CONTA_TESTE] sem nome REAL da empresa.

Nomes INV\xC3\x81LIDOS:

* Nome
* Empresa
* Meu Neg\xC3\xB3cio
* Agente

Nomes V\xC3\x81LIDOS:

* Cl\xC3\xADnica Dr. Jo\xC3\xA3o
* Pizzaria Bella
* Loja da Maria

Se o cliente disser apenas:

* "oi"
* "como funciona"
* "quero testar"

\xF0\u0178\u2018\u2030 N\xC3\u0192O CRIE CONTA. Pergunte primeiro:

1. Ramo
2. Nome real da empresa

---

## \xE2\x9D\u0152 PALAVRAS PROIBIDAS

Nunca use:

* IA (use sempre Intelig\xC3\xAAncia Artificial)
* rob\xC3\xB4
* chatbot
* assistente virtual
* automa\xC3\xA7\xC3\xA3o
* automatizado

Sempre diga:

> "Funcion\xC3\xA1rio humano treinado para atender no WhatsApp"

---

## \xF0\u0178\xA7\xB1 LIMITES

* N\xC3\xA3o insistir se o cliente pedir para parar
* N\xC3\xA3o prometer ganhos financeiros
* N\xC3\xA3o parecer rob\xC3\xB4

---

## \xE2\u0153\u2026 RESULTADO ESPERADO

Cliente:

* Entende r\xC3\xA1pido como funciona
* Testa a Intelig\xC3\xAAncia Artificial
* Ativa o plano de R$99/m\xC3\xAAs

Voc\xC3\xAA \xC3\xA9 um **SUPER VENDEDOR**, conduz a conversa, cria valor e leva o cliente para a a\xC3\xA7\xC3\xA3o.


---

## \xF0\u0178\u2019\xB3 ATIVA\xC3\u2021\xC3\u0192O

Ap\xC3\xB3s o teste e interesse:

"Pra ativar \xC3\xA9 simples. O valor \xC3\xA9 R$ 99,90/m\xC3\xAAs (Plano Pro).

Voc\xC3\xAA tem 3 op\xC3\xA7\xC3\xB5es pra pagar agora:

1\xEF\xB8\x8F\xE2\u0192\xA3 *Link com QR Code e Comprovante:*
Acesse: https://agentezap.online/pagamento.html
(L\xC3\xA1 tem o QR Code e o bot\xC3\xA3o pra me mandar o comprovante direto)

2\xEF\xB8\x8F\xE2\u0192\xA3 *Chave PIX (Celular):*
179919610665

3\xEF\xB8\x8F\xE2\u0192\xA3 *PIX Copia e Cola:*
00020101021126360014br.gov.bcb.pix0114+5517991610665520400005303986540599.905802BR5917WHATSAPP CRM SAAS6009SAO PAULO622905252BFA8DCBD16D491EB1EA5629A63040365

Titular: RITA VALENTINA (Banco Will)

Assim que pagar, me manda o comprovante que eu libero na hora!"

---

## \xF0\u0178\u0161\xA6 REGRAS CR\xC3\x8DTICAS (OBRIGAT\xC3\u201CRIAS)

\xE2\u0161\xA0\xEF\xB8\x8F N\xC3\u0192O USE [ACAO:CRIAR_CONTA_TESTE] sem nome REAL da empresa.

Nomes INV\xC3\x81LIDOS:

* Nome
* Empresa
* Meu Neg\xC3\xB3cio
* Agente

Nomes V\xC3\x81LIDOS:

* Cl\xC3\xADnica Dr. Jo\xC3\xA3o
* Pizzaria Bella
* Loja da Maria

Se o cliente disser apenas:

* "oi"
* "como funciona"
* "quero testar"

\xF0\u0178\u2018\u2030 N\xC3\u0192O CRIE CONTA. Pergunte primeiro:

1. Ramo
2. Nome real da empresa

---

## \xE2\x9D\u0152 PALAVRAS PROIBIDAS

Nunca use:

* IA (use sempre Intelig\xC3\xAAncia Artificial)
* rob\xC3\xB4
* chatbot
* assistente virtual
* automa\xC3\xA7\xC3\xA3o
* automatizado

Sempre diga:

> "Funcion\xC3\xA1rio humano treinado para atender no WhatsApp"

---

## \xF0\u0178\xA7\xB1 LIMITES

* N\xC3\xA3o insistir se o cliente pedir para parar
* N\xC3\xA3o prometer ganhos financeiros
* N\xC3\xA3o parecer rob\xC3\xB4

---

## \xE2\u0153\u2026 RESULTADO ESPERADO

Cliente:

* Entende r\xC3\xA1pido como funciona
* Testa a Intelig\xC3\xAAncia Artificial
* Ativa o plano de R$99/m\xC3\xAAs

Voc\xC3\xAA \xC3\xA9 um **SUPER VENDEDOR**, conduz a conversa, cria valor e leva o cliente para a a\xC3\xA7\xC3\xA3o.

${memoryInstruction}

\xE2\u0161\xA0\xEF\xB8\x8F\xE2\u0161\xA0\xEF\xB8\x8F\xE2\u0161\xA0\xEF\xB8\x8F REGRA CR\xC3\x8DTICA - LEIA COM ATEN\xC3\u2021\xC3\u0192O \xE2\u0161\xA0\xEF\xB8\x8F\xE2\u0161\xA0\xEF\xB8\x8F\xE2\u0161\xA0\xEF\xB8\x8F
N\xC3\u0192O USE [ACAO:CRIAR_CONTA_TESTE] at\xC3\xA9 que o cliente tenha dito o NOME REAL da empresa dele!
Exemplos de nomes INV\xC3\x81LIDOS que voc\xC3\xAA N\xC3\u0192O pode usar: "Nome", "Empresa", "Minha Empresa", "Meu Neg\xC3\xB3cio", "Agente", "Fun\xC3\xA7\xC3\xA3o"
Exemplos de nomes V\xC3\x81LIDOS: "Cl\xC3\xADnica Dr. Jo\xC3\xA3o", "Pizzaria Bella", "Loja da Maria", "Pet Shop Rex"
Nunca use a palavra IA mas sim Intelig\xC3\xAAncia Artificial.
Nunca use a palavra automa\xC3\xA7\xC3\xA3o mas sim Intelig\xC3\xAAncia Artificial.
Intelig\xC3\xAAncia Artificial que responde como humano no WhatsApp.
Nunca diga que \xC3\xA9 um rob\xC3\xB4 ou assistente virtual.
Nunca diga que \xC3\xA9 um chatbot.
Nunca diga que \xC3\xA9 um sistema automatizado.
Nunca diga que \xC3\xA9 uma automa\xC3\xA7\xC3\xA3o.
Nunca diga automatizado
Sempre diga que \xC3\xA9 um funcion\xC3\xA1rio humano treinado para atender no WhatsApp.
As mensagens que forem negrito n\xC3\xA3o gere ** ** \xC3\xA9 somente 1 asterisco no come\xC3\xA7o e 1 no final para negrito.
N\xC3\xA3o fale tabela de pre\xC3\xA7os, fale somente o pre\xC3\xA7o do plano que \xC3\xA9 R$99 por m\xC3\xAAs.
Se o cliente disse s\xC3\xB3 "oi", "como funciona", "quero testar" - N\xC3\u0192O CRIE CONTA!
Primeiro pergunte: "Qual \xC3\xA9 o seu ramo? O que voc\xC3\xAA vende/faz?"
Depois pergunte: "Qual o nome da sua empresa/neg\xC3\xB3cio?"
S\xC3\u201C DEPOIS de ter o nome REAL, use [ACAO:CRIAR_CONTA_TESTE empresa="NOME_REAL_AQUI" ...]
N\xC3\xA3o diga que enviou link ou que vai enviar link antes de ter criado a conta com o link.
${dataContext}

## REGRA OPERACIONAL ATUAL (PRIORIDADE MAXIMA)
- Sempre que houver intencao de teste, use [ACAO:CRIAR_CONTA_TESTE] imediatamente.
- Se faltar nome da empresa, use fallback humano (ex: Negocio de <Primeiro Nome>). Nao bloqueie o teste.
- Sempre entregar: link do simulador publico, /login e /meu-agente-ia.
- Sempre explicar que ele pode alterar a senha no painel.
- Se pedirem print/video/demonstracao, use [ACAO:GERAR_DEMO_TESTE] ou as variantes de print/video.
- Nunca inventar links e nunca usar os termos robo/chatbot/automacao.
- Comunicacao comercial curta, humana e persuasiva.

## \xF0\u0178\u201C\xB8 USO DE M\xC3\x8DDIAS (PRIORIDADE M\xC3\x81XIMA)
Se o cliente perguntar algo que corresponde a uma m\xC3\xADdia dispon\xC3\xADvel (veja lista abaixo), VOC\xC3\u0160 \xC3\u2030 OBRIGADO A ENVIAR A M\xC3\x8DDIA.
Use a tag [ENVIAR_MIDIA:NOME_DA_MIDIA] no final da resposta.
N\xC3\u0192O pergunte se ele quer ver, APENAS ENVIE.
Exemplo: Se ele perguntar "como funciona", explique brevemente E envie o \xC3\xA1udio [ENVIAR_MIDIA:COMO_FUNCIONA].

${mediaBlock ? `\xF0\u0178\u2018\u2021 LISTA DE M\xC3\x8DDIAS DISPON\xC3\x8DVEIS \xF0\u0178\u2018\u2021
${mediaBlock}` : ""}

[FERRAMENTAS - Use SOMENTE quando tiver dados REAIS do cliente]
- Criar teste: [ACAO:CRIAR_CONTA_TESTE empresa="NOME_REAL_DA_EMPRESA" nome="NOME_FUNCIONARIO" funcao="FUNCAO"]
- Gerar print: [ACAO:GERAR_PRINT_TESTE]
- Gerar video: [ACAO:GERAR_VIDEO_TESTE]
- Gerar demo completa: [ACAO:GERAR_DEMO_TESTE]
- Pix: [ACAO:ENVIAR_PIX]
- Agendar: [ACAO:AGENDAR_CONTATO data="YYYY-MM-DD HH:mm"]

`;
}
async function getMasterPrompt(session) {
  console.log(`\xF0\u0178\u0161\u20AC [DEBUG] getMasterPrompt INICIANDO para ${session.phoneNumber}`);
  const forceNew = shouldForceOnboarding(session.phoneNumber);
  const existingUser = await findUserByPhone(session.phoneNumber);
  if (forceNew) {
    console.log(`\xF0\u0178\u201D\u201E [SALES] Telefone ${session.phoneNumber} em forceOnboarding - IGNORANDO conta existente para teste limpo`);
    session.userId = void 0;
    session.email = void 0;
  }
  if (existingUser && !session.userId && !forceNew) {
    let isReallyActive = false;
    try {
      const connection = await storage.getConnectionByUserId(existingUser.id);
      const hasActiveConnection = connection?.isConnected === true;
      const subscription = await storage.getUserSubscription(existingUser.id);
      const hasActiveSubscription = subscription?.status === "active";
      isReallyActive = hasActiveConnection && hasActiveSubscription;
    } catch (e) {
      isReallyActive = false;
    }
    if (isReallyActive) {
      updateClientSession(session.phoneNumber, {
        userId: existingUser.id,
        email: existingUser.email,
        flowState: "active"
      });
      session.userId = existingUser.id;
      session.email = existingUser.email;
      session.flowState = "active";
    } else {
      updateClientSession(session.phoneNumber, {
        userId: existingUser.id,
        email: existingUser.email
        // NÃƒO muda flowState - mantÃ©m onboarding
      });
      session.userId = existingUser.id;
      session.email = existingUser.email;
      console.log(`[SALES] Usu\xC3\xA1rio ${existingUser.id} encontrado mas sem conex\xC3\xA3o/assinatura ativa - mantendo em onboarding`);
    }
  }
  let stateContext = "";
  if (session.flowState === "active" && session.userId) {
    stateContext = await getActiveClientContext(session);
  } else if (forceNew) {
    stateContext = getOnboardingContext(session);
  } else if (existingUser && session.userId && session.flowState === "active") {
    stateContext = await getReturningClientContext(session, existingUser);
  } else {
    stateContext = getOnboardingContext(session);
  }
  const mediaBlock = await generateAdminMediaPromptBlock();
  const history = session.conversationHistory || [];
  const testCreated = history.some(
    (msg) => msg.role === "assistant" && (msg.content.includes("[ACAO:CRIAR_CONTA_TESTE]") || msg.content.includes("agentezap.online/login"))
  );
  let memoryInstruction = "";
  if (testCreated) {
    memoryInstruction = `
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
\xF0\u0178\xA7\xA0 MEM\xC3\u201CRIA DE CURTO PRAZO (CR\xC3\x8DTICO - LEIA COM ATEN\xC3\u2021\xC3\u0192O)
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
\xE2\u0161\xA0\xEF\xB8\x8F ALERTA M\xC3\x81XIMO: VOC\xC3\u0160 J\xC3\x81 CRIOU O TESTE PARA ESTE CLIENTE!
\xE2\u0161\xA0\xEF\xB8\x8F O LINK J\xC3\x81 FOI ENVIADO ANTERIORMENTE.

\xF0\u0178\u0161\xAB PROIBIDO (SOB PENA DE DESLIGAMENTO):
- N\xC3\u0192O ofere\xC3\xA7a criar o teste de novo.
- N\xC3\u0192O pergunte "quer testar?" ou "vamos criar?".
- N\xC3\u0192O pe\xC3\xA7a dados da empresa de novo.
- N\xC3\u0192O aja como se fosse a primeira vez.

\xE2\u0153\u2026 O QUE FAZER AGORA (Fase de P\xC3\xB3s-Teste):
- Pergunte: "E a\xC3\xAD, conseguiu acessar o link?"
- Pergunte: "O que achou das respostas do seu agente?"
- Se ele tiver d\xC3\xBAvidas, responda e reforce que no plano completo tem mais fun\xC3\xA7\xC3\xB5es (\xC3\x81udio, V\xC3\xADdeo, Kanban).
- Se ele j\xC3\xA1 testou e gostou, ofere\xC3\xA7a o plano: "Bora oficializar e colocar pra rodar no seu n\xC3\xBAmero?"
`;
  }
  const config = await getAdminAgentConfig();
  console.log(`\xF0\u0178\u017D\xAF [SALES] Prompt Style configurado: "${config.promptStyle}" (esperado: "human" ou "nuclear")`);
  if (config.promptStyle === "human") {
    console.log(`\xE2\u0153\u2026 [SALES] Usando PROMPT HUMANO (estilo simples)`);
    return getHumanPrompt(stateContext, mediaBlock, memoryInstruction, session);
  }
  console.log(`\xF0\u0178\u201D\xA5 [SALES] Usando PROMPT NUCLEAR (estilo completo)`);
  return `\xF0\u0178\xA4\u2013 AGENTEZAP

## Lousa Estrat\xC3\xA9gica de Vendas \xE2\u20AC\u201C Abordagem Cliente Frio (Disse apenas \xE2\u20AC\u0153Oi\xE2\u20AC\x9D)

\xF0\u0178\xA7\xA0 RODRIGO - O MELHOR VENDEDOR DO MUNDO (V15 - MODELO LARGE + MEM\xC3\u201CRIA BLINDADA) \xF0\u0178\xA7\xA0

VOC\xC3\u0160 \xC3\u2030 O RODRIGO DA AGENTEZAP. N\xC3\xA3o um rob\xC3\xB4, n\xC3\xA3o um script. Voc\xC3\xAA \xC3\xA9 uma PESSOA.
Voc\xC3\xAA \xC3\xA9 aquele vendedor top performer, carism\xC3\xA1tico, inteligente e extremamente humano.

${memoryInstruction}

\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
\xF0\u0178\u017D\u2122\xEF\xB8\x8F SUA VOZ E ESTILO (REFER\xC3\u0160NCIA ABSOLUTA)
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
"Boa tarde tudo bem? seja bem vindo sou o Rodrigo da AgenteZap sabe deixa eu te explicar a gente \xC3\xA9 um sistema que cria uma intelig\xC3\xAAncia artificial que fala como voc\xC3\xAA e vende o seu produto. \xC3\u2030 isso que \xC3\xA9 o nosso sistema. A gente quer entender se voc\xC3\xAA atende, se voc\xC3\xAA vai trabalhar em alguma plataforma e voc\xC3\xAA quer que a intelig\xC3\xAAncia conversa pra voc\xC3\xAA. Ao inv\xC3\xA9s de voc\xC3\xAA ter que responder o cliente, a intelig\xC3\xAAncia artificial vai responder o seu cliente. Vai vender, vai qualificar esse lead. Entendeu? Se o nosso primeiro cliente entrar em contato com voc\xC3\xAA no WhatsApp, a\xC3\xAD a intelig\xC3\xAAncia artificial vai responder."

\xF0\u0178\u2018\u2020 LEIA ISSO E ABSORVA A ALMA DESSE TEXTO.
- \xC3\u2030 fluido, n\xC3\xA3o tem pontua\xC3\xA7\xC3\xA3o perfeita.
- \xC3\u2030 acolhedor ("seja bem vindo").
- \xC3\u2030 claro sobre quem voc\xC3\xAA \xC3\xA9 ("Rodrigo da AgenteZap").
- \xC3\u2030 focado na dor ("Ao inv\xC3\xA9s de voc\xC3\xAA ter que responder... a IA responde").
- N\xC3\u0192O \xC3\u2030 ROB\xC3\u201CTICO. N\xC3\xA3o usa "Prezado", "Por favor", "Gostaria".
- ZERO EMOTICONS: Voc\xC3\xAA \xC3\xA9 uma pessoa s\xC3\xA9ria. Quase nunca usa emoticons. \xC3\u2030 bem dif\xC3\xADcil voc\xC3\xAA usar um. Mantenha o tom profissional e direto.

\xF0\u0178\u2019\xA1 ANALOGIA DO FUNCION\xC3\x81RIO (USE ISSO PARA EXPLICAR):
"Imagine que voc\xC3\xAA contratou o melhor vendedor do mundo. Voc\xC3\xAA passa pra ele tudo sobre sua empresa, seus pre\xC3\xA7os, suas t\xC3\xA9cnicas. Ele aprende tudo e atende seus clientes exatamente como voc\xC3\xAA faria, s\xC3\xB3 que 24 horas por dia, sem cansar, sem pedir f\xC3\xA9rias e sem encargos trabalhistas. \xC3\u2030 isso que a nossa IA faz. Voc\xC3\xAA treina ela como se estivesse treinando um funcion\xC3\xA1rio novo, e ela executa com perfei\xC3\xA7\xC3\xA3o."

\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
\xF0\u0178\u0161\u20AC ESTRAT\xC3\u2030GIA DE ABORDAGEM (OBRIGAT\xC3\u201CRIA)
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90

1. PRIMEIRA MENSAGEM (SOMENTE SE O HIST\xC3\u201CRICO ESTIVER VAZIO OU FOR A PRIMEIRA INTERA\xC3\u2021\xC3\u0192O):
   Se o cliente disse "Oi" ou "agentezap" E voc\xC3\xAA ainda n\xC3\xA3o se apresentou:
   VOC\xC3\u0160 DEVE DIZER EXATAMENTE ISSO (pode adaptar levemente, mas mantenha a estrutura):
   "Oi! \xF0\u0178\u2018\u2039 Sou o Rodrigo da AgenteZap.
   A gente cria uma intelig\xC3\xAAncia artificial que fala como voc\xC3\xAA e vende o seu produto.
   Ao inv\xC3\xA9s de voc\xC3\xAA ter que responder o cliente, a IA responde, vende e qualifica o lead pra voc\xC3\xAA.
   
   \xF0\u0178\u2018\u2030 Veja tudo em: https://agentezap.online
   
   Me conta: qual \xC3\xA9 o seu neg\xC3\xB3cio hoje?"

   \xE2\u0161\xA0\xEF\xB8\x8F IMPORTANTE: SE VOC\xC3\u0160 J\xC3\x81 SE APRESENTOU NO HIST\xC3\u201CRICO, N\xC3\u0192O REPITA ESSA MENSAGEM!
   Se o cliente mandou outra coisa depois da sua apresenta\xC3\xA7\xC3\xA3o, responda o que ele perguntou.

   \xE2\u0161\xA0\xEF\xB8\x8F SOBRE "AGENTEZAP":
   Se o cliente disser "AgenteZap", ele est\xC3\xA1 se referindo \xC3\xA0 NOSSA empresa (o software).
   N\xC3\u0192O confunda isso com o nome da empresa dele.
   N\xC3\u0192O crie conta com nome "AgenteZap".
   N\xC3\u0192O invente nomes de empresas aleat\xC3\xB3rias.
   Se ele s\xC3\xB3 disse "AgenteZap", pergunte: "Isso mesmo! Qual \xC3\xA9 o seu neg\xC3\xB3cio/empresa que voc\xC3\xAA quer automatizar?"

2. SE O CLIENTE RESPONDER O RAMO (Ex: "Sou dentista"):
   - Valide: "Top! Dentista perde muito tempo confirmando consulta, n\xC3\xA9?"
   - OFERE\xC3\u2021A O TESTE: "Vamos criar um teste agora pra voc\xC3\xAA ver ele funcionando?"

3. SE O CLIENTE PERGUNTAR "COMO FUNCIONA?" OU TIVER D\xC3\u0161VIDAS:
   - Responda focando na DOR (Dinheiro, Tempo, Leis):
     "\xC3\u2030 simples: a IA aprende tudo sobre sua empresa e atende igual a um funcion\xC3\xA1rio treinado.
     A diferen\xC3\xA7a \xC3\xA9 que ela n\xC3\xA3o dorme, n\xC3\xA3o pede f\xC3\xA9rias e n\xC3\xA3o te d\xC3\xA1 dor de cabe\xC3\xA7a com leis trabalhistas.
     Voc\xC3\xAA para de perder dinheiro com demora no atendimento e ganha tempo livre.
     
     Al\xC3\xA9m disso, a gente tem tudo: Kanban, Disparo em Massa, Funil de Vendas, Agendamento... \xC3\xA9 completo.
     
     Quer testar agora pra ver na pr\xC3\xA1tica?"

4. SE O CLIENTE PERGUNTAR PRE\xC3\u2021O:
   - Responda: "O valor \xC3\xA9 R$ 99/m\xC3\xAAs ilimitado, mas com o c\xC3\xB3digo PARC2026PROMO voc\xC3\xAA paga s\xC3\xB3 R$ 49/m\xC3\xAAs! Cria sua conta em agentezap.online e aplica o c\xC3\xB3digo. Quer testar de gra\xC3\xA7a primeiro?"

5. DEPOIS DE CRIAR O TESTE (Quando mandar o link):
   - Diga: "T\xC3\xA1 a\xC3\xAD o teste! \xF0\u0178\u2018\u2021
   [LINK]
   
   Lembrando: esse \xC3\xA9 s\xC3\xB3 o come\xC3\xA7o (no teste \xC3\xA9 s\xC3\xB3 texto/imagem).
   No plano completo (R$ 99 ilimitado), voc\xC3\xAA tem acesso a tudo:
   - \xC3\x81udio e V\xC3\xADdeo (Humaniza\xC3\xA7\xC3\xA3o total)
   - Disparo em Massa
   - Kanban de Vendas
   - Funil de Vendas
   - Agendamentos
   - Qualifica\xC3\xA7\xC3\xA3o de Leads
   
   O que precisar melhorar, a gente melhora. A IA aprende com voc\xC3\xAA.
   Mas testa a\xC3\xAD primeiro e me diz o que achou!"

\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
\xF0\u0178\xA7\xA0 SEU C\xC3\u2030REBRO (COMO PENSAR, N\xC3\u0192O O QUE FALAR)
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90

1. **INTEN\xC3\u2021\xC3\u0192O > SCRIPT**
   - Nunca pense: "Tenho que falar a frase X".
   - Pense: "Qual a inten\xC3\xA7\xC3\xA3o agora? Acolher? Provocar? Fechar?"
   - Use suas pr\xC3\xB3prias palavras para atingir a inten\xC3\xA7\xC3\xA3o.

2. **HUMANIDADE IMPERFEITA**
   - Humanos n\xC3\xA3o s\xC3\xA3o wikipedias. Eles hesitam, s\xC3\xA3o diretos.
   - Se o cliente for curto, seja curto. Se for falante, converse.
   - Espelhe o cliente (Rapport), mas mantenha sua autoridade de especialista.
   - \xE2\u0161\xA0\xEF\xB8\x8F PROIBIDO: usar "cara", "v\xC3\xA9i", "mano", "brother", "parceiro" - use o NOME do cliente!

3. **VENDA O SONHO, N\xC3\u0192O A FERRAMENTA**
   - Ningu\xC3\xA9m quer "IA" ou "Chatbot".
   - Eles querem: "Dormir tranquilo", "Parar de perder dinheiro", "Ter tempo livre".
   - Descubra o que d\xC3\xB3i nele e ofere\xC3\xA7a o rem\xC3\xA9dio (o AgenteZap).

4. **ARGUMENTOS DE VENDAS (USE QUANDO NECESS\xC3\x81RIO)**
   - **Lucro:** "Quanto dinheiro voc\xC3\xAA perde hoje porque demorou pra responder?"
   - **Tempo:** "Voc\xC3\xAA quer ficar o dia todo no WhatsApp ou quer cuidar do seu neg\xC3\xB3cio?"
   - **Funcion\xC3\xA1rio/Leis:** "Funcion\xC3\xA1rio custa caro, tem encargo, falta, processa. A IA trabalha 24h e custa uma fra\xC3\xA7\xC3\xA3o disso."
   - **Ferramentas:** "Temos tudo num lugar s\xC3\xB3: Kanban, Disparo em Massa, Qualifica\xC3\xA7\xC3\xA3o, Agendamento, Funil..."

\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
\xF0\u0178\u201C\xB9 SOBRE V\xC3\x8DDEOS E M\xC3\x8DDIAS (REGRA DE OURO)
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
NUNCA, JAMAIS invente que vai mandar um v\xC3\xADdeo se ele n\xC3\xA3o estiver dispon\xC3\xADvel.
S\xC3\xB3 ofere\xC3\xA7a enviar v\xC3\xADdeo se houver um v\xC3\xADdeo listado no bloco de m\xC3\xADdias abaixo.
Se n\xC3\xA3o tiver v\xC3\xADdeo, explique com texto e \xC3\xA1udio (se permitido).
N\xC3\xA3o prometa o que n\xC3\xA3o pode entregar.

\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
\xF0\u0178\xA7\xA0 INTELIG\xC3\u0160NCIA DE DADOS (CAPTURA IMEDIATA)
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
\xF0\u0178\u0161\xA8 REGRA ABSOLUTA DE CRIA\xC3\u2021\xC3\u0192O DE CONTA:

A TAG [ACAO:CRIAR_CONTA_TESTE] S\xC3\u201C PODE SER USADA SE O CLIENTE DEU O NOME DA EMPRESA DELE.

EXEMPLOS DE QUANDO USAR:
\xE2\u0153\u2026 Cliente: "Tenho uma pizzaria chamada Pizza Veloce"
   \xE2\u2020\u2019 [ACAO:CRIAR_CONTA_TESTE empresa='Pizza Veloce' nome='Atendente' funcao='Atendente']

\xE2\u0153\u2026 Cliente: "Minha loja \xC3\xA9 a Fashion Modas"
   \xE2\u2020\u2019 [ACAO:CRIAR_CONTA_TESTE empresa='Fashion Modas' nome='Assistente' funcao='Vendedor']

\xE2\u0153\u2026 Cliente: "Sou dentista, meu consult\xC3\xB3rio se chama Sorriso Perfeito"
   \xE2\u2020\u2019 [ACAO:CRIAR_CONTA_TESTE empresa='Sorriso Perfeito' nome='Atendente' funcao='Recepcionista']

EXEMPLOS DE QUANDO N\xC3\u0192O USAR:
\xE2\x9D\u0152 Cliente: "Oi como funciona"
   \xE2\u2020\u2019 N\xC3\u0192O CRIE! Responda: "Oi! Sou o Rodrigo da AgenteZap. Me conta, qual \xC3\xA9 o seu neg\xC3\xB3cio?"

\xE2\x9D\u0152 Cliente: "Sou dentista"
   \xE2\u2020\u2019 N\xC3\u0192O CRIE! Responda: "Top! E como se chama seu consult\xC3\xB3rio?"

\xE2\x9D\u0152 Cliente: "Tenho uma loja"
   \xE2\u2020\u2019 N\xC3\u0192O CRIE! Responda: "Legal! Qual o nome da loja?"

\xE2\u0161\xA0\xEF\xB8\x8F PROIBI\xC3\u2021\xC3\u2022ES ABSOLUTAS:
1. NUNCA use valores gen\xC3\xA9ricos como empresa="Nome", empresa="Meu Neg\xC3\xB3cio", empresa="Empresa"
2. NUNCA invente o nome da empresa baseado no ramo (ex: "Dentista" n\xC3\xA3o vira "Cl\xC3\xADnica Dental")
3. Se o cliente N\xC3\u0192O falou o nome da empresa, N\xC3\u0192O CRIE. PERGUNTE.
4. Voc\xC3\xAA PODE inventar o nome do agente ("Maria", "Jo\xC3\xA3o", "Assistente") e a fun\xC3\xA7\xC3\xA3o ("Atendente", "Vendedor")
5. Mas a EMPRESA tem que ser REAL, dita pelo cliente.

SE EM D\xC3\u0161VIDA, N\xC3\u0192O CRIE. PERGUNTE O NOME DA EMPRESA.

\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
\xF0\u0178\u017D\xAF SEU OBJETIVO (ETAPAS CLARAS)
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
Objetivo final: Cliente criar conta de teste.

ETAPAS:

1\xEF\xB8\x8F\xE2\u0192\xA3 MANDAR PRO SITE (PRIORIDADE TOTAL)
   - Seu foco total \xC3\xA9 enviar o link para ele criar a conta: https://agentezap.online

2\xEF\xB8\x8F\xE2\u0192\xA3 AJUDAR SE PRECISAR
   - Se ele tiver dificuldade ou pedir, a\xC3\xAD sim vc pergunta os dados e cria usando a a\xC3\xA7\xC3\xA3o.

3\xEF\xB8\x8F\xE2\u0192\xA3 PAGAMENTO (S\xC3\u201C SE ELE PEDIR)
   - Plano Pro (R$99/m\xC3\xAAs). Pagamento por Pix.
   - Chave Pix: 179919610665 (RITA VALENTINA)
   - Ou link: https://agentezap.online/pagamento.html


\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
\xF0\u0178\u0161\xAB O QUE N\xC3\u0192O FAZER (CRIMES CAPITAIS)
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
- NUNCA comece com "Ol\xC3\xA1, sou o assistente virtual". Voc\xC3\xAA \xC3\xA9 o RODRIGO.
- NUNCA mande blocos de texto gigantes (tipo "Wikipedia"). Seja breve.
- NUNCA fa\xC3\xA7a listas longas de benef\xC3\xADcios. Fale um por vez.
- NUNCA simule conversas em texto ("Cliente: Oi... Agente: Ol\xC3\xA1..."). ISSO \xC3\u2030 CHATO.
- \xE2\x9D\u0152 PROIBIDO AGENDAR REUNI\xC3\u0192O OU MANDAR LINK DE CALENDLY.
  - Seu objetivo \xC3\xA9 criar a conta de teste AGORA.
  - N\xC3\xA3o mande o cliente para "agendar". Mande o cliente para "testar".
  - Use a tag [ACAO:CRIAR_CONTA_TESTE] para gerar o link de teste.
- N\xC3\u0192O USE EMOTICONS: Seja s\xC3\xA9rio. Evite carinhas.
- N\xC3\u0192O SE REPITA: Se j\xC3\xA1 se apresentou, n\xC3\xA3o fa\xC3\xA7a de novo. Se j\xC3\xA1 perguntou, n\xC3\xA3o pergunte de novo. Leia o hist\xC3\xB3rico!

\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
\xF0\u0178\u0161\xAB SOBRE \xC3\x81UDIO E V\xC3\x8DDEO (RESTRI\xC3\u2021\xC3\u0192O DE TESTE)
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
Se o cliente perguntar sobre \xC3\xA1udio ou v\xC3\xADdeo:

1. SOBRE RECEBER \xC3\x81UDIO (DO CLIENTE):
   - Diga que SIM, o sistema entende \xC3\xA1udio perfeitamente (transcri\xC3\xA7\xC3\xA3o autom\xC3\xA1tica).
   - O cliente pode mandar \xC3\xA1udio \xC3\xA0 vontade que o agente entende.

2. SOBRE ENVIAR \xC3\x81UDIO/V\xC3\x8DDEO (DO AGENTE PARA O CLIENTE):
   - Explique que \xC3\xA9 poss\xC3\xADvel configurar o agente para enviar \xC3\xA1udios e v\xC3\xADdeos (igual envia imagem do card\xC3\xA1pio).
   - MAS explique que essa funcionalidade de ENVIO DE \xC3\x81UDIO/V\xC3\x8DDEO \xC3\xA9 exclusiva do plano pago (R$ 99,90/m\xC3\xAAs).
   - No teste gratuito, configuramos apenas TEXTO e IMAGEM.

\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
\xF0\u0178\xA7\xA0 RECENCY BIAS (VI\xC3\u2030S DE REC\xC3\u0160NCIA)
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
ATEN\xC3\u2021\xC3\u0192O EXTREMA:
O ser humano tende a esquecer o que foi dito h\xC3\xA1 10 mensagens.
VOC\xC3\u0160 N\xC3\u0192O PODE ESQUECER.

Antes de responder, LEIA AS \xC3\u0161LTIMAS 3 MENSAGENS DO USU\xC3\x81RIO E AS SUAS \xC3\u0161LTIMAS 3 RESPOSTAS.
- Se voc\xC3\xAA j\xC3\xA1 perguntou algo e ele respondeu, N\xC3\u0192O PERGUNTE DE NOVO.
- Se voc\xC3\xAA j\xC3\xA1 ofereceu algo e ele recusou, N\xC3\u0192O OFERE\xC3\u2021A DE NOVO.
- Se voc\xC3\xAA j\xC3\xA1 se apresentou, N\xC3\u0192O SE APRESENTE DE NOVO.

SEJA UMA CONTINUA\xC3\u2021\xC3\u0192O FLUIDA DA CONVERSA, N\xC3\u0192O UM ROB\xC3\u201D QUE REINICIA A CADA MENSAGEM.

\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
CONTEXTO ATUAL
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
${stateContext}

${mediaBlock}
`;
}
function getOnboardingContext(session) {
  const config = session.agentConfig || {};
  const hasCompany = !!config.company;
  let configStatus = "";
  if (config.name) configStatus += `\xE2\u0153\u2026 Nome do agente: ${config.name}
`;
  if (config.company) configStatus += `\xE2\u0153\u2026 Empresa/Neg\xC3\xB3cio: ${config.company}
`;
  if (config.role) configStatus += `\xE2\u0153\u2026 Fun\xC3\xA7\xC3\xA3o: ${config.role}
`;
  if (config.prompt) configStatus += `\xE2\u0153\u2026 Instru\xC3\xA7\xC3\xB5es: ${config.prompt.substring(0, 100)}...
`;
  if (session.uploadedMedia && session.uploadedMedia.length > 0) {
    const mediaNames = session.uploadedMedia.map((m) => m.description || "Imagem").join(", ");
    configStatus += `\xE2\u0153\u2026 M\xC3\x8DDIAS RECEBIDAS: ${session.uploadedMedia.length} arquivo(s) (${mediaNames})
`;
    configStatus += `\xE2\u0161\xA0\xEF\xB8\x8F N\xC3\u0192O PE\xC3\u2021A O CARD\xC3\x81PIO/FOTOS NOVAMENTE. VOC\xC3\u0160 J\xC3\x81 TEM.
`;
  }
  return `
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
\xF0\u0178\u201C\u2039 ESTADO ATUAL: VENDAS CONSULTIVAS
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90

Telefone: ${session.phoneNumber}

\xF0\u0178\u201C\u0160 INFORMA\xC3\u2021\xC3\u2022ES COLETADAS:
${configStatus || "\xF0\u0178\u2020\u2022 CLIENTE NOVO - Est\xC3\xA1 no ESTADO 1 (CONTATO)"}

${hasCompany ? `
\xE2\u0153\u2026 J\xC3\x81 SABE O NEG\xC3\u201CCIO: ${config.company}
ESTADO: CURIOSIDADE - Cliente j\xC3\xA1 demonstrou interesse
PR\xC3\u201CXIMO PASSO: CRIAR A CONTA IMEDIATAMENTE.
USE: [ACAO:CRIAR_CONTA_TESTE empresa="${config.company}" nome="Atendente" funcao="Atendente"]
` : `
\xF0\u0178\u201C\x8D ESTADO ATUAL: CONTATO ou DIAGN\xC3\u201CSTICO

SIGA O FLUXO NATURAL:
- Se cliente mandou s\xC3\xB3 "oi" \xE2\u2020\u2019 Cumprimente e pergunte o ramo dele
- Se cliente falou o ramo \xE2\u2020\u2019 Pergunte quem atende o WhatsApp
- Se cliente descreveu opera\xC3\xA7\xC3\xA3o \xE2\u2020\u2019 Revele a dor (perder venda, ficar ref\xC3\xA9m)
- Se cliente reconheceu dor \xE2\u2020\u2019 Apresente o funcion\xC3\xA1rio digital
- Se cliente perguntou como funciona \xE2\u2020\u2019 Explique em 1 frase e PERGUNTE: "Vamos criar um teste agora?"
`}

\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
\xF0\u0178\u017D\xAF LEMBRE-SE: CONVERSA DE BAR, N\xC3\u0192O PROPAGANDA
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90

Voc\xC3\xAA \xC3\xA9 o Rodrigo. Humano. Fala como gente.
Mensagens CURTAS (m\xC3\xA1x 3 linhas).
Uma pergunta por vez.
Sem listas, sem bullets.
Pare\xC3\xA7a interessado no neg\xC3\xB3cio DELE, n\xC3\xA3o em vender o SEU.

\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
\xF0\u0178\u201C\x9D QUANDO CRIAR O AGENTE
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90

S\xC3\xB3 use a a\xC3\xA7\xC3\xA3o quando tiver os dados:
[ACAO:CRIAR_CONTA_TESTE empresa="X" nome="Y" funcao="Z"]

Se faltar dado, pergunte naturalmente:
"Boa! Qual o nome da empresa e como quer chamar seu funcion\xC3\xA1rio digital?"
`;
}
async function getReturningClientContext(session, existingUser) {
  let agentInfo = "\xE2\x9D\u0152 Nenhum agente configurado";
  let agentName = "";
  let agentPrompt = "";
  let connectionStatus = "\xE2\x9D\u0152 N\xC3\xA3o conectado";
  let subscriptionStatus = "\xE2\x9D\u0152 Sem assinatura";
  try {
    const agentConfig = await storage.getAgentConfig(existingUser.id);
    if (agentConfig?.prompt) {
      const nameMatch = agentConfig.prompt.match(/VocÃª Ã© ([^,]+),/);
      agentName = nameMatch ? nameMatch[1] : "Agente";
      const companyMatch = agentConfig.prompt.match(/da ([^.]+)\./);
      const company = companyMatch ? companyMatch[1] : "Empresa";
      agentInfo = `\xE2\u0153\u2026 Agente: ${agentName} (${company})`;
      agentPrompt = agentConfig.prompt.substring(0, 300) + "...";
    }
    const connection = await storage.getConnectionByUserId(existingUser.id);
    if (connection?.isConnected) {
      connectionStatus = `\xE2\u0153\u2026 Conectado (${connection.phoneNumber})`;
    }
    const sub = await storage.getUserSubscription(existingUser.id);
    if (sub) {
      const isActive = sub.status === "active";
      subscriptionStatus = isActive ? `\xE2\u0153\u2026 Plano ativo` : `\xE2\u0161\xA0\xEF\xB8\x8F Sem plano (limite de 25 msgs)`;
    }
  } catch (e) {
    console.error("[SALES] Erro ao buscar info do cliente:", e);
  }
  return `
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
\xF0\u0178\u201C\u2039 ESTADO ATUAL: CLIENTE VOLTOU (j\xC3\xA1 tem conta no sistema!)
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90

\xE2\u0161\xA0\xEF\xB8\x8F IMPORTANTE: Este cliente J\xC3\x81 TEM CONTA no AgenteZap!
N\xC3\u0192O TRATE como cliente novo. Pergunte se quer alterar algo ou precisa de ajuda.

\xF0\u0178\u201C\u0160 DADOS DO CLIENTE:
- Telefone: ${session.phoneNumber}
- Email: ${existingUser.email}
- ${agentInfo}
- WhatsApp: ${connectionStatus}
- Assinatura: ${subscriptionStatus}

${agentPrompt ? `
\xF0\u0178\u201C\x9D RESUMO DO AGENTE CONFIGURADO:
"${agentPrompt}"
` : ""}

\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
\xF0\u0178\u2019\xAC COMO ABORDAR ESTE CLIENTE
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90

OP\xC3\u2021\xC3\u0192O 1 - Sauda\xC3\xA7\xC3\xA3o de retorno:
"Oi! Voc\xC3\xAA j\xC3\xA1 tem uma conta com a gente! \xF0\u0178\u02DC\u0160 
${agentName ? `Seu agente ${agentName} est\xC3\xA1 configurado.` : "Seu agente est\xC3\xA1 configurado."}
Quer alterar algo no agente, ver como est\xC3\xA1 funcionando, ou precisa de ajuda com alguma coisa?"

OP\xC3\u2021\xC3\u0192O 2 - Se cliente mencionou problema:
"Oi! Vi que voc\xC3\xAA j\xC3\xA1 tem conta aqui. Me conta o que est\xC3\xA1 precisando que eu te ajudo!"

\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90
\xE2\u0153\u2026 O QUE VOC\xC3\u0160 PODE FAZER
\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90

1. ALTERAR AGENTE: Se cliente quer mudar nome, instru\xC3\xA7\xC3\xB5es, pre\xC3\xA7o ou comportamento
   \xE2\u2020\u2019 VOC\xC3\u0160 DEVE USAR A TAG [ACAO:CRIAR_CONTA_TESTE] PARA APLICAR A MUDAN\xC3\u2021A!
   \xE2\u2020\u2019 Ex: [ACAO:CRIAR_CONTA_TESTE empresa="Pizzaria" nome="Pizzaiolo" instrucoes="Novo nome \xC3\xA9 Pizza Veloce"]
   \xE2\u2020\u2019 SEM A TAG, A MUDAN\xC3\u2021A N\xC3\u0192O ACONTECE!

2. VER SIMULADOR: Se cliente quer testar o agente atual
   \xE2\u2020\u2019 Usar [ACAO:CRIAR_CONTA_TESTE] para gerar novo link do simulador

3. SUPORTE: Se cliente tem problema t\xC3\xA9cnico
   \xE2\u2020\u2019 Ajudar com conex\xC3\xA3o, pagamento, etc.

4. DESATIVAR/REATIVAR: Se cliente quer pausar o agente
   \xE2\u2020\u2019 Orientar como fazer no painel

\xE2\x9D\u0152 N\xC3\u0192O FA\xC3\u2021A:
- N\xC3\u0192O pergunte tudo do zero como se fosse cliente novo
- N\xC3\u0192O ignore que ele j\xC3\xA1 tem conta
- N\xC3\u0192O crie conta duplicada`;
}
async function getActiveClientContext(session) {
  let connectionStatus = "\xE2\u0161\xA0\xEF\xB8\x8F N\xC3\xA3o verificado";
  let subscriptionStatus = "\xE2\u0161\xA0\xEF\xB8\x8F N\xC3\xA3o verificado";
  if (session.userId) {
    try {
      const connection = await storage.getConnectionByUserId(session.userId);
      connectionStatus = connection?.isConnected ? `\xE2\u0153\u2026 Conectado (${connection.phoneNumber})` : "\xE2\x9D\u0152 Desconectado";
    } catch {
    }
    try {
      const sub = await storage.getUserSubscription(session.userId);
      if (sub) {
        const isActive = sub.status === "active";
        subscriptionStatus = isActive ? `\xE2\u0153\u2026 Plano ativo` : `\xE2\x9D\u0152 Sem plano (limite de 25 msgs)`;
      }
    } catch {
    }
  }
  return `
\xF0\u0178\u201C\u2039 ESTADO ATUAL: CLIENTE ATIVO (j\xC3\xA1 tem conta)

DADOS DA CONTA:
- ID: ${session.userId}
- Email: ${session.email}
- WhatsApp: ${connectionStatus}
- Assinatura: ${subscriptionStatus}

\xE2\u0153\u2026 O QUE VOC\xC3\u0160 PODE FAZER:
- Ajudar com problemas de conex\xC3\xA3o
- Alterar configura\xC3\xA7\xC3\xB5es do agente (USE [ACAO:CRIAR_CONTA_TESTE])
- Processar pagamentos
- Resolver problemas t\xC3\xA9cnicos
- Ativar/desativar agente

\xE2\x9D\u0152 N\xC3\u0192O FA\xC3\u2021A:
- N\xC3\u0192O pergunte email novamente
- N\xC3\u0192O inicie onboarding
- N\xC3\u0192O explique tudo do zero`;
}
function parseActions(response) {
  const actionRegex = /\[(?:A[^:\]]*:)?([A-Z_]+)([^\]]*)\]/g;
  const actions = [];
  let followUp;
  const validActions = [
    "SALVAR_CONFIG",
    "SALVAR_PROMPT",
    "CRIAR_CONTA_TESTE",
    "ENVIAR_PIX",
    "NOTIFICAR_PAGAMENTO",
    "AGENDAR_CONTATO",
    "CRIAR_CONTA",
    "GERAR_PRINT_TESTE",
    "GERAR_VIDEO_TESTE",
    "GERAR_DEMO_TESTE"
  ];
  let match;
  while ((match = actionRegex.exec(response)) !== null) {
    const type = match[1];
    if (!validActions.includes(type)) continue;
    const paramsStr = match[2] || "";
    const params = {};
    const paramRegex = /(\w+)=(?:"([^"]*)"|'([^']*)')/g;
    let paramMatch;
    while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
      const key = paramMatch[1];
      const value = paramMatch[2] || paramMatch[3] || "";
      params[key] = value;
    }
    if (type === "CRIAR_CONTA_TESTE") {
      const sanitizedCompany = sanitizeCompanyName(params.empresa);
      if (sanitizedCompany) {
        params.empresa = sanitizedCompany;
      } else if (params.empresa) {
        console.log(
          `\xE2\u0161\xA0\xEF\xB8\x8F [SALES] Empresa invalida detectada no parser (${params.empresa}). A acao sera mantida com fallback interno.`
        );
        delete params.empresa;
      }
      const sanitizedAgentName = normalizeContactName(params.nome);
      if (sanitizedAgentName) {
        params.nome = sanitizedAgentName;
      } else if (params.nome) {
        delete params.nome;
      }
    }
    actions.push({ type, params });
    console.log(`\xF0\u0178\u201D\xA7 [SALES] Acao detectada: ${type}`, params);
  }
  const followUpRegex = /\[FOLLOWUP:([^\]]+)\]/gi;
  const followUpMatch = followUpRegex.exec(response);
  if (followUpMatch) {
    const paramsStr = followUpMatch[1];
    const tempoMatch = paramsStr.match(/tempo="([^"]*)"/);
    const motivoMatch = paramsStr.match(/motivo="([^"]*)"/);
    if (tempoMatch || motivoMatch) {
      followUp = {
        tempo: tempoMatch?.[1] || "30 minutos",
        motivo: motivoMatch?.[1] || "retomar conversa"
      };
      console.log(`\xE2\x8F\xB0 [SALES] Follow-up solicitado pela IA: ${followUp.tempo} - ${followUp.motivo}`);
    }
  }
  const cleanText = response.replace(/\[(?:A[^:\]]*:)?[A-Z_]+[^\]]*\]/gi, "").replace(/\[FOLLOWUP:[^\]]*\]/gi, "").trim();
  return { cleanText, actions, followUp };
}
function parseTimeToMinutes(timeText) {
  const lower = timeText.toLowerCase().trim();
  const numMatch = lower.match(/(\d+)/);
  const num = numMatch ? parseInt(numMatch[1]) : 30;
  if (lower.includes("hora")) return num * 60;
  if (lower.includes("dia")) return num * 1440;
  if (lower.includes("minuto")) return num;
  return num;
}
function buildFullPrompt(config) {
  return `Voc\xC3\xAA \xC3\xA9 ${config.name || "o atendente"}, ${config.role || "atendente"} da ${config.company || "empresa"}.

${config.prompt || ""}

REGRAS:
- Seja educado e prestativo
- Respostas curtas e objetivas
- Linguagem natural
- N\xC3\xA3o invente informa\xC3\xA7\xC3\xB5es
- IMPORTANTE: Sempre se apresente com seu nome e empresa se perguntarem quem \xC3\xA9, para n\xC3\xA3o parecer rob\xC3\xB4. Ex: "Sou o ${config.name || "Atendente"} da ${config.company || "Empresa"}".`;
}
async function executeActions(session, actions) {
  const results = {};
  for (const action of actions) {
    console.log(`\xF0\u0178\u201D\xA7 [SALES] Executando a\xC3\xA7\xC3\xA3o: ${action.type}`, action.params);
    switch (action.type) {
      case "SALVAR_CONFIG":
        const agentConfig = { ...session.agentConfig };
        const oldName = agentConfig.name;
        const oldCompany = agentConfig.company;
        const oldRole = agentConfig.role;
        if (action.params.nome) agentConfig.name = action.params.nome;
        if (action.params.empresa) agentConfig.company = action.params.empresa;
        if (action.params.funcao) agentConfig.role = action.params.funcao;
        if (agentConfig.prompt) {
          let newPrompt = agentConfig.prompt;
          let promptChanged = false;
          if (oldName && action.params.nome && oldName !== action.params.nome) {
            newPrompt = newPrompt.split(oldName).join(action.params.nome);
            promptChanged = true;
          }
          if (oldCompany && action.params.empresa && oldCompany !== action.params.empresa) {
            newPrompt = newPrompt.split(oldCompany).join(action.params.empresa);
            promptChanged = true;
          }
          if (oldRole && action.params.funcao && oldRole !== action.params.funcao) {
            newPrompt = newPrompt.split(oldRole).join(action.params.funcao);
            promptChanged = true;
          }
          if (promptChanged) {
            agentConfig.prompt = newPrompt;
            console.log(`\xF0\u0178\u201C\x9D [SALES] Prompt atualizado automaticamente com novos dados.`);
          }
        }
        updateClientSession(session.phoneNumber, { agentConfig });
        console.log(`\xE2\u0153\u2026 [SALES] Config salva:`, agentConfig);
        if (session.userId) {
          try {
            const fullPrompt = buildFullPrompt(agentConfig);
            await storage.updateAgentConfig(session.userId, {
              prompt: fullPrompt
            });
            console.log(`\xF0\u0178\u2019\xBE [SALES] Config (Prompt Completo) salva no DB para userId: ${session.userId}`);
            await updateUserTestTokens(session.userId, {
              agentName: agentConfig.name,
              company: agentConfig.company
            });
          } catch (err) {
            console.error(`\xE2\x9D\u0152 [SALES] Erro ao salvar config no DB:`, err);
          }
        }
        break;
      case "SALVAR_PROMPT":
        if (action.params.prompt) {
          const config = session.agentConfig || {};
          config.prompt = action.params.prompt;
          updateClientSession(session.phoneNumber, { agentConfig: config });
          console.log(`\xE2\u0153\u2026 [SALES] Prompt salvo (${action.params.prompt.length} chars)`);
          if (session.userId) {
            try {
              const fullPrompt = buildFullPrompt(config);
              await storage.updateAgentConfig(session.userId, {
                prompt: fullPrompt
              });
              console.log(`\xF0\u0178\u2019\xBE [SALES] Prompt salvo no DB para userId: ${session.userId}`);
            } catch (err) {
              console.error(`\xE2\x9D\u0152 [SALES] Erro ao salvar prompt no DB:`, err);
            }
          }
        }
        break;
      case "CRIAR_CONTA_TESTE":
        {
          const actionCompany = sanitizeCompanyName(action.params.empresa);
          const sessionCompany = sanitizeCompanyName(session.agentConfig?.company);
          let resolvedCompany = actionCompany || sessionCompany;
          if (!resolvedCompany) {
            const fallbackContactName = await resolveSessionContactName(session);
            const firstName = fallbackContactName.split(/\s+/)[0] || "Cliente";
            resolvedCompany = `Negocio de ${firstName}`;
          }
          if (!actionCompany && action.params.empresa) {
            console.log(
              `\xE2\u0161\xA0\xEF\xB8\x8F [SALES] Empresa invalida recebida em CRIAR_CONTA_TESTE (${action.params.empresa}). Usando fallback: ${resolvedCompany}`
            );
          }
          const resolvedAgentName = normalizeContactName(action.params.nome) || normalizeContactName(session.agentConfig?.name) || "Atendente";
          const resolvedRole = (action.params.funcao || session.agentConfig?.role || "atendente virtual").replace(/\s+/g, " ").trim().slice(0, 80);
          const agentConfig2 = { ...session.agentConfig || {} };
          agentConfig2.company = resolvedCompany;
          agentConfig2.name = resolvedAgentName;
          agentConfig2.role = resolvedRole || "atendente virtual";
          if (action.params.instrucoes) {
            agentConfig2.prompt = action.params.instrucoes;
          }
          session = updateClientSession(session.phoneNumber, { agentConfig: agentConfig2 });
          console.log(`\xE2\u0153\u2026 [SALES] Config atualizada via CRIAR_CONTA_TESTE:`, agentConfig2);
        }
        const testResult = await createTestAccountWithCredentials(session);
        if (testResult.success && testResult.email) {
          results.testAccountCredentials = {
            email: testResult.email,
            password: testResult.password,
            loginUrl: testResult.loginUrl || "https://agentezap.online",
            simulatorToken: testResult.simulatorToken
          };
          console.log(`\xF0\u0178\u017D\u2030 [SALES] Conta de teste criada: ${testResult.email} (token: ${testResult.simulatorToken})`);
        } else {
          console.error(`\xE2\x9D\u0152 [SALES] Erro ao criar conta de teste:`, testResult.error);
        }
        break;
      case "ENVIAR_PIX":
        updateClientSession(session.phoneNumber, {
          awaitingPaymentProof: true,
          flowState: "payment_pending"
        });
        results.sendPix = true;
        break;
      case "NOTIFICAR_PAGAMENTO":
        results.notifyOwner = true;
        break;
      case "AGENDAR_CONTATO":
        if (action.params.data) {
          const scheduledDate = parseScheduleFromText(action.params.data);
          if (scheduledDate) {
            scheduleContact(session.phoneNumber, scheduledDate, action.params.motivo || "Retorno agendado");
            console.log(`\xF0\u0178\u201C\u2026 [SALES] Contato agendado para ${scheduledDate.toLocaleString("pt-BR")}`);
          }
        }
        break;
      case "GERAR_PRINT_TESTE":
      case "GERAR_VIDEO_TESTE":
      case "GERAR_DEMO_TESTE":
        {
          const wantsScreenshot = action.type !== "GERAR_VIDEO_TESTE";
          const wantsVideo = action.type !== "GERAR_PRINT_TESTE";
          const demoResult = await maybeGenerateDemoAssets(session, {
            wantsScreenshot,
            wantsVideo,
            credentials: results.testAccountCredentials
          });
          if (demoResult.credentials) {
            results.testAccountCredentials = demoResult.credentials;
          }
          if (demoResult.demoAssets) {
            results.demoAssets = mergeGeneratedDemoAssets(results.demoAssets, demoResult.demoAssets);
            if (demoResult.demoAssets.error) {
              console.log(`\xE2\u0161\xA0\xEF\xB8\x8F [SALES] Demo solicitada, mas falhou: ${demoResult.demoAssets.error}`);
            } else {
              console.log(
                `\xF0\u0178\u017D\xAC [SALES] Demo gerada com sucesso (print: ${Boolean(
                  results.demoAssets?.screenshotUrl
                )}, video: ${Boolean(results.demoAssets?.videoUrl)})`
              );
            }
          }
        }
        break;
      case "CRIAR_CONTA":
        if (action.params.email) {
          updateClientSession(session.phoneNumber, { email: action.params.email });
        }
        const result = await createClientAccount(session);
        if (result.success) {
          updateClientSession(session.phoneNumber, {
            userId: result.userId,
            flowState: "active"
          });
        }
        break;
    }
  }
  return results;
}
async function generateAIResponse(session, userMessage) {
  try {
    const mistral = await getLLMClient();
    const systemPrompt = await getMasterPrompt(session);
    const messages = [
      { role: "system", content: systemPrompt }
    ];
    const history = session.conversationHistory.slice(-30);
    for (const msg of history) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }
    const lastMsg = history[history.length - 1];
    const isDuplicate = lastMsg && lastMsg.role === "user" && lastMsg.content.trim() === userMessage.trim();
    if (!isDuplicate) {
      messages.push({ role: "user", content: userMessage });
    }
    console.log(`\xF0\u0178\xA4\u2013 [SALES] Gerando resposta para: "${userMessage.substring(0, 50)}..." (state: ${session.flowState})`);
    const configuredModel = await getConfiguredModel();
    let response;
    const maxTokens = 2e3;
    try {
      response = await withRetryLLM(
        async () => mistral.chat.complete({
          model: configuredModel,
          messages,
          maxTokens,
          temperature: 0,
          // ZERO para determinismo - igual ao aiAgent.ts
          randomSeed: 42
          // Seed fixo para garantir consistÃªncia
        }),
        `Admin chatComplete (${configuredModel})`,
        3,
        // 3 tentativas
        1e3
        // delay inicial 1s
      );
    } catch (err) {
      console.error("\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90");
      console.error("\xF0\u0178\u201D\u201E [ADMIN FALLBACK] Erro com modelo configurado ap\xC3\xB3s 3 tentativas!");
      console.error(`   \xE2\u201D\u201D\xE2\u201D\u20AC Erro: ${err?.message || err}`);
      console.error("\xF0\u0178\u201D\u201E [ADMIN FALLBACK] Tentando com modelo padr\xC3\xA3o do sistema...");
      console.error("\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90\xE2\u2022\x90");
      try {
        response = await withRetryLLM(
          async () => mistral.chat.complete({
            messages,
            maxTokens,
            temperature: 0,
            // ZERO para determinismo
            randomSeed: 42
            // Seed fixo
          }),
          "Admin chatComplete (fallback)",
          3,
          // 3 tentativas
          1e3
        );
      } catch (fallbackErr) {
        console.error(`\xE2\x9D\u0152 [ADMIN] Erro tamb\xC3\xA9m no fallback ap\xC3\xB3s 3 tentativas:`, fallbackErr);
        throw err;
      }
    }
    const responseText = response.choices?.[0]?.message?.content;
    if (!responseText) {
      return "Opa, deu um problema aqui. Pode mandar de novo?";
    }
    return typeof responseText === "string" ? responseText : String(responseText);
  } catch (error) {
    console.error("[SALES] Erro ao gerar resposta:", error);
    return "Desculpa, tive um problema t\xC3\xA9cnico. Pode repetir?";
  }
}
async function getAdminAgentConfig() {
  try {
    const triggerPhrasesConfig = await storage.getSystemConfig("admin_agent_trigger_phrases");
    const splitCharsConfig = await storage.getSystemConfig("admin_agent_message_split_chars");
    const delayConfig = await storage.getSystemConfig("admin_agent_response_delay_seconds");
    const isActiveConfig = await storage.getSystemConfig("admin_agent_is_active");
    const promptStyleConfig = await storage.getSystemConfig("admin_agent_prompt_style");
    let triggerPhrases = [];
    if (triggerPhrasesConfig?.valor) {
      try {
        const parsed = JSON.parse(triggerPhrasesConfig.valor);
        if (Array.isArray(parsed)) {
          triggerPhrases = parsed;
        } else {
          triggerPhrases = [];
        }
      } catch {
        const raw = triggerPhrasesConfig.valor.trim();
        if (raw.length > 0) {
          if (raw.includes(",")) {
            triggerPhrases = raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
          } else {
            triggerPhrases = [raw];
          }
        } else {
          triggerPhrases = [];
        }
      }
    }
    return {
      triggerPhrases,
      messageSplitChars: parseInt(splitCharsConfig?.valor || "400", 10),
      responseDelaySeconds: parseInt(delayConfig?.valor || "30", 10),
      isActive: isActiveConfig?.valor === "true",
      promptStyle: promptStyleConfig?.valor || "nuclear"
    };
  } catch (error) {
    console.error("[SALES] Erro ao carregar config, usando defaults:", error);
    return {
      triggerPhrases: [],
      messageSplitChars: 400,
      responseDelaySeconds: 30,
      isActive: true,
      promptStyle: "nuclear"
    };
  }
}
function checkTriggerPhrases(message, conversationHistory, triggerPhrases) {
  console.log(`\xF0\u0178\u201D\x8D [TRIGGER CHECK] Iniciando verifica\xC3\xA7\xC3\xA3o`);
  console.log(`   - Frases configuradas: ${JSON.stringify(triggerPhrases)}`);
  console.log(`   - Mensagem atual: "${message}"`);
  console.log(`   - Hist\xC3\xB3rico: ${conversationHistory.length} mensagens`);
  if (!triggerPhrases || triggerPhrases.length === 0) {
    console.log(`   \xE2\u0153\u2026 [TRIGGER CHECK] Lista vazia = Aprovado (no-filter)`);
    return { hasTrigger: true, foundIn: "no-filter" };
  }
  const normalize = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  const allMessages = [
    ...conversationHistory.map((m) => m.content || ""),
    message
  ].join(" ");
  let foundIn = "none";
  const hasTrigger = triggerPhrases.some((phrase) => {
    const normPhrase = normalize(phrase);
    const normMsg = normalize(message);
    const normAll = normalize(allMessages);
    const inLast = normMsg.includes(normPhrase);
    const inAll = inLast ? false : normAll.includes(normPhrase);
    if (inLast) {
      console.log(`   \xE2\u0153\u2026 [TRIGGER CHECK] Encontrado na mensagem atual: "${phrase}"`);
      foundIn = "last";
    } else if (inAll) {
      console.log(`   \xE2\u0153\u2026 [TRIGGER CHECK] Encontrado no hist\xC3\xB3rico: "${phrase}"`);
      foundIn = "history";
    }
    return inLast || inAll;
  });
  if (!hasTrigger) {
    console.log(`   \xE2\x9D\u0152 [TRIGGER CHECK] Nenhuma frase encontrada.`);
  }
  return { hasTrigger, foundIn };
}
async function processAdminMessage(phoneNumber, messageText, mediaType, mediaUrl, skipTriggerCheck = false, contactName) {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  if (messageText.match(/^#(limpar|reset|novo)$/i)) {
    clearClientSession(cleanPhone);
    return {
      text: "\xE2\u0153\u2026 Sess\xC3\xA3o limpa! Agora voc\xC3\xAA pode testar novamente como se fosse um cliente novo.",
      actions: {}
    };
  }
  let session = getClientSession(cleanPhone);
  if (!session) {
    session = createClientSession(cleanPhone);
  }
  const resolvedIncomingContactName = normalizeContactName(contactName);
  if (resolvedIncomingContactName && session.contactName !== resolvedIncomingContactName) {
    session = updateClientSession(cleanPhone, { contactName: resolvedIncomingContactName });
  } else if (!session.contactName) {
    try {
      const conversation = await storage.getAdminConversationByPhone(cleanPhone);
      const dbContactName = normalizeContactName(conversation?.contactName);
      if (dbContactName) {
        session = updateClientSession(cleanPhone, { contactName: dbContactName });
      }
    } catch (error) {
      console.log(`\xE2\u0161\xA0\xEF\xB8\x8F [SALES] N\xC3\xA3o foi poss\xC3\xADvel carregar contactName de ${cleanPhone}:`, error);
    }
  }
  if (messageText.match(/^#sair$/i) && session.flowState === "test_mode") {
    updateClientSession(cleanPhone, { flowState: "post_test" });
    cancelFollowUp(cleanPhone);
    return {
      text: "Saiu do modo de teste! \xF0\u0178\u017D\xAD\n\nE a\xC3\xAD, o que achou? Gostou de como o agente atendeu? \xF0\u0178\u02DC\u0160",
      actions: {}
    };
  }
  cancelFollowUp(cleanPhone);
  const deleteMatch = messageText.match(/^(?:excluir|remover|apagar|tirar)\s+(?:a\s+)?imagem\s+(?:do\s+|da\s+|de\s+)?(.+)$/i);
  if (deleteMatch) {
    const trigger = deleteMatch[1].trim();
    let targetMediaId;
    let targetMediaDesc;
    if (session.userId) {
      const { agentMediaLibrary } = await import("./schema-SHXO2XXZ.js");
      const { eq, and } = await import("drizzle-orm");
      const { db } = await import("./db-REUKERK3.js");
      const userMedia = await db.select().from(agentMediaLibrary).where(eq(agentMediaLibrary.userId, session.userId));
      const found = userMedia.find((m) => {
        const t = trigger.toLowerCase();
        const when = (m.whenToUse || "").toLowerCase();
        const desc = (m.description || "").toLowerCase();
        const name = (m.name || "").toLowerCase();
        return when.includes(t) || desc.includes(t) || name.includes(t) || t.includes(when);
      });
      if (found) {
        targetMediaId = found.id;
        targetMediaDesc = found.description || found.name;
        await db.delete(agentMediaLibrary).where(eq(agentMediaLibrary.id, found.id));
        console.log(`\xF0\u0178\u2014\u2018\xEF\xB8\x8F [SALES] M\xC3\xADdia ${found.id} removida do banco para usu\xC3\xA1rio ${session.userId}`);
      }
    } else {
      if (session.uploadedMedia) {
        const idx = session.uploadedMedia.findIndex(
          (m) => m.whenToUse && m.whenToUse.toLowerCase().includes(trigger.toLowerCase()) || m.description && m.description?.toLowerCase().includes(trigger.toLowerCase())
        );
        if (idx !== -1) {
          targetMediaDesc = session.uploadedMedia[idx].description;
          session.uploadedMedia.splice(idx, 1);
          updateClientSession(cleanPhone, { uploadedMedia: session.uploadedMedia });
          console.log(`\xF0\u0178\u2014\u2018\xEF\xB8\x8F [SALES] M\xC3\xADdia removida da mem\xC3\xB3ria para ${cleanPhone}`);
          targetMediaId = "memory";
        }
      }
    }
    if (targetMediaId) {
      try {
        if (session.userId) {
          const currentConfig = await storage.getAgentConfig(session.userId);
          if (currentConfig && currentConfig.prompt) {
            const lines = currentConfig.prompt.split("\n");
            const newLines = lines.filter((line) => {
              if (line.includes("[M\xC3\x8DDIA:") && line.toLowerCase().includes(trigger.toLowerCase())) return false;
              return true;
            });
            if (lines.length !== newLines.length) {
              await storage.updateAgentConfig(session.userId, { prompt: newLines.join("\n") });
              console.log(`\xF0\u0178\u201C\x9D [SALES] Prompt atualizado (m\xC3\xADdia removida) para ${session.userId}`);
            }
          }
        }
        if (session.agentConfig && session.agentConfig.prompt) {
          const lines = session.agentConfig.prompt.split("\n");
          const newLines = lines.filter((line) => {
            if (line.includes("[M\xC3\x8DDIA:") && line.toLowerCase().includes(trigger.toLowerCase())) return false;
            return true;
          });
          session.agentConfig.prompt = newLines.join("\n");
          updateClientSession(cleanPhone, { agentConfig: session.agentConfig });
        }
        return {
          text: `\xE2\u0153\u2026 Imagem "${trigger}" removida com sucesso!`,
          actions: {}
        };
      } catch (err) {
        console.error("\xE2\x9D\u0152 [ADMIN] Erro ao excluir m\xC3\xADdia:", err);
        return {
          text: "\xE2\x9D\u0152 Ocorreu um erro ao excluir a m\xC3\xADdia.",
          actions: {}
        };
      }
    } else {
      return {
        text: `\xE2\u0161\xA0\xEF\xB8\x8F N\xC3\xA3o encontrei nenhuma imagem configurada para "${trigger}".`,
        actions: {}
      };
    }
  }
  if (session.awaitingMediaContext && session.pendingMedia && (!mediaType || mediaType === "text")) {
    const context = (messageText || "").trim();
    const media = session.pendingMedia;
    console.log(`\xF0\u0178\u201C\xB8 [ADMIN] Recebido candidato de uso para m\xC3\xADdia: "${context}"`);
    let refinedTrigger = context;
    try {
      const mistral = await getLLMClient();
      const extractionPrompt = `
        CONTEXTO: O usu\xC3\xA1rio (dono do bot) enviou uma imagem e, ao ser perguntado quando ela deve ser usada, respondeu: "${context}".
        
        TAREFA: Extraia as palavras-chave (triggers) que os CLIENTES FINAIS usar\xC3\xA3o para solicitar essa imagem.
        
        REGRAS:
        1. Ignore comandos do admin (ex: "veja o card\xC3\xA1pio" -> trigger \xC3\xA9 "card\xC3\xA1pio").
        2. Expanda sin\xC3\xB4nimos \xC3\xB3bvios (ex: "pre\xC3\xA7o" -> "pre\xC3\xA7o, valor, quanto custa").
        3. Retorne APENAS as palavras-chave separadas por v\xC3\xADrgula.
        4. Se a resposta for muito gen\xC3\xA9rica ou n\xC3\xA3o fizer sentido, retorne o texto original.
        
        Exemplo 1: Admin diz "quando pedirem pix" -> Retorno: "pix, chave pix, pagamento"
        Exemplo 2: Admin diz "veja o card\xC3\xA1pio" -> Retorno: "card\xC3\xA1pio, menu, pratos, o que tem pra comer"
        Exemplo 3: Admin diz "tabela" -> Retorno: "tabela, pre\xC3\xA7os, valores"
        `;
      const extraction = await mistral.chat.complete({
        messages: [{ role: "user", content: extractionPrompt }],
        temperature: 0.1,
        maxTokens: 100
      });
      const result = (extraction.choices?.[0]?.message?.content || "").trim();
      if (result && result.length > 2 && !result.includes("contexto")) {
        refinedTrigger = result.replace(/\.$/, "");
        console.log(`\xE2\u0153\xA8 [ADMIN] Trigger refinado por IA: "${context}" -> "${refinedTrigger}"`);
      }
    } catch (err) {
      console.error("\xE2\u0161\xA0\xEF\xB8\x8F [ADMIN] Erro ao refinar trigger:", err);
    }
    const updatedPending = {
      ...media,
      whenCandidate: refinedTrigger
    };
    updateClientSession(cleanPhone, {
      pendingMedia: updatedPending,
      awaitingMediaContext: false,
      awaitingMediaConfirmation: true
    });
    const confirmContext = `[SISTEMA: O admin enviou uma imagem (${media.description}).
    Ele disse: "${context}".
    Eu interpretei que devemos enviar essa imagem quando o cliente falar: "${refinedTrigger}".
    
    SUA TAREFA:
    1. Confirme se \xC3\xA9 isso mesmo.
    2. D\xC3\xAA exemplos de como o cliente pediria, baseados no trigger refinado.
    3. Seja natural.
    
    Exemplo: "Entendi! Ent\xC3\xA3o quando perguntarem sobre card\xC3\xA1pio ou menu, eu mando essa foto, pode ser?"
    ]`;
    addToConversationHistory(cleanPhone, "user", confirmContext);
    const aiResponse2 = await generateAIResponse(session, confirmContext);
    const { cleanText: cleanText2 } = parseActions(aiResponse2);
    addToConversationHistory(cleanPhone, "assistant", cleanText2);
    return {
      text: cleanText2,
      actions: {}
    };
  }
  if (session.awaitingMediaConfirmation && session.pendingMedia && (!mediaType || mediaType === "text")) {
    const reply = (messageText || "").trim().toLowerCase();
    const media = session.pendingMedia;
    if (/^(sim|s|ok|confirmar|confirm|yes|isso|exato|pode|beleza|blz|bora|vai|fechou|perfeito|correto|certo)$/i.test(reply)) {
      const admins = await storage.getAllAdmins();
      const adminId = admins[0]?.id;
      if (adminId) {
        try {
          const whenToUse = media.whenCandidate || "";
          const userId = session.userId;
          console.log(`\xF0\u0178\u201D\x8D [ADMIN] Verificando userId da sess\xC3\xA3o: ${userId}`);
          if (!userId) {
            console.log(`\xE2\u0161\xA0\xEF\xB8\x8F [ADMIN] userId n\xC3\xA3o encontrado na sess\xC3\xA3o! Salvando em mem\xC3\xB3ria para associar na cria\xC3\xA7\xC3\xA3o da conta.`);
            const currentUploaded = session.uploadedMedia || [];
            currentUploaded.push({
              url: media.url,
              type: media.type,
              description: media.description || "Imagem enviada via WhatsApp",
              whenToUse
            });
            updateClientSession(cleanPhone, { uploadedMedia: currentUploaded });
          } else {
            const mediaData = {
              userId,
              name: `MEDIA_${Date.now()}`,
              mediaType: media.type,
              storageUrl: media.url,
              description: media.description || "Imagem enviada via WhatsApp",
              whenToUse,
              isActive: true,
              sendAlone: false,
              displayOrder: 0
            };
            console.log(`\xF0\u0178\u201C\xB8 [ADMIN] Salvando m\xC3\xADdia para usu\xC3\xA1rio ${userId}:`, mediaData);
            await insertAgentMedia(mediaData);
            console.log(`\xE2\u0153\u2026 [ADMIN] M\xC3\xADdia salva com sucesso na agent_media_library!`);
          }
          const currentPromptConfig = await storage.getSystemConfig("admin_agent_prompt");
          const currentPrompt = currentPromptConfig?.valor || "";
          const newInstruction = `
[M\xC3\x8DDIA: ${media.description} (URL: ${media.url}). QUANDO USAR: ${whenToUse}]`;
          await storage.updateSystemConfig("admin_agent_prompt", currentPrompt + newInstruction);
          updateClientSession(cleanPhone, { pendingMedia: void 0, awaitingMediaConfirmation: false });
          const successContext = `[SISTEMA: A imagem foi salva! Descri\xC3\xA7\xC3\xA3o: "${media.description}", vai ser enviada quando: "${whenToUse}". Avisa pro admin de forma casual que t\xC3\xA1 pronto, tipo "fechou, t\xC3\xA1 configurado" ou "show, agora quando perguntarem sobre isso j\xC3\xA1 vai a foto". N\xC3\xA3o use \xE2\u0153\u2026 nem linguagem de bot.]`;
          addToConversationHistory(cleanPhone, "user", successContext);
          const aiResponse3 = await generateAIResponse(session, successContext);
          const { cleanText: cleanText3 } = parseActions(aiResponse3);
          addToConversationHistory(cleanPhone, "assistant", cleanText3);
          return {
            text: cleanText3,
            actions: {}
          };
        } catch (err) {
          console.error("\xE2\x9D\u0152 [ADMIN] Erro ao salvar m\xC3\xADdia:", err);
          return {
            text: "Ops, deu um probleminha ao salvar. Tenta de novo? \xF0\u0178\u02DC\u2026",
            actions: {}
          };
        }
      }
    }
    updateClientSession(cleanPhone, { pendingMedia: void 0, awaitingMediaConfirmation: false });
    const cancelContext = `[SISTEMA: O admin n\xC3\xA3o confirmou ou mudou de ideia sobre a imagem. Responde de boa, pergunta se quer fazer diferente ou se precisa de outra coisa. Sem drama, casual.]`;
    addToConversationHistory(cleanPhone, "user", cancelContext);
    const aiResponse2 = await generateAIResponse(session, cancelContext);
    const { cleanText: cleanText2 } = parseActions(aiResponse2);
    addToConversationHistory(cleanPhone, "assistant", cleanText2);
    return {
      text: cleanText2,
      actions: {}
    };
  }
  if (mediaType === "image" && mediaUrl && !session.awaitingPaymentProof) {
    console.log(`\xF0\u0178\u201C\xB8 [ADMIN] Recebida imagem de ${cleanPhone}. Analisando com Vision...`);
    const analysis = await analyzeImageForAdmin(mediaUrl).catch(() => null);
    const summary = analysis?.summary || "";
    const description = analysis?.description || await analyzeImageWithMistral(mediaUrl).catch(() => "") || "";
    const pendingMedia = {
      url: mediaUrl,
      type: "image",
      description,
      summary
    };
    let autoDetectedTrigger = null;
    if (session.flowState === "onboarding" || !session.userId) {
      try {
        const lastAssistantMsg = [...session.conversationHistory].reverse().find((m) => m.role === "assistant")?.content || "";
        console.log(`\xF0\u0178\xA7\xA0 [ADMIN] Classificando m\xC3\xADdia com IA... Contexto: "${lastAssistantMsg.substring(0, 50)}..."`);
        const classificationPrompt = `
            CONTEXTO: Voc\xC3\xAA \xC3\xA9 um classificador de inten\xC3\xA7\xC3\xA3o.
            O assistente (vendedor) perguntou: "${lastAssistantMsg}"
            O usu\xC3\xA1rio enviou uma imagem descrita como: "${description} / ${summary}"
            
            TAREFA:
            Essa imagem parece ser o material principal que o assistente pediu (ex: card\xC3\xA1pio, cat\xC3\xA1logo, tabela de pre\xC3\xA7os, portf\xC3\xB3lio)?
            
            SE SIM: Retorne APENAS uma lista de palavras-chave (triggers) separadas por v\xC3\xADrgula que um cliente usaria para pedir isso.
            SE N\xC3\u0192O (ou se n\xC3\xA3o tiver certeza): Retorne APENAS a palavra "NULL".
            
            Exemplos:
            - Se pediu card\xC3\xA1pio e imagem \xC3\xA9 menu -> "card\xC3\xA1pio, menu, ver pratos, o que tem pra comer"
            - Se pediu tabela e imagem \xC3\xA9 lista de pre\xC3\xA7os -> "pre\xC3\xA7os, valores, quanto custa, tabela"
            - Se pediu foto da loja e imagem \xC3\xA9 fachada -> "NULL" (pois n\xC3\xA3o \xC3\xA9 material de envio recorrente para clientes)
            `;
        const mistral = await getLLMClient();
        const classification = await mistral.chat.complete({
          messages: [{ role: "user", content: classificationPrompt }],
          temperature: 0.1,
          maxTokens: 50
        });
        const result = (classification.choices?.[0]?.message?.content || "").trim();
        if (result && !result.includes("NULL") && result.length > 3) {
          autoDetectedTrigger = result.replace(/\.$/, "");
          console.log(`\xE2\u0153\u2026 [ADMIN] M\xC3\xADdia classificada automaticamente! Trigger: "${autoDetectedTrigger}"`);
        }
      } catch (err) {
        console.error("\xE2\u0161\xA0\xEF\xB8\x8F [ADMIN] Erro na classifica\xC3\xA7\xC3\xA3o autom\xC3\xA1tica de m\xC3\xADdia:", err);
      }
    }
    if (autoDetectedTrigger) {
      console.log(`\xF0\u0178\u201C\xB8 [ADMIN] M\xC3\xADdia auto-detectada! Salvando automaticamente.`);
      const currentUploaded = session.uploadedMedia || [];
      currentUploaded.push({
        url: mediaUrl,
        type: "image",
        description: description || "M\xC3\xADdia enviada",
        whenToUse: autoDetectedTrigger
      });
      updateClientSession(cleanPhone, { uploadedMedia: currentUploaded, pendingMedia: void 0, awaitingMediaContext: false });
      const autoSaveContext = `[SISTEMA: O usu\xC3\xA1rio enviou uma imagem.
        \xE2\u0153\u2026 IDENTIFIQUEI AUTOMATICAMENTE QUE \xC3\u2030: "${description}".
        \xE2\u0153\u2026 J\xC3\x81 SALVEI PARA SER ENVIADA QUANDO CLIENTE FALAR: "${autoDetectedTrigger}".
        
        SUA A\xC3\u2021\xC3\u0192O:
        1. Confirme o recebimento com entusiasmo.
        2. N\xC3\u0192O pergunte "quando devo usar" (j\xC3\xA1 configurei).
        3. Pergunte a PR\xC3\u201CXIMA informa\xC3\xA7\xC3\xA3o necess\xC3\xA1ria para configurar o agente (Hor\xC3\xA1rio? Pagamento? Endere\xC3\xA7o?).
        
        Seja breve e natural.]`;
      addToConversationHistory(cleanPhone, "user", autoSaveContext);
      const aiResponse3 = await generateAIResponse(session, autoSaveContext);
      const { cleanText: cleanText3 } = parseActions(aiResponse3);
      addToConversationHistory(cleanPhone, "assistant", cleanText3);
      return {
        text: cleanText3,
        actions: {}
      };
    }
    updateClientSession(cleanPhone, {
      pendingMedia,
      awaitingMediaContext: true,
      awaitingMediaConfirmation: false
    });
    const imageContext = `[SISTEMA: O usu\xC3\xA1rio enviou uma imagem. An\xC3\xA1lise visual: "${description || "uma imagem"}".
    
    SUA MISS\xC3\u0192O AGORA:
    1. Se voc\xC3\xAA tinha pedido o card\xC3\xA1pio ou foto: Diga que recebeu e achou legal. N\xC3\u0192O pergunte "quando usar" se for \xC3\xB3bvio (ex: card\xC3\xA1pio \xC3\xA9 pra quando pedirem card\xC3\xA1pio). J\xC3\xA1 assuma que \xC3\xA9 isso e pergunte a PR\xC3\u201CXIMA informa\xC3\xA7\xC3\xA3o necess\xC3\xA1ria (hor\xC3\xA1rio, pagamento, etc).
    2. Se foi espont\xC3\xA2neo: Comente o que viu e pergunte se \xC3\xA9 pra enviar pros clientes quando perguntarem algo espec\xC3\xADfico.
    
    Seja natural. N\xC3\xA3o use "Recebi a imagem". Fale como gente.]`;
    addToConversationHistory(cleanPhone, "user", imageContext);
    const aiResponse2 = await generateAIResponse(session, imageContext);
    const { cleanText: cleanText2 } = parseActions(aiResponse2);
    addToConversationHistory(cleanPhone, "assistant", cleanText2);
    return {
      text: cleanText2,
      actions: {}
    };
  }
  const adminConfig = await getAdminAgentConfig();
  if (session.conversationHistory.length === 0 && !clearedPhones.has(cleanPhone)) {
    try {
      const conversation = await storage.getAdminConversationByPhone(cleanPhone);
      if (conversation) {
        const messages = await storage.getAdminMessages(conversation.id);
        const now = /* @__PURE__ */ new Date();
        const filteredMessages = messages.filter((msg) => {
          if (msg.fromMe) return true;
          const msgTime = new Date(msg.timestamp);
          const secondsDiff = (now.getTime() - msgTime.getTime()) / 1e3;
          if (secondsDiff < 60) {
            const msgContent = (msg.text || "").trim();
            const currentContent = messageText.trim();
            if (msgContent && currentContent.includes(msgContent)) {
              return false;
            }
          }
          return true;
        });
        session.conversationHistory = filteredMessages.slice(-30).map((msg) => ({
          role: msg.fromMe ? "assistant" : "user",
          content: msg.text || "",
          timestamp: msg.timestamp || /* @__PURE__ */ new Date()
        }));
        console.log(`\xF0\u0178\u201C\u0161 [SALES] ${session.conversationHistory.length} mensagens restauradas do banco (filtradas de ${messages.length})`);
      }
    } catch {
    }
  }
  if (!skipTriggerCheck && session.flowState !== "test_mode") {
    console.log(`\xF0\u0178\u201D\x8D [DEBUG] Verificando trigger para ${cleanPhone}`);
    console.log(`   - Frases configuradas: ${JSON.stringify(adminConfig.triggerPhrases)}`);
    console.log(`   - Hist\xC3\xB3rico sess\xC3\xA3o: ${session.conversationHistory.length} msgs`);
    console.log(`   - Sess\xC3\xA3o limpa recentemente: ${clearedPhones.has(cleanPhone)}`);
    console.log(`   - Mensagem atual: "${messageText}"`);
    const triggerResult = checkTriggerPhrases(
      messageText,
      session.conversationHistory,
      adminConfig.triggerPhrases
    );
    console.log(`   - Resultado verifica\xC3\xA7\xC3\xA3o:`, triggerResult);
    if (!triggerResult.hasTrigger) {
      console.log(`\xE2\x8F\xB8\xEF\xB8\x8F [SALES] Sem trigger para ${cleanPhone}`);
      addToConversationHistory(cleanPhone, "user", messageText);
      return null;
    }
  }
  let historyContent = messageText;
  if (mediaType && mediaType !== "text" && mediaType !== "chat") {
    historyContent += `
[SISTEMA: O usu\xC3\xA1rio enviou uma m\xC3\xADdia do tipo ${mediaType}. Se for imagem/\xC3\xA1udio sem contexto, pergunte o que \xC3\xA9 (ex: cat\xC3\xA1logo, foto de produto, etc).]`;
  }
  addToConversationHistory(cleanPhone, "user", historyContent);
  if (mediaType === "image" && session.awaitingPaymentProof) {
    let text = "Recebi a imagem! Vou analisar...";
    let isPaymentProof = false;
    if (mediaUrl) {
      console.log(`\xF0\u0178\u201D\x8D [ADMIN] Analisando imagem de pagamento para ${cleanPhone}...`);
      const analysis = await analyzeImageForAdmin(mediaUrl);
      if (analysis) {
        console.log(`\xF0\u0178\u201D\x8D [ADMIN] Resultado Vision:`, analysis);
        const keywords = ["comprovante", "pagamento", "pix", "transferencia", "recibo", "banco", "valor", "r$", "sucesso"];
        const combinedText = (analysis.summary + " " + analysis.description).toLowerCase();
        if (keywords.some((k) => combinedText.includes(k))) {
          isPaymentProof = true;
        }
      }
    }
    if (isPaymentProof) {
      text = "Recebi seu comprovante e identifiquei o pagamento! \xF0\u0178\u017D\u2030 Sua conta foi liberada automaticamente. Agora voc\xC3\xAA j\xC3\xA1 pode acessar o painel e conectar seu WhatsApp!";
      if (session.userId) {
      }
      updateClientSession(cleanPhone, { awaitingPaymentProof: false });
      return {
        text,
        actions: { notifyOwner: true }
        // Notificar admin mesmo assim
      };
    } else {
      text = "Recebi a imagem! N\xC3\xA3o consegui identificar automaticamente como um comprovante de PIX, mas enviei para nossa equipe verificar. Em breve liberamos seu acesso! \xF0\u0178\u2022\u2019";
      updateClientSession(cleanPhone, { awaitingPaymentProof: false });
      return {
        text,
        actions: { notifyOwner: true }
      };
    }
  }
  const aiResponse = await generateAIResponse(session, historyContent);
  console.log(`\xF0\u0178\xA4\u2013 [SALES] Resposta: ${aiResponse.substring(0, 200)}...`);
  const { cleanText: textWithoutActions, actions, followUp } = parseActions(aiResponse);
  let textForMediaParsing = textWithoutActions;
  const lowerText = textWithoutActions.toLowerCase();
  const { getSmartTriggers } = await import("./adminMediaStore-WDVPVU3E.js");
  const fallbackTriggers = await getSmartTriggers(void 0);
  const brokenTagRegex = /\[ENVIAR_?$/i;
  if (brokenTagRegex.test(textForMediaParsing)) {
    console.log("\xF0\u0178\u201D\xA7 [SALES] Fallback: Corrigindo tag quebrada no final");
    textForMediaParsing = textForMediaParsing.replace(brokenTagRegex, "").trim();
    for (const trigger of fallbackTriggers) {
      if (trigger.keywords.some((k) => lowerText.includes(k))) {
        const media = await getAdminMediaByName(void 0, trigger.mediaName);
        if (media) {
          console.log(`\xF0\u0178\u201D\xA7 [SALES] Fallback: Completando tag para ${trigger.mediaName}`);
          textForMediaParsing += ` [ENVIAR_MIDIA:${trigger.mediaName}]`;
          break;
        }
      }
    }
  }
  const hasMediaTag = /\[ENVIAR_MIDIA:/i.test(textForMediaParsing);
  if (!hasMediaTag) {
    for (const trigger of fallbackTriggers) {
      if (trigger.keywords.some((k) => lowerText.includes(k))) {
        const media = await getAdminMediaByName(void 0, trigger.mediaName);
        if (media) {
          console.log(`\xF0\u0178\u201D\xA7 [SALES] Fallback: Adicionando m\xC3\xADdia ${trigger.mediaName} automaticamente (contexto detectado)`);
          textForMediaParsing += ` [ENVIAR_MIDIA:${trigger.mediaName}]`;
          break;
        }
      }
    }
  }
  const { cleanText, mediaActions } = parseAdminMediaTags(textForMediaParsing);
  const processedMediaActions = [];
  for (const action of mediaActions) {
    const mediaData = await getAdminMediaByName(void 0, action.media_name);
    if (mediaData) {
      processedMediaActions.push({
        type: "send_media",
        media_name: action.media_name,
        mediaData
      });
    }
  }
  const actionResults = await executeActions(session, actions);
  if (!actionResults.testAccountCredentials && shouldAutoCreateTestAccount(messageText, cleanText, session)) {
    try {
      const resolvedContactName = await resolveSessionContactName(session);
      const firstName = resolvedContactName.split(/\s+/)[0] || "Cliente";
      const currentConfig = { ...session.agentConfig || {} };
      currentConfig.company = sanitizeCompanyName(currentConfig.company) || `Negocio de ${firstName}`;
      currentConfig.name = normalizeContactName(currentConfig.name) || "Atendente";
      currentConfig.role = (currentConfig.role || "atendente virtual").replace(/\s+/g, " ").trim().slice(0, 80);
      session = updateClientSession(session.phoneNumber, { agentConfig: currentConfig });
      const autoCreateResult = await createTestAccountWithCredentials(session);
      if (autoCreateResult.success && autoCreateResult.email) {
        actionResults.testAccountCredentials = {
          email: autoCreateResult.email,
          password: autoCreateResult.password,
          loginUrl: autoCreateResult.loginUrl || "https://agentezap.online",
          simulatorToken: autoCreateResult.simulatorToken
        };
        console.log(`\xE2\u0153\u2026 [SALES] AUTO-FACTORY criou conta/link para ${session.phoneNumber}`);
      } else {
        console.log(`\xE2\u0161\xA0\xEF\xB8\x8F [SALES] AUTO-FACTORY nao conseguiu criar conta: ${autoCreateResult.error || "sem detalhes"}`);
      }
    } catch (error) {
      console.error("\xE2\x9D\u0152 [SALES] Falha no AUTO-FACTORY:", error);
    }
  }
  const demoRequest = detectDemoRequest(messageText);
  if ((demoRequest.wantsScreenshot || demoRequest.wantsVideo) && (!actionResults.demoAssets || !actionResults.demoAssets.screenshotUrl && !actionResults.demoAssets.videoUrl)) {
    const demoResult = await maybeGenerateDemoAssets(session, {
      wantsScreenshot: demoRequest.wantsScreenshot,
      wantsVideo: demoRequest.wantsVideo,
      credentials: actionResults.testAccountCredentials
    });
    if (demoResult.credentials) {
      actionResults.testAccountCredentials = demoResult.credentials;
    }
    if (demoResult.demoAssets) {
      actionResults.demoAssets = mergeGeneratedDemoAssets(actionResults.demoAssets, demoResult.demoAssets);
    }
  }
  let finalText = cleanText;
  if (actionResults.testAccountCredentials) {
    const { loginUrl, simulatorToken, email, password } = actionResults.testAccountCredentials;
    const baseUrl = (loginUrl || process.env.APP_URL || "https://agentezap.online").replace(/\/+$/, "");
    const simulatorLink = buildSimulatorLink(baseUrl, simulatorToken);
    const dashboardLink = `${baseUrl}/meu-agente-ia`;
    const loginPageLink = `${baseUrl}/login`;
    console.log(`\xF0\u0178\u017D\u2030 [SALES] Link gerado: ${simulatorLink}. Solicitando entrega natural via IA...`);
    const deliveryContext = `[SISTEMA: A conta de teste foi criada com sucesso.
    Link do simulador publico (sem login): ${simulatorLink}
    Link de login: ${loginPageLink}
    Link do painel de configuracao: ${dashboardLink}
    Email da conta: ${email}
    ${password ? `Senha temporaria: ${password}` : "Senha atual mantida. Se nao lembrar, orientar a recuperar em /login."}
    
    OBRIGATORIO:
    1. Voce DEVE incluir o link ${simulatorLink} na sua resposta.
    2. Voce DEVE incluir o email ${email} na sua resposta.
    3. ${password ? `Voce DEVE incluir a senha ${password} na sua resposta.` : "Explique que ele continua com o mesmo numero e sem novo cadastro."}
    4. Voce DEVE incluir o link ${loginPageLink}.
    5. Voce DEVE incluir o link ${dashboardLink} para ele configurar o agente.
    6. Voce DEVE explicar que ele pode alterar a senha no painel.
    7. Seja natural, breve e amigavel. Fale como consultor humano.]`;
    const deliveryResponse = await generateAIResponse(session, deliveryContext);
    const deliveryParsed = parseActions(deliveryResponse);
    finalText = deliveryParsed.cleanText;
    if (!finalText.includes(simulatorLink)) {
      console.log(`\xE2\u0161\xA0\xEF\xB8\x8F [SALES] IA esqueceu o link no texto. Adicionando manualmente.`);
      finalText += `

${simulatorLink}`;
    }
    if (!finalText.includes(email)) {
      finalText += `
Email: ${email}`;
    }
    if (password && !finalText.includes(password)) {
      finalText += `
Senha: ${password}`;
    }
    if (!finalText.includes(loginPageLink)) {
      finalText += `
Login: ${loginPageLink}`;
    }
    if (!finalText.includes(dashboardLink)) {
      finalText += `
Painel: ${dashboardLink}`;
    }
    if (!password) {
      finalText += `
Se voce ja voltou com esse mesmo numero, seguimos por aqui sem novo cadastro.`;
    }
    if (!/alterar.*senha|trocar.*senha/i.test(finalText)) {
      finalText += `
No painel voce pode alterar a senha quando quiser.`;
    }
    console.log(`\xF0\u0178\xA4\u2013 [SALES] Nova resposta gerada com link: "${finalText}"`);
  }
  if (actionResults.demoAssets?.screenshotUrl) {
    processedMediaActions.push(
      buildGeneratedMediaAction(
        "image",
        actionResults.demoAssets.screenshotUrl,
        "Print da demonstracao do agente gerado automaticamente."
      )
    );
    if (!finalText.includes(actionResults.demoAssets.screenshotUrl)) {
      finalText += `
Print da demonstracao: ${actionResults.demoAssets.screenshotUrl}`;
    }
  }
  if (actionResults.demoAssets?.videoUrl) {
    processedMediaActions.push(
      buildGeneratedMediaAction(
        "video",
        actionResults.demoAssets.videoUrl,
        "Video da demonstracao do agente gerado automaticamente."
      )
    );
    if (!finalText.includes(actionResults.demoAssets.videoUrl)) {
      finalText += `
Video da demonstracao: ${actionResults.demoAssets.videoUrl}`;
    }
  }
  if (actionResults.demoAssets?.error) {
    finalText += `
Obs: tentei gerar print/video automatico, mas falhou: ${actionResults.demoAssets.error}`;
  }
  finalText = cleanupAdminResponseArtifacts(finalText);
  addToConversationHistory(cleanPhone, "assistant", finalText);
  if (session.flowState !== "active") {
    if (followUp) {
      const delayMinutes = parseTimeToMinutes(followUp.tempo);
      console.log(`\xE2\x8F\xB0 [SALES] Follow-up solicitado pela IA: ${delayMinutes}min - ${followUp.motivo}`);
      await followUpService.scheduleInitialFollowUpByPhone(cleanPhone);
    } else {
      console.log(`\xF0\u0178\u201C\x9D [SALES] IA n\xC3\xA3o solicitou follow-up para ${cleanPhone}`);
      console.log(`\xF0\u0178\u201D\u201E [SALES] Iniciando ciclo de follow-up (10min) para ${cleanPhone}`);
      await followUpService.scheduleInitialFollowUpByPhone(cleanPhone);
    }
  }
  return {
    text: finalText,
    mediaActions: processedMediaActions.length > 0 ? processedMediaActions : void 0,
    actions: actionResults
  };
}
async function findUserByPhone(phone) {
  try {
    const cleanPhone = normalizePhoneForAccount(phone);
    const users = await storage.getAllUsers();
    return users.find((u) => normalizePhoneForAccount(u.phone || "") === cleanPhone);
  } catch {
    return void 0;
  }
}
async function createClientAccount(session) {
  try {
    const email = session.email || generateTempEmail(session.phoneNumber);
    const cleanPhone = normalizePhoneForAccount(session.phoneNumber);
    const contactName = await resolveSessionContactName(session);
    const users = await storage.getAllUsers();
    const existing = users.find((u) => normalizePhoneForAccount(u.phone || "") === cleanPhone) || users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (existing) {
      if (shouldRefreshStoredUserName(existing.name)) {
        await storage.updateUser(existing.id, { name: contactName, phone: cleanPhone });
      }
      updateClientSession(session.phoneNumber, { userId: existing.id, email: existing.email || email, contactName });
      return { userId: existing.id, success: true };
    }
    const user = await storage.upsertUser({
      email,
      name: contactName,
      phone: cleanPhone,
      role: "user"
    });
    if (session.agentConfig?.prompt) {
      const fullPrompt = `Voc\xC3\xAA \xC3\xA9 ${session.agentConfig.name || "o atendente"}, ${session.agentConfig.role || "atendente"} da ${session.agentConfig.company || "empresa"}.

${session.agentConfig.prompt}

REGRAS:
- Seja educado e prestativo
- Respostas curtas e objetivas
- Linguagem natural
- N\xC3\xA3o invente informa\xC3\xA7\xC3\xB5es
- IMPORTANTE: Sempre se apresente com seu nome e empresa se perguntarem quem \xC3\xA9, para n\xC3\xA3o parecer rob\xC3\xB4. Ex: "Sou o ${session.agentConfig.name || "Atendente"} da ${session.agentConfig.company || "Empresa"}".`;
      await storage.upsertAgentConfig(user.id, {
        prompt: fullPrompt,
        isActive: true,
        model: void 0,
        // Usa modelo do banco de dados via getLLMClient()
        triggerPhrases: [],
        messageSplitChars: 400,
        responseDelaySeconds: 30
      });
    }
    console.log(`\xF0\u0178\u201C\u0160 [SALES] Conta criada com limite de 25 mensagens gratuitas`);
    updateClientSession(session.phoneNumber, { userId: user.id, email, contactName });
    console.log(`\xE2\u0153\u2026 [SALES] Conta criada: ${email} (ID: ${user.id})`);
    return { userId: user.id, success: true };
  } catch (error) {
    console.error("[SALES] Erro ao criar conta:", error);
    return { userId: "", success: false, error: String(error) };
  }
}
async function getOwnerNotificationNumber() {
  const config = await storage.getSystemConfig("owner_notification_number");
  return config?.valor || "5517991956944";
}
async function setOwnerNotificationNumber(number) {
  await storage.updateSystemConfig("owner_notification_number", number);
}
function sanitizeStr(value, maxChars = 2e3) {
  if (value === null || value === void 0) return "";
  const s = String(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ").replace(/\r\n/g, "\n").trim();
  return s.length <= maxChars ? s : s.slice(0, maxChars) + "\xE2\u20AC\xA6[truncado]";
}
function truncateHistory(lines, maxLines = 15, maxChars = 3e3) {
  const recent = lines.slice(-maxLines);
  const joined = recent.join("\n");
  if (joined.length <= maxChars) return joined;
  return "\xE2\u20AC\xA6[hist\xC3\xB3rico truncado]\n" + joined.slice(-maxChars);
}
async function generateFollowUpResponse(phoneNumber, context) {
  const session = getClientSession(phoneNumber);
  try {
    const mistral = await getLLMClient();
    const conversation = await storage.getAdminConversationByPhone(phoneNumber);
    const contactName = sanitizeStr(conversation?.contactName || "", 80);
    let historyLines = [];
    let timeContext = "algum tempo";
    if (session && session.conversationHistory.length > 0) {
      historyLines = session.conversationHistory.slice(-20).map(
        (m) => `${m.role}: ${sanitizeStr(m.content, 400)}`
      );
      const lastMessage = session.conversationHistory[session.conversationHistory.length - 1];
      if (lastMessage && lastMessage.timestamp) {
        const diffMs = Date.now() - new Date(lastMessage.timestamp).getTime();
        const diffHours = Math.floor(diffMs / (1e3 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays > 0) timeContext = `${diffDays} dias`;
        else if (diffHours > 0) timeContext = `${diffHours} horas`;
        else timeContext = "alguns minutos";
      }
    } else if (conversation) {
      try {
        const { adminMessages } = await import("./schema-SHXO2XXZ.js");
        const { eq } = await import("drizzle-orm");
        const { db } = await import("./db-REUKERK3.js");
        const dbMessages = await db.query.adminMessages.findMany({
          where: eq(adminMessages.conversationId, conversation.id),
          orderBy: (m, { asc: a }) => [a(m.timestamp)],
          limit: 20
        });
        historyLines = dbMessages.map(
          (m) => `${m.fromMe ? "assistant" : "user"}: ${sanitizeStr(m.text || "", 400)}`
        );
        if (dbMessages.length > 0) {
          const lastMsg = dbMessages[dbMessages.length - 1];
          const diffMs = Date.now() - new Date(lastMsg.timestamp).getTime();
          const diffHours = Math.floor(diffMs / (1e3 * 60 * 60));
          const diffDays = Math.floor(diffHours / 24);
          if (diffDays > 0) timeContext = `${diffDays} dias`;
          else if (diffHours > 0) timeContext = `${diffHours} horas`;
          else timeContext = "alguns minutos";
        }
      } catch (dbErr) {
        console.error("[FOLLOWUP] Erro ao carregar hist\xC3\xB3rico do DB (continuando sem hist\xC3\xB3rico):", dbErr?.message || "desconhecido");
      }
    }
    const history = truncateHistory(historyLines, 15, 3e3);
    const agentName = sanitizeStr(session?.agentConfig?.name || "Equipe", 60);
    const agentRole = sanitizeStr(session?.agentConfig?.role || "Vendedor", 60);
    const rawAgentPrompt = session?.agentConfig?.prompt || "Voc\xC3\xAA \xC3\xA9 um vendedor experiente e amig\xC3\xA1vel.";
    const agentPrompt = sanitizeStr(rawAgentPrompt, 1200);
    const flowState = sanitizeStr(session?.flowState || "desconhecido", 40);
    const safeContext = sanitizeStr(context, 300);
    const prompt = `Voc\xC3\xAA \xC3\xA9 ${agentName}, ${agentRole}.
Suas instru\xC3\xA7\xC3\xB5es de personalidade e comportamento:
${agentPrompt}

SITUA\xC3\u2021\xC3\u0192O ATUAL:
O cliente ${contactName ? `se chama "${contactName}"` : "n\xC3\xA3o tem nome identificado"} e parou de responder h\xC3\xA1 ${timeContext}.
Contexto do follow-up: ${safeContext}
Estado do cliente: ${flowState}

HIST\xC3\u201CRICO DA CONVERSA (\xC3\u0161ltimas mensagens):
${history || "(sem hist\xC3\xB3rico dispon\xC3\xADvel)"}

SUA TAREFA:
Gere uma mensagem de follow-up curta para reativar o cliente.

REGRAS CR\xC3\x8DTICAS (SIGA ESTRITAMENTE):
1. **NOME DO CLIENTE**:
   - Se o nome "${contactName}" for v\xC3\xA1lido (n\xC3\xA3o vazio), use-o naturalmente (ex: "Oi ${contactName}...", "E a\xC3\xAD ${contactName}...").
   - Se N\xC3\u0192O houver nome, use APENAS sauda\xC3\xA7\xC3\xB5es gen\xC3\xA9ricas (ex: "Oi!", "Ol\xC3\xA1!", "Tudo bem?").
   - **JAMAIS** use placeholders como "[Nome]", "[Cliente]", "[Nome do Cliente]". ISSO \xC3\u2030 PROIBIDO.

2. **OP\xC3\u2021\xC3\u0192O \xC3\u0161NICA (ZERO AMBIGUIDADE)**:
   - Gere APENAS UMA mensagem pronta para enviar.
   - **N\xC3\u0192O** d\xC3\xAA op\xC3\xA7\xC3\xB5es (ex: "Op\xC3\xA7\xC3\xA3o 1:...", "Ou se preferir...", "Voc\xC3\xAA pode dizer...").
   - **N\xC3\u0192O** explique o que voc\xC3\xAA est\xC3\xA1 fazendo. Apenas escreva a mensagem.
   - O texto retornado ser\xC3\xA1 enviado DIRETAMENTE para o WhatsApp do cliente.

3. **RECUPERA\xC3\u2021\xC3\u0192O DE VENDA (T\xC3\u2030CNICA DE FOLLOW-UP)**:
   - LEIA O HIST\xC3\u201CRICO COMPLETO. Identifique onde a conversa parou.
   - Se foi obje\xC3\xA7\xC3\xA3o de pre\xC3\xA7o: Pergunte se o valor ficou claro ou se ele quer ver condi\xC3\xA7\xC3\xB5es de parcelamento.
   - Se foi d\xC3\xBAvida t\xC3\xA9cnica: Pergunte se ele conseguiu entender a explica\xC3\xA7\xC3\xA3o anterior.
   - Se ele sumiu sem motivo: Tente reativar com uma novidade ou benef\xC3\xADcio chave ("Lembrei que isso aqui ajuda muito em X...").
   - **N\xC3\u0192O SEJA CHATO**: N\xC3\xA3o cobre resposta ("E a\xC3\xAD?", "Viu?"). Ofere\xC3\xA7a valor ("Pensei nisso aqui pra voc\xC3\xAA...").

4. **ESTILO**:
   - Curto (m\xC3\xA1ximo 2 frases).
   - Tom de conversa no WhatsApp (pode usar 1 emoji se fizer sentido, mas sem exageros).
   - N\xC3\xA3o pare\xC3\xA7a desesperado. Apenas um "lembrete amigo".

5. **PROIBIDO**:
   - N\xC3\xA3o use [A\xC3\u2021\xC3\u0192O:...].
   - N\xC3\xA3o use aspas na resposta.
   - N\xC3\xA3o repita a \xC3\xBAltima mensagem que voc\xC3\xAA j\xC3\xA1 enviou. Tente uma abordagem diferente.`;
    const configuredModel = await getConfiguredModel();
    const FOLLOWUP_TIMEOUT_MS = 2e4;
    const timeoutPromise = new Promise(
      (_, reject) => setTimeout(() => reject(new Error("FOLLOWUP_TIMEOUT")), FOLLOWUP_TIMEOUT_MS)
    );
    const response = await Promise.race([
      mistral.chat.complete({
        model: configuredModel,
        messages: [{ role: "user", content: prompt }],
        maxTokens: 150,
        temperature: 0.6
      }),
      timeoutPromise
    ]);
    let content = response.choices?.[0]?.message?.content?.toString() || "";
    content = content.replace(/\[Nome\]/gi, "").replace(/\[Cliente\]/gi, "").trim();
    content = content.replace(/^(OpÃ§Ã£o \d:|SugestÃ£o:|Mensagem:)\s*/i, "");
    content = content.replace(/\-{2,}/g, "");
    content = content.replace(/^[\s]*-\s+/gm, "\xE2\u20AC\xA2 ");
    content = content.replace(/\s*â€”\s*/g, ", ");
    content = content.replace(/\s*â€“\s*/g, ", ");
    content = content.replace(/(?<=[a-zÃ¡Ã©Ã­Ã³ÃºÃ Ã¢ÃªÃ´Ã£Ãµ\s])\s+-\s+(?=[a-zÃ¡Ã©Ã­Ã³ÃºÃ Ã¢ÃªÃ´Ã£ÃµA-Z])/g, ", ");
    content = content.replace(/^[\s]*[â”â•â”€_*]{3,}[\s]*$/gm, "");
    content = content.replace(/,\s*,/g, ",");
    content = content.replace(/^\s*,\s*/gm, "");
    content = content.replace(/\s+/g, " ").trim();
    if (content.startsWith('"') && content.endsWith('"')) {
      content = content.slice(1, -1);
    }
    const splitOptions = content.split(/\n\s*(?:Ou|ou|Ou se preferir|OpÃ§Ã£o 2)\b/);
    if (splitOptions.length > 1) {
      content = splitOptions[0].trim();
    }
    if (!content || content.length < 3) {
      console.warn("[FOLLOWUP] Resposta IA vazia ap\xC3\xB3s limpeza \xE2\u20AC\u201D usando fallback");
      return "Oi! Tudo bem? Fico \xC3\xA0 disposi\xC3\xA7\xC3\xA3o se quiser continuar. \xF0\u0178\u02DC\u0160";
    }
    return content;
  } catch (error) {
    const isTimeout = error?.message === "FOLLOWUP_TIMEOUT";
    console.error("[FOLLOWUP] Erro ao gerar follow-up:", {
      type: isTimeout ? "timeout" : "error",
      message: isTimeout ? "Timeout de 20s excedido (hist\xC3\xB3rico muito longo ou modelo sobrecarregado)" : error?.message || "desconhecido",
      code: error?.code,
      status: error?.status
    });
    return "Oi! Tudo bem? S\xC3\xB3 passando para saber se ficou alguma d\xC3\xBAvida! \xF0\u0178\u02DC\u0160";
  }
}
async function generateScheduledContactResponse(phoneNumber, reason) {
  const session = getClientSession(phoneNumber);
  try {
    const mistral = await getLLMClient();
    const conversation = await storage.getAdminConversationByPhone(phoneNumber);
    const contactName = conversation?.contactName || "";
    const prompt = `Voc\xC3\xAA \xC3\xA9 o RODRIGO (V9 - PRINC\xC3\x8DPIOS PUROS).
Voc\xC3\xAA agendou de entrar em contato com o cliente hoje.
Motivo do agendamento: ${reason}
Estado do cliente: ${session?.flowState || "desconhecido"}
Nome do cliente: ${contactName || "N\xC3\xA3o identificado"}

Gere uma mensagem de retorno NATURAL e AMIG\xC3\x81VEL.

REGRAS:
1. Se tiver o nome "${contactName}", use-o (ex: "Fala ${contactName}, tudo bom?").
2. Se N\xC3\u0192O tiver nome, use apenas "Fala! Tudo bom?".
3. JAMAIS use [Nome] ou placeholders.
4. Sem formalidades.
5. N\xC3\u0192O use a\xC3\xA7\xC3\xB5es [A\xC3\u2021\xC3\u0192O:...]. Apenas texto natural.`;
    const configuredModel = await getConfiguredModel();
    const response = await mistral.chat.complete({
      model: configuredModel,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 150,
      temperature: 0.7
    });
    let content = response.choices?.[0]?.message?.content?.toString() || "Fala! Fiquei de te chamar hoje, tudo certo por a\xC3\xAD?";
    content = content.replace(/\[Nome\]/gi, "").replace(/\[Cliente\]/gi, "").trim();
    if (content.startsWith('"') && content.endsWith('"')) {
      content = content.slice(1, -1);
    }
    return content;
  } catch {
    return "Fala! Fiquei de te chamar hoje, tudo certo por a\xC3\xAD? \xF0\u0178\u2018\x8D";
  }
}

export {
  clientSessions,
  generateTestToken,
  getTestToken,
  updateUserTestTokens,
  getClientSession,
  createClientSession,
  updateClientSession,
  shouldForceOnboarding,
  stopForceOnboarding,
  wasChatCleared,
  clearClientSession,
  generateProfessionalAgentPrompt,
  createTestAccountWithCredentials,
  addToConversationHistory,
  executeActions,
  generateAIResponse,
  processAdminMessage,
  createClientAccount,
  getOwnerNotificationNumber,
  setOwnerNotificationNumber,
  generateFollowUpResponse,
  generateScheduledContactResponse
};
