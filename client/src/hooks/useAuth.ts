import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { fetchWithAuth, getAuthToken } from "@/lib/supabase";

async function fetchUser(): Promise<User | null> {
  try {
    const token = await getAuthToken();
    if (!token) {
      return null;
    }

    const response = await fetchWithAuth("/api/auth/user");

    if (!response.ok) {
      if (response.status === 401) {
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
