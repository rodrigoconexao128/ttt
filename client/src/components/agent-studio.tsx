import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Bot, ArrowRight, Sparkles, MessageSquare, Edit3, 
  Loader2, Send, Eye, Code, Smartphone, Monitor, 
  CheckCircle2, Wand2, RefreshCw, Settings, Zap,
  Undo2, Redo2, History, ChevronUp, ChevronDown
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface AgentStudioProps {
  initialPrompt: string;
  onSave: (prompt: string) => void;
  onNavigateToConnect?: () => void;
  isNew?: boolean; // Se é um agente recém-criado
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  isEditing?: boolean;
}

interface SimulatorMessage {
  id: string;
  role: "user" | "agent";
  message: string;
  time: string;
}

// Interface para histórico de versões do prompt
interface PromptHistoryEntry {
  id: string;
  prompt: string;
  instruction: string;
  timestamp: Date;
  summary: string;
}

// Constantes para controle de histórico
const MAX_CHAT_MESSAGES_VISIBLE = 50; // Mensagens visíveis por padrão
const CHAT_LOAD_INCREMENT = 20; // Mensagens carregadas por vez

export function AgentStudio({ initialPrompt, onSave, onNavigateToConnect, isNew = false }: AgentStudioProps) {
  const { toast } = useToast();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const simulatorEndRef = useRef<HTMLDivElement>(null);
  
  // Estado do prompt
  const [currentPrompt, setCurrentPrompt] = useState(initialPrompt);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Estado do chat de edição com lazy loading
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [visibleMessages, setVisibleMessages] = useState(MAX_CHAT_MESSAGES_VISIBLE);
  const [editInput, setEditInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Sistema de Undo/Redo (histórico de versões)
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showHistory, setShowHistory] = useState(false);
  
  // Estado do simulador
  const [simulatorMessages, setSimulatorMessages] = useState<SimulatorMessage[]>([]);
  const [simulatorInput, setSimulatorInput] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  
  // View mode
  const [activeView, setActiveView] = useState<"chat" | "code">("chat");
  const [mobileView, setMobileView] = useState<"editor" | "simulator">("editor");

  // Inicialização
  useEffect(() => {
    // Se é agente novo, mostra mensagem de boas-vindas
    if (isNew && chatMessages.length === 0) {
      setChatMessages([{
        id: "welcome",
        role: "system",
        content: "🎉 Agente criado! Você pode me dizer ajustes que quer fazer ou testar no simulador ao lado.",
        timestamp: new Date()
      }]);
    }
  }, [isNew]);

  // Scroll automático
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    simulatorEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [simulatorMessages]);

  // Atualiza quando prompt inicial mudar
  useEffect(() => {
    setCurrentPrompt(initialPrompt);
    // Inicializa histórico com prompt inicial
    if (promptHistory.length === 0) {
      setPromptHistory([{
        id: "initial",
        prompt: initialPrompt,
        instruction: "Prompt inicial",
        timestamp: new Date(),
        summary: "Versão original"
      }]);
      setHistoryIndex(0);
    }
  }, [initialPrompt]);

  // ============ FUNÇÕES DE HISTÓRICO (UNDO/REDO) ============
  
  const addToHistory = useCallback((newPrompt: string, instruction: string, summary: string) => {
    const newEntry: PromptHistoryEntry = {
      id: `history-${Date.now()}`,
      prompt: newPrompt,
      instruction,
      timestamp: new Date(),
      summary
    };
    
    // Remove entradas futuras se estamos no meio do histórico
    const newHistory = [...promptHistory.slice(0, historyIndex + 1), newEntry];
    setPromptHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [promptHistory, historyIndex]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < promptHistory.length - 1;

  const handleUndo = useCallback(() => {
    if (canUndo) {
      const newIndex = historyIndex - 1;
      const previousEntry = promptHistory[newIndex];
      setCurrentPrompt(previousEntry.prompt);
      setHistoryIndex(newIndex);
      setHasChanges(true);
      
      // Adiciona mensagem no chat
      setChatMessages(prev => [...prev, {
        id: `system-undo-${Date.now()}`,
        role: "system",
        content: `⏪ Desfez: "${previousEntry.instruction}"`,
        timestamp: new Date()
      }]);
    }
  }, [canUndo, historyIndex, promptHistory]);

  const handleRedo = useCallback(() => {
    if (canRedo) {
      const newIndex = historyIndex + 1;
      const nextEntry = promptHistory[newIndex];
      setCurrentPrompt(nextEntry.prompt);
      setHistoryIndex(newIndex);
      setHasChanges(true);
      
      // Adiciona mensagem no chat
      setChatMessages(prev => [...prev, {
        id: `system-redo-${Date.now()}`,
        role: "system",
        content: `⏩ Refez: "${nextEntry.instruction}"`,
        timestamp: new Date()
      }]);
    }
  }, [canRedo, historyIndex, promptHistory]);

  const restoreFromHistory = useCallback((index: number) => {
    const entry = promptHistory[index];
    if (entry) {
      setCurrentPrompt(entry.prompt);
      setHistoryIndex(index);
      setHasChanges(true);
      setShowHistory(false);
      
      setChatMessages(prev => [...prev, {
        id: `system-restore-${Date.now()}`,
        role: "system",
        content: `🔄 Restaurado: "${entry.instruction}" (${entry.timestamp.toLocaleTimeString()})`,
        timestamp: new Date()
      }]);
    }
  }, [promptHistory]);

  // ============ LAZY LOADING DO CHAT ============
  
  const loadMoreMessages = useCallback(() => {
    setVisibleMessages(prev => Math.min(prev + CHAT_LOAD_INCREMENT, chatMessages.length));
  }, [chatMessages.length]);

  const hasMoreMessages = chatMessages.length > visibleMessages;
  const displayedMessages = chatMessages.slice(-visibleMessages);

  // ============ EDIÇÃO VIA CHAT ============
  const handleEditPrompt = async () => {
    if (!editInput.trim() || isProcessing) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: editInput,
      timestamp: new Date()
    };
    
    const currentInstruction = editInput;
    setChatMessages(prev => [...prev, userMessage]);
    setEditInput("");
    setIsProcessing(true);

    try {
      // Chama API de edição com novo engine
      const response = await apiRequest("POST", "/api/agent/edit-prompt", {
        currentPrompt,
        instruction: currentInstruction
      });
      
      const data = await response.json();
      
      if (data.success && data.newPrompt && data.newPrompt !== currentPrompt) {
        // Adiciona ao histórico antes de atualizar
        addToHistory(data.newPrompt, currentInstruction, data.summary || "Edição aplicada");
        
        setCurrentPrompt(data.newPrompt);
        setHasChanges(true);
        
        // Mensagem de confirmação com feedback detalhado
        const feedbackContent = data.feedbackMessage || data.summary || "Mudanças aplicadas!";
        const changesInfo = data.changes?.length > 0 
          ? `\n\n📋 ${data.changes.length} operação(ões)` 
          : "";
        
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: feedbackContent + changesInfo,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, assistantMessage]);
        
        toast({
          title: "✅ Prompt atualizado",
          description: data.summary || "Mudanças aplicadas com sucesso!"
        });
      } else {
        // Nenhuma mudança feita
        const warningMessage: ChatMessage = {
          id: `warning-${Date.now()}`,
          role: "assistant",
          content: data.feedbackMessage || `⚠️ Não consegui aplicar essa mudança. Tente ser mais específico.\n\n💡 Dicas:\n• Para mudar nome: "mude o nome para X"\n• Para mudar preço: "preço: R$50"\n• Para remover: "remova a parte sobre X"\n• Para adicionar: "adicione que fechamos às 22h"`,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, warningMessage]);
      }
    } catch (error: any) {
      console.error("Erro ao editar prompt:", error);
      
      // Mensagem de erro amigável
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `❌ Erro ao processar. Tente novamente ou edite manualmente clicando em "Código".`,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  // ============ SIMULADOR ============
  const handleSimulate = async () => {
    if (!simulatorInput.trim() || isSimulating) return;

    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    // Adiciona mensagem do usuário
    const userMsg: SimulatorMessage = {
      id: `sim-user-${Date.now()}`,
      role: "user",
      message: simulatorInput,
      time
    };
    setSimulatorMessages(prev => [...prev, userMsg]);
    setSimulatorInput("");
    setIsSimulating(true);

    try {
      // Usa o prompt atual para teste
      const response = await apiRequest("POST", "/api/agent/test", {
        message: simulatorInput,
        customPrompt: hasChanges ? currentPrompt : undefined // Se tem mudanças não salvas, usa o atual
      });
      
      const data = await response.json();
      
      // Adiciona resposta do agente
      const agentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const agentMsg: SimulatorMessage = {
        id: `sim-agent-${Date.now()}`,
        role: "agent",
        message: data?.response || "Sem resposta",
        time: agentTime
      };
      setSimulatorMessages(prev => [...prev, agentMsg]);
      
    } catch (error: any) {
      toast({
        title: "Erro no simulador",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSimulating(false);
    }
  };

  // ============ SALVAR ============
  const handleSave = () => {
    onSave(currentPrompt);
    setHasChanges(false);
    toast({
      title: "Salvo!",
      description: "Configurações do agente atualizadas."
    });
    
    // Se for novo e tiver callback, redireciona
    if (isNew && onNavigateToConnect) {
      setTimeout(() => {
        onNavigateToConnect();
      }, 1000);
    }
  };

  // ============ SUGESTÕES RÁPIDAS ============
  const quickActions = [
    { label: "Mais formal", instruction: "Torne o tom mais formal e profissional" },
    { label: "Mais vendedor", instruction: "Adicione técnicas de vendas e persuasão" },
    { label: "Mais curto", instruction: "Faça as respostas serem mais curtas e diretas" },
    { label: "Mais emojis", instruction: "Use mais emojis nas respostas" },
  ];

  // ============ RENDER ============
  return (
    <div className="flex flex-col h-full">
      
      {/* Mobile Tab Switcher */}
      <div className="md:hidden flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <Tabs value={mobileView} onValueChange={(v) => setMobileView(v as any)}>
          <TabsList className="grid grid-cols-2 w-full max-w-xs">
            <TabsTrigger value="editor" className="text-xs">
              <Edit3 className="w-3 h-3 mr-1" />
              Editor
            </TabsTrigger>
            <TabsTrigger value="simulator" className="text-xs">
              <Smartphone className="w-3 h-3 mr-1" />
              Simulador
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        {hasChanges && (
          <Button size="sm" onClick={handleSave} className="ml-2">
            <Zap className="w-3 h-3 mr-1" />
            Salvar
          </Button>
        )}
      </div>

      {/* Main Split View */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* ============ LEFT PANEL: EDITOR ============ */}
        <div className={cn(
          "flex-1 flex flex-col border-r bg-background",
          mobileView !== "editor" && "hidden md:flex"
        )}>
          
          {/* Editor Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Editor de Agente</h3>
                <p className="text-[10px] text-muted-foreground">
                  {activeView === "chat" ? "Converse para editar" : "Edite o código"}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Undo/Redo Buttons */}
              <div className="flex items-center gap-0.5 mr-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className="h-8 w-8 p-0"
                  title="Desfazer (Ctrl+Z)"
                >
                  <Undo2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRedo}
                  disabled={!canRedo}
                  className="h-8 w-8 p-0"
                  title="Refazer (Ctrl+Y)"
                >
                  <Redo2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHistory(!showHistory)}
                  className={cn("h-8 w-8 p-0", showHistory && "bg-muted")}
                  title="Histórico de versões"
                >
                  <History className="w-4 h-4" />
                </Button>
              </div>

              {/* View Toggle */}
              <div className="hidden md:flex bg-muted rounded-lg p-0.5">
                <Button
                  variant={activeView === "chat" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveView("chat")}
                  className="h-7 px-2 text-xs"
                >
                  <MessageSquare className="w-3 h-3 mr-1" />
                  Chat
                </Button>
                <Button
                  variant={activeView === "code" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveView("code")}
                  className="h-7 px-2 text-xs"
                >
                  <Code className="w-3 h-3 mr-1" />
                  Código
                </Button>
              </div>
              
              {/* Save Button (desktop) */}
              {hasChanges && (
                <Button size="sm" onClick={handleSave} className="hidden md:flex">
                  <Zap className="w-3 h-3 mr-1" />
                  Salvar
                </Button>
              )}
            </div>
          </div>

          {/* History Panel (collapsible) */}
          {showHistory && promptHistory.length > 1 && (
            <div className="border-b bg-muted/30 px-4 py-2 max-h-40 overflow-y-auto">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                📜 Histórico de versões ({promptHistory.length})
              </p>
              <div className="space-y-1">
                {[...promptHistory].reverse().map((entry, idx) => {
                  const actualIndex = promptHistory.length - 1 - idx;
                  const isActive = actualIndex === historyIndex;
                  return (
                    <button
                      key={entry.id}
                      onClick={() => restoreFromHistory(actualIndex)}
                      className={cn(
                        "w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors",
                        isActive 
                          ? "bg-primary/10 border border-primary/30" 
                          : "hover:bg-muted"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className={cn("truncate", isActive && "font-medium")}>
                          {entry.instruction}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-2 flex-shrink-0">
                          {entry.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      {entry.summary && entry.summary !== entry.instruction && (
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                          {entry.summary}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Editor Content */}
          {activeView === "chat" ? (
            <>
              {/* Chat Messages with Lazy Loading */}
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                
                {/* Load More Button */}
                {hasMoreMessages && (
                  <div className="flex justify-center pb-2">
                    <button
                      onClick={loadMoreMessages}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <ChevronUp className="w-3 h-3" />
                      Carregar mais ({chatMessages.length - visibleMessages} anteriores)
                    </button>
                  </div>
                )}
                
                {/* Mensagem inicial */}
                {chatMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                      <Wand2 className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-lg">Editor Inteligente</h4>
                      <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                        Diga o que quer mudar no seu agente. Ex: "torne mais formal" ou "adicione foco em vendas"
                      </p>
                    </div>
                    
                    {/* Quick Actions */}
                    <div className="flex flex-wrap gap-2 justify-center mt-4">
                      {quickActions.map((action, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          onClick={() => setEditInput(action.instruction)}
                          className="text-xs h-8 rounded-full"
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Histórico de chat com lazy loading */}
                {displayedMessages.map((msg) => (
                  <div key={msg.id} className={cn(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}>
                    <div className={cn(
                      "px-4 py-2.5 rounded-2xl max-w-[85%] shadow-sm",
                      msg.role === "user" 
                        ? "bg-primary text-primary-foreground rounded-br-md" 
                        : msg.role === "system"
                        ? "bg-muted/50 text-muted-foreground text-center mx-auto text-sm"
                        : "bg-muted rounded-bl-md"
                    )}>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                
                {/* Loading */}
                {isProcessing && (
                  <div className="flex justify-start">
                    <div className="bg-muted px-4 py-3 rounded-2xl rounded-bl-md">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Aplicando mudanças...</span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>
              
              {/* Chat Input */}
              <div className="border-t bg-muted/10 p-3">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Ex: Torne as respostas mais curtas..."
                    value={editInput}
                    onChange={(e) => setEditInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleEditPrompt();
                      }
                    }}
                    className="flex-1 min-h-[44px] max-h-[120px] resize-none rounded-xl bg-background"
                    rows={1}
                  />
                  <Button
                    onClick={handleEditPrompt}
                    disabled={isProcessing || !editInput.trim()}
                    size="icon"
                    className="h-11 w-11 rounded-xl flex-shrink-0"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                
                {/* Quick action chips */}
                {editInput === "" && chatMessages.length > 0 && (
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {quickActions.slice(0, 3).map((action, i) => (
                      <button
                        key={i}
                        onClick={() => setEditInput(action.instruction)}
                        className="text-[10px] px-2 py-1 rounded-full border border-border/50 bg-background hover:bg-muted transition-colors"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Code View */
            <div className="flex-1 flex flex-col p-4">
              <Textarea
                value={currentPrompt}
                onChange={(e) => {
                  setCurrentPrompt(e.target.value);
                  setHasChanges(true);
                }}
                className="flex-1 font-mono text-sm resize-none bg-zinc-950 text-green-400 rounded-xl p-4 border-zinc-800"
                spellCheck={false}
              />
            </div>
          )}
        </div>

        {/* ============ RIGHT PANEL: SIMULATOR ============ */}
        <div className={cn(
          "w-full md:w-[400px] lg:w-[450px] flex flex-col bg-[#e5ddd5] dark:bg-zinc-900",
          mobileView !== "simulator" && "hidden md:flex"
        )}>
          
          {/* Simulator Header */}
          <div className="bg-[#075E54] dark:bg-zinc-800 text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">Simulador WhatsApp</p>
              <p className="text-xs text-white/70">
                Teste seu agente em tempo real
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSimulatorMessages([])}
              className="text-white/70 hover:text-white hover:bg-white/10 text-xs"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Limpar
            </Button>
          </div>

          {/* Simulator Messages */}
          <div 
            className="flex-1 overflow-y-auto p-4 space-y-3"
            style={{ 
              backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' 
            }}
          >
            {/* Empty state */}
            {simulatorMessages.length === 0 && (
              <div className="flex justify-center">
                <div className="bg-[#FCF4CB] dark:bg-yellow-900/30 text-[#54656F] dark:text-yellow-200 text-xs px-4 py-2 rounded-lg shadow-sm text-center max-w-[250px]">
                  <Smartphone className="w-4 h-4 mx-auto mb-1" />
                  Teste como seu agente responde. Digite uma mensagem abaixo.
                </div>
              </div>
            )}

            {/* Messages */}
            {simulatorMessages.map((msg) => (
              <div key={msg.id} className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}>
                <div className={cn(
                  "px-3 py-2 rounded-lg max-w-[80%] shadow-sm",
                  msg.role === "user" 
                    ? "bg-[#DCF8C6] dark:bg-green-800 text-[#303030] dark:text-white rounded-tr-none" 
                    : "bg-white dark:bg-zinc-700 text-[#303030] dark:text-white rounded-tl-none"
                )}>
                  <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                  <p className={cn(
                    "text-[10px] text-right mt-1",
                    msg.role === "user" ? "text-[#667781] dark:text-green-300" : "text-[#667781] dark:text-zinc-400"
                  )}>
                    {msg.time} {msg.role === "user" && "✓✓"}
                  </p>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isSimulating && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-zinc-700 px-4 py-3 rounded-lg rounded-tl-none shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-xs text-muted-foreground">digitando...</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={simulatorEndRef} />
          </div>

          {/* Simulator Input */}
          <div className="bg-[#F0F0F0] dark:bg-zinc-800 px-3 py-2 flex items-end gap-2 flex-shrink-0">
            <Textarea
              placeholder="Digite sua mensagem..."
              value={simulatorInput}
              onChange={(e) => setSimulatorInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && simulatorInput.trim()) {
                  e.preventDefault();
                  handleSimulate();
                }
              }}
              className="flex-1 resize-none rounded-2xl border-0 bg-white dark:bg-zinc-700 min-h-[44px] max-h-[120px] py-3 px-4 text-sm"
              rows={1}
            />
            <Button
              onClick={handleSimulate}
              disabled={isSimulating || !simulatorInput.trim()}
              size="icon"
              className="h-11 w-11 rounded-full bg-[#00A884] hover:bg-[#008f6f] flex-shrink-0"
            >
              {isSimulating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ArrowRight className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar (New Agent) */}
      {isNew && (
        <div className="border-t bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-green-800 dark:text-green-200">
              Agente pronto! Teste e depois conecte ao WhatsApp.
            </span>
          </div>
          <Button 
            onClick={() => {
              handleSave();
            }}
            className="bg-green-600 hover:bg-green-700"
          >
            <Zap className="w-4 h-4 mr-2" />
            Salvar e Conectar
          </Button>
        </div>
      )}
    </div>
  );
}
