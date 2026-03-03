/**
 * FlowTab.tsx
 * Parte 5 - Aba "Fluxo" no Meu Agente IA
 *
 * Permite ao cliente escrever um roteiro/prompt de fluxo em texto livre.
 * A IA segue estritamente esse fluxo quando ativo (chatbot pré-definido).
 *
 * CORREÇÃO PARTE 5:
 * - Removido simulador embutido (era duplicação indevida).
 * - O simulador ÚNICO está no painel direito (Simulador WhatsApp).
 * - Quando Fluxo ON, o simulador direito já usa o FlowScriptEngine automaticamente.
 * - Este chat é EXCLUSIVAMENTE para criar/editar o roteiro.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2, GitBranch, Save,
  Lightbulb, AlertTriangle, CheckCircle2, Info,
  Zap, PlayCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

// ============================================================
// INTERFACES
// ============================================================
interface FlowConfig {
  flowScript: string | null;
  flowModeActive: boolean;
}

// ============================================================
// EXEMPLOS DE ROTEIRO
// ============================================================
const FLOW_EXAMPLES = [
  {
    label: "Atendimento Simples",
    script: `Bem-vindo ao nosso atendimento! 😊

Quando o cliente mandar qualquer mensagem de saudação (oi, olá, bom dia, etc):
Responda: "Olá! Seja bem-vindo(a)! 😊 Como posso ajudar você hoje?"

Quando o cliente perguntar sobre preços ou valores:
Responda: "Para saber os preços, por favor acesse nosso site ou ligue para (11) 99999-9999. Ficarei feliz em ajudar!"

Quando o cliente quiser falar com um atendente humano:
Responda: "Claro! Vou transferir você para um de nossos atendentes. Por favor, aguarde um momento. 🙏"

Para qualquer outra pergunta não coberta acima:
Responda: "Para mais informações, entre em contato direto conosco pelo telefone (11) 99999-9999 ou pelo e-mail contato@empresa.com.br 📧"`
  },
  {
    label: "Qualificação de Lead",
    script: `Você é um assistente de qualificação de clientes. Siga EXATAMENTE este roteiro:

PASSO 1 - Saudação:
Quando o cliente enviar a primeira mensagem, responda:
"Olá! Bem-vindo(a)! 👋 Antes de conectar você com nosso time, preciso de algumas informações rápidas. Qual é o seu nome?"

PASSO 2 - Interesse:
Após receber o nome, responda:
"Prazer, [nome]! O que você está procurando? 
1️⃣ Produto A
2️⃣ Produto B  
3️⃣ Outros"

Se o cliente escolher 1 (Produto A):
"Ótimo! Temos várias opções de Produto A. Qual é o seu orçamento aproximado?"

Se o cliente escolher 2 (Produto B):
"Perfeito! Produto B é nossa linha premium. Gostaria de agendar uma demonstração gratuita?"

Se o cliente escolher 3 ou outro:
"Entendo! Pode me contar mais sobre o que você está procurando?"

PASSO FINAL - Encaminhamento:
Após coletar as informações, responda:
"Perfeito! Já anotei todas as informações. Nossa equipe entrará em contato em até 2 horas úteis. Obrigado! 🎉"`
  },
  {
    label: "FAQ Simples",
    script: `Você responde perguntas frequentes. Use SOMENTE as respostas abaixo:

Se o cliente perguntar sobre horário de funcionamento:
"Funcionamos de Segunda a Sexta, das 8h às 18h, e aos Sábados das 8h às 12h. 🕐"

Se o cliente perguntar sobre endereço ou localização:
"Estamos localizados na Rua Exemplo, 123 - Centro. Fácil acesso de carro e transporte público! 📍"

Se o cliente perguntar sobre formas de pagamento:
"Aceitamos Pix, cartão de débito e crédito (até 12x sem juros) e dinheiro. 💳"

Se o cliente perguntar sobre entrega:
"Fazemos entrega em toda a cidade! O prazo é de 1 a 3 dias úteis. Frete grátis acima de R$150. 🚚"

Para outros assuntos:
"Para mais informações, fale diretamente com nossa equipe pelo número (11) 99999-9999. Atendemos com prazer! 😊"`
  }
];

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
interface FlowTabProps {
  className?: string;
}

export function FlowTab({ className }: FlowTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Estado
  const [flowScript, setFlowScript] = useState("");
  const [flowModeActive, setFlowModeActive] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showExamples, setShowExamples] = useState(false);

  // ============ QUERY: buscar fluxo salvo ============
  const { data: flowConfig, isLoading } = useQuery<FlowConfig>({
    queryKey: ["/api/agent/flow"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agent/flow");
      return res.json();
    },
  });

  // Preencher estado quando dados carregam
  useEffect(() => {
    if (flowConfig) {
      setFlowScript(flowConfig.flowScript || "");
      setFlowModeActive(flowConfig.flowModeActive || false);
    }
  }, [flowConfig]);

  // ============ MUTATION: salvar fluxo ============
  const saveFlowMutation = useMutation({
    mutationFn: async (data: { flowScript: string; flowModeActive: boolean }) => {
      const res = await apiRequest("POST", "/api/agent/flow", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/flow"] });
      setHasChanges(false);
      toast({ title: "✅ Fluxo salvo!", description: "Roteiro atualizado com sucesso." });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    },
  });

  // ============ MUTATION: alternar ativo/inativo ============
  const toggleFlowMutation = useMutation({
    mutationFn: async (active: boolean) => {
      const res = await apiRequest("POST", "/api/agent/flow", {
        flowScript,
        flowModeActive: active,
      });
      return res.json();
    },
    onSuccess: (_, active) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/flow"] });
      setFlowModeActive(active);
      toast({
        title: active ? "🔀 Modo Fluxo ATIVADO" : "🤖 Modo Fluxo DESATIVADO",
        description: active
          ? "A IA agora segue estritamente o roteiro. Use o Simulador (painel direito) para testar."
          : "A IA voltou ao comportamento normal.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao alternar", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    saveFlowMutation.mutate({ flowScript, flowModeActive });
  };

  const handleToggle = (active: boolean) => {
    if (active && (!flowScript || flowScript.trim().length < 10)) {
      toast({
        title: "Roteiro vazio",
        description: "Escreva um roteiro antes de ativar o modo Fluxo.",
        variant: "destructive",
      });
      return;
    }
    toggleFlowMutation.mutate(active);
  };

  const applyExample = (script: string) => {
    setFlowScript(script);
    setHasChanges(true);
    setShowExamples(false);
  };

  // ============ LOADING ============
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // ============ RENDER ============
  return (
    <div className={cn("flex flex-col gap-4 p-4", className)}>
      {/* ── Header com toggle ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Modo Fluxo</h2>
            <p className="text-xs text-muted-foreground">Chatbot com roteiro pré-definido</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {hasChanges && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSave}
              disabled={saveFlowMutation.isPending}
            >
              {saveFlowMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Save className="w-3 h-3 mr-1" />
              )}
              Salvar
            </Button>
          )}

          <div
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
              flowModeActive
                ? "bg-purple-500/15 text-purple-700 dark:text-purple-300"
                : "bg-muted text-muted-foreground"
            )}
          >
            <Switch
              checked={flowModeActive}
              onCheckedChange={handleToggle}
              disabled={toggleFlowMutation.isPending}
              className={cn(flowModeActive && "data-[state=checked]:bg-purple-600")}
            />
            <span className="text-xs">
              {flowModeActive ? "Fluxo ON" : "Fluxo OFF"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Alerta quando ativo ── */}
      {flowModeActive && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <CheckCircle2 className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-purple-700 dark:text-purple-300">
            <strong>Modo Fluxo ativo.</strong> A IA está seguindo estritamente o roteiro abaixo.
            Nenhuma resposta fora do roteiro será gerada. Use o <strong>Simulador WhatsApp</strong> (painel direito) para testar.
          </p>
        </div>
      )}

      {/* ── Aviso quando inativo mas tem script ── */}
      {!flowModeActive && flowScript && flowScript.trim().length > 10 && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Você tem um roteiro salvo mas o Modo Fluxo está <strong>desativado</strong>.
            Ative o toggle acima para usar o fluxo nas conversas.
          </p>
        </div>
      )}

      {/* ── Dica do simulador ── */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-500/8 border border-blue-500/15">
        <PlayCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          <strong>Simulador:</strong> Use o <strong>Simulador WhatsApp</strong> no painel direito para testar o comportamento do fluxo.
          Com Fluxo ON, o simulador usa automaticamente o roteiro definido aqui.
        </p>
      </div>

      {/* ── Editor de roteiro (full-width) ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5 text-purple-500" />
            Roteiro do Fluxo
          </label>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setShowExamples(!showExamples)}
          >
            <Lightbulb className="w-3 h-3" />
            Exemplos
          </Button>
        </div>

        {/* Exemplos expansíveis */}
        {showExamples && (
          <Card className="border-dashed border-purple-200 dark:border-purple-800">
            <CardContent className="p-3 space-y-2">
              <p className="text-xs text-muted-foreground font-medium">
                Clique para usar como base:
              </p>
              {FLOW_EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => applyExample(ex.script)}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs border border-border hover:bg-muted transition-colors"
                >
                  <div className="font-medium">{ex.label}</div>
                  <div className="text-muted-foreground mt-0.5 line-clamp-1">
                    {ex.script.split("\n")[0]}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        <Textarea
          value={flowScript}
          onChange={(e) => {
            setFlowScript(e.target.value);
            setHasChanges(true);
          }}
          placeholder={`Escreva o roteiro do seu atendimento aqui em texto livre.

Exemplo:
Quando o cliente mandar "oi" ou saudação:
Responda: "Olá! Como posso ajudar?"

Se o cliente perguntar sobre preços:
Responda: "Os preços estão disponíveis no nosso site..."

Para encerrar:
Responda: "Obrigado pelo contato! Até logo! 😊"`}
          className="flex-1 min-h-[380px] font-mono text-sm resize-none bg-slate-950 text-green-400 border-slate-700 placeholder:text-slate-600 rounded-xl"
          spellCheck={false}
        />

        {/* Info box */}
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-blue-500/8 border border-blue-500/15">
          <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Escreva em texto livre. Use "se", "quando", "caso" para ramificações.
            A IA interpreta e segue seu roteiro fielmente — sem improviso.
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={saveFlowMutation.isPending || !hasChanges}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white"
        >
          {saveFlowMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Salvar Roteiro
        </Button>
      </div>

      {/* ── Card de instruções ── */}
      <Card className="border-purple-200/50 dark:border-purple-800/50">
        <CardHeader className="py-3 pb-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-500" />
            Como funciona o Modo Fluxo?
          </CardTitle>
        </CardHeader>
        <CardContent className="py-3 grid sm:grid-cols-3 gap-3">
          <div className="flex gap-2.5">
            <div className="w-6 h-6 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-purple-600">1</span>
            </div>
            <div>
              <p className="text-xs font-medium">Escreva o roteiro</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Escreva em texto livre como o atendimento deve funcionar, com ramificações.
              </p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <div className="w-6 h-6 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-purple-600">2</span>
            </div>
            <div>
              <p className="text-xs font-medium">Salve e ative</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Salve o roteiro e ative o toggle "Fluxo ON". O modo entra em vigor imediatamente.
              </p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <div className="w-6 h-6 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-purple-600">3</span>
            </div>
            <div>
              <p className="text-xs font-medium">Teste no simulador</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Com Fluxo ON, use o <strong>Simulador WhatsApp</strong> (painel direito) para confirmar que o roteiro é seguido.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
