import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useLocation } from "wouter";
import { Brain, Flame, Snowflake, Sun, MessageSquare } from "lucide-react";
import PremiumBlocked from "@/components/premium-overlay";

type Lead = {
  id: string;
  nome: string;
  telefone: string;
  etiquetas: string[];
  score: "quente" | "morno" | "frio";
  ultimoEvento: string;
  resumoIA: string;
};

const MOCK_LEADS: Lead[] = [
  {
    id: "LD-101",
    nome: "Marina Costa",
    telefone: "+55 11 98877-1122",
    etiquetas: ["VIP", "SP"],
    score: "quente",
    ultimoEvento: "Respondeu: 'podemos fechar hoje'",
    resumoIA: "Demonstrou forte intenção de compra; pediu forma de pagamento.",
  },
  {
    id: "LD-102",
    nome: "João Pereira",
    telefone: "+55 21 99988-6622",
    etiquetas: ["RJ"],
    score: "morno",
    ultimoEvento: "Leu a mensagem, sem resposta há 8h",
    resumoIA: "Interesse moderado; aguarda proposta detalhada.",
  },
  {
    id: "LD-103",
    nome: "Paula Lima",
    telefone: "+55 31 97777-3333",
    etiquetas: ["MG"],
    score: "frio",
    ultimoEvento: "Mensagem automática entregue e não lida",
    resumoIA: "Baixo engajamento recente; sugerir nova abordagem.",
  },
  {
    id: "LD-104",
    nome: "AgroMix LTDA",
    telefone: "+55 62 91234-5566",
    etiquetas: ["B2B", "Agro"],
    score: "morno",
    ultimoEvento: "Solicitou material técnico",
    resumoIA: "Avaliação em curso; probabilidade média no curto prazo.",
  },
  {
    id: "LD-105",
    nome: "Larissa Prado",
    telefone: "+55 41 98812-1234",
    etiquetas: ["PR"],
    score: "quente",
    ultimoEvento: "Confirmou reunião amanhã",
    resumoIA: "Alta propensão; recomenda contato rápido do vendedor.",
  },
];

export default function LeadQualificationPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"todos" | "quente" | "morno" | "frio">("todos");

  const requireSubscription = () =>
    toast({
      title: "Recurso Premium",
      description:
        "Esta funcionalidade requer assinatura de um plano. Por favor, assine um plano para ter acesso.",
      action: (
        <ToastAction altText="Ver Planos" onClick={() => setLocation("/plans")}>
          Ver Planos
        </ToastAction>
      ),
    });

  const filtered = useMemo(() => {
    return MOCK_LEADS.filter((l) =>
      (filter === "todos" || l.score === filter) &&
      (l.nome.toLowerCase().includes(query.toLowerCase()) ||
        l.telefone.includes(query))
    );
  }, [query, filter]);

  const scoreBadge = (score: Lead["score"]) => {
    if (score === "quente") return <Badge className="bg-red-100 text-red-700 border-red-200"><Flame className="w-3 h-3 mr-1"/>Quente</Badge>;
    if (score === "morno") return <Badge className="bg-amber-100 text-amber-800 border-amber-200"><Sun className="w-3 h-3 mr-1"/>Morno</Badge>;
    return <Badge className="bg-blue-100 text-blue-700 border-blue-200"><Snowflake className="w-3 h-3 mr-1"/>Frio</Badge>;
  };

  return (
    <PremiumBlocked
      title="Continue Qualificando Leads"
      subtitle="Seu período de teste acabou"
      description="Assine um plano para continuar usando a qualificação automática de leads por IA e priorizar seus melhores contatos."
      ctaLabel="Ativar Plano Ilimitado"
    >
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold">Qualificação de Lead</h1>
            <p className="text-muted-foreground flex items-center gap-2">
              <Brain className="w-4 h-4" />
              Nossa IA analisa as conversas do WhatsApp e classifica automaticamente cada contato como
              quente, morno ou frio para priorização do atendimento.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={requireSubscription}>Atualizar com IA</Button>
            <Button variant="outline" onClick={requireSubscription}>Exportar</Button>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="flex items-center gap-2">
                <Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Buscar por nome ou telefone" />
              </div>
              <div className="flex items-center gap-2">
                <select value={filter} onChange={(e)=>setFilter(e.target.value as any)} className="border rounded-md px-3 py-2 text-sm w-full">
                  <option value="todos">Todos</option>
                  <option value="quente">Quentes</option>
                  <option value="morno">Mornos</option>
                  <option value="frio">Frios</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {(["quente","morno","frio"] as const).map((bucket) => (
                <Card key={bucket} className="border-dashed">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      {bucket === "quente" && <Flame className="w-4 h-4 text-red-600"/>}
                      {bucket === "morno" && <Sun className="w-4 h-4 text-amber-600"/>}
                      {bucket === "frio" && <Snowflake className="w-4 h-4 text-blue-600"/>}
                      {bucket === "quente" ? "Leads Quentes" : bucket === "morno" ? "Leads Mornos" : "Leads Frios"}
                    </CardTitle>
                    <CardDescription>{MOCK_LEADS.filter(l=>l.score===bucket).length} encontrados</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {filtered.filter(l=>l.score===bucket).map((lead)=> (
                      <article key={lead.id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold">{lead.nome}</p>
                            <p className="text-xs text-muted-foreground">{lead.telefone}</p>
                          </div>
                          {scoreBadge(lead.score)}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{lead.ultimoEvento}</p>
                        <p className="mt-1 text-xs">{lead.resumoIA}</p>
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" variant="outline" onClick={requireSubscription}>
                            <MessageSquare className="w-3 h-3 mr-1"/> Ver conversa
                          </Button>
                          <Button size="sm" onClick={requireSubscription}>Entrar em contato</Button>
                          <Button size="sm" variant="ghost" onClick={requireSubscription}>Reclassificar</Button>
                        </div>
                      </article>
                    ))}
                    {filtered.filter(l=>l.score===bucket).length===0 && (
                      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground text-center">Nenhum lead aqui com os filtros atuais.</div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </PremiumBlocked>
  );
}
