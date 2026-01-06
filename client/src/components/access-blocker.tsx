import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  Lock, 
  CreditCard, 
  Rocket, 
  Clock, 
  MessageSquare,
  Sparkles,
  CheckCircle,
  ArrowRight,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogOverlay } from "@/components/ui/dialog";

interface AccessStatus {
  accessStatus: 'active' | 'trial' | 'blocked' | 'expired';
  shouldBlock: boolean;
  blockReason: string | null;
  hasSubscription: boolean;
  subscriptionStatus: string | null;
  isSubscriptionExpired: boolean;
  daysRemaining: number;
  subscriptionEndDate: string | null;
  planName: string | null;
  trialMessagesUsed: number;
  trialMessagesRemaining: number;
  trialMessagesLimit: number;
  trialLimitReached: boolean;
  message: string | null;
}

// Full screen blocker when access is denied - Now as elegant modal overlay
export function AccessBlocker({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  
  const { data: accessStatus, isLoading } = useQuery<AccessStatus>({
    queryKey: ["/api/access-status"],
    refetchInterval: 30000, // Check every 30 seconds
  });

  // Routes that should always be accessible
  const allowedRoutes = [
    '/login',
    '/cadastro',
    '/plans',
    '/subscribe',
    '/minha-assinatura',
    '/settings',
    '/admin',
    '/admin-login',
    '/test',
    '/testar',
    '/kanban', // CRM Kanban - sempre acessível
  ];

  // Check if current route is allowed
  const isAllowedRoute = allowedRoutes.some(route => 
    location.startsWith(route) || location === '/'
  );

  // If loading or on allowed route, show children
  if (isLoading || isAllowedRoute) {
    return <>{children}</>;
  }

  // If access should be blocked, show overlay modal while keeping background visible
  if (accessStatus?.shouldBlock) {
    const isExpired = accessStatus.blockReason === 'subscription_expired';
    const percentUsed = 100;

    return (
      <>
        {/* Keep children visible (blurred) in background */}
        <div className="blur-sm pointer-events-none">
          {children}
        </div>
        
        {/* Professional Modal Overlay */}
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
            {/* Header Section */}
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 p-6 text-center border-b border-slate-200 dark:border-slate-700">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 flex items-center justify-center mb-4 shadow-sm">
                <Lock className="w-7 h-7 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                {isExpired ? 'Assinatura Expirada' : 'Limite de Teste Atingido'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {isExpired 
                  ? 'Renove para continuar usando todos os recursos'
                  : 'Assine um plano para continuar vendendo'
                }
              </p>
            </div>
            
            <div className="p-6 space-y-5">
              {/* Status Info - Clean Card */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3">
                {isExpired ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <CreditCard className="w-4 h-4" />
                        Plano
                      </span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {accessStatus.planName || 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Expirou em
                      </span>
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        {accessStatus.subscriptionEndDate 
                          ? new Date(accessStatus.subscriptionEndDate).toLocaleDateString('pt-BR')
                          : 'N/A'}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        Mensagens usadas
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {accessStatus.trialMessagesUsed}/{accessStatus.trialMessagesLimit}
                      </span>
                    </div>
                    <Progress value={percentUsed} className="h-2 [&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-green-500" />
                    <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
                      Você utilizou todas as mensagens de teste
                    </p>
                  </>
                )}
              </div>

              {/* Benefits - Professional list */}
              <div className="space-y-2.5">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Desbloqueie todos os recursos
                </h4>
                <ul className="space-y-2">
                  {[
                    'Mensagens ilimitadas do Agente IA',
                    'Envio em massa para campanhas',
                    'Follow-up inteligente automático',
                    'Qualificação de leads por IA',
                    'Suporte prioritário'
                  ].map((benefit, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-2">
                <Button 
                  className="w-full bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white font-semibold py-5 text-base shadow-lg hover:shadow-xl transition-all duration-200"
                  onClick={() => setLocation('/plans')}
                >
                  <CreditCard className="w-5 h-5 mr-2" />
                  {isExpired ? 'Renovar Assinatura' : 'Assinar Agora - R$99/mês'}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                
                {accessStatus.hasSubscription && isExpired && (
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setLocation('/minha-assinatura')}
                  >
                    <Rocket className="w-4 h-4 mr-2" />
                    Ver Minha Assinatura
                  </Button>
                )}
              </div>

              {/* Contact support */}
              <p className="text-xs text-center text-slate-400 dark:text-slate-500 pt-2">
                Precisa de ajuda?{' '}
                <a 
                  href="https://wa.me/5517981679379" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                >
                  Fale conosco pelo WhatsApp
                </a>
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Access granted, show children
  return <>{children}</>;
}

// Warning banner for expiring subscription (5 days or less) - Refined Design
export function SubscriptionExpiringBanner() {
  const [, setLocation] = useLocation();
  
  const { data: accessStatus } = useQuery<AccessStatus>({
    queryKey: ["/api/access-status"],
    refetchInterval: 60000, // Check every minute
  });

  // Only show if subscription is active but expiring soon (5 days or less)
  if (!accessStatus || 
      accessStatus.accessStatus !== 'active' || 
      accessStatus.daysRemaining > 5 ||
      accessStatus.daysRemaining <= 0) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[90] bg-gradient-to-r from-amber-500 to-orange-500 text-white py-2.5 px-4 shadow-md">
      <div className="container max-w-6xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/20 px-2.5 py-1 rounded-full text-xs font-medium">
            <Clock className="w-3.5 h-3.5" />
            {accessStatus.daysRemaining} dias
          </div>
          <span className="text-sm">
            Sua assinatura vence em breve · <span className="font-medium">Renove para não perder acesso</span>
          </span>
        </div>
        <Button
          size="sm"
          onClick={() => setLocation('/minha-assinatura')}
          className="bg-white text-amber-600 hover:bg-amber-50 font-medium shadow-sm"
        >
          <CreditCard className="w-3.5 h-3.5 mr-1.5" />
          Renovar
        </Button>
      </div>
    </div>
  );
}

// Trial progress banner (non-blocking, just informative) - Professional Style
export function TrialProgressBanner() {
  const [, setLocation] = useLocation();
  
  const { data: accessStatus } = useQuery<AccessStatus>({
    queryKey: ["/api/access-status"],
    refetchInterval: 30000,
  });

  // Only show for trial users who haven't hit the limit yet
  if (!accessStatus || 
      accessStatus.accessStatus !== 'trial' ||
      accessStatus.trialLimitReached) {
    return null;
  }

  const percentUsed = (accessStatus.trialMessagesUsed / accessStatus.trialMessagesLimit) * 100;
  const isWarning = percentUsed >= 60;

  return (
    <div className={`
      border rounded-xl p-4 mb-4 transition-all duration-200
      ${isWarning 
        ? 'bg-amber-50/50 dark:bg-amber-950/10 border-amber-200/60 dark:border-amber-800/30' 
        : 'bg-blue-50/50 dark:bg-blue-950/10 border-blue-200/60 dark:border-blue-800/30'
      }
    `}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isWarning ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
            <MessageSquare className={`w-4 h-4 ${isWarning ? 'text-amber-600' : 'text-blue-600'}`} />
          </div>
          <div>
            <span className="text-sm font-medium text-slate-900 dark:text-white">
              {accessStatus.trialMessagesUsed}/{accessStatus.trialMessagesLimit} mensagens
            </span>
            {isWarning && (
              <span className="text-amber-600 dark:text-amber-400 text-xs ml-2">
                · {accessStatus.trialMessagesRemaining} restantes
              </span>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant={isWarning ? "default" : "outline"}
          onClick={() => setLocation('/plans')}
          className={isWarning ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}
        >
          <Rocket className="w-3.5 h-3.5 mr-1.5" />
          Ver Planos
        </Button>
      </div>
      <Progress 
        value={percentUsed} 
        className={`h-1.5 mt-3 ${isWarning ? '[&>div]:bg-amber-500' : '[&>div]:bg-blue-500'}`} 
      />
    </div>
  );
}
