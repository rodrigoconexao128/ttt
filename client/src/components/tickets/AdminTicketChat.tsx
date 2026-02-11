import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Ticket, TicketMessage, TicketStatus } from '../../types/tickets';

interface Props {
  ticketId: number;
  onStatusChange?: (status: TicketStatus) => void;
}

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: 'open', label: 'Aberto' },
  { value: 'in_progress', label: 'Em Andamento' },
  { value: 'resolved', label: 'Resolvido' },
  { value: 'closed', label: 'Fechado' },
];

const AdminTicketChat: React.FC<Props> = ({ ticketId, onStatusChange }) => {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [status, setStatus] = useState<TicketStatus>('open');
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTicket = useCallback(async () => {
    try {
      const { data } = await axios.get<Ticket>(`/api/admin/tickets/${ticketId}`);
      setTicket(data);
      setStatus(data.status);
    } catch (err) {
      console.error('Erro ao buscar ticket:', err);
    }
  }, [ticketId]);

  const fetchMessages = useCallback(async () => {
    try {
      const { data } = await axios.get<TicketMessage[]>(`/api/admin/tickets/${ticketId}/messages`);
      setMessages(data);
    } catch (err) {
      console.error('Erro ao buscar mensagens:', err);
    }
  }, [ticketId]);

  // Initial load
  useEffect(() => {
    fetchTicket();
    fetchMessages();
  }, [fetchTicket, fetchMessages]);

  // Polling every 5s
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      fetchMessages();
    }, 5000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSaveStatus = async () => {
    setSavingStatus(true);
    try {
      await axios.patch(`/api/admin/tickets/${ticketId}`, { status });
      setTicket((prev) => (prev ? { ...prev, status } : prev));
      onStatusChange?.(status);
    } catch (err) {
      console.error('Erro ao salvar status:', err);
    } finally {
      setSavingStatus(false);
    }
  };

  const handleResolve = async () => {
    setSavingStatus(true);
    try {
      await axios.patch(`/api/admin/tickets/${ticketId}`, { status: 'resolved' });
      setStatus('resolved');
      setTicket((prev) => (prev ? { ...prev, status: 'resolved' } : prev));
      onStatusChange?.('resolved');
    } catch (err) {
      console.error('Erro ao resolver ticket:', err);
    } finally {
      setSavingStatus(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const allowed = files.slice(0, 4 - images.length);
    if (allowed.length === 0) return;

    setImages((prev) => [...prev, ...allowed]);
    const newPreviews = allowed.map((f) => URL.createObjectURL(f));
    setPreviews((prev) => [...prev, ...newPreviews]);
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setImages((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!newMessage.trim() && images.length === 0) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('body', newMessage.trim());
      images.forEach((img) => formData.append('attachments', img));

      await axios.post(`/api/admin/tickets/${ticketId}/messages`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setNewMessage('');
      previews.forEach((p) => URL.revokeObjectURL(p));
      setImages([]);
      setPreviews([]);
      await fetchMessages();
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Cleanup previews on unmount
  useEffect(() => {
    return () => previews.forEach((p) => URL.revokeObjectURL(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ticket) {
    return <div style={styles.loading}>Carregando ticket...</div>;
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTop}>
          <h2 style={styles.title}>#{ticket.id} — {ticket.subject}</h2>
        </div>
        <div style={styles.headerActions}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TicketStatus)}
            style={styles.select}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button onClick={handleSaveStatus} disabled={savingStatus} style={styles.btnSecondary}>
            {savingStatus ? 'Salvando...' : 'Salvar Status'}
          </button>
          <button onClick={handleResolve} disabled={savingStatus || status === 'resolved'} style={styles.btnResolve}>
            ✓ Resolver
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={styles.messagesArea}>
        {messages.map((msg) => {
          const isAdmin = msg.senderType === 'admin';
          return (
            <div key={msg.id} style={{ ...styles.msgRow, justifyContent: isAdmin ? 'flex-end' : 'flex-start' }}>
              <div style={isAdmin ? styles.bubbleAdmin : styles.bubbleUser}>
                <div style={styles.senderName}>
                  {msg.senderName || (isAdmin ? 'Admin' : 'Usuário')}
                </div>
                {msg.body && <div style={styles.msgBody}>{msg.body}</div>}
                {msg.attachments?.length > 0 && (
                  <div style={styles.attachments}>
                    {msg.attachments.map((att) => (
                      <img
                        key={att.id}
                        src={att.publicUrl}
                        alt={att.originalName}
                        style={styles.attachImg}
                        onClick={() => window.open(att.publicUrl, '_blank')}
                      />
                    ))}
                  </div>
                )}
                <div style={styles.timestamp}>
                  {new Date(msg.createdAt).toLocaleString('pt-BR')}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Image previews */}
      {previews.length > 0 && (
        <div style={styles.previewRow}>
          {previews.map((src, i) => (
            <div key={i} style={styles.previewItem}>
              <img src={src} alt={`preview-${i}`} style={styles.previewImg} />
              <button onClick={() => removeImage(i)} style={styles.previewRemove}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={styles.inputArea}>
        <input
          type="file"
          accept="image/*"
          multiple
          ref={fileInputRef}
          onChange={handleImageSelect}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={images.length >= 4}
          style={styles.btnUpload}
          title="Anexar imagens (máx 4)"
        >
          📎
        </button>
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite sua resposta..."
          rows={2}
          style={styles.textarea}
        />
        <button onClick={handleSend} disabled={sending} style={styles.btnSend}>
          {sending ? '...' : 'Enviar'}
        </button>
      </div>
    </div>
  );
};

/* ── Inline Styles ── */
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', height: '100%',
    border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden', background: '#fff',
  },
  loading: { padding: 32, textAlign: 'center', color: '#888' },
  header: {
    padding: '12px 16px', borderBottom: '1px solid #eee', background: '#fafafa',
  },
  headerTop: { marginBottom: 8 },
  title: { margin: 0, fontSize: 16, fontWeight: 600 },
  headerActions: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  select: {
    padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 13,
  },
  btnSecondary: {
    padding: '6px 14px', borderRadius: 4, border: '1px solid #ccc',
    background: '#fff', cursor: 'pointer', fontSize: 13,
  },
  btnResolve: {
    padding: '6px 14px', borderRadius: 4, border: 'none',
    background: '#22c55e', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
  messagesArea: {
    flex: 1, overflowY: 'auto', padding: 16, display: 'flex',
    flexDirection: 'column', gap: 8, background: '#f9fafb',
  },
  msgRow: { display: 'flex' },
  bubbleUser: {
    maxWidth: '70%', padding: '8px 12px', borderRadius: '12px 12px 12px 2px',
    background: '#e5e7eb', fontSize: 14,
  },
  bubbleAdmin: {
    maxWidth: '70%', padding: '8px 12px', borderRadius: '12px 12px 2px 12px',
    background: '#3b82f6', color: '#fff', fontSize: 14,
  },
  senderName: { fontSize: 11, fontWeight: 600, marginBottom: 2, opacity: 0.7 },
  msgBody: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  attachments: { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 },
  attachImg: {
    width: 80, height: 80, objectFit: 'cover', borderRadius: 4, cursor: 'pointer',
  },
  timestamp: { fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: 'right' },
  previewRow: {
    display: 'flex', gap: 8, padding: '8px 16px', borderTop: '1px solid #eee',
    background: '#fafafa',
  },
  previewItem: { position: 'relative' },
  previewImg: { width: 60, height: 60, objectFit: 'cover', borderRadius: 4 },
  previewRemove: {
    position: 'absolute', top: -6, right: -6, width: 20, height: 20,
    borderRadius: '50%', border: 'none', background: '#ef4444', color: '#fff',
    cursor: 'pointer', fontSize: 14, lineHeight: '18px', padding: 0,
  },
  inputArea: {
    display: 'flex', gap: 8, padding: '10px 16px', borderTop: '1px solid #eee',
    alignItems: 'flex-end', background: '#fff',
  },
  btnUpload: {
    width: 36, height: 36, borderRadius: '50%', border: '1px solid #ccc',
    background: '#fff', cursor: 'pointer', fontSize: 18, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  },
  textarea: {
    flex: 1, resize: 'none', padding: '8px 12px', borderRadius: 8,
    border: '1px solid #ccc', fontSize: 14, fontFamily: 'inherit',
  },
  btnSend: {
    padding: '8px 20px', borderRadius: 8, border: 'none',
    background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },
};

export default AdminTicketChat;
