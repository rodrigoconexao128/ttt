import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { fetchWithAuth, getAuthToken, refreshSession } from "./supabase";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Flag para evitar múltiplos refreshes simultâneos
let _refreshPromise: Promise<boolean> | null = null;
async function singletonRefresh(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = refreshSession().finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  retryCount = 0,
): Promise<Response> {
  // Verificar se tem token de membro primeiro
  const memberToken = localStorage.getItem("memberToken");
  const token = memberToken || await getAuthToken();

  const headers: Record<string, string> = {
    ...(data ? { "Content-Type": "application/json" } : {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  // 🔄 RETRY: Se receber 401 e ainda não tentou refresh, tenta novamente
  // (mas apenas para usuários normais, não para membros)
  if (res.status === 401 && retryCount === 0 && !memberToken) {
    console.log('🔄 [API] Sessão expirou, fazendo refresh e retry...');
    
    // Tenta refresh da sessão (singleton para evitar race conditions)
    const refreshed = await singletonRefresh();
    
    if (refreshed) {
      console.log('✅ [API] Sessão renovada, tentando request novamente');
      // Retry com novo token (incrementa retryCount para evitar loop infinito)
      return apiRequest(method, url, data, retryCount + 1);
    } else {
      console.log('❌ [API] Falha no refresh, lançando erro 401');
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Verificar se tem token de membro primeiro
    const memberToken = localStorage.getItem("memberToken");
    let token = memberToken || await getAuthToken();

    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
    });

    // 🔄 RETRY: Se receber 401, tenta refresh e retry uma vez (apenas para não-membros)
    if (res.status === 401 && !memberToken) {
      console.log('🔄 [QUERY] 401 em', queryKey[0], '- tentando refresh...');
      const refreshed = await singletonRefresh();
      
      if (refreshed) {
        // Pegar novo token após refresh
        const newToken = await getAuthToken();
        if (newToken) {
          console.log('✅ [QUERY] Sessão renovada, retry em', queryKey[0]);
          const retryHeaders: Record<string, string> = {
            "Authorization": `Bearer ${newToken}`,
          };
          const retryRes = await fetch(queryKey.join("/") as string, {
            credentials: "include",
            headers: retryHeaders,
          });
          
          if (retryRes.ok) {
            return await retryRes.json();
          }
          
          // Se retry também falhou com 401, agora sim trata como não autorizado
          if (retryRes.status === 401) {
            if (unauthorizedBehavior === "returnNull") return null;
            const text = (await retryRes.text()) || retryRes.statusText;
            throw new Error(`${retryRes.status}: ${text}`);
          }
          
          await throwIfResNotOk(retryRes);
          return await retryRes.json();
        }
      }
      
      // Refresh falhou
      if (unauthorizedBehavior === "returnNull") return null;
      const text = (await res.text()) || res.statusText;
      throw new Error(`${res.status}: ${text}`);
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
