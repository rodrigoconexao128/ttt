import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, Users, CheckCircle, Clock, Bot, AlertCircle, Sparkles, ArrowUpRight, MessageSquare } from "lucide-react";
import type { WhatsappConnection, AiAgentConfig } from "@shared/schema";
import { UsageLimitBanner } from "@/components/usage-limit-banner";
import { OnboardingGuide } from "./onboarding-guide";

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

  const { data: mediaList } = useQuery<any[]>({
    queryKey: ["/api/agent/media"],
  });

  const { data: followupConfig } = useQuery<any>({
    queryKey: ["/api/followup/config"],
  });

  const isConnected = !!connection?.isConnected;
  const isAgentConfigured = !!agentConfig?.isActive;
  const hasMedia = (mediaList?.length || 0) > 0;
  const isFollowupActive = !!followupConfig?.enabled;

  return (
    <div className="h-full overflow-auto bg-[#F6F6F7] dark:bg-black">
      <div className="container max-w-5xl mx-auto p-4 md:p-8 space-y-8 pb-24 md:pb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Olá! 👋</h1>
            <p className="text-sm md:text-base text-gray-500 dark:text-gray-400">
              Aqui está o que está acontecendo com seu negócio hoje.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full animate-pulse", isConnected ? "bg-green-500" : "bg-red-500")} />
              <span className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                {isConnected ? "WhatsApp Conectado" : "WhatsApp Desconectado"}
              </span>
            </div>
          </div>
        </div>

        {/* Usage Limit Banner */}
        <UsageLimitBanner />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Coluna da Esquerda: Guia e Stats */}
          <div className="lg:col-span-2 space-y-8">
            <OnboardingGuide 
              isConnected={isConnected}
              isAgentConfigured={isAgentConfigured}
              hasMedia={hasMedia}
              isFollowupActive={isFollowupActive}
            />

            <div className="space-y-4">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Desempenho do Agente
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="p-6 border-none shadow-sm bg-white dark:bg-gray-900 rounded-2xl group hover:shadow-md transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Respostas Automáticas</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.agentMessages || 0}</p>
                      <span className="text-xs font-medium text-green-600 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded-md">+12%</span>
                    </div>
                  </div>
                </Card>

                <Card className="p-6 border-none shadow-sm bg-white dark:bg-gray-900 rounded-2xl group hover:shadow-md transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
                      <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total de Leads</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.totalConversations || 0}</p>
                      <span className="text-xs font-medium text-green-600 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded-md">+5%</span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>

          {/* Coluna da Direita: Resumo Rápido */}
          <div className="space-y-6">
            <Card className="p-6 border-none shadow-sm bg-white dark:bg-gray-900 rounded-2xl">
              <h3 className="font-bold text-gray-900 dark:text-white mb-6">Atividade Recente</h3>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-300">Mensagens não lidas</span>
                  </div>
                  <span className="text-sm font-bold">{stats?.unreadMessages || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-300">Mensagens hoje</span>
                  </div>
                  <span className="text-sm font-bold">{stats?.todayMessages || 0}</span>
                </div>
                <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Status do Sistema</span>
                    <span className="text-xs font-bold text-green-600">OPERACIONAL</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full w-full bg-green-500" />
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 border-none shadow-sm bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl border border-primary/10">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-gray-900 dark:text-white">Dica do Especialista</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    Agentes que usam <strong>áudios humanizados</strong> convertem até 3x mais que apenas texto.
                  </p>
                </div>
                <Button variant="link" className="p-0 h-auto text-primary font-bold text-sm" onClick={() => window.location.href = "/biblioteca-midias"}>
                  Adicionar áudios agora →
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

