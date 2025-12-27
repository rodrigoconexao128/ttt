import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

// Função para limpar todos os dados de autenticação
async function clearAuthData() {
  try {
    // Limpa sessão do Supabase
    await supabase.auth.signOut();
  } catch (e) {
    console.warn("Erro ao fazer signOut do Supabase:", e);
  }
  
  // Limpa localStorage relacionado à autenticação
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.includes('supabase') || key.includes('auth') || key.includes('token'))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
  
  // Limpa sessionStorage também
  const sessionKeysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && (key.includes('supabase') || key.includes('auth') || key.includes('token'))) {
      sessionKeysToRemove.push(key);
    }
  }
  sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));
}

export default function NotFound() {
  const [, setLocation] = useLocation();
  const [isClearing, setIsClearing] = useState(true);

  useEffect(() => {
    // Limpa dados de autenticação e redireciona para login
    const clearAndRedirect = async () => {
      await clearAuthData();
      setIsClearing(false);
      
      // Redireciona para login após 1 segundo
      setTimeout(() => {
        setLocation("/login");
      }, 1000);
    };
    
    clearAndRedirect();
  }, [setLocation]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            Acesso negado. Redirecionando para login...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
