import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useLocation } from "wouter";
import { Plug } from "lucide-react";
import PremiumBlocked from "@/components/premium-overlay";

type Integration = {
  name: string;
  desc: string;
  category: "ERP" | "E-commerce" | "Marketplace" | "Mensageria" | "Automação" | "Pagamentos" | "Analytics" | "Marketing" | "Logística" | "Outros";
  region: "BR" | "Global";
  status: "disponivel" | "em-breve";
};

const INTEGRATIONS: Integration[] = [
  // ERPs populares no Brasil
  { name: "TOTVS Protheus", desc: "ERP líder no Brasil – APIs REST/Bridge", category: "ERP", region: "BR", status: "disponivel" },
  { name: "TOTVS Datasul", desc: "ERP TOTVS para indústria – integrações", category: "ERP", region: "BR", status: "disponivel" },
  { name: "Linx ERP", desc: "ERP/retail muito usado em varejo", category: "ERP", region: "BR", status: "disponivel" },
  { name: "Omie", desc: "Financeiro, vendas e NFe – API REST", category: "ERP", region: "BR", status: "disponivel" },
  { name: "Bling", desc: "Pedidos, NFe e contatos – API REST", category: "ERP", region: "BR", status: "disponivel" },
  { name: "Tiny ERP", desc: "E‑commerce, fiscal e estoque – REST", category: "ERP", region: "BR", status: "disponivel" },
  { name: "Conta Azul", desc: "Vendas e financeiro – API REST", category: "ERP", region: "BR", status: "disponivel" },
  { name: "Alterdata", desc: "ERP fiscal/contábil – integrações", category: "ERP", region: "BR", status: "disponivel" },
  { name: "Senior Sistemas", desc: "ERP/HR – integrações corporativas", category: "ERP", region: "BR", status: "disponivel" },
  { name: "VHSYS", desc: "ERP online – módulos de vendas", category: "ERP", region: "BR", status: "disponivel" },

  // E-commerce
  { name: "VTEX", desc: "OMS/Catalog – plataforma enterprise", category: "E-commerce", region: "BR", status: "disponivel" },
  { name: "Nuvemshop", desc: "Líder na AL – API pública", category: "E-commerce", region: "BR", status: "disponivel" },
  { name: "Tray", desc: "E‑commerce nacional com API", category: "E-commerce", region: "BR", status: "disponivel" },
  { name: "Loja Integrada", desc: "Plataforma brasileira – API REST", category: "E-commerce", region: "BR", status: "disponivel" },
  { name: "Shopify", desc: "Popular no BR – REST/GraphQL", category: "E-commerce", region: "Global", status: "disponivel" },
  { name: "WooCommerce", desc: "WordPress – REST por keys", category: "E-commerce", region: "Global", status: "disponivel" },
  { name: "Magento", desc: "Adobe Commerce – REST/GraphQL", category: "E-commerce", region: "Global", status: "disponivel" },

  // Marketplaces
  { name: "Mercado Livre", desc: "MLB – anúncios e pedidos", category: "Marketplace", region: "BR", status: "disponivel" },
  { name: "Magalu Marketplace", desc: "Marketplace Magazine Luiza", category: "Marketplace", region: "BR", status: "disponivel" },
  { name: "Americanas (B2W)", desc: "Marketplace Americanas", category: "Marketplace", region: "BR", status: "disponivel" },
  { name: "Via (Casas Bahia/Ponto)", desc: "Via Marketplace", category: "Marketplace", region: "BR", status: "disponivel" },
  { name: "Shopee", desc: "OpenAPI para sellers no BR", category: "Marketplace", region: "BR", status: "disponivel" },
  { name: "Amazon Brasil", desc: "SP‑API para sellers BR", category: "Marketplace", region: "BR", status: "disponivel" },

  // Mensageria
  { name: "WhatsApp Cloud API", desc: "Canal oficial Meta", category: "Mensageria", region: "Global", status: "disponivel" },
  { name: "Instagram DM", desc: "Graph API para mensagens", category: "Mensageria", region: "Global", status: "disponivel" },
  { name: "Facebook Messenger", desc: "Atendimento omnichannel", category: "Mensageria", region: "Global", status: "disponivel" },
  { name: "Telegram", desc: "Bots e notificações", category: "Mensageria", region: "Global", status: "disponivel" },
  { name: "Gmail/Outlook", desc: "E‑mail (IMAP/Graph)", category: "Mensageria", region: "Global", status: "disponivel" },

  // Automação
  { name: "Zapier", desc: "Fluxos com milhares de apps", category: "Automação", region: "Global", status: "disponivel" },
  { name: "Make (Integromat)", desc: "Cenários low‑code", category: "Automação", region: "Global", status: "disponivel" },
  { name: "n8n", desc: "Automação open‑source", category: "Automação", region: "Global", status: "disponivel" },

  // Pagamentos
  { name: "Mercado Pago", desc: "PIX, cartões e split", category: "Pagamentos", region: "BR", status: "disponivel" },
  { name: "PagSeguro", desc: "Checkout e assinaturas", category: "Pagamentos", region: "BR", status: "disponivel" },
  { name: "Pagar.me", desc: "Gateway/PSP brasileiro", category: "Pagamentos", region: "BR", status: "disponivel" },
  { name: "Asaas", desc: "Cobrança e recorrência", category: "Pagamentos", region: "BR", status: "disponivel" },
  { name: "Iugu", desc: "Billing e faturas", category: "Pagamentos", region: "BR", status: "disponivel" },
  { name: "Gerencianet (EFí)", desc: "PIX e cobranças", category: "Pagamentos", region: "BR", status: "disponivel" },
  { name: "Cielo", desc: "Adquirência e APIs", category: "Pagamentos", region: "BR", status: "disponivel" },
  { name: "Stone", desc: "Pagamentos e APIs", category: "Pagamentos", region: "BR", status: "disponivel" },

  // Analytics/BI
  { name: "Google Sheets", desc: "Planilhas e dashboards", category: "Analytics", region: "Global", status: "disponivel" },
  { name: "Looker Studio", desc: "Painéis e relatórios", category: "Analytics", region: "Global", status: "disponivel" },
  { name: "Power BI", desc: "BI corporativo", category: "Analytics", region: "Global", status: "disponivel" },

  // Marketing
  { name: "RD Station", desc: "Automação de Marketing (BR)", category: "Marketing", region: "BR", status: "disponivel" },
  { name: "Mailchimp", desc: "E‑mail marketing", category: "Marketing", region: "Global", status: "disponivel" },
  { name: "Meta Ads", desc: "Anúncios Facebook/Instagram", category: "Marketing", region: "Global", status: "disponivel" },
  { name: "Google Ads", desc: "Conversões e leads", category: "Marketing", region: "Global", status: "disponivel" },

  // Logística
  { name: "Correios", desc: "Cálculo de frete e rastreio", category: "Logística", region: "BR", status: "disponivel" },
  { name: "Melhor Envio", desc: "Cotação e etiquetas", category: "Logística", region: "BR", status: "disponivel" },
  { name: "Jadlog", desc: "Coletas e rastreio", category: "Logística", region: "BR", status: "disponivel" },
  { name: "Loggi", desc: "Entrega rápida urbana", category: "Logística", region: "BR", status: "disponivel" },
  { name: "Total Express", desc: "Distribuição nacional", category: "Logística", region: "BR", status: "disponivel" },
];

export default function IntegrationsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Integration["category"] | "Todos">("Todos");
  const [region, setRegion] = useState<"Todos" | "BR" | "Global">("Todos");
  const [status, setStatus] = useState<"Todos" | "disponivel" | "em-breve">("Todos");

  const requireSubscription = () =>
    toast({
      title: "Recurso Premium",
      description:
        "Esta funcionalidade requer assinatura de um plano. Por favor, assine um plano para ter acesso.",
      action: (
        <ToastAction altText="Ver Planos" onClick={() => setLocation("/plans")}>Ver Planos</ToastAction>
      ),
    });

  const categories: (Integration["category"] | "Todos")[] = [
    "Todos",
    "ERP",
    "E-commerce",
    "Marketplace",
    "Mensageria",
    "Automação",
    "Pagamentos",
    "Analytics",
    "Marketing",
    "Logística",
  ];

  const filtered = useMemo(() => {
    return INTEGRATIONS.filter((i) =>
      (category === "Todos" || i.category === category) &&
      (region === "Todos" || i.region === region) &&
      (status === "Todos" || i.status === status) &&
      (i.name.toLowerCase().includes(search.toLowerCase()) || i.desc.toLowerCase().includes(search.toLowerCase()))
    );
  }, [search, category, region, status]);

  const counters = useMemo(() => {
    const total = INTEGRATIONS.length;
    const disponiveis = INTEGRATIONS.filter((i) => i.status === "disponivel").length;
    const breve = INTEGRATIONS.filter((i) => i.status === "em-breve").length;
    return { total, disponiveis, breve };
  }, []);

  return (
    <PremiumBlocked
      title="Continue Usando Integrações"
      subtitle="Seu período de teste acabou"
      description="Assine um plano para continuar conectando ERPs, e-commerces e marketplaces ao seu WhatsApp."
      ctaLabel="Ativar Plano Ilimitado"
    >
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Integrações</h1>
            <p className="text-muted-foreground">
              Conecte ERPs, e-commerces, marketplaces e apps de automação. IA centraliza e prioriza atendimentos.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <Input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar integrações" />
              </div>
              <select value={category} onChange={(e)=>setCategory(e.target.value as any)} className="border rounded-md px-3 py-2 text-sm">
                {categories.map((c)=> (<option key={c} value={c}>{c}</option>))}
              </select>
              <div className="flex gap-2">
                <select value={region} onChange={(e)=>setRegion(e.target.value as any)} className="border rounded-md px-3 py-2 text-sm">
                  <option value="Todos">Todas as regiões</option>
                  <option value="BR">Brasil</option>
                  <option value="Global">Global</option>
                </select>
                <select value={status} onChange={(e)=>setStatus(e.target.value as any)} className="border rounded-md px-3 py-2 text-sm">
                  <option value="Todos">Todos status</option>
                  <option value="disponivel">Disponível</option>
                  <option value="em-breve">Em breve</option>
                </select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="bg-muted"><CardHeader className="pb-2"><CardDescription>Integrações mapeadas</CardDescription><CardTitle className="text-3xl">{counters.total}</CardTitle></CardHeader></Card>
              <Card className="bg-muted"><CardHeader className="pb-2"><CardDescription>Disponíveis</CardDescription><CardTitle className="text-3xl">{counters.disponiveis}</CardTitle></CardHeader></Card>
              <Card className="bg-muted"><CardHeader className="pb-2"><CardDescription>Em breve</CardDescription><CardTitle className="text-3xl">{counters.breve}</CardTitle></CardHeader></Card>
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((i) => (
            <Card key={i.name}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Plug className="w-4 h-4" /> {i.name}</CardTitle>
                <CardDescription>{i.desc}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{i.category}</Badge>
                  <Badge variant="outline">{i.region}</Badge>
                  <Badge className={i.status === "disponivel" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}>{i.status === "disponivel" ? "Disponível" : "Em breve"}</Badge>
                </div>
                <Button onClick={requireSubscription} disabled={i.status!=="disponivel"}>{i.status === "disponivel" ? "Conectar" : "Detalhes"}</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
    </PremiumBlocked>
  );
}
