import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Sparkles, Loader2, ArrowRight, Bot, CheckCircle2, 
  Edit3, Zap, MessageSquare, Lightbulb, ArrowLeft
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface PromptGeneratorProps {
  onPromptGenerated: (prompt: string) => void;
  onSkip: () => void;
}

const SUGGESTIONS = [
  { label: "Pizzaria", text: "Tenho uma pizzaria chamada Bella Napoli. Vendemos pizzas artesanais e entregamos na zona sul. Quero um agente simpático que anote pedidos." },
  { label: "Advogado", text: "Sou advogado trabalhista. Meu escritório se chama Silva & Associados. Quero um agente formal que agende consultas e tire dúvidas básicas." },
  { label: "Loja de Roupas", text: "Minha loja é a Fashion Style. Vendemos roupas femininas casuais. O agente deve ser descontraído, usar emojis e ajudar a escolher looks." },
  { label: "Clínica", text: "Clínica de Estética Bem Estar. Fazemos botox, limpeza de pele e massagem. O agente deve ser acolhedor e agendar avaliações." }
];

export function PromptGenerator({ onPromptGenerated, onSkip }: PromptGeneratorProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"input" | "generating" | "done">("input");
  const [userInput, setUserInput] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!userInput.trim() || userInput.length < 10) {
      toast({
        title: "Descreva seu negócio",
        description: "Conte um pouco mais sobre sua empresa para a IA criar um agente incrível.",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    setStep("generating");

    try {
      // Envia tudo como descrição e deixa o backend/IA se virar
      // Usamos "custom" como tipo para indicar que é texto livre
      const response = await apiRequest("POST", "/api/agent/generate-prompt", {
        businessType: "custom",
        businessName: "Meu Negócio", // Backend vai tentar extrair ou usar genérico
        description: userInput,
        additionalInfo: "Extraído do input único do usuário"
      });
      
      const data = await response.json();
      
      if (data.prompt) {
        setGeneratedPrompt(data.prompt);
        setStep("done");
      } else {
        throw new Error("Não foi possível criar as instruções");
      }
    } catch (error) {
      console.error("Error generating prompt:", error);
      // Fallback local se a API falhar
      const fallbackPrompt = generateLocalFallback(userInput);
      setGeneratedPrompt(fallbackPrompt);
      setStep("done");
    } finally {
      setIsGenerating(false);
    }
  };

  const generateLocalFallback = (input: string) => {
    // Tenta extrair nome do negócio do input
    const nomeMatch = input.match(/(?:chama|chamada?|sou|somos|é a|tenho a?|minha?)\s+([^.!?,]+)/i);
    const nome = nomeMatch ? nomeMatch[1].trim().split(' ').slice(0, 3).join(' ') : "Meu Negócio";
    
    // Versão CONCISA do fallback
    return `${nome} - Atendente virtual. Tom: simpático e objetivo.

CONTEXTO:
${input.length > 300 ? input.substring(0, 300) + '...' : input}

REGRAS:
• Cumprimente na primeira mensagem
• Responda dúvidas sobre o negócio
• Ajude com agendamentos e pedidos
• Seja direto e resolva problemas

NÃO FAZER:
• Inventar informações
• Ser rude ou impaciente
• Encaminhe para humano se não souber`;
  };

  const handleFinish = () => {
    onPromptGenerated(generatedPrompt);
  };

  // =================== STEP: INPUT (LOVABLE STYLE) ===================
  if (step === "input") {
    return (
      <div className="flex flex-col items-center justify-start md:justify-center min-h-[50vh] py-4 md:py-8 px-4 animate-in fade-in duration-500">
        
        {/* Hero Section */}
        <div className="text-center space-y-2 md:space-y-4 mb-4 md:mb-8 max-w-2xl">
          <div className="hidden md:inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 mb-2 shadow-sm">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
            Crie seu Agente IA
          </h1>
          <p className="text-muted-foreground text-sm md:text-xl max-w-lg mx-auto leading-relaxed">
            Descreva sua empresa e como você quer que o agente atenda. A IA cuida do resto.
          </p>
        </div>

        {/* Main Input Area - Lovable Style */}
        <div className="w-full max-w-2xl relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-500"></div>
          <Card className="relative p-2 bg-background/80 backdrop-blur-xl border-muted/40 shadow-xl rounded-2xl overflow-hidden">
            <Textarea
              placeholder="Ex: Minha empresa é a Drielle Calçados. Vendemos tênis e saltos. Quero um agente simpático que ajude as clientes a escolherem o tamanho certo e tire dúvidas sobre entrega..."
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              className="min-h-[100px] md:min-h-[160px] w-full resize-none border-0 focus-visible:ring-0 bg-transparent text-base md:text-lg p-4 placeholder:text-muted-foreground/50"
              autoFocus
            />
            
            <div className="flex items-center justify-between px-2 pb-2 pt-2 border-t border-border/30">
              <div className="flex gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full h-9 w-9"
                  title="Adicionar contexto (em breve)"
                >
                  <Zap className="w-4 h-4" />
                </Button>
              </div>
              
              <Button 
                onClick={handleGenerate}
                disabled={!userInput.trim()}
                className="rounded-xl px-6 font-medium transition-all duration-300 hover:shadow-lg hover:shadow-primary/20"
                size="default"
              >
                Criar Agente
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        </div>

        {/* Suggestions / Starters */}
        <div className="mt-8 w-full max-w-2xl">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 text-center">
            Ou comece com um exemplo
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => setUserInput(s.text)}
                className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border/50 bg-card/50 hover:bg-primary/5 hover:border-primary/30 transition-all duration-200 text-center group"
              >
                <span className="text-sm font-medium text-foreground/80 group-hover:text-primary">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Skip Link */}
        <div className="mt-8">
          <Button 
            variant="ghost" 
            onClick={onSkip}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            <Edit3 className="w-3 h-3 mr-2" />
            Prefiro configurar manualmente
          </Button>
        </div>
      </div>
    );
  }

  // =================== STEP: GENERATING ===================
  if (step === "generating") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] py-16 space-y-8 animate-in fade-in duration-700">
        <div className="relative">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center animate-pulse shadow-2xl shadow-primary/30">
            <Bot className="w-12 h-12 text-white" />
          </div>
          <div className="absolute -top-3 -right-3 bg-background rounded-full p-1.5 shadow-lg border border-border">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        </div>
        
        <div className="text-center space-y-3 max-w-md">
          <h3 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-600">
            Criando seu funcionário digital...
          </h3>
          <p className="text-muted-foreground text-lg">
            Analisando seu negócio e definindo a melhor estratégia de atendimento.
          </p>
          
          <div className="flex flex-col gap-2 mt-6">
            <div className="flex items-center gap-3 text-sm text-muted-foreground/80 bg-muted/30 px-4 py-2 rounded-full">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Definindo personalidade
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground/80 bg-muted/30 px-4 py-2 rounded-full delay-150">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Estruturando respostas
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground/80 bg-muted/30 px-4 py-2 rounded-full delay-300">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Ajustando tom de voz
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =================== STEP: DONE ===================
  if (step === "done") {
    return (
      <div className="flex flex-col w-full max-w-3xl mx-auto animate-in slide-in-from-bottom-4 duration-500 pt-2 pb-6 px-1">
        
        {/* Header Compacto com Botão Voltar Discreto */}
        <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                    <h2 className="text-base font-bold leading-tight">Agente Criado!</h2>
                    <p className="text-[10px] text-muted-foreground">Revise e edite se precisar</p>
                </div>
            </div>
            <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setStep("input")} 
                className="text-muted-foreground hover:text-destructive h-8 text-xs px-2"
            >
                <ArrowLeft className="w-3 h-3 mr-1" />
                Refazer
            </Button>
        </div>

        {/* Editor "Lousa" - Foco Total */}
        <Card className="flex-1 flex flex-col w-full bg-background border-primary/20 shadow-lg overflow-hidden mb-4 ring-1 ring-border/50">
            <div className="bg-muted/30 px-3 py-1.5 border-b border-border/50 flex justify-between items-center">
                <span className="text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <Edit3 className="w-3 h-3" /> 
                    Editor de Instruções
                </span>
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-background/50">
                    IA GENERATED
                </Badge>
            </div>
            <Textarea
              value={generatedPrompt}
              onChange={(e) => setGeneratedPrompt(e.target.value)}
              className="flex-1 w-full resize-none border-0 focus-visible:ring-0 bg-transparent text-sm md:text-base p-3 md:p-4 font-mono leading-relaxed text-foreground/90 min-h-[50vh] md:min-h-[40vh]"
              spellCheck={false}
            />
        </Card>

        {/* Botão de Ação Gigante */}
        <Button 
            onClick={handleFinish}
            className="w-full h-14 text-base md:text-lg font-bold bg-green-600 hover:bg-green-700 text-white shadow-xl shadow-green-600/20 rounded-xl transition-all active:scale-95 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-100"
        >
            <Zap className="w-5 h-5 mr-2 fill-current" />
            ATIVAR AGENTE AGORA
        </Button>
      </div>
    );
  }

  return null;
}
