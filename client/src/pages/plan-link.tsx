import { useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function PlanLinkPage() {
  const [, params] = useRoute("/p/:slug");
  const [, setLocation] = useLocation();

  useEffect(() => {
    const assignPlanFromLink = async () => {
      if (!params?.slug) {
        // Link inválido, redireciona para home
        setLocation("/");
        return;
      }

      try {
        // Salvar na sessão silenciosamente para quando o usuário se registrar
        await apiRequest("POST", "/api/plans/assign-by-link", {
          slug: params.slug
        });
      } catch (error) {
        // Mesmo se der erro, continua para a home
        console.error("Erro ao processar link do plano:", error);
      }
      
      // Redireciona imediatamente para a página inicial
      setLocation("/");
    };

    assignPlanFromLink();
  }, [params?.slug, setLocation]);

  // Mostra apenas um loading mínimo enquanto processa (será muito rápido)
  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
      <Loader2 className="h-8 w-8 animate-spin text-green-500" />
    </div>
  );
}
