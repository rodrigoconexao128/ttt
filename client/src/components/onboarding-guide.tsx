import { CheckCircle2, Circle, MessageSquare, Bot, Upload, Sparkles, ChevronRight, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: any;
  completed: boolean;
  href: string;
}

interface OnboardingGuideProps {
  isConnected: boolean;
  isAgentConfigured: boolean;
  hasMedia: boolean;
  isFollowupActive: boolean;
}

export function OnboardingGuide({ 
  isConnected, 
  isAgentConfigured, 
  hasMedia, 
  isFollowupActive 
}: OnboardingGuideProps) {
  const [, setLocation] = useLocation();

  const steps: OnboardingStep[] = [
    {
      id: "connect",
      title: "Conectar seu WhatsApp",
      description: "Escaneie o QR Code para começar a receber mensagens.",
      icon: Smartphone,
      completed: isConnected,
      href: "/conexao",
    },
    {
      id: "agent",
      title: "Configurar seu Agente IA",
      description: "Dê uma personalidade e conhecimento ao seu robô.",
      icon: Bot,
      completed: isAgentConfigured,
      href: "/meu-agente-ia",
    },
    {
      id: "media",
      title: "Adicionar Mídias (Áudios/Fotos)",
      description: "Humanize o atendimento com áudios e imagens reais.",
      icon: Upload,
      completed: hasMedia,
      href: "/biblioteca-midias",
    },
    {
      id: "followup",
      title: "Ativar Follow-up Automático",
      description: "Recupere clientes que pararam de responder.",
      icon: Sparkles,
      completed: isFollowupActive,
      href: "/followup",
    },
  ];

  const completedCount = steps.filter(s => s.completed).length;
  const progress = (completedCount / steps.length) * 100;

  return (
    <Card className="border-none shadow-sm bg-white dark:bg-gray-900 overflow-hidden rounded-3xl">
      <div className="p-6 md:p-8 space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Prepare-se para vender</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Use este guia para configurar sua máquina de vendas.</p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <span>{completedCount} de {steps.length} tarefas concluídas</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2 bg-gray-100 dark:bg-gray-800" />
        </div>

        <div className="grid gap-3">
          {steps.map((step) => (
            <button
              key={step.id}
              onClick={() => setLocation(step.href)}
              className={cn(
                "flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group",
                step.completed 
                  ? "bg-gray-50/50 border-gray-100 dark:bg-gray-800/30 dark:border-gray-800" 
                  : "bg-white border-gray-200 hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800 dark:hover:border-gray-700"
              )}
            >
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                step.completed 
                  ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" 
                  : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500 group-hover:bg-gray-200 dark:group-hover:bg-gray-700"
              )}>
                {step.completed ? <CheckCircle2 className="w-6 h-6" /> : <step.icon className="w-5 h-5" />}
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className={cn(
                  "text-sm font-bold truncate",
                  step.completed ? "text-gray-500 line-through" : "text-gray-900 dark:text-white"
                )}>
                  {step.title}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{step.description}</p>
              </div>

              <ChevronRight className={cn(
                "w-4 h-4 text-gray-300 transition-transform group-hover:translate-x-0.5",
                step.completed && "opacity-0"
              )} />
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-6 md:p-8 text-white">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-6 h-6 text-yellow-400" />
          </div>
          <div className="space-y-4 flex-1">
            <div className="space-y-1">
              <h3 className="font-bold text-lg">Construa o negócio dos seus sonhos</h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                Assine agora e ganhe 7 dias de garantia incondicional. Se não vender mais, devolvemos seu dinheiro.
              </p>
            </div>
            <button 
              onClick={() => setLocation("/plans")}
              className="bg-white text-gray-900 px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-100 transition-colors"
            >
              Selecionar um plano
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
