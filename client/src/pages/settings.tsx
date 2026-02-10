import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, User, Lock, Eye, EyeOff, PenLine } from "lucide-react";
import type { User as UserType } from "@shared/schema";
import TeamMembersManager from "@/components/team-members-manager";

export default function SettingsPage() {
  const { toast } = useToast();

  const { data: user, isLoading } = useQuery<UserType>({
    queryKey: ["/api/auth/user"],
  });

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  
  // Estado para alteração de senha
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Estado para assinatura de mensagens
  const [signature, setSignature] = useState("");
  const [signatureEnabled, setSignatureEnabled] = useState(false);

  useEffect(() => {
    if (user) {
      setEmail(user.email || "");
      setName(user.name || "");
      setSignature((user as any).signature || "");
      setSignatureEnabled((user as any).signatureEnabled || false);
    }
  }, [user]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { email?: string; name?: string }) => {
      const response = await apiRequest("PUT", "/api/user/profile", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Perfil atualizado com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao atualizar perfil", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const updateSignatureMutation = useMutation({
    mutationFn: async (data: { signature: string; signatureEnabled: boolean }) => {
      const response = await apiRequest("PUT", "/api/user/signature", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Assinatura atualizada com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao atualizar assinatura", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await apiRequest("PUT", "/api/user/password", data);
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Senha alterada com sucesso!" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao alterar senha", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({ email, name });
  };

  const handleSignatureSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSignatureMutation.mutate({ signature, signatureEnabled });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast({
        title: "Senhas não conferem",
        description: "A nova senha e a confirmação devem ser iguais",
        variant: "destructive"
      });
      return;
    }
    
    if (newPassword.length < 6) {
      toast({
        title: "Senha muito curta",
        description: "A senha deve ter pelo menos 6 caracteres",
        variant: "destructive"
      });
      return;
    }
    
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4 md:space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-settings-title">Configurações</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas informações pessoais</p>
        </div>

        <Card data-testid="card-profile-settings">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5" />
              Informações Pessoais
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">Atualize seu email e nome</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="email" className="text-sm">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  data-testid="input-email"
                  className="h-11"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="name" className="text-sm">Nome Completo</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="João Silva"
                  data-testid="input-name"
                  className="h-11"
                />
              </div>

              <Button 
                type="submit" 
                disabled={updateProfileMutation.isPending}
                data-testid="button-save-profile"
                className="w-full md:w-auto h-11"
              >
                {updateProfileMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Alterações
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card data-testid="card-password-settings">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lock className="h-5 w-5" />
              Alterar Senha
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">Atualize sua senha de acesso</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="currentPassword" className="text-sm">Senha Atual</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Digite sua senha atual"
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="newPassword" className="text-sm">Nova Senha</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Digite a nova senha"
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="confirmPassword" className="text-sm">Confirmar Nova Senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirme a nova senha"
                  className="h-11"
                />
              </div>

              <Button 
                type="submit" 
                disabled={changePasswordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
                className="w-full md:w-auto h-11"
              >
                {changePasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Alterar Senha
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Assinatura de Mensagens */}
        <Card data-testid="card-signature-settings">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <PenLine className="h-5 w-5" />
              Assinatura de Mensagens
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Adicione seu nome ou apelido em negrito no início das mensagens
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignatureSubmit} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Ativar Assinatura</Label>
                  <p className="text-xs text-muted-foreground">
                    Quando ativado, sua assinatura aparecerá antes de cada mensagem
                  </p>
                </div>
                <Switch
                  checked={signatureEnabled}
                  onCheckedChange={setSignatureEnabled}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="signature" className="text-sm">Sua Assinatura</Label>
                <Input
                  id="signature"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Ex: Rodrigo, Atendimento, Suporte..."
                  maxLength={50}
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">
                  Máximo 50 caracteres. Aparecerá como:
                  <span className="block">
                    <strong>*{signature || "Nome"}:*</strong>
                  </span>
                  <span className="block">sua mensagem</span>
                </p>
              </div>

              {signatureEnabled && signature && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Prévia:</p>
                  <p className="text-sm">
                    <strong>*{signature}:*</strong>
                    <span className="block">Olá, como posso ajudar?</span>
                  </p>
                </div>
              )}

              <Button 
                type="submit" 
                disabled={updateSignatureMutation.isPending}
                className="w-full md:w-auto h-11"
              >
                {updateSignatureMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Assinatura
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Gerenciador de Membros da Equipe */}
        <TeamMembersManager />
      </div>
    </div>
  );
}
