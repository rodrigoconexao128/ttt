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

      // Create a Supabase session via the GoTrue Admin REST endpoint.
      // The JS SDK (installed version) does not expose admin.createSession, so we
      // call the underlying HTTP endpoint directly with the service-role key.
      if (!supabaseUrl || !supabaseServiceKey) {
        console.error('[Autologin] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
        return res.status(500).json({ error: 'Configuração de autenticação ausente' });
      }

      const tokenEndpoint = `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}/token`;
      let supabaseRes: globalThis.Response;
      try {
        supabaseRes = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'apikey': supabaseServiceKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
      } catch (fetchErr: any) {
        console.error('[Autologin] Erro de rede ao chamar Supabase:', fetchErr);
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      if (!supabaseRes.ok) {
        const body = await supabaseRes.text().catch(() => '');
        console.error(`[Autologin] Supabase retornou ${supabaseRes.status}:`, body);
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      let sessionData: any;
      try {
        sessionData = await supabaseRes.json();
      } catch (parseErr) {
        console.error('[Autologin] Resposta do Supabase não é JSON válido');
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      const access_token: string | undefined = sessionData?.access_token;
      const refresh_token: string | undefined = sessionData?.refresh_token;

      if (!access_token || !refresh_token) {
        console.error('[Autologin] Resposta do Supabase sem tokens esperados:', sessionData);
        return res.status(500).json({ error: 'Erro ao criar sessão' });
      }

      return res.json({ access_token, refresh_token, redirect_to: redirectTo });
    } catch (error: any) {
      console.error('[Autologin]', error);
      return res.status(500).json({ error: 'Erro interno' });
    }
  });
}
