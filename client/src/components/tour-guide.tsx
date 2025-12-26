import { useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

export function TourGuide() {
  useEffect(() => {
    // Check if user has already seen the tour
    const hasSeenTour = localStorage.getItem("hasSeenTour");
    if (hasSeenTour) return;

    // Give the UI a moment to render
    const timer = setTimeout(() => {
      const driverObj = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        doneBtnText: "Concluir",
        nextBtnText: "Próximo",
        prevBtnText: "Anterior",
        steps: [
          { 
            element: '[data-testid="button-nav-stats"]', 
            popover: { 
              title: 'Dashboard', 
              description: 'Aqui você vê a visão geral e estatísticas do seu agente. Acompanhe o desempenho em tempo real.' 
            } 
          },
          { 
            element: '[data-testid="button-nav-conversations"]', 
            popover: { 
              title: 'Conversas', 
              description: 'Gerencie todas as conversas com seus clientes. Você pode intervir manualmente quando necessário.' 
            } 
          },
          { 
            element: '[data-testid="button-nav-connection"]', 
            popover: { 
              title: 'Conexão WhatsApp', 
              description: 'Conecte seu WhatsApp via QR Code aqui para que o agente possa começar a responder.' 
            } 
          },
          { 
            element: '[data-testid="button-nav-ai"]', 
            popover: { 
              title: 'Meu Agente IA', 
              description: 'O cérebro do seu negócio! Configure a personalidade, instruções e conhecimento do seu agente aqui.' 
            } 
          },
          { 
            element: '[data-testid="button-nav-media-library"]', 
            popover: { 
              title: 'Biblioteca de Mídias', 
              description: 'Faça upload de áudios, imagens e vídeos para o agente enviar aos clientes.' 
            } 
          },
          { 
            element: '[data-testid="button-nav-kanban"]', 
            popover: { 
              title: 'CRM Kanban', 
              description: 'Organize seus leads e vendas em colunas. Arraste e solte para mudar o status.' 
            } 
          },
          { 
            element: '[data-testid="button-settings"]', 
            popover: { 
              title: 'Configurações', 
              description: 'Ajuste as configurações da sua conta, notificações e preferências.' 
            } 
          },
        ],
        onDestroyed: () => {
           localStorage.setItem("hasSeenTour", "true");
        }
      });

      driverObj.drive();
    }, 1500); // Wait 1.5s for everything to load

    return () => clearTimeout(timer);
  }, []);

  return null;
}
