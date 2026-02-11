import React from "react";
import { UserTicketChat } from "@/components/tickets/UserTicketChat";
import { useRoute } from "wouter";

export default function TicketDetailPage() {
  const [match, params] = useRoute("/tickets/:id");
  const ticketId = params?.id ? parseInt(params.id) : 0;

  if (!match || !ticketId) {
    return <div className="p-4 text-center">Ticket não encontrado</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <UserTicketChat ticketId={ticketId} />
    </div>
  );
}
