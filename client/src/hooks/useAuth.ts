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

// Função para verificar se é login de membro
function isMemberSession(): boolean {
  return !!localStorage.getItem("memberToken");
}

// Função para buscar dados do membro autenticado
async function fetchMemberUser(): Promise<User | null> {
  try {
    const memberToken = localStorage.getItem("memberToken");
    if (!memberToken) {
      return null;
    }

    const response = await fetch("/api/team-members/session", {
      headers: {
        "Authorization": `Bearer ${memberToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token inválido - limpar localStorage
        localStorage.removeItem("memberToken");
        localStorage.removeItem("memberData");
        return null;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.authenticated) {
      localStorage.removeItem("memberToken");
      localStorage.removeItem("memberData");
      return null;
    }

    // Retornar dados do owner como se fosse o user (membro acessa com permissões do owner)
    // Mas marcar que é um membro para controle de permissões
    return {
      ...data.owner,
      isMember: true,
      memberData: data.member,
    } as any;
  } catch (error) {
    console.error("Erro ao buscar dados do membro:", error);
    localStorage.removeItem("memberToken");
    localStorage.removeItem("memberData");
    return null;
  }
}

async function fetchUser(): Promise<User | null> {
  try {
    // Verificar se é login de membro primeiro
    if (isMemberSession()) {
      return await fetchMemberUser();
    }

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
    retry: 2, // Tentar 3 vezes no total (1 original + 2 retries)
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000),
    staleTime: 5 * 60 * 1000, // 5 minutos
  });

  return {
    user: user || undefined,
    isLoading,
    isAuthenticated: !!user,
  };
}
