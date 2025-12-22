import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Bell, Save, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function SmartNotifierPage() {
  const { toast } = useToast();
  const { data: notificationConfig, isLoading } = useQuery({
    queryKey: ["/api/agent/notification-config"],
  });

  const [notificationPhone, setNotificationPhone] = useState("");
  const [notificationTrigger, setNotificationTrigger] = useState("");
  const [notificationEnabled, setNotificationEnabled] = useState(false);

  useEffect(() => {
    if (notificationConfig) {
      setNotificationPhone(notificationConfig.notificationPhoneNumber || "");
      setNotificationTrigger(notificationConfig.notificationTrigger || "");
      setNotificationEnabled(notificationConfig.notificationEnabled || false);
    }
  }, [notificationConfig]);

  const updateConfigMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/agent/notification-config", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent/notification-config"] });
      toast({
        title: "Configuração salva",
        description: "As configurações de notificação foram atualizadas.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveNotification = () => {
    updateConfigMutation.mutate({
      notificationPhoneNumber: notificationPhone,
      notificationTrigger: notificationTrigger,
      notificationEnabled: notificationEnabled,
    });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-2xl mx-auto p-8 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Notificador Inteligente</h1>
          <p className="text-muted-foreground">
            Configure notificações automáticas baseadas no contexto das conversas
          </p>
        </div>

        <Card className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-md bg-orange-100 flex items-center justify-center">
                <Bell className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h3 className="font-semibold">Status do Notificador</h3>
                <p className="text-sm text-muted-foreground">
                  Receba notificações no seu WhatsApp pessoal
                </p>
              </div>
            </div>
            <Switch
              checked={notificationEnabled}
              onCheckedChange={setNotificationEnabled}
            />
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Número para Notificação</Label>
              <Input
                placeholder="Ex: 5511999999999"
                value={notificationPhone}
                onChange={(e) => setNotificationPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Número que receberá os alertas (inclua o código do país, ex: 55)
              </p>
            </div>

            <div className="space-y-2">
              <Label>Gatilho da Notificação (Instrução para IA)</Label>
              <Textarea
                placeholder="Ex: Me notifique quando o cliente quiser agendar uma reunião ou demonstrar interesse em comprar."
                value={notificationTrigger}
                onChange={(e) => setNotificationTrigger(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                A IA analisará a conversa e te notificará baseada nesta instrução.
              </p>
            </div>

            <Button 
              onClick={handleSaveNotification} 
              disabled={updateConfigMutation.isPending}
              className="w-full"
            >
              {updateConfigMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Configurações
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
