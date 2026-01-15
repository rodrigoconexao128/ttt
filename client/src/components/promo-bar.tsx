import { useState, useEffect } from "react";
import { X, Clock, Zap } from "lucide-react";
import { useLocation } from "wouter";

export function PromoBar() {
  const [, setLocation] = useLocation();
  const [isVisible, setIsVisible] = useState(true);
  const [timeLeft, setTimeLeft] = useState(() => {
    // Recuperar tempo restante do localStorage ou iniciar com 10 minutos
    const saved = localStorage.getItem("promo_bar_timer_end");
    if (saved) {
      const remaining = Math.max(0, parseInt(saved) - Date.now());
      return Math.floor(remaining / 1000);
    }
    // Novo timer de 10 minutos
    const endTime = Date.now() + 10 * 60 * 1000;
    localStorage.setItem("promo_bar_timer_end", endTime.toString());
    return 10 * 60;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Reiniciar timer
          const endTime = Date.now() + 10 * 60 * 1000;
          localStorage.setItem("promo_bar_timer_end", endTime.toString());
          return 10 * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Verificar se foi fechada recentemente (5 minutos)
  useEffect(() => {
    const closedAt = localStorage.getItem("promo_bar_closed_at");
    if (closedAt) {
      const elapsed = Date.now() - parseInt(closedAt);
      if (elapsed < 5 * 60 * 1000) { // 5 minutos
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

  if (!isVisible) return null;

  return (
    <div className="bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white py-2 px-4 relative overflow-hidden">
      {/* Efeito de brilho animado */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
      
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-3 text-sm relative z-10">
        <Zap className="h-4 w-4 animate-pulse text-yellow-300" />
        
        <span className="font-medium hidden sm:inline">
          🔥 PROMOÇÃO RELÂMPAGO:
        </span>
        
        <span className="font-bold">
          50% OFF por tempo limitado!
        </span>
        
        <div className="flex items-center gap-1 bg-black/20 rounded-full px-3 py-1">
          <Clock className="h-3 w-3" />
          <span className="font-mono font-bold text-yellow-300">
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </span>
        </div>
        
        <button
          onClick={() => setLocation("/plans")}
          className="bg-white text-red-600 px-4 py-1 rounded-full font-bold text-xs hover:bg-yellow-300 hover:text-red-700 transition-all shadow-lg"
        >
          APROVEITAR →
        </button>
        
        <button 
          onClick={handleClose}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/20 rounded-full transition-colors"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 3s infinite;
        }
      `}</style>
    </div>
  );
}
