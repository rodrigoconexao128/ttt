import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useMemo, useState } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, Link2 } from "lucide-react";
import type { Agent, User } from "@shared/schema";

interface ConnectionWithMeta {
  id: string;
  userId: string;
  agentId?: string | null;
  phoneNumber?: string | null;
  isConnected: boolean;
  createdAt?: string;
  updatedAt?: string;
  user?: User | null;
  agent?: Agent | null;
}

interface AgentFormState {
  name: string;
  prompt: string;
  isActive: boolean;
}

interface ConnectionFormState {
  userId: string;
  agentId: string;
  phoneNumber: string;
  isConnected: boolean;
}

const emptyAgentForm: AgentFormState = {
  name: "",
  prompt: "",
  isActive: true,
};

const emptyConnectionForm: ConnectionFormState = {
  userId: "",
  agentId: "",
  phoneNumber: "",
  isConnected: false,
};

export default function AdminConnectionsPage() {
  const { toast } = useToast();
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [editingConnection, setEditingConnection] = useState<ConnectionWithMeta | null>(null);
  const [agentForm, setAgentForm] = useState<AgentFormState>(emptyAgentForm);
  const [connectionForm, setConnectionForm] = useState<ConnectionFormState>(emptyConnectionForm);

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/admin/agents"],
  });

  const { data: connections = [] } = useQuery<ConnectionWithMeta[]>({
    queryKey: ["/api/admin/connections"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const activeAgents = useMemo(
    () => agents.filter((agent) => agent.isActive),
    [agents]
  );

  const connectionAgents = useMemo(() => {
    if (!editingConnection?.agentId) {
      return activeAgents;
    }
    const currentAgent = agents.find((agent) => agent.id === editingConnection.agentId);
    if (!currentAgent || currentAgent.isActive) {
      return activeAgents;
    }
    return [currentAgent, ...activeAgents];
  }, [agents, activeAgents, editingConnection?.agentId]);

  const saveAgentMutation = useMutation({
    mutationFn: async (payload: AgentFormState) => {
      const url = editingAgent ? `/api/admin/agents/${editingAgent.id}` : "/api/admin/agents";
      const method = editingAgent ? "PUT" : "POST";
      await apiRequest(method, url, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents"] });
      setAgentDialogOpen(false);
      setEditingAgent(null);
      setAgentForm(emptyAgentForm);
      toast({ title: "Agente salvo com sucesso" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar agente",
        description: error?.message || "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const deleteAgentMutation = useMutation({
    mutationFn: async (agentId: string) => {
      await apiRequest("DELETE", `/api/admin/agents/${agentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agents"] });
      toast({ title: "Agente removido" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao remover agente",
        description: error?.message || "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const saveConnectionMutation = useMutation({
    mutationFn: async (payload: ConnectionFormState) => {
      const url = editingConnection
        ? `/api/admin/connections/${editingConnection.id}`
        : "/api/admin/connections";
      const method = editingConnection ? "PUT" : "POST";
      await apiRequest(method, url, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/connections"] });
      setConnectionDialogOpen(false);
      setEditingConnection(null);
      setConnectionForm(emptyConnectionForm);
      toast({ title: "Conexao salva com sucesso" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar conexao",
        description: error?.message || "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      await apiRequest("DELETE", `/api/admin/connections/${connectionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/connections"] });
      toast({ title: "Conexao removida" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao remover conexao",
        description: error?.message || "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const openNewAgentDialog = () => {
    setEditingAgent(null);
    setAgentForm(emptyAgentForm);
    setAgentDialogOpen(true);
  };

  const openEditAgentDialog = (agent: Agent) => {
    setEditingAgent(agent);
    setAgentForm({
      name: agent.name,
      prompt: agent.prompt,
      isActive: agent.isActive ?? true,
    });
    setAgentDialogOpen(true);
  };

  const openNewConnectionDialog = () => {
    setEditingConnection(null);
    setConnectionForm(emptyConnectionForm);
    setConnectionDialogOpen(true);
  };

  const openEditConnectionDialog = (connection: ConnectionWithMeta) => {
    setEditingConnection(connection);
    setConnectionForm({
      userId: connection.userId,
      agentId: connection.agentId || "",
      phoneNumber: connection.phoneNumber || "",
      isConnected: connection.isConnected ?? false,
    });
    setConnectionDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-slate-500 hover:text-slate-800">
            ← Voltar ao Painel
          </Link>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Conexoes e Agentes
          </h1>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-6 overflow-auto">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Agentes</CardTitle>
              <CardDescription>Cadastre prompts personalizados para cada agente.</CardDescription>
            </div>
            <Button onClick={openNewAgentDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Novo agente
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Prompt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Nenhum agente cadastrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  agents.map((agent) => (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium">{agent.name}</TableCell>
                      <TableCell className="max-w-[360px] text-sm text-muted-foreground truncate">
                        {agent.prompt}
                      </TableCell>
                      <TableCell>
                        <Badge variant={agent.isActive ? "default" : "secondary"}>
                          {agent.isActive ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditAgentDialog(agent)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`Excluir agente "${agent.name}"?`)) {
                              deleteAgentMutation.mutate(agent.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Conexoes WhatsApp</CardTitle>
              <CardDescription>Gerencie multiplas conexoes e vincule cada uma a um agente.</CardDescription>
            </div>
            <Button onClick={openNewConnectionDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Nova conexao
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Agente</TableHead>
                  <TableHead>Numero</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhuma conexao cadastrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  connections.map((connection) => (
                    <TableRow key={connection.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">
                            {connection.user?.name || "Sem nome"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {connection.user?.email || connection.userId}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{connection.agent?.name || "Sem agente"}</TableCell>
                      <TableCell className="text-sm">
                        {connection.phoneNumber || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={connection.isConnected ? "default" : "secondary"}>
                          {connection.isConnected ? "Conectado" : "Desconectado"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditConnectionDialog(connection)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Excluir esta conexao?")) {
                              deleteConnectionMutation.mutate(connection.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      <Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingAgent ? "Editar agente" : "Novo agente"}</DialogTitle>
            <DialogDescription>
              Defina o nome e prompt do agente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={agentForm.name}
                onChange={(event) => setAgentForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Prompt</Label>
              <Textarea
                rows={6}
                value={agentForm.prompt}
                onChange={(event) => setAgentForm((prev) => ({ ...prev, prompt: event.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Agente ativo</Label>
                <p className="text-xs text-muted-foreground">Agentes inativos nao aparecem para novas conexoes.</p>
              </div>
              <Switch
                checked={agentForm.isActive}
                onCheckedChange={(checked) => setAgentForm((prev) => ({ ...prev, isActive: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgentDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveAgentMutation.mutate(agentForm)}
              disabled={!agentForm.name.trim() || !agentForm.prompt.trim()}
            >
              {editingAgent ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={connectionDialogOpen} onOpenChange={setConnectionDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingConnection ? "Editar conexao" : "Nova conexao"}</DialogTitle>
            <DialogDescription>
              Vincule a conexao a um usuario e agente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Usuario</Label>
              <Select
                value={connectionForm.userId}
                onValueChange={(value) => setConnectionForm((prev) => ({ ...prev, userId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um usuario" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} {user.email ? `(${user.email})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Agente</Label>
              <Select
                value={connectionForm.agentId}
                onValueChange={(value) => setConnectionForm((prev) => ({ ...prev, agentId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um agente" />
                </SelectTrigger>
                <SelectContent>
                  {connectionAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Numero</Label>
              <Input
                value={connectionForm.phoneNumber}
                onChange={(event) =>
                  setConnectionForm((prev) => ({ ...prev, phoneNumber: event.target.value }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Conectado</Label>
                <p className="text-xs text-muted-foreground">Atualize manualmente se a sessao ja estiver ativa.</p>
              </div>
              <Switch
                checked={connectionForm.isConnected}
                onCheckedChange={(checked) =>
                  setConnectionForm((prev) => ({ ...prev, isConnected: checked }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectionDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveConnectionMutation.mutate(connectionForm)}
              disabled={!connectionForm.userId || !connectionForm.agentId}
            >
              {editingConnection ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
