import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Sparkles, Loader2, ArrowRight, ArrowLeft, Bot, Store, 
  Building2, Utensils, ShoppingBag, Briefcase, Heart, Car,
  GraduationCap, Home, Plane, Dumbbell, Scissors, Stethoscope,
  Wand2, CheckCircle2, ChevronLeft, ChevronRight, Pizza, Coffee,
  Shirt, Gem, Wrench, Hammer, Palette, Camera, Music, Gamepad2,
  Baby, Dog, Flower2, Cake, Wine, Beer, IceCream, Truck, Package,
  Smartphone, Laptop, Headphones, Watch, Glasses, Pill, Syringe,
  TestTube, Brain, Scale, Gavel, FileText, PenTool, Megaphone,
  TrendingUp, Users, Handshake, Award, Target, Zap, Cpu, Database,
  Cloud, Lock, Shield, Globe, MapPin, Building, Factory, Warehouse,
  ShoppingCart, CreditCard, Banknote, Receipt,
  ClipboardList, Calendar, Clock, Phone, Mail, MessageCircle,
  Video, Mic, Radio, Tv, BookOpen, Library, PenLine
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface PromptGeneratorProps {
  onPromptGenerated: (prompt: string) => void;
  onSkip: () => void;
}

// Tipos de negócio EXTENSOS - 50+ opções organizadas por categoria
const businessCategories = [
  {
    category: "🍔 Alimentação",
    types: [
      { id: "restaurante", label: "Restaurante", icon: Utensils },
      { id: "pizzaria", label: "Pizzaria", icon: Pizza },
      { id: "lanchonete", label: "Lanchonete", icon: Coffee },
      { id: "hamburgueria", label: "Hamburgueria", icon: Utensils },
      { id: "doceria", label: "Doceria/Confeitaria", icon: Cake },
      { id: "padaria", label: "Padaria", icon: Cake },
      { id: "bar", label: "Bar/Pub", icon: Beer },
      { id: "sorveteria", label: "Sorveteria", icon: IceCream },
      { id: "cafeteria", label: "Cafeteria", icon: Coffee },
      { id: "marmitex", label: "Marmitaria", icon: Package },
    ]
  },
  {
    category: "🛍️ Varejo",
    types: [
      { id: "loja_roupa", label: "Loja de Roupas", icon: Shirt },
      { id: "loja_calcados", label: "Calçados", icon: ShoppingBag },
      { id: "joalheria", label: "Joalheria/Bijuteria", icon: Gem },
      { id: "loja_eletronicos", label: "Eletrônicos", icon: Smartphone },
      { id: "loja_moveis", label: "Móveis", icon: Home },
      { id: "supermercado", label: "Supermercado", icon: ShoppingCart },
      { id: "papelaria", label: "Papelaria", icon: PenLine },
      { id: "livraria", label: "Livraria", icon: BookOpen },
      { id: "petshop", label: "Pet Shop", icon: Dog },
      { id: "floricultura", label: "Floricultura", icon: Flower2 },
      { id: "brinquedos", label: "Loja de Brinquedos", icon: Baby },
      { id: "otica", label: "Ótica", icon: Glasses },
      { id: "relojoaria", label: "Relojoaria", icon: Watch },
      { id: "farmacia", label: "Farmácia", icon: Pill },
    ]
  },
  {
    category: "💅 Beleza & Saúde",
    types: [
      { id: "salao", label: "Salão de Beleza", icon: Scissors },
      { id: "barbearia", label: "Barbearia", icon: Scissors },
      { id: "clinica_estetica", label: "Clínica Estética", icon: Heart },
      { id: "spa", label: "SPA/Massagem", icon: Heart },
      { id: "studio_nail", label: "Nail Designer", icon: Palette },
      { id: "studio_sobrancelha", label: "Design de Sobrancelhas", icon: PenTool },
      { id: "clinica_medica", label: "Clínica Médica", icon: Stethoscope },
      { id: "dentista", label: "Dentista", icon: Stethoscope },
      { id: "psicologo", label: "Psicólogo", icon: Brain },
      { id: "nutricionista", label: "Nutricionista", icon: Scale },
      { id: "fisioterapeuta", label: "Fisioterapeuta", icon: Heart },
      { id: "veterinario", label: "Veterinário", icon: Dog },
      { id: "laboratorio", label: "Laboratório", icon: TestTube },
    ]
  },
  {
    category: "🏋️ Fitness & Esportes",
    types: [
      { id: "academia", label: "Academia", icon: Dumbbell },
      { id: "personal", label: "Personal Trainer", icon: Dumbbell },
      { id: "crossfit", label: "CrossFit/Box", icon: Dumbbell },
      { id: "pilates", label: "Pilates/Yoga", icon: Heart },
      { id: "natacao", label: "Natação", icon: Dumbbell },
      { id: "artes_marciais", label: "Artes Marciais", icon: Dumbbell },
      { id: "loja_suplementos", label: "Suplementos", icon: Pill },
      { id: "loja_esportiva", label: "Loja Esportiva", icon: Shirt },
    ]
  },
  {
    category: "🔧 Serviços",
    types: [
      { id: "oficina", label: "Oficina Mecânica", icon: Wrench },
      { id: "eletricista", label: "Eletricista", icon: Zap },
      { id: "encanador", label: "Encanador", icon: Wrench },
      { id: "pintor", label: "Pintor", icon: Palette },
      { id: "marceneiro", label: "Marceneiro", icon: Hammer },
      { id: "ar_condicionado", label: "Ar Condicionado", icon: Wrench },
      { id: "desentupidora", label: "Desentupidora", icon: Wrench },
      { id: "limpeza", label: "Limpeza", icon: Sparkles },
      { id: "mudanca", label: "Mudanças/Frete", icon: Truck },
      { id: "lavanderia", label: "Lavanderia", icon: Shirt },
      { id: "assistencia_tecnica", label: "Assistência Técnica", icon: Smartphone },
      { id: "chaveiro", label: "Chaveiro", icon: Lock },
      { id: "fotografo", label: "Fotógrafo", icon: Camera },
      { id: "videomaker", label: "Videomaker", icon: Video },
    ]
  },
  {
    category: "🎓 Educação",
    types: [
      { id: "escola", label: "Escola", icon: GraduationCap },
      { id: "curso_idiomas", label: "Curso de Idiomas", icon: Globe },
      { id: "curso_informatica", label: "Informática", icon: Laptop },
      { id: "musica", label: "Escola de Música", icon: Music },
      { id: "danca", label: "Escola de Dança", icon: Music },
      { id: "reforco", label: "Reforço Escolar", icon: BookOpen },
      { id: "concursos", label: "Preparatório", icon: Library },
      { id: "autoescola", label: "Autoescola", icon: Car },
    ]
  },
  {
    category: "🏠 Imóveis & Construção",
    types: [
      { id: "imobiliaria", label: "Imobiliária", icon: Home },
      { id: "construtora", label: "Construtora", icon: Building },
      { id: "arquiteto", label: "Arquiteto", icon: Building2 },
      { id: "designer_interiores", label: "Design de Interiores", icon: Palette },
      { id: "loja_construcao", label: "Materiais de Construção", icon: Warehouse },
      { id: "vidracaria", label: "Vidraçaria", icon: Building2 },
      { id: "serralheria", label: "Serralheria", icon: Hammer },
      { id: "gesso", label: "Gesso/Drywall", icon: Building2 },
    ]
  },
  {
    category: "💼 Profissionais",
    types: [
      { id: "advogado", label: "Advogado", icon: Gavel },
      { id: "contador", label: "Contador", icon: Receipt },
      { id: "consultoria", label: "Consultoria", icon: TrendingUp },
      { id: "marketing", label: "Marketing Digital", icon: Megaphone },
      { id: "rh", label: "RH/Recrutamento", icon: Users },
      { id: "financeiro", label: "Assessoria Financeira", icon: Banknote },
      { id: "seguros", label: "Corretora de Seguros", icon: Shield },
      { id: "coaching", label: "Coach/Mentor", icon: Target },
    ]
  },
  {
    category: "💻 Tecnologia",
    types: [
      { id: "desenvolvimento", label: "Desenvolvimento de Software", icon: Cpu },
      { id: "ti", label: "Suporte de TI", icon: Laptop },
      { id: "sites", label: "Criação de Sites", icon: Globe },
      { id: "apps", label: "Desenvolvimento de Apps", icon: Smartphone },
      { id: "cloud", label: "Cloud/Infraestrutura", icon: Cloud },
      { id: "seguranca_ti", label: "Segurança da Informação", icon: Shield },
    ]
  },
  {
    category: "🎉 Eventos & Entretenimento",
    types: [
      { id: "eventos", label: "Organização de Eventos", icon: Calendar },
      { id: "buffet", label: "Buffet", icon: Cake },
      { id: "decoracao", label: "Decoração de Festas", icon: Sparkles },
      { id: "dj", label: "DJ/Som", icon: Headphones },
      { id: "locacao", label: "Locação de Equipamentos", icon: Package },
      { id: "espacos", label: "Espaço para Eventos", icon: Building },
    ]
  },
  {
    category: "🌐 Digital & Infoprodutos",
    types: [
      { id: "infoprodutor", label: "Infoprodutor", icon: BookOpen },
      { id: "afiliado", label: "Afiliado Digital", icon: TrendingUp },
      { id: "mentor", label: "Mentoria Online", icon: Video },
      { id: "comunidade", label: "Comunidade/Clube", icon: Users },
      { id: "podcast", label: "Podcast", icon: Mic },
      { id: "youtuber", label: "YouTuber/Criador", icon: Video },
      { id: "influencer", label: "Influencer", icon: Megaphone },
      { id: "ecommerce", label: "E-commerce", icon: ShoppingCart },
      { id: "dropshipping", label: "Dropshipping", icon: Package },
    ]
  },
  {
    category: "✈️ Turismo & Viagem",
    types: [
      { id: "agencia_viagem", label: "Agência de Viagens", icon: Plane },
      { id: "hotel", label: "Hotel/Pousada", icon: Building },
      { id: "guia", label: "Guia Turístico", icon: MapPin },
      { id: "transfer", label: "Transfer/Transporte", icon: Car },
    ]
  },
  {
    category: "📦 Outros",
    types: [
      { id: "grafica", label: "Gráfica", icon: PenTool },
      { id: "cartorio", label: "Cartório/Despachante", icon: FileText },
      { id: "funeraria", label: "Funerária", icon: Heart },
      { id: "outro", label: "Outro Negócio", icon: Store },
    ]
  }
];

// Flatten para facilitar busca
const allBusinessTypes = businessCategories.flatMap(cat => cat.types);

export function PromptGenerator({ onPromptGenerated, onSkip }: PromptGeneratorProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"type" | "info" | "generating" | "done">("type");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [businessInfo, setBusinessInfo] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Slider controls
  const sliderRef = useRef<HTMLDivElement>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  // Auto-scroll slider
  useEffect(() => {
    if (!isAutoPlaying || step !== "type") return;
    
    const interval = setInterval(() => {
      setCurrentSlide(prev => {
        const maxSlide = businessCategories.length - 1;
        return prev >= maxSlide ? 0 : prev + 1;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [isAutoPlaying, step]);

  // Scroll to current slide
  useEffect(() => {
    if (sliderRef.current) {
      const slideWidth = sliderRef.current.offsetWidth;
      sliderRef.current.scrollTo({
        left: currentSlide * slideWidth,
        behavior: 'smooth'
      });
    }
  }, [currentSlide]);

  const handleSliderInteraction = () => {
    setIsAutoPlaying(false);
    // Resume auto-play after 10 seconds of inactivity
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  const goToPrevSlide = () => {
    handleSliderInteraction();
    setCurrentSlide(prev => prev <= 0 ? businessCategories.length - 1 : prev - 1);
  };

  const goToNextSlide = () => {
    handleSliderInteraction();
    setCurrentSlide(prev => prev >= businessCategories.length - 1 ? 0 : prev + 1);
  };

  const generatePrompt = async () => {
    if (!businessName.trim()) {
      toast({
        title: "Nome necessário",
        description: "Informe o nome do seu negócio",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    setStep("generating");

    try {
      const response = await apiRequest("POST", "/api/agent/generate-prompt", {
        businessType: selectedType,
        businessName: businessName,
        description: businessInfo,
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
      const fallbackPrompt = generateLocalPrompt(selectedType, businessName, businessInfo);
      setGeneratedPrompt(fallbackPrompt);
      setStep("done");
    } finally {
      setIsGenerating(false);
    }
  };

  const generateLocalPrompt = (type: string | null, name: string, info: string): string => {
    const typeInfo = allBusinessTypes.find(t => t.id === type);
    const typeLabel = typeInfo?.label || "empresa";
    
    return `# AGENTE ${name.toUpperCase()} - AgenteZap

## 🤖 IDENTIDADE
Você é o assistente virtual de atendimento da **${name}**.
Tipo de negócio: ${typeLabel}

## 💬 PERSONALIDADE
- Seja simpático, profissional e prestativo
- Use linguagem natural e amigável (como um atendente real)
- Responda de forma clara e objetiva
- Use emojis com moderação (1-2 por mensagem, nunca exagere)
- Sempre cumprimente o cliente de forma calorosa
- Personalize as respostas quando tiver o nome do cliente

## 📋 INFORMAÇÕES DO NEGÓCIO
${info || "Insira aqui as informações do seu negócio como: horários, endereço, produtos/serviços, preços, formas de pagamento, etc."}

## ✅ O QUE FAZER
- Responder dúvidas sobre produtos/serviços
- Informar preços e condições de pagamento
- Explicar funcionamento do negócio
- Agendar horários quando aplicável
- Enviar informações de contato e localização
- Qualificar o interesse do cliente
- Ser proativo em oferecer ajuda adicional

## ❌ O QUE NÃO FAZER
- Nunca invente informações que não foram fornecidas
- Não prometa prazos ou descontos sem autorização
- Não seja insistente ou agressivo na venda
- Se não souber algo, diga que vai verificar
- Nunca compartilhe dados de outros clientes
- Não use linguagem muito formal ou robótica

## 🔄 FLUXO DE ATENDIMENTO

**1. Primeira mensagem:**
- Cumprimente de forma calorosa
- Pergunte como pode ajudar

**2. Durante o atendimento:**
- Escute atentamente a necessidade
- Ofereça soluções adequadas
- Confirme informações importantes

**3. Fechamento:**
- Resuma o que foi combinado
- Pergunte se pode ajudar em mais algo
- Agradeça pelo contato

## 💡 DICAS ESPECIAIS
- Use {{nome}} para inserir automaticamente o nome do cliente
- Sempre confirme dados importantes antes de finalizar
- Em caso de reclamações, seja empático e solucione rapidamente
- Para pedidos/agendamentos, repita todos os detalhes para confirmação`;
  };

  // ========== STEP 1: Escolher tipo de negócio ==========
  if (step === "type") {
    return (
      <div className="space-y-6 px-2 md:px-0">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mx-auto mb-4">
            <Wand2 className="w-7 h-7 md:w-8 md:h-8 text-white" />
          </div>
          <h2 className="text-lg md:text-2xl font-bold">Vamos criar seu Agente IA</h2>
          <p className="text-xs md:text-sm text-muted-foreground max-w-md mx-auto">
            Selecione o tipo do seu negócio e a IA vai gerar um prompt personalizado
          </p>
        </div>

        {/* Slider de categorias */}
        <div className="relative">
          {/* Navigation arrows */}
          <button
            onClick={goToPrevSlide}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 md:w-10 md:h-10 bg-background/90 border rounded-full flex items-center justify-center shadow-lg hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <button
            onClick={goToNextSlide}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 md:w-10 md:h-10 bg-background/90 border rounded-full flex items-center justify-center shadow-lg hover:bg-muted transition-colors"
          >
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
          </button>

          {/* Slider container */}
          <div 
            ref={sliderRef}
            className="overflow-hidden mx-8 md:mx-12"
            onTouchStart={handleSliderInteraction}
          >
            <div 
              className="flex transition-transform duration-500"
              style={{ transform: `translateX(-${currentSlide * 100}%)` }}
            >
              {businessCategories.map((category, catIndex) => (
                <div 
                  key={category.category}
                  className="w-full flex-shrink-0 px-1"
                >
                  <div className="space-y-3">
                    <h3 className="text-sm md:text-base font-semibold text-center">
                      {category.category}
                    </h3>
                    <div className="grid grid-cols-4 md:grid-cols-5 gap-1.5 md:gap-2">
                      {category.types.map((type) => (
                        <button
                          key={type.id}
                          onClick={() => {
                            setSelectedType(type.id);
                            setStep("info");
                          }}
                          className={`
                            flex flex-col items-center gap-1 p-2 md:p-3 rounded-xl border 
                            transition-all hover:border-primary hover:bg-primary/5
                            ${selectedType === type.id ? 'border-primary bg-primary/10' : 'border-border'}
                          `}
                        >
                          <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-muted flex items-center justify-center">
                            <type.icon className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
                          </div>
                          <span className="text-[9px] md:text-xs text-center leading-tight line-clamp-2">
                            {type.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dots indicator */}
          <div className="flex justify-center gap-1.5 mt-4">
            {businessCategories.map((_, index) => (
              <button
                key={index}
                onClick={() => {
                  handleSliderInteraction();
                  setCurrentSlide(index);
                }}
                className={`
                  w-2 h-2 rounded-full transition-all
                  ${currentSlide === index ? 'bg-primary w-6' : 'bg-muted-foreground/30'}
                `}
              />
            ))}
          </div>
        </div>

        {/* Skip button */}
        <div className="flex justify-center pt-2">
          <Button 
            variant="ghost" 
            onClick={onSkip} 
            className="text-muted-foreground text-sm"
          >
            Pular e configurar manualmente
          </Button>
        </div>
      </div>
    );
  }

  // ========== STEP 2: Informações do negócio ==========
  if (step === "info") {
    const selectedTypeInfo = allBusinessTypes.find(t => t.id === selectedType);
    
    return (
      <div className="space-y-5 px-2 md:px-0">
        <div className="text-center space-y-2">
          <Badge variant="secondary" className="mb-2">
            {selectedTypeInfo?.label || "Seu negócio"}
          </Badge>
          <h2 className="text-lg md:text-2xl font-bold">Conte sobre seu negócio</h2>
          <p className="text-xs md:text-sm text-muted-foreground max-w-md mx-auto">
            Quanto mais detalhes, melhor será o prompt gerado
          </p>
        </div>

        <div className="space-y-4">
          {/* Nome do negócio */}
          <div className="space-y-2">
            <Label htmlFor="businessName" className="text-sm font-medium">
              Nome do seu negócio *
            </Label>
            <Input
              id="businessName"
              placeholder="Ex: Pizzaria Bella Napoli"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="h-11"
            />
          </div>

          {/* Informações detalhadas */}
          <div className="space-y-2">
            <Label htmlFor="businessInfo" className="text-sm font-medium">
              Informações do negócio
            </Label>
            <Card className="p-3 md:p-4 bg-muted/30">
              <Textarea
                id="businessInfo"
                placeholder={getPlaceholderForType(selectedType)}
                value={businessInfo}
                onChange={(e) => setBusinessInfo(e.target.value)}
                className="min-h-[200px] md:min-h-[280px] text-sm resize-none bg-background border-0 focus-visible:ring-0"
              />
              <p className="text-xs text-muted-foreground mt-2 text-right">
                {businessInfo.length} caracteres
              </p>
            </Card>
          </div>
        </div>

        <div className="flex flex-col-reverse md:flex-row gap-3 justify-between pt-2">
          <Button variant="outline" onClick={() => setStep("type")} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <Button 
            onClick={generatePrompt}
            disabled={!businessName.trim() || isGenerating}
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

  // ========== STEP 3: Gerando ==========
  if (step === "generating") {
    return (
      <div className="flex flex-col items-center justify-center py-12 md:py-16 space-y-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center animate-pulse">
            <Bot className="w-10 h-10 text-white" />
          </div>
          <div className="absolute -top-2 -right-2">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-lg md:text-xl font-bold">Gerando seu prompt...</h2>
          <p className="text-sm text-muted-foreground">
            A IA está criando um prompt personalizado para <strong>{businessName}</strong>
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="w-4 h-4 animate-pulse" />
          <span>Analisando tipo de negócio e informações...</span>
        </div>
      </div>
    );
  }

  // ========== STEP 4: Pronto ==========
  if (step === "done") {
    return (
      <div className="space-y-5 px-2 md:px-0">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-green-500 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 md:w-8 md:h-8 text-white" />
          </div>
          <h2 className="text-lg md:text-2xl font-bold">Prompt gerado! ✨</h2>
          <p className="text-xs md:text-sm text-muted-foreground max-w-md mx-auto">
            Revise abaixo. Você poderá editar depois se precisar.
          </p>
        </div>

        <Card className="p-3 md:p-4 bg-muted/30 max-h-[280px] md:max-h-[320px] overflow-y-auto">
          <pre className="text-xs md:text-sm whitespace-pre-wrap font-mono leading-relaxed">
            {generatedPrompt}
          </pre>
        </Card>

        <div className="flex flex-col-reverse md:flex-row gap-3 justify-between pt-2">
          <Button variant="outline" onClick={() => setStep("info")} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
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

// Função helper para placeholder contextual
function getPlaceholderForType(type: string | null): string {
  const placeholders: Record<string, string> = {
    pizzaria: `Horário: Segunda a Domingo, 18h às 23h
Endereço: Rua das Flores, 123 - Centro

Cardápio:
- Pizza Margherita: R$ 45
- Pizza Calabresa: R$ 50
- Pizza 4 Queijos: R$ 55
- Borda recheada: +R$ 8

Delivery grátis até 5km
Pagamento: Dinheiro, PIX, Cartão

Promoção: Terça é dia de 2 por 1!`,
    
    salao: `Horário: Terça a Sábado, 9h às 19h
Endereço: Av. Brasil, 456 - Sala 12

Serviços:
- Corte feminino: R$ 80
- Escova: R$ 50
- Progressiva: R$ 200
- Coloração: a partir de R$ 150

Formas de pagamento: PIX, Cartão, Dinheiro
Agendamento: WhatsApp ou presencial`,

    loja_roupa: `Horário: Segunda a Sábado, 9h às 18h
Endereço: Shopping Centro, Loja 45

Coleções:
- Moda feminina
- Moda masculina
- Acessórios

Parcelamos em até 6x sem juros
Frete grátis acima de R$ 200

Instagram: @sualojaaqui`,

    clinica_medica: `Horário: Segunda a Sexta, 8h às 18h
Endereço: Rua da Saúde, 789 - 2º andar

Especialidades:
- Clínica geral
- Cardiologia
- Dermatologia

Convênios: Unimed, Bradesco, SulAmérica
Particular: consulta R$ 250

Agendamento pelo WhatsApp`,

    academia: `Horário: Segunda a Sexta 6h-22h, Sábado 8h-14h
Endereço: Av. Fitness, 1000

Planos:
- Mensal: R$ 99
- Trimestral: R$ 249
- Anual: R$ 799

Modalidades: Musculação, Spinning, Funcional
Primeira aula experimental grátis!`,

    restaurante: `Horário: Segunda a Sábado, 11h às 15h (almoço) e 18h às 22h (jantar)
Endereço: Rua Gastronômica, 321

Menu executivo: R$ 35 (segunda a sexta)
Self-service: R$ 52/kg

Especialidades: Comida brasileira, grelhados
Delivery pelo iFood e WhatsApp

Aceitamos: Cartões, PIX, VR, VA`,

    ecommerce: `Loja online de [seus produtos]

Frete: 
- Grátis acima de R$ 150
- Sedex e PAC disponíveis

Prazo de entrega: 3-7 dias úteis
Troca: até 7 dias após recebimento

Pagamento: PIX (5% desconto), Cartão até 12x

Site: www.sualoja.com.br`,

    advogado: `Horário: Segunda a Sexta, 9h às 18h
Endereço: Ed. Jurídico, Sala 1010

Áreas de atuação:
- Direito Civil
- Direito Trabalhista  
- Direito do Consumidor
- Contratos

Consulta inicial: R$ 200
Atendimento online disponível

OAB/SP: 123456`,

    dentista: `Horário: Segunda a Sexta, 8h às 18h
Endereço: Clínica Dental, Av. Saúde, 500

Serviços:
- Limpeza: R$ 150
- Clareamento: R$ 800
- Ortodontia: avaliação gratuita
- Implantes: consulte

Convênios: Amil, Porto Seguro
Parcelamos no cartão

CRO: 12345`,

    infoprodutor: `Curso/Produto: [Nome do seu produto]
Plataforma: Hotmart/Kiwify/Eduzz

Conteúdo:
- X módulos
- Y horas de conteúdo
- Bônus exclusivos
- Comunidade VIP

Preço: R$ XXX (ou 12x de R$ XX)
Garantia: 7 dias incondicional

Link: seulink.com`,

    oficina: `Horário: Segunda a Sexta, 8h às 18h | Sábado, 8h às 12h
Endereço: Rua dos Mecânicos, 100

Serviços:
- Troca de óleo: R$ 80
- Revisão completa: R$ 250
- Freios: a partir de R$ 200
- Suspensão: a partir de R$ 350

Peças originais e paralelas
Orçamento gratuito
Guincho parceiro`,

    imobiliaria: `Horário: Segunda a Sábado, 9h às 18h
Endereço: Av. das Imobiliárias, 200

Serviços:
- Venda de imóveis
- Locação residencial e comercial
- Avaliação de imóveis
- Administração de condomínios

Regiões atendidas: [sua região]
CRECI: 12345-J`,
  };

  return placeholders[type || ""] || `Descreva seu negócio aqui:

- Horário de funcionamento
- Endereço/localização  
- Produtos ou serviços oferecidos
- Preços principais
- Formas de pagamento
- Promoções ou diferenciais
- Contatos adicionais

Quanto mais detalhes, melhor o prompt!`;
}
