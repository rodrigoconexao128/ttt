import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Users,
  Building2,
  UserPlus,
  X,
  Star,
  ArrowRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Sector {
  id: string;
  name: string;
  description?: string | null;
  keywords: string[];
  owner_id: string;
  member_count?: number;
  created_at?: string;
}

interface SectorMember {
  id: string;
  sector_id: string;
  member_id: string;
  member_name: string;
  member_email: string;
  member_role: string;
  member_is_active: boolean;
  is_primary: boolean;
  can_receive_tickets: boolean;
  max_open_tickets: number;
  current_open_tickets: number;
  assigned_at?: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// SectorsManager main component
// ---------------------------------------------------------------------------

export default function SectorsManager() {
  const { toast } = useToast();

  // State: sector dialog
  const [sectorDialogOpen, setSectorDialogOpen] = useState(false);
  const [editingSector, setEditingSector] = useState<Sector | null>(null);
  const [sectorForm, setSectorForm] = useState({ name: "", description: "", keywordsText: "" });

  // State: members dialog
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [activeSector, setActiveSector] = useState<Sector | null>(null);
  const [addMemberForm, setAddMemberForm] = useState({ memberId: "", isPrimary: false, maxOpenTickets: 10, canReceiveTickets: true });

  // ---- Queries ----
  const { data: sectorsData, isLoading: loadingSectors } = useQuery<{ items: Sector[] }>({
    queryKey: ["/api/user/sectors"],
  });

  const { data: membersData, isLoading: loadingMembers } = useQuery<{ items: SectorMember[] }>({
    queryKey: ["/api/user/sectors", activeSector?.id, "members"],
    queryFn: async () => {
      if (!activeSector) return { items: [] };
      const res = await apiRequest("GET", `/api/user/sectors/${activeSector.id}/members`);
      return res.json();
    },
    enabled: !!activeSector && membersDialogOpen,
  });

  const { data: teamMembersData } = useQuery<{ items: TeamMember[] }>({
    queryKey: ["/api/user/team-members-available"],
    enabled: membersDialogOpen,
  });

  const sectors = useMemo(() => sectorsData?.items || [], [sectorsData]);
  const sectorMembers = useMemo(() => membersData?.items || [], [membersData]);
  const teamMembers = useMemo(() => teamMembersData?.items || [], [teamMembersData]);

  // Members not yet in this sector
  const availableTeamMembers = useMemo(() => {
    const linkedIds = new Set(sectorMembers.map((sm) => sm.member_id));
    return teamMembers.filter((tm) => !linkedIds.has(tm.id) && tm.is_active);
  }, [teamMembers, sectorMembers]);

  // ---- Sector mutations ----
  const createSectorMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; keywords: string[] }) => {
      const res = await apiRequest("POST", "/api/user/sectors", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/sectors"] });
      setSectorDialogOpen(false);
      resetSectorForm();
      toast({ title: "Setor criado!", description: "O novo setor foi adicionado com sucesso." });
    },
    onError: (err: any) => toast({ title: "Erro ao criar setor", description: err.message, variant: "destructive" }),
  });

  const updateSectorMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/user/sectors/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/sectors"] });
      setSectorDialogOpen(false);
      resetSectorForm();
      toast({ title: "Setor atualizado!", description: "As alterações foram salvas." });
    },
    onError: (err: any) => toast({ title: "Erro ao atualizar setor", description: err.message, variant: "destructive" }),
  });

  const deleteSectorMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/user/sectors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/sectors"] });
      toast({ title: "Setor removido!" });
    },
    onError: (err: any) => toast({ title: "Erro ao remover setor", description: err.message, variant: "destructive" }),
  });

  // ---- Member mutations ----
  const addMemberMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/user/sectors/${activeSector!.id}/members`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/sectors", activeSector?.id, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/sectors"] });
      setAddMemberForm({ memberId: "", isPrimary: false, maxOpenTickets: 10, canReceiveTickets: true });
      toast({ title: "Membro vinculado!", description: "Membro adicionado ao setor com sucesso." });
    },
    onError: (err: any) => toast({ title: "Erro ao vincular membro", description: err.message, variant: "destructive" }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      await apiRequest("DELETE", `/api/user/sectors/${activeSector!.id}/members/${memberId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/sectors", activeSector?.id, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/sectors"] });
      toast({ title: "Membro removido do setor!" });
    },
    onError: (err: any) => toast({ title: "Erro ao remover membro", description: err.message, variant: "destructive" }),
  });

  // ---- Helpers ----
  const resetSectorForm = () => {
    setSectorForm({ name: "", description: "", keywordsText: "" });
    setEditingSector(null);
  };

  const openCreateSector = () => {
    resetSectorForm();
    setSectorDialogOpen(true);
  };

  const openEditSector = (sector: Sector) => {
    setEditingSector(sector);
    setSectorForm({
      name: sector.name,
      description: sector.description || "",
      keywordsText: (sector.keywords || []).join(", "),
    });
    setSectorDialogOpen(true);
  };

  const openMembersDialog = (sector: Sector) => {
    setActiveSector(sector);
    setAddMemberForm({ memberId: "", isPrimary: false, maxOpenTickets: 10, canReceiveTickets: true });
    setMembersDialogOpen(true);
  };

  const handleSectorSubmit = () => {
    const keywords = sectorForm.keywordsText
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    const payload = {
      name: sectorForm.name.trim(),
      description: sectorForm.description.trim() || null,
      keywords,
    };

    if (editingSector) {
      updateSectorMutation.mutate({ id: editingSector.id, data: payload });
    } else {
      createSectorMutation.mutate(payload);
    }
  };

  const handleDeleteSector = (sector: Sector) => {
    if (!window.confirm(`Excluir o setor "${sector.name}"? Esta ação não pode ser desfeita.`)) return;
    deleteSectorMutation.mutate(sector.id);
  };

  const handleAddMember = () => {
    if (!addMemberForm.memberId) {
      toast({ title: "Selecione um membro", variant: "destructive" });
      return;
    }
    addMemberMutation.mutate(addMemberForm);
  };

  // ---- Render ----
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Setores de Atendimento
            </CardTitle>
            <CardDescription>
              Organize sua equipe por setores. Configure palavras-chave para roteamento automático por IA.
            </CardDescription>
          </div>
          <Button onClick={openCreateSector}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Setor
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loadingSectors ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando setores...
          </div>
        ) : sectors.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhum setor cadastrado</p>
            <p className="text-sm mt-1">Crie setores como Financeiro, Suporte, Comercial para organizar o atendimento.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Setor</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Palavras-chave (roteamento)</TableHead>
                <TableHead className="text-center">Membros</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sectors.map((sector) => (
                <TableRow key={sector.id}>
                  <TableCell className="font-medium">{sector.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                    {sector.description || <span className="opacity-40">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                      {(sector.keywords || []).length === 0 ? (
                        <span className="text-xs text-muted-foreground opacity-50">Sem palavras-chave</span>
                      ) : (
                        sector.keywords.slice(0, 4).map((kw) => (
                          <Badge key={kw} variant="secondary" className="text-xs">
                            {kw}
                          </Badge>
                        ))
                      )}
                      {(sector.keywords || []).length > 4 && (
                        <Badge variant="outline" className="text-xs">
                          +{sector.keywords.length - 4}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <button
                      onClick={() => openMembersDialog(sector)}
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                    >
                      <Users className="h-3.5 w-3.5" />
                      {sector.member_count ?? 0}
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openMembersDialog(sector)}>
                        <UserPlus className="h-3.5 w-3.5 mr-1" />
                        Membros
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEditSector(sector)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteSector(sector)}
                        disabled={deleteSectorMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Info box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm font-medium text-blue-900 mb-1">💡 Como funcionam os setores?</p>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>• A IA detecta a <strong>intenção</strong> da mensagem e encaminha para o setor correto com base nas palavras-chave.</li>
            <li>• Membros comuns veem <strong>apenas conversas</strong> dos setores em que estão vinculados.</li>
            <li>• O dono vê <strong>todas as conversas</strong> independente do setor.</li>
            <li>• Membros podem <strong>encaminhar</strong> uma conversa para outro setor manualmente.</li>
          </ul>
        </div>
      </CardContent>

      {/* ---- Dialog: Criar/Editar Setor ---- */}
      <Dialog open={sectorDialogOpen} onOpenChange={(open) => { setSectorDialogOpen(open); if (!open) resetSectorForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSector ? "Editar Setor" : "Novo Setor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="s-name">Nome do setor *</Label>
              <Input
                id="s-name"
                value={sectorForm.name}
                onChange={(e) => setSectorForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Suporte, Financeiro, Comercial"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-desc">Descrição</Label>
              <Textarea
                id="s-desc"
                value={sectorForm.description}
                onChange={(e) => setSectorForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Descreva o foco deste setor"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-kw">Palavras-chave para roteamento automático</Label>
              <Input
                id="s-kw"
                value={sectorForm.keywordsText}
                onChange={(e) => setSectorForm((p) => ({ ...p, keywordsText: e.target.value }))}
                placeholder="Ex: boleto, pagamento, fatura, cobrança"
              />
              <p className="text-xs text-muted-foreground">
                Separe por vírgulas. A IA usará estas palavras para identificar a intenção do cliente.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSectorDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSectorSubmit}
              disabled={!sectorForm.name.trim() || createSectorMutation.isPending || updateSectorMutation.isPending}
            >
              {(createSectorMutation.isPending || updateSectorMutation.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {editingSector ? "Salvar" : "Criar Setor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Dialog: Membros do Setor ---- */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Membros — {activeSector?.name}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="current">
            <TabsList>
              <TabsTrigger value="current">
                Membros vinculados ({sectorMembers.length})
              </TabsTrigger>
              <TabsTrigger value="add">Vincular membro</TabsTrigger>
            </TabsList>

            {/* Membros atuais */}
            <TabsContent value="current">
              {loadingMembers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
                </div>
              ) : sectorMembers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum membro vinculado a este setor.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Membro</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead className="text-center">Principal</TableHead>
                      <TableHead className="text-center">Recebe tickets</TableHead>
                      <TableHead className="text-center">Carga</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sectorMembers.map((sm) => (
                      <TableRow key={sm.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{sm.member_name}</p>
                            <p className="text-xs text-muted-foreground">{sm.member_email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{sm.member_role}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {sm.is_primary && <Star className="h-4 w-4 text-yellow-500 mx-auto" />}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={sm.can_receive_tickets ? "default" : "secondary"} className="text-xs">
                            {sm.can_receive_tickets ? "Sim" : "Não"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {sm.current_open_tickets}/{sm.max_open_tickets}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              if (window.confirm(`Remover ${sm.member_name} do setor ${activeSector?.name}?`)) {
                                removeMemberMutation.mutate(sm.member_id);
                              }
                            }}
                            disabled={removeMemberMutation.isPending}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* Vincular novo membro */}
            <TabsContent value="add">
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Membro da equipe</Label>
                  <Select
                    value={addMemberForm.memberId}
                    onValueChange={(v) => setAddMemberForm((p) => ({ ...p, memberId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um membro..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTeamMembers.length === 0 ? (
                        <SelectItem value="_none" disabled>
                          Nenhum membro disponível
                        </SelectItem>
                      ) : (
                        availableTeamMembers.map((tm) => (
                          <SelectItem key={tm.id} value={tm.id}>
                            {tm.name} — {tm.email}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Membro principal</Label>
                    <p className="text-xs text-muted-foreground">Recebe tickets com prioridade</p>
                  </div>
                  <Switch
                    checked={addMemberForm.isPrimary}
                    onCheckedChange={(v) => setAddMemberForm((p) => ({ ...p, isPrimary: v }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Pode receber tickets</Label>
                    <p className="text-xs text-muted-foreground">Conversa pode ser atribuída a este membro</p>
                  </div>
                  <Switch
                    checked={addMemberForm.canReceiveTickets}
                    onCheckedChange={(v) => setAddMemberForm((p) => ({ ...p, canReceiveTickets: v }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Máximo de atendimentos simultâneos</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={addMemberForm.maxOpenTickets}
                    onChange={(e) => setAddMemberForm((p) => ({ ...p, maxOpenTickets: Number(e.target.value) }))}
                  />
                </div>

                <Button
                  onClick={handleAddMember}
                  disabled={!addMemberForm.memberId || addMemberMutation.isPending}
                  className="w-full"
                >
                  {addMemberMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  <UserPlus className="h-4 w-4 mr-2" />
                  Vincular ao Setor
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMembersDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
