import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Paperclip, Send, Clock, Check, CheckCheck, X, AlertCircle, User, Headphones, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { apiClient } from '../../lib/api';
import type { Ticket, TicketMessage, TicketAttachment } from '../../types/tickets';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const getAttachmentUrl = (attachment: TicketAttachment): string => {
  if (attachment.publicUrl) return attachment.publicUrl;
  const { data } = supabase.storage.from('ticket-attachments').getPublicUrl(attachment.originalName);
  return data?.publicUrl || '';
};

const AttachmentPreview: React.FC<{ 
  attachment: TicketAttachment;
  isPreview?: boolean;
  onRemove?: () => void;
}> = ({ attachment, isPreview, onRemove }) => {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const url = isPreview ? attachment.publicUrl : getAttachmentUrl(attachment);
  const isImage = attachment.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(attachment.originalName || '');

  if (error || !url || !isImage) {
    return (
      <div className="relative flex items-center gap-2 p-2 bg-muted rounded-lg border text-sm max-w-[200px]">
        <Paperclip className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="truncate text-xs">{attachment.originalName || 'Arquivo'}</span>
        {onRemove && (
          <button 
            onClick={onRemove}
            className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-white rounded-full flex items-center justify-center text-xs hover:bg-destructive/90"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative group">
      <div className={cn(
        "w-16 h-16 rounded-lg overflow-hidden border bg-muted",
        !loaded && "animate-pulse"
      )}>
        <img 
          src={url} 
          alt={attachment.originalName} 
          className="w-full h-full object-cover"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      </div>
      {onRemove && (
        <button 
          onClick={onRemove}
          className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; icon: React.ElementType }> = {
  open: { color: 'text-blue-600', bg: 'bg-blue-50', label: 'Aberto', icon: AlertCircle },
  in_progress: { color: 'text-amber-600', bg: 'bg-amber-50', label: 'Em andamento', icon: Clock },
  resolved: { color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Resolvido', icon: Check },
  closed: { color: 'text-gray-600', bg: 'bg-gray-50', label: 'Fechado', icon: CheckCheck },
};

interface Props { 
  ticketId: number; 
}

export const UserTicketChat: React.FC<Props> = ({ ticketId }) => {
  const [, setLocation] = useLocation();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messageBody, setMessageBody] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentPreviews, setAttachmentPreviews] = useState<{ url: string; name: string; file: File }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => { 
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [ticketRes, msgRes] = await Promise.all([
        apiClient.get(`/tickets/${ticketId}`), 
        apiClient.get(`/tickets/${ticketId}/messages`)
      ]);
      setTicket(ticketRes.data.ticket);
      setMessages(msgRes.data.items);
    } catch (err) { 
      console.error('Erro ao carregar dados:', err); 
    }
  }, [ticketId]);

  const markAsRead = useCallback(async () => { 
    try { 
      await apiClient.post(`/tickets/${ticketId}/read`); 
    } catch (err) { 
      console.error(err); 
    } 
  }, [ticketId]);

  useEffect(() => { 
    let m = true; 
    (async () => { 
      await fetchData(); 
      if (m) { 
        setLoading(false); 
        await markAsRead(); 
      } 
    })(); 
    return () => { m = false; }; 
  }, [fetchData, markAsRead]);

  useEffect(() => {
    if (!ticketId) return;
    const channel = supabase
      .channel(`ticket:${ticketId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'ticket_messages', 
        filter: `ticket_id=eq.${ticketId}` 
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const raw = payload.new as any;
          const hasAttach = raw.has_attachments ?? raw.hasAttachments ?? false;
          if (hasAttach) {
            fetchData();
          } else {
            const newMessage: TicketMessage = { 
              id: raw.id, 
              ticketId: raw.ticket_id ?? raw.ticketId, 
              senderType: raw.sender_type ?? raw.senderType, 
              senderUserId: raw.sender_user_id ?? raw.senderUserId, 
              senderAdminId: raw.sender_admin_id ?? raw.senderAdminId, 
              body: raw.body ?? '', 
              hasAttachments: false, 
              attachments: [], 
              createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString() 
            };
            setMessages(prev => prev.some(m => m.id === newMessage.id) ? prev : [...prev, newMessage]);
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ticketId, fetchData]);

  useEffect(() => { 
    scrollToBottom(); 
  }, [messages, scrollToBottom]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
      .filter(f => f.type.startsWith('image/'))
      .slice(0, 4 - attachments.length);
    if (!files.length) return;
    
    setAttachments(prev => [...prev, ...files].slice(0, 4));
    setAttachmentPreviews(prev => [
      ...prev, 
      ...files.map(f => ({ 
        url: URL.createObjectURL(f), 
        name: f.name,
        file: f
      }))
    ].slice(0, 4));
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (i: number) => { 
    URL.revokeObjectURL(attachmentPreviews[i].url); 
    setAttachments(prev => prev.filter((_, j) => j !== i)); 
    setAttachmentPreviews(prev => prev.filter((_, j) => j !== i)); 
  };

  const handleSend = async () => {
    if (!messageBody.trim() && attachments.length === 0) return;
    if (sending) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('body', messageBody.trim());
      attachments.forEach(file => formData.append('attachments', file));
      await apiClient.post(`/tickets/${ticketId}/messages`, formData);
      setMessageBody(''); 
      setAttachments([]); 
      attachmentPreviews.forEach(p => URL.revokeObjectURL(p.url)); 
      setAttachmentPreviews([]);
      await fetchData();
    } catch (err: any) { 
      console.error(err); 
    } finally { 
      setSending(false); 
      // Focar de volta no textarea
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { 
    if (e.key === 'Enter' && !e.shiftKey) { 
      e.preventDefault(); 
      handleSend(); 
    } 
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Hoje';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Ontem';
    }
    return date.toLocaleDateString('pt-BR', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-muted-foreground text-sm">Carregando ticket...</span>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background p-6">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold">Ticket não encontrado</h2>
        <p className="text-muted-foreground text-sm">Este ticket não existe ou foi removido.</p>
        <Button variant="outline" onClick={() => setLocation('/tickets')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
  const StatusIcon = statusConfig.icon;
  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved';

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header Minimalista */}
      <header className="flex-shrink-0 border-b bg-card/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            className="flex-shrink-0"
            onClick={() => setLocation('/tickets')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold truncate">
                #{ticket.id} - {ticket.subject}
              </h1>
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                statusConfig.bg,
                statusConfig.color
              )}>
                <StatusIcon className="w-3 h-3" />
                {statusConfig.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Criado em {new Date(ticket.createdAt).toLocaleDateString('pt-BR', { 
                day: '2-digit', 
                month: 'long', 
                year: 'numeric' 
              })}
            </p>
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <main 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-6 bg-muted/30"
      >
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <Headphones className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Envie sua primeira mensagem</p>
              <p className="text-xs text-muted-foreground mt-1">
                Nossa equipe responderá o mais breve possível
              </p>
            </div>
          )}

          {messages.map((msg, idx) => {
            const isAdmin = msg.senderType === 'admin';
            const showDate = idx === 0 || 
              new Date(msg.createdAt).toDateString() !== new Date(messages[idx - 1].createdAt).toDateString();

            return (
              <React.Fragment key={msg.id}>
                {showDate && (
                  <div className="flex items-center gap-4 my-6">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground font-medium">
                      {formatDate(msg.createdAt)}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}

                <div className={cn(
                  "flex gap-3",
                  isAdmin ? "justify-start" : "justify-end"
                )}>
                  {/* Avatar para admin */}
                  {isAdmin && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Headphones className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  
                  <div className={cn(
                    "max-w-[75%] space-y-1",
                    isAdmin ? "items-start" : "items-end"
                  )}>
                    {/* Nome do remetente */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {isAdmin ? (
                        <span className="font-medium text-primary">Suporte</span>
                      ) : (
                        <span className="font-medium">Você</span>
                      )}
                      <span>•</span>
                      <span>{formatTime(msg.createdAt)}</span>
                    </div>
                    
                    {/* Message Bubble */}
                    <div className={cn(
                      "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                      isAdmin 
                        ? "bg-card border rounded-tl-sm" 
                        : "bg-primary text-primary-foreground rounded-tr-sm"
                    )}>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          {msg.attachments.map(att => (
                            <AttachmentPreview 
                              key={att.id} 
                              attachment={att} 
                            />
                          ))}
                        </div>
                      )}
                      {msg.body?.trim() && (
                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Avatar para usuário */}
                  {!isAdmin && (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area - Fixed Bottom */}
      {!isClosed && (
        <footer className="flex-shrink-0 border-t bg-card">
          <div className="max-w-4xl mx-auto px-4 py-3">
            {/* Attachment Previews */}
            {attachmentPreviews.length > 0 && (
              <div className="flex gap-2 mb-3 flex-wrap">
                {attachmentPreviews.map((preview, idx) => (
                  <AttachmentPreview
                    key={idx}
                    attachment={{
                      id: idx,
                      publicUrl: preview.url,
                      originalName: preview.name,
                      mimeType: preview.file.type,
                      sizeBytes: preview.file.size,
                    }}
                    isPreview
                    onRemove={() => removeAttachment(idx)}
                  />
                ))}
              </div>
            )}
            
            {/* Input */}
            <div className="flex items-end gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="flex-shrink-0 h-10 w-10 rounded-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachments.length >= 4}
              >
                <Paperclip className={cn(
                  "w-5 h-5",
                  attachments.length >= 4 ? "text-muted-foreground" : "text-foreground"
                )} />
              </Button>
              
              <input 
                ref={fileInputRef} 
                type="file" 
                accept="image/*" 
                multiple 
                onChange={handleFileSelect} 
                className="hidden" 
              />
              
              <div className="flex-1 relative">
                <Textarea
                  ref={textareaRef}
                  value={messageBody}
                  onChange={e => setMessageBody(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Digite sua mensagem..."
                  disabled={sending}
                  rows={1}
                  className="min-h-[44px] max-h-[120px] pr-12 resize-none py-2.5 rounded-2xl"
                  style={{ height: 'auto' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = target.scrollHeight + 'px';
                  }}
                />
              </div>
              
              <Button
                size="icon"
                className="flex-shrink-0 h-10 w-10 rounded-full"
                onClick={handleSend}
                disabled={sending || (!messageBody.trim() && attachments.length === 0)}
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </footer>
      )}
      
      {isClosed && (
        <div className="flex-shrink-0 border-t bg-muted/50 px-4 py-3">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-sm text-muted-foreground">
              Este ticket está {ticket.status === 'resolved' ? 'resolvido' : 'fechado'}.
              {' '}
              <button 
                onClick={() => setLocation('/tickets/new')}
                className="text-primary hover:underline font-medium"
              >
                Abrir novo chamado
              </button>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserTicketChat;
