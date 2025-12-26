import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LandingStatic from "@/pages/landing-static";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import AdminPanel from "@/pages/admin";
import AdminLogin from "@/pages/admin-login";
import AgentConfig from "@/pages/agent-config";
import MediaLibrary from "@/pages/media-library";
import TestAgent from "@/pages/test-agent";
import AdminChatSimulator from "@/pages/admin-chat-simulator";
import AdminSimulator from "@/pages/AdminSimulator";
import LoadingScreen from "@/components/LoadingScreen";
// Plans, Subscribe and Settings are rendered inside Dashboard layout
import { useAuth } from "@/hooks/useAuth";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  // Lista de rotas que não precisam esperar o carregamento da autenticação
  const publicRoutes = ["/admin-simulator", "/model-tester", "/test", "/testar"];
  const isPublicRoute = publicRoutes.some(route => location.startsWith(route));

  // Se está carregando e não é rota pública, mostrar loading
  if (isLoading && !isPublicRoute) {
    return <LoadingScreen />;
  }

  return (
    <Switch>
      {/* Rota de teste do agente - pública */}
      <Route path="/test/:token?" component={TestAgent} />
      <Route path="/testar" component={TestAgent} />
      <Route path="/admin-simulator" component={AdminChatSimulator} />
      <Route path="/model-tester" component={AdminSimulator} />
      
      <Route path="/admin-login" component={AdminLogin} />
      <Route path="/admin" component={AdminPanel} />
      <Route path="/login" component={Login} />
      <Route path="/cadastro" component={Register} />
      {!isAuthenticated ? (
        <Route path="/" component={LandingStatic} />
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/conversas" component={Dashboard} />
          <Route path="/conexao" component={Dashboard} />
          <Route path="/meu-agente-ia" component={Dashboard} />
          <Route path="/plans" component={Dashboard} />
          <Route path="/envio-em-massa" component={Dashboard} />
          <Route path="/campanhas" component={Dashboard} />
          <Route path="/kanban" component={Dashboard} />
          <Route path="/contatos" component={Dashboard} />
          <Route path="/contatos-sincronizados" component={Dashboard} />
          <Route path="/etiquetas" component={Dashboard} />
          <Route path="/funil" component={Dashboard} />
          <Route path="/integracoes" component={Dashboard} />
          <Route path="/agendamentos" component={Dashboard} />
          <Route path="/reservas" component={Dashboard} />
          <Route path="/qualificacao" component={Dashboard} />
          <Route path="/listas-contatos" component={Dashboard} />
          <Route path="/followup" component={Dashboard} />
          <Route path="/subscribe/:id" component={Dashboard} />
          <Route path="/settings" component={Dashboard} />
          <Route path="/agent-config" component={AgentConfig} />
          <Route path="/notificador" component={Dashboard} />
          <Route path="/biblioteca-midias" component={Dashboard} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
