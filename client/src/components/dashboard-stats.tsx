import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, Users, CheckCircle, Clock, Bot, AlertCircle, Sparkles } from "lucide-react";
import type { WhatsappConnection, AiAgentConfig } from "@shared/schema";
import { UsageLimitBanner } from "@/components/usage-limit-banner";

interface DashboardStatsProps {
  connection?: WhatsappConnection;
}

interface Stats {
  totalConversations: number;
  unreadMessages: number;
  todayMessages: number;
  agentMessages: number;
}

export function DashboardStats({ connection }: DashboardStatsProps) {
  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/stats"],
    enabled: !!connection?.isConnected,
  });

  const { data: agentConfig } = useQuery<AiAgentConfig | null>({
    queryKey: ["/api/agent/config"],
  });

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-6xl mx-auto p-8 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Visão geral das suas conversas no WhatsApp
          </p>
        </div>

        {/* Usage Limit Banner - shows for free trial users */}
        <UsageLimitBanner />

        {!agentConfig && (
          <Card className="p-6 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" />
              <div className="space-y-3 flex-1">
                <div className="space-y-1">
                  <h3 className="font-semibold text-orange-900 dark:text-orange-100">
                    Configure seu Agente IA
                  </h3>
                  <p className="text-sm text-orange-800 dark:text-orange-200">
                    Você ainda não configurou seu agente IA. Configure agora para começar a automatizar suas respostas no WhatsApp!
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/30"
                  onClick={() => {
                    const agentButton = document.querySelector('[data-testid="button-nav-agent"]') as HTMLButtonElement;
                    agentButton?.click();
                  }}
                  data-testid="button-configure-agent"
                >
                  <Bot className="w-4 h-4 mr-2" />
                  Configurar Agente
                </Button>
              </div>
            </div>
          </Card>
        )}

        {!connection?.isConnected ? (
          <Card className="p-12 text-center">
            <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">WhatsApp não conectado</h3>
            <p className="text-sm text-muted-foreground">
              Conecte seu WhatsApp para visualizar as estatísticas
            </p>
          </Card>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Total de Conversas</p>
                    <p className="text-3xl font-bold" data-testid="stat-total-conversations">
                      {stats?.totalConversations || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Não Lidas</p>
                    <p className="text-3xl font-bold" data-testid="stat-unread">
                      {stats?.unreadMessages || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-primary" />
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Mensagens Hoje</p>
                    <p className="text-3xl font-bold" data-testid="stat-today">
                      {stats?.todayMessages || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
                    <MessageCircle className="w-6 h-6 text-primary" />
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Status WhatsApp</p>
                    <p className="text-xl font-semibold text-primary">Conectado</p>
                  </div>
                  <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-primary" />
                  </div>
                </div>
              </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Status do Agente IA</p>
                    <p className={`text-xl font-semibold ${agentConfig?.isActive ? 'text-primary' : 'text-muted-foreground'}`} data-testid="stat-agent-status">
                      {agentConfig?.isActive ? 'Ativo' : 'Inativo'}
                    </p>
                    {agentConfig?.isActive && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Respondendo automaticamente
                      </p>
                    )}
                  </div>
                  <div className={`w-12 h-12 rounded-md flex items-center justify-center ${agentConfig?.isActive ? 'bg-primary/10' : 'bg-muted'}`}>
                    <Bot className={`w-6 h-6 ${agentConfig?.isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Respostas do Agente</p>
                    <p className="text-3xl font-bold" data-testid="stat-agent-messages">
                      {stats?.agentMessages || 0}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Mensagens automáticas enviadas
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-primary" />
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
