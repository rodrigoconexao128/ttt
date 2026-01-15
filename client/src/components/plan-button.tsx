import { Zap } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Plan } from "@shared/schema";

export function PlanButton() {
  const [, setLocation] = useLocation();

  // Verificar se tem plano atribuído via link
  const { data: assignedPlanData } = useQuery<{
    hasAssignedPlan: boolean;
    plan?: Plan & { valorPrimeiraCobranca?: string };
  }>({
    queryKey: ["/api/user/assigned-plan"],
  });

  const planPrice = assignedPlanData?.hasAssignedPlan && assignedPlanData?.plan
    ? Number(assignedPlanData.plan.valor).toFixed(2).replace('.', ',')
    : "99,99";

  const planName = assignedPlanData?.hasAssignedPlan && assignedPlanData?.plan
    ? assignedPlanData.plan.nome
    : "Plano Ilimitado";

  return (
    <button
      onClick={() => setLocation("/plans")}
      className="fixed bottom-4 left-4 z-50 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 transition-all hover:scale-105"
    >
      <Zap className="h-5 w-5" />
      <div className="text-left">
        <div className="text-xs font-medium opacity-90">{planName}</div>
        <div className="text-sm font-bold">R$ {planPrice}/mês</div>
      </div>
    </button>
  );
}
