import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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
import { ArrowRight, Loader2 } from "lucide-react";

interface Sector {
  id: string;
  name: string;
  description?: string | null;
  member_count?: number;
}

interface ConversationTransferProps {
  conversationId: string;
  currentSectorId?: string | null;
  currentSectorName?: string | null;
  onTransferred?: (sectorId: string, sectorName: string) => void;
}

export default function ConversationTransfer({
  conversationId,
  currentSectorId,
  currentSectorName,
  onTransferred,
}: ConversationTransferProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [targetSectorId, setTargetSectorId] = useState("");
  const [reason, setReason] = useState("");

  const { data: sectorsData } = useQuery<{ items: Sector[] }>({
    queryKey: ["/api/user/sectors"],
    enabled: open,
  });

  const sectors = (sectorsData?.items || []).filter((s) => s.id !== currentSectorId);

  const transferMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/user/sectors/transfer", {
        conversationId,
        targetSectorId,
        reason: reason.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/sectors"] });
      toast({
        title: "Conversa encaminhada!",
        description: `Movida para o setor "${data.sectorName}"${data.assignedMemberName ? ` — atribuída a ${data.assignedMemberName}` : ""}.`,
      });
      setOpen(false);
      setTargetSectorId("");
      setReason("");
      onTransferred?.(data.sectorId, data.sectorName);
    },
    onError: (err: any) =>
      toast({ title: "Erro ao encaminhar", description: err.message, variant: "destructive" }),
  });

  const handleTransfer = () => {
    if (!targetSectorId) {
      toast({ title: "Selecione o setor de destino", variant: "destructive" });
      return;
    }
    transferMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <ArrowRight className="h-3.5 w-3.5" />
          Encaminhar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Encaminhar para outro setor</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {currentSectorName && (
            <p className="text-sm text-muted-foreground">
              Setor atual: <strong>{currentSectorName}</strong>
            </p>
          )}
          <div className="space-y-2">
            <Label>Setor de destino *</Label>
            <Select value={targetSectorId} onValueChange={setTargetSectorId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {sectors.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    Nenhum outro setor disponível
                  </SelectItem>
                ) : (
                  sectors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} {s.member_count !== undefined ? `(${s.member_count} membros)` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Cliente solicitou falar com financeiro..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleTransfer} disabled={!targetSectorId || transferMutation.isPending}>
            {transferMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Encaminhar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
