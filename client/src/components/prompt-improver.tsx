import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, Wand2, CheckCircle2, ArrowRight, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface PromptImproverProps {
  currentPrompt: string;
  onImproved: (newPrompt: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * PromptImprover - Componente para melhorar prompts existentes
 * 
 * Usa técnica de "prompt patching" para economizar tokens:
 * 1. Envia o prompt atual + instrução de melhoria
 * 2. A IA retorna apenas as ALTERAÇÕES em formato de patch
 * 3. Aplicamos o patch ao prompt original
 * 
 * Isso economiza tokens porque não precisa reescrever o prompt inteiro
 */
export function PromptImprover({ currentPrompt, onImproved, isOpen, onClose }: PromptImproverProps) {
  const { toast } = useToast();
  const [improvement, setImprovement] = useState("");
  const [isImproving, setIsImproving] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState("");
  const [step, setStep] = useState<"input" | "improving" | "preview">("input");

  const handleImprove = async () => {
    if (!improvement.trim()) {
      toast({
        title: "Descreva a melhoria",
        description: "Informe o que você quer melhorar no prompt",
        variant: "destructive"
      });
      return;
    }

    setIsImproving(true);
    setStep("improving");

    try {
      const response = await apiRequest("POST", "/api/agent/improve-prompt", {
        currentPrompt,
        improvement,
      });
      
      const data = await response.json();
      
      if (data.improvedPrompt) {
        setPreviewPrompt(data.improvedPrompt);
        setStep("preview");
      } else {
        throw new Error("Não foi possível melhorar o prompt");
      }
    } catch (error) {
      console.error("Error improving prompt:", error);
      // Fallback: fazer a melhoria localmente
      const improved = applyLocalImprovement(currentPrompt, improvement);
      setPreviewPrompt(improved);
      setStep("preview");
    } finally {
      setIsImproving(false);
    }
  };

  const applyLocalImprovement = (prompt: string, instruction: string): string => {
    // Técnica de patch local: analisar a instrução e aplicar mudanças específicas
    let improved = prompt;
    const lowerInstruction = instruction.toLowerCase();

    // Detectar tipo de melhoria e aplicar
    if (lowerInstruction.includes("mais formal") || lowerInstruction.includes("mais profissional")) {
      improved = improved.replace(/emojis com moderação/gi, "poucos emojis (apenas quando muito necessário)");
      improved = improved.replace(/simpático/gi, "cordial e profissional");
      improved = improved.replace(/amigável/gi, "formal e respeitoso");
    }

    if (lowerInstruction.includes("mais informal") || lowerInstruction.includes("mais descontraído")) {
      improved = improved.replace(/profissional/gi, "descontraído e amigável");
      improved = improved.replace(/formal/gi, "informal e próximo");
      improved = improved.replace(/emojis com moderação/gi, "emojis livremente para deixar a conversa mais leve");
    }

    if (lowerInstruction.includes("vendedor") || lowerInstruction.includes("mais vendas") || lowerInstruction.includes("converter")) {
      // Adicionar foco em vendas
      const salesSection = `

## 💰 FOCO EM VENDAS
- Sempre destaque os benefícios dos produtos/serviços
- Use gatilhos de urgência quando apropriado
- Faça perguntas que levem ao fechamento
- Ofereça condições especiais quando possível
- Identifique objeções e contorne com argumentos`;

      if (!improved.includes("FOCO EM VENDAS")) {
        improved = improved.replace(/## 💡 DICAS ESPECIAIS/, salesSection + "\n\n## 💡 DICAS ESPECIAIS");
      }
    }

    if (lowerInstruction.includes("suporte") || lowerInstruction.includes("atendimento") || lowerInstruction.includes("resolver problema")) {
      // Adicionar foco em suporte
      const supportSection = `

## 🛠️ FOCO EM SUPORTE
- Sempre pergunte detalhes do problema antes de responder
- Ofereça soluções passo a passo
- Confirme se o problema foi resolvido
- Registre reclamações para análise interna
- Escalone para atendente humano se necessário`;

      if (!improved.includes("FOCO EM SUPORTE")) {
        improved = improved.replace(/## 💡 DICAS ESPECIAIS/, supportSection + "\n\n## 💡 DICAS ESPECIAIS");
      }
    }

    if (lowerInstruction.includes("horário") || lowerInstruction.includes("horarios")) {
      // Tentar extrair horário da instrução
      const hoursMatch = instruction.match(/(\d{1,2}h?\s*(às|a|até|-)?\s*\d{1,2}h?)/gi);
      if (hoursMatch) {
        improved = improved.replace(
          /Horário:.*\n/gi,
          `Horário: ${hoursMatch.join(", ")}\n`
        );
      }
    }

    if (lowerInstruction.includes("preço") || lowerInstruction.includes("preco") || lowerInstruction.includes("valor")) {
      // Adicionar nota sobre preços
      const priceNote = "\n- Sempre confirme preços antes de fechar pedidos (preços podem ter atualizado)";
      if (!improved.includes("confirme preços")) {
        improved = improved.replace(/## ❌ O QUE NÃO FAZER/, priceNote + "\n\n## ❌ O QUE NÃO FAZER");
      }
    }

    // Se nenhuma melhoria específica foi detectada, adicionar a instrução como nota
    if (improved === prompt) {
      const customNote = `

## 📝 INSTRUÇÃO ADICIONAL
${instruction}`;
      improved = improved + customNote;
    }

    return improved;
  };

  const handleApply = () => {
    onImproved(previewPrompt);
    handleClose();
    toast({
      title: "Prompt melhorado!",
      description: "O prompt foi atualizado com as melhorias",
    });
  };

  const handleClose = () => {
    setStep("input");
    setImprovement("");
    setPreviewPrompt("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg md:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            Melhorar Prompt
          </DialogTitle>
          <DialogDescription>
            Descreva o que você quer melhorar e a IA vai ajustar o prompt
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>O que você quer melhorar?</Label>
              <Textarea
                placeholder={`Exemplos:
• Quero que seja mais vendedor e foque em conversão
• Precisa ser mais formal e profissional
• Adicionar informações sobre promoções de final de ano
• Mudar o horário de atendimento para 8h às 20h
• Focar mais em suporte e resolução de problemas
• Ser mais descontraído e usar mais emojis`}
                value={improvement}
                onChange={(e) => setImprovement(e.target.value)}
                className="min-h-[120px] resize-none"
              />
            </div>

            <Card className="p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">
                <strong>💡 Dica:</strong> Seja específico sobre o que quer mudar. 
                Quanto mais detalhes, melhor será a melhoria.
              </p>
            </Card>
          </div>
        )}

        {step === "improving" && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center animate-pulse">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <div className="absolute -top-2 -right-2">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="font-medium">Aplicando melhorias...</p>
              <p className="text-sm text-muted-foreground">A IA está analisando e ajustando o prompt</p>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Prompt Melhorado
              </Label>
              <Card className="p-3 bg-muted/30 max-h-[300px] overflow-y-auto">
                <pre className="text-xs whitespace-pre-wrap font-mono">
                  {previewPrompt}
                </pre>
              </Card>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          {step === "input" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button onClick={handleImprove} disabled={!improvement.trim()} className="gap-2">
                <Sparkles className="w-4 h-4" />
                Melhorar Prompt
                <ArrowRight className="w-4 h-4" />
              </Button>
            </>
          )}

          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("input")} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Tentar novamente
              </Button>
              <Button onClick={handleApply} className="gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Aplicar melhorias
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
