import { useEffect } from 'react';
import { useLocation } from 'wouter';

// Campanhas redireciona para Envio em Massa pois possuem as mesmas funcionalidades
export default function Campaigns() {
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    // Redirecionar para envio em massa
    setLocation('/envio-em-massa');
  }, [setLocation]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Redirecionando para Envio em Massa...</p>
      </div>
    </div>
  );
}
