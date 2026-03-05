import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface UserAgentConfigDialogProps {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName?: string;
}

export function UserAgentConfigDialog({ userId, open, onOpenChange, userName }: UserAgentConfigDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [prompt, setPrompt] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [model, setModel] = useState("mistral-medium-latest");

  const { data: config, isLoading } = useQuery({
    queryKey: [`/api/admin/users/${userId}/agent-config`],
    enabled: !!userId && open,
  });

  useEffect(() => {
    if (config) {
      setPrompt(config.prompt || "");
      setIsActive(config.isActive || false);
      setModel(config.model || "mistral-medium-latest");
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/admin/users/${userId}/agent-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save config");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${userId}/agent-config`] });
      toast({ title: "Configuração salva com sucesso!" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Erro ao salvar configuração", variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!userId) return;
    saveMutation.mutate({
      prompt,
      isActive,
      model,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar Agente - {userName}</DialogTitle>
          <DialogDescription>
            Ajuste as configurações do agente IA para este usuário.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="flex items-center justify-between space-x-2 border p-4 rounded-lg">
              <div className="space-y-0.5">
                <Label className="text-base">Agente Ativo</Label>
                <p className="text-sm text-muted-foreground">
                  Ativar ou desativar o agente para este usuário
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            <div className="space-y-2">
              <Label>Modelo de IA</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mistral-medium-latest">Mistral Medium (Padrão)</SelectItem>
                  <SelectItem value="mistral-large-latest">Mistral Large (Mais inteligente)</SelectItem>
                  <SelectItem value="gpt-4o">GPT-4o (OpenAI)</SelectItem>
                  <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Prompt do Sistema</Label>
              <Textarea 
                value={prompt} 
                onChange={(e) => setPrompt(e.target.value)} 
                className="min-h-[200px] font-mono text-sm"
                placeholder="Você é um assistente útil..."
              />
              <p className="text-xs text-muted-foreground">
                Defina a personalidade e as instruções principais do agente.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending || isLoading}>
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
