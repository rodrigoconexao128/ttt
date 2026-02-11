import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import type { Ticket } from '../../types/tickets';

export const UserTicketList: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTickets = async () => {
    try {
      const { data } = await axios.get('/api/tickets');
      setTickets(data.items);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Erro ao carregar chamados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      open: 'Aberto',
      in_progress: 'Em andamento',
      resolved: 'Resolvido',
      closed: 'Fechado'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      open: '#28a745',
      in_progress: '#ffc107',
      resolved: '#17a2b8',
      closed: '#6c757d'
    };
    return colors[status] || '#6c757d';
  };

  const getPriorityLabel = (priority: string) => {
    const labels: Record<string, string> = {
      low: 'Baixa',
      medium: 'Média',
      high: 'Alta',
      urgent: 'Urgente'
    };
    return labels[priority] || priority;
  };

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}>Carregando...</div>;
  if (error) return <div style={{ padding: 20, color: '#dc3545' }}>{error}</div>;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>Meus Chamados</h2>
        <Link
          to="/tickets/new"
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            textDecoration: 'none',
            borderRadius: 4
          }}
        >
          + Novo Chamado
        </Link>
      </div>

      {tickets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6c757d' }}>
          <p>Você não tem chamados ainda.</p>
          <Link to="/tickets/new" style={{ color: '#007bff' }}>
            Abrir primeiro chamado
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tickets.map((ticket) => (
            <Link
              key={ticket.id}
              to={`/tickets/${ticket.id}`}
              style={{
                display: 'block',
                padding: 16,
                border: '1px solid #dee2e6',
                borderRadius: 8,
                textDecoration: 'none',
                color: 'inherit',
                backgroundColor: ticket.unreadCountUser > 0 ? '#e3f2fd' : 'white'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16, color: '#212529' }}>
                  #{ticket.id} - {ticket.subject}
                </h3>
                <span
                  style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 500,
                    backgroundColor: getStatusColor(ticket.status),
                    color: ticket.status === 'in_progress' ? '#212529' : 'white'
                  }}
                >
                  {getStatusLabel(ticket.status)}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 16, fontSize: 14, color: '#6c757d', marginBottom: 8 }}>
                <span>Prioridade: {getPriorityLabel(ticket.priority)}</span>
                <span>
                  Última atualização: {ticket.lastMessageAt
                    ? new Date(ticket.lastMessageAt).toLocaleString('pt-BR')
                    : new Date(ticket.createdAt).toLocaleString('pt-BR')
                  }
                </span>
              </div>

              {ticket.lastMessagePreview && (
                <p style={{ margin: 0, fontSize: 14, color: '#6c757d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ticket.lastMessagePreview}
                </p>
              )}

              {ticket.unreadCountUser > 0 && (
                <span
                  style={{
                    display: 'inline-block',
                    marginTop: 8,
                    padding: '2px 8px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    borderRadius: 10,
                    fontSize: 12
                  }}
                >
                  {ticket.unreadCountUser} {ticket.unreadCountUser === 1 ? 'mensagem nova' : 'mensagens novas'}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
