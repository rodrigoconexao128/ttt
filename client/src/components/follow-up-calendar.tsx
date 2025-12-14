/**
 * 📅 CALENDÁRIO DE FOLLOW-UPS
 * 
 * Componente que mostra os follow-ups e agendamentos programados
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Calendar, 
  Clock, 
  Phone, 
  Trash2, 
  RefreshCw, 
  MessageSquare,
  AlertCircle,
  CheckCircle,
  Timer
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CalendarEvent {
  id: string;
  phoneNumber: string;
  type: 'followup' | 'scheduled_contact';
  title: string;
  scheduledAt: string;
  status: string;
  attempt?: number;
  reason?: string;
  metadata?: Record<string, any>;
}

interface CalendarStats {
  pending: number;
  scheduledToday: number;
  scheduledThisWeek: number;
  byType: Record<string, number>;
}

interface BusinessHours {
  start: number;
  end: number;
  workDays: number[];
  isCurrentlyOpen: boolean;
  nextOpenTime: string | null;
}

export default function FollowUpCalendar() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Buscar eventos do calendário
  const { data: eventsData, isLoading: loadingEvents, refetch: refetchEvents } = useQuery({
    queryKey: ["/api/admin/calendar/events"],
    queryFn: async () => {
      const res = await fetch("/api/admin/calendar/events", { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao carregar eventos");
      return res.json();
    },
    refetchInterval: 30000, // Atualizar a cada 30 segundos
  });

  // Buscar estatísticas
  const { data: statsData, isLoading: loadingStats } = useQuery({
    queryKey: ["/api/admin/calendar/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/calendar/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao carregar estatísticas");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Mutation para cancelar evento
  const cancelEventMutation = useMutation({
    mutationFn: async ({ id, phone }: { id: string; phone: string }) => {
      const res = await fetch(`/api/admin/calendar/events/${id}?phone=${phone}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao cancelar");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Evento cancelado com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/calendar/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/calendar/stats"] });
    },
    onError: () => {
      toast({ title: "Erro ao cancelar evento", variant: "destructive" });
    },
  });

  const events: CalendarEvent[] = eventsData?.events || [];
  const stats: CalendarStats = statsData?.stats || { pending: 0, scheduledToday: 0, scheduledThisWeek: 0, byType: {} };
  const businessHours: BusinessHours = statsData?.businessHours || { 
    start: 8, end: 21, workDays: [1,2,3,4,5,6], isCurrentlyOpen: true, nextOpenTime: null 
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatPhone = (phone: string) => {
    if (phone.length === 13) {
      return `(${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`;
    }
    return phone;
  };

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'followup': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'scheduled_contact': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Timer className="w-4 h-4 text-yellow-500" />;
      case 'sent': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'cancelled': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'rescheduled': return <RefreshCw className="w-4 h-4 text-blue-500" />;
      default: return null;
    }
  };

  // Agrupar eventos por data
  const groupedEvents = events.reduce((acc, event) => {
    const date = new Date(event.scheduledAt).toLocaleDateString('pt-BR');
    if (!acc[date]) acc[date] = [];
    acc[date].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            Calendário de Follow-ups
          </h2>
          <p className="text-gray-400 mt-1">
            Visualize e gerencie os follow-ups agendados
          </p>
        </div>
        
        <Button onClick={() => refetchEvents()} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Pendentes</p>
                <p className="text-2xl font-bold text-blue-400">{stats.pending}</p>
              </div>
              <Timer className="w-8 h-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Hoje</p>
                <p className="text-2xl font-bold text-green-400">{stats.scheduledToday}</p>
              </div>
              <Calendar className="w-8 h-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Esta Semana</p>
                <p className="text-2xl font-bold text-purple-400">{stats.scheduledThisWeek}</p>
              </div>
              <MessageSquare className="w-8 h-8 text-purple-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className={cn(
          "bg-gradient-to-br border",
          businessHours.isCurrentlyOpen 
            ? "from-emerald-500/10 to-emerald-600/5 border-emerald-500/20" 
            : "from-orange-500/10 to-orange-600/5 border-orange-500/20"
        )}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Horário Comercial</p>
                <p className={cn(
                  "text-lg font-bold",
                  businessHours.isCurrentlyOpen ? "text-emerald-400" : "text-orange-400"
                )}>
                  {businessHours.isCurrentlyOpen ? "Aberto" : "Fechado"}
                </p>
                <p className="text-xs text-gray-500">
                  {businessHours.start}h - {businessHours.end}h
                </p>
              </div>
              <Clock className={cn(
                "w-8 h-8",
                businessHours.isCurrentlyOpen ? "text-emerald-500/50" : "text-orange-500/50"
              )} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Events List */}
      <Card className="bg-[#1a1a2e] border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Próximos Follow-ups
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingEvents ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum follow-up agendado</p>
              <p className="text-sm mt-1">Os follow-ups serão criados automaticamente quando os clientes pararem de responder</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedEvents).map(([date, dateEvents]) => (
                <div key={date}>
                  <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {date}
                  </h3>
                  
                  <div className="space-y-2">
                    {dateEvents.map((event) => (
                      <div 
                        key={event.id}
                        className="flex items-center justify-between p-3 bg-[#0f0f1a] rounded-lg border border-gray-800 hover:border-gray-700 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {getStatusIcon(event.status)}
                          
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-white font-medium">{event.title}</span>
                              <Badge 
                                variant="outline" 
                                className={getEventTypeColor(event.type)}
                              >
                                {event.type === 'followup' ? 'Follow-up' : 'Agendamento'}
                              </Badge>
                              {event.attempt && (
                                <Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/20">
                                  Tentativa {event.attempt}/4
                                </Badge>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {formatPhone(event.phoneNumber)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDate(event.scheduledAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => cancelEventMutation.mutate({ 
                            id: event.id, 
                            phone: event.phoneNumber 
                          })}
                          disabled={cancelEventMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
