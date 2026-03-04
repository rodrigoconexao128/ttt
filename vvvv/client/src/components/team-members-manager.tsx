import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Edit, Trash2, Key, Users, Eye, EyeOff, Copy, Check } from "lucide-react";

interface TeamMember {
  id: string;
  ownerId: string;
  name: string;
  email: string;
  role: string;
  permissions: {
    canViewConversations: boolean;
    canSendMessages: boolean;
    canUseQuickReplies: boolean;
    canMoveKanban: boolean;
    canViewDashboard: boolean;
    canEditContacts: boolean;
  };
  isActive: boolean;
  avatarUrl?: string;
  signature?: string;
  signatureEnabled?: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

const defaultPermissions = {
  canViewConversations: true,
  canSendMessages: true,
  canUseQuickReplies: true,
  canMoveKanban: true,
  canViewDashboard: false,
  canEditContacts: false,
};

export default function TeamMembersManager() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "atendente",
    permissions: { ...defaultPermissions },
    isActive: true,
    signature: "",
    signatureEnabled: false,
  });

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/team-members", data);
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      if (data.generatedPassword) {
        setGeneratedPassword(data.generatedPassword);
      } else {
        setDialogOpen(false);
        resetForm();
      }
      toast({ title: "Membro adicionado com sucesso!" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao adicionar membro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const response = await apiRequest("PUT", `/api/team-members/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Membro atualizado com sucesso!" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar membro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/team-members/${id}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      toast({ title: "Membro excluído com sucesso!" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir membro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/team-members/${id}/reset-password`);
      return await response.json();
    },
    onSuccess: (data) => {
      setGeneratedPassword(data.newPassword);
      toast({ title: "Senha resetada com sucesso!" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao resetar senha",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      password: "",
      role: "atendente",
      permissions: { ...defaultPermissions },
      isActive: true,
      signature: "",
      signatureEnabled: false,
    });
    setEditingMember(null);
    setGeneratedPassword(null);
    setCopiedPassword(false);
  };

  const handleOpenDialog = (member?: TeamMember) => {
    if (member) {
      setEditingMember(member);
      setFormData({
        name: member.name,
        email: member.email,
        password: "",
        role: member.role,
        permissions: member.permissions || { ...defaultPermissions },
        isActive: member.isActive,
        signature: member.signature || "",
        signatureEnabled: member.signatureEnabled || false,
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingMember) {
      updateMutation.mutate({ id: editingMember.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleCopyPassword = () => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "vendedor":
        return "bg-green-100 text-green-800";
      case "atendente":
        return "bg-blue-100 text-blue-800";
      case "suporte":
        return "bg-purple-100 text-purple-800";
      case "supervisor":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Membros da Equipe
            </CardTitle>
            <CardDescription>
              Adicione funcionários que podem responder seus clientes
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Membro
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingMember ? "Editar Membro" : "Adicionar Membro"}
                </DialogTitle>
                <DialogDescription>
                  {editingMember
                    ? "Atualize as informações do membro"
                    : "Preencha os dados do novo membro da equipe"}
                </DialogDescription>
              </DialogHeader>

              {generatedPassword ? (
                <div className="space-y-4 py-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-green-800 font-medium mb-2">
                      ✅ Membro criado com sucesso!
                    </p>
                    <p className="text-sm text-green-700 mb-3">
                      Envie a senha abaixo para o membro:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white border rounded px-3 py-2 font-mono text-lg">
                        {generatedPassword}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopyPassword}
                      >
                        {copiedPassword ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ⚠️ Esta senha não será exibida novamente. Copie e envie para o membro.
                  </p>
                  <Button onClick={handleCloseDialog} className="w-full">
                    Fechar
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome Completo</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="João Silva"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      placeholder="joao@empresa.com"
                      required
                    />
                  </div>

                  {!editingMember && (
                    <div className="space-y-2">
                      <Label htmlFor="password">
                        Senha (deixe vazio para gerar automaticamente)
                      </Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={formData.password}
                          onChange={(e) =>
                            setFormData({ ...formData, password: e.target.value })
                          }
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="role">Cargo</Label>
                    <Select
                      value={formData.role}
                      onValueChange={(value) =>
                        setFormData({ ...formData, role: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o cargo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="atendente">Atendente</SelectItem>
                        <SelectItem value="vendedor">Vendedor</SelectItem>
                        <SelectItem value="suporte">Suporte</SelectItem>
                        <SelectItem value="supervisor">Supervisor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label>Permissões</Label>
                    <div className="space-y-2 bg-muted/50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Ver conversas</span>
                        <Switch
                          checked={formData.permissions.canViewConversations}
                          onCheckedChange={(checked) =>
                            setFormData({
                              ...formData,
                              permissions: {
                                ...formData.permissions,
                                canViewConversations: checked,
                              },
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Enviar mensagens</span>
                        <Switch
                          checked={formData.permissions.canSendMessages}
                          onCheckedChange={(checked) =>
                            setFormData({
                              ...formData,
                              permissions: {
                                ...formData.permissions,
                                canSendMessages: checked,
                              },
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Usar respostas rápidas</span>
                        <Switch
                          checked={formData.permissions.canUseQuickReplies}
                          onCheckedChange={(checked) =>
                            setFormData({
                              ...formData,
                              permissions: {
                                ...formData.permissions,
                                canUseQuickReplies: checked,
                              },
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Mover no Kanban</span>
                        <Switch
                          checked={formData.permissions.canMoveKanban}
                          onCheckedChange={(checked) =>
                            setFormData({
                              ...formData,
                              permissions: {
                                ...formData.permissions,
                                canMoveKanban: checked,
                              },
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Ver dashboard</span>
                        <Switch
                          checked={formData.permissions.canViewDashboard}
                          onCheckedChange={(checked) =>
                            setFormData({
                              ...formData,
                              permissions: {
                                ...formData.permissions,
                                canViewDashboard: checked,
                              },
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Editar contatos</span>
                        <Switch
                          checked={formData.permissions.canEditContacts}
                          onCheckedChange={(checked) =>
                            setFormData({
                              ...formData,
                              permissions: {
                                ...formData.permissions,
                                canEditContacts: checked,
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="isActive">Membro Ativo</Label>
                    <Switch
                      id="isActive"
                      checked={formData.isActive}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, isActive: checked })
                      }
                    />
                  </div>

                  <div className="space-y-3 border-t pt-3">
                    <Label className="font-medium">Assinatura de Mensagens</Label>
                    <p className="text-xs text-muted-foreground">
                      Ao ativar, o nome/apelido aparecerá em *negrito* acima da mensagem enviada
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Ativar assinatura</span>
                      <Switch
                        checked={formData.signatureEnabled}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, signatureEnabled: checked })
                        }
                      />
                    </div>
                    {formData.signatureEnabled && (
                      <div className="space-y-2">
                        <Label htmlFor="signature">Nome/Apelido da assinatura</Label>
                        <Input
                          id="signature"
                          value={formData.signature}
                          onChange={(e) =>
                            setFormData({ ...formData, signature: e.target.value })
                          }
                          placeholder="Ex: Rodrigo, Atendimento, Suporte..."
                          maxLength={100}
                        />
                        <p className="text-xs text-muted-foreground">
                          Exemplo:
                          <span className="block">
                            <strong>*{formData.signature || "Rodrigo"}:*</strong>
                          </span>
                          <span className="block">Olá, como posso ajudar?</span>
                        </p>
                      </div>
                    )}
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCloseDialog}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        createMutation.isPending || updateMutation.isPending
                      }
                    >
                      {(createMutation.isPending || updateMutation.isPending) && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {editingMember ? "Salvar" : "Adicionar"}
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum membro cadastrado</p>
            <p className="text-sm">
              Adicione membros da sua equipe para ajudar no atendimento
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Último Login</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.name}</TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={getRoleBadgeColor(member.role)}
                    >
                      {member.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.isActive ? "default" : "secondary"}>
                      {member.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {member.lastLoginAt
                      ? new Date(member.lastLoginAt).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Nunca"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => resetPasswordMutation.mutate(member.id)}
                        disabled={resetPasswordMutation.isPending}
                        title="Resetar senha"
                      >
                        <Key className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(member)}
                        title="Editar"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (
                            confirm(
                              `Deseja realmente excluir ${member.name}?`
                            )
                          ) {
                            deleteMutation.mutate(member.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Info box sobre login de membros */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">
            ℹ️ Como os membros acessam o sistema?
          </h4>
          <p className="text-sm text-blue-800">
            Os membros da equipe acessam através da página{" "}
            <code className="bg-blue-100 px-1 rounded">{window.location.origin}/membro-login</code>.
            Eles usam o email cadastrado e a senha fornecida para fazer login.
            Cada membro terá acesso apenas às permissões configuradas.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
