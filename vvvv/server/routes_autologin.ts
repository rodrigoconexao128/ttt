import type { Express, Request, Response } from 'express';
import { pool } from './db';

// Read Supabase credentials from env (same resolution order as supabaseAuth.ts)
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

export function registerAutologinRoutes(app: Express): void {
  app.get('/api/autologin/:token', async (req: Request, res: Response) => {
    try {
      const token = req.params.token;
      if (!token) return res.status(400).json({ error: 'Token ausente' });

      // Atomic: validate + mark used in one statement — prevents concurrent reuse
      const { rows } = await pool.query(
        `UPDATE admin_autologin_tokens
         SET used_at = NOW()
         WHERE token = $1
           AND expires_at > NOW()
           AND used_at IS NULL
         RETURNING user_id, redirect_to`,
        [token]
      );

      if (!rows || rows.length === 0) {
        return res.status(401).json({ error: 'Link inválido ou expirado' });
      }

      const userId = rows[0].user_id as string;
      const redirectTo = (rows[0].redirect_to as string) || '/conexao';

      // Lazy cleanup: remove other expired tokens for the same user (non-fatal)
      try {
        await pool.query(
          'DELETE FROM admin_autologin_tokens WHERE user_id = $1 AND expires_at < NOW()',
          [userId]
        );
      } catch (e) {
        console.warn('[Autologin] Falha ao limpar tokens expirados:', e);
      }

      if (!supabaseUrl || !supabaseServiceKey) {
        console.error('[Autologin] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
        return res.status(500).json({ error: 'Configuração de autenticação ausente' });
      }

      // V23h: 2-step approach using Supabase Admin API
      // Step 1: Get user email from auth.users
      const userResult = await pool.query(
        'SELECT email FROM auth.users WHERE id = $1',
        [userId]
      );
      if (!userResult.rows || userResult.rows.length === 0) {
        console.error(`[Autologin] Usuário ${userId} não encontrado em auth.users`);
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }
      const userEmail = userResult.rows[0].email as string;

      // Step 2: Generate a magic link via Admin API (returns hashed_token)
      const generateLinkEndpoint = `${supabaseUrl}/auth/v1/admin/generate_link`;
      let generateRes: globalThis.Response;
      try {
        generateRes = await fetch(generateLinkEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'apikey': supabaseServiceKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'magiclink',
            email: userEmail,
          }),
        });
      } catch (fetchErr: any) {
        console.error('[Autologin] Erro de rede ao gerar link:', fetchErr);
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      if (!generateRes.ok) {
        const body = await generateRes.text().catch(() => '');
        console.error(`[Autologin] generate_link retornou ${generateRes.status}:`, body);
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      let linkData: any;
      try {
        linkData = await generateRes.json();
      } catch (parseErr) {
        console.error('[Autologin] Resposta do generate_link não é JSON válido');
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      const hashedToken = linkData?.properties?.hashed_token || linkData?.hashed_token;
      if (!hashedToken) {
        console.error('[Autologin] generate_link sem hashed_token:', JSON.stringify(linkData).substring(0, 200));
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      // Step 3: Verify the token to get access_token + refresh_token
      const verifyEndpoint = `${supabaseUrl}/auth/v1/verify`;
      let verifyRes: globalThis.Response;
      try {
        verifyRes = await fetch(verifyEndpoint, {
          method: 'POST',
          headers: {
            'apikey': supabaseServiceKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token_hash: hashedToken,
            type: 'magiclink',
          }),
        });
      } catch (fetchErr: any) {
        console.error('[Autologin] Erro de rede ao verificar token:', fetchErr);
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      if (!verifyRes.ok) {
        const body = await verifyRes.text().catch(() => '');
        console.error(`[Autologin] verify retornou ${verifyRes.status}:`, body);
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      let sessionData: any;
      try {
        sessionData = await verifyRes.json();
      } catch (parseErr) {
        console.error('[Autologin] Resposta do verify não é JSON válido');
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      const access_token: string | undefined = sessionData?.access_token;
      const refresh_token: string | undefined = sessionData?.refresh_token;

      if (!access_token || !refresh_token) {
        console.error('[Autologin] Resposta do verify sem tokens esperados:', JSON.stringify(sessionData).substring(0, 200));
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      // V23k: Set Express session so cookie-based auth also works
      // This prevents session drops when navigating between pages
      if (req.session) {
        (req.session as any).user = { id: userId, email: userEmail };
        console.log(`[Autologin] Express session sincronizada para userId=${userId} email=${userEmail}`);
      }

      return res.json({ access_token, refresh_token, redirect_to: redirectTo });
    } catch (error: any) {
      console.error('[Autologin]', error);
      return res.status(500).json({ error: 'Erro interno' });
    }
  });
}
