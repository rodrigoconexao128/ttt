import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { 
  Ban, 
  Trash2,
  ChevronLeft,
  CheckCircle2,
  Loader2,
  Sparkles,
  Shield,
  Copy,
  RotateCcw,
  Bot,
  MessageSquare,
  Power,
  PowerOff
} from "lucide-react";

interface ExclusionListItem {
  id: string;
  userId: string;
  phoneNumber: string;
  contactName: string | null;
  reason: string | null;
  excludeFromFollowup: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ExclusionConfig {
  id: string;
  userId: string;
  isEnabled: boolean;
  followupExclusionEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function ExclusionListPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Estado para bulk import
  const [bulkNumbers, setBulkNumbers] = useState("");
  const [excludeFollowup, setExcludeFollowup] = useState(true);

  // Queries
  const { data: config } = useQuery<ExclusionConfig>({
    queryKey: ["/api/exclusion/config"],
  });

  const { data: exclusionList, isLoading } = useQuery<ExclusionListItem[]>({
    queryKey: ["/api/exclusion/list"],
  });

  // Mutations
  const updateConfigMutation = useMutation({
    mutationFn: async (data: Partial<ExclusionConfig>) => {
      const response = await apiRequest("PUT", "/api/exclusion/config", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusion/config"] });
    },
  });

  const addBulkMutation = useMutation({
    mutationFn: async (data: { numbers: string[]; excludeFromFollowup: boolean }) => {
      const response = await apiRequest("POST", "/api/exclusion/list/bulk", data);
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusion/list"] });
      setBulkNumbers("");
      toast({
        title: "✅ Números adicionados!",
        description: `${data.added || 0} números bloqueados com sucesso.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao adicionar",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    },
  });

  // ✅ Mutation para atualizar item individual (toggle IA, toggle Follow-up)
  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ExclusionListItem> }) => {
      const response = await apiRequest("PUT", `/api/exclusion/list/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusion/list"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    },
  });

  // ✅ Mutation para deletar permanentemente
  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/exclusion/list/${id}?permanent=true`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusion/list"] });
      toast({ title: "🗑️ Número removido permanentemente" });
    },
  });

  // ✅ Mutation para reativar (soft delete -> ativo)
  const reactivateItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/exclusion/list/${id}/reactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusion/list"] });
      toast({ title: "✅ Número reativado" });
    },
  });

  // Processar números do textarea
  const parseNumbers = (text: string): string[] => {
    return text
      .split(/[\n,;]+/)
      .map(n => n.replace(/\D/g, "").trim())
      .filter(n => n.length >= 8 && n.length <= 15);
  };

  const parsedNumbers = useMemo(() => parseNumbers(bulkNumbers), [bulkNumbers]);

  // Separar ativos e inativos
  const activeItems = useMemo(() => 
    (exclusionList || []).filter(item => item.isActive), 
    [exclusionList]
  );
  
  const inactiveItems = useMemo(() => 
    (exclusionList || []).filter(item => !item.isActive), 
    [exclusionList]
  );

  // Formatar número
  const formatPhone = (phone: string) => {
    if (phone.length === 13) return `+${phone.slice(0,2)} (${phone.slice(2,4)}) ${phone.slice(4,9)}-${phone.slice(9)}`;
    if (phone.length === 11) return `(${phone.slice(0,2)}) ${phone.slice(2,7)}-${phone.slice(7)}`;
    return phone;
  };

  // Copiar todos os números
  const copyAllNumbers = () => {
    const numbers = activeItems.map(i => i.phoneNumber).join("\n");
    navigator.clipboard.writeText(numbers);
    toast({ title: "📋 Números copiados!" });
  };

  // Handler para adicionar números
  const handleAddNumbers = () => {
    if (parsedNumbers.length === 0) {
      toast({
        title: "Nenhum número válido",
        description: "Cole números com 8-15 dígitos",
        variant: "destructive",
      });
      return;
    }
    addBulkMutation.mutate({ 
      numbers: parsedNumbers, 
      excludeFromFollowup: excludeFollowup 
    });
  };

  // ✅ Toggle IA (isActive) para um número
  const toggleIA = (item: ExclusionListItem) => {
    updateItemMutation.mutate({
      id: item.id,
      data: { isActive: !item.isActive }
    });
  };

  // ✅ Toggle Follow-up para um número
  const toggleFollowup = (item: ExclusionListItem) => {
    updateItemMutation.mutate({
      id: item.id,
      data: { excludeFromFollowup: !item.excludeFromFollowup }
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header Minimalista */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button 
            onClick={() => setLocation("/")}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          
          <div className="flex items-center gap-3">
            <Shield className={cn(
              "h-5 w-5 transition-colors",
              config?.isEnabled ? "text-red-500" : "text-muted-foreground"
            )} />
            <span className="font-medium">Lista de Exclusão</span>
          </div>
          
          <div className="w-10" />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        
        {/* Toggle Principal Global */}
        <Card className={cn(
          "border-2 transition-all duration-300",
          config?.isEnabled 
            ? "border-red-500/50 bg-red-50/50 dark:bg-red-950/20" 
            : "border-muted"
        )}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2.5 rounded-xl transition-colors",
                  config?.isEnabled 
                    ? "bg-red-500 text-white" 
                    : "bg-muted text-muted-foreground"
                )}>
                  <Ban className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">
                    {config?.isEnabled ? "Proteção Ativa" : "Proteção Desativada"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {config?.isEnabled 
                      ? `${activeItems.length} números bloqueados` 
                      : "Ative para bloquear números"
                    }
                  </p>
                </div>
              </div>
              <Switch
                checked={config?.isEnabled ?? false}
                onCheckedChange={(checked) => updateConfigMutation.mutate({ isEnabled: checked })}
                className="data-[state=checked]:bg-red-500"
              />
            </div>
            
            {/* Toggle global follow-up */}
            {config?.isEnabled && (
              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Bloquear também Follow-up global
                  </span>
                </div>
                <Switch
                  checked={config?.followupExclusionEnabled ?? true}
                  onCheckedChange={(checked) => updateConfigMutation.mutate({ followupExclusionEnabled: checked })}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Área de Bulk Import */}
        <Card className={cn(
          "border-2 transition-all",
          activeItems.length === 0 
            ? "border-dashed border-primary/30 bg-primary/5" 
            : ""
        )}>
          <CardContent className="p-4 md:p-6">
            {activeItems.length === 0 && (
              <div className="text-center mb-6">
                <div className="inline-flex p-3 bg-primary/10 rounded-2xl mb-4">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-bold mb-2">
                  Bloqueie números indesejados
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Cole os números que a IA <strong>não deve responder</strong>. 
                  Um por linha ou separados por vírgula.
                </p>
              </div>
            )}

            <div className="space-y-4">
              <Textarea
                placeholder={`Cole números aqui (um por linha ou separados por vírgula)\n\nExemplos:\n5511987654321\n5511912345678\n11999887766`}
                value={bulkNumbers}
                onChange={(e) => setBulkNumbers(e.target.value)}
                className={cn(
                  "font-mono text-sm resize-none bg-background",
                  activeItems.length === 0 ? "min-h-[180px]" : "min-h-[100px]"
                )}
              />

              {/* Preview de números detectados */}
              {parsedNumbers.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    {parsedNumbers.length} número{parsedNumbers.length !== 1 ? "s" : ""} detectado{parsedNumbers.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}

              {/* Toggle Follow-up para novos números */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Também bloquear follow-up automático
                  </span>
                </div>
                <Switch
                  checked={excludeFollowup}
                  onCheckedChange={setExcludeFollowup}
                />
              </div>

              {/* CTA Principal */}
              <Button 
                onClick={handleAddNumbers}
                disabled={parsedNumbers.length === 0 || addBulkMutation.isPending}
                className="w-full h-12 text-base font-semibold gap-2"
                size="lg"
              >
                {addBulkMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Ban className="h-5 w-5" />
                )}
                Bloquear {parsedNumbers.length > 0 ? `${parsedNumbers.length} Número${parsedNumbers.length !== 1 ? "s" : ""}` : "Números"} em Massa
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Números com Controles Individuais */}
        {activeItems.length > 0 && (
          <div className="space-y-4">
            {/* Header da Lista */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">
                  Números Bloqueados
                </h3>
                <Badge variant="destructive" className="rounded-full">
                  {activeItems.length}
                </Badge>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={copyAllNumbers}
                className="gap-1.5 text-muted-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar todos
              </Button>
            </div>

            {/* Legenda */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
              <div className="flex items-center gap-1">
                <Bot className="h-3.5 w-3.5" />
                <span>IA</span>
              </div>
              <div className="flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Follow-up</span>
              </div>
            </div>

            {/* Grid de Números com Controles */}
            <div className="space-y-2">
              {activeItems.map((item) => (
                <Card 
                  key={item.id}
                  className={cn(
                    "transition-all hover:shadow-md",
                    item.isActive 
                      ? "border-red-200 dark:border-red-900/50" 
                      : "border-dashed opacity-60"
                  )}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      {/* Número */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={cn(
                          "p-1.5 rounded-lg shrink-0",
                          item.isActive 
                            ? "bg-red-100 dark:bg-red-900/30" 
                            : "bg-muted"
                        )}>
                          <Ban className={cn(
                            "h-4 w-4",
                            item.isActive 
                              ? "text-red-600 dark:text-red-400" 
                              : "text-muted-foreground"
                          )} />
                        </div>
                        <span className="font-mono text-sm truncate">
                          {formatPhone(item.phoneNumber)}
                        </span>
                      </div>

                      {/* Controles Individuais */}
                      <div className="flex items-center gap-3 shrink-0">
                        {/* Toggle IA (isActive) */}
                        <div className="flex items-center gap-1.5" title="Bloquear IA">
                          <Bot className={cn(
                            "h-4 w-4",
                            item.isActive ? "text-red-500" : "text-muted-foreground"
                          )} />
                          <Switch
                            checked={item.isActive}
                            onCheckedChange={() => toggleIA(item)}
                            className="data-[state=checked]:bg-red-500 scale-90"
                          />
                        </div>

                        {/* Toggle Follow-up */}
                        <div className="flex items-center gap-1.5" title="Bloquear Follow-up">
                          <MessageSquare className={cn(
                            "h-4 w-4",
                            item.excludeFromFollowup ? "text-orange-500" : "text-muted-foreground"
                          )} />
                          <Switch
                            checked={item.excludeFromFollowup}
                            onCheckedChange={() => toggleFollowup(item)}
                            className="data-[state=checked]:bg-orange-500 scale-90"
                          />
                        </div>

                        {/* Botão Excluir Permanente */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => deleteItemMutation.mutate(item.id)}
                          title="Excluir permanentemente"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Status visual */}
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t text-xs">
                      <Badge 
                        variant={item.isActive ? "destructive" : "secondary"}
                        className="gap-1"
                      >
                        {item.isActive ? (
                          <>
                            <PowerOff className="h-3 w-3" />
                            IA Bloqueada
                          </>
                        ) : (
                          <>
                            <Power className="h-3 w-3" />
                            IA Liberada
                          </>
                        )}
                      </Badge>
                      
                      <Badge 
                        variant={item.excludeFromFollowup ? "outline" : "secondary"}
                        className={cn(
                          "gap-1",
                          item.excludeFromFollowup && "border-orange-500 text-orange-600"
                        )}
                      >
                        {item.excludeFromFollowup ? (
                          <>
                            <MessageSquare className="h-3 w-3" />
                            Follow-up Bloqueado
                          </>
                        ) : (
                          <>
                            <MessageSquare className="h-3 w-3" />
                            Follow-up Liberado
                          </>
                        )}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Números Desativados (soft deleted) */}
        {inactiveItems.length > 0 && (
          <div className="mt-6 pt-6 border-t">
            <div className="flex items-center gap-2 mb-3">
              <h4 className="text-sm font-medium text-muted-foreground">
                Desativados (IA liberada)
              </h4>
              <Badge variant="secondary" className="rounded-full text-xs">
                {inactiveItems.length}
              </Badge>
            </div>
            
            <div className="space-y-2">
              {inactiveItems.map((item) => (
                <Card
                  key={item.id}
                  className="border-dashed opacity-60 hover:opacity-100 transition-opacity"
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-sm text-muted-foreground">
                        {formatPhone(item.phoneNumber)}
                      </span>
                      
                      <div className="flex items-center gap-2">
                        {/* Reativar */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-green-600 hover:text-green-700 hover:bg-green-100"
                          onClick={() => reactivateItemMutation.mutate(item.id)}
                        >
                          <RotateCcw className="h-4 w-4" />
                          Reativar
                        </Button>
                        
                        {/* Excluir permanente */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => deleteItemMutation.mutate(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Info Box */}
        <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/50">
          <CardContent className="p-4">
            <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Como funciona a Lista de Exclusão
            </h4>
            <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1.5">
              <li className="flex items-start gap-2">
                <Bot className="h-4 w-4 mt-0.5 shrink-0" />
                <span><strong>IA Bloqueada:</strong> A IA não responde automaticamente para esse número</span>
              </li>
              <li className="flex items-start gap-2">
                <MessageSquare className="h-4 w-4 mt-0.5 shrink-0" />
                <span><strong>Follow-up Bloqueado:</strong> O sistema não envia mensagens de follow-up automático</span>
              </li>
              <li className="flex items-start gap-2">
                <Power className="h-4 w-4 mt-0.5 shrink-0" />
                <span><strong>Controle Individual:</strong> Ative/desative IA e Follow-up separadamente por número</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
