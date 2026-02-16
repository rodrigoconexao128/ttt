import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '../../lib/supabase';
import { apiClient } from '../../lib/api';
import type { Ticket, TicketMessage, TicketAttachment } from '../../types/tickets';

const getAttachmentUrl = (attachment: TicketAttachment): string => {
  if (attachment.publicUrl) return attachment.publicUrl;
  const { data } = supabase.storage.from('ticket-attachments').getPublicUrl(attachment.originalName);
  return data?.publicUrl || '';
};

const AttachmentImage: React.FC<{ attachment: TicketAttachment }> = ({ attachment }) => {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const url = getAttachmentUrl(attachment);
  const isImage = attachment.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(attachment.originalName || '');

  if (error || !url) {
    return (
      <div style={{ padding: 16, backgroundColor: '#f7f7f8', borderRadius: 12, border: '1px solid #e5e5e5', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 24 }}>📎</span>
        <span style={{ fontSize: 12, color: '#666' }}>{attachment.originalName || 'Arquivo'}</span>
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#10b981', textDecoration: 'none' }}>Abrir arquivo</a>
      </div>
    );
  }

  if (!isImage) {
    return (
      <div style={{ padding: '12px 16px', backgroundColor: '#f7f7f8', borderRadius: 12, border: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20 }}>📄</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{attachment.originalName || 'Arquivo'}</div>
          <div style={{ fontSize: 11, color: '#999' }}>{(attachment.sizeBytes / 1024).toFixed(1)} KB</div>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#10b981', textDecoration: 'none', padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e5e5' }}>Download</a>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' as const, borderRadius: 12, overflow: 'hidden', backgroundColor: '#f7f7f8' }}>
      {!loaded && (
        <div style={{ position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f7f8' }}>
          <div style={{ width: 24, height: 24, border: '2px solid transparent', borderTopColor: '#999', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      )}
      <img src={url} alt={attachment.originalName} onLoad={() => setLoaded(true)} onError={() => setError(true)} onClick={() => window.open(url, '_blank')}
        style={{ width: '100%', maxWidth: 400, height: 'auto', maxHeight: 300, objectFit: 'cover' as const, cursor: 'pointer', display: loaded ? 'block' : 'none' }} />
    </div>
  );
};

const STATUS_COLORS: Record<string, string> = { open: '#3b82f6', in_progress: '#f59e0b', resolved: '#10b981', closed: '#6b7280' };
const STATUS_LABELS: Record<string, string> = { open: 'Aberto', in_progress: 'Em Andamento', resolved: 'Resolvido', closed: 'Fechado' };

interface Props { ticketId: number; }

export const UserTicketChat: React.FC<Props> = ({ ticketId }) => {
  const [, setLocation] = useLocation();
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

  const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, []);

  const fetchData = useCallback(async () => {
    try {
      const [ticketRes, msgRes] = await Promise.all([apiClient.get(`/tickets/${ticketId}`), apiClient.get(`/tickets/${ticketId}/messages`)]);
      setTicket(ticketRes.data.ticket);
      setMessages(msgRes.data.items);
    } catch (err) { console.error('Erro ao carregar dados:', err); }
  }, [ticketId]);

  const markAsRead = useCallback(async () => { try { await apiClient.post(`/tickets/${ticketId}/read`); } catch (err) { console.error(err); } }, [ticketId]);

  useEffect(() => { let m = true; (async () => { await fetchData(); if (m) { setLoading(false); await markAsRead(); } })(); return () => { m = false; }; }, [fetchData, markAsRead]);

  useEffect(() => {
    if (!ticketId) return;
    const channel = supabase.channel(`ticket:${ticketId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${ticketId}` }, (payload) => {
      if (payload.eventType === 'INSERT') {
        const raw = payload.new as any;
        const hasAttach = raw.has_attachments ?? raw.hasAttachments ?? false;
        if (hasAttach) {
          // Realtime payload não traz attachments (sem JOIN) — refetch completo
          fetchData();
        } else {
          const newMessage: TicketMessage = { id: raw.id, ticketId: raw.ticket_id ?? raw.ticketId, senderType: raw.sender_type ?? raw.senderType, senderUserId: raw.sender_user_id ?? raw.senderUserId, senderAdminId: raw.sender_admin_id ?? raw.senderAdminId, body: raw.body ?? '', hasAttachments: false, attachments: [], createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString() };
          setMessages(prev => prev.some(m => m.id === newMessage.id) ? prev : [...prev, newMessage]);
        }
      }
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ticketId]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/')).slice(0, 4 - attachments.length);
    if (!files.length) return;
    setAttachments(prev => [...prev, ...files].slice(0, 4));
    setAttachmentPreviews(prev => [...prev, ...files.map(f => ({ url: URL.createObjectURL(f), name: f.name }))].slice(0, 4));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (i: number) => { URL.revokeObjectURL(attachmentPreviews[i].url); setAttachments(prev => prev.filter((_, j) => j !== i)); setAttachmentPreviews(prev => prev.filter((_, j) => j !== i)); };

  const handleSend = async () => {
    if (!messageBody.trim() && attachments.length === 0) return;
    if (sending) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('body', messageBody.trim());
      attachments.forEach(file => formData.append('attachments', file));
      await apiClient.post(`/tickets/${ticketId}/messages`, formData);
      setMessageBody(''); setAttachments([]); attachmentPreviews.forEach(p => URL.revokeObjectURL(p.url)); setAttachmentPreviews([]);
      await fetchData();
    } catch (err: any) { console.error(err); alert(err?.response?.data?.message || 'Falha ao enviar mensagem'); } finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16, backgroundColor: '#fff' }}>
        <div style={{ width: 40, height: 40, border: '3px solid transparent', borderTopColor: '#10b981', borderRadius: '50%', animation: 'sendingSpin 1s linear infinite' }} />
        <span style={{ color: '#666', fontSize: 14 }}>Carregando ticket...</span>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16, backgroundColor: '#fff' }}>
        <div style={{ fontSize: 64, opacity: 0.4 }}>🎫</div>
        <h2 style={{ fontSize: 24, fontWeight: 600, margin: 0, color: '#1a1a1a' }}>Ticket não encontrado</h2>
        <p style={{ fontSize: 14, color: '#666', margin: 0 }}>Este ticket não existe ou foi removido.</p>
      </div>
    );
  }

  const hasContent = messageBody.trim() || attachments.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#ffffff', color: '#1a1a1a', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', overflow: 'hidden' }}>
      {/* Header */}
      <header style={{ flexShrink: 0, backgroundColor: '#ffffff', borderBottom: '1px solid #e5e5e5', padding: '12px 20px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => setLocation('/tickets')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#666', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, flexShrink: 0 }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f3f4f6')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
            ← Voltar
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                #{ticket.id} - {ticket.subject}
              </h1>
              <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, backgroundColor: (STATUS_COLORS[ticket.status] || '#6b7280') + '18', color: STATUS_COLORS[ticket.status] || '#6b7280', flexShrink: 0 }}>
                {STATUS_LABELS[ticket.status] || ticket.status}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
              Criado em {new Date(ticket.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <main ref={messagesContainerRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 8, backgroundColor: '#f7f7f8', scrollBehavior: 'smooth' }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <p style={{ fontSize: 15, color: '#6b7280', margin: 0, fontWeight: 500 }}>Envie sua primeira mensagem</p>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 0' }}>Nossa equipe responderá o mais breve possível</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isAdmin = msg.senderType === 'admin';
          const showDate = idx === 0 || new Date(msg.createdAt).toDateString() !== new Date(messages[idx - 1].createdAt).toDateString();

          return (
            <React.Fragment key={msg.id}>
              {showDate && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '16px 0' }}>
                  <div style={{ flex: 1, height: 1, backgroundColor: '#e5e5e5' }} />
                  <span style={{ fontSize: 12, color: '#999', whiteSpace: 'nowrap' }}>
                    {new Date(msg.createdAt).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                  <div style={{ flex: 1, height: 1, backgroundColor: '#e5e5e5' }} />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: isAdmin ? 'flex-start' : 'flex-end' }}>
                <div style={{
                  maxWidth: '70%', padding: '10px 14px',
                  borderRadius: isAdmin ? '18px 18px 18px 4px' : '18px 18px 4px 18px',
                  backgroundColor: isAdmin ? '#f0f0f0' : '#10b981',
                  color: isAdmin ? '#1a1a1a' : '#ffffff',
                }}>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: msg.body?.trim() ? 8 : 0 }}>
                      {msg.attachments.map(att => <AttachmentImage key={att.id} attachment={att} />)}
                    </div>
                  )}
                  {msg.body && msg.body.trim() && (
                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.body}</p>
                  )}
                  <div style={{ fontSize: 11, marginTop: 6, textAlign: isAdmin ? 'left' : 'right', color: isAdmin ? '#999' : 'rgba(255,255,255,0.7)' }}>
                    {new Date(msg.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
        <footer style={{ flexShrink: 0, backgroundColor: '#ffffff', borderTop: '1px solid #e5e5e5', padding: '12px 20px' }}>
          {attachmentPreviews.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', maxWidth: 800, margin: '0 auto 8px auto' }}>
              {attachmentPreviews.map((preview, idx) => (
                <div key={idx} style={{ position: 'relative', width: 56, height: 56, borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e5e5' }}>
                  <img src={preview.url} alt={preview.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={() => removeAttachment(idx)} style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', border: 'none', backgroundColor: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, maxWidth: 800, margin: '0 auto' }}>
            <button onClick={() => fileInputRef.current?.click()} disabled={attachments.length >= 4}
              style={{ width: 40, height: 44, borderRadius: 12, border: 'none', backgroundColor: 'transparent', color: attachments.length >= 4 ? '#d1d5db' : '#9ca3af', cursor: attachments.length >= 4 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'color 0.15s' }}
              onMouseEnter={e => { if (attachments.length < 4) e.currentTarget.style.color = '#6b7280'; }} onMouseLeave={e => { e.currentTarget.style.color = attachments.length >= 4 ? '#d1d5db' : '#9ca3af'; }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} style={{ display: 'none' }} />
            <div style={{ flex: 1, position: 'relative' }}>
              <textarea value={messageBody} onChange={e => setMessageBody(e.target.value)} onKeyDown={handleKeyDown} placeholder="Digite sua mensagem..." rows={1} disabled={sending}
                style={{ width: '100%', minHeight: 44, maxHeight: 120, padding: '12px 48px 12px 16px', borderRadius: 24, border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#1a1a1a', fontSize: 14, lineHeight: 1.5, resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                onFocus={e => e.currentTarget.style.borderColor = '#10b981'} onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'} />
              {hasContent && (
                <button onClick={handleSend} disabled={sending}
                  style={{ position: 'absolute', right: 6, bottom: 6, width: 32, height: 32, borderRadius: '50%', border: 'none', backgroundColor: '#10b981', color: '#fff', cursor: sending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, opacity: sending ? 0.6 : 1 }}>
                  {sending ? (
                    <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'sendingSpin 0.8s linear infinite' }} />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                  )}
                </button>
              )}
            </div>
          </div>
        </footer>
      )}

      <style>{`
        @keyframes sendingSpin { to { transform: rotate(360deg); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
};

export default UserTicketChat;
