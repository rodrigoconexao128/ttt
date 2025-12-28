import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Sparkles, Loader2, ArrowRight, Bot, Store, MessageSquare, 
  Building2, Utensils, ShoppingBag, Briefcase, Heart, Car,
  GraduationCap, Home, Plane, Dumbbell, Scissors, Stethoscope,
  Wand2, CheckCircle2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface PromptGeneratorProps {
  onPromptGenerated: (prompt: string) => void;
  onSkip: () => void;
}

// Tipos de negócio para sugestões rápidas
const businessTypes = [
  { id: "loja", label: "Loja/E-commerce", icon: ShoppingBag },
  { id: "restaurante", label: "Restaurante/Delivery", icon: Utensils },
  { id: "servicos", label: "Prestador de Serviços", icon: Briefcase },
  { id: "imobiliaria", label: "Imobiliária", icon: Home },
  { id: "clinica", label: "Clínica/Saúde", icon: Stethoscope },
  { id: "salao", label: "Salão/Beleza", icon: Scissors },
  { id: "academia", label: "Academia/Fitness", icon: Dumbbell },
  { id: "educacao", label: "Escola/Cursos", icon: GraduationCap },
  { id: "viagem", label: "Turismo/Viagem", icon: Plane },
  { id: "auto", label: "Automóveis", icon: Car },
  { id: "consultoria", label: "Consultoria", icon: Building2 },
  { id: "outro", label: "Outro", icon: Store },
];

export function PromptGenerator({ onPromptGenerated, onSkip }: PromptGeneratorProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"type" | "info" | "generating" | "done">("type");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [businessInfo, setBusinessInfo] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePrompt = async () => {
    if (!businessInfo.trim()) {
      toast({
        title: "Informações necessárias",
        description: "Descreva seu negócio para gerar o prompt",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    setStep("generating");

    try {
      const response = await apiRequest("POST", "/api/agent/generate-prompt", {
        businessType: selectedType,
        businessInfo: businessInfo,
      });
      
      const data = await response.json();
      
      if (data.prompt) {
        setGeneratedPrompt(data.prompt);
        setStep("done");
      } else {
        throw new Error("Prompt não gerado");
      }
    } catch (error) {
      console.error("Error generating prompt:", error);
      // Fallback: gerar prompt localmente
      const fallbackPrompt = generateLocalPrompt(selectedType, businessInfo);
      setGeneratedPrompt(fallbackPrompt);
      setStep("done");
    } finally {
      setIsGenerating(false);
    }
  };

  const generateLocalPrompt = (type: string | null, info: string): string => {
    const businessName = extractBusinessName(info);
    const typeLabel = businessTypes.find(t => t.id === type)?.label || "empresa";
    
    return `# AGENTE ${businessName.toUpperCase()} - AgenteZap

## IDENTIDADE
Você é um atendente virtual da ${businessName}. ${getTypeDescription(type)}

## PERSONALIDADE
- Seja simpático, profissional e prestativo
- Use linguagem natural e amigável
- Responda de forma clara e objetiva
- Use emojis com moderação (1-2 por mensagem)
- Sempre cumprimente o cliente pelo nome quando disponível

## INFORMAÇÕES DO NEGÓCIO
${info}

## COMO ATENDER
1. **Primeira mensagem do cliente:**
   - Cumprimente de forma calorosa
   - Pergunte como pode ajudar

2. **Dúvidas sobre produtos/serviços:**
   - Explique de forma clara e simples
   - Ofereça opções quando houver
   - Destaque benefícios principais

3. **Agendamentos/Pedidos:**
   - Confirme todos os detalhes
   - Repita informações importantes
   - Agradeça pela preferência

## O QUE FAZER
- Responder dúvidas sobre produtos e serviços
- Informar preços e condições
- Agendar horários quando aplicável
- Enviar informações de contato e localização
- Qualificar o interesse do cliente

## O QUE NÃO FAZER
- Não invente informações que não foram fornecidas
- Não prometa prazos ou descontos sem autorização
- Não seja insistente ou agressivo
- Se não souber algo, diga que vai verificar

## FECHAMENTO
- Sempre pergunte se pode ajudar em mais alguma coisa
- Agradeça pelo contato
- Deixe o cliente à vontade para retornar

Use {{nome}} para inserir o nome do cliente automaticamente.`;
  };

  const extractBusinessName = (info: string): string => {
    // Tenta extrair nome do negócio das informações
    const patterns = [
      /(?:empresa|loja|negócio|estabelecimento|clínica|salão|academia|restaurante|escola)[:\s]+([^\n,]+)/i,
      /(?:somos|sou|trabalho|atuo)[:\s]+(?:na|no|a|o)?\s*([^\n,]+)/i,
      /^([A-Z][a-zA-Zá-úÁ-Ú\s]+)(?:\s*[-–]\s*|\n)/,
    ];
    
    for (const pattern of patterns) {
      const match = info.match(pattern);
      if (match && match[1]) {
        return match[1].trim().substring(0, 50);
      }
    }
    
    // Fallback: primeiras palavras
    const words = info.trim().split(/\s+/).slice(0, 3).join(" ");
    return words || "Minha Empresa";
  };

  const getTypeDescription = (type: string | null): string => {
    const descriptions: Record<string, string> = {
      loja: "Somos uma loja focada em oferecer os melhores produtos com atendimento de qualidade.",
      restaurante: "Somos um estabelecimento gastronômico focado em sabor e qualidade no atendimento.",
      servicos: "Somos prestadores de serviços especializados, focados em qualidade e satisfação do cliente.",
      imobiliaria: "Somos uma imobiliária comprometida em encontrar o imóvel ideal para cada cliente.",
      clinica: "Somos uma clínica focada no bem-estar e saúde dos nossos pacientes.",
      salao: "Somos um espaço de beleza dedicado a realçar a autoestima dos nossos clientes.",
      academia: "Somos um espaço fitness focado em ajudar nossos alunos a alcançarem seus objetivos.",
      educacao: "Somos uma instituição educacional comprometida com o aprendizado de qualidade.",
      viagem: "Somos especialistas em criar experiências de viagem inesquecíveis.",
      auto: "Somos especialistas no setor automotivo, oferecendo as melhores soluções.",
      consultoria: "Somos uma consultoria especializada em entregar resultados para nossos clientes.",
    };
    return descriptions[type || ""] || "Estamos aqui para atender você da melhor forma possível.";
  };

  // Step 1: Escolher tipo de negócio
  if (step === "type") {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mx-auto mb-4">
            <Wand2 className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl md:text-2xl font-bold">Vamos criar seu Agente IA</h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-md mx-auto">
            Responda algumas perguntas e a IA vai gerar um prompt personalizado para seu negócio
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-center">Qual é o tipo do seu negócio?</p>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2 md:gap-3">
            {businessTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => {
                  setSelectedType(type.id);
                  setStep("info");
                }}
                className="flex flex-col items-center gap-1.5 p-3 md:p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <type.icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <span className="text-[10px] md:text-xs text-center leading-tight">{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-center pt-4">
          <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
            Pular e configurar manualmente
          </Button>
        </div>
      </div>
    );
  }

  // Step 2: Informações do negócio
  if (step === "info") {
    const selectedTypeInfo = businessTypes.find(t => t.id === selectedType);
    
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <Badge variant="secondary" className="mb-2">
            {selectedTypeInfo?.label}
          </Badge>
          <h2 className="text-xl md:text-2xl font-bold">Conte sobre seu negócio</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Quanto mais detalhes você fornecer, melhor será o prompt gerado
          </p>
        </div>

        <Card className="p-4 md:p-6 bg-muted/30">
          <Textarea
            placeholder={`Exemplo:

Nome: Pizzaria Bella Napoli
Horário: Segunda a Domingo, 18h às 23h
Endereço: Rua das Flores, 123 - Centro

Cardápio:
- Pizza Margherita: R$ 45
- Pizza Calabresa: R$ 50
- Pizza 4 Queijos: R$ 55

Delivery grátis até 5km
Pagamento: Dinheiro, PIX, Cartão
WhatsApp: (11) 99999-9999

Promoção: Terça é dia de 2 por 1 em pizzas selecionadas`}
            value={businessInfo}
            onChange={(e) => setBusinessInfo(e.target.value)}
            className="min-h-[280px] md:min-h-[350px] text-sm md:text-base resize-none bg-background"
          />
          <p className="text-xs text-muted-foreground mt-2 text-right">
            {businessInfo.length} caracteres
          </p>
        </Card>

        <div className="flex flex-col md:flex-row gap-3 justify-between">
          <Button variant="outline" onClick={() => setStep("type")}>
            Voltar
          </Button>
          <Button 
            onClick={generatePrompt}
            disabled={!businessInfo.trim() || isGenerating}
            className="gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Gerar Prompt com IA
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Step 3: Gerando
  if (step === "generating") {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center animate-pulse">
            <Bot className="w-10 h-10 text-white" />
          </div>
          <div className="absolute -top-2 -right-2">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold">Gerando seu prompt...</h2>
          <p className="text-sm text-muted-foreground">
            A IA está criando um prompt personalizado para seu negócio
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="w-4 h-4 animate-pulse" />
          <span>Analisando informações...</span>
        </div>
      </div>
    );
  }

  // Step 4: Pronto
  if (step === "done") {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-green-500 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl md:text-2xl font-bold">Prompt gerado com sucesso!</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Revise o prompt abaixo. Você poderá editá-lo depois se precisar.
          </p>
        </div>

        <Card className="p-4 bg-muted/30 max-h-[300px] overflow-y-auto">
          <pre className="text-xs md:text-sm whitespace-pre-wrap font-mono">
            {generatedPrompt}
          </pre>
        </Card>

        <div className="flex flex-col md:flex-row gap-3 justify-between">
          <Button variant="outline" onClick={() => setStep("info")}>
            Voltar e refazer
          </Button>
          <Button 
            onClick={() => onPromptGenerated(generatedPrompt)}
            className="gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Usar este prompt
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
