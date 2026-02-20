import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Loader2, BarChart3, Building2, Users, TrendingUp, Clock } from "lucide-react";

interface SectorReport {
  sectorId: string;
  sectorName: string;
  assignedCount: number;
  closedCount: number;
  avgHours: number | null;
}

interface MemberReport {
  memberId: string;
  memberName: string;
  memberEmail: string;
  assignedCount: number;
  closedCount: number;
  avgHours: number | null;
}

interface Report {
  period: { startDate: string; endDate: string };
  totalConversations: number;
  totalOpen: number;
  totalClosed: number;
  bySector: SectorReport[];
  byMember: MemberReport[];
}

export default function SectorsReport() {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [fetchParams, setFetchParams] = useState({ startDate: thirtyDaysAgo, endDate: today });

  const { data, isLoading, error } = useQuery<Report>({
    queryKey: ["/api/user/sectors/reports", fetchParams.startDate, fetchParams.endDate],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/user/sectors/reports?startDate=${fetchParams.startDate}&endDate=${fetchParams.endDate}`
      );
      return res.json();
    },
  });

  const handleApply = () => {
    setFetchParams({ startDate, endDate });
  };

  const formatHours = (hours: number | null) => {
    if (hours === null || hours === undefined) return "—";
    if (hours < 1) return `${Math.round(hours * 60)}min`;
    return `${hours.toFixed(1)}h`;
  };

  const rate = (closed: number, total: number) =>
    total > 0 ? `${Math.round((closed / total) * 100)}%` : "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Relatórios de Atendimento por Setor
        </CardTitle>
        <CardDescription>
          Visão completa das conversas roteadas, por setor e por membro da equipe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Filtro de período */}
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label>Data inicial</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label>Data final</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button onClick={handleApply} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Aplicar
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando relatório...
          </div>
        ) : error ? (
          <div className="text-center py-10 text-red-500">
            Erro ao carregar relatório. Tente novamente.
          </div>
        ) : !data ? null : (
          <>
            {/* Resumo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-0 bg-slate-50">
                <CardContent className="p-4 text-center">
                  <TrendingUp className="h-5 w-5 mx-auto text-blue-500 mb-1" />
                  <p className="text-2xl font-bold">{data.totalConversations}</p>
                  <p className="text-xs text-muted-foreground">Total de conversas</p>
                </CardContent>
              </Card>
              <Card className="border-0 bg-slate-50">
                <CardContent className="p-4 text-center">
                  <Building2 className="h-5 w-5 mx-auto text-green-500 mb-1" />
                  <p className="text-2xl font-bold">{data.totalOpen}</p>
                  <p className="text-xs text-muted-foreground">Em aberto</p>
                </CardContent>
              </Card>
              <Card className="border-0 bg-slate-50">
                <CardContent className="p-4 text-center">
                  <Clock className="h-5 w-5 mx-auto text-orange-500 mb-1" />
                  <p className="text-2xl font-bold">{data.totalClosed}</p>
                  <p className="text-xs text-muted-foreground">Fechadas</p>
                </CardContent>
              </Card>
              <Card className="border-0 bg-slate-50">
                <CardContent className="p-4 text-center">
                  <Users className="h-5 w-5 mx-auto text-purple-500 mb-1" />
                  <p className="text-2xl font-bold">{rate(data.totalClosed, data.totalConversations)}</p>
                  <p className="text-xs text-muted-foreground">Taxa resolução</p>
                </CardContent>
              </Card>
            </div>

            {/* Tabs por setor / por membro */}
            <Tabs defaultValue="sector">
              <TabsList>
                <TabsTrigger value="sector">
                  <Building2 className="h-4 w-4 mr-1" />
                  Por Setor
                </TabsTrigger>
                <TabsTrigger value="member">
                  <Users className="h-4 w-4 mr-1" />
                  Por Membro
                </TabsTrigger>
              </TabsList>

              <TabsContent value="sector">
                {data.bySector.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhum dado disponível para este período.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Setor</TableHead>
                        <TableHead className="text-center">Atribuídas</TableHead>
                        <TableHead className="text-center">Fechadas</TableHead>
                        <TableHead className="text-center">Taxa</TableHead>
                        <TableHead className="text-center">Tempo médio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.bySector.map((row) => (
                        <TableRow key={row.sectorId}>
                          <TableCell className="font-medium">{row.sectorName}</TableCell>
                          <TableCell className="text-center">{row.assignedCount}</TableCell>
                          <TableCell className="text-center">{row.closedCount}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{rate(row.closedCount, row.assignedCount)}</Badge>
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">
                            {formatHours(row.avgHours)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="member">
                {data.byMember.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhum dado disponível para este período.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Membro</TableHead>
                        <TableHead className="text-center">Atribuídas</TableHead>
                        <TableHead className="text-center">Fechadas</TableHead>
                        <TableHead className="text-center">Taxa</TableHead>
                        <TableHead className="text-center">Tempo médio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.byMember.map((row) => (
                        <TableRow key={row.memberId}>
                          <TableCell>
                            <p className="font-medium text-sm">{row.memberName}</p>
                            <p className="text-xs text-muted-foreground">{row.memberEmail}</p>
                          </TableCell>
                          <TableCell className="text-center">{row.assignedCount}</TableCell>
                          <TableCell className="text-center">{row.closedCount}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{rate(row.closedCount, row.assignedCount)}</Badge>
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">
                            {formatHours(row.avgHours)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>

            <p className="text-xs text-muted-foreground text-right">
              Período: {fetchParams.startDate} até {fetchParams.endDate}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
