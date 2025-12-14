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

interface Message {
  id: string;
  text: string;
  fromMe: boolean;
  timestamp: Date;
  status: 'sending' | 'sent' | 'delivered' | 'read';
}

export default function TestAgent() {
  const { token } = useParams<{ token?: string }>();
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [agentName, setAgentName] = useState("Agente IA");
  const [agentCompany, setAgentCompany] = useState("AgenteZap");
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Carregar informações do agente pelo token
  const { data: agentInfo } = useQuery({
    queryKey: ["/api/test-agent/info", token],
    queryFn: async () => {
      if (!token) return null;
      const res = await fetch(`/api/test-agent/info/${token}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!token,
  });

  useEffect(() => {
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

  // Mensagem de boas-vindas
  useEffect(() => {
    const timer = setTimeout(() => {
      const welcomeMessage: Message = {
        id: `msg_${Date.now()}`,
        text: `Olá! 👋 Bem-vindo ao teste do agente! Eu sou o ${agentName} da ${agentCompany}. Pode me mandar uma mensagem pra ver como eu respondo! 😊`,
        fromMe: false,
        timestamp: new Date(),
        status: 'read',
      };
      setMessages([welcomeMessage]);
    }, 1000);
    return () => clearTimeout(timer);
  }, [agentName, agentCompany]);

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
      
      // Adicionar resposta do agente
      const agentMessage: Message = {
        id: `msg_${Date.now()}`,
        text: data.response,
        fromMe: false,
        timestamp: new Date(),
        status: 'read',
      };
      setMessages(prev => [...prev, agentMessage]);
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
    if (!inputText.trim() || sendMessageMutation.isPending) return;

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
    <div className="min-h-screen bg-[#0b141a] flex flex-col">
      {/* Header WhatsApp Style */}
      <header className="bg-[#202c33] px-4 py-3 flex items-center gap-3 shadow-md">
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-gray-400 hover:text-white"
          onClick={() => setLocation("/")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
          <Bot className="w-6 h-6 text-white" />
        </div>
        
        <div className="flex-1">
          <h1 className="text-white font-medium">{agentName}</h1>
          <p className="text-xs text-emerald-400">
            {isTyping ? "digitando..." : "online"}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white">
            <Phone className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Chat Area */}
      <div 
        className="flex-1 overflow-y-auto p-4"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23182229' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          backgroundColor: '#0b141a'
        }}
      >
        {/* Info Banner */}
        <div className="bg-[#182229] rounded-lg p-3 mb-4 text-center">
          <p className="text-xs text-gray-400">
            🧪 Modo de teste - As mensagens não são salvas
          </p>
        </div>

        {/* Messages */}
        <div className="space-y-2">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.fromMe ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] px-3 py-2 rounded-lg relative",
                  message.fromMe
                    ? "bg-[#005c4b] text-white rounded-br-none"
                    : "bg-[#202c33] text-white rounded-bl-none"
                )}
              >
                {/* Triângulo do balão */}
                <div
                  className={cn(
                    "absolute top-0 w-0 h-0 border-t-8",
                    message.fromMe
                      ? "right-[-8px] border-l-8 border-l-[#005c4b] border-t-transparent"
                      : "left-[-8px] border-r-8 border-r-[#202c33] border-t-transparent"
                  )}
                />
                
                <p className="text-sm whitespace-pre-wrap break-words">
                  {message.text}
                </p>
                
                <div className={cn(
                  "flex items-center gap-1 mt-1",
                  message.fromMe ? "justify-end" : "justify-start"
                )}>
                  <span className="text-[10px] text-gray-400">
                    {formatTime(message.timestamp)}
                  </span>
                  {message.fromMe && <MessageStatus status={message.status} />}
                </div>
              </div>
            </div>
          ))}
          
          {/* Typing indicator */}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-[#202c33] text-white px-4 py-3 rounded-lg rounded-bl-none">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-[#202c33] px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white shrink-0">
            <Smile className="w-6 h-6" />
          </Button>
          
          <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white shrink-0">
            <Paperclip className="w-6 h-6" />
          </Button>
          
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Digite uma mensagem"
              className="bg-[#2a3942] border-0 text-white placeholder-gray-400 pr-10 py-6 rounded-lg focus-visible:ring-0 focus-visible:ring-offset-0"
              disabled={sendMessageMutation.isPending}
            />
          </div>
          
          <Button
            onClick={handleSend}
            disabled={!inputText.trim() || sendMessageMutation.isPending}
            size="icon"
            className={cn(
              "rounded-full shrink-0 w-12 h-12",
              inputText.trim()
                ? "bg-emerald-500 hover:bg-emerald-600"
                : "bg-[#2a3942] hover:bg-[#3a4952]"
            )}
          >
            {sendMessageMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin text-white" />
            ) : inputText.trim() ? (
              <Send className="w-5 h-5 text-white" />
            ) : (
              <Mic className="w-5 h-5 text-gray-400" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
