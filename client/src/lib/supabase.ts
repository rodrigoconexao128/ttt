import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bnfpcuzjvycudccycqqt.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseAnonKey) {
  console.error('❌ VITE_SUPABASE_ANON_KEY não configurado - autenticação não funcionará!');
}

// Criar cliente com configuração padrão (usa localStorage automaticamente)
// A chave padrão é sb-{projectRef}-auth-token
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Não definir storageKey para usar a chave padrão do Supabase
  },
});

// 🚀 Verifica se um JWT está expirado localmente (sem chamada de rede)
function isTokenExpired(token: string, marginSeconds = 30): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    const now = Math.floor(Date.now() / 1000);
    return !payload.exp || payload.exp < now - marginSeconds;
  } catch {
    return true;
  }
}

// Função auxiliar para obter o token de autenticação
// 🚀 OTIMIZADO: Verifica expiração localmente e faz refresh proativo se necessário
export async function getAuthToken(): Promise<string | null> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error('[SUPABASE] Erro ao obter sessão:', error.message);
      return null;
    }
    
    const token = session?.access_token;
    if (!token) return null;
    
    // 🚀 Verificar expiração localmente — se expirado, fazer refresh ANTES de retornar
    if (isTokenExpired(token)) {
      console.log('[SUPABASE] Token expirado localmente, fazendo refresh proativo...');
      const refreshed = await refreshSession();
      if (refreshed) {
        const { data: { session: newSession } } = await supabase.auth.getSession();
        return newSession?.access_token || null;
      }
      return null;
    }
    
    return token;
  } catch (e) {
    console.error('[SUPABASE] Exceção ao obter token:', e);
    return null;
  }
}

// Função auxiliar para fazer requisições autenticadas
export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    ...options.headers as Record<string, string>,
    'Content-Type': 'application/json',
    'Accept': 'application/json', // Correção: header necessário para evitar erro 406
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

// 🔄 Função para forçar refresh da sessão
export async function refreshSession(): Promise<boolean> {
  try {
    console.log('[SUPABASE] Tentando refresh da sessão...');
    const { data, error } = await supabase.auth.refreshSession();
    
    if (error) {
      console.error('[SUPABASE] Erro ao fazer refresh:', error.message);
      return false;
    }
    
    if (data.session) {
      console.log('[SUPABASE] ✅ Sessão renovada com sucesso');
      return true;
    }
    
    console.log('[SUPABASE] ⚠️ Refresh sem erro mas sem sessão');
    return false;
  } catch (e) {
    console.error('[SUPABASE] Exceção ao fazer refresh:', e);
    return false;
  }
}
