import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Bot, Sparkles, TestTube, Save, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Plus, X, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AiAgentConfig } from "@shared/schema";

export default function MyAgent() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [triggerPhrases, setTriggerPhrases] = useState<string[]>([]);
  const [newTriggerPhrase, setNewTriggerPhrase] = useState("");
  const [messageSplitChars, setMessageSplitChars] = useState(400);

  const { data: config, isLoading } = useQuery<AiAgentConfig | null>({
    queryKey: ["/api/agent/config"],
  });

  useEffect(() => {
    if (config) {
      setPrompt(config.prompt || "");
      setIsActive(config.isActive || false);
      setTriggerPhrases(config.triggerPhrases || []);
      setMessageSplitChars(config.messageSplitChars ?? 400);
    }
  }, [config]);

  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/agent/config", {
        prompt,
        isActive,
        triggerPhrases,
        messageSplitChars,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/config"] });
      toast({
        title: "Configuração Salva",
        description: "Agente IA configurado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testAgentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/agent/test", {
        message: testMessage,
      });
      const data = await response.json();
      return data;
    },
    onSuccess: (data: any) => {
      setTestResponse(data?.response || "Sem resposta");
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao testar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-4xl mx-auto p-8 space-y-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
              <Bot className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Meu Agente IA</h1>
              <p className="text-muted-foreground">
                Configure o agente inteligente para responder seus clientes automaticamente
              </p>
            </div>
          </div>
        </div>

        {!config && (
          <Card className="p-6 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" />
              <div className="space-y-2 flex-1">
                <h3 className="font-semibold text-orange-900 dark:text-orange-100">
                  Configure seu Agente IA
                </h3>
                <p className="text-sm text-orange-800 dark:text-orange-200">
                  Você ainda não configurou seu agente IA. Configure agora para começar a usar respostas automáticas!
                </p>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="agent-active" className="text-base font-semibold">
                  Status do Agente
                </Label>
                <p className="text-sm text-muted-foreground">
                  Ative ou desative o agente para todas as conversas
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  variant={isActive ? "default" : "secondary"}
                  className="gap-1"
                  data-testid="badge-agent-status"
                >
                  {isActive ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" />
                      Ativo
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3" />
                      Inativo
                    </>
                  )}
                </Badge>
                <Switch
                  id="agent-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  data-testid="switch-agent-active"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-prompt" className="text-base font-semibold">
                Instruções do Agente
              </Label>
              <p className="text-sm text-muted-foreground">
                Defina como o agente deve se comportar e responder. Seja específico sobre o tom, estilo e informações que deve fornecer.
              </p>
              <Textarea
                id="agent-prompt"
                placeholder="Exemplo: Você é um assistente de atendimento ao cliente profissional e simpático. Responda perguntas sobre produtos, preços e horários de funcionamento. Seja breve e direto, mas sempre educado. Se não souber alguma coisa, peça para o cliente aguardar que um atendente humano irá responder em breve."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={8}
                className="resize-none"
                data-testid="textarea-agent-prompt"
              />
            </div>

            <Button
              onClick={() => saveConfigMutation.mutate()}
              disabled={saveConfigMutation.isPending || !prompt.trim()}
              className="w-full"
              size="lg"
              data-testid="button-save-config"
            >
              {saveConfigMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Configuração
                </>
              )}
            </Button>
          </div>
        </Card>

        <Card className="p-6 space-y-6">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between p-4 bg-muted/50 rounded-md hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-primary" />
              <div className="text-left">
                <h3 className="text-base font-semibold">Configuração Adicional</h3>
                <p className="text-sm text-muted-foreground">
                  Frases gatilho e regras avançadas
                </p>
              </div>
            </div>
            {showAdvanced ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </button>

          {showAdvanced && (
            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <Label className="text-base font-semibold">Frases Gatilho</Label>
                <p className="text-sm text-muted-foreground">
                  O agente SOMENTE responderá se a conversa contiver alguma destas frases. Deixe vazio para responder todas as conversas.
                </p>
              </div>

              <div className="space-y-3">
                {triggerPhrases.map((phrase, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={phrase}
                      onChange={(e) => {
                        const updated = [...triggerPhrases];
                        updated[index] = e.target.value;
                        setTriggerPhrases(updated);
                      }}
                      placeholder="Ex: vim da campanha X"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setTriggerPhrases(triggerPhrases.filter((_, i) => i !== index));
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}

                <div className="flex gap-2">
                  <Input
                    value={newTriggerPhrase}
                    onChange={(e) => setNewTriggerPhrase(e.target.value)}
                    placeholder="Adicionar nova frase gatilho..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newTriggerPhrase.trim()) {
                        setTriggerPhrases([...triggerPhrases, newTriggerPhrase.trim()]);
                        setNewTriggerPhrase("");
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => {
                      if (newTriggerPhrase.trim()) {
                        setTriggerPhrases([...triggerPhrases, newTriggerPhrase.trim()]);
                        setNewTriggerPhrase("");
                      }
                    }}
                    disabled={!newTriggerPhrase.trim()}
                    variant="outline"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar
                  </Button>
                </div>
              </div>

              {triggerPhrases.length > 0 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-900">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Atenção:</strong> O agente só responderá conversas que contenham pelo menos uma destas {triggerPhrases.length} frase{triggerPhrases.length > 1 ? "s" : ""}.
                  </p>
                </div>
              )}

              <div className="space-y-3 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="message-split" className="text-base font-semibold">
                    Tamanho das Bolhas de Mensagem
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Defina quantos caracteres cada mensagem pode ter antes de ser dividida. Use 0 para enviar sem divisão.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <Input
                    id="message-split"
                    type="number"
                    min={0}
                    max={1000}
                    step={50}
                    value={messageSplitChars}
                    onChange={(e) => setMessageSplitChars(Number(e.target.value))}
                    className="w-32"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant={messageSplitChars === 200 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMessageSplitChars(200)}
                    >
                      Pequeno (200)
                    </Button>
                    <Button
                      variant={messageSplitChars === 400 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMessageSplitChars(400)}
                    >
                      Médio (400)
                    </Button>
                    <Button
                      variant={messageSplitChars === 600 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMessageSplitChars(600)}
                    >
                      Grande (600)
                    </Button>
                    <Button
                      variant={messageSplitChars === 0 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMessageSplitChars(0)}
                    >
                      Sem divisão
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {config && (
          <Card className="p-6 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TestTube className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">Testar Agente</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Envie uma mensagem de teste para ver como o agente responde
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="test-message">Mensagem de Teste</Label>
                <Textarea
                  id="test-message"
                  placeholder="Digite uma mensagem de teste..."
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  rows={3}
                  data-testid="textarea-test-message"
                />
              </div>

              <Button
                onClick={() => testAgentMutation.mutate()}
                disabled={testAgentMutation.isPending || !testMessage.trim()}
                variant="outline"
                className="w-full"
                data-testid="button-test-agent"
              >
                {testAgentMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
                    Gerando resposta...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Testar Agente
                  </>
                )}
              </Button>

              {testResponse && (
                <div className="p-4 bg-muted rounded-md space-y-2">
                  <Label className="text-sm font-semibold">Resposta do Agente:</Label>
                  <p className="text-sm whitespace-pre-wrap" data-testid="text-test-response">
                    {testResponse}
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
