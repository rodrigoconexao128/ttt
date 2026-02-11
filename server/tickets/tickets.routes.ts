import { Router } from 'express';
import multer from 'multer';
import * as controller from './tickets.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Formato inválido. Apenas PNG/JPEG/WEBP.'), ok);
  }
});

export const ticketsRouter = Router();

// User routes
ticketsRouter.post('/tickets', controller.createTicket);
ticketsRouter.get('/tickets', controller.listUserTickets);
ticketsRouter.get('/tickets/:id', controller.getUserTicketById);
ticketsRouter.patch('/tickets/:id', controller.updateUserTicket);
ticketsRouter.delete('/tickets/:id', controller.deleteUserTicket);
ticketsRouter.get('/tickets/:id/messages', controller.listUserTicketMessages);
ticketsRouter.post('/tickets/:id/messages', upload.array('attachments', 4), controller.sendUserMessage);
ticketsRouter.post('/tickets/:id/read', controller.markUserRead);

// Admin routes
ticketsRouter.get('/admin/tickets', controller.listAdminTickets);
ticketsRouter.get('/admin/tickets/:id', controller.getAdminTicketById);
ticketsRouter.patch('/admin/tickets/:id', controller.updateAdminTicket);
ticketsRouter.patch('/admin/tickets/:id/status', controller.updateAdminTicketStatus);
ticketsRouter.get('/admin/tickets/:id/messages', controller.listAdminTicketMessages);
ticketsRouter.post('/admin/tickets/:id/messages', upload.array('attachments', 4), controller.sendAdminMessage);
ticketsRouter.post('/admin/tickets/:id/read', controller.markAdminRead);
