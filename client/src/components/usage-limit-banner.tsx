import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Rocket, Zap, Lock } from "lucide-react";
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
    refetchInterval: 10000, // Refetch every 10 seconds for more responsive updates
  });

  // Don't show if user has active paid subscription (unlimited)
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
        {isCritical ? <Lock className="w-full h-full" /> : <Zap className="w-full h-full" />}
      </div>
      
      <div className="relative z-10 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isCritical ? (
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 animate-pulse" />
            ) : isWarning ? (
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
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
                ? "🚫 Limite de mensagens esgotado!" 
                : isWarning 
                  ? "⚠️ Quase no limite" 
                  : "Mensagens gratuitas"
              }
            </span>
          </div>
          <span className={cn(
            "text-sm font-bold",
            isCritical 
              ? "text-red-600 dark:text-red-400" 
              : isWarning 
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
          )}>
            {usage.agentMessagesCount}/{usage.limit}
          </span>
        </div>

        {/* Progress bar */}
        <Progress 
          value={percentUsed} 
          className={cn(
            "h-2.5",
            isCritical 
              ? "[&>div]:bg-red-500" 
              : isWarning 
                ? "[&>div]:bg-amber-500"
                : "[&>div]:bg-blue-500"
          )}
        />

        {/* Description */}
        <p className={cn(
          "text-sm",
          isCritical 
            ? "text-red-700 dark:text-red-300 font-medium" 
            : "text-muted-foreground"
        )}>
          {isCritical ? (
            <>
              <strong>Seu agente IA está bloqueado</strong> e não pode mais enviar mensagens automáticas. 
              Assine um plano para desbloquear mensagens ilimitadas!
            </>
          ) : isWarning ? (
            <>
              Você usou <strong>{usage.agentMessagesCount}</strong> de <strong>{usage.limit}</strong> mensagens gratuitas. 
              Restam apenas <strong>{usage.remaining}</strong>!
            </>
          ) : (
            <>
              Você tem <strong>{usage.limit} mensagens gratuitas</strong>. 
              Restam <strong>{usage.remaining}</strong> mensagens.
            </>
          )}
        </p>

        {/* CTA Button */}
        <a
          href="/plans"
          className={cn(
            "inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg font-bold text-white transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5",
            isCritical
              ? "bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 animate-pulse"
              : "bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700"
          )}
        >
          <Rocket className="w-4 h-4" />
          {isCritical 
            ? "🔓 Desbloquear Agora - Plano Ilimitado R$99/mês" 
            : "Garantir Plano Ilimitado - R$99/mês"
          }
        </a>
      </div>
    </div>
  );
}

// Banner fixo no topo da tela quando limite esgotado
export function LimitReachedTopBanner() {
  const { data: usage } = useQuery<UsageData>({
    queryKey: ["/api/usage"],
    refetchInterval: 10000,
  });

  // Only show if limit is reached and no active subscription
  if (!usage || usage.hasActiveSubscription || !usage.isLimitReached) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-red-600 to-orange-600 text-white py-3 px-4 shadow-lg">
      <div className="container max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 animate-pulse" />
          <span className="font-medium">
            <strong>Limite de {usage.limit} mensagens atingido!</strong> Seu agente IA está bloqueado.
          </span>
        </div>
        <a
          href="/plans"
          className="inline-flex items-center gap-2 bg-white text-red-600 px-4 py-2 rounded-lg font-bold hover:bg-gray-100 transition-colors shadow-md"
        >
          <Rocket className="w-4 h-4" />
          Desbloquear Agora
        </a>
      </div>
    </div>
  );
}
