# Contexto para Codex: Tickets Chat Redesign

## Tarefa
Redesign /tickets como chat full-screen GPT-like (tela inteira, não comprimido). Fix envio de imagens. Garantir realtime bi-direcional.

## Login Testes
- Client: rodrigo4@gmail.com (senha padrão) -> /dashboard -> /tickets
- Admin: rodrigoconexao128@gmail.com (senha padrão) -> /admin

## Problemas Identificados
1. Layout atual comprimido (não full-screen)
2. Envio de imagens não funciona (arquivo truncado com encoding issues)
3. Polling a cada 6s - NÃO é realtime verdadeiro
4. Sem websocket/SSE para updates bi-direcionais

## Arquivos Principais
- client/src/components/tickets/UserTicketChat.tsx (CLIENTE - precisa refatorar)
- client/src/components/tickets/AdminTicketChat.tsx (ADMIN - precisa refatorar)
- client/src/pages/TicketDetailPage.tsx
- client/src/pages/admin/AdminTicketDetailPage.tsx
- server/tickets/tickets.service.ts

## API Endpoints Existentes
GET /tickets/:id
GET /tickets/:id/messages
POST /tickets/:id/messages (multipart/form-data com attachments)
POST /tickets/:id/read

GET /admin/tickets/:id
GET /admin/tickets/:id/messages
POST /admin/tickets/:id/messages (multipart/form-data com attachments)
PATCH /admin/tickets/:id

## Design GPT-like Chat alvo
- Full-screen (100vh - header do app)
- Layout tipo ChatGPT: sidebar opcional, chat central
- Mensagens em bubbles com avatares
- Input no rodapé fixo
- Background escuro/claro clean (#f7f7f7 para claro)
- Typography: sistema ou fonte moderna
- Animacoes suaves para novas mensagens
- Exibir imagens em grid com lightbox

## Realtime Implementation
- Subscricao Supabase Realtime na tabela ticket_messages
- Canal: 'ticket_messages:ticketId=XXX'
- Atualizar lista quando receber novo INSERT
- Isso evita polling e garante bi-direcional instantâneo

## Fix Imagem
- Verificar file upload no formData (limpo 'attachments')
- Verificar MIME type validation
- Verificar storage/salvar em ticket_attachments
- Verificar retornar publicUrl correto

## Stack
- React + TypeScript
- apiClient (axios) existente
- Supabase realtime
- Inline styles (atual) ou Tailwind (preferido se disponível)

## Teste
- Após codificar, deve funcionar:
  1. Cliente abre ticket e envia mensagem+imagem
  2. Admin vê imediatamente (sem refresh)
  3. Admin responde com texto+imagem
  4. Cliente vê imediatamente (sem refresh)
