import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Smartphone, QrCode, CheckCircle2, XCircle, RefreshCw, Loader2, Hash, ArrowLeft, Bot, Link2, Users, Plus, Trash2, Power, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/supabase";
import { Switch } from "@/components/ui/switch";
import type { WhatsappConnection, Agent } from "@shared/schema";

// Tipo para o método de conexão
type ConnectionMethod = "qr" | "pairing" | null;

// Tipo para conexão com agentes
interface ConnectionWithAgents extends WhatsappConnection {
  agent?: Agent | null;
  assignedAgents?: Array<{
    id: string;
    connectionId: string;
    agentId: string;
    isActive: boolean | null;
    agent?: Agent | null;
  }>;
}

export function ConnectionPanel() {
  const { toast } = useToast();
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isWaitingQrCode, setIsWaitingQrCode] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const qrCodeRef = useRef<string | null>(null);
  const qrCodePollingRef = useRef<NodeJS.Timeout | null>(null);
  const waitingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isWaitingQrCodeRef = useRef<boolean>(false);
  
  // Estados para Pairing Code
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod>(null);
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [isRequestingPairingCode, setIsRequestingPairingCode] = useState<boolean>(false);

  // Estado para form de nova conexão
  const [showNewConnForm, setShowNewConnForm] = useState(false);
  const [newConnName, setNewConnName] = useState("");
  const [newConnType, setNewConnType] = useState("secondary");
  
  // Estado para fluxo de nova conexão (QR/pairing selection)
  const [newConnStep, setNewConnStep] = useState<"form" | "method" | "qr-waiting" | "qr-display" | "pairing-form" | "pairing-waiting" | "pairing-display">("form");
  const [newConnId, setNewConnId] = useState<string | null>(null);
  const [newConnPhoneNumber, setNewConnPhoneNumber] = useState("");
  const [newConnPairingCode, setNewConnPairingCode] = useState<string | null>(null);

  const { data: connection, isLoading, refetch: refetchConnection } = useQuery<WhatsappConnection>({
    queryKey: ["/api/whatsapp/connection"],
    staleTime: 10000, // 10s: evita múltiplas chamadas desnecessárias
  });

  // Query for all connections with agents (multi-connection)
  const { data: allConnections = [], refetch: refetchConnections } = useQuery<ConnectionWithAgents[]>({
    queryKey: ["/api/whatsapp/connections"],
    enabled: !!connection, // Only fetch after main connection loads (auth ready)
    retry: 2,
    retryDelay: 1000,
    staleTime: 15000, // 15s: evita refetch desnecessário ao navegar entre páginas
    refetchOnWindowFocus: false,
  });

  // Mutation para criar nova conexão
  const createConnectionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/whatsapp/connections", {
        connectionName: newConnName || undefined,
        connectionType: newConnType,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      // Save the new connection ID and move to method selection
      setNewConnId(data.id);
      setNewConnStep("method");
      toast({ title: "Conexão criada! Escolha como conectar." });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar conexão", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para deletar conexão
  const deleteConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      return await apiRequest("DELETE", `/api/whatsapp/connections/${connectionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      toast({ title: "Conexão removida com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao remover conexão", description: error.message, variant: "destructive" });
    },
  });

  // Per-connection mutations
  const [connectingConnectionId, setConnectingConnectionId] = useState<string | null>(null);
  const [connectionQrCodes, setConnectionQrCodes] = useState<Record<string, string>>({});

  // Helper to close the new connection flow
  const closeNewConnFlow = useCallback(() => {
    setShowNewConnForm(false);
    setNewConnStep("form");
    setNewConnId(null);
    setNewConnName("");
    setNewConnType("secondary");
    setNewConnPhoneNumber("");
    setNewConnPairingCode(null);
  }, []);

  const connectConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      setConnectingConnectionId(connectionId);
      return await apiRequest("POST", `/api/whatsapp/connections/${connectionId}/connect`);
    },
    onSuccess: (_, connectionId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
      // If this is the new connection flow, move to QR waiting
      if (newConnId && connectionId === newConnId) {
        setNewConnStep("qr-waiting");
      }
      toast({ title: "Conectando... Aguarde o QR Code." });
    },
    onError: (error: Error) => {
      setConnectingConnectionId(null);
      toast({ title: "Erro ao conectar", description: error.message, variant: "destructive" });
    },
  });

  const disconnectConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      return await apiRequest("POST", `/api/whatsapp/connections/${connectionId}/disconnect`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
      toast({ title: "Desconectado com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao desconectar", description: error.message, variant: "destructive" });
    },
  });

  const resetConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      return await apiRequest("POST", `/api/whatsapp/connections/${connectionId}/reset`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
      toast({ title: "Conexão resetada. Escaneie o novo QR Code." });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao resetar", description: error.message, variant: "destructive" });
    },
  });

  const toggleAiMutation = useMutation({
    mutationFn: async ({ connectionId, aiEnabled }: { connectionId: string; aiEnabled: boolean }) => {
      return await apiRequest("PATCH", `/api/whatsapp/connections/${connectionId}/ai-toggle`, { aiEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
      toast({ title: "Configuração de IA atualizada!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar IA", description: error.message, variant: "destructive" });
    },
  });

  // Função para verificar status da conexão durante polling
  // Also loads QR code from database as fallback when WebSocket broadcast fails
  const fetchQrCodeFromDb = useCallback(async () => {
    try {
      const response = await apiRequest("GET", "/api/whatsapp/connection");
      const data = await response.json();
      // Se conectou, parar polling e limpar estados
      if (data && data.isConnected) {
        setIsWaitingQrCode(false);
        isWaitingQrCodeRef.current = false;
        setQrCode(null);
        qrCodeRef.current = null;
        if (qrCodePollingRef.current) {
          clearInterval(qrCodePollingRef.current);
          qrCodePollingRef.current = null;
        }
      } else if (data && data.qrCode && !qrCodeRef.current && isWaitingQrCodeRef.current) {
        // Fallback: load QR code from database if we don't have one yet via WebSocket
        console.log("[QR POLLING] QR Code loaded from database (fallback)");
        setQrCode(data.qrCode);
        qrCodeRef.current = data.qrCode;
        setIsConnecting(false);
        setIsWaitingQrCode(false);
        isWaitingQrCodeRef.current = false;
      }
    } catch (error) {
      console.error("[QR POLLING] Erro ao verificar conexão:", error);
    }
  }, []);

  // Iniciar polling de QR Code quando estiver aguardando
  const startQrCodePolling = useCallback(() => {
    // Limpar polling anterior se existir
    if (qrCodePollingRef.current) {
      clearInterval(qrCodePollingRef.current);
    }
    // Polling a cada 2 segundos
    qrCodePollingRef.current = setInterval(() => {
      fetchQrCodeFromDb();
    }, 2000);
    console.log("[QR POLLING] Iniciado polling de QR Code");
  }, [fetchQrCodeFromDb]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/whatsapp/connect", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
      setIsWaitingQrCode(true);
      isWaitingQrCodeRef.current = true;
      // Iniciar polling imediatamente
      startQrCodePolling();
      // Definir timeout de 60 segundos para parar de aguardar
      if (waitingTimeoutRef.current) {
        clearTimeout(waitingTimeoutRef.current);
      }
      waitingTimeoutRef.current = setTimeout(() => {
        if (isWaitingQrCodeRef.current && !qrCodeRef.current) {
          setIsWaitingQrCode(false);
          isWaitingQrCodeRef.current = false;
          toast({
            title: "Tempo esgotado",
            description: "Não foi possível gerar o QR Code. Tente novamente.",
            variant: "destructive",
          });
          // Parar polling
          if (qrCodePollingRef.current) {
            clearInterval(qrCodePollingRef.current);
            qrCodePollingRef.current = null;
          }
        }
      }, 60000);
      toast({
        title: "Conectando",
        description: "Aguarde o QR Code aparecer...",
      });
    },
    onError: (error: Error) => {
      setIsWaitingQrCode(false);
      isWaitingQrCodeRef.current = false;
      setIsConnecting(false);
      setConnectionMethod(null);
      // Stop polling started in onClick
      if (qrCodePollingRef.current) {
        clearInterval(qrCodePollingRef.current);
        qrCodePollingRef.current = null;
      }
      toast({
        title: "Erro ao conectar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/whatsapp/disconnect", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
      setQrCode(null);
      qrCodeRef.current = null;
      setIsWaitingQrCode(false);
      isWaitingQrCodeRef.current = false;
      setIsConnecting(false);
      // Parar polling
      if (qrCodePollingRef.current) {
        clearInterval(qrCodePollingRef.current);
        qrCodePollingRef.current = null;
      }
      toast({
        title: "Desconectado",
        description: "WhatsApp desconectado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao desconectar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para resetar conexão (self-service)
  const resetMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/whatsapp/reset", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
      toast({
        title: "Conexão resetada",
        description: "Escaneie o QR Code novamente para conectar",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao resetar",
        description: error.message || "Tente novamente em alguns segundos",
        variant: "destructive",
      });
    },
  });

  // Mutation para solicitar Pairing Code (código de 8 caracteres)
  const pairingCodeMutation = useMutation({
    mutationFn: async (phone: string) => {
      const response = await apiRequest("POST", "/api/whatsapp/pairing-code", { phoneNumber: phone });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.code) {
        setPairingCode(data.code);
        setIsRequestingPairingCode(false);
        toast({
          title: "Código gerado!",
          description: `Use o código ${data.code} no seu WhatsApp`,
        });
        // Iniciar polling para verificar conexão
        startQrCodePolling();
      } else {
        throw new Error("Código não retornado pelo servidor");
      }
    },
    onError: (error: Error) => {
      setIsRequestingPairingCode(false);
      setPairingCode(null);
      toast({
        title: "Erro ao gerar código",
        description: error.message || "Tente novamente em alguns segundos",
        variant: "destructive",
      });
    },
  });

  // Função para solicitar pairing code
  const handleRequestPairingCode = () => {
    const cleanPhone = phoneNumber.replace(/\D/g, "");

    // Validação básica de comprimento
    if (cleanPhone.length < 10) {
      toast({
        title: "Número muito curto",
        description: "Digite um número válido com DDI (código do país), DDD e número. Exemplo: 5511999999999",
        variant: "destructive",
      });
      return;
    }

    // Validação para Brasil (começa com 55)
    if (cleanPhone.startsWith("55") && cleanPhone.length < 12) {
      toast({
        title: "Número brasileiro incompleto",
        description: "Para o Brasil, use: 55 + DDD + número. Exemplo: 55 (código país) + 11 (DDD) + 999999999",
        variant: "destructive",
      });
      return;
    }

    // Validação de comprimento máximo
    if (cleanPhone.length > 15) {
      toast({
        title: "Número muito longo",
        description: "O número parece estar incorreto. Verifique e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    setIsRequestingPairingCode(true);
    setPairingCode(null);
    pairingCodeMutation.mutate(cleanPhone);
  };

  // Função para resetar e voltar à seleção de método
  const handleBackToMethodSelection = () => {
    setConnectionMethod(null);
    setQrCode(null);
    qrCodeRef.current = null;
    setPairingCode(null);
    setPhoneNumber("");
    setIsWaitingQrCode(false);
    isWaitingQrCodeRef.current = false;
    setIsConnecting(false);
    if (qrCodePollingRef.current) {
      clearInterval(qrCodePollingRef.current);
      qrCodePollingRef.current = null;
    }
  };

  // NÃO carregamos o QR code do banco de dados porque pode ser um QR code antigo/expirado
  // O QR code deve vir apenas via WebSocket quando é gerado em tempo real
  // ou via polling quando o usuário clica em "Conectar"
  // Quando o connection é atualizado, verificamos se está conectado para limpar estados
  useEffect(() => {
    if (connection?.isConnected) {
      // Se já está conectado, limpa qualquer QR code ou estado de espera
      setQrCode(null);
      qrCodeRef.current = null;
      setIsWaitingQrCode(false);
      isWaitingQrCodeRef.current = false;
      setIsConnecting(false);
      // Limpar estados de pairing code
      setPairingCode(null);
      setPhoneNumber("");
      setConnectionMethod(null);
      setIsRequestingPairingCode(false);
      if (qrCodePollingRef.current) {
        clearInterval(qrCodePollingRef.current);
        qrCodePollingRef.current = null;
      }
    }
  }, [connection?.isConnected]);

  // Per-connection QR polling fallback for "Nova Conexão" flow
  // If WebSocket misses the QR event, this polls the connections endpoint
  useEffect(() => {
    if (newConnStep !== "qr-waiting" || !newConnId) return;

    let pollInterval: NodeJS.Timeout | null = null;
    let pollTimeout: NodeJS.Timeout | null = null;

    const pollNewConnQr = async () => {
      try {
        const response = await apiRequest("GET", "/api/whatsapp/connections");
        const connections = await response.json();
        const target = connections.find((c: any) => c.id === newConnId);
        if (target?.qrCode && !connectionQrCodes[newConnId]) {
          console.log("[NEW CONN QR POLL] QR Code loaded from DB fallback for", newConnId);
          setConnectionQrCodes(prev => ({ ...prev, [newConnId!]: target.qrCode }));
          setNewConnStep("qr-display");
          if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        } else if (target?.isConnected) {
          // Already connected, close flow
          closeNewConnFlow();
          if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        }
      } catch (err) {
        console.error("[NEW CONN QR POLL] Error:", err);
      }
    };

    // Poll every 3 seconds
    pollInterval = setInterval(pollNewConnQr, 3000);
    // Stop after 90 seconds
    pollTimeout = setTimeout(() => {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    }, 90000);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (pollTimeout) clearTimeout(pollTimeout);
    };
  }, [newConnStep, newConnId, connectionQrCodes, closeNewConnFlow]);

  // Poll for QR code when connecting an EXISTING connection card (not "Nova Conexão")
  // This mirrors the "Nova Conexão" polling but for the existing card "Conectar" flow
  useEffect(() => {
    // Only activate when we're connecting an existing card AND don't have a QR yet
    if (!connectingConnectionId || connectionQrCodes[connectingConnectionId]) return;
    // Don't activate if this is part of the "Nova Conexão" flow (handled by the effect above)
    if (newConnId && connectingConnectionId === newConnId) return;

    let pollInterval: NodeJS.Timeout | null = null;
    let pollTimeout: NodeJS.Timeout | null = null;

    const pollExistingConnQr = async () => {
      try {
        const response = await apiRequest("GET", "/api/whatsapp/connections");
        const connections = await response.json();
        const target = connections.find((c: any) => c.id === connectingConnectionId);
        if (target?.qrCode && !connectionQrCodes[connectingConnectionId]) {
          console.log("[EXISTING CONN QR POLL] QR Code loaded from DB fallback for", connectingConnectionId);
          setConnectionQrCodes(prev => ({ ...prev, [connectingConnectionId!]: target.qrCode }));
          if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        } else if (target?.isConnected) {
          // Already connected, stop polling
          console.log("[EXISTING CONN QR POLL] Connection already connected:", connectingConnectionId);
          setConnectingConnectionId(null);
          if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        }
      } catch (err) {
        console.error("[EXISTING CONN QR POLL] Error:", err);
      }
    };

    // Poll every 3 seconds
    pollInterval = setInterval(pollExistingConnQr, 3000);
    // Also do an immediate check
    pollExistingConnQr();
    // Stop after 90 seconds
    pollTimeout = setTimeout(() => {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
      setConnectingConnectionId(null);
    }, 90000);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (pollTimeout) clearTimeout(pollTimeout);
    };
  }, [connectingConnectionId, connectionQrCodes, newConnId]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let isMounted = true;
    let authRetryCount = 0;
    const MAX_AUTH_RETRIES = 15; // Retry up to 15 times (~30s total)

    const connectWebSocket = async () => {
      if (!isMounted) return;
      try {
        let token = await getAuthToken();

        // Retry mechanism for when Supabase session hasn't hydrated from localStorage yet
        if (!token && authRetryCount < MAX_AUTH_RETRIES) {
          authRetryCount++;
          const delay = Math.min(1000 + authRetryCount * 500, 3000); // 1.5s, 2s, 2.5s, 3s...
          console.log(`[WS] Auth token not available yet, retry ${authRetryCount}/${MAX_AUTH_RETRIES} in ${delay}ms...`);
          reconnectTimer = setTimeout(() => {
            if (isMounted) connectWebSocket();
          }, delay);
          return;
        }

        if (!token) {
          console.error("No auth token available for WebSocket connection after all retries");
          return;
        }

        // Reset auth retry count on successful token acquisition
        authRetryCount = 0;

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
        console.log("[WS] Conectando ao WebSocket:", wsUrl);
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          console.log("[WS] WebSocket conectado com sucesso!");
          setWsConnected(true);
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Respond to server pings with pongs to keep connection alive
            if (data.type === "ping") {
              if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: "pong", timestamp: data.timestamp }));
              }
              return;
            }
            
            console.log("[WS] Mensagem recebida:", data.type);

            if (data.type === "qr") {
              console.log("[WS] QR Code recebido via WebSocket!", data.connectionId ? `connectionId: ${data.connectionId}` : "");
              // Track per-connection QR codes
              if (data.connectionId) {
                setConnectionQrCodes(prev => ({ ...prev, [data.connectionId]: data.qr }));
                // If this QR is for the new connection being created, update flow state
                setNewConnId(prevId => {
                  if (prevId && data.connectionId === prevId) {
                    setNewConnStep("qr-display");
                  }
                  return prevId;
                });
              }
              // Only update global (primary card) QR state for primary connection or legacy events
              const isPrimaryQr = !data.connectionId || data.connectionId === connection?.id;
              if (isPrimaryQr) {
                setQrCode(data.qr);
                qrCodeRef.current = data.qr;
                setIsConnecting(false);
                setIsWaitingQrCode(false);
                isWaitingQrCodeRef.current = false;
                // Parar polling quando receber QR code via WebSocket
                if (qrCodePollingRef.current) {
                  clearInterval(qrCodePollingRef.current);
                  qrCodePollingRef.current = null;
                }
              }
            } else if (data.type === "pairing_restarting") {
              // Backend está reconectando após 515 restartRequired
              console.log("[WS] Pairing restart:", data.retryCount, "/", data.maxRetries);
              // Não limpar o código - manter na tela
              // Mostrar indicador de reconexão se quiser (opcional)
            } else if (data.type === "connecting") {
              // Only update global state for primary connection or legacy events (no connectionId)
              const isPrimaryConnecting = !data.connectionId || data.connectionId === connection?.id;
              if (isPrimaryConnecting && !qrCodeRef.current) {
                setQrCode(null);
                setIsConnecting(true);
                setIsWaitingQrCode(false);
                isWaitingQrCodeRef.current = false;
              }
            } else if (data.type === "connected") {
              console.log("[WS] WhatsApp conectado!", data.connectionId || "");
              // Clear per-connection QR
              if (data.connectionId) {
                setConnectionQrCodes(prev => {
                  const next = { ...prev };
                  delete next[data.connectionId];
                  return next;
                });
                setConnectingConnectionId(null);
                // If this is the new connection flow, close it and show success
                setNewConnId(prevId => {
                  if (prevId && data.connectionId === prevId) {
                    setShowNewConnForm(false);
                    setNewConnStep("form");
                    setNewConnId(null);
                    setNewConnName("");
                    setNewConnType("secondary");
                    setNewConnPhoneNumber("");
                    setNewConnPairingCode(null);
                  }
                  return prevId && data.connectionId === prevId ? null : prevId;
                });
              }
              // Only update global (primary card) state for primary connection or legacy events
              const isPrimaryConnected = !data.connectionId || data.connectionId === connection?.id;
              if (isPrimaryConnected) {
                setQrCode(null);
                qrCodeRef.current = null;
                setIsConnecting(false);
                setIsWaitingQrCode(false);
                isWaitingQrCodeRef.current = false;
                // Parar polling
                if (qrCodePollingRef.current) {
                  clearInterval(qrCodePollingRef.current);
                  qrCodePollingRef.current = null;
                }
              }
              queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
              queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
              toast({
                title: "Conectado!",
                description: data.connectionId && data.connectionId !== connection?.id
                  ? "Nova conexão WhatsApp conectada com sucesso"
                  : "WhatsApp conectado com sucesso",
              });
            } else if (data.type === "disconnected") {
              console.log("[WS] WhatsApp desconectado!", data.connectionId || "", data.reason || "");
              // Clear per-connection QR
              if (data.connectionId) {
                setConnectionQrCodes(prev => {
                  const next = { ...prev };
                  delete next[data.connectionId];
                  return next;
                });
                setConnectingConnectionId(null);
              }
              
              // Only update global (primary card) state for primary connection or legacy events
              const isPrimaryDisconnected = !data.connectionId || data.connectionId === connection?.id;
              if (isPrimaryDisconnected) {
                // Only reset connection method if user has an explicit reason (not stale events)
                if (data.reason) {
                  setConnectionMethod(null);
                  setPairingCode(null);
                  setPhoneNumber("");
                  setIsRequestingPairingCode(false);
                }
                
                setQrCode(null);
                qrCodeRef.current = null;
                setIsConnecting(false);
                setIsWaitingQrCode(false);
                isWaitingQrCodeRef.current = false;
                // Parar polling
                if (qrCodePollingRef.current) {
                  clearInterval(qrCodePollingRef.current);
                  qrCodePollingRef.current = null;
                }
                // Parar timeout
                if (waitingTimeoutRef.current) {
                  clearTimeout(waitingTimeoutRef.current);
                  waitingTimeoutRef.current = null;
                }
              }
              queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
              queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connections"] });
              
              // Mostrar mensagem apropriada baseada no motivo
              if (data.reason === "max_attempts") {
                toast({
                  title: "Conexão falhou",
                  description: "Não foi possível conectar após várias tentativas. Clique em Conectar para tentar novamente.",
                  variant: "destructive",
                });
              } else if (data.reason === "pairing_failed") {
                toast({
                  title: "Não foi possível conectar ao dispositivo",
                  description: "O pareamento falhou. Verifique o número e tente novamente, ou use QR Code.",
                  variant: "destructive",
                });
              } else if (data.reason === "pairing_rate_limited") {
                toast({
                  title: "WhatsApp limitou as tentativas",
                  description: "O WhatsApp bloqueou temporariamente as tentativas de conexão. Aguarde 20-40 minutos e tente novamente. Use QR Code para conectar agora.",
                  variant: "destructive",
                });
              } else if (data.reason === "pairing_expired") {
                toast({
                  title: "Código expirado",
                  description: "O tempo para digitar o código acabou. Gere um novo código e tente novamente.",
                  variant: "destructive",
                });
              } else if (data.reason === "logout") {
                toast({
                  title: "WhatsApp desconectado",
                  description: "Você foi desconectado do WhatsApp. Clique em Conectar para gerar um novo QR Code.",
                });
              }
            }
          } catch (error) {
            console.error("Error parsing WebSocket message:", error);
          }
        };

        socket.onerror = (error) => {
          console.error("[WS] WebSocket error:", error);
          setWsConnected(false);
        };

        socket.onclose = () => {
          console.log("[WS] WebSocket connection closed");
          setWsConnected(false);
          // Auto-reconnect after 3 seconds
          if (isMounted) {
            reconnectTimer = setTimeout(() => {
              console.log("[WS] Auto-reconnecting WebSocket...");
              connectWebSocket();
            }, 3000);
          }
        };

        setWs(socket);
      } catch (error) {
        console.error("Error connecting to WebSocket:", error);
        setWsConnected(false);
      }
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.onclose = null; // Prevent auto-reconnect on intentional close
        socket.close();
      }
      // Limpar polling e timeout ao desmontar
      if (qrCodePollingRef.current) {
        clearInterval(qrCodePollingRef.current);
        qrCodePollingRef.current = null;
      }
      if (waitingTimeoutRef.current) {
        clearTimeout(waitingTimeoutRef.current);
        waitingTimeoutRef.current = null;
      }
    };
  }, [toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-2xl mx-auto p-4 md:p-8 space-y-6 md:space-y-8 pb-24 md:pb-8">
        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold">Conecte seu WhatsApp</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Escolha um método e conecte em menos de 2 minutos para começar a atender.
          </p>
        </div>

        <Card className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Status da Conexão</h3>
                <p className="text-sm text-muted-foreground">
                  {connection?.phoneNumber || "Nenhum número conectado"}
                </p>
              </div>
            </div>
            <Badge
              variant={connection?.isConnected ? "default" : "secondary"}
              className="gap-1"
              data-testid="badge-connection-status"
            >
              {connection?.isConnected ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  Conectado
                </>
              ) : (
                <>
                  <XCircle className="w-3 h-3" />
                  Desconectado
                </>
              )}
            </Badge>
          </div>

          {/* Seleção de método de conexão - NOVA VERSÃO MINIMALISTA COM CTA FORTE */}
          {!connection?.isConnected && !connectionMethod && !qrCode && !isWaitingQrCode && !isConnecting && !pairingCode && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
               {/* Header Instruction */}
               <div className="text-center space-y-2 mb-2">
                  <h3 className="text-lg font-medium text-foreground">Como você prefere conectar?</h3>
                  <p className="text-sm text-muted-foreground mx-auto max-w-sm">
                    Escolha a opção mais fácil para você abaixo.
                  </p>
               </div>

               <div className="grid gap-4 md:grid-cols-2">
                  {/* QR Code Option */}
                  <button
                    onClick={() => {
                        setConnectionMethod("qr");
                        // Set waiting state IMMEDIATELY to avoid blank UI gap
                        setIsWaitingQrCode(true);
                        isWaitingQrCodeRef.current = true;
                        // Start polling right away so we catch the QR even without WebSocket
                        startQrCodePolling();
                        connectMutation.mutate();
                    }}
                    disabled={connectMutation.isPending}
                    className="group relative flex flex-col items-center p-6 gap-4 rounded-xl border-2 border-muted bg-card hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-all duration-300 shadow-sm hover:shadow-md text-center cursor-pointer"
                    data-testid="button-connect-qr"
                  >
                    <div className="absolute top-3 right-3">
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 font-normal text-[10px] uppercase tracking-wider">
                            Recomendado
                        </Badge>
                    </div>
                    <div className="h-16 w-16 rounded-full bg-emerald-100/50 dark:bg-emerald-900/30 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                        <QrCode className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="space-y-1">
                        <h4 className="font-semibold text-lg group-hover:text-emerald-700 dark:group-hover:text-emerald-400">Escanear QR Code</h4>
                        <p className="text-xs text-muted-foreground max-w-[140px] mx-auto">
                            Abra a câmera do WhatsApp e aponte para a tela.
                        </p>
                    </div>
                    <div className="mt-2 w-full py-2 bg-muted/50 rounded-lg text-xs font-medium text-foreground group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        Escolher QR Code
                    </div>
                  </button>

                  {/* Pairing Code Option */}
                  <button
                    onClick={() => setConnectionMethod("pairing")}
                    className="group relative flex flex-col items-center p-6 gap-4 rounded-xl border-2 border-muted bg-card hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all duration-300 shadow-sm hover:shadow-md text-center cursor-pointer"
                    data-testid="button-connect-pairing"
                  >
                     <div className="h-16 w-16 rounded-full bg-blue-100/50 dark:bg-blue-900/30 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                        <Hash className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="space-y-1">
                        <h4 className="font-semibold text-lg group-hover:text-blue-700 dark:group-hover:text-blue-400">Código de 8 Dígitos</h4>
                        <p className="text-xs text-muted-foreground max-w-[140px] mx-auto">
                            Digite seu número e receba um código no celular.
                        </p>
                    </div>
                     <div className="mt-2 w-full py-2 bg-muted/50 rounded-lg text-xs font-medium text-foreground group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        Escolher Código
                    </div>
                  </button>
               </div>

                {/* Steps Footer */}
               <div className="pt-6 border-t mt-4">
                 <div className="flex justify-between text-xs text-muted-foreground px-2">
                    <span className="flex items-center gap-1.5"><div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">1</div> Escolha</span>
                    <span className="flex items-center gap-1.5"><div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">2</div> Conecte</span>
                    <span className="flex items-center gap-1.5"><div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">3</div> Atenda</span>
                 </div>
               </div>
            </div>
          )}

          {/* Formulário de Pairing Code */}
          {!connection?.isConnected && connectionMethod === "pairing" && !pairingCode && !isRequestingPairingCode && (
            <div className="space-y-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToMethodSelection}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
              
              <div className="p-6 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md space-y-4">
                <div className="text-center space-y-2">
                  <Hash className="w-10 h-10 mx-auto text-blue-600" />
                  <h4 className="font-medium text-blue-900 dark:text-blue-100">Conectar com Código</h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Digite seu número de WhatsApp para receber um código de 8 caracteres
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-blue-900 dark:text-blue-100">
                    Número do WhatsApp
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="5511999999999"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="text-center text-lg tracking-wider"
                  />
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    Digite o número com código do país (55 para Brasil) e DDD
                  </p>
                </div>
              </div>
              
              <Button
                onClick={handleRequestPairingCode}
                disabled={phoneNumber.replace(/\D/g, "").length < 10}
                className="w-full"
              >
                <Hash className="w-4 h-4 mr-2" />
                Gerar Código de Conexão
              </Button>
            </div>
          )}

          {/* Solicitando Pairing Code */}
          {!connection?.isConnected && isRequestingPairingCode && (
            <div className="space-y-4">
              <div className="p-6 bg-amber-50 border border-amber-200 rounded-md text-center space-y-4">
                <Loader2 className="w-12 h-12 mx-auto text-amber-600 animate-spin" />
                <div className="space-y-2">
                  <h4 className="font-medium text-amber-900">Gerando Código...</h4>
                  <p className="text-sm text-amber-700">
                    Aguarde enquanto geramos seu código de 8 caracteres
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleBackToMethodSelection}
                className="w-full"
              >
                Cancelar
              </Button>
            </div>
          )}

          {/* Exibindo Pairing Code gerado */}
          {!connection?.isConnected && pairingCode && (
            <div className="space-y-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToMethodSelection}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
              
              <div className="p-6 bg-primary/5 border-2 border-primary/20 rounded-md text-center space-y-4">
                <div className="space-y-2">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-primary" />
                  <h4 className="font-medium text-lg">Código Gerado!</h4>
                </div>
                
                <div className="p-4 bg-white dark:bg-gray-900 rounded-lg shadow-inner">
                  <p className="text-3xl md:text-4xl font-mono font-bold tracking-[0.3em] text-primary">
                    {pairingCode}
                  </p>
                </div>
                
                <div className="text-left space-y-3 pt-2">
                  <p className="text-sm font-medium">Como usar este código:</p>
                  <ol className="text-sm text-muted-foreground space-y-2">
                    <li className="flex gap-2">
                      <span className="font-semibold text-primary">1.</span>
                      <span>Abra o WhatsApp no seu celular</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold text-primary">2.</span>
                      <span>Vá em <strong>Configurações → Aparelhos conectados</strong></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold text-primary">3.</span>
                      <span>Toque em <strong>Conectar um aparelho</strong></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold text-primary">4.</span>
                      <span>Toque em <strong>"Conectar com número de telefone"</strong></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold text-primary">5.</span>
                      <span><strong>IMPORTANTE:</strong> Quando receber a notificação "Enter code", toque nela e <strong>confirme</strong></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold text-primary">6.</span>
                      <span>Digite o código <strong>{pairingCode}</strong></span>
                    </li>
                  </ol>
                </div>
                
                <div className="flex items-center justify-center gap-2 text-xs text-amber-600 pt-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Aguardando você digitar o código no WhatsApp...</span>
                </div>
              </div>
              
              <Button
                variant="outline"
                onClick={handleRequestPairingCode}
                disabled={pairingCodeMutation.isPending}
                className="w-full"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Gerar Novo Código
              </Button>
            </div>
          )}

          {/* QR Code flow - método selecionado */}
          {!connection?.isConnected && connectionMethod === "qr" && isWaitingQrCode && !qrCode && !isConnecting && (
            <div className="space-y-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToMethodSelection}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
              <div className="p-6 bg-amber-50 border border-amber-200 rounded-md text-center space-y-4">
                <Loader2 className="w-12 h-12 mx-auto text-amber-600 animate-spin" />
                <div className="space-y-2">
                  <h4 className="font-medium text-amber-900">Gerando QR Code...</h4>
                  <p className="text-sm text-amber-700">
                    Aguarde enquanto geramos o QR Code. Isso pode levar alguns segundos.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 text-xs text-amber-600">
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                  <span>Conectando ao WhatsApp...</span>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleBackToMethodSelection}
                className="w-full"
              >
                Cancelar
              </Button>
            </div>
          )}

          {isConnecting && (
            <div className="space-y-4">
              <div className="p-6 bg-blue-50 border border-blue-200 rounded-md text-center space-y-4">
                <RefreshCw className="w-12 h-12 mx-auto text-blue-600 animate-spin" />
                <div className="space-y-2">
                  <h4 className="font-medium text-blue-900">Conectando...</h4>
                  <p className="text-sm text-blue-700">
                    Aguarde enquanto estabelecemos a conexão com o WhatsApp
                  </p>
                </div>
              </div>
            </div>
          )}

          {qrCode && !isConnecting && (
            <div className="space-y-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToMethodSelection}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
              <div className="p-6 bg-white dark:bg-gray-950 rounded-md flex flex-col items-center gap-6">
                <img
                  src={qrCode}
                  alt="QR Code"
                  className="w-full max-w-[256px] h-auto border-4 border-gray-100 dark:border-gray-800 rounded-lg"
                  data-testid="image-qr-code"
                />
                <div className="text-center space-y-4 max-w-md">
                  <h4 className="font-semibold text-lg">Para usar o WhatsApp no seu computador:</h4>
                  <ol className="text-left space-y-3 text-sm">
                    <li className="flex gap-3">
                      <span className="font-semibold text-primary min-w-[20px]">1.</span>
                      <span>Abra o WhatsApp no seu celular</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-semibold text-primary min-w-[20px]">2.</span>
                      <span>
                        Toque em <strong>Menu</strong> (⋮) ou <strong>Configurações</strong> (⚙️) e selecione <strong>Aparelhos conectados</strong>
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-semibold text-primary min-w-[20px]">3.</span>
                      <span>Toque em <strong>Conectar um aparelho</strong></span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-semibold text-primary min-w-[20px]">4.</span>
                      <span>Aponte seu celular para esta tela para escanear o código</span>
                    </li>
                  </ol>
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      Mantenha seu celular conectado à internet
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Botão para gerar novo QR code caso o atual esteja expirado */}
              <Button
                variant="outline"
                onClick={() => {
                  // Limpar estados e solicitar novo QR code
                  setQrCode(null);
                  qrCodeRef.current = null;
                  connectMutation.mutate();
                }}
                disabled={connectMutation.isPending}
                className="w-full"
              >
                {connectMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Gerando novo QR Code...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Gerar Novo QR Code
                  </>
                )}
              </Button>
            </div>
          )}

          {connection?.isConnected && (
            <div className="space-y-4">
              <div className="p-6 bg-primary/5 border border-primary/20 rounded-md text-center space-y-2">
                <CheckCircle2 className="w-12 h-12 mx-auto text-primary" />
                <div className="space-y-1">
                  <h4 className="font-medium">WhatsApp Conectado</h4>
                  <p className="text-sm text-muted-foreground">
                    Número: {connection.phoneNumber}
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="w-full"
                data-testid="button-disconnect"
              >
                {disconnectMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Desconectando...
                  </>
                ) : (
                  "Desconectar WhatsApp"
                )}
              </Button>
            </div>
          )}

          {/* Botão de reset para quando desconectado com erro */}
          {!connection?.isConnected && !connectionMethod && !qrCode && !isWaitingQrCode && !isConnecting && !pairingCode && (
            <div className="pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="w-full text-muted-foreground"
                data-testid="button-reset"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {resetMutation.isPending ? "Resetando..." : "Resetar conexão"}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Use se o QR Code não estiver funcionando
              </p>
            </div>
          )}
        </Card>

        {/* ============ SEÇÃO MULTI-CONEXÕES E AGENTES ============ */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold">Minhas Conexões e Agentes</h2>
            </div>
            {!showNewConnForm && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setShowNewConnForm(true); setNewConnStep("form"); }}
                className="gap-1"
              >
                <Plus className="w-4 h-4" />
                Nova Conexão
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Gerencie suas conexões WhatsApp e veja os agentes de IA atribuídos a cada uma.
          </p>

          {/* ============ FLUXO NOVA CONEXÃO ============ */}
          {showNewConnForm && (
            <Card className="p-5 space-y-5 border-2 border-primary/20 bg-primary/5">
              {/* Step 1: Name/Type form */}
              {newConnStep === "form" && (
                <>
                  <div className="flex items-center gap-2">
                    <Plus className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">Adicionar Nova Conexão</h3>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="conn-name" className="text-sm">Nome da Conexão (opcional)</Label>
                      <Input
                        id="conn-name"
                        value={newConnName}
                        onChange={(e) => setNewConnName(e.target.value)}
                        placeholder="Ex: WhatsApp Vendas, Suporte, etc."
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => createConnectionMutation.mutate()}
                      disabled={createConnectionMutation.isPending}
                    >
                      {createConnectionMutation.isPending ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Criando...
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3 mr-1" />
                          Continuar
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={closeNewConnFlow}
                    >
                      Cancelar
                    </Button>
                  </div>
                </>
              )}

              {/* Step 2: Method selection (QR or Pairing) */}
              {newConnStep === "method" && newConnId && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={closeNewConnFlow}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Cancelar
                  </Button>
                  <div className="text-center space-y-2">
                    <h3 className="text-lg font-medium text-foreground">Como você quer conectar o novo número?</h3>
                    <p className="text-sm text-muted-foreground">
                      Escolha a opção mais fácil para você.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* QR Code Option */}
                    <button
                      onClick={() => {
                        connectConnectionMutation.mutate(newConnId);
                      }}
                      disabled={connectConnectionMutation.isPending}
                      className="group relative flex flex-col items-center p-5 gap-3 rounded-xl border-2 border-muted bg-card hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-all duration-300 shadow-sm hover:shadow-md text-center cursor-pointer"
                    >
                      <Badge variant="secondary" className="absolute top-2 right-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 font-normal text-[10px] uppercase tracking-wider">
                        Recomendado
                      </Badge>
                      <div className="h-14 w-14 rounded-full bg-emerald-100/50 dark:bg-emerald-900/30 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <QrCode className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-semibold group-hover:text-emerald-700 dark:group-hover:text-emerald-400">Escanear QR Code</h4>
                        <p className="text-xs text-muted-foreground">
                          Abra a câmera do WhatsApp e aponte.
                        </p>
                      </div>
                      <div className="w-full py-2 bg-muted/50 rounded-lg text-xs font-medium text-foreground group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        Escolher QR Code
                      </div>
                    </button>

                    {/* Pairing Code Option */}
                    <button
                      onClick={() => setNewConnStep("pairing-form")}
                      className="group relative flex flex-col items-center p-5 gap-3 rounded-xl border-2 border-muted bg-card hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all duration-300 shadow-sm hover:shadow-md text-center cursor-pointer"
                    >
                      <div className="h-14 w-14 rounded-full bg-blue-100/50 dark:bg-blue-900/30 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <Hash className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-semibold group-hover:text-blue-700 dark:group-hover:text-blue-400">Código de 8 Dígitos</h4>
                        <p className="text-xs text-muted-foreground">
                          Digite seu número e receba um código.
                        </p>
                      </div>
                      <div className="w-full py-2 bg-muted/50 rounded-lg text-xs font-medium text-foreground group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        Escolher Código
                      </div>
                    </button>
                  </div>
                </>
              )}

              {/* Step 3a: QR Waiting */}
              {newConnStep === "qr-waiting" && newConnId && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={closeNewConnFlow}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Cancelar
                  </Button>
                  <div className="p-6 bg-amber-50 border border-amber-200 rounded-md text-center space-y-4">
                    <Loader2 className="w-12 h-12 mx-auto text-amber-600 animate-spin" />
                    <div className="space-y-2">
                      <h4 className="font-medium text-amber-900">Gerando QR Code...</h4>
                      <p className="text-sm text-amber-700">
                        Aguarde enquanto geramos o QR Code para a nova conexão.
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* Step 3b: QR Display */}
              {newConnStep === "qr-display" && newConnId && connectionQrCodes[newConnId] && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={closeNewConnFlow}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Cancelar
                  </Button>
                  <div className="p-6 bg-white dark:bg-gray-950 rounded-md flex flex-col items-center gap-6">
                    <img
                      src={connectionQrCodes[newConnId]}
                      alt="QR Code Nova Conexão"
                      className="w-full max-w-[256px] h-auto border-4 border-gray-100 dark:border-gray-800 rounded-lg"
                    />
                    <div className="text-center space-y-3 max-w-md">
                      <h4 className="font-semibold text-lg">Escaneie com o novo número:</h4>
                      <ol className="text-left space-y-2 text-sm">
                        <li className="flex gap-2">
                          <span className="font-semibold text-primary">1.</span>
                          <span>Abra o WhatsApp <strong>no celular do novo número</strong></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-semibold text-primary">2.</span>
                          <span>Vá em <strong>Configurações → Aparelhos conectados</strong></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-semibold text-primary">3.</span>
                          <span>Toque em <strong>Conectar um aparelho</strong></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="font-semibold text-primary">4.</span>
                          <span>Aponte a câmera para este QR Code</span>
                        </li>
                      </ol>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Re-trigger connect to get a new QR
                      setConnectionQrCodes(prev => {
                        const next = { ...prev };
                        if (newConnId) delete next[newConnId];
                        return next;
                      });
                      setNewConnStep("qr-waiting");
                      connectConnectionMutation.mutate(newConnId);
                    }}
                    disabled={connectConnectionMutation.isPending}
                    className="w-full"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Gerar Novo QR Code
                  </Button>
                </>
              )}

              {/* Step 3c: Pairing - Phone number form */}
              {newConnStep === "pairing-form" && newConnId && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewConnStep("method")}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar
                  </Button>
                  <div className="p-6 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md space-y-4">
                    <div className="text-center space-y-2">
                      <Hash className="w-10 h-10 mx-auto text-blue-600" />
                      <h4 className="font-medium text-blue-900 dark:text-blue-100">Conectar com Código</h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Digite o número do WhatsApp que deseja conectar
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-conn-phone" className="text-blue-900 dark:text-blue-100">
                        Número do WhatsApp
                      </Label>
                      <Input
                        id="new-conn-phone"
                        type="tel"
                        placeholder="5511999999999"
                        value={newConnPhoneNumber}
                        onChange={(e) => setNewConnPhoneNumber(e.target.value)}
                        className="text-center text-lg tracking-wider"
                      />
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        Digite com código do país (55 para Brasil) e DDD
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={async () => {
                      const cleanPhone = newConnPhoneNumber.replace(/\D/g, "");
                      if (cleanPhone.length < 10) {
                        toast({ title: "Número muito curto", description: "Digite um número válido com DDI, DDD e número.", variant: "destructive" });
                        return;
                      }
                      setNewConnStep("pairing-waiting");
                      try {
                        const response = await apiRequest("POST", "/api/whatsapp/pairing-code", {
                          phoneNumber: cleanPhone,
                          connectionId: newConnId,
                        });
                        const data = await response.json();
                        if (data.code) {
                          setNewConnPairingCode(data.code);
                          setNewConnStep("pairing-display");
                        } else {
                          throw new Error("Código não retornado");
                        }
                      } catch (err: any) {
                        toast({ title: "Erro ao gerar código", description: err.message, variant: "destructive" });
                        setNewConnStep("pairing-form");
                      }
                    }}
                    disabled={newConnPhoneNumber.replace(/\D/g, "").length < 10}
                    className="w-full"
                  >
                    <Hash className="w-4 h-4 mr-2" />
                    Gerar Código de Conexão
                  </Button>
                </>
              )}

              {/* Step 3d: Pairing - Waiting */}
              {newConnStep === "pairing-waiting" && (
                <div className="p-6 bg-amber-50 border border-amber-200 rounded-md text-center space-y-4">
                  <Loader2 className="w-12 h-12 mx-auto text-amber-600 animate-spin" />
                  <div className="space-y-2">
                    <h4 className="font-medium text-amber-900">Gerando Código...</h4>
                    <p className="text-sm text-amber-700">Aguarde enquanto geramos seu código de 8 caracteres</p>
                  </div>
                </div>
              )}

              {/* Step 3e: Pairing - Code display */}
              {newConnStep === "pairing-display" && newConnPairingCode && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewConnStep("method")}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar
                  </Button>
                  <div className="p-6 bg-primary/5 border-2 border-primary/20 rounded-md text-center space-y-4">
                    <div className="space-y-2">
                      <CheckCircle2 className="w-10 h-10 mx-auto text-primary" />
                      <h4 className="font-medium text-lg">Código Gerado!</h4>
                    </div>
                    <div className="p-4 bg-white dark:bg-gray-900 rounded-lg shadow-inner">
                      <p className="text-3xl md:text-4xl font-mono font-bold tracking-[0.3em] text-primary">
                        {newConnPairingCode}
                      </p>
                    </div>
                    <div className="text-left space-y-2 pt-2">
                      <p className="text-sm font-medium">No celular do novo número:</p>
                      <ol className="text-sm text-muted-foreground space-y-1.5">
                        <li>1. Abra o WhatsApp</li>
                        <li>2. Vá em <strong>Aparelhos conectados</strong></li>
                        <li>3. Toque em <strong>Conectar um aparelho</strong></li>
                        <li>4. Toque em <strong>"Conectar com número de telefone"</strong></li>
                        <li>5. Digite o código <strong>{newConnPairingCode}</strong></li>
                      </ol>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-xs text-amber-600 pt-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Aguardando conexão...</span>
                    </div>
                  </div>
                </>
              )}
            </Card>
          )}

          {/* Lista de conexões */}
          <div className="space-y-4">
            {allConnections.length === 0 && !showNewConnForm && (
              <Card className="p-6 text-center text-muted-foreground">
                <p>Nenhuma conexão encontrada. Clique em "Nova Conexão" para adicionar.</p>
              </Card>
            )}
            {allConnections.map((conn) => (
                <Card key={conn.id} className="p-5 space-y-4">
                  {/* Header da conexão */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        conn.isConnected 
                          ? 'bg-emerald-100 dark:bg-emerald-900/30' 
                          : 'bg-gray-100 dark:bg-gray-800'
                      }`}>
                        <Link2 className={`w-5 h-5 ${
                          conn.isConnected 
                            ? 'text-emerald-600 dark:text-emerald-400' 
                            : 'text-gray-400'
                        }`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm">
                            {(conn as any).connectionName || `Conexão ${conn.phoneNumber || '#' + conn.id.slice(0, 6)}`}
                          </h3>
                          {(conn as any).isPrimary && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0">
                              Principal
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {conn.phoneNumber || "Sem número"}
                          {(conn as any).connectionType && (conn as any).connectionType !== 'primary' && (
                            <span className="ml-2 text-muted-foreground">
                              • Tipo: {(conn as any).connectionType}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={conn.isConnected ? "default" : "secondary"}
                      className={`gap-1 ${conn.isConnected ? 'bg-emerald-600' : ''}`}
                    >
                      {conn.isConnected ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          Conectado
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3" />
                          Desconectado
                        </>
                      )}
                    </Badge>
                  </div>

                  {/* Per-connection QR Code */}
                  {connectionQrCodes[conn.id] && !conn.isConnected && (
                    <div className="flex flex-col items-center gap-3 p-4 bg-white dark:bg-gray-900 rounded-lg border">
                      <p className="text-sm font-medium">Escaneie o QR Code</p>
                      <img 
                        src={connectionQrCodes[conn.id]} 
                        alt="QR Code" 
                        className="w-48 h-48"
                      />
                      <p className="text-xs text-muted-foreground">Abra o WhatsApp no celular &gt; Menu &gt; Aparelhos conectados</p>
                    </div>
                  )}

                  {/* Per-connection action buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {!conn.isConnected ? (
                      <Button
                        size="sm"
                        variant="default"
                        className="gap-1"
                        onClick={() => connectConnectionMutation.mutate(conn.id)}
                        disabled={connectConnectionMutation.isPending && connectingConnectionId === conn.id}
                      >
                        {connectConnectionMutation.isPending && connectingConnectionId === conn.id ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Conectando...
                          </>
                        ) : (
                          <>
                            <Power className="w-3 h-3" />
                            Conectar
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1"
                        onClick={() => {
                          if (confirm("Deseja desconectar este número?")) {
                            disconnectConnectionMutation.mutate(conn.id);
                          }
                        }}
                        disabled={disconnectConnectionMutation.isPending}
                      >
                        <XCircle className="w-3 h-3" />
                        Desconectar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => {
                        if (confirm("Resetar esta conexão? Você precisará escanear um novo QR Code.")) {
                          resetConnectionMutation.mutate(conn.id);
                        }
                      }}
                      disabled={resetConnectionMutation.isPending}
                    >
                      <RotateCcw className="w-3 h-3" />
                      Resetar
                    </Button>

                    {/* AI Toggle */}
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="text-xs text-muted-foreground">IA</span>
                      <Switch
                        checked={(conn as any).aiEnabled !== false}
                        onCheckedChange={(checked) => 
                          toggleAiMutation.mutate({ connectionId: conn.id, aiEnabled: checked })
                        }
                      />
                    </div>
                  </div>

                  {/* Agente principal (1:1) */}
                  {conn.agent && (
                    <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10">
                      <Bot className="w-4 h-4 text-primary" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{conn.agent.name}</p>
                        <p className="text-xs text-muted-foreground">Agente Principal</p>
                      </div>
                      <Badge variant="default" className="text-[10px]">Ativo</Badge>
                    </div>
                  )}

                  {/* Agentes atribuídos (many-to-many) */}
                  {conn.assignedAgents && conn.assignedAgents.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Agentes Atribuídos ({conn.assignedAgents.length})
                      </p>
                      <div className="grid gap-2">
                        {conn.assignedAgents.map((ca) => (
                          <div 
                            key={ca.id} 
                            className={`flex items-center gap-2 p-2.5 rounded-lg border ${
                              ca.isActive 
                                ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800' 
                                : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 opacity-60'
                            }`}
                          >
                            <Bot className={`w-4 h-4 ${ca.isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
                            <div className="flex-1">
                              <p className="text-sm font-medium">
                                {ca.agent?.name || `Agente #${ca.agentId.slice(0, 6)}`}
                              </p>
                            </div>
                            <Badge 
                              variant={ca.isActive ? "default" : "secondary"}
                              className={`text-[10px] ${ca.isActive ? 'bg-emerald-600' : ''}`}
                            >
                              {ca.isActive ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sem agentes */}
                  {!conn.agent && (!conn.assignedAgents || conn.assignedAgents.length === 0) && (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <Bot className="w-4 h-4 text-amber-600" />
                      <p className="text-sm text-amber-700 dark:text-amber-400">
                        Nenhum agente atribuído a esta conexão
                      </p>
                    </div>
                  )}

                  {/* Botão deletar (somente conexões não-primárias) */}
                  {!(conn as any).isPrimary && (
                    <div className="flex justify-end pt-2 border-t">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 gap-1"
                        onClick={() => {
                          if (confirm("Tem certeza que deseja remover esta conexão?")) {
                            deleteConnectionMutation.mutate(conn.id);
                          }
                        }}
                        disabled={deleteConnectionMutation.isPending}
                      >
                        <Trash2 className="w-3 h-3" />
                        Remover
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
      </div>
    </div>
  );
}
