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

// Função auxiliar para obter o token de autenticação
export async function getAuthToken(): Promise<string | null> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error('[SUPABASE] Erro ao obter sessão:', error.message);
      return null;
    }
    return session?.access_token || null;
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
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

