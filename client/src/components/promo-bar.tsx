import { useState, useEffect } from "react";
import { X, Clock, Tag } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Plan } from "@shared/schema";

interface AssignedPlanResponse {
  hasAssignedPlan: boolean;
  plan?: Plan & { valor?: number; valorOriginal?: number };
}

interface PromoBarProps {
  isAuthenticated: boolean;
}

export function PromoBar({ isAuthenticated }: PromoBarProps) {
  const [, setLocation] = useLocation();
  const [isVisible, setIsVisible] = useState(true);
  const { data: assignedPlanData } = useQuery<AssignedPlanResponse>({
    queryKey: ["/api/user/assigned-plan"],
    enabled: isAuthenticated,
  });
  
  // Debug: Log do plano atribuído (REMOVED - causing performance issues)
  
  const assignedPlan = assignedPlanData?.plan;
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

  // Usar 'valor' do plano (campo correto da API)
  const planName = assignedPlan?.nome || "Plano Ilimitado";
  const rawValue = (assignedPlan as any)?.valor ?? (assignedPlan as any)?.preco;
  const planValue = rawValue != null
    ? `R$ ${Number(rawValue).toFixed(2).replace(".", ",")}`
    : "R$ 99,99";

  // Mostrar APENAS para usuários autenticados que vieram por link de plano
  if (!isAuthenticated) return null;
  
  // Não mostrar se não tem plano atribuído (não veio por link)
  if (!assignedPlanData?.hasAssignedPlan || !assignedPlan) return null;
  
  // Não mostrar se fechada
  if (!isVisible) return null;

  return (
    <div className="bg-gray-900 text-white py-2 px-4 relative">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-3 text-sm">
        <Tag className="h-4 w-4 text-green-400" />
        
        <span className="text-gray-300 hidden sm:inline">
          Oferta especial:
        </span>
        
        <span className="font-medium">
          {planName} por <span className="text-green-400 font-bold">{planValue}</span>/mês
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
