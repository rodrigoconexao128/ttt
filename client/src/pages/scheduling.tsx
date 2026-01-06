import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useLocation } from "wouter";
import { CalendarClock, Stethoscope, BriefcaseMedical } from "lucide-react";
import PremiumBlocked from "@/components/premium-overlay";

export default function SchedulingPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

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

  const appointments = [
    { profissional: "Dra. Ana", especialidade: "Dermatologia", paciente: "Marina Costa", horario: "09:30", status: "Confirmado" },
    { profissional: "Dr. Paulo", especialidade: "Odontologia", paciente: "Carlos Lima", horario: "10:00", status: "Em confirmação" },
    { profissional: "Dra. Luiza", especialidade: "Fisioterapia", paciente: "João Silva", horario: "11:00", status: "Novo" },
  ];

  return (
    <PremiumBlocked
      title="Continue Gerenciando Agendamentos"
      subtitle="Seu período de teste acabou"
      description="Assine um plano para continuar usando os agendamentos com confirmações automáticas no WhatsApp."
      ctaLabel="Ativar Plano Ilimitado"
    >
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold">Agendamento</h1>
            <p className="text-muted-foreground">
              Centralize consultas de clínicas, escritórios e estúdios em um painel inteligente.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={requireSubscription}>
              Bloquear Agenda
            </Button>
            <Button onClick={requireSubscription}>
              <CalendarClock className="w-4 h-4 mr-2" />
              Nova Agenda
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Visão de Agenda do Dia</CardTitle>
              <CardDescription>Visualização simplificada por horário.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {appointments.map((item) => (
                <div key={`${item.profissional}-${item.horario}`} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-semibold text-sm text-muted-foreground">{item.horario}</div>
                    <Badge variant="secondary" className="capitalize">
                      {item.status}
                    </Badge>
                  </div>
                  <p className="font-medium">{item.paciente}</p>
                  <p className="text-sm text-muted-foreground">{item.profissional} — {item.especialidade}</p>
                  <Button className="mt-3 w-full" variant="outline" size="sm" onClick={requireSubscription}>
                    Ver ficha completa
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Segmentos atendidos</CardTitle>
              <CardDescription>Mostre como cada nicho se beneficia.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-primary/10 p-2">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold">Clínicas e consultórios</p>
                  <p className="text-sm text-muted-foreground">Agenda médica com confirmações automáticas e ficha única do paciente.</p>
                  <Button variant="ghost" size="sm" className="px-0" onClick={requireSubscription}>
                    Explorar fluxo
                  </Button>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-primary/10 p-2">
                  <BriefcaseMedical className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold">Escritórios e estúdios</p>
                  <p className="text-sm text-muted-foreground">Organize atendimentos jurídicos, contábeis ou terapias com lembretes.</p>
                  <Button variant="ghost" size="sm" className="px-0" onClick={requireSubscription}>
                    Configurar modelo
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Próximos atendimentos</CardTitle>
            <CardDescription>Tabela mock para ilustrar como seria o controle detalhado.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Paciente/Cliente</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { profissional: "Dr. Marcos", cliente: "Beatriz", servico: "Avaliação", horario: "13:30" },
                  { profissional: "Equipe Financeira", cliente: "Empresa XPTO", servico: "Consultoria", horario: "15:00" },
                  { profissional: "Dra. Renata", cliente: "Pedro", servico: "Sessão Terapia", horario: "16:15" },
                ].map((row) => (
                  <TableRow key={`${row.profissional}-${row.horario}`}>
                    <TableCell>{row.profissional}</TableCell>
                    <TableCell>{row.cliente}</TableCell>
                    <TableCell>{row.servico}</TableCell>
                    <TableCell>{row.horario}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={requireSubscription}>
                        Reagendar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
    </PremiumBlocked>
  );
}
