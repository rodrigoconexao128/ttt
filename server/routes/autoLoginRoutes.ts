/**
 * 🔐 AUTO-LOGIN ROUTES
 * Rotas para login automático via token JWT temporário
 * Usado para links de conexão WhatsApp e assinatura de planos
 */

import { Router } from "express";
import { storage } from "../storage";
import { supabase } from "../supabaseAuth";

const router = Router();

/**
 * GET /api/auto-login/verify/:token
 * Verifica token e retorna dados do usuário
 */
router.get("/verify/:token", async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: "Token não fornecido" });
    }

    // Buscar token no banco
    const { data: tokenData, error } = await supabase
      .from("auto_login_tokens")
      .select("*")
      .eq("token", token)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error || !tokenData) {
      console.error("❌ [AUTO-LOGIN] Token inválido ou expirado:", error);
      return res.status(401).json({ error: "Token inválido ou expirado" });
    }

    // Buscar usuário
    const user = await storage.getUser(tokenData.user_id);
    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    // Marcar token como usado
    await supabase
      .from("auto_login_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token", token);

    // Criar sessão de login no Supabase
    // Para segurança, vamos criar uma sessão temporária limitada
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: user.email!,
      options: {
        redirectTo: tokenData.purpose === "connection" 
          ? `${process.env.APP_URL || "https://agentezap.online"}/conexao`
          : `${process.env.APP_URL || "https://agentezap.online"}/plans`
      }
    });

    if (sessionError || !sessionData) {
      console.error("❌ [AUTO-LOGIN] Erro ao criar sessão:", sessionError);
      return res.status(500).json({ error: "Erro ao criar sessão" });
    }

    console.log(`✅ [AUTO-LOGIN] Token ${token} validado para ${user.email} (${tokenData.purpose})`);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      purpose: tokenData.purpose,
      redirectUrl: sessionData.properties?.action_link || sessionData.properties?.hashed_token
    });

  } catch (error) {
    console.error("❌ [AUTO-LOGIN] Erro:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

/**
 * POST /api/auto-login/session
 * Cria sessão autenticada a partir de token válido
 */
router.post("/session", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token não fornecido" });
    }

    // Buscar token no banco
    const { data: tokenData, error } = await supabase
      .from("auto_login_tokens")
      .select("*")
      .eq("token", token)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error || !tokenData) {
      return res.status(401).json({ error: "Token inválido ou expirado" });
    }

    // Buscar usuário
    const user = await storage.getUser(tokenData.user_id);
    if (!user || !user.email) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    // Marcar token como usado
    await supabase
      .from("auto_login_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token", token);

    // Criar sessão de autenticação diretamente
    // Vamos usar a senha mestra para logar
    const { ADMIN_MASTER_PASSWORD } = await import("../supabaseAuth");
    const masterPassword = `master_${ADMIN_MASTER_PASSWORD}_${tokenData.user_id.slice(0, 8)}`;

    // Atualizar senha do usuário para a senha mestra derivada
    await supabase.auth.admin.updateUserById(tokenData.user_id, {
      password: masterPassword
    });

    // Fazer login com a senha mestra
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: masterPassword
    });

    if (signInError || !signInData.session) {
      console.error("❌ [AUTO-LOGIN] Erro ao fazer login:", signInError);
      return res.status(500).json({ error: "Erro ao criar sessão" });
    }

    console.log(`✅ [AUTO-LOGIN] Sessão criada para ${user.email}`);

    res.json({
      success: true,
      session: signInData.session,
      user: signInData.user,
      purpose: tokenData.purpose
    });

  } catch (error) {
    console.error("❌ [AUTO-LOGIN] Erro:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

export default router;
