import { useState, useEffect } from "react";
import { X, Clock, Tag } from "lucide-react";
import { useLocation } from "wouter";

interface PromoBarProps {
  hasActiveSubscription?: boolean;
  isResellerClient?: boolean;
}

export function PromoBar({ hasActiveSubscription, isResellerClient }: PromoBarProps) {
  const [location, setLocation] = useLocation();
  const [isVisible, setIsVisible] = useState(true);
  const [timeLeft, setTimeLeft] = useState(() => {
    const saved = localStorage.getItem("promo_bar_timer_end");
    if (saved) {
      const remaining = Math.max(0, parseInt(saved) - Date.now());
      return Math.floor(remaining / 1000);
    }
    const endTime = Date.now() + 10 * 60 * 1000;
    localStorage.setItem("promo_bar_timer_end", endTime.toString());
    return 10 * 60;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          const endTime = Date.now() + 10 * 60 * 1000;
          localStorage.setItem("promo_bar_timer_end", endTime.toString());
          return 10 * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const closedAt = localStorage.getItem("promo_bar_closed_at");
    if (closedAt) {
      const elapsed = Date.now() - parseInt(closedAt);
      if (elapsed < 5 * 60 * 1000) {
        setIsVisible(false);
      }
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem("promo_bar_closed_at", Date.now().toString());
    setIsVisible(false);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  // Não mostrar se tem assinatura ativa ou é cliente de revenda
  if (hasActiveSubscription || isResellerClient) return null;
  
  // Não mostrar em páginas específicas ou se fechada
  if (!isVisible || location === "/plans" || location.startsWith("/admin")) return null;

  return (
    <div className="bg-gray-900 text-white py-2 px-4 relative">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-3 text-sm">
        <Tag className="h-4 w-4 text-green-400" />
        
        <span className="text-gray-300 hidden sm:inline">
          Oferta especial:
        </span>
        
        <span className="font-medium">
          Plano Ilimitado por <span className="text-green-400 font-bold">R$ 99,99</span>/mês
        </span>
        
        <div className="flex items-center gap-1 bg-white/10 rounded px-2 py-0.5">
          <Clock className="h-3 w-3 text-green-400" />
          <span className="font-mono text-green-400 text-xs">
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </span>
        </div>
        
        <button
          onClick={() => setLocation("/plans")}
          className="bg-green-500 text-white px-3 py-1 rounded text-xs font-medium hover:bg-green-600 transition-colors"
        >
          Assinar
        </button>
        
        <button 
          onClick={handleClose}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
          aria-label="Fechar"
        >
          <X className="h-4 w-4 text-gray-400" />
        </button>
      </div>
    </div>
  );
}
