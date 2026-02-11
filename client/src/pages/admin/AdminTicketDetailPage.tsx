import React from "react";
import AdminTicketChat from "@/components/tickets/AdminTicketChat";
import { useRoute, Link } from "wouter";

export default function AdminTicketDetailPage() {
  const [match, params] = useRoute("/admin/tickets/:id");
  const ticketId = params?.id ? parseInt(params.id) : 0;

  if (!match || !ticketId) {
    return <div className="p-4 text-center">Ticket não encontrado</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col h-screen">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link href="/admin/tickets" className="text-slate-500 hover:text-slate-800">
            ← Voltar para Lista
          </Link>
          <h1 className="text-xl font-bold">Ticket #{ticketId}</h1>
        </div>
      </header>
      <main className="flex-1 p-6 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto border rounded-lg bg-white shadow-sm">
          <AdminTicketChat ticketId={ticketId} />
        </div>
      </main>
    </div>
  );
}
