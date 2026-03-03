import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { getAuthToken, refreshSession, supabase } from "@/lib/supabase";

// Singleton flag: only ONE onAuthStateChange listener across all useAuth() instances
let _authListenerActive = false;

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

    let token = await getAuthToken();

    // Se não tem token, tenta refresh antes de desistir
    if (!token) {
      console.log("[AUTH] Token não encontrado, tentando refresh...");
      const refreshed = await refreshSession();
      if (refreshed) {
        token = await getAuthToken();
        console.log("[AUTH] Refresh bem sucedido, token:", token ? "obtido" : "ainda null");
      }
      if (!token) {
        return null;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // ⚡ Timeout de 5s (antes 10s)

    try {
      // 🚀 OTIMIZADO: Usar fetch direto com token já obtido (evita chamar getAuthToken() de novo dentro de fetchWithAuth)
      const response = await fetch("/api/auth/user", {
        signal: controller.signal,
        credentials: "include",
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          // Token inválido - tenta refresh UMA VEZ antes de desistir
          console.log("[AUTH] 401 no /api/auth/user, tentando refresh...");
          const refreshed = await refreshSession();
          if (refreshed) {
            const newToken = await getAuthToken();
            if (newToken) {
              // Retry com token novo (fetch direto, sem timeout extra)
              const retryResponse = await fetch("/api/auth/user", {
                credentials: "include",
                headers: {
                  'Authorization': `Bearer ${newToken}`,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                },
              });
              if (retryResponse.ok) {
                console.log("[AUTH] ✅ Retry após refresh bem sucedido");
                return await retryResponse.json();
              }
            }
          }
          // Refresh falhou ou retry falhou - sessão realmente inválida
          console.warn("[AUTH] Sessão realmente inválida após retry");
          return null;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.warn("[AUTH] Timeout ao buscar usuário");
        return null;
      }
      throw fetchError;
    }
  } catch (error) {
    console.error("Erro ao buscar usuário:", error);
    return null;
  }
}

export function useAuth() {
  const queryClient = useQueryClient();
  
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: 1, // Retry uma vez em caso de erro de rede/transiente
    retryDelay: 1000, // ⚡ Espera 1s antes de retry (antes 2s)

    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 5 * 60 * 1000, // Substitui cacheTime
  });

  // 🔄 Listener para mudanças de autenticação do Supabase
  // Detecta: login, logout, token refresh, sessão expirada
  // DEBOUNCE: Evita múltiplas invalidações simultâneas (SIGNED_IN + INITIAL_SESSION)
  useEffect(() => {
    // Pular listener para membros (usam token próprio)
    if (isMemberSession()) return;
    // Singleton: only the FIRST useAuth() instance sets up the listener
    if (_authListenerActive) return;
    _authListenerActive = true;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("[AUTH] onAuthStateChange:", event, session ? "com sessão" : "sem sessão");
        
        if (event === 'SIGNED_OUT') {
          // Usuário fez logout - limpar cache imediatamente
          if (debounceTimer) clearTimeout(debounceTimer);
          queryClient.setQueryData(["/api/auth/user"], null);
        } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          // Debounce: agrupar múltiplos eventos em um único refetch
          if (session) {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
            }, 500); // 500ms debounce to batch consecutive events
          }
        }
      }
    );

    return () => {
      _authListenerActive = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      subscription.unsubscribe();
    };
  }, [queryClient]);

  return {
    user: user || undefined,
    isLoading,
    isAuthenticated: !!user,
  };
}
