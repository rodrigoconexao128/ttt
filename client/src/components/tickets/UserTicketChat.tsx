import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import type { Ticket, TicketMessage } from '../../types/tickets';

interface Props {
  ticketId: number;
}

export const UserTicketChat: React.FC<Props> = ({ ticketId }) => {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => body.trim().length > 0 || files.length > 0, [body, files]);

  const fetchData = async () => {
    const [ticketRes, msgRes] = await Promise.all([
      axios.get(`/api/tickets/${ticketId}`),
      axios.get(`/api/tickets/${ticketId}/messages`)
    ]);
    setTicket(ticketRes.data.ticket);
    setMessages(msgRes.data.items);
    await axios.post(`/api/tickets/${ticketId}/read`);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await fetchData();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    const interval = setInterval(() => fetchData().catch(() => null), 6000);
    return () => { alive = false; clearInterval(interval); };
  }, [ticketId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const onSend = async () => {
    if (!canSend || sending) return;
    try {
      setSending(true);
      const form = new FormData();
      form.append('body', body);
      files.forEach(f => form.append('attachments', f));
      await axios.post(`/api/tickets/${ticketId}/messages`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setBody('');
      setFiles([]);
      await fetchData();
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}>Carregando...</div>;
  if (!ticket) return <div style={{ padding: 20 }}>Chamado não encontrado.</div>;

  const getStatusLabel = (s: string) => ({
    open: 'Aberto',
    in_progress: 'Em andamento',
    resolved: 'Resolvido',
    closed: 'Fechado'
  })[s] || s;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: 16, borderBottom: '1px solid #dee2e6', backgroundColor: '#f8f9fa' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>#{ticket.id} - {ticket.subject}</h2>
        <div style={{ marginTop: 8, fontSize: 14, color: '#6c757d' }}>
          Status: <strong>{getStatusLabel(ticket.status)}</strong> | Prioridade: <strong>{ticket.priority}</strong>
        </div>
      </header>

      <section style={{ flex: 1, overflowY: 'auto', padding: 16, backgroundColor: '#fff' }}>
        {messages.map(m => (
          <div key={m.id} style={{
            display: 'flex',
            justifyContent: m.senderType === 'user' ? 'flex-end' : 'flex-start',
            marginBottom: 16
          }}>
            <div style={{
              maxWidth: '70%',
              padding: 12,
              borderRadius: 12,
              backgroundColor: m.senderType === 'user' ? '#007bff' : '#e9ecef',
              color: m.senderType === 'user' ? 'white' : 'inherit'
            }}>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.body}</p>
              {m.attachments?.map(a => (
                <img key={a.id} src={a.publicUrl} alt={a.originalName} style={{
                  maxWidth: 200,
                  maxHeight: 150,
                  marginTop: 8,
                  borderRadius: 4,
                  cursor: 'pointer'
                }} onClick={() => window.open(a.publicUrl, '_blank')} />
              ))}
              <div style={{
                fontSize: 11,
                marginTop: 4,
                opacity: 0.7,
                textAlign: 'right'
              }}>
                {new Date(m.createdAt).toLocaleString('pt-BR')}
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </section>

      <footer style={{ padding: 16, borderTop: '1px solid #dee2e6', backgroundColor: '#f8f9fa' }}>
        {files.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            {files.map((f, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={URL.createObjectURL(f)} alt="" style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 4 }} />
                <span onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  background: '#dc3545',
                  color: 'white',
                  borderRadius: '50%',
                  width: 16,
                  height: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  cursor: 'pointer'
                }}>×</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Digite sua mensagem..."
            rows={3}
            style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ccc', resize: 'none' }}
          />
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={e => setFiles(Array.from(e.target.files || []))}
            style={{ display: 'none' }}
            id="file-input"
          />
          <label htmlFor="file-input" style={{
            padding: '8px 12px',
            backgroundColor: '#6c757d',
            color: 'white',
            borderRadius: 4,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center'
          }}>📎</label>
          <button
            onClick={onSend}
            disabled={!canSend || sending}
            style={{
              padding: '8px 20px',
              backgroundColor: !canSend || sending ? '#6c757d' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: !canSend || sending ? 'not-allowed' : 'pointer'
            }}
          >
            {sending ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </footer>
    </div>
  );
};
