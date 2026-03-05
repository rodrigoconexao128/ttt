import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from "@/lib/supabase";
import {
  CalendarClock, Check, X, Clock, User, Phone, Loader2,
  CheckCircle2, AlertCircle, RefreshCw, Calendar as CalendarIcon
} from "lucide-react";

interface Appointment {
  id: string;
  client_name: string;
  client_phone: string;
  service_name: string;
  professional_name: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: string;
  created_at: string;
  created_by_ai: boolean;
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pendente", color: "bg-yellow-100 text-yellow-800", icon: AlertCircle },
  confirmed: { label: "Confirmado", color: "bg-blue-100 text-blue-800", icon: CheckCircle2 },
  completed: { label: "Concluido", color: "bg-green-100 text-green-800", icon: Check },
  cancelled: { label: "Cancelado", color: "bg-red-100 text-red-800", icon: X },
  no_show: { label: "Faltou", color: "bg-gray-100 text-gray-800", icon: AlertCircle },
};

export default function SalonAppointmentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });

  const { data: appointments = [], isLoading, refetch } = useQuery<Appointment[]>({
    queryKey: ["salon-appointments", statusFilter, dateFilter],
    queryFn: async () => {
      const token = await getAuthToken();
      const params = new URLSearchParams();
      if (dateFilter) params.set("date", dateFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/salon/appointments?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erro ao buscar agendamentos");
      return res.json();
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["salon-stats"],
    queryFn: async () => {
      const token = await getAuthToken();
      const res = await fetch("/api/salon/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erro ao buscar stats");
      return res.json();
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const token = await getAuthToken();
      const res = await fetch(`/api/salon/appointments/${id}/status`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Erro ao atualizar status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salon-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["salon-stats"] });
      toast({ title: "Status atualizado!" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    },
  });

  const formatDate = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="h-6 w-6" />
            Agenda do Salao
          </h1>
          <p className="text-muted-foreground">Gerencie os agendamentos do seu salao</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{stats?.today?.total || 0}</div>
            <div className="text-sm text-muted-foreground">Hoje</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats?.today?.pending || 0}</div>
            <div className="text-sm text-muted-foreground">Pendentes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats?.today?.confirmed || 0}</div>
            <div className="text-sm text-muted-foreground">Confirmados</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats?.week?.total || 0}</div>
            <div className="text-sm text-muted-foreground">Semana</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="confirmed">Confirmados</SelectItem>
            <SelectItem value="completed">Concluidos</SelectItem>
            <SelectItem value="cancelled">Cancelados</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setDateFilter(todayStr); setStatusFilter("all"); }}
        >
          Hoje
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setDateFilter(""); setStatusFilter("all"); }}
        >
          Todos
        </Button>
      </div>

      {/* Appointments Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : appointments.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <CalendarClock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">Nenhum agendamento</h3>
            <p className="text-muted-foreground">Nao ha agendamentos para o filtro selecionado.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Horario</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Servico</TableHead>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((appt) => {
                  const sc = statusConfig[appt.status] || statusConfig.pending;
                  const StatusIcon = sc.icon;
                  return (
                    <TableRow key={appt.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{appt.start_time}</span>
                          <span className="text-muted-foreground text-xs">- {appt.end_time}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(appt.appointment_date)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{appt.client_name}</span>
                        </div>
                        {appt.client_phone && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                            <Phone className="h-3 w-3" />
                            {appt.client_phone}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{appt.service_name}</span>
                        <div className="text-xs text-muted-foreground">{appt.duration_minutes}min</div>
                      </TableCell>
                      <TableCell>{appt.professional_name || "-"}</TableCell>
                      <TableCell>
                        <Badge className={`${sc.color} gap-1`}>
                          <StatusIcon className="h-3 w-3" />
                          {sc.label}
                        </Badge>
                        {appt.created_by_ai && (
                          <Badge variant="outline" className="ml-1 text-xs">IA</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {appt.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => updateStatus.mutate({ id: appt.id, status: "confirmed" })}
                              >
                                <Check className="h-3 w-3 mr-1" /> Confirmar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-red-600"
                                onClick={() => updateStatus.mutate({ id: appt.id, status: "cancelled" })}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {appt.status === "confirmed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => updateStatus.mutate({ id: appt.id, status: "completed" })}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Concluir
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
