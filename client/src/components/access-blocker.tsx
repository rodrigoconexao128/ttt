import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  AlertTriangle, 
  Lock, 
  CreditCard, 
  Rocket, 
  Clock, 
  MessageSquare,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

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

// Full screen blocker when access is denied
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
  ];

  // Check if current route is allowed
  const isAllowedRoute = allowedRoutes.some(route => 
    location.startsWith(route) || location === '/'
  );

  // If loading or on allowed route, show children
  if (isLoading || isAllowedRoute) {
    return <>{children}</>;
  }

  // If access should be blocked, show blocker
  if (accessStatus?.shouldBlock) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
        <Card className="max-w-lg w-full shadow-2xl border-2 border-red-500/20">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle className="text-2xl text-red-600 dark:text-red-400">
              {accessStatus.blockReason === 'subscription_expired' 
                ? 'Assinatura Expirada' 
                : 'Limite de Teste Atingido'}
            </CardTitle>
            <CardDescription className="text-base">
              {accessStatus.message}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Status Info */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              {accessStatus.blockReason === 'subscription_expired' ? (
                <>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>Plano: <strong>{accessStatus.planName || 'N/A'}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Expirou em: <strong>
                      {accessStatus.subscriptionEndDate 
                        ? new Date(accessStatus.subscriptionEndDate).toLocaleDateString('pt-BR')
                        : 'N/A'}
                    </strong></span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Mensagens usadas
                    </span>
                    <span className="font-bold text-red-600">
                      {accessStatus.trialMessagesUsed}/{accessStatus.trialMessagesLimit}
                    </span>
                  </div>
                  <Progress value={100} className="h-2 [&>div]:bg-red-500" />
                  <p className="text-xs text-muted-foreground text-center">
                    Você utilizou todas as {accessStatus.trialMessagesLimit} mensagens de teste
                  </p>
                </>
              )}
            </div>

            {/* Benefits of upgrading */}
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-500" />
                Desbloqueie todos os recursos:
              </h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Mensagens ilimitadas do Agente IA
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Envio em massa para campanhas
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Follow-up inteligente automático
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Qualificação de leads por IA
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Suporte prioritário
                </li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button 
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold py-6 text-lg shadow-lg"
                onClick={() => setLocation('/plans')}
              >
                <CreditCard className="w-5 h-5 mr-2" />
                {accessStatus.blockReason === 'subscription_expired' 
                  ? 'Renovar Assinatura' 
                  : 'Assinar Agora - R$99/mês'}
              </Button>
              
              {accessStatus.hasSubscription && accessStatus.blockReason === 'subscription_expired' && (
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
            <p className="text-xs text-center text-muted-foreground">
              Precisa de ajuda? Entre em contato pelo WhatsApp:{' '}
              <a 
                href="https://wa.me/5517981679379" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                (17) 98167-9379
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Access granted, show children
  return <>{children}</>;
}

// Warning banner for expiring subscription (5 days or less)
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
    <div className="fixed top-0 left-0 right-0 z-[90] bg-gradient-to-r from-amber-500 to-orange-500 text-white py-2 px-4 shadow-lg">
      <div className="container max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5" />
          <span className="font-medium">
            Sua assinatura vence em <strong>{accessStatus.daysRemaining} dias</strong>. Renove agora para não perder acesso!
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setLocation('/minha-assinatura')}
          className="bg-white text-orange-600 hover:bg-gray-100"
        >
          <CreditCard className="w-4 h-4 mr-2" />
          Renovar Agora
        </Button>
      </div>
    </div>
  );
}

// Trial progress banner (non-blocking, just informative)
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
      border rounded-lg p-3 mb-4
      ${isWarning 
        ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800' 
        : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800'
      }
    `}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <MessageSquare className={`w-4 h-4 ${isWarning ? 'text-amber-600' : 'text-blue-600'}`} />
          <span className="text-sm">
            Mensagens de teste: <strong>{accessStatus.trialMessagesUsed}/{accessStatus.trialMessagesLimit}</strong>
            {isWarning && <span className="text-amber-600 ml-2">(Restam {accessStatus.trialMessagesRemaining}!)</span>}
          </span>
        </div>
        <Button
          size="sm"
          variant={isWarning ? "default" : "outline"}
          onClick={() => setLocation('/plans')}
          className={isWarning ? 'bg-amber-600 hover:bg-amber-700' : ''}
        >
          <Rocket className="w-3 h-3 mr-1" />
          Assinar Plano
        </Button>
      </div>
      <Progress 
        value={percentUsed} 
        className={`h-1.5 mt-2 ${isWarning ? '[&>div]:bg-amber-500' : '[&>div]:bg-blue-500'}`} 
      />
    </div>
  );
}
