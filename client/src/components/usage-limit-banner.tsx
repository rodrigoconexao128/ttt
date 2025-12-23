import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Rocket, Zap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface UsageData {
  agentMessagesCount: number;
  limit: number;
  remaining: number;
  isLimitReached: boolean;
  hasActiveSubscription: boolean;
  planName: string | null;
}

export function UsageLimitBanner() {
  const { data: usage } = useQuery<UsageData>({
    queryKey: ["/api/usage"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Don't show if user has active subscription (unlimited)
  if (!usage || usage.hasActiveSubscription) {
    return null;
  }

  const percentUsed = Math.min(100, (usage.agentMessagesCount / usage.limit) * 100);
  const isWarning = percentUsed >= 60 && percentUsed < 100;
  const isCritical = usage.isLimitReached;

  return (
    <div 
      className={cn(
        "relative overflow-hidden rounded-lg border p-4 transition-all duration-300",
        isCritical 
          ? "bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30 border-red-200 dark:border-red-800" 
          : isWarning 
            ? "bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 border-amber-200 dark:border-amber-800"
            : "bg-gradient-to-r from-blue-50 to-violet-50 dark:from-blue-950/30 dark:to-violet-950/30 border-blue-200 dark:border-blue-800"
      )}
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 opacity-10">
        <Zap className="w-full h-full" />
      </div>
      
      <div className="relative z-10 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isCritical ? (
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 animate-pulse" />
            ) : (
              <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            )}
            <span className={cn(
              "font-semibold",
              isCritical 
                ? "text-red-700 dark:text-red-300" 
                : isWarning 
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-blue-700 dark:text-blue-300"
            )}>
              {isCritical 
                ? "Limite atingido!" 
                : isWarning 
                  ? "Quase no limite" 
                  : "Período de teste"
              }
            </span>
          </div>
          <span className="text-sm font-medium text-muted-foreground">
            {usage.agentMessagesCount}/{usage.limit} mensagens
          </span>
        </div>

        {/* Progress bar */}
        <Progress 
          value={percentUsed} 
          className={cn(
            "h-2",
            isCritical 
              ? "[&>div]:bg-red-500" 
              : isWarning 
                ? "[&>div]:bg-amber-500"
                : "[&>div]:bg-blue-500"
          )}
        />

        {/* Description */}
        <p className="text-sm text-muted-foreground">
          {isCritical ? (
            <>Seu agente IA não pode mais enviar mensagens. <strong>Assine agora</strong> para continuar usando!</>
          ) : (
            <>Você pode testar até <strong>{usage.limit} mensagens</strong>. Restam <strong>{usage.remaining}</strong> mensagens.</>
          )}
        </p>

        {/* CTA Button */}
        <a
          href="https://agentezap.online/plans"
          className={cn(
            "inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg font-bold text-white transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5",
            isCritical
              ? "bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700"
              : "bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700"
          )}
        >
          <Rocket className="w-4 h-4" />
          {isCritical 
            ? "Assinar Plano Ilimitado - R$99/mês" 
            : "Garantir Plano Ilimitado - R$99/mês"
          }
        </a>
      </div>
    </div>
  );
}
