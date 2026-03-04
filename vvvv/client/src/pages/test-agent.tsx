/**
 * 🧪 PÁGINA DE TESTE DO AGENTE - Interface estilo WhatsApp
 * 
 * Permite testar o agente sem precisar conectar ao WhatsApp real.
 * URL: /test/:token ou /test-agent
 */

import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Send, Bot, User, Phone, Loader2, ArrowLeft, Mic, Image, Smile, Paperclip, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatWhatsAppTextForHtml } from "@/lib/whatsapp-format";

interface Message {
  id: string;
  text: string;
  fromMe: boolean;
  timestamp: Date;
  status: 'sending' | 'sent' | 'delivered' | 'read';
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
}

export default function TestAgent() {
  const { token } = useParams<{ token?: string }>();
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [agentName, setAgentName] = useState("Agente IA");
  const [agentCompany, setAgentCompany] = useState("AgenteZap");
  const [invalidTokenMessage, setInvalidTokenMessage] = useState<string | null>(null);
  
  // 🔧 FIX: Ler userId da query string OU do path param
  const urlParams = new URLSearchParams(window.location.search);
  const userIdFromQuery = urlParams.get('userId');
  const [userId, setUserId] = useState<string | undefined>(userIdFromQuery || undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Carregar informações do agente pelo token OU userId
  const { data: agentInfo } = useQuery({
    queryKey: ["/api/test-agent/info", token || userIdFromQuery],
    queryFn: async () => {
      // Prioridade: token do path, depois userId da query
      const identifier = token || userIdFromQuery;
      if (!identifier) return null;
      const res = await fetch(`/api/test-agent/info/${identifier}`);
      if (!res.ok) {
        if (res.status === 404) {
          const data = await res.json().catch(() => null);
          return {
            invalidToken: true,
            message:
              data?.message ||
              "Esse link de teste e invalido ou expirou. Peca um novo link para o administrador.",
          };
        }
        return null;
      }
      return res.json();
    },
    enabled: !!(token || userIdFromQuery),
  });

  useEffect(() => {
    if ((agentInfo as any)?.invalidToken) {
      setInvalidTokenMessage(
        (agentInfo as any)?.message ||
          "Esse link de teste e invalido ou expirou. Peca um novo link para o administrador.",
      );
      setMessages([]);
      setIsTyping(false);
      return;
    }

    setInvalidTokenMessage(null);
    if (agentInfo) {
      setAgentName(agentInfo.agentName || "Agente IA");
      setAgentCompany(agentInfo.company || "AgenteZap");
      if (agentInfo.userId) {
        setUserId(agentInfo.userId);
      }
    }
  }, [agentInfo]);

  // Scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Simular interação inicial do cliente ("oie")
  useEffect(() => {
    if (invalidTokenMessage) {
      return;
    }
    const timer = setTimeout(() => {
      const initialUserMessage: Message = {
        id: `msg_init_user`,
        text: "oie",
        fromMe: true,
        timestamp: new Date(),
        status: 'sent',
      };
      setMessages([initialUserMessage]);
      setIsTyping(true);
      
      // Disparar resposta da IA
      sendMessageMutation.mutate("oie");
    }, 1000);
    return () => clearTimeout(timer);
  }, [invalidTokenMessage]); // Executar apenas quando o link for valido

  // Mutation para enviar mensagem
  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch("/api/test-agent/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: text,
          token: token || "demo",
          userId: userId, // Enviar userId para usar o agente do cliente
          history: messages.slice(-10).map(m => ({
            role: m.fromMe ? "user" : "assistant",
            content: m.text
          }))
        }),
      });
      if (!res.ok) throw new Error("Erro ao enviar");
      return res.json();
    },
    onSuccess: (data) => {
      setIsTyping(false);
      
      const newMessages: Message[] = [];
      
      // Se houver mídias para enviar, adicionar cada uma como mensagem separada
      if (data.mediaActions && Array.isArray(data.mediaActions) && data.mediaActions.length > 0) {
        console.log(`📁 Frontend recebeu ${data.mediaActions.length} mídia(s)`, data.mediaActions);
        for (const action of data.mediaActions) {
          if (action.type === 'send_media' && action.media_url) {
            newMessages.push({
              id: `msg_media_${Date.now()}_${Math.random()}`,
              text: '', // Não exibir caption/description - apenas a imagem
              mediaUrl: action.media_url,
              mediaType: action.media_type || 'image',
              fromMe: false,
              timestamp: new Date(),
              status: 'read',
            });
          }
          if (action.type === 'send_media_url' && action.media_url) {
            newMessages.push({
              id: `msg_media_${Date.now()}_${Math.random()}`,
              text: '',
              mediaUrl: action.media_url,
              mediaType: action.media_type || 'image',
              fromMe: false,
              timestamp: new Date(),
              status: 'read',
            });
          }
        }
      }
      
      // Adicionar resposta de texto do agente
      if (typeof data.response === 'string' && data.response.trim()) {
        newMessages.push({
          id: `msg_${Date.now()}`,
          text: data.response,
          fromMe: false,
          timestamp: new Date(),
          status: 'read',
        });
      }
      
      setMessages(prev => [...prev, ...newMessages]);
    },
    onError: () => {
      setIsTyping(false);
      const errorMessage: Message = {
        id: `msg_${Date.now()}`,
        text: "Ops! Houve um erro. Tente novamente.",
        fromMe: false,
        timestamp: new Date(),
        status: 'read',
      };
      setMessages(prev => [...prev, errorMessage]);
    },
  });

  const handleSend = () => {
    if (!inputText.trim() || sendMessageMutation.isPending || invalidTokenMessage) return;

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      text: inputText.trim(),
      fromMe: true,
      timestamp: new Date(),
      status: 'sent',
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText("");
    setIsTyping(true);

    // Delay para simular "digitando..."
    setTimeout(() => {
      sendMessageMutation.mutate(userMessage.text);
    }, 500);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const MessageStatus = ({ status }: { status: Message['status'] }) => {
    if (status === 'sending') return <Loader2 className="w-3 h-3 animate-spin text-gray-400" />;
    if (status === 'sent') return <Check className="w-3 h-3 text-gray-400" />;
    if (status === 'delivered') return <CheckCheck className="w-3 h-3 text-gray-400" />;
    if (status === 'read') return <CheckCheck className="w-3 h-3 text-blue-500" />;
    return null;
  };

  return (
    <div className="fixed inset-0 flex flex-col h-[100dvh] bg-gray-100 max-w-md mx-auto border-x border-gray-200 shadow-xl">
      {/* Header */}
      <div className="bg-[#008069] text-white p-4 flex items-center gap-3 shadow-sm z-10 flex-none">
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-semibold text-lg">{agentCompany}</h1>
          <p className="text-xs text-white/80">Online</p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#efeae2] bg-opacity-50" style={{ backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')", backgroundBlendMode: "overlay" }}>
        {invalidTokenMessage && (
          <div className="flex justify-center pt-8">
            <div className="max-w-[90%] rounded-lg bg-white p-4 shadow-sm text-center">
              <p className="text-sm font-medium text-gray-900">Link invalido ou expirado</p>
              <p className="mt-2 text-sm text-gray-600">{invalidTokenMessage}</p>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex w-full",
              msg.fromMe ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg p-3 shadow-sm relative",
                msg.fromMe ? "bg-[#d9fdd3] rounded-tr-none" : "bg-white rounded-tl-none"
              )}
            >
              {msg.mediaUrl && (
                  <div className="mb-2">
                    {msg.mediaType === 'image' && (
                      <img 
                        src={msg.mediaUrl} 
                        alt="Imagem"
                        className="max-w-full rounded-lg"
                        style={{ maxHeight: '300px' }}
                      />
                    )}
                  </div>
              )}

              <p
                className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed"
                dangerouslySetInnerHTML={{ __html: formatWhatsAppTextForHtml(msg.text) }}
              />
              <span className="text-[10px] text-gray-500 block text-right mt-1">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {msg.fromMe && <span className="ml-1 text-blue-500">✓✓</span>}
              </span>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white rounded-lg p-3 rounded-tl-none shadow-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#008069]" />
              <span className="text-xs text-gray-500">Digitando...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-[#f0f2f5] p-3 flex items-center gap-2 flex-none">
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-500 hover:bg-gray-200 rounded-full"
        >
          <Smile className="w-6 h-6" />
        </Button>
        
        <Input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={invalidTokenMessage ? "Solicite um novo link ao administrador" : "Digite uma mensagem"}
          className="flex-1 bg-white border-none focus-visible:ring-0 rounded-lg"
          disabled={Boolean(invalidTokenMessage)}
        />
        
        <Button
          onClick={handleSend}
          size="icon"
          className={cn(
            "rounded-full transition-all",
            inputText.trim() ? "bg-[#008069] hover:bg-[#006d59]" : "bg-gray-300 hover:bg-gray-400"
          )}
          disabled={!inputText.trim() || Boolean(invalidTokenMessage)}
        >
          <Send className="w-5 h-5 text-white" />
        </Button>
      </div>
    </div>
  );
}
