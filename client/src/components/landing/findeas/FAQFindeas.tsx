import { useState } from "react";
import { 
  ChevronDown, 
  ChevronUp, 
  MessageCircle, 
  Bot, 
  Shield, 
  Zap,
  Clock,
  DollarSign,
  Users,
  CheckCircle2,
  HelpCircle
} from "lucide-react";

export default function FAQFindeas() {
  const [activeCategory, setActiveCategory] = useState("geral");
  const [expandedItems, setExpandedItems] = useState<number[]>([]);

  const categories = [
    { id: "geral", name: "Geral", icon: HelpCircle },
    { id: "tecnico", name: "Técnico", icon: Bot },
    { id: "pagamento", name: "Pagamento", icon: DollarSign },
    { id: "suporte", name: "Suporte", icon: MessageCircle }
  ];

  const faqData = {
    geral: [
      {
        question: "Como funciona o AgenteZap?",
        answer: "O AgenteZap utiliza IA avançada para automatizar suas conversas no WhatsApp. Ele responde perguntas, qualifica leads, agenda reuniões e até mesmo vende produtos 24/7, sem precisar de intervenção humana.",
        icon: Bot
      },
      {
        question: "Quanto tempo leva para configurar?",
        answer: "O setup inicial leva em média 2 minutos! Basta conectar seu número do WhatsApp, personalizar as respostas básicas e a IA já começa a atender imediatamente.",
        icon: Clock
      },
      {
        question: "Preciso de conhecimento técnico?",
        answer: "Não! Nossa plataforma foi desenvolvida para ser intuitiva. Você não precisa saber programar ou ter conhecimentos técnicos. Oferecemos vídeos tutoriais e suporte completo.",
        icon: Users
      },
      {
        question: "Posso usar com meu número atual do WhatsApp?",
        answer: "Sim! O AgenteZap funciona perfeitamente com seu número WhatsApp atual, seja ele pessoal ou comercial. Mantemos a segurança e integridade da sua conta.",
        icon: Shield
      }
    ],
    tecnico: [
      {
        question: "A IA comete muitos erros?",
        answer: "Nossa IA tem 98% de precisão e aprende continuamente com suas conversas. Ela reconhece contexto, linguagem informal e até gírias regionais. Monitoramos e ajustamos constantemente.",
        icon: CheckCircle2
      },
      {
        question: "Funciona com múltiplos atendentes?",
        answer: "Sim! Você pode configurar transferências automáticas para atendentes humanos quando necessário. A IA qualifica o cliente e só transfere quando realmente preciso.",
        icon: Users
      },
      {
        question: "Integra com outras ferramentas?",
        answer: "Sim! Integramos com CRM, sistemas de agendamento, e-commerce e mais. Nossa API permite conexão com praticamente qualquer sistema que você já use.",
        icon: Zap
      }
    ],
    pagamento: [
      {
        question: "Quais são os planos disponíveis?",
        answer: "Temos o Plano Starter por R$97/mês (até 1.000 contatos/mês) e o Professional por R$197/mês (ilimitado + recursos avançados). Ambos incluem setup gratuito.",
        icon: DollarSign
      },
      {
        question: "Posso cancelar quando quiser?",
        answer: "Sim! Cancelamento simples e sem multa. Se não ficar satisfeito, pode cancelar a qualquer momento diretamente pelo painel. Não prendemos ninguém.",
        icon: Shield
      },
      {
        question: "Aceitamos cartão de crédito?",
        answer: "Aceitamos cartão de crédito, débito, PIX e boleto. Todas as transações são processadas com segurança via plataforma certificada.",
        icon: CheckCircle2
      }
    ],
    suporte: [
      {
        question: "Que tipo de suporte oferecem?",
        answer: "Oferecemos suporte 24/7 por WhatsApp, e-mail e telefone. Clientes Professional têm consultor dedicado e tempo de resposta prioritário (máximo 1 hora).",
        icon: MessageCircle
      },
      {
        question: "E se eu tiver problemas técnicos?",
        answer: "Nossa equipe técnica está sempre disponível. Resolvemos 95% dos problemas na primeira chamada. Monitoramento proativo detecta issues antes que você perceba.",
        icon: Zap
      },
      {
        question: "Oferecem treinamento?",
        answer: "Sim! Todos os planos incluem acesso gratuito à nossa academia online com vídeos tutoriais, webinars semanais e materiais para dominar a plataforma.",
        icon: Users
      }
    ]
  };

  const toggleExpand = (index: number) => {
    setExpandedItems(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const currentFAQs = faqData[activeCategory as keyof typeof faqData] || faqData.geral;

  return (
    <section className="py-20 bg-neutral-50">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold text-neutral-900 mb-6">
              Dúvidas que{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">realmente importam</span>
            </h2>
            <p className="text-xl text-neutral-600 max-w-3xl mx-auto">
              Respostas diretas para as perguntas mais comuns sobre o AgenteZap
            </p>
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap justify-center gap-2 mb-12">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300 ${
                    activeCategory === category.id
                      ? 'bg-primary text-white shadow-lg'
                      : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {category.name}
                </button>
              );
            })}
          </div>

          {/* FAQ Items */}
          <div className="space-y-4 mb-16">
            {currentFAQs.map((faq, index) => {
              const isExpanded = expandedItems.includes(index);
              const Icon = faq.icon;
              
              return (
                <div 
                  key={index}
                  className="bg-white rounded-2xl border border-neutral-200 overflow-hidden hover:border-primary transition-all duration-300"
                >
                  <button
                    onClick={() => toggleExpand(index)}
                    className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-neutral-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="font-semibold text-neutral-900 text-lg pr-4">
                        {faq.question}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-neutral-500">
                        {isExpanded ? 'Menos' : 'Mais'}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-primary transition-transform duration-300" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-neutral-400 transition-transform duration-300" />
                      )}
                    </div>
                  </button>
                  
                  {isExpanded && (
                    <div className="px-6 pb-6 border-t border-neutral-100">
                      <div className="pt-4 pl-16">
                        <p className="text-neutral-700 leading-relaxed">
                          {faq.answer}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* CTA Section */}
          <div className="bg-gradient-to-br from-primary to-accent rounded-3xl p-12 text-center text-white">
            <div className="max-w-3xl mx-auto">
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <MessageCircle className="w-10 h-10 text-white" />
                </div>
              </div>
              
              <h3 className="text-3xl lg:text-4xl font-bold mb-6">
                Não encontrou sua dúvida?
              </h3>
              <p className="text-xl mb-8 text-white/90">
                Nossa equipe de especialistas está pronta para ajudar você
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <a 
                  href="https://wa.me/5511999999999?text=Ol%C3%A1%20Tenho%20uma%20d%C3%BAvida%20sobre%20o%20AgenteZap"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 bg-white hover:bg-neutral-100 text-primary px-8 py-4 rounded-2xl text-lg font-bold shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
                >
                  <MessageCircle className="w-6 h-6" />
                  Falar com Especialista
                  <CheckCircle2 className="w-5 h-5" />
                </a>
                
                <div className="flex items-center gap-2 text-white/80">
                  <Clock className="w-5 h-5" />
                  <span className="text-sm">Resposta em até 1 hora</span>
                </div>
              </div>
              
              {/* Quick Links */}
              <div className="flex flex-wrap justify-center gap-6 mt-8">
                <a href="#docs" className="text-white/80 hover:text-white transition-colors text-sm">
                  📚 Documentação Completa
                </a>
                <a href="#tutorials" className="text-white/80 hover:text-white transition-colors text-sm">
                  🎥 Vídeos Tutoriais
                </a>
                <a href="#webinars" className="text-white/80 hover:text-white transition-colors text-sm">
                  📺 Webinars Semanais
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
