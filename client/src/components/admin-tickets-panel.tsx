import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api';
import type { Ticket, TicketStatus, TicketPriority, TicketMessage } from '../types/tickets';

const STATUS_LABELS: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  resolved: 'Resolvido',
  closed: 'Fechado',
};
const STATUS_COLORS: Record<string, string> = {
  open: '#10b981',
  in_progress: '#f59e0b',
  resolved: '#8b5cf6',
  closed: '#6b7280',
};
const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
};

export default function AdminTicketsPanel() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messageBody, setMessageBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const fetchTickets = useCallback(async () => {
    try {
      setLoadingTickets(true);
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      const { data } = await apiClient.get('/admin/tickets', { params });
      setTickets(data.items || []);
    } catch (err) {
      console.error('Erro ao carregar tickets:', err);
    } finally {
      setLoadingTickets(false);
    }
  }, [statusFilter, priorityFilter]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const selectTicket = async (ticketId: number) => {
    setSelectedTicketId(ticketId);
    setLoadingMessages(true);
    try {
      const [ticketRes, msgRes] = await Promise.all([
        apiClient.get(`/admin/tickets/${ticketId}`),
        apiClient.get(`/admin/tickets/${ticketId}/messages`),
      ]);
      setSelectedTicket(ticketRes.data.ticket || ticketRes.data);
      setMessages(msgRes.data.items || msgRes.data || []);
    } catch (err) {
      console.error('Erro ao carregar ticket:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSend = async () => {
    if (!selectedTicketId || (!messageBody.trim() && attachments.length === 0)) return;
    if (sending) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('body', messageBody.trim());
      attachments.forEach(f => formData.append('attachments', f));
      await apiClient.post(`/admin/tickets/${selectedTicketId}/messages`, formData);
      setMessageBody('');
      setAttachments([]);
      // Refresh messages
      const { data } = await apiClient.get(`/admin/tickets/${selectedTicketId}/messages`);
      setMessages(data.items || data || []);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao enviar');
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (ticketId: number, newStatus: TicketStatus) => {
    try {
      await apiClient.patch(`/admin/tickets/${ticketId}/status`, { status: newStatus });
      setSelectedTicket(prev => prev ? { ...prev, status: newStatus } : prev);
      fetchTickets();
    } catch (err) {
      alert('Erro ao alterar status');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/')).slice(0, 4);
    setAttachments(prev => [...prev, ...files].slice(0, 4));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Mobile: if ticket selected, show chat full-screen
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', gap: 0, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      {/* Ticket List */}
      {(!isMobile || !selectedTicketId) && (
        <div style={{ width: isMobile ? '100%' : 360, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: 12, borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
              <option value="">Todos status</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
              <option value="">Todas prioridades</option>
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button onClick={fetchTickets} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', fontSize: 13 }}>↻</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingTickets ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>Carregando...</div>
            ) : tickets.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>Nenhum ticket encontrado</div>
            ) : tickets.map(t => (
              <div
                key={t.id}
                onClick={() => selectTicket(t.id)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #f3f4f6',
                  cursor: 'pointer',
                  background: selectedTicketId === t.id ? '#eff6ff' : t.unreadCountAdmin > 0 ? '#fef3c7' : '#fff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>#{t.id} {t.subject}</span>
                  {t.unreadCountAdmin > 0 && (
                    <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{t.unreadCountAdmin}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                  <span style={{ background: STATUS_COLORS[t.status] + '22', color: STATUS_COLORS[t.status], padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>
                    {STATUS_LABELS[t.status] || t.status}
                  </span>
                  <span style={{ color: '#6b7280' }}>{PRIORITY_LABELS[t.priority] || t.priority}</span>
                  <span style={{ color: '#9ca3af' }}>
                    {t.lastMessageAt ? new Date(t.lastMessageAt).toLocaleDateString('pt-BR') : ''}
                  </span>
                </div>
                {t.lastMessagePreview && (
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.lastMessagePreview}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!selectedTicketId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎫</div>
              <p>Selecione um ticket para visualizar</p>
            </div>
          </div>
        ) : loadingMessages ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>Carregando...</div>
        ) : (
          <>
            {/* Chat Header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isMobile && (
                  <button onClick={() => setSelectedTicketId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>←</button>
                )}
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>#{selectedTicket?.id} - {selectedTicket?.subject}</h3>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    Prioridade: {PRIORITY_LABELS[selectedTicket?.priority || ''] || selectedTicket?.priority}
                  </span>
                </div>
              </div>
              <select
                value={selectedTicket?.status || 'open'}
                onChange={e => selectedTicketId && handleStatusChange(selectedTicketId, e.target.value as TicketStatus)}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, fontWeight: 500 }}
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {messages.map(msg => {
                const isAdmin = msg.senderType === 'admin';
                const createdAt = msg.createdAt || (msg as any).created_at;
                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: isAdmin ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '70%', padding: '10px 14px', borderRadius: 12,
                      background: isAdmin ? '#3b82f6' : '#f3f4f6',
                      color: isAdmin ? '#fff' : '#1f2937',
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2, opacity: 0.8 }}>
                        {msg.senderType === 'system' ? 'Sistema' : isAdmin ? 'Admin' : 'Usuário'}
                      </div>
                      {msg.attachments?.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                          {msg.attachments.map(att => (
                            <img key={att.id} src={att.publicUrl} alt={att.originalName} style={{ maxWidth: 200, maxHeight: 150, borderRadius: 8, cursor: 'pointer' }} onClick={() => window.open(att.publicUrl, '_blank')} />
                          ))}
                        </div>
                      )}
                      {msg.body?.trim() && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{msg.body}</p>}
                      <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6, textAlign: isAdmin ? 'right' : 'left' }}>
                        {createdAt ? new Date(createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input */}
            <div style={{ padding: 12, borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <button onClick={() => fileInputRef.current?.click()} disabled={attachments.length >= 4} style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>📎</button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} style={{ display: 'none' }} />
              {attachments.length > 0 && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {attachments.map((f, i) => (
                    <span key={i} style={{ fontSize: 11, background: '#e5e7eb', padding: '2px 6px', borderRadius: 4, cursor: 'pointer' }} onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}>
                      {f.name.slice(0, 10)}… ×
                    </span>
                  ))}
                </div>
              )}
              <textarea
                value={messageBody}
                onChange={e => setMessageBody(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Responder ao ticket..."
                rows={1}
                style={{ flex: 1, minHeight: 36, maxHeight: 100, padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, resize: 'none', outline: 'none' }}
                disabled={sending}
              />
              <button
                onClick={handleSend}
                disabled={sending || (!messageBody.trim() && attachments.length === 0)}
                style={{
                  width: 40, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: sending || (!messageBody.trim() && attachments.length === 0) ? '#e5e7eb' : '#3b82f6',
                  color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                {sending ? '...' : '➤'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
