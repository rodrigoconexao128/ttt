import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { fetchWithAuth, getAuthToken, supabase } from "@/lib/supabase";

// Flag global para evitar limpeza duplicada (não causa re-render)
let hasCleanedInvalidSession = false;

// Função para limpar sessão inválida de forma segura
async function cleanInvalidSession() {
  if (hasCleanedInvalidSession) return;
  hasCleanedInvalidSession = true;
  
  console.warn("[AUTH] Limpando sessão inválida...");
  
  try {
    // Apenas limpa o storage local, não faz chamada ao servidor
    // (evita erro 403 quando o token já é inválido)
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    // Reset flag após 5 segundos para permitir nova limpeza se necessário
    setTimeout(() => {
      hasCleanedInvalidSession = false;
    }, 5000);
  } catch (e) {
    console.warn("[AUTH] Erro ao limpar sessão:", e);
    hasCleanedInvalidSession = false;
  }
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
        // Token inválido - limpa de forma segura
        await cleanInvalidSession();
        return null;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Login válido - reset flag
    hasCleanedInvalidSession = false;
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
