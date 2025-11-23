import { Switch, Route } from "wouter";
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
// Plans, Subscribe and Settings are rendered inside Dashboard layout
import { useAuth } from "@/hooks/useAuth";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      <Route path="/admin-login" component={AdminLogin} />
      <Route path="/admin" component={AdminPanel} />
      <Route path="/login" component={Login} />
      <Route path="/cadastro" component={Register} />
      {isLoading || !isAuthenticated ? (
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
          <Route path="/etiquetas" component={Dashboard} />
          <Route path="/funil" component={Dashboard} />
          <Route path="/integracoes" component={Dashboard} />
          <Route path="/agendamentos" component={Dashboard} />
          <Route path="/reservas" component={Dashboard} />
          <Route path="/qualificacao" component={Dashboard} />
          <Route path="/subscribe/:id" component={Dashboard} />
          <Route path="/settings" component={Dashboard} />
          <Route path="/agent-config" component={AgentConfig} />
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
