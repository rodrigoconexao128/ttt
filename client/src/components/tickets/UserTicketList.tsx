import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';
import type { Ticket } from '../../types/tickets';
import { apiClient } from '../../lib/api';

const STATUS_LABELS: Record<string, string> = { open: 'Aberto', in_progress: 'Em andamento', resolved: 'Resolvido', closed: 'Fechado' };
const STATUS_COLORS: Record<string, string> = { open: '#3b82f6', in_progress: '#f59e0b', resolved: '#10b981', closed: '#6b7280' };

export const UserTicketList: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await apiClient.get('/tickets');
        setTickets(data.items);
      } catch (err: any) {
        setError(err?.response?.data?.message ?? 'Erro ao carregar chamados.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = tickets.filter(t =>
    !search || t.subject.toLowerCase().includes(search.toLowerCase()) || `#${t.id}`.includes(search)
  );

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Carregando...</div>;
  if (error) return <div style={{ padding: 40, color: '#ef4444', textAlign: 'center' }}>{error}</div>;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: '#1a1a1a' }}>Meus Chamados</h2>
        <Link to="/tickets/new" style={{ padding: '10px 20px', backgroundColor: '#10b981', color: 'white', textDecoration: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500 }}>
          + Novo Chamado
        </Link>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar chamados..."
          style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          onFocus={e => e.currentTarget.style.borderColor = '#10b981'} onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'} />
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 20px' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <p style={{ fontSize: 16, fontWeight: 500, color: '#374151', margin: '0 0 4px' }}>Nenhum chamado ainda</p>
          <p style={{ fontSize: 14, color: '#9ca3af', margin: '0 0 16px' }}>Crie seu primeiro chamado para receber suporte</p>
          <Link to="/tickets/new" style={{ display: 'inline-block', padding: '10px 24px', backgroundColor: '#10b981', color: '#fff', textDecoration: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500 }}>
            Criar primeiro chamado
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(ticket => (
            <Link key={ticket.id} to={`/tickets/${ticket.id}`}
              style={{ display: 'block', padding: '14px 16px', border: '1px solid #e5e7eb', borderRadius: 10, textDecoration: 'none', color: 'inherit', backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'background-color 0.15s, box-shadow 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)'; }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 12 }}>
                  #{ticket.id} - {ticket.subject}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {ticket.unreadCountUser > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 20, padding: '0 6px', backgroundColor: '#3b82f6', color: '#fff', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                      {ticket.unreadCountUser}
                    </span>
                  )}
                  <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, backgroundColor: (STATUS_COLORS[ticket.status] || '#6b7280') + '18', color: STATUS_COLORS[ticket.status] || '#6b7280', whiteSpace: 'nowrap' }}>
                    {STATUS_LABELS[ticket.status] || ticket.status}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                {ticket.lastMessagePreview ? ticket.lastMessagePreview.slice(0, 80) + (ticket.lastMessagePreview.length > 80 ? '...' : '') : 'Sem mensagens'}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                {ticket.lastMessageAt ? new Date(ticket.lastMessageAt).toLocaleString('pt-BR') : new Date(ticket.createdAt).toLocaleString('pt-BR')}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
