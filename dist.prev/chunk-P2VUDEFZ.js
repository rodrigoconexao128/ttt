import {
  memoryCache,
  storage
} from "./chunk-N6KLURMT.js";
import {
  db,
  pool
} from "./chunk-HIRAYR4B.js";
import {
  teamMemberSessions,
  teamMembers,
  users
} from "./chunk-WF5ZUJEW.js";

// server/supabaseAuth.ts
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";

// server/accessEntitlement.ts
var ENTITLEMENT_CACHE_TTL = 3e4;
var _inflightEntitlements = /* @__PURE__ */ new Map();
async function getAccessEntitlement(userId) {
  const cacheKey = `entitlement:${userId}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;
  const inflight = _inflightEntitlements.get(userId);
  if (inflight) return inflight;
  const promise = _computeEntitlement(userId).then((result) => {
    memoryCache.set(cacheKey, result, ENTITLEMENT_CACHE_TTL);
    _inflightEntitlements.delete(userId);
    return result;
  }).catch((err) => {
    _inflightEntitlements.delete(userId);
    throw err;
  });
  _inflightEntitlements.set(userId, promise);
  return promise;
}
async function _computeEntitlement(userId) {
  const [subscription, resellerClient] = await Promise.all([
    storage.getUserSubscription(userId),
    storage.getResellerClientByUserId(userId)
  ]);
  const now = /* @__PURE__ */ new Date();
  const subscriptionIsActive = subscription?.status === "active";
  const subscriptionExpiredByDataFim = subscription?.dataFim ? new Date(subscription.dataFim) < now : false;
  const saasHasActive = subscriptionIsActive && !subscriptionExpiredByDataFim;
  if (resellerClient) {
    let reseller = null;
    try {
      reseller = await storage.getReseller(resellerClient.resellerId);
    } catch (e) {
    }
    if (reseller?.resellerStatus === "blocked") {
      return {
        hasActiveSubscription: false,
        isExpired: true,
        source: "reseller",
        planName: "Plano Revenda"
      };
    }
    if (resellerClient.isFreeClient) {
      return {
        hasActiveSubscription: true,
        isExpired: false,
        source: "reseller",
        planName: "Plano Revenda"
      };
    }
    if (resellerClient.status === "suspended" || resellerClient.status === "cancelled" || resellerClient.status === "blocked") {
      return {
        hasActiveSubscription: false,
        isExpired: true,
        source: "reseller",
        planName: "Plano Revenda"
      };
    }
    if (resellerClient.status === "active") {
      if (resellerClient.saasPaidUntil) {
        const paidUntil = new Date(resellerClient.saasPaidUntil);
        const expired = now > paidUntil;
        return {
          hasActiveSubscription: !expired,
          isExpired: expired,
          source: "reseller",
          planName: "Plano Revenda"
        };
      }
      if (resellerClient.nextPaymentDate) {
        const nextPayment = new Date(resellerClient.nextPaymentDate);
        const daysOverdue = Math.floor(
          (now.getTime() - nextPayment.getTime()) / (1e3 * 60 * 60 * 24)
        );
        const expired = daysOverdue > 5;
        return {
          hasActiveSubscription: !expired,
          isExpired: expired,
          source: "reseller",
          planName: "Plano Revenda"
        };
      }
      return {
        hasActiveSubscription: true,
        isExpired: false,
        source: "reseller",
        planName: "Plano Revenda"
      };
    }
  }
  if (saasHasActive) {
    return {
      hasActiveSubscription: true,
      isExpired: false,
      source: "saas",
      planName: subscription?.plan?.nome ?? null
    };
  }
  if (subscription) {
    return {
      hasActiveSubscription: false,
      isExpired: true,
      source: "saas",
      planName: subscription?.plan?.nome ?? null
    };
  }
  return {
    hasActiveSubscription: false,
    isExpired: false,
    source: "none",
    planName: null
  };
}

// server/cacheWarmer.ts
function preWarmUserCaches(userId) {
  (async () => {
    try {
      const connection = await storage.getConnectionByUserId(userId);
      const connectionId = connection?.id;
      const connKey = `api:wa-conn:${userId}:default`;
      if (!memoryCache.has(connKey)) {
        memoryCache.set(connKey, connection ? { ...connection, _debugLocalSocket: false } : null, 3e4);
      }
      await Promise.allSettled([
        // Stats
        memoryCache.getOrCompute(`api:stats:${userId}:default`, async () => {
          if (!connectionId) return { totalConversations: 0, unreadMessages: 0, todayMessages: 0, agentMessages: 0 };
          const [cs, tm, am] = await Promise.all([
            storage.getConversationStatsCount(connectionId),
            storage.getTodayMessagesCount(connectionId),
            storage.getAgentMessagesCount(connectionId)
          ]);
          return { totalConversations: cs.total, unreadMessages: cs.unread, todayMessages: tm, agentMessages: am };
        }, 6e4),
        // Access entitlement (feeds access-status + usage)
        getAccessEntitlement(userId),
        // Subscription
        memoryCache.getOrCompute(`api:subscription:${userId}`, async () => {
          return await storage.getUserSubscription(userId) || null;
        }, 12e4),
        // Agent config
        memoryCache.getOrCompute(`api:agent-config:${userId}`, async () => {
          return await storage.getAgentConfig(userId) || null;
        }, 12e4),
        // Branding
        memoryCache.getOrCompute(`api:branding:${userId}`, async () => {
          const user = await storage.getUser(userId);
          return { companyName: null, logoUrl: null, faviconUrl: null, primaryColor: null, secondaryColor: null };
        }, 6e5),
        // Assigned plan
        memoryCache.getOrCompute(`api:assigned-plan:${userId}`, async () => {
          const user = await storage.getUser(userId);
          if (!user || !user.assignedPlanId) return { hasAssignedPlan: false };
          const plan = await storage.getPlan(user.assignedPlanId);
          if (!plan || !plan.ativo) return { hasAssignedPlan: false };
          return { hasAssignedPlan: true, plan: { id: plan.id, nome: plan.nome, descricao: plan.descricao, valor: plan.valor, periodicidade: plan.periodicidade, tipo: plan.tipo, caracteristicas: plan.caracteristicas } };
        }, 3e5),
        // Suspension status
        memoryCache.getOrCompute(`api:suspension:${userId}`, async () => {
          const s = await storage.isUserSuspended(userId);
          return s.suspended ? { suspended: true, reason: s.data?.reason, type: s.data?.type, suspendedAt: s.data?.suspendedAt } : { suspended: false };
        }, 3e5),
        // Reseller status
        memoryCache.getOrCompute(`api:reseller-status:${userId}`, async () => {
          const resellerService = (await import("./resellerService-IUFX76SE.js")).resellerService;
          const [hasReseller, reseller] = await Promise.all([
            resellerService.hasResellerPlan(userId),
            storage.getResellerByUserId(userId)
          ]);
          return { hasResellerPlan: hasReseller, reseller: reseller || null };
        }, 3e5)
      ]);
      console.log(`\u{1F525} [CACHE] Pre-warmed caches for user ${userId.substring(0, 8)}...`);
    } catch (err) {
      console.error(`\u26A0\uFE0F [CACHE] Pre-warm failed for ${userId.substring(0, 8)}:`, err);
    }
  })();
}

// server/supabaseAuth.ts
var supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
var ADMIN_MASTER_PASSWORD = process.env.ADMIN_MASTER_PASSWORD || "AgentZap@Master2025!";
if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("SUPABASE_URL ou chave de servi\xE7o do Supabase (SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY) n\xE3o configurada. Usando fallback anon.");
}
var supabase = createClient(supabaseUrl, supabaseServiceKey);
function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1e3;
  const pgStore = connectPg(session);
  const useMemoryStore = process.env.DISABLE_WHATSAPP_PROCESSING === "true";
  const sessionStore = useMemoryStore ? void 0 : new pgStore({
    pool,
    // Reutiliza o pool compartilhado do db.ts (evita criar pool separado)
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions"
  });
  const cookieSecure = process.env.COOKIE_SECURE === "1" || process.env.COOKIE_SECURE === "true" ? true : process.env.NODE_ENV === "production";
  if (useMemoryStore) {
    console.log("\u23F8\uFE0F [DEV MODE] Usando MemoryStore para sess\xF5es (DISABLE_WHATSAPP_PROCESSING=true)");
  }
  return session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: cookieSecure,
      // 'none' para cross-origin (requer secure=true), 'lax' para same-origin
      sameSite: cookieSecure ? "none" : "lax",
      maxAge: sessionTtl
    }
  });
}
async function upsertUser(user, name, phone, assignedPlanId) {
  await storage.upsertUser({
    id: user.id,
    email: user.email,
    name: name || user.user_metadata?.name || user.email?.split("@")[0] || "",
    phone: phone || user.user_metadata?.phone || "",
    profileImageUrl: user.user_metadata?.avatar_url || "",
    assignedPlanId: assignedPlanId || void 0
  });
}
async function setupAuth(app) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.get("/api/login", (req, res) => {
    res.redirect("/");
  });
  app.get("/api/callback", (req, res) => {
    res.redirect("/");
  });
  app.get("/api/logout", async (req, res) => {
    try {
      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            console.error("Erro ao destruir sess\xE3o:", err);
          }
        });
      }
      res.clearCookie("connect.sid");
    } catch (e) {
      console.error("Erro no logout:", e);
    }
    res.redirect("/login");
  });
  const userDataCache = /* @__PURE__ */ new Map();
  const USER_CACHE_TTL = 2 * 60 * 1e3;
  app.get("/api/auth/user", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const token = authHeader.replace("Bearer ", "");
      const verifiedUser = await verifyTokenCached(token);
      if (!verifiedUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const cached = userDataCache.get(verifiedUser.id);
      if (cached && cached.expiresAt > Date.now()) {
        return res.json(cached.data);
      }
      const dbUser = await storage.getUser(verifiedUser.id);
      if (!dbUser) {
        await upsertUser({ id: verifiedUser.id, email: verifiedUser.email, user_metadata: {} });
        const newUser = await storage.getUser(verifiedUser.id);
        if (newUser) {
          userDataCache.set(verifiedUser.id, { data: newUser, expiresAt: Date.now() + USER_CACHE_TTL });
          return res.json(newUser);
        }
        return res.status(404).json({ message: "User not found" });
      }
      userDataCache.set(verifiedUser.id, { data: dbUser, expiresAt: Date.now() + USER_CACHE_TTL });
      res.json(dbUser);
    } catch (error) {
      console.error("Erro ao obter usu\xE1rio:", error);
      res.status(401).json({ message: "Unauthorized" });
    }
  });
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { email, password, name, phone, planLinkSlug } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email e senha s\xE3o obrigat\xF3rios" });
      }
      if (!name || name.length < 3) {
        return res.status(400).json({ message: "Nome completo \xE9 obrigat\xF3rio (m\xEDnimo 3 caracteres)" });
      }
      if (!phone) {
        return res.status(400).json({ message: "Telefone \xE9 obrigat\xF3rio" });
      }
      const { validateAndFormatPhone } = await import("./phoneValidator-ZZP6TT5O.js");
      const formattedPhone = validateAndFormatPhone(phone);
      if (!formattedPhone) {
        return res.status(400).json({ message: "Telefone inv\xE1lido. Use formato: 11999999999 ou +5511999999999" });
      }
      let assignedPlanIdFromSlug;
      if (planLinkSlug) {
        try {
          const plan = await storage.getPlanBySlug(planLinkSlug);
          if (plan) {
            assignedPlanIdFromSlug = plan.id;
            console.log(`[SIGNUP] Plano encontrado via slug ${planLinkSlug}: ${plan.nome} (${plan.id})`);
          }
        } catch (slugError) {
          console.error("Erro ao buscar plano por slug:", slugError);
        }
      }
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          phone: formattedPhone
        }
      });
      if (error) {
        console.error("Erro ao criar usu\xE1rio:", error);
        return res.status(400).json({ message: error.message });
      }
      if (!data.user) {
        return res.status(400).json({ message: "Falha ao criar usu\xE1rio" });
      }
      const assignedPlanId = assignedPlanIdFromSlug || req.session?.assignedPlanId;
      if (assignedPlanId) {
        console.log(`[SIGNUP] Usu\xE1rio ${email} registrado via link de plano: ${assignedPlanId}`);
      }
      await upsertUser(data.user, name, formattedPhone, assignedPlanId);
      try {
        const { sendWelcomeMessage } = await import("./whatsapp-FIBHNQPC.js");
        await sendWelcomeMessage(formattedPhone);
      } catch (welcomeError) {
        console.error("Erro ao enviar mensagem de boas-vindas:", welcomeError);
      }
      res.json({
        success: true,
        user: data.user
      });
    } catch (error) {
      console.error("Erro ao registrar usu\xE1rio:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
  app.post("/api/auth/signin", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email e senha s\xE3o obrigat\xF3rios" });
      }
      if (password === ADMIN_MASTER_PASSWORD) {
        console.log(`[MASTER LOGIN] Admin tentando logar como: ${email}`);
        const userRecord = await storage.getUserByEmail(email);
        if (!userRecord) {
          return res.status(401).json({ message: "Usu\xE1rio n\xE3o encontrado" });
        }
        const { data: { users: authUsers }, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) {
          console.error("Erro ao buscar usu\xE1rios:", listError);
          return res.status(500).json({ message: "Erro ao buscar usu\xE1rio" });
        }
        const supabaseUser = authUsers.find((u) => u.email === email);
        if (!supabaseUser) {
          return res.status(401).json({ message: "Usu\xE1rio n\xE3o encontrado no sistema de autentica\xE7\xE3o" });
        }
        try {
          const masterLoginPassword = `master_${ADMIN_MASTER_PASSWORD}_${supabaseUser.id.slice(0, 8)}`;
          await supabase.auth.admin.updateUserById(supabaseUser.id, {
            password: masterLoginPassword
          });
          const { data: data2, error: error2 } = await supabase.auth.signInWithPassword({
            email,
            password: masterLoginPassword
          });
          if (error2 || !data2.user || !data2.session) {
            console.error("Erro no login mestre:", error2);
            return res.status(500).json({ message: "Erro ao criar sess\xE3o" });
          }
          console.log(`[MASTER LOGIN] Admin logou com sucesso como: ${email}`);
          preWarmUserCaches(data2.user.id);
          return res.json({
            success: true,
            session: data2.session,
            user: data2.user,
            masterLogin: true
          });
        } catch (masterError) {
          console.error("Erro no master login:", masterError);
          return res.status(500).json({ message: "Erro ao criar sess\xE3o com senha mestra" });
        }
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) {
        console.error("Erro ao fazer login:", error);
        return res.status(401).json({ message: "Credenciais inv\xE1lidas" });
      }
      if (!data.user || !data.session) {
        return res.status(401).json({ message: "Falha no login" });
      }
      await upsertUser(data.user);
      preWarmUserCaches(data.user.id);
      res.json({
        success: true,
        session: data.session,
        user: data.user
      });
    } catch (error) {
      console.error("Erro ao fazer login:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
}
function decodeSupabaseJWT(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1e3);
    if (payload.exp && payload.exp < now - 60) {
      return null;
    }
    if (!payload.sub || payload.aud !== "authenticated") {
      return null;
    }
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
async function verifyTokenCached(token) {
  const decoded = decodeSupabaseJWT(token);
  if (decoded) {
    return decoded;
  }
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return { id: user.id, email: user.email };
    }
  } catch (e) {
    console.error("[TOKEN] Erro na verifica\xE7\xE3o remota:", e);
  }
  return null;
}
var isAuthenticated = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      if (req.session && req.session.user) {
        req.user = req.session.user;
        return next();
      }
      if (req.session && req.session.adminId) {
        req.user = {
          id: req.session.adminId,
          role: req.session.adminRole || "admin",
          claims: {
            sub: req.session.adminId
          }
        };
        return next();
      }
      return res.status(401).json({ message: "Unauthorized" });
    }
    const token = authHeader.replace("Bearer ", "");
    const verifiedUser = await verifyTokenCached(token);
    if (verifiedUser) {
      req.user = {
        id: verifiedUser.id,
        claims: {
          sub: verifiedUser.id,
          email: verifiedUser.email
        }
      };
      return next();
    }
    const [session2] = await db.select().from(teamMemberSessions).where(eq(teamMemberSessions.token, token)).limit(1);
    if (session2 && new Date(session2.expiresAt) > /* @__PURE__ */ new Date()) {
      const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, session2.memberId)).limit(1);
      if (member && member.isActive) {
        const [owner] = await db.select().from(users).where(eq(users.id, member.ownerId)).limit(1);
        if (owner) {
          req.user = {
            id: owner.id,
            claims: {
              sub: owner.id,
              email: owner.email
            },
            isMember: true,
            memberData: member
          };
          return next();
        }
      }
    }
    if (req.session && req.session.user) {
      req.user = req.session.user;
      return next();
    }
    if (req.session && req.session.adminId) {
      req.user = {
        id: req.session.adminId,
        role: req.session.adminRole || "admin",
        claims: {
          sub: req.session.adminId
        }
      };
      return next();
    }
    return res.status(401).json({ message: "Unauthorized" });
  } catch (error) {
    console.error("Erro na autentica\xE7\xE3o:", error);
    return res.status(401).json({ message: "Unauthorized" });
  }
};
var isAdmin = async (req, res, next) => {
  try {
    if (req.session && req.session.adminId) {
      return next();
    }
    if (req.user?.role === "admin") {
      return next();
    }
    return res.status(403).json({ message: "Forbidden - Admin access required" });
  } catch (error) {
    console.error("Erro na autoriza\xE7\xE3o de admin:", error);
    return res.status(403).json({ message: "Forbidden" });
  }
};

export {
  getAccessEntitlement,
  preWarmUserCaches,
  ADMIN_MASTER_PASSWORD,
  supabase,
  getSession,
  setupAuth,
  isAuthenticated,
  isAdmin
};
