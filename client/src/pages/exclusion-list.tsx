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
  XCircle,
  Loader2,
  Sparkles,
  Shield,
  Copy,
  RotateCcw
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

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/exclusion/list/${id}?permanent=true`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusion/list"] });
    },
  });

  const reactivateItemMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/exclusion/list/${id}/reactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusion/list"] });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/exclusion/list/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exclusion/list"] });
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
          
          <div className="w-10" /> {/* Spacer for centering */}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        
        {/* Toggle Principal - Eye-catching */}
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
          </CardContent>
        </Card>

        {/* Área Principal - Bulk Import ou Lista */}
        {activeItems.length === 0 ? (
          /* Estado Vazio - Textarea em Destaque */
          <Card className="border-2 border-dashed border-primary/30 bg-primary/5">
            <CardContent className="p-6">
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

              <div className="space-y-4">
                <Textarea
                  placeholder={`Exemplos:\n5511987654321\n5511912345678\n11999887766`}
                  value={bulkNumbers}
                  onChange={(e) => setBulkNumbers(e.target.value)}
                  className="min-h-[180px] font-mono text-sm resize-none bg-background"
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

                {/* Toggle Follow-up */}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm">
                    Também bloquear follow-up automático
                  </span>
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
                  Bloquear {parsedNumbers.length > 0 ? `${parsedNumbers.length} Número${parsedNumbers.length !== 1 ? "s" : ""}` : "Números"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Lista de Números */
          <div className="space-y-4">
            {/* Adicionar mais números */}
            <Card>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <Textarea
                    placeholder="Cole números aqui (um por linha ou separados por vírgula)"
                    value={bulkNumbers}
                    onChange={(e) => setBulkNumbers(e.target.value)}
                    className="min-h-[80px] font-mono text-sm resize-none"
                  />
                  
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {parsedNumbers.length > 0 && (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {parsedNumbers.length} detectados
                        </Badge>
                      )}
                      
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Switch
                          checked={excludeFollowup}
                          onCheckedChange={setExcludeFollowup}
                          className="scale-90"
                        />
                        <span className="text-muted-foreground">+ Follow-up</span>
                      </label>
                    </div>
                    
                    <Button 
                      onClick={handleAddNumbers}
                      disabled={parsedNumbers.length === 0 || addBulkMutation.isPending}
                      size="sm"
                      className="gap-1.5"
                    >
                      {addBulkMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Ban className="h-4 w-4" />
                      )}
                      Bloquear
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

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
              
              {activeItems.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyAllNumbers}
                  className="gap-1.5 text-muted-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar todos
                </Button>
              )}
            </div>

            {/* Grid de Números */}
            <div className="grid gap-2">
              {activeItems.map((item) => (
                <div
                  key={item.id}
                  className="group flex items-center justify-between p-3 bg-card border rounded-lg hover:border-destructive/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-red-100 dark:bg-red-900/30 rounded-lg">
                      <Ban className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                    <span className="font-mono text-sm">
                      {formatPhone(item.phoneNumber)}
                    </span>
                    {item.excludeFromFollowup && (
                      <Badge variant="outline" className="text-xs">
                        +FUP
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-100"
                      onClick={() => removeItemMutation.mutate(item.id)}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
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
              ))}
            </div>

            {/* Números Desativados */}
            {inactiveItems.length > 0 && (
              <div className="mt-6 pt-6 border-t">
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Desativados
                  </h4>
                  <Badge variant="secondary" className="rounded-full text-xs">
                    {inactiveItems.length}
                  </Badge>
                </div>
                
                <div className="grid gap-2">
                  {inactiveItems.map((item) => (
                    <div
                      key={item.id}
                      className="group flex items-center justify-between p-3 bg-muted/30 border border-dashed rounded-lg opacity-60 hover:opacity-100 transition-opacity"
                    >
                      <span className="font-mono text-sm text-muted-foreground">
                        {formatPhone(item.phoneNumber)}
                      </span>
                      
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100"
                          onClick={() => reactivateItemMutation.mutate(item.id)}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
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
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
