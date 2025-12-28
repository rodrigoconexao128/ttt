import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Sparkles, Loader2, ArrowRight, ArrowLeft, Bot, Store, 
  Building2, Utensils, ShoppingBag, Briefcase, Heart, Car,
  GraduationCap, Home, Plane, Dumbbell, Scissors, Stethoscope,
  Wand2, CheckCircle2, Pizza, Coffee, Search,
  Shirt, Gem, Wrench, Hammer, Palette, Camera, Music, Gamepad2,
  Baby, Dog, Flower2, Cake, Wine, Beer, IceCream, Truck, Package,
  Smartphone, Laptop, Headphones, Watch, Glasses, Pill, Syringe,
  TestTube, Brain, Scale, Gavel, FileText, PenTool, Megaphone,
  TrendingUp, Users, Handshake, Award, Target, Zap, Cpu, Database,
  Cloud, Lock, Shield, Globe, MapPin, Building, Factory, Warehouse,
  ShoppingCart, CreditCard, Banknote, Receipt,
  ClipboardList, Calendar, Clock, Phone, Mail, MessageCircle,
  Video, Mic, Radio, Tv, BookOpen, Library, PenLine, Edit3
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface PromptGeneratorProps {
  onPromptGenerated: (prompt: string) => void;
  onSkip: () => void;
}

// TODOS os tipos de negócio misturados (sem categorias)
// Ordenados alfabeticamente para facilitar encontrar
const allBusinessTypes = [
  { id: "academia", label: "Academia", icon: Dumbbell },
  { id: "advogado", label: "Advogado", icon: Gavel },
  { id: "afiliado", label: "Afiliado Digital", icon: TrendingUp },
  { id: "agencia_viagem", label: "Agência de Viagens", icon: Plane },
  { id: "apps", label: "Apps", icon: Smartphone },
  { id: "ar_condicionado", label: "Ar Condicionado", icon: Wrench },
  { id: "arquiteto", label: "Arquiteto", icon: Building2 },
  { id: "artes_marciais", label: "Artes Marciais", icon: Dumbbell },
  { id: "assistencia_tecnica", label: "Assistência Técnica", icon: Smartphone },
  { id: "autoescola", label: "Autoescola", icon: Car },
  { id: "bar", label: "Bar/Pub", icon: Beer },
  { id: "barbearia", label: "Barbearia", icon: Scissors },
  { id: "brinquedos", label: "Brinquedos", icon: Baby },
  { id: "buffet", label: "Buffet", icon: Cake },
  { id: "cafeteria", label: "Cafeteria", icon: Coffee },
  { id: "cartorio", label: "Cartório/Despachante", icon: FileText },
  { id: "chaveiro", label: "Chaveiro", icon: Lock },
  { id: "clinica_estetica", label: "Clínica Estética", icon: Heart },
  { id: "clinica_medica", label: "Clínica Médica", icon: Stethoscope },
  { id: "cloud", label: "Cloud/TI", icon: Cloud },
  { id: "coaching", label: "Coach/Mentor", icon: Target },
  { id: "comunidade", label: "Comunidade Online", icon: Users },
  { id: "concursos", label: "Preparatório", icon: Library },
  { id: "construtora", label: "Construtora", icon: Building },
  { id: "consultoria", label: "Consultoria", icon: TrendingUp },
  { id: "contador", label: "Contador", icon: Receipt },
  { id: "crossfit", label: "CrossFit", icon: Dumbbell },
  { id: "curso_idiomas", label: "Idiomas", icon: Globe },
  { id: "curso_informatica", label: "Informática", icon: Laptop },
  { id: "danca", label: "Escola de Dança", icon: Music },
  { id: "decoracao", label: "Decoração de Festas", icon: Sparkles },
  { id: "dentista", label: "Dentista", icon: Stethoscope },
  { id: "desenvolvimento", label: "Desenvolvimento", icon: Cpu },
  { id: "desentupidora", label: "Desentupidora", icon: Wrench },
  { id: "designer_interiores", label: "Design de Interiores", icon: Palette },
  { id: "dj", label: "DJ/Som", icon: Headphones },
  { id: "doceria", label: "Doceria/Confeitaria", icon: Cake },
  { id: "dropshipping", label: "Dropshipping", icon: Package },
  { id: "ecommerce", label: "E-commerce", icon: ShoppingCart },
  { id: "eletricista", label: "Eletricista", icon: Zap },
  { id: "encanador", label: "Encanador", icon: Wrench },
  { id: "escola", label: "Escola", icon: GraduationCap },
  { id: "espacos", label: "Espaço para Eventos", icon: Building },
  { id: "eventos", label: "Eventos", icon: Calendar },
  { id: "farmacia", label: "Farmácia", icon: Pill },
  { id: "financeiro", label: "Assessoria Financeira", icon: Banknote },
  { id: "fisioterapeuta", label: "Fisioterapeuta", icon: Heart },
  { id: "floricultura", label: "Floricultura", icon: Flower2 },
  { id: "fotografo", label: "Fotógrafo", icon: Camera },
  { id: "funeraria", label: "Funerária", icon: Heart },
  { id: "gesso", label: "Gesso/Drywall", icon: Building2 },
  { id: "grafica", label: "Gráfica", icon: PenTool },
  { id: "guia", label: "Guia Turístico", icon: MapPin },
  { id: "hamburgueria", label: "Hamburgueria", icon: Utensils },
  { id: "hotel", label: "Hotel/Pousada", icon: Building },
  { id: "imobiliaria", label: "Imobiliária", icon: Home },
  { id: "infoprodutor", label: "Infoprodutor", icon: BookOpen },
  { id: "influencer", label: "Influencer", icon: Megaphone },
  { id: "joalheria", label: "Joalheria", icon: Gem },
  { id: "laboratorio", label: "Laboratório", icon: TestTube },
  { id: "lanchonete", label: "Lanchonete", icon: Coffee },
  { id: "lavanderia", label: "Lavanderia", icon: Shirt },
  { id: "limpeza", label: "Limpeza", icon: Sparkles },
  { id: "livraria", label: "Livraria", icon: BookOpen },
  { id: "locacao", label: "Locação", icon: Package },
  { id: "loja_calcados", label: "Calçados", icon: ShoppingBag },
  { id: "loja_construcao", label: "Materiais Construção", icon: Warehouse },
  { id: "loja_eletronicos", label: "Eletrônicos", icon: Smartphone },
  { id: "loja_esportiva", label: "Loja Esportiva", icon: Shirt },
  { id: "loja_moveis", label: "Móveis", icon: Home },
  { id: "loja_roupa", label: "Roupas", icon: Shirt },
  { id: "loja_suplementos", label: "Suplementos", icon: Pill },
  { id: "marceneiro", label: "Marceneiro", icon: Hammer },
  { id: "marketing", label: "Marketing Digital", icon: Megaphone },
  { id: "marmitex", label: "Marmitaria", icon: Package },
  { id: "mentor", label: "Mentoria Online", icon: Video },
  { id: "mudanca", label: "Mudanças/Frete", icon: Truck },
  { id: "musica", label: "Escola de Música", icon: Music },
  { id: "natacao", label: "Natação", icon: Dumbbell },
  { id: "nutricionista", label: "Nutricionista", icon: Scale },
  { id: "oficina", label: "Oficina Mecânica", icon: Wrench },
  { id: "otica", label: "Ótica", icon: Glasses },
  { id: "padaria", label: "Padaria", icon: Cake },
  { id: "papelaria", label: "Papelaria", icon: PenLine },
  { id: "personal", label: "Personal Trainer", icon: Dumbbell },
  { id: "petshop", label: "Pet Shop", icon: Dog },
  { id: "pilates", label: "Pilates/Yoga", icon: Heart },
  { id: "pintor", label: "Pintor", icon: Palette },
  { id: "pizzaria", label: "Pizzaria", icon: Pizza },
  { id: "podcast", label: "Podcast", icon: Mic },
  { id: "psicologo", label: "Psicólogo", icon: Brain },
  { id: "reforco", label: "Reforço Escolar", icon: BookOpen },
  { id: "relojoaria", label: "Relojoaria", icon: Watch },
  { id: "restaurante", label: "Restaurante", icon: Utensils },
  { id: "rh", label: "RH/Recrutamento", icon: Users },
  { id: "salao", label: "Salão de Beleza", icon: Scissors },
  { id: "seguranca_ti", label: "Segurança TI", icon: Shield },
  { id: "seguros", label: "Seguros", icon: Shield },
  { id: "serralheria", label: "Serralheria", icon: Hammer },
  { id: "sites", label: "Criação de Sites", icon: Globe },
  { id: "sorveteria", label: "Sorveteria", icon: IceCream },
  { id: "spa", label: "SPA/Massagem", icon: Heart },
  { id: "studio_nail", label: "Nail Designer", icon: Palette },
  { id: "studio_sobrancelha", label: "Sobrancelhas", icon: PenTool },
  { id: "supermercado", label: "Supermercado", icon: ShoppingCart },
  { id: "ti", label: "Suporte TI", icon: Laptop },
  { id: "transfer", label: "Transfer/Transporte", icon: Car },
  { id: "veterinario", label: "Veterinário", icon: Dog },
  { id: "videomaker", label: "Videomaker", icon: Video },
  { id: "vidracaria", label: "Vidraçaria", icon: Building2 },
  { id: "youtuber", label: "YouTuber/Criador", icon: Video },
  // SEMPRE manter "Outro" visível
  { id: "outro", label: "Outro Negócio", icon: Store },
];

export function PromptGenerator({ onPromptGenerated, onSkip }: PromptGeneratorProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"type" | "info" | "generating" | "done">("type");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [businessInfo, setBusinessInfo] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [customType, setCustomType] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filtra tipos de negócio baseado na busca
  const filteredTypes = useMemo(() => {
    if (!searchQuery.trim()) return allBusinessTypes;
    
    const query = searchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return allBusinessTypes.filter(type => {
      const label = type.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const id = type.id.toLowerCase();
      return label.includes(query) || id.includes(query);
    });
  }, [searchQuery]);

  // Foca na busca quando abre
  useEffect(() => {
    if (step === "type" && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [step]);

  const handleSelectType = (typeId: string) => {
    setSelectedType(typeId);
    setStep("info");
  };

  const handleCustomType = () => {
    if (customType.trim()) {
      setSelectedType(customType);
      setStep("info");
    }
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
        throw new Error("Não foi possível criar as instruções");
      }
    } catch (error) {
      console.error("Error generating prompt:", error);
      // Fallback: gerar localmente
      const fallbackPrompt = generateLocalPrompt();
      setGeneratedPrompt(fallbackPrompt);
      setStep("done");
    } finally {
      setIsGenerating(false);
    }
  };

  const generateLocalPrompt = () => {
    const typeName = allBusinessTypes.find(t => t.id === selectedType)?.label || selectedType || "seu negócio";
    
    return `Você é o assistente virtual de atendimento do **${businessName}**.

📋 **PERSONALIDADE:**
- Seja simpático, profissional e objetivo
- Use emojis com moderação 
- Responda de forma rápida e eficiente
- Mantenha um tom amigável mas profissional

🏪 **SOBRE O NEGÓCIO:**
- Nome: ${businessName}
- Tipo: ${typeName}
${businessInfo ? `- Informações: ${businessInfo}` : ''}

## ✅ O QUE FAZER
- Sempre cumprimente o cliente de forma calorosa
- Responda dúvidas sobre produtos/serviços
- Ajude com agendamentos e pedidos
- Informe horários e formas de pagamento
- Seja prestativo e resolva problemas

## ❌ O QUE NÃO FAZER
- Nunca seja rude ou impaciente
- Não invente informações
- Não faça promessas que não pode cumprir
- Não discuta assuntos polêmicos

## 💡 DICAS
- Para pedidos complexos, confirme os detalhes
- Se não souber algo, ofereça buscar a informação
- Encaminhe para atendente humano quando necessário

Lembre-se: você representa o ${businessName}!`;
  };

  const handleFinish = () => {
    onPromptGenerated(generatedPrompt);
  };

  const getPlaceholder = () => {
    const type = allBusinessTypes.find(t => t.id === selectedType);
    const placeholders: Record<string, string> = {
      pizzaria: "Ex: Temos pizzas tradicionais e gourmet, com borda recheada. Horário: 18h às 00h. Delivery disponível.",
      restaurante: "Ex: Especializado em comida italiana, almoço executivo R$35. Reservas pelo WhatsApp.",
      salao: "Ex: Corte feminino R$80, masculino R$45. Agendamento online disponível. 10 anos de experiência.",
      advogado: "Ex: Especialista em direito trabalhista e previdenciário. OAB/SP 123456. Primeira consulta grátis.",
      clinica_medica: "Ex: Clínica geral, pediatria e dermatologia. Convênios: Unimed, SulAmérica. Horário: 8h às 18h.",
    };
    return placeholders[selectedType || ""] || "Descreva produtos, serviços, preços, horários, diferenciais...";
  };

  // =================== STEP: ESCOLHER TIPO ===================
  if (step === "type") {
    return (
      <div className="space-y-6 py-4">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 mb-2">
            <Wand2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Vamos criar seu Agente IA</h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Qual é o tipo do seu negócio? A IA vai personalizar as instruções de atendimento.
          </p>
        </div>

        {/* Busca */}
        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Buscar tipo de negócio..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 text-base"
          />
        </div>

        {/* Grid de tipos */}
        <div className="max-h-[45vh] overflow-y-auto px-1">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {filteredTypes.map((type) => {
              const IconComponent = type.icon;
              const isOther = type.id === "outro";
              return (
                <button
                  key={type.id}
                  onClick={() => handleSelectType(type.id)}
                  className={`
                    flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl
                    border-2 transition-all duration-200 min-h-[80px]
                    hover:border-primary hover:bg-primary/5 hover:scale-[1.02]
                    ${isOther ? 'border-dashed border-muted-foreground/50 bg-muted/30' : 'border-border bg-card'}
                  `}
                >
                  <IconComponent className={`w-6 h-6 ${isOther ? 'text-muted-foreground' : 'text-primary'}`} />
                  <span className={`text-xs text-center font-medium leading-tight ${isOther ? 'text-muted-foreground' : ''}`}>
                    {type.label}
                  </span>
                </button>
              );
            })}
          </div>

          {filteredTypes.length === 0 && (
            <div className="text-center py-8 space-y-3">
              <p className="text-muted-foreground">Nenhum tipo encontrado para "{searchQuery}"</p>
              <p className="text-sm text-muted-foreground">Mas não se preocupe! Digite abaixo:</p>
            </div>
          )}
        </div>

        {/* Campo para tipo personalizado */}
        <Card className="p-4 bg-muted/30 max-w-md mx-auto">
          <Label className="text-sm text-muted-foreground mb-2 block">
            Não encontrou? Digite seu tipo de negócio:
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder="Ex: Pet Sitter, Food Truck, Coworking..."
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCustomType()}
              className="flex-1"
            />
            <Button 
              onClick={handleCustomType}
              disabled={!customType.trim()}
              size="sm"
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>

        {/* Botão Pular - agora vai direto para edição manual */}
        <div className="flex justify-center pt-2">
          <Button 
            variant="ghost" 
            onClick={onSkip}
            className="text-muted-foreground hover:text-foreground gap-2"
          >
            <Edit3 className="w-4 h-4" />
            Prefiro escrever do zero
          </Button>
        </div>
      </div>
    );
  }

  // =================== STEP: INFORMAÇÕES ===================
  if (step === "info") {
    const selectedTypeInfo = allBusinessTypes.find(t => t.id === selectedType);
    const IconComponent = selectedTypeInfo?.icon || Store;
    
    return (
      <div className="space-y-6 py-4">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5">
            <IconComponent className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-bold">Conte sobre seu negócio</h2>
          <p className="text-muted-foreground text-sm">
            Tipo: <span className="font-medium text-foreground">{selectedTypeInfo?.label || selectedType}</span>
          </p>
        </div>

        {/* Formulário */}
        <div className="space-y-4 max-w-md mx-auto">
          <div className="space-y-2">
            <Label htmlFor="businessName" className="text-sm font-medium">
              Nome do negócio *
            </Label>
            <Input
              id="businessName"
              placeholder="Ex: Pizzaria Bella Napoli"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="h-12 text-base"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="businessInfo" className="text-sm font-medium">
              Informações importantes (opcional)
            </Label>
            <Textarea
              id="businessInfo"
              placeholder={getPlaceholder()}
              value={businessInfo}
              onChange={(e) => setBusinessInfo(e.target.value)}
              className="min-h-[120px] resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Quanto mais detalhes, melhor será o atendimento do seu agente!
            </p>
          </div>
        </div>

        {/* Botões */}
        <div className="flex gap-3 max-w-md mx-auto">
          <Button 
            variant="outline" 
            onClick={() => setStep("type")}
            className="flex-1 gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <Button 
            onClick={generatePrompt}
            disabled={!businessName.trim()}
            className="flex-1 gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Criar Instruções
          </Button>
        </div>
      </div>
    );
  }

  // =================== STEP: GERANDO ===================
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
          <h3 className="text-lg font-semibold">Criando instruções do agente...</h3>
          <p className="text-sm text-muted-foreground">
            A IA está personalizando o atendimento para {businessName}
          </p>
        </div>
      </div>
    );
  }

  // =================== STEP: CONCLUÍDO ===================
  if (step === "done") {
    return (
      <div className="space-y-6 py-4">
        {/* Header de sucesso */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-500/10">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-xl font-bold">Instruções criadas!</h2>
          <p className="text-muted-foreground text-sm">
            Revise e personalize se quiser. Você pode editar a qualquer momento.
          </p>
        </div>

        {/* Preview */}
        <Card className="p-4 bg-muted/30 max-w-lg mx-auto">
          <div className="max-h-[300px] overflow-y-auto">
            <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">
              {generatedPrompt}
            </pre>
          </div>
        </Card>

        {/* Botões */}
        <div className="flex gap-3 max-w-md mx-auto">
          <Button 
            variant="outline" 
            onClick={() => setStep("info")}
            className="flex-1 gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <Button 
            onClick={handleFinish}
            className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
          >
            <CheckCircle2 className="w-4 h-4" />
            Usar e Continuar
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Você poderá editar e melhorar as instruções depois
        </p>
      </div>
    );
  }

  return null;
}
