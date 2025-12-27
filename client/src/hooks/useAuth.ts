import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { fetchWithAuth, getAuthToken, supabase } from "@/lib/supabase";

// Flag para evitar múltiplas limpezas simultâneas
let isCleaningAuth = false;

// Função para limpar dados de autenticação inválidos
async function clearInvalidAuth() {
  if (isCleaningAuth) return;
  isCleaningAuth = true;
  
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn("Erro ao fazer signOut:", e);
  }
  
  // Limpa storage relacionado à auth
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.includes('supabase') || key.includes('auth') || key.includes('token'))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
  
  isCleaningAuth = false;
}

async function fetchUser(): Promise<User | null> {
  try {
    const token = await getAuthToken();
    if (!token) {
      return null;
    }

    const response = await fetchWithAuth("/api/auth/user");

    if (!response.ok) {
      if (response.status === 401) {
        // Token inválido ou expirado - limpa automaticamente
        console.warn("Token inválido detectado (401), limpando dados de autenticação...");
        await clearInvalidAuth();
        return null;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Erro ao buscar usuário:", error);
    return null;
  }
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutos
  });

  return {
    user: user || undefined,
    isLoading,
    isAuthenticated: !!user,
  };
}
