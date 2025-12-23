import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smartphone, QrCode, CheckCircle2, XCircle, RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/supabase";
import type { WhatsappConnection } from "@shared/schema";

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

  const { data: connection, isLoading, refetch: refetchConnection } = useQuery<WhatsappConnection>({
    queryKey: ["/api/whatsapp/connection"],
    // Refetch a cada 3 segundos quando não está conectado e está aguardando QR Code
    refetchInterval: !connection?.isConnected && isWaitingQrCode ? 3000 : false,
  });

  // Função para buscar QR Code diretamente do banco de dados
  const fetchQrCodeFromDb = useCallback(async () => {
    try {
      const response = await apiRequest("GET", "/api/whatsapp/connection");
      const data = await response.json();
      if (data && data.qrCode && !qrCodeRef.current) {
        console.log("[QR POLLING] QR Code encontrado no banco de dados!");
        setQrCode(data.qrCode);
        qrCodeRef.current = data.qrCode;
        setIsWaitingQrCode(false);
        isWaitingQrCodeRef.current = false;
        // Parar polling quando encontrar o QR code
        if (qrCodePollingRef.current) {
          clearInterval(qrCodePollingRef.current);
          qrCodePollingRef.current = null;
        }
      }
      if (data && data.isConnected) {
        setIsWaitingQrCode(false);
        isWaitingQrCodeRef.current = false;
        setQrCode(null);
        qrCodeRef.current = null;
        if (qrCodePollingRef.current) {
          clearInterval(qrCodePollingRef.current);
          qrCodePollingRef.current = null;
        }
      }
    } catch (error) {
      console.error("[QR POLLING] Erro ao buscar QR Code:", error);
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

  // Verificar se já existe um QR Code no banco quando a conexão é carregada
  useEffect(() => {
    if (connection && connection.qrCode && !connection.isConnected && !qrCodeRef.current) {
      console.log("[INIT] QR Code encontrado na conexão do banco de dados!");
      setQrCode(connection.qrCode);
      qrCodeRef.current = connection.qrCode;
      setIsWaitingQrCode(false);
      isWaitingQrCodeRef.current = false;
    }
  }, [connection]);

  useEffect(() => {
    let socket: WebSocket | null = null;

    const connectWebSocket = async () => {
      try {
        const token = await getAuthToken();

        if (!token) {
          console.error("No auth token available for WebSocket connection");
          return;
        }

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
            console.log("[WS] Mensagem recebida:", data.type);

            if (data.type === "qr") {
              console.log("[WS] QR Code recebido via WebSocket!");
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
            } else if (data.type === "connecting") {
              // Only show connecting state if we don't have a QR code yet
              // This prevents the QR code from disappearing if a connecting event 
              // arrives after the QR code is displayed (which can happen during connection)
              if (!qrCodeRef.current) {
                setQrCode(null);
                setIsConnecting(true);
                setIsWaitingQrCode(false);
                isWaitingQrCodeRef.current = false;
              }
            } else if (data.type === "connected") {
              console.log("[WS] WhatsApp conectado!");
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
              queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
              toast({
                title: "Conectado!",
                description: "WhatsApp conectado com sucesso",
              });
            } else if (data.type === "disconnected") {
              console.log("[WS] WhatsApp desconectado!");
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
              queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/connection"] });
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
        };

        setWs(socket);
      } catch (error) {
        console.error("Error connecting to WebSocket:", error);
        setWsConnected(false);
      }
    };

    connectWebSocket();

    return () => {
      if (socket) {
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
      <div className="container max-w-2xl mx-auto p-8 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Conexão WhatsApp</h1>
          <p className="text-muted-foreground">
            Conecte seu número do WhatsApp para começar a gerenciar suas conversas
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

          {!connection?.isConnected && !qrCode && !isWaitingQrCode && !isConnecting && (
            <div className="space-y-4">
              <div className="p-6 bg-muted/50 rounded-md text-center space-y-4">
                <QrCode className="w-12 h-12 mx-auto text-muted-foreground" />
                <div className="space-y-2">
                  <h4 className="font-medium">Conecte seu WhatsApp</h4>
                  <p className="text-sm text-muted-foreground">
                    Clique no botão abaixo para gerar um QR Code e conectar seu WhatsApp
                  </p>
                </div>
              </div>
              <Button
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                className="w-full"
                data-testid="button-connect"
              >
                {connectMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Gerando QR Code...
                  </>
                ) : (
                  <>
                    <Smartphone className="w-4 h-4 mr-2" />
                    Conectar WhatsApp
                  </>
                )}
              </Button>
            </div>
          )}

          {isWaitingQrCode && !qrCode && !isConnecting && (
            <div className="space-y-4">
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
                onClick={() => {
                  setIsWaitingQrCode(false);
                  isWaitingQrCodeRef.current = false;
                  if (qrCodePollingRef.current) {
                    clearInterval(qrCodePollingRef.current);
                    qrCodePollingRef.current = null;
                  }
                }}
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
              <div className="p-6 bg-white rounded-md flex flex-col items-center gap-6">
                <img
                  src={qrCode}
                  alt="QR Code"
                  className="w-64 h-64 border-4 border-gray-100 rounded-lg"
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
        </Card>
      </div>
    </div>
  );
}
