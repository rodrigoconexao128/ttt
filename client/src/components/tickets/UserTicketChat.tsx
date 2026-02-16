import React, { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { apiClient } from '../../lib/api';
import type { Ticket, TicketMessage, TicketAttachment } from '../../types/tickets';

// Design System - ChatGPT Full-Screen Dark
const THEME = {
  colors: {
    bg: '#0d0d0d',
    bgSecondary: '#111111',
    bgTertiary: '#1a1a1a',
    surface: '#212121',
    surfaceHover: '#2a2a2a',
    border: '#2d2d2d',
    borderLight: '#3a3a3a',
    userBubble: '#212121',
    adminBubble: '#111827',
    text: '#ececec',
    textSecondary: '#a0a0a0',
    textMuted: '#6b6b6b',
    accent: '#10b981',
    error: '#ef4444',
  },
  fonts: {
    body: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: '"SF Mono", "Fira Code", monospace',
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  borderRadius: { sm: 8, md: 12, lg: 18, xl: 24 },
};

interface Props {
  ticketId: number;
}

// Helper para obter URL pública do Supabase Storage
const getAttachmentUrl = (attachment: TicketAttachment): string => {
  if (attachment.publicUrl) {
    // Local URLs like /uploads/... or full http URLs
    return attachment.publicUrl;
  }
  const { data } = supabase.storage
    .from('ticket-attachments')
    .getPublicUrl(attachment.originalName);
  return data?.publicUrl || '';
};

// Componente de imagem com fallback
const AttachmentImage: React.FC<{ attachment: TicketAttachment }> = ({ attachment }) => {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const url = getAttachmentUrl(attachment);

  if (error || !url) {
    return (
      <div style={{
        padding: 20,
        backgroundColor: THEME.colors.bgTertiary,
        borderRadius: THEME.borderRadius.md,
        border: `1px solid ${THEME.colors.border}`,
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ fontSize: 24 }}>📎</span>
        <span style={{ fontSize: 12, color: THEME.colors.textSecondary }}>
          {attachment.originalName || 'Arquivo'}
        </span>
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, color: THEME.colors.accent, textDecoration: 'none' }}>
          Abrir arquivo
        </a>
      </div>
    );
  }

  const isImage = attachment.mimeType?.startsWith('image/') ||
    /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(attachment.originalName || '');

  if (!isImage) {
    return (
      <div style={{
        padding: '16px 20px',
        backgroundColor: THEME.colors.bgTertiary,
        borderRadius: THEME.borderRadius.md,
        border: `1px solid ${THEME.colors.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <span style={{ fontSize: 20 }}>📄</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, color: THEME.colors.text,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {attachment.originalName || 'Arquivo'}
          </div>
          <div style={{ fontSize: 11, color: THEME.colors.textMuted }}>
            {(attachment.sizeBytes / 1024).toFixed(1)} KB
          </div>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{
            fontSize: 12, color: THEME.colors.accent, textDecoration: 'none',
            padding: '6px 12px', borderRadius: THEME.borderRadius.sm,
            border: `1px solid ${THEME.colors.border}`,
          }}>
          Download
        </a>
      </div>
    );
  }

  return (
    <div style={{
      position: 'relative' as const,
      borderRadius: THEME.borderRadius.md,
      overflow: 'hidden',
      backgroundColor: THEME.colors.bgTertiary,
      border: `1px solid ${THEME.colors.border}`,
    }}>
      {!loaded && (
        <div style={{
          position: 'absolute' as const, inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: THEME.colors.bgTertiary,
        }}>
          <div style={{
            width: 24, height: 24,
            border: '2px solid transparent',
            borderTopColor: THEME.colors.textMuted,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
        </div>
      )}
      <img
        src={url}
        alt={attachment.originalName}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        onClick={() => window.open(url, '_blank')}
        style={{
          width: '100%', maxWidth: 400, height: 'auto', maxHeight: 300,
          objectFit: 'cover' as const, cursor: 'pointer',
          display: loaded ? 'block' : 'none',
        }}
      />
    </div>
  );
};

export const UserTicketChat: React.FC<Props> = ({ ticketId }) => {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messageBody, setMessageBody] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentPreviews, setAttachmentPreviews] = useState<{ url: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

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
      console.error('Erro ao marcar como lido:', err);
    }
  }, [ticketId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await fetchData();
      if (mounted) {
        setLoading(false);
        await markAsRead();
      }
    })();
    return () => { mounted = false; };
  }, [fetchData, markAsRead]);

  // Realtime subscription
  useEffect(() => {
    if (!ticketId) return;
    const channel = supabase
      .channel(`ticket:${ticketId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${ticketId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const raw = payload.new as any;
            // Realtime delivers snake_case; normalise to camelCase
            const newMessage: TicketMessage = {
              id: raw.id,
              ticketId: raw.ticket_id ?? raw.ticketId,
              senderType: raw.sender_type ?? raw.senderType,
              senderUserId: raw.sender_user_id ?? raw.senderUserId,
              senderAdminId: raw.sender_admin_id ?? raw.senderAdminId,
              body: raw.body ?? '',
              hasAttachments: raw.has_attachments ?? raw.hasAttachments ?? false,
              attachments: raw.attachments ?? [],
              createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
            };
            setMessages(prev => {
              if (prev.some(m => m.id === newMessage.id)) return prev;
              return [...prev, newMessage];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // File selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validImages = files.filter(f => f.type.startsWith('image/')).slice(0, 4 - attachments.length);
    if (validImages.length === 0) return;

    setAttachments(prev => [...prev, ...validImages].slice(0, 4));
    const newPreviews = validImages.map(f => ({ url: URL.createObjectURL(f), name: f.name }));
    setAttachmentPreviews(prev => [...prev, ...newPreviews].slice(0, 4));

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Remove attachment
  const removeAttachment = (index: number) => {
    URL.revokeObjectURL(attachmentPreviews[index].url);
    setAttachments(prev => prev.filter((_, i) => i !== index));
    setAttachmentPreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Send message
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
      console.error('Erro ao enviar:', err);
      alert(err?.response?.data?.message || 'Falha ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  // Keyboard shortcut
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', gap: 16,
        backgroundColor: THEME.colors.bg,
      }}>
        <div style={{
          width: 40, height: 40, border: '3px solid transparent',
          borderTopColor: THEME.colors.accent, borderRadius: '50%',
          animation: 'sendingSpin 1s linear infinite',
        }} />
        <span style={{ color: THEME.colors.textSecondary, fontSize: 14 }}>Carregando ticket...</span>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', gap: 16,
        backgroundColor: THEME.colors.bg,
      }}>
        <div style={{ fontSize: 64, opacity: 0.6 }}>🎫</div>
        <h2 style={{ fontSize: 24, fontWeight: 600, margin: 0, color: THEME.colors.text }}>
          Ticket não encontrado
        </h2>
        <p style={{ fontSize: 14, color: THEME.colors.textSecondary, margin: 0 }}>
          Este ticket não existe ou foi removido.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      backgroundColor: THEME.colors.bg, color: THEME.colors.text,
      fontFamily: THEME.fonts.body, overflow: 'hidden',
    }}>
      {/* Header */}
      <header style={{
        flexShrink: 0, backgroundColor: THEME.colors.bgSecondary,
        borderBottom: `1px solid ${THEME.colors.border}`,
        padding: `${THEME.spacing.md}px ${THEME.spacing.lg}px`,
      }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h1 style={{
            fontSize: 18, fontWeight: 600, margin: 0,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ color: THEME.colors.textMuted }}>#{ticket.id}</span>
            {ticket.subject}
          </h1>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 13, color: THEME.colors.textSecondary, marginTop: 4,
          }}>
            <span style={{
              padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
              backgroundColor: ticket.status === 'open' ? '#10b98122' : ticket.status === 'resolved' ? '#3b82f622' : '#6b7280',
              color: ticket.status === 'open' ? '#10b981' : ticket.status === 'resolved' ? '#3b82f6' : '#9ca3af',
            }}>
              {ticket.status === 'open' ? 'Aberto' : ticket.status === 'in_progress' ? 'Em Andamento' : ticket.status === 'resolved' ? 'Resolvido' : 'Fechado'}
            </span>
            <span style={{ color: THEME.colors.borderLight }}>•</span>
            <span>{new Date(ticket.createdAt).toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <main ref={messagesContainerRef} style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        padding: `${THEME.spacing.lg}px ${THEME.spacing.xl}px`,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {messages.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '48px 0', textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>💬</div>
            <p style={{ fontSize: 14, color: THEME.colors.textMuted, margin: 0 }}>
              Nenhuma mensagem neste ticket ainda.
            </p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isAdmin = msg.senderType === 'admin';
          const isSystem = msg.senderType === 'system';
          const showDate = idx === 0 ||
            new Date(msg.createdAt).toDateString() !==
            new Date(messages[idx - 1].createdAt).toDateString();

          const senderName = isSystem ? 'Sistema' : isAdmin ? 'Suporte' : 'Você';

          return (
            <React.Fragment key={msg.id}>
              {showDate && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  margin: `${THEME.spacing.md}px 0`,
                }}>
                  <div style={{ flex: 1, height: 1, backgroundColor: THEME.colors.border }} />
                  <span style={{
                    fontSize: 12, fontWeight: 500, color: THEME.colors.textMuted,
                    fontFamily: THEME.fonts.mono, textTransform: 'capitalize',
                  }}>
                    {new Date(msg.createdAt).toLocaleDateString('pt-BR', {
                      weekday: 'long', day: 'numeric', month: 'long'
                    })}
                  </span>
                  <div style={{ flex: 1, height: 1, backgroundColor: THEME.colors.border }} />
                </div>
              )}

              <div style={{
                display: 'flex',
                justifyContent: isAdmin ? 'flex-start' : 'flex-end',
              }}>
                <div style={{
                  maxWidth: '70%', padding: 16,
                  borderRadius: THEME.borderRadius.lg,
                  backgroundColor: isAdmin ? THEME.colors.adminBubble : THEME.colors.userBubble,
                  ...(isAdmin
                    ? { borderBottomLeftRadius: THEME.borderRadius.sm }
                    : { borderBottomRightRadius: THEME.borderRadius.sm }),
                }}>
                  {/* Sender */}
                  <div style={{
                    fontSize: 12, fontWeight: 600, marginBottom: 4, opacity: 0.85,
                    color: isAdmin ? 'rgba(255,255,255,0.8)' : THEME.colors.textSecondary,
                  }}>
                    {senderName}
                  </div>

                  {/* Attachments */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: 8, marginBottom: 8,
                    }}>
                      {msg.attachments.map((att) => (
                        <AttachmentImage key={att.id} attachment={att} />
                      ))}
                    </div>
                  )}

                  {/* Body */}
                  {msg.body && msg.body.trim() && (
                    <p style={{
                      margin: 0, fontSize: 14, lineHeight: 1.6,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      color: isAdmin ? '#fff' : THEME.colors.text,
                    }}>
                      {msg.body}
                    </p>
                  )}

                  {/* Timestamp */}
                  <div style={{
                    fontSize: 11, fontFamily: THEME.fonts.mono, fontWeight: 500,
                    marginTop: 8, opacity: 0.6,
                    textAlign: isAdmin ? 'left' : 'right',
                    color: isAdmin ? 'rgba(255,255,255,0.7)' : undefined,
                  }}>
                    {new Date(msg.createdAt).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}

        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      {ticket.status !== 'closed' && (
        <footer style={{
          flexShrink: 0, backgroundColor: THEME.colors.bgSecondary,
          borderTop: `1px solid ${THEME.colors.border}`, padding: THEME.spacing.md,
        }}>
          {/* Attachment previews */}
          {attachmentPreviews.length > 0 && (
            <div style={{
              display: 'flex', gap: 8, marginBottom: 8,
              flexWrap: 'wrap', maxWidth: 800, margin: '0 auto 8px auto',
            }}>
              {attachmentPreviews.map((preview, idx) => (
                <div key={idx} style={{
                  position: 'relative', width: 56, height: 56,
                  borderRadius: THEME.borderRadius.md, overflow: 'hidden',
                }}>
                  <img src={preview.url} alt={preview.name} style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                  }} />
                  <button onClick={() => removeAttachment(idx)}
                    style={{
                      position: 'absolute', top: -4, right: -4, width: 18, height: 18,
                      borderRadius: '50%', border: 'none', backgroundColor: THEME.colors.error,
                      color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input row */}
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 8,
            maxWidth: 800, margin: '0 auto',
          }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={attachments.length >= 4}
              style={{
                width: 40, height: 40, borderRadius: THEME.borderRadius.md,
                border: `1px solid ${THEME.colors.border}`, backgroundColor: 'transparent',
                color: THEME.colors.textSecondary, cursor: attachments.length >= 4 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, opacity: attachments.length >= 4 ? 0.4 : 1,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

            <textarea
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua mensagem..."
              rows={1}
              disabled={sending}
              style={{
                flex: 1, minHeight: 40, maxHeight: 120,
                padding: `${THEME.spacing.sm}px ${THEME.spacing.md}px`,
                borderRadius: THEME.borderRadius.lg,
                border: `1px solid ${THEME.colors.border}`,
                backgroundColor: THEME.colors.bgTertiary,
                color: THEME.colors.text, fontSize: 14, lineHeight: 1.5,
                resize: 'none', outline: 'none', fontFamily: THEME.fonts.body,
              }}
            />

            <button
              onClick={handleSend}
              disabled={sending || (!messageBody.trim() && attachments.length === 0)}
              style={{
                width: 44, height: 44, borderRadius: THEME.borderRadius.lg,
                border: 'none', cursor: (sending || (!messageBody.trim() && attachments.length === 0)) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                backgroundColor: (sending || (!messageBody.trim() && attachments.length === 0))
                  ? THEME.colors.bgTertiary : THEME.colors.accent,
                color: (sending || (!messageBody.trim() && attachments.length === 0))
                  ? THEME.colors.textMuted : '#fff',
              }}
            >
              {sending ? (
                <div style={{
                  width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff', borderRadius: '50%',
                  animation: 'sendingSpin 0.8s linear infinite',
                }} />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              )}
            </button>
          </div>
        </footer>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes sendingSpin { to { transform: rotate(360deg); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        textarea { resize: none; outline: none; font-family: inherit; }
      `}</style>
    </div>
  );
};

export default UserTicketChat;
