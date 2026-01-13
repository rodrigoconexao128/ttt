import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { fetchWithAuth, getAuthToken, refreshSession } from "./supabase";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  retryCount = 0,
): Promise<Response> {
  const token = await getAuthToken();

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
  if (res.status === 401 && retryCount === 0) {
    console.log('🔄 [API] Sessão expirou, fazendo refresh e retry...');
    
    // Tenta refresh da sessão
    const refreshed = await refreshSession();
    
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
    const token = await getAuthToken();

    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
    });

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
