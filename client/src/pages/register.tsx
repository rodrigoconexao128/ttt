import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // Se usuário já estiver logado, redirecionar para dashboard
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Usuário já está logado, redirecionar para dashboard
          setLocation("/dashboard");
        }
      } catch {}
    })();
  }, [setLocation]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Captura o slug do plano salvo no sessionStorage (se veio de link /p/:slug)
      const planLinkSlug = sessionStorage.getItem("plan_link_slug");
      
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email, 
          password, 
          name, 
          phone,
          planLinkSlug // Envia o slug para associar ao plano
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: "Erro ao criar conta",
          description: data.message || "Ocorreu um erro ao criar sua conta",
          variant: "destructive",
        });
        return;
      }

      // Limpa o slug após usar
      sessionStorage.removeItem("plan_link_slug");

      toast({
        title: "Conta criada com sucesso!",
        description: "Fazendo login...",
      });

      // Dispara evento de conversão para GTM/GA4/Google Ads diretamente no dataLayer global
      if (typeof window !== "undefined") {
        const w = window as any;
        w.dataLayer = w.dataLayer || [];
        w.dataLayer.push({
          event: "signup_complete",
          email,
          phone,
          source: "landing_cadastro",
        });
      }

      // Após criar o usuário via API (admin), autentica no cliente
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError || !loginData?.session) {
        // Se por algum motivo não logar, direciona para a tela de login
        toast({
          title: "Conta criada",
          description: "Finalize entrando com seu email e senha.",
        });
        setLocation("/login");
        return;
      }

      // Agora autenticado no cliente, atualiza cache e vai para configurar IA
      // 🚀 UX OTIMIZADO: Vai direto para configurar o agente IA 
      // Menos passos = mais conversão (Eye-Tracking: foco na ação principal)
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setLocation("/meu-agente-ia");
    } catch (error) {
      console.error("Erro ao criar conta:", error);
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao criar sua conta. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 flex flex-col items-center">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="w-8 h-8 text-primary" />
            <span className="font-semibold text-2xl">AgenteZap</span>
          </div>
          <CardTitle className="text-2xl">Criar Conta</CardTitle>
          <CardDescription>
            Preencha os dados abaixo para começar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome Completo</Label>
              <Input
                id="name"
                type="text"
                placeholder="Seu nome completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Celular WhatsApp do seu negócio</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="11999999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Criando conta..." : "Criar Conta"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <span className="text-muted-foreground">Já tem conta? </span>
            <button
              onClick={() => setLocation("/login")}
              className="text-primary hover:underline font-medium"
            >
              Faça login
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
