import React, { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { apiClient } from '../../lib/api';
import type { Ticket, TicketMessage, TicketStatus } from '../../types/tickets';

// Design System - Match UserTicketChat with admin-specific refinements
const THEME = {
  colors: {
    bg: '#0d0d0d',
    bgSecondary: '#1a1a1a',
    bgTertiary: '#2d2d2d',
    surface: '#212121',
    surfaceHover: '#2a2a2a',
    border: '#3a3a3a',
    borderLight: '#404040',
    userBubble: '#2f3542',
    adminBubble: '#0ea5e9',
    adminBubbleHover: '#0284c7',
    text: '#e5e7eb',
    textSecondary: '#9ca3af',
    textMuted: '#6b7280',
    accent: '#10b981',
    resolved: '#8b5cf6',
    error: '#ef4444',
    warning: '#f59e0b',
  },
  fonts: {
    body: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: '"IBM Plex Mono", "SF Mono", "Fira Code", monospace',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 6,
    md: 12,
    lg: 16,
    xl: 24,
  },
  shadows: {
    bubble: '0 2px 8px rgba(0, 0, 0, 0.3)',
    float: '0 8px 32px rgba(0, 0, 0, 0.4)',
  },
  transitions: {
    fast: '0.15s ease',
    normal: '0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  },
};

const STATUS_OPTIONS: { value: TicketStatus; label: string; color: string; bgColor: string }[] = [
  { value: 'open', label: 'Aberto', color: THEME.colors.accent, bgColor: 'rgba(16, 185, 129, 0.15)' },
  { value: 'in_progress', label: 'Em Andamento', color: THEME.colors.warning, bgColor: 'rgba(245, 158, 11, 0.15)' },
  { value: 'resolved', label: 'Resolvido', color: THEME.colors.resolved, bgColor: 'rgba(139, 92, 246, 0.15)' },
  { value: 'closed', label: 'Fechado', color: THEME.colors.textMuted, bgColor: 'rgba(107, 114, 128, 0.15)' },
];

interface Props {
  ticketId: number;
  onStatusChange?: (status: TicketStatus) => void;
}

export const AdminTicketChat: React.FC<Props> = ({ ticketId, onStatusChange }) => {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messageBody, setMessageBody] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentPreviews, setAttachmentPreviews] = useState<string[]>([]);
  const [status, setStatus] = useState<TicketStatus>('open');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const statusSelectRef = useRef<HTMLSelectElement>(null);

  // Fetch ticket data
  const fetchTicket = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/admin/tickets/${ticketId}`);
      const t = data.ticket || data;
      setTicket(t);
      setStatus(t.status);
    } catch (err) {
      console.error('Erro ao buscar ticket:', err);
    }
  }, [ticketId]);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/admin/tickets/${ticketId}/messages`);
      setMessages(data.items || data);
    } catch (err) {
      console.error('Erro ao buscar mensagens:', err);
    }
  }, [ticketId]);

  // Initial load
  useEffect(() => {
    let mounted = true;
    (async () => {
      await Promise.all([fetchTicket(), fetchMessages()]);
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [fetchTicket, fetchMessages]);

  // Supabase Realtime subscription
  useEffect(() => {
    if (!ticketId) return;

    const channel = supabase
      .channel(`admin-ticket:${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_messages',
          filter: `ticket_id=eq.${ticketId}`
        },
        (payload) => {
          console.log('[Realtime Admin] Evento recebido:', payload.eventType);
          
          if (payload.eventType === 'INSERT') {
            const raw = payload.new as any;
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
          } else if (payload.eventType === 'UPDATE') {
            const raw = payload.new as any;
            const updatedMessage: TicketMessage = {
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
            setMessages(prev => prev.map(m => 
              m.id === updatedMessage.id ? updatedMessage : m
            ));
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime Admin] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  // Save status
  const handleSaveStatus = async () => {
    setSavingStatus(true);
    try {
      await apiClient.patch(`/admin/tickets/${ticketId}/status`, { status });
      setTicket(prev => prev ? { ...prev, status } : prev);
      onStatusChange?.(status);
    } catch (err) {
      console.error('Erro ao salvar status:', err);
      alert('Falha ao atualizar status');
    } finally {
      setSavingStatus(false);
    }
  };

  // Quick status change
  const handleStatusChange = async (newStatus: TicketStatus) => {
    setStatus(newStatus);
    setSavingStatus(true);
    try {
      await apiClient.patch(`/admin/tickets/${ticketId}/status`, { status: newStatus });
      setTicket(prev => prev ? { ...prev, status: newStatus } : prev);
      onStatusChange?.(newStatus);
    } catch (err) {
      console.error('Erro ao alterar status:', err);
    } finally {
      setSavingStatus(false);
    }
  };

  // File selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validImages = files.filter(f => f.type.startsWith('image/'));
    
    if (validImages.length === 0) {
      alert('Por favor, selecione apenas imagens.');
      return;
    }

    const totalFiles = [...attachments, ...validImages].slice(0, 4);
    setAttachments(totalFiles.slice(0, 4));
    
    const newPreviews = validImages.map(f => URL.createObjectURL(f));
    setAttachmentPreviews(prev => [...prev, ...newPreviews].slice(0, 4));
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Remove attachment
  const removeAttachment = (index: number) => {
    URL.revokeObjectURL(attachmentPreviews[index]);
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

      await apiClient.post(`/admin/tickets/${ticketId}/messages`, formData);
      
      setMessageBody('');
      setAttachments([]);
      attachmentPreviews.forEach(url => URL.revokeObjectURL(url));
      setAttachmentPreviews([]);
      await fetchMessages();
    } catch (err: any) {
      console.error('Erro ao enviar:', err);
      const errorMsg = err?.response?.data?.message || 'Falha ao enviar mensagem';
      alert(errorMsg);
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

  // Get status from value
  const getStatusInfo = (statusValue: string) => {
    return STATUS_OPTIONS.find(s => s.value === statusValue) || STATUS_OPTIONS[0];
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingSpinner} />
        <span style={styles.loadingText}>Carregando ticket...</span>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>🎫</div>
        <h2 style={styles.emptyTitle}>Ticket não encontrado</h2>
        <p style={styles.emptyText}>Este ticket não existe ou foi removido.</p>
      </div>
    );
  }

  const currentStatus = getStatusInfo(status);

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.headerTop}>
            <h1 style={styles.headerTitle}>
              <span style={styles.ticketHash}>#{ticket.id}</span>
              {ticket.subject}
            </h1>
            <div style={styles.ticketMeta}>
              <span style={styles.metaLabel}>Cliente:</span>
              <span style={styles.metaValue}>ID {ticket.userId}</span>
              <span style={styles.metaDivider}>•</span>
              <span style={styles.metaLabel}>Criado:</span>
              <span style={styles.metaValue}>
                {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
              </span>
            </div>
          </div>

          {/* Status controls */}
          <div style={styles.headerActions}>
            <div style={styles.statusSelectWrapper}>
              <select
                ref={statusSelectRef}
                value={status}
                onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                style={styles.statusSelect}
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div style={{
                ...styles.statusIndicator,
                backgroundColor: currentStatus.color,
              }} />
            </div>
            
            <button
              onClick={handleSaveStatus}
              disabled={savingStatus}
              style={{
                ...styles.btnAction,
                ...(savingStatus ? styles.btnDisabled : styles.btnSecondary)
              }}
            >
              {savingStatus ? 'Salvando...' : 'Salvar'}
            </button>
            
            <button
              onClick={() => handleStatusChange('resolved')}
              disabled={status === 'resolved' || savingStatus}
              style={{
                ...styles.btnAction,
                ...(status === 'resolved' || savingStatus ? styles.btnDisabled : styles.btnResolve)
              }}
            >
              ✓ Resolver
            </button>
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <main style={styles.messageArea}>
        {messages.length === 0 && (
          <div style={styles.emptyMessages}>
            <div style={styles.emptyMessagesIcon}>💬</div>
            <p style={styles.emptyMessagesText}>Nenhuma mensagem neste ticket ainda.</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isAdmin = msg.senderType === 'admin';
          const isSystem = msg.senderType === 'system';
          const showDate = idx === 0 || 
            new Date(msg.createdAt).toDateString() !== 
            new Date(messages[idx - 1].createdAt).toDateString();
          
          const senderName = isSystem 
            ? 'Sistema' 
            : isAdmin 
            ? 'Admin' 
            : 'Usuário';

          return (
            <React.Fragment key={msg.id}>
              {showDate && (
                <div style={styles.dateDivider}>
                  <div style={styles.dateLine} />
                  <span style={styles.dateText}>
                    {new Date(msg.createdAt).toLocaleDateString('pt-BR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long'
                    })}
                  </span>
                  <div style={styles.dateLine} />
                </div>
              )}

              <div style={{
                ...styles.messageRow,
                justifyContent: isAdmin ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  ...styles.messageBubble,
                  ...(isAdmin ? styles.bubbleAdmin : styles.bubbleUser),
                  animation: 'bubblePop 0.3s ease-out forwards',
                }}>
                  {/* Sender name */}
                  <div style={{
                    ...styles.senderName,
                    ...(isAdmin ? styles.senderNameAdmin : styles.senderNameUser)
                  }}>
                    {senderName}
                  </div>

                  {/* Image attachments */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div style={styles.attachmentsGrid}>
                      {msg.attachments.map((att) => (
                        <div key={att.id} style={styles.imageWrapper}>
                          <img 
                            src={att.publicUrl}
                            alt={att.originalName}
                            style={styles.messageImage}
                            loading="lazy"
                            onClick={() => window.open(att.publicUrl, '_blank')}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Message body */}
                  {msg.body && msg.body.trim() && (
                    <p style={{
                      ...styles.messageText,
                      ...(isAdmin ? styles.textAdmin : styles.textUser)
                    }}>
                      {msg.body}
                    </p>
                  )}

                  {/* Timestamp */}
                  <div style={{
                    ...styles.timestamp,
                    ...(isAdmin ? styles.timestampAdmin : styles.timestampUser)
                  }}>
                    {new Date(msg.createdAt).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
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
      <footer style={styles.inputArea}>
        {/* Attachment previews */}
        {attachmentPreviews.length > 0 && (
          <div style={styles.previewContainer}>
            {attachmentPreviews.map((preview, idx) => (
              <div key={idx} style={styles.previewWrapper}>
                <img src={preview} alt={`Preview ${idx}`} style={styles.previewImage} />
                <button 
                  onClick={() => removeAttachment(idx)}
                  style={styles.previewRemove}
                  aria-label="Remover imagem"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input row */}
        <div style={styles.inputRow}>
          {/* Attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              ...styles.attachButton,
              ...(attachments.length >= 4 ? styles.attachButtonDisabled : {})
            }}
            disabled={attachments.length >= 4}
            aria-label="Anexar imagens"
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

          {/* Text input */}
          <textarea
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua resposta..."
            rows={1}
            style={styles.textArea}
            disabled={sending}
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={sending || (!messageBody.trim() && attachments.length === 0)}
            style={{
              ...styles.sendButton,
              ...(sending || (!messageBody.trim() && attachments.length === 0) 
                ? styles.sendButtonDisabled 
                : styles.sendButtonEnabled)
            }}
            aria-label="Enviar resposta"
          >
            {sending ? (
              <div style={styles.sendingSpinner} />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            )}
          </button>
        </div>
      </footer>

      {/* CSS Animations */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes bubblePop {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(5px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes sendingSpin {
          to {
            transform: rotate(360deg);
          }
        }

        * {
          box-sizing: border-box;
        }

        textarea {
          resize: none;
          outline: none;
          font-family: inherit;
        }
      `}</style>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: THEME.colors.bg,
    color: THEME.colors.text,
    fontFamily: THEME.fonts.body,
    overflow: 'hidden',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: THEME.spacing.md,
    backgroundColor: THEME.colors.bg,
  },
  loadingSpinner: {
    width: 40,
    height: 40,
    border: '3px solid',
    borderTopColor: 'transparent',
    borderRightColor: THEME.colors.accent,
    borderRadius: '50%',
    animation: 'sendingSpin 1s linear infinite',
  },
  loadingText: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
    fontWeight: 500,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: THEME.spacing.md,
    backgroundColor: THEME.colors.bg,
  },
  emptyIcon: {
    fontSize: 64,
    opacity: 0.6,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 600,
    margin: 0,
    color: THEME.colors.text,
  },
  emptyText: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    margin: 0,
  },

  // Header
  header: {
    flexShrink: 0,
    backgroundColor: THEME.colors.bgSecondary,
    borderBottom: `1px solid ${THEME.colors.border}`,
    padding: `${THEME.spacing.md} ${THEME.spacing.lg}`,
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  headerContent: {
    maxWidth: 1000,
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: THEME.spacing.lg,
    flexWrap: 'wrap',
  },
  headerTop: {
    flex: 1,
    minWidth: 200,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 600,
    margin: `0 0 ${THEME.spacing.sm} 0`,
    display: 'flex',
    alignItems: 'center',
    gap: THEME.spacing.sm,
    flexWrap: 'wrap',
  },
  ticketHash: {
    color: THEME.colors.textMuted,
    fontWeight: 500,
  },
  ticketMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: THEME.spacing.sm,
    fontSize: 13,
    color: THEME.colors.textSecondary,
  },
  metaLabel: {
    color: THEME.colors.textMuted,
  },
  metaValue: {
    color: THEME.colors.textSecondary,
  },
  metaDivider: {
    color: THEME.colors.borderLight,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: THEME.spacing.sm,
    flexWrap: 'wrap',
  },
  statusSelectWrapper: {
    position: 'relative',
  },
  statusSelect: {
    appearance: 'none',
    padding: `${THEME.spacing.sm} ${THEME.spacing.lg} ${THEME.spacing.sm} ${THEME.spacing.md}`,
    borderRadius: THEME.borderRadius.md,
    border: `1px solid ${THEME.colors.border}`,
    backgroundColor: THEME.colors.bgTertiary,
    color: THEME.colors.text,
    fontSize: 13,
    fontWeight: 500,
    fontFamily: THEME.fonts.body,
    cursor: 'pointer',
    outline: 'none',
    paddingRight: 32,
  },
  statusIndicator: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  btnAction: {
    padding: `${THEME.spacing.sm} ${THEME.spacing.md}`,
    borderRadius: THEME.borderRadius.md,
    border: 'none',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: THEME.fonts.body,
    cursor: 'pointer',
    transition: `all ${THEME.transitions.fast}`,
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  btnSecondary: {
    backgroundColor: THEME.colors.bgTertiary,
    color: THEME.colors.text,
    border: `1px solid ${THEME.colors.border}`,
  },
  btnResolve: {
    backgroundColor: THEME.colors.accent,
    color: '#fff',
  },

  // Message Area
  messageArea: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: `${THEME.spacing.lg} ${THEME.spacing.xl}`,
    display: 'flex',
    flexDirection: 'column',
    gap: THEME.spacing.sm,
  },
  emptyMessages: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `${THEME.spacing.xl} 0`,
    textAlign: 'center',
  },
  emptyMessagesIcon: {
    fontSize: 48,
    marginBottom: THEME.spacing.md,
    opacity: 0.5,
  },
  emptyMessagesText: {
    fontSize: 14,
    color: THEME.colors.textMuted,
    margin: 0,
  },
  dateDivider: {
    display: 'flex',
    alignItems: 'center',
    gap: THEME.spacing.md,
    margin: `${THEME.spacing.md} 0`,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: THEME.colors.border,
  },
  dateText: {
    fontSize: 12,
    fontWeight: 500,
    color: THEME.colors.textMuted,
    fontFamily: THEME.fonts.mono,
    textTransform: 'capitalize',
  },
  messageRow: {
    display: 'flex',
  },
  messageBubble: {
    maxWidth: '70%',
    padding: THEME.spacing.md,
    borderRadius: THEME.borderRadius.lg,
    boxShadow: THEME.shadows.bubble,
  },
  bubbleUser: {
    backgroundColor: THEME.colors.userBubble,
    borderBottomLeftRadius: THEME.borderRadius.sm,
  },
  bubbleAdmin: {
    backgroundColor: THEME.colors.adminBubble,
    borderBottomRightRadius: THEME.borderRadius.sm,
  },
  senderName: {
    fontSize: 12,
    fontWeight: 600,
    marginBottom: THEME.spacing.xs,
    opacity: 0.85,
  },
  senderNameUser: {
    color: THEME.colors.textSecondary,
  },
  senderNameAdmin: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  attachmentsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.sm,
  },
  imageWrapper: {
    borderRadius: THEME.borderRadius.md,
    overflow: 'hidden',
    cursor: 'pointer',
  },
  messageImage: {
    width: '100%',
    height: 'auto',
    maxHeight: 180,
    objectFit: 'cover',
    display: 'block',
  },
  messageText: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  textUser: {
    color: THEME.colors.text,
  },
  textAdmin: {
    color: '#fff',
  },
  timestamp: {
    fontSize: 11,
    fontFamily: THEME.fonts.mono,
    fontWeight: 500,
    marginTop: THEME.spacing.sm,
    opacity: 0.6,
  },
  timestampUser: {
    textAlign: 'left',
  },
  timestampAdmin: {
    textAlign: 'right',
    color: 'rgba(255, 255, 255, 0.7)',
  },

  // Input Area
  inputArea: {
    flexShrink: 0,
    backgroundColor: THEME.colors.bgSecondary,
    borderTop: `1px solid ${THEME.colors.border}`,
    padding: THEME.spacing.md,
  },
  previewContainer: {
    display: 'flex',
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.sm,
    flexWrap: 'wrap',
    maxWidth: 1000,
    margin: `0 auto ${THEME.spacing.sm} auto`,
  },
  previewWrapper: {
    position: 'relative',
    width: 56,
    height: 56,
    borderRadius: THEME.borderRadius.md,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  previewRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: '50%',
    border: 'none',
    backgroundColor: THEME.colors.error,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  inputRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: THEME.spacing.sm,
    maxWidth: 1000,
    margin: '0 auto',
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: THEME.borderRadius.md,
    border: `1px solid ${THEME.colors.border}`,
    backgroundColor: 'transparent',
    color: THEME.colors.textSecondary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: `all ${THEME.transitions.fast}`,
    flexShrink: 0,
  },
  attachButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  textArea: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    padding: `${THEME.spacing.sm} ${THEME.spacing.md}`,
    borderRadius: THEME.borderRadius.lg,
    border: `1px solid ${THEME.colors.border}`,
    backgroundColor: THEME.colors.bgTertiary,
    color: THEME.colors.text,
    fontSize: 14,
    lineHeight: 1.5,
    resize: 'none',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: THEME.borderRadius.lg,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendButtonEnabled: {
    backgroundColor: THEME.colors.adminBubble,
    color: '#fff',
  },
  sendButtonDisabled: {
    backgroundColor: THEME.colors.bgTertiary,
    color: THEME.colors.textMuted,
    cursor: 'not-allowed',
  },
  sendingSpinner: {
    width: 18,
    height: 18,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'sendingSpin 0.8s linear infinite',
  },
};

export default AdminTicketChat;
