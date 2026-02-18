import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { 
  Ticket, 
  MessageCircle, 
  HelpCircle, 
  BookOpen, 
  Video, 
  Mail,
  ChevronRight,
  ExternalLink
} from "lucide-react";
import { Link } from "wouter";

export default function Support() {
  const { toast } = useToast();
  const [form, setForm] = useState({ 
    name: "", 
    email: "", 
    subject: "", 
    message: "" 
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.name || !form.email || !form.subject || !form.message) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos para enviar.",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    // Simular envio
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    toast({
      title: "Mensagem enviada!",
      description: "Nossa equipe responderá em até 24 horas.",
    });
    
    setForm({ name: "", email: "", subject: "", message: "" });
    setIsSubmitting(false);
  };
  
  const quickLinks = [
    { 
      icon: Ticket, 
      label: "Meus Tickets", 
      description: "Acompanhar chamados",
      href: "/tickets",
      color: "text-blue-600",
      bgColor: "bg-blue-50"
    },
    { 
      icon: BookOpen, 
      label: "Documentação", 
      description: "Guias e tutoriais",
      href: "#",
      external: true,
      color: "text-green-600",
      bgColor: "bg-green-50"
    },
    { 
      icon: Video, 
      label: "Videoaulas", 
      description: "Aprenda assistindo",
      href: "#",
      external: true,
      color: "text-purple-600",
      bgColor: "bg-purple-50"
    },
    { 
      icon: HelpCircle, 
      label: "FAQ", 
      description: "Perguntas frequentes",
      href: "#",
      color: "text-orange-600",
      bgColor: "bg-orange-50"
    },
  ];
  
  const faqItems = [
    {
      question: "Como conectar meu WhatsApp?",
      answer: "Acesse a página 'Conexão' no menu, clique em 'Conectar WhatsApp' e escaneie o QR Code com seu celular."
    },
    {
      question: "Posso usar mais de um número?",
      answer: "Sim! Você pode adicionar vários números de WhatsApp na sua conta."
    },
    {
      question: "Como funciona a IA?",
      answer: "A IA responde automaticamente às mensagens baseada nas regras que você configura no 'Meu Agente IA'."
    },
  ];

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Central de Suporte</h1>
          <p className="text-muted-foreground">
            Como podemos ajudar você hoje?
          </p>
        </div>

        {/* Quick Links Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickLinks.map((link) => (
            <Link key={link.label} href={link.href}>
              <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
                <CardContent className="p-4 flex flex-col items-center text-center space-y-2">
                  <div className={`w-12 h-12 rounded-full ${link.bgColor} flex items-center justify-center`}>
                    <link.icon className={`w-6 h-6 ${link.color}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{link.label}</p>
                    <p className="text-xs text-muted-foreground">{link.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Contact Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Fale Conosco
              </CardTitle>
              <CardDescription>
                Envie uma mensagem para nossa equipe
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nome</label>
                    <Input 
                      placeholder="Seu nome" 
                      value={form.name} 
                      onChange={e => setForm({...form, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input 
                      placeholder="seu@email.com" 
                      type="email"
                      value={form.email} 
                      onChange={e => setForm({...form, email: e.target.value})}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Assunto</label>
                  <Input 
                    placeholder="Sobre o que é sua dúvida?" 
                    value={form.subject} 
                    onChange={e => setForm({...form, subject: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Mensagem</label>
                  <Textarea 
                    placeholder="Descreva sua dúvida ou problema..."
                    rows={4}
                    value={form.message} 
                    onChange={e => setForm({...form, message: e.target.value})}
                  />
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Enviando..." : "Enviar Mensagem"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* FAQ Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5" />
                Perguntas Frequentes
              </CardTitle>
              <CardDescription>
                Respostas rápidas para dúvidas comuns
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {faqItems.map((item, index) => (
                <div key={index} className="border-b border-border/50 last:border-0 pb-4 last:pb-0">
                  <h4 className="font-medium text-sm mb-1">{item.question}</h4>
                  <p className="text-sm text-muted-foreground">{item.answer}</p>
                </div>
              ))}
              
              <Link href="#">
                <Button variant="outline" className="w-full mt-2">
                  Ver todas as perguntas
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* WhatsApp Support Banner */}
        <Card className="bg-gradient-to-r from-green-500 to-emerald-600 text-white border-0">
          <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <MessageCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Atendimento via WhatsApp</h3>
                <p className="text-white/80">Resposta mais rápida para questões urgentes</p>
              </div>
            </div>
            <a 
              href="https://wa.me/5511999999999" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <Button variant="secondary" className="bg-white text-green-600 hover:bg-white/90">
                Iniciar Conversa
                <ExternalLink className="w-4 h-4 ml-2" />
              </Button>
            </a>
          </CardContent>
        </Card>

        {/* Footer Info */}
        <div className="text-center text-sm text-muted-foreground space-y-1">
          <p>Horário de atendimento: Segunda a Sexta, 9h às 18h</p>
          <p>Email: suporte@agentezap.com</p>
        </div>
      </div>
    </div>
  );
}
