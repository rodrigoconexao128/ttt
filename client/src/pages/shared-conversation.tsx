import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageImage } from "@/components/message-image";
import { MessageAudio } from "@/components/message-audio";
import { Bot, MessageCircle, Lock } from "lucide-react";
import type { Message, Conversation } from "@shared/schema";

interface SharedConversationData {
  conversation: Conversation;
  messages: Message[];
  contactName: string;
  contactNumber: string;
}

export default function SharedConversation() {
  const [, params] = useRoute("/conversas/compartilhada/:token");
  const token = params?.token;

  const { data, isLoading, error } = useQuery<SharedConversationData>({
    queryKey: ["/api/conversations/shared", token],
    queryFn: async () => {
      const response = await fetch(`/api/conversations/shared/${token}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Erro ao carregar conversa");
      }
      return response.json();
    },
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-muted-foreground">Carregando conversa...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <Lock className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Link Inválido ou Expirado</h1>
          <p className="text-muted-foreground">
            {error?.message || "Este link de compartilhamento não é válido ou foi desativado pelo proprietário."}
          </p>
        </div>
      </div>
    );
  }

  const { conversation, messages, contactName, contactNumber } = data;
  const displayNumber = contactNumber?.replace("@s.whatsapp.net", "") || "Desconhecido";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Avatar className="w-10 h-10 border-2 border-primary/20">
            {conversation?.contactAvatar ? (
              <img 
                src={conversation.contactAvatar} 
                alt={contactName || displayNumber}
                className="w-full h-full object-cover"
              />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {contactName
                ? contactName.charAt(0).toUpperCase()
                : (displayNumber || "?").charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">
              {contactName || displayNumber}
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              {displayNumber}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MessageCircle className="w-4 h-4" />
            <span>{messages.length} mensagens</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma mensagem nesta conversa.</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.fromMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] md:max-w-md rounded-lg px-4 py-2 ${
                  message.fromMe
                    ? "bg-primary text-primary-foreground ml-auto"
                    : "bg-muted mr-auto"
                }`}
              >
                {message.isFromAgent && (
                  <div className="flex items-center gap-1 mb-1">
                    <Bot className="w-3 h-3 text-primary" />
                    <span className="text-xs font-semibold text-primary">Agente IA</span>
                  </div>
                )}
                
                {/* Render media content */}
                {message.mediaType === "image" && message.mediaUrl ? (
                  <MessageImage 
                    src={message.mediaUrl} 
                    caption={message.mediaCaption}
                    alt="Imagem do WhatsApp"
                  />
                ) : message.mediaType === "audio" && message.mediaUrl ? (
                  <div className="space-y-2">
                    <MessageAudio 
                      src={message.mediaUrl}
                      duration={message.mediaDuration}
                      fromMe={message.fromMe}
                    />
                    {message.text && (
                      <p className="text-sm whitespace-pre-wrap break-words italic opacity-80">
                        📝 {message.text.replace(/^\[ÁUDIO ENVIADO PELO AGENTE\]:\s*/i, '')}
                      </p>
                    )}
                  </div>
                ) : message.mediaType === "video" && message.mediaUrl ? (
                  <div className="space-y-2">
                    <video 
                      src={message.mediaUrl} 
                      controls 
                      className="max-w-[280px] max-h-[280px] rounded-lg"
                    />
                    {(message.mediaCaption || message.text) && (
                      <p className="text-sm whitespace-pre-wrap break-words">{message.mediaCaption || message.text}</p>
                    )}
                  </div>
                ) : message.mediaType === "document" && message.mediaUrl ? (
                  <div className="space-y-2">
                    <a 
                      href={message.mediaUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className={`flex items-center gap-2 p-2 rounded border ${
                        message.fromMe 
                          ? "border-primary-foreground/30 hover:bg-primary-foreground/10" 
                          : "border-muted-foreground/30 hover:bg-muted-foreground/10"
                      }`}
                    >
                      📄 <span className="text-sm underline">{message.text || "Documento"}</span>
                    </a>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
                )}
                
                <p
                  className={`text-xs mt-1 ${
                    message.fromMe ? "text-primary-foreground/70" : "text-muted-foreground"
                  }`}
                >
                  {format(new Date(message.timestamp), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t bg-card py-4">
        <div className="max-w-3xl mx-auto px-4 text-center text-xs text-muted-foreground">
          <p>Conversa compartilhada via <strong>AgenteZap</strong></p>
          <p className="mt-1">Esta é uma visualização somente leitura.</p>
        </div>
      </div>
    </div>
  );
}
