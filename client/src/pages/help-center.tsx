/**
 * Central de Ajuda — AgenteZap
 * Help Center completo com busca, categorias e artigos didáticos
 * Cobre toda a área do cliente (onboarding → avançado)
 */
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Search,
  ChevronRight,
  ChevronLeft,
  Bot,
  Smartphone,
  MessageCircle,
  Wrench,
  Send,
  Megaphone,
  Kanban,
  Users,
  Tags,
  Filter,
  Plug,
  CalendarClock,
  BedDouble,
  Bell,
  Upload,
  BookUser,
  Sparkles,
  Ban,
  FormInput,
  Package,
  UtensilsCrossed,
  ClipboardList,
  Mic,
  Workflow,
  Ticket,
  Settings,
  Receipt,
  CreditCard,
  LayoutDashboard,
  Rocket,
  Brain,
  Building2,
  HelpCircle,
  Home,
  X,
  CheckCircle2,
  Info,
  AlertCircle,
  Lightbulb,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface Article {
  id: string;
  title: string;
  description: string;
  content: ArticleSection[];
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
}

interface ArticleSection {
  type: "text" | "steps" | "tip" | "warning" | "code" | "list";
  heading?: string;
  content: string | string[];
}

interface Category {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  articles: Article[];
}

// ─── Conteúdo dos Artigos ────────────────────────────────────────────────────

const HELP_CATEGORIES: Category[] = [
  // ══════════════════════════════════════════════════════════════════
  // 1. INÍCIO RÁPIDO (onboarding)
  // ══════════════════════════════════════════════════════════════════
  {
    id: "onboarding",
    title: "Início Rápido",
    description: "Do cadastro ao primeiro atendimento em minutos",
    icon: Rocket,
    color: "text-blue-600",
    articles: [
      {
        id: "onboarding-overview",
        title: "Bem-vindo ao AgenteZap — O que você pode fazer",
        description: "Visão geral do sistema e principais funcionalidades",
        tags: ["começar", "visão geral", "introdução", "o que é"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "O AgenteZap é uma plataforma de automação de atendimento para WhatsApp com Inteligência Artificial. Com ele você conecta seu número do WhatsApp e configura um agente de IA que responde automaticamente aos seus clientes, 24 horas por dia.",
          },
          {
            type: "list",
            heading: "O que você pode fazer:",
            content: [
              "💬 Atender clientes via WhatsApp com IA",
              "🤖 Configurar um agente com personalidade e conhecimento do seu negócio",
              "📦 Criar cardápios de delivery e receber pedidos automaticamente",
              "💇 Gerenciar agendamentos de salão de beleza",
              "📅 Organizar agendamentos gerais",
              "📢 Enviar mensagens em massa e campanhas",
              "📊 Visualizar relatórios e funil de vendas",
              "🔔 Configurar follow-up automático para recuperar conversas",
              "🏪 Vender para revenda (plano revendedor)",
            ],
          },
          {
            type: "tip",
            content:
              "Siga o guia de início rápido na tela de Dashboard (3 passos: Conectar WhatsApp → Configurar Agente → Ativar) para entrar em operação em menos de 10 minutos.",
          },
        ],
      },
      {
        id: "onboarding-connect",
        title: "Passo 1 — Como conectar seu WhatsApp",
        description: "Conecte seu número via QR Code em menos de 2 minutos",
        tags: ["qrcode", "whatsapp", "conectar", "conexão", "celular"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "A conexão é feita pelo protocolo Baileys (semelhante ao WhatsApp Web). Você precisa do celular com WhatsApp ativo para escanear o QR Code.",
          },
          {
            type: "steps",
            heading: "Como conectar:",
            content: [
              'No menu lateral, clique em "Conexão".',
              'Clique no botão "Conectar WhatsApp".',
              "Um QR Code será exibido na tela.",
              "No seu celular, abra o WhatsApp → Menu (3 pontos) → Aparelhos conectados → Conectar aparelho.",
              "Aponte a câmera para o QR Code na tela.",
              'Aguarde a confirmação. O status mudará para "Conectado" (verde) em alguns segundos.',
            ],
          },
          {
            type: "warning",
            content:
              "O QR Code expira em 60 segundos. Se ele sumir, clique em 'Recarregar QR Code' para gerar um novo. Use um número que não seja usado em outro dispositivo ou WhatsApp Web simultaneamente.",
          },
          {
            type: "tip",
            content:
              "Recomendamos usar um número de chip dedicado (não o número pessoal). Assim o atendimento fica separado e você evita problemas.",
          },
        ],
      },
      {
        id: "onboarding-agent",
        title: "Passo 2 — Configurar seu Agente IA",
        description: "Dê personalidade, nome e conhecimento ao seu agente",
        tags: ["agente", "ia", "configurar", "prompt", "nome", "personalidade"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'Depois de conectar o WhatsApp, vá em "Meu Agente IA" no menu lateral. Aqui você define como o agente vai se comportar.',
          },
          {
            type: "steps",
            heading: "Configuração básica:",
            content: [
              "Clique em \"Meu Agente IA\" no menu.",
              "Na aba \"Configuração\", escreva o prompt do agente (descrição do seu negócio, nome do agente, como deve responder).",
              "Use o botão \"Gerar com IA\" para criar um prompt automaticamente a partir da descrição do seu negócio.",
              "Ative o agente com o toggle \"Agente Ativo\".",
              "Clique em \"Salvar Configurações\".",
            ],
          },
          {
            type: "tip",
            content:
              'Exemplo de bom prompt: "Você é a Mari, atendente virtual da Lanchonete do João. Seja simpática, responda em português brasileiro. Sempre pergunte o nome do cliente. Nosso cardápio é: X-burguer R$15, Coca R$6..."',
          },
        ],
      },
      {
        id: "onboarding-activate",
        title: "Passo 3 — Ativar e testar o agente",
        description: "Valide que o agente está respondendo corretamente",
        tags: ["ativar", "testar", "teste", "simulador"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'Com WhatsApp conectado e agente configurado, é hora de testar antes de ativar para o público.',
          },
          {
            type: "steps",
            heading: "Como testar:",
            content: [
              'Vá em "Meu Agente IA" → aba "Testar".',
              "Digite uma mensagem como se fosse um cliente.",
              "Veja a resposta do agente em tempo real.",
              "Se não estiver satisfatório, edite o prompt e salve.",
              "Repita até estar satisfeito.",
              'Por fim, certifique-se que o toggle "Agente Ativo" está ligado.',
            ],
          },
          {
            type: "tip",
            content:
              "Envie uma mensagem de outro celular para o número conectado para testar na prática. A IA responderá automaticamente.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 2. DASHBOARD
  // ══════════════════════════════════════════════════════════════════
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Entenda os números e estatísticas do seu atendimento",
    icon: LayoutDashboard,
    color: "text-slate-600",
    articles: [
      {
        id: "dashboard-overview",
        title: "Como ler o Dashboard",
        description: "Entenda cada indicador da tela inicial",
        tags: ["dashboard", "estatísticas", "métricas", "conversas", "status"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "O Dashboard é a primeira tela que você vê ao entrar. Ele mostra uma visão rápida da saúde do seu atendimento.",
          },
          {
            type: "list",
            heading: "O que cada card significa:",
            content: [
              "**Total de Conversas** — quantos contatos já iniciaram conversa com seu número.",
              "**Não Lidas** — conversas que chegaram mas ainda não foram visualizadas.",
              "**Mensagens Hoje** — total de mensagens (enviadas + recebidas) no dia.",
              "**Status WhatsApp** — se o número está 'Conectado' (verde) ou desconectado.",
              "**Status do Agente IA** — 'Ativo' significa que o robô está respondendo automaticamente.",
              "**Respostas do Agente** — quantas mensagens automáticas o agente enviou no total.",
            ],
          },
          {
            type: "tip",
            content:
              "Se o Status WhatsApp aparecer 'Desconectado', vá em Conexão e reconecte escaneando o QR Code novamente.",
          },
        ],
      },
      {
        id: "dashboard-guide-steps",
        title: "Guia de Início no Dashboard",
        description: "O que significa cada passo do guia de início rápido",
        tags: ["guia", "tarefas", "onboarding", "checklist"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'O card "Prepare-se para vender" no dashboard mostra 3 tarefas. Cada uma leva você para a etapa seguinte da configuração.',
          },
          {
            type: "list",
            heading: "As 3 tarefas:",
            content: [
              "**Conectar WhatsApp** → vai para a tela de Conexão para escanear QR Code.",
              "**Configurar Agente IA** → vai para Meu Agente IA para escrever o prompt.",
              "**Ativar o Agente** → confirma que o agente está ativo e pronto.",
            ],
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 3. CONVERSAS
  // ══════════════════════════════════════════════════════════════════
  {
    id: "conversations",
    title: "Conversas",
    description: "Gerencie todas as conversas do WhatsApp em um só lugar",
    icon: MessageCircle,
    color: "text-green-600",
    articles: [
      {
        id: "conversations-overview",
        title: "Como funciona a lista de conversas",
        description: "Entenda a tela de conversas e como navegar nela",
        tags: ["conversas", "lista", "chat", "mensagens", "whatsapp"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'A tela de "Conversas" mostra todas as conversas do seu WhatsApp, semelhante ao app do WhatsApp, mas com recursos extras de IA e gestão.',
          },
          {
            type: "list",
            heading: "O que você vê na lista:",
            content: [
              "📱 Nome ou número do contato",
              "⏰ Horário da última mensagem",
              "💬 Prévia da última mensagem",
              "🔴 Indicador de não lida (bolinha colorida)",
              "🏷️ Etiquetas atribuídas",
              "🤖 Status da IA (ativa/pausada para aquela conversa)",
            ],
          },
          {
            type: "tip",
            content:
              "Clique em qualquer conversa para abrir o chat. No chat, você pode ver o histórico completo e enviar mensagens manualmente mesmo com a IA ativa.",
          },
        ],
      },
      {
        id: "conversations-ia-pause",
        title: "Como pausar a IA em uma conversa",
        description: "Assuma o atendimento manual quando necessário",
        tags: ["pausar", "ia", "manual", "intervenção", "humano"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "Às vezes você precisa responder manualmente sem que a IA interfira. O sistema permite pausar a IA por conversa.",
          },
          {
            type: "steps",
            heading: "Como pausar a IA:",
            content: [
              "Abra a conversa desejada.",
              "No painel de chat, procure o botão/toggle de IA (ícone de robô).",
              "Desative o toggle para pausar a IA nesta conversa.",
              "Responda manualmente.",
              "Quando quiser que a IA volte, reative o toggle.",
            ],
          },
          {
            type: "tip",
            content:
              "Você também pode configurar o Follow-up para que a IA reative automaticamente após X horas de inatividade.",
          },
        ],
      },
      {
        id: "conversations-labels",
        title: "Usar etiquetas para organizar conversas",
        description: "Classifique e filtre conversas com etiquetas personalizadas",
        tags: ["etiquetas", "tags", "filtro", "organizar", "classificar"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "Etiquetas permitem categorizar conversas (ex: 'Lead Quente', 'Aguardando Pagamento', 'VIP'). A IA também pode atribuir etiquetas automaticamente.",
          },
          {
            type: "steps",
            heading: "Como usar etiquetas:",
            content: [
              'Crie etiquetas em "Ferramentas → Etiquetas".',
              "Abra uma conversa.",
              "Clique no ícone de etiqueta dentro do chat.",
              "Selecione as etiquetas desejadas.",
              "Na lista de conversas, use o filtro para ver só as conversas com determinada etiqueta.",
            ],
          },
        ],
      },
      {
        id: "conversations-quick-replies",
        title: "Respostas rápidas",
        description: "Envie mensagens pré-definidas com agilidade",
        tags: ["respostas rápidas", "atalho", "template", "mensagem padrão"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "Respostas rápidas são mensagens pré-definidas que você envia com poucos cliques, sem precisar digitar tudo do zero.",
          },
          {
            type: "steps",
            heading: "Como usar respostas rápidas:",
            content: [
              "Abra uma conversa.",
              "No campo de texto, clique no ícone de raio (⚡) ou use o atalho '/'.",
              "Selecione a resposta rápida desejada.",
              "A mensagem será inserida no campo. Edite se necessário e envie.",
            ],
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 4. MEU AGENTE IA
  // ══════════════════════════════════════════════════════════════════
  {
    id: "ai-agent",
    title: "Meu Agente IA",
    description: "Configure o comportamento, personalidade e conhecimento do agente",
    icon: Bot,
    color: "text-purple-600",
    articles: [
      {
        id: "ai-agent-overview",
        title: "Visão geral da tela Meu Agente IA",
        description: "Entenda o layout: abas de configuração e simulador ao lado direito",
        tags: ["meu agente", "visão geral", "layout", "abas", "simulador"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'A tela "Meu Agente IA" é o coração do seu negócio. Ela fica dividida em duas partes principais: à esquerda, as abas de configuração (Instruções, Mídias, Config, Testar) — e à direita, quando você está na aba "Testar", o simulador de conversa aparece em tempo real, mostrando exatamente como o agente vai responder no WhatsApp.',
          },
          {
            type: "list",
            heading: "As 4 abas principais:",
            content: [
              "📝 **Instruções (Prompt)** — onde você escreve o comportamento, nome e conhecimento do agente.",
              "🖼️ **Mídias** — onde você sobe imagens, áudios, PDFs que o agente envia automaticamente.",
              "⚙️ **Config** — configurações avançadas: modelo de IA, idioma, modo de resposta, calibração.",
              "🧪 **Testar** — simulador de conversa: você faz o papel do cliente e vê as respostas em tempo real.",
            ],
          },
          {
            type: "tip",
            content:
              "O fluxo recomendado é: escreva as Instruções → configure as Mídias → ajuste as Configs → e valide tudo no Simulador. Só ative para o público depois de aprovado no simulador.",
          },
        ],
      },
      {
        id: "ai-agent-chat",
        title: "Chat do Agente — Como funciona na prática",
        description: "Entenda como o agente responde às mensagens dos seus clientes",
        tags: ["chat", "conversa", "ia", "resposta automática", "atendimento", "whatsapp"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "Quando um cliente manda uma mensagem no seu WhatsApp, o agente recebe essa mensagem e gera uma resposta baseada no que você configurou no prompt (Instruções). O processo acontece em segundos e de forma 100% automática, 24h por dia.",
          },
          {
            type: "list",
            heading: "O que acontece em cada mensagem:",
            content: [
              "1️⃣ Cliente envia mensagem → o sistema recebe via WhatsApp Web (Baileys).",
              "2️⃣ O histórico da conversa é carregado para dar contexto ao agente.",
              "3️⃣ O prompt + histórico + nova mensagem são enviados ao modelo de IA.",
              "4️⃣ A IA gera a resposta e o sistema a envia de volta para o cliente.",
              "5️⃣ A conversa fica salva em 'Conversas' para você acompanhar.",
            ],
          },
          {
            type: "tip",
            content:
              "Você pode assumir o atendimento manual a qualquer momento na tela de Conversas — basta abrir a conversa e digitar. O agente para de responder automaticamente quando detecta intervenção humana.",
          },
          {
            type: "warning",
            content:
              "Se o agente não estiver respondendo, verifique: (1) se o toggle 'Agente Ativo' está ligado, (2) se o WhatsApp está conectado (tela Conexão), e (3) se o número não está na Lista de Exclusão.",
          },
        ],
      },
      {
        id: "ai-agent-prompt",
        title: "Aba Instruções — Escrever e editar o prompt do agente",
        description: "Guia completo para criar instruções eficientes para o agente",
        tags: ["prompt", "instruções", "editar", "configuração", "ia", "agente", "personalidade"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "As Instruções (também chamadas de prompt ou system prompt) são o conjunto de regras e informações que você passa para a IA sobre quem ela é e como deve se comportar. É como um manual de treinamento para o seu atendente virtual. Quanto mais rico e preciso esse manual, mais natural e eficiente será o atendimento.",
          },
          {
            type: "list",
            heading: "O que incluir nas instruções:",
            content: [
              "🏷️ **Identidade** — nome do agente (ex: 'Você se chama Ana') e papel (atendente, vendedor, especialista...)",
              "🏢 **Contexto do negócio** — nome da empresa, o que vende, como funciona, diferenciais.",
              "📋 **Produtos e serviços** — lista completa com nomes, descrições e preços.",
              "⏰ **Horário de funcionamento** — dias e horários disponíveis.",
              "📍 **Localização** — endereço, bairro, cidade, se tem delivery ou atende presencialmente.",
              "💳 **Pagamentos** — formas aceitas: PIX, cartão, dinheiro etc.",
              "🎯 **Tom de voz** — formal, descontraído, jovem, técnico... adapte ao seu público.",
              "❌ **Restrições** — o que o agente NÃO deve falar (ex: 'não prometa prazos que não consigo cumprir').",
            ],
          },
          {
            type: "steps",
            heading: "Como criar ou editar as instruções:",
            content: [
              'Acesse "Meu Agente IA" no menu lateral.',
              'Clique na aba "Instruções".',
              "Se não tem prompt ainda: clique em \"Gerar com IA\" e descreva seu negócio em texto livre. A IA monta o prompt por você.",
              "Se já tem prompt: edite diretamente no campo de texto, ou use \"Melhorar\" para a IA sugerir aprimoramentos.",
              'Para editar em tela cheia (recomendado para prompts longos): clique em "Expandir".',
              "Após editar, clique em \"Salvar Configurações\".",
              "Vá para a aba \"Testar\" e valide se as respostas estão como esperado.",
            ],
          },
          {
            type: "tip",
            content:
              'Exemplo de instrução inicial eficaz: "Você é a Mari, atendente virtual da Padaria do Zé. Seja simpática, use emojis com moderação e responda em português informal. O cardápio hoje é: Pão francês R$0,80 (unidade), Café R$3, Coxinha R$5. Abrimos de segunda a sábado das 6h às 20h. Localização: Rua das Flores, 123, Centro. Pagamos no PIX e dinheiro."',
          },
          {
            type: "warning",
            content:
              "Evite instruções muito curtas (menos de 5 linhas). O agente fica genérico, responde errado, ou inventa informações. Dedique 20 a 30 minutos para escrever um prompt completo — isso vai economizar horas de correção depois.",
          },
        ],
      },
      {
        id: "ai-agent-calibration",
        title: "Aba Config — Calibrar e ajustar o comportamento do agente",
        description: "Configure modelos, temperatura, estilo de resposta e recursos avançados",
        tags: ["calibrar", "calibração", "config", "configuração", "modelo", "temperatura", "ajuste fino"],
        difficulty: "advanced",
        content: [
          {
            type: "text",
            content:
              "A aba Config permite ajustar como o agente pensa e se comporta em detalhes técnicos. Aqui você escolhe o modelo de IA, define o estilo de resposta e habilita recursos como histórico longo, follow-up automático e modo de calibração avançada.",
          },
          {
            type: "list",
            heading: "Principais configurações:",
            content: [
              "🤖 **Modelo de IA** — Auto (recomendado), GPT-4o, Claude, Mistral etc. O Auto escolhe o melhor disponível.",
              "🌡️ **Temperatura** — controla a criatividade das respostas. Baixa (0.1–0.3) = mais consistente e previsível. Alta (0.7–1.0) = mais criativa e variada.",
              "📜 **Histórico de mensagens** — quantas mensagens anteriores o agente considera para gerar a resposta. Mais histórico = mais contexto, mas pode ser mais lento.",
              "⏸️ **Pausar IA ao responder manualmente** — se você responder na tela de Conversas, o agente pausa automaticamente nessa conversa.",
              "🔄 **Reativar IA automaticamente** — após X horas sem resposta do atendente, o agente assume de volta.",
              "🔇 **Modo silencioso** — o agente lê as mensagens mas só responde quando ativado por uma palavra-chave.",
            ],
          },
          {
            type: "steps",
            heading: "Calibração manual do agente:",
            content: [
              'Em "Meu Agente IA" → aba "Config", role até a seção "Calibração".',
              "Clique em \"Iniciar Calibração\" para abrir o modo de ajuste fino.",
              "Envie exemplos de perguntas e corrija as respostas que não estiverem adequadas.",
              "O sistema usa essas correções para ajustar o comportamento do agente.",
              "Repita o processo com 5 a 10 cenários reais do seu negócio.",
              "Salve ao final.",
            ],
          },
          {
            type: "tip",
            content:
              "Use a calibração para cenários específicos do seu negócio: perguntas de preço, situações de reclamação, pedidos complexos. Cada correção que você faz ensina o agente a responder melhor nesses contextos.",
          },
        ],
      },
      {
        id: "ai-agent-simulator",
        title: "Aba Testar — Simulador de conversa (lado direito)",
        description: "Use o simulador para testar o agente antes de ativar para os clientes",
        tags: ["testar", "simulador", "teste", "agente", "validar", "conversa de teste"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'A aba "Testar" abre o simulador de conversa do WhatsApp. Ele fica do lado direito da tela (em desktop) ou em tela cheia (em mobile). O simulador mostra exatamente como o agente vai responder, com a mesma formatação que o cliente veria no WhatsApp — bolhas de mensagem, emojis, negrito etc.',
          },
          {
            type: "steps",
            heading: "Como usar o simulador:",
            content: [
              'Acesse "Meu Agente IA" → aba "Testar".',
              "O simulador aparece à direita (desktop) ou abaixo (mobile).",
              "Digite uma mensagem como se fosse um cliente (ex: 'Oi, qual o preço do corte?').",
              "A IA processa e mostra a resposta em bolhas, como no WhatsApp real.",
              "Se quiser testar outro cenário do zero, clique em \"Limpar conversa\".",
              "Se a resposta não ficou boa: volte para a aba Instruções, melhore o prompt e volte ao simulador.",
            ],
          },
          {
            type: "list",
            heading: "Cenários obrigatórios para testar antes de ativar:",
            content: [
              "✅ Saudação inicial (ex: 'Oi', 'Bom dia')",
              "✅ Pergunta de preço (ex: 'Quanto custa X?')",
              "✅ Pergunta de horário (ex: 'Que horas vocês fecham?')",
              "✅ Situação de reclamação (ex: 'Tive um problema com meu pedido')",
              "✅ Pedido de informações que o agente NÃO deve ter (ex: dados pessoais de outros clientes)",
              "✅ Mensagem fora do escopo do negócio (ex: 'Me conta uma piada')",
            ],
          },
          {
            type: "tip",
            content:
              "Convide um amigo para testar também! Às vezes a gente fica \"cego\" para os problemas do próprio agente. Um olhar de fora identifica respostas estranhas ou incompletas com mais facilidade.",
          },
        ],
      },
      {
        id: "ai-agent-media",
        title: "Aba Mídias — Configure arquivos que o agente envia automaticamente",
        description: "Imagens, áudios, PDFs e vídeos enviados pelo agente na hora certa",
        tags: ["mídia", "imagem", "áudio", "vídeo", "pdf", "envio automático", "biblioteca", "cardápio"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "Na aba Mídias você faz upload de arquivos que o agente pode enviar automaticamente durante a conversa. Isso é muito usado para: enviar o cardápio quando o cliente perguntar, mandar uma foto do produto, enviar tabela de preços em PDF, ou até mandar um áudio de apresentação.",
          },
          {
            type: "steps",
            heading: "Como adicionar uma mídia:",
            content: [
              'Em "Meu Agente IA" → aba "Mídias".',
              'Clique em "Adicionar Mídia".',
              "Selecione o tipo: Imagem, Áudio, Vídeo ou Documento (PDF, Excel etc.).",
              "Faça o upload do arquivo.",
              "Preencha o **nome** (para você identificar) e a **descrição** (o que é esse arquivo).",
              "No campo **Quando usar**: escreva a instrução para a IA (ex: 'Envie quando o cliente pedir o cardápio ou perguntar o que você vende').",
              "Clique em Salvar.",
            ],
          },
          {
            type: "tip",
            content:
              'Seja muito específico no campo "Quando usar". Em vez de "envie quando relevante", escreva "Envie esta imagem quando o cliente perguntar pelo cardápio, pelos preços, ou quiser ver o que você tem". Instruções vagas geram envios errados.',
          },
          {
            type: "list",
            heading: "Tipos de arquivo suportados:",
            content: [
              "🖼️ **Imagem**: JPG, PNG, WebP — até 5MB",
              "🎵 **Áudio**: MP3, OGG, M4A — até 10MB (enviado como mensagem de voz)",
              "🎬 **Vídeo**: MP4 — até 16MB",
              "📄 **Documento**: PDF, XLSX, DOCX — até 10MB",
            ],
          },
        ],
      },
      {
        id: "ai-agent-models",
        title: "Modelos de IA disponíveis",
        description: "Escolha o modelo certo para seu caso de uso",
        tags: ["modelo", "ia", "gpt", "claude", "mistral", "openai"],
        difficulty: "advanced",
        content: [
          {
            type: "text",
            content:
              "O AgenteZap suporta múltiplos modelos de IA. O modelo padrão é configurado pelo administrador do sistema, mas você pode escolher na aba Config do agente. Cada modelo tem características diferentes em termos de velocidade, custo e qualidade de resposta.",
          },
          {
            type: "list",
            heading: "Modelos disponíveis:",
            content: [
              "**Auto (Recomendado)** — seleciona automaticamente o melhor modelo disponível no momento. Ideal para quem não quer se preocupar com isso.",
              "**GPT-4o** — excelente para conversas ricas, raciocínio complexo e respostas longas com contexto grande.",
              "**Claude Haiku** — muito rápido e eficiente para respostas simples e objetivas.",
              "**Mistral** — bom custo-benefício, funciona muito bem para português brasileiro.",
            ],
          },
          {
            type: "tip",
            content:
              "Para a maioria dos negócios (delivery, salão, serviços gerais), o modo Auto já é excelente. Só mude o modelo se você tiver uma necessidade específica identificada — como velocidade máxima (Haiku) ou raciocínio mais profundo (GPT-4o).",
          },
        ],
      },
      {
        id: "ai-agent-flow",
        title: "Construtor de Fluxo (chatbot sem IA)",
        description: "Crie fluxos de conversa automáticos para casos específicos e menus estruturados",
        tags: ["fluxo", "chatbot", "automação", "menu", "bot", "sem ia", "construtor"],
        difficulty: "advanced",
        content: [
          {
            type: "text",
            content:
              "O Construtor de Fluxo permite criar roteiros de conversa fixos — diferente da IA que improvisa, o fluxo segue exatamente o roteiro que você definiu. É ideal para coleta de dados estruturados (nome, CPF, endereço), menus de atendimento com opções numeradas, ou fluxos comerciais previsíveis.",
          },
          {
            type: "steps",
            heading: "Como criar um fluxo:",
            content: [
              'Acesse "Meu Agente IA" → aba "Config" → seção "Fluxo" (ou pelo Construtor de Fluxo no menu Ferramentas).',
              'Clique em "Criar Novo Fluxo".',
              "Defina o **nome** e a **palavra-gatilho** (ex: 'menu', 'oi', 'começar', 'olá').",
              "Adicione nós: Mensagem (envia texto), Pergunta (aguarda resposta), Condição (bifurca o caminho).",
              "Conecte os nós arrastando as setas entre eles.",
              'Ative o fluxo com o toggle "Ativo".',
              "Teste digitando a palavra-gatilho na aba Testar.",
            ],
          },
          {
            type: "warning",
            content:
              "Quando um fluxo está ativo e é acionado, ele tem prioridade sobre a IA — a IA não responde enquanto o cliente estiver dentro do fluxo. Crie sempre um 'nó de saída' ao final para retornar o controle para o agente.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 5. CONEXÃO (WhatsApp)
  // ══════════════════════════════════════════════════════════════════
  {
    id: "connection",
    title: "Conexão WhatsApp",
    description: "Conecte, gerencie e resolva problemas com seu WhatsApp",
    icon: Smartphone,
    color: "text-green-700",
    articles: [
      {
        id: "connection-qrcode",
        title: "Conectar via QR Code — Passo a passo detalhado",
        description: "Instruções completas para conectar o WhatsApp",
        tags: ["qrcode", "conectar", "whatsapp", "celular", "conexão"],
        difficulty: "beginner",
        content: [
          {
            type: "steps",
            heading: "Passo a passo:",
            content: [
              'Acesse "Conexão" no menu lateral.',
              'Clique em "Conectar WhatsApp".',
              "Aguarde o QR Code aparecer na tela.",
              "No celular: WhatsApp → ⋮ (3 pontinhos) → Aparelhos conectados → Conectar um aparelho.",
              "Aponte a câmera do celular para o QR Code na tela.",
              "Aguarde a confirmação (até 30 segundos).",
              'Status muda para "Conectado" em verde.',
            ],
          },
          {
            type: "warning",
            content:
              "Se aparecer 'QR Code expirado', clique em 'Recarregar' para gerar um novo. O código expira em 60 segundos por segurança.",
          },
        ],
      },
      {
        id: "connection-disconnect",
        title: "Desconectar e reconectar WhatsApp",
        description: "Quando e como reiniciar a conexão",
        tags: ["desconectar", "reconectar", "problema", "queda", "offline"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "A conexão pode cair por várias razões: reinício do celular, queda de internet, ou porque o WhatsApp foi aberto em outro dispositivo.",
          },
          {
            type: "steps",
            heading: "Como reconectar:",
            content: [
              "Vá em Conexão.",
              'Se aparecer "Desconectado", clique em "Reconectar".',
              "Escaneie o QR Code novamente.",
            ],
          },
          {
            type: "tip",
            content:
              "Se a conexão cair frequentemente, verifique se o celular não está com bateria acabando, modo de economia de bateria ativo, ou se o WhatsApp não está sendo forçado a fechar pelo sistema.",
          },
        ],
      },
      {
        id: "connection-multiple",
        title: "Gerenciar múltiplas conexões",
        description: "Conecte mais de um número de WhatsApp",
        tags: ["múltiplos números", "mais de um chip", "segunda conexão"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "Dependendo do seu plano, você pode conectar mais de um número de WhatsApp. Isso é útil para separar atendimento por departamento ou produto.",
          },
          {
            type: "steps",
            heading: "Adicionar nova conexão:",
            content: [
              'Em "Conexão", clique em "Adicionar Conexão".',
              "Escanear QR Code do novo número.",
              "Nomeie a conexão (ex: 'Vendas', 'Suporte').",
            ],
          },
          {
            type: "tip",
            content:
              "Cada conexão tem seu próprio agente de IA configurável. Assim você pode ter um agente de vendas e um de suporte com comportamentos diferentes.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 6. FERRAMENTAS — Envio em Massa / Campanhas
  // ══════════════════════════════════════════════════════════════════
  {
    id: "mass-send",
    title: "Envio em Massa & Campanhas",
    description: "Envie mensagens para centenas de contatos de uma vez",
    icon: Send,
    color: "text-blue-500",
    articles: [
      {
        id: "mass-send-overview",
        title: "O que é e quando usar o Envio em Massa",
        description: "Diferença entre Envio em Massa e Campanhas",
        tags: ["envio em massa", "campanhas", "disparo", "mensagem em massa"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "Envio em Massa e Campanhas permitem enviar mensagens para múltiplos contatos. A diferença é:",
          },
          {
            type: "list",
            heading: "Diferenças:",
            content: [
              "**Envio em Massa** — disparo único e imediato para uma lista de números. Ideal para promoções e avisos pontuais.",
              "**Campanhas** — disparos agendados com sequência de mensagens. Ideal para funis de nutrição e follow-up programado.",
            ],
          },
          {
            type: "warning",
            content:
              "Cuidado com disparos muito agressivos. O WhatsApp pode banir números que enviam muitas mensagens não solicitadas. Use com moderação e sempre para pessoas que consentiram.",
          },
        ],
      },
      {
        id: "mass-send-setup",
        title: "Como fazer um Envio em Massa",
        description: "Passo a passo para disparar mensagens para sua lista",
        tags: ["envio em massa", "disparo", "lista", "contatos"],
        difficulty: "intermediate",
        content: [
          {
            type: "steps",
            heading: "Como enviar:",
            content: [
              'Vá em "Ferramentas → Envio em Massa".',
              "Selecione a Lista de Contatos ou importe um CSV.",
              "Escreva a mensagem (suporta variáveis como {{nome}}).",
              "Defina um intervalo entre mensagens (recomendado: 5–30 segundos).",
              'Clique em "Enviar".',
              "Acompanhe o progresso em tempo real.",
            ],
          },
          {
            type: "tip",
            content:
              "Use {{nome}} na mensagem para personalizar com o nome do contato. Ex: 'Olá {{nome}}, temos uma promoção especial para você!'",
          },
        ],
      },
      {
        id: "campaigns-setup",
        title: "Como criar uma Campanha",
        description: "Crie sequências de mensagens agendadas",
        tags: ["campanha", "sequência", "agendamento", "follow-up", "nutrição"],
        difficulty: "intermediate",
        content: [
          {
            type: "steps",
            heading: "Criar campanha:",
            content: [
              'Vá em "Ferramentas → Campanhas".',
              'Clique em "Nova Campanha".',
              "Dê um nome à campanha.",
              "Selecione a lista de destinatários.",
              "Adicione mensagens com intervalos de tempo entre elas.",
              "Defina a data/hora de início.",
              'Ative a campanha.',
            ],
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 7. FERRAMENTAS — Kanban / Funil
  // ══════════════════════════════════════════════════════════════════
  {
    id: "kanban-funnel",
    title: "Kanban & Funil de Vendas",
    description: "Visualize e gerencie a jornada dos seus clientes",
    icon: Kanban,
    color: "text-orange-500",
    articles: [
      {
        id: "kanban-overview",
        title: "Como usar o Kanban",
        description: "Organize conversas por etapa do funil de vendas",
        tags: ["kanban", "funil", "pipeline", "etapa", "lead"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "O Kanban permite visualizar as conversas em colunas representando etapas do seu processo de vendas (ex: Novo Lead → Qualificado → Proposta → Fechado).",
          },
          {
            type: "steps",
            heading: "Como usar:",
            content: [
              'Acesse "Ferramentas → Kanban".',
              "Crie colunas representando cada etapa da sua venda.",
              "Arraste os cards de conversa entre as colunas.",
              "Clique em um card para ver detalhes da conversa.",
            ],
          },
          {
            type: "tip",
            content:
              "A IA pode mover automaticamente os contatos para as colunas certas com base no conteúdo da conversa. Configure isso nas instruções do agente.",
          },
        ],
      },
      {
        id: "funnel-overview",
        title: "Funil de Vendas",
        description: "Visualize o fluxo de leads em forma de funil",
        tags: ["funil", "vendas", "conversão", "métricas"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "O Funil mostra quantos leads estão em cada etapa do processo, ajudando a identificar gargalos e oportunidades de melhoria.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 8. FERRAMENTAS — Contatos / Etiquetas
  // ══════════════════════════════════════════════════════════════════
  {
    id: "contacts",
    title: "Contatos & Etiquetas",
    description: "Gerencie sua base de contatos e organize com etiquetas",
    icon: Users,
    color: "text-teal-600",
    articles: [
      {
        id: "contacts-overview",
        title: "Gerenciamento de Contatos",
        description: "Visualize, edite e organize seus contatos",
        tags: ["contatos", "lista", "telefone", "nome", "importar"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "A área de Contatos reúne todos os números que já conversaram com seu WhatsApp, mais os contatos sincronizados do celular.",
          },
          {
            type: "list",
            heading: "O que você pode fazer:",
            content: [
              "Visualizar todos os contatos com foto, nome e número.",
              "Editar nome e informações de contato.",
              "Adicionar etiquetas para classificação.",
              "Buscar contatos por nome ou número.",
              "Exportar lista de contatos.",
            ],
          },
        ],
      },
      {
        id: "contacts-custom-fields",
        title: "Campos Personalizados de Contato",
        description: "Armazene informações extras sobre seus contatos",
        tags: ["campos personalizados", "dados", "informações", "contato", "custom field"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "Campos personalizados permitem guardar informações adicionais sobre os contatos (CPF, data de nascimento, segmento, etc.).",
          },
          {
            type: "steps",
            heading: "Criar campo personalizado:",
            content: [
              'Vá em "Ferramentas → Campos Personalizados".',
              'Clique em "Novo Campo".',
              "Defina nome, tipo (texto, número, data, sim/não) e se é obrigatório.",
              "Salve.",
              "Agora o campo aparece no painel de detalhes de cada contato.",
            ],
          },
        ],
      },
      {
        id: "tags-overview",
        title: "Como criar e usar Etiquetas",
        description: "Classifique contatos e conversas por categoria",
        tags: ["etiquetas", "tag", "classificar", "filtrar", "cor"],
        difficulty: "beginner",
        content: [
          {
            type: "steps",
            heading: "Criar etiqueta:",
            content: [
              'Vá em "Ferramentas → Etiquetas".',
              'Clique em "Nova Etiqueta".',
              "Defina nome e cor.",
              "Salve.",
              "Agora você pode aplicar esta etiqueta em conversas e contatos.",
            ],
          },
          {
            type: "tip",
            content:
              "Crie etiquetas como: '🔥 Lead Quente', '💰 Cliente VIP', '🚫 Não Perturbar', '⏳ Aguardando Proposta'.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 9. FERRAMENTAS — Agendamentos
  // ══════════════════════════════════════════════════════════════════
  {
    id: "scheduling",
    title: "Agendamentos",
    description: "Gerencie agenda e compromissos via WhatsApp",
    icon: CalendarClock,
    color: "text-indigo-600",
    articles: [
      {
        id: "scheduling-overview",
        title: "Como funciona o módulo de Agendamentos",
        description: "Configure e gerencie agendamentos pelo WhatsApp",
        tags: ["agendamento", "agenda", "horário", "marcar", "compromisso"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "O módulo de Agendamentos permite que a IA marque compromissos com clientes automaticamente, respeitando sua disponibilidade de horários.",
          },
          {
            type: "steps",
            heading: "Configurar agendamentos:",
            content: [
              'Acesse "Ferramentas → Agendamentos".',
              "Configure os serviços disponíveis (nome, duração, preço).",
              "Defina os horários de funcionamento por dia da semana.",
              "Bloqueie datas/horários de folga ou feriados.",
              "Pronto! A IA já pode marcar horários automaticamente.",
            ],
          },
          {
            type: "tip",
            content:
              "Ative a confirmação automática por WhatsApp: o sistema envia uma mensagem confirmando o agendamento assim que for marcado.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 10. DELIVERY
  // ══════════════════════════════════════════════════════════════════
  {
    id: "delivery",
    title: "Delivery",
    description: "Cardápio, pedidos e relatórios para delivery via WhatsApp",
    icon: UtensilsCrossed,
    color: "text-red-500",
    articles: [
      {
        id: "delivery-menu",
        title: "Criar Cardápio de Delivery",
        description: "Configure categorias, produtos e preços",
        tags: ["delivery", "cardápio", "produto", "preço", "categoria", "comida", "pedido"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "O módulo de Delivery permite criar um cardápio completo que a IA usa para receber pedidos pelo WhatsApp.",
          },
          {
            type: "steps",
            heading: "Criar cardápio:",
            content: [
              'Acesse "Ferramentas → 🍕 Delivery → Cardápio".',
              'Clique em "Adicionar Categoria" (ex: Lanches, Bebidas, Sobremesas).',
              'Dentro da categoria, clique em "Adicionar Item".',
              "Preencha: nome, descrição, preço e foto (opcional).",
              "Marque os itens disponíveis ou indisponíveis.",
              "Salve.",
            ],
          },
          {
            type: "tip",
            content:
              "Adicione fotos aos itens para aumentar o apetite dos clientes e reduzir dúvidas sobre o produto.",
          },
        ],
      },
      {
        id: "delivery-orders",
        title: "Gerenciar Pedidos de Delivery",
        description: "Acompanhe e processe pedidos em tempo real",
        tags: ["pedidos", "delivery", "acompanhar", "status", "pedido em andamento"],
        difficulty: "intermediate",
        content: [
          {
            type: "steps",
            heading: "Gerenciar pedidos:",
            content: [
              'Acesse "Ferramentas → 🍕 Delivery → Pedidos".',
              "Veja os pedidos recebidos com status: Novo, Em preparo, Saiu para entrega, Entregue.",
              "Clique no pedido para ver detalhes: itens, endereço, forma de pagamento.",
              "Atualize o status conforme o pedido avança.",
              "O cliente recebe notificação automática a cada mudança de status.",
            ],
          },
        ],
      },
      {
        id: "delivery-reports",
        title: "Relatórios de Delivery",
        description: "Acompanhe faturamento e métricas de vendas",
        tags: ["relatórios", "delivery", "faturamento", "vendas", "métricas"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              'Os relatórios de delivery mostram um resumo de vendas por período, ticket médio, itens mais vendidos e faturamento total. Acesse em "Delivery → Relatórios".',
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 11. SALÃO DE BELEZA
  // ══════════════════════════════════════════════════════════════════
  {
    id: "salon",
    title: "Salão de Beleza",
    description: "Agendamentos automáticos para salões, clínicas e estúdios",
    icon: CalendarClock,
    color: "text-pink-500",
    articles: [
      {
        id: "salon-setup",
        title: "Configurar Salão de Beleza",
        description: "Configure serviços, profissionais e horários",
        tags: ["salão", "beleza", "serviço", "profissional", "horário", "barbearia", "clínica"],
        difficulty: "intermediate",
        content: [
          {
            type: "steps",
            heading: "Configurar salão:",
            content: [
              'Acesse "Ferramentas → 💇 Salão de Beleza → Configuração".',
              "Adicione os profissionais (nome, especialidade, foto).",
              "Adicione os serviços com duração e preço (ex: Corte 30min R$45).",
              "Configure a grade de horários por profissional.",
              "Salve.",
            ],
          },
          {
            type: "tip",
            content:
              "A IA verificará automaticamente a disponibilidade e confirmará o agendamento com o cliente sem precisar da sua intervenção.",
          },
        ],
      },
      {
        id: "salon-appointments",
        title: "Ver Agendamentos do Salão",
        description: "Visualize a agenda do dia, semana e mês",
        tags: ["agendamentos", "salão", "agenda", "calendário"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'A tela de agendamentos do salão mostra toda a agenda em formato de lista ou calendário. Acesse em "Salão de Beleza → Agendamentos".',
          },
          {
            type: "list",
            heading: "Ações disponíveis:",
            content: [
              "Visualizar agendamentos do dia, semana ou mês.",
              "Confirmar ou cancelar agendamentos.",
              "Ver dados do cliente e serviço agendado.",
              "Bloquear horários (férias, folga).",
            ],
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 12. FOLLOW-UP INTELIGENTE
  // ══════════════════════════════════════════════════════════════════
  {
    id: "followup",
    title: "Follow-up Inteligente",
    description: "Recupere conversas e clientes inativos automaticamente",
    icon: Sparkles,
    color: "text-amber-500",
    articles: [
      {
        id: "followup-overview",
        title: "O que é e para que serve o Follow-up",
        description: "Automatize o acompanhamento de clientes que pararam de responder",
        tags: ["follow-up", "recuperar", "inativo", "reengajar", "automático"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "O Follow-up Inteligente envia mensagens automáticas quando um cliente para de responder. Configura-se o tempo de espera e as mensagens a enviar.",
          },
          {
            type: "list",
            heading: "Exemplos de uso:",
            content: [
              "Cliente não respondeu em 2h → enviar 'Ficou com alguma dúvida?'",
              "Abandono no meio do pedido → 'Você esqueceu algo no carrinho?'",
              "Não converteu na primeira conversa → 'Podemos oferecer um desconto especial para você!'",
            ],
          },
        ],
      },
      {
        id: "followup-setup",
        title: "Como configurar Follow-up",
        description: "Passo a passo para ativar o follow-up automático",
        tags: ["follow-up", "configurar", "ativar", "mensagem", "tempo"],
        difficulty: "intermediate",
        content: [
          {
            type: "steps",
            heading: "Configurar follow-up:",
            content: [
              'Acesse "Ferramentas → Follow-up Inteligente".',
              "Ative o toggle de follow-up.",
              "Defina o tempo de espera (ex: 2 horas).",
              "Escreva a mensagem a ser enviada.",
              "Adicione até 3 tentativas com intervalos diferentes.",
              "Salve.",
            ],
          },
          {
            type: "warning",
            content:
              "O follow-up só é enviado se o cliente não respondeu. Se ele responder, o timer é reiniciado.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 13. FALAR POR ÁUDIO (TTS)
  // ══════════════════════════════════════════════════════════════════
  {
    id: "audio",
    title: "Falar por Áudio (TTS)",
    description: "Configure o agente para responder com mensagens de voz",
    icon: Mic,
    color: "text-rose-500",
    articles: [
      {
        id: "audio-overview",
        title: "Respostas em áudio com Text-to-Speech",
        description: "Configure a IA para enviar mensagens de voz",
        tags: ["áudio", "voz", "tts", "text-to-speech", "voz artificial", "resposta em áudio"],
        difficulty: "advanced",
        content: [
          {
            type: "text",
            content:
              "O módulo de TTS (Text-to-Speech) permite que o agente de IA envie respostas em formato de mensagem de voz, além de (ou em vez de) texto.",
          },
          {
            type: "steps",
            heading: "Configurar áudio:",
            content: [
              'Acesse "Ferramentas → Falar por Áudio".',
              "Selecione o provedor de voz (ElevenLabs, OpenAI TTS etc.).",
              "Insira a chave de API do provedor.",
              "Escolha o idioma e a voz.",
              "Defina quando enviar áudio (sempre, só quando solicitado, etc.).",
              "Salve e teste.",
            ],
          },
          {
            type: "tip",
            content:
              "Vozes humanizadas causam mais engajamento. Escolha uma voz próxima ao perfil do seu público-alvo.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 14. NOTIFICADOR INTELIGENTE
  // ══════════════════════════════════════════════════════════════════
  {
    id: "notifier",
    title: "Notificador Inteligente",
    description: "Envie notificações automáticas por eventos ou integração",
    icon: Bell,
    color: "text-yellow-600",
    articles: [
      {
        id: "notifier-overview",
        title: "O que é o Notificador Inteligente",
        description: "Envie mensagens automáticas por gatilhos ou API",
        tags: ["notificador", "notificação", "automação", "gatilho", "api", "evento"],
        difficulty: "advanced",
        content: [
          {
            type: "text",
            content:
              "O Notificador Inteligente envia mensagens proativas para contatos com base em gatilhos: data especial (aniversário), integração via API externa, ou ação no sistema.",
          },
          {
            type: "list",
            heading: "Casos de uso:",
            content: [
              "Lembrete de aniversário do cliente",
              "Notificação de pagamento confirmado",
              "Alerta de pedido pronto",
              "Integração com sistema de ERP ou e-commerce via webhook",
            ],
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 15. BIBLIOTECA DE MÍDIAS
  // ══════════════════════════════════════════════════════════════════
  {
    id: "media",
    title: "Biblioteca de Mídias",
    description: "Gerenciar arquivos do agente: imagens, áudios, vídeos e documentos",
    icon: Upload,
    color: "text-cyan-600",
    articles: [
      {
        id: "media-overview",
        title: "Como usar a Biblioteca de Mídias",
        description: "Upload e gerenciamento de arquivos do agente",
        tags: ["mídias", "arquivo", "upload", "imagem", "vídeo", "áudio", "documento"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "A Biblioteca de Mídias centraliza todos os arquivos que o agente pode enviar: cardápios em PDF, tabelas de preços, fotos de produtos, áudios de apresentação etc.",
          },
          {
            type: "steps",
            heading: "Upload de mídia:",
            content: [
              'Acesse "Ferramentas → Biblioteca de Mídias".',
              'Clique em "Upload".',
              "Selecione o arquivo (suporta: JPG, PNG, PDF, MP3, MP4, etc.).",
              "Preencha o nome e a descrição.",
              "Defina 'Quando usar' (instrução para a IA).",
              "Salve.",
            ],
          },
          {
            type: "tip",
            content:
              "Limite de tamanho por arquivo: imagens até 5MB, vídeos até 16MB, áudios até 10MB, documentos até 10MB.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 16. LISTA DE EXCLUSÃO
  // ══════════════════════════════════════════════════════════════════
  {
    id: "exclusion",
    title: "Lista de Exclusão",
    description: "Números que a IA não deve responder automaticamente",
    icon: Ban,
    color: "text-red-600",
    articles: [
      {
        id: "exclusion-overview",
        title: "O que é a Lista de Exclusão",
        description: "Bloqueie números específicos do atendimento automático",
        tags: ["exclusão", "bloquear", "ia", "não responder", "lista negra"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "A Lista de Exclusão contém números que a IA deve ignorar. Mensagens desses números não recebem resposta automática, mas ainda aparecem em Conversas para atendimento manual.",
          },
          {
            type: "list",
            heading: "Quando usar:",
            content: [
              "Seus próprios números (para não responder a si mesmo)",
              "Fornecedores e parceiros que não devem receber atendimento automático",
              "Números de teste",
              "Pessoas que solicitaram exclusão da automação",
            ],
          },
          {
            type: "steps",
            heading: "Adicionar à lista:",
            content: [
              'Acesse "Ferramentas → Lista de Exclusão".',
              "Digite o número no formato internacional (5511999999999).",
              'Clique em "Adicionar".',
            ],
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 17. LISTAS DE CONTATOS
  // ══════════════════════════════════════════════════════════════════
  {
    id: "contact-lists",
    title: "Listas de Contatos",
    description: "Organize contatos em listas para envios segmentados",
    icon: BookUser,
    color: "text-teal-500",
    articles: [
      {
        id: "contact-lists-overview",
        title: "Como criar e gerenciar Listas de Contatos",
        description: "Agrupe contatos para envios direcionados",
        tags: ["lista de contatos", "segmentação", "grupo", "envio segmentado"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "Listas de Contatos permitem agrupar números para envio em massa ou campanha direcionada. Ex: 'Clientes VIP', 'Leads de Outubro', 'Alunos Turma A'.",
          },
          {
            type: "steps",
            heading: "Criar lista:",
            content: [
              'Vá em "Ferramentas → Listas de Contatos".',
              'Clique em "Nova Lista".',
              "Dê um nome à lista.",
              "Adicione contatos manualmente ou via importação CSV.",
              "Salve.",
            ],
          },
          {
            type: "tip",
            content:
              "Importe um CSV com colunas: nome, numero (com DDI). Ex: 'Maria, 5511999991234'.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 18. CATÁLOGO DE PRODUTOS
  // ══════════════════════════════════════════════════════════════════
  {
    id: "products",
    title: "Catálogo de Produtos",
    description: "Liste produtos e preços que a IA pode consultar e indicar",
    icon: Package,
    color: "text-violet-600",
    articles: [
      {
        id: "products-overview",
        title: "Como criar um Catálogo de Produtos",
        description: "Cadastre produtos para a IA recomendar e tirar dúvidas",
        tags: ["catálogo", "produto", "preço", "estoque", "ia", "lista"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "O Catálogo de Produtos é uma referência para a IA. Quando configurado, o agente pode responder perguntas de preço, disponibilidade e características sem você precisar colocar tudo no prompt.",
          },
          {
            type: "steps",
            heading: "Cadastrar produto:",
            content: [
              'Acesse "Ferramentas → Catálogo de Produtos".',
              'Clique em "Novo Produto".',
              "Preencha: nome, descrição, preço, categoria.",
              "Adicione foto se desejar.",
              "Marque disponível/indisponível.",
              "Salve.",
            ],
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 19. INTEGRAÇÕES
  // ══════════════════════════════════════════════════════════════════
  {
    id: "integrations",
    title: "Integrações",
    description: "Conecte o AgenteZap a outros sistemas e ferramentas",
    icon: Plug,
    color: "text-emerald-600",
    articles: [
      {
        id: "integrations-overview",
        title: "Quais integrações estão disponíveis",
        description: "Conecte com ferramentas como Google Calendar, Webhooks e mais",
        tags: ["integração", "webhook", "api", "google calendar", "externo", "sistema"],
        difficulty: "advanced",
        content: [
          {
            type: "text",
            content:
              "O AgenteZap se integra com outras ferramentas para enriquecer o atendimento automatizado.",
          },
          {
            type: "list",
            heading: "Integrações disponíveis:",
            content: [
              "**Google Calendar** — sincronize agendamentos com sua agenda Google.",
              "**Webhooks** — envie/receba eventos em tempo real para seu sistema.",
              "**API REST** — use a API do AgenteZap para automatizações personalizadas.",
            ],
          },
          {
            type: "tip",
            content:
              "Integrações avançadas geralmente requerem um desenvolvedor. Consulte a documentação da API em nossa central de suporte técnico.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 20. CONFIGURAÇÕES
  // ══════════════════════════════════════════════════════════════════
  {
    id: "settings",
    title: "Configurações",
    description: "Conta, equipe, membros, senha e preferências",
    icon: Settings,
    color: "text-gray-600",
    articles: [
      {
        id: "settings-profile",
        title: "Configurações de Perfil",
        description: "Altere nome, e-mail e senha da conta",
        tags: ["configurações", "perfil", "senha", "nome", "e-mail", "conta"],
        difficulty: "beginner",
        content: [
          {
            type: "steps",
            heading: "Alterar dados de perfil:",
            content: [
              'Acesse "Configurações → Configurações".',
              "Edite nome ou e-mail.",
              'Clique em "Salvar alterações".',
            ],
          },
          {
            type: "steps",
            heading: "Alterar senha:",
            content: [
              'Acesse "Configurações → Configurações".',
              "Role até a seção 'Alterar Senha'.",
              "Preencha senha atual e nova senha.",
              'Clique em "Alterar Senha".',
            ],
          },
        ],
      },
      {
        id: "settings-team",
        title: "Membros da Equipe",
        description: "Adicione colaboradores com acesso limitado",
        tags: ["membros", "equipe", "acesso", "colaborador", "permissão"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "Você pode adicionar membros da equipe que terão acesso às conversas sem acesso às configurações do agente ou informações financeiras.",
          },
          {
            type: "steps",
            heading: "Adicionar membro:",
            content: [
              'Acesse "Configurações → Configurações" → aba "Membros".',
              'Clique em "Convidar Membro".',
              "Insira o e-mail do colaborador.",
              "Defina as permissões (ver conversas, enviar mensagens, etc.).",
              "O colaborador receberá um link de acesso.",
            ],
          },
        ],
      },
      {
        id: "settings-sectors",
        title: "Setores de Atendimento",
        description: "Organize o atendimento por departamento",
        tags: ["setores", "departamento", "organização", "atendimento"],
        difficulty: "intermediate",
        content: [
          {
            type: "text",
            content:
              "Setores permitem organizar as conversas por departamento (Vendas, Suporte, Financeiro) e controlar quais membros atendem quais setores.",
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 21. ASSINATURA / PLANOS
  // ══════════════════════════════════════════════════════════════════
  {
    id: "subscription",
    title: "Assinatura & Planos",
    description: "Planos, pagamentos e histórico de faturamento",
    icon: CreditCard,
    color: "text-blue-700",
    articles: [
      {
        id: "subscription-plans",
        title: "Conhecendo os planos disponíveis",
        description: "Entenda as diferenças entre os planos e o que cada um oferece",
        tags: ["plano", "assinatura", "preço", "mensalidade", "upgrade"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'Acesse "Configurações → Planos" para ver todos os planos disponíveis com preços e funcionalidades incluídas.',
          },
          {
            type: "tip",
            content:
              "Planos anuais têm desconto em relação ao mensal. Se você planeja usar por mais de 6 meses, o anual já vale mais a pena.",
          },
        ],
      },
      {
        id: "subscription-manage",
        title: "Minha Assinatura — Como gerenciar",
        description: "Ver, renovar ou cancelar assinatura",
        tags: ["assinatura", "cancelar", "renovar", "pagamento", "boleto", "pix", "cartão"],
        difficulty: "beginner",
        content: [
          {
            type: "steps",
            heading: "Gerenciar assinatura:",
            content: [
              'Acesse "Configurações → Minha Assinatura".',
              "Veja status, data de vencimento e próxima cobrança.",
              'Para renovar: clique em "Pagar" se estiver vencida.',
              'Para fazer upgrade: clique em "Mudar Plano".',
            ],
          },
          {
            type: "list",
            heading: "Formas de pagamento aceitas:",
            content: [
              "💳 Cartão de crédito (aprovação imediata)",
              "⚡ PIX (aprovação em minutos)",
              "📋 Boleto bancário (processamento em até 1–3 dias úteis)",
            ],
          },
        ],
      },
      {
        id: "subscription-history",
        title: "Histórico de Pagamentos",
        description: "Veja todos os pagamentos realizados",
        tags: ["histórico", "pagamento", "fatura", "recibo", "nota fiscal"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              'O histórico de pagamentos fica em "Configurações → Histórico de Pagamentos". Lá você pode ver todas as transações realizadas e baixar comprovantes.',
          },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // 22. CONTATO & SUPORTE
  // ══════════════════════════════════════════════════════════════════
  {
    id: "support-tickets",
    title: "Contato & Suporte",
    description: "Fale com nosso suporte diretamente pelo WhatsApp",
    icon: Ticket,
    color: "text-orange-600",
    articles: [
      {
        id: "support-whatsapp",
        title: "Como falar com o suporte pelo WhatsApp",
        description: "Entre em contato direto com nossa equipe via WhatsApp",
        tags: ["suporte", "whatsapp", "ajuda", "contato", "atendimento", "problema"],
        difficulty: "beginner",
        content: [
          {
            type: "text",
            content:
              "Nossa equipe de suporte está disponível diretamente pelo WhatsApp. É a forma mais rápida e eficiente de resolver dúvidas, relatar problemas ou solicitar ajuda personalizada.",
          },
          {
            type: "steps",
            heading: "Como entrar em contato:",
            content: [
              "Clique no botão verde 'Falar no WhatsApp' abaixo — ou salve o número +55 17 99164-8288.",
              "Envie uma mensagem descrevendo o problema ou dúvida.",
              "Informe: seu nome, e-mail de cadastro e o que está acontecendo.",
              "Nossa equipe responde em horário comercial (segunda a sexta, 9h–18h).",
            ],
          },
          {
            type: "tip",
            content:
              "Para agilizar o atendimento, envie também um print da tela com o problema. Isso ajuda muito nossa equipe a entender e resolver mais rápido!",
          },
          {
            type: "list",
            heading: "Exemplos de como descrever bem o problema:",
            content: [
              "✅ BOM: 'Meu agente parou de responder desde ontem às 14h. O WhatsApp está conectado mas nenhuma mensagem está sendo respondida. Testei no simulador e deu erro.'",
              "✅ BOM: 'Preciso de ajuda para configurar o cardápio do delivery. Tenho 3 categorias e não sei como organizar.'",
              "❌ RUIM: 'Não funciona' — sem contexto, muito difícil de ajudar.",
              "❌ RUIM: 'Tem um erro' — qual erro? Em qual tela?",
            ],
          },
        ],
      },
      {
        id: "support-self-help",
        title: "Resolução rápida — problemas comuns",
        description: "Soluções para os problemas mais frequentes sem precisar contatar o suporte",
        tags: ["problema", "erro", "não funciona", "solucionar", "whatsapp desconectado", "agente não responde"],
        difficulty: "beginner",
        content: [
          {
            type: "list",
            heading: "Problemas mais comuns e soluções:",
            content: [
              "🔌 **WhatsApp desconectado** → Vá em 'Conexão' e reconecte escaneando o QR Code. Verifique se o celular está com internet.",
              "🤖 **Agente não responde** → Verifique se o toggle 'Agente Ativo' está ligado em 'Meu Agente IA'. Verifique se o número não está na Lista de Exclusão.",
              "📵 **QR Code não aparece** → Atualize a página (F5). Se persistir, limpe o cache do navegador.",
              "📨 **Mensagens em massa não enviam** → Verifique se a lista de contatos está preenchida e se o WhatsApp está conectado.",
              "🔐 **Não consigo fazer login** → Use 'Esqueci minha senha' na tela de login. Verifique o spam do e-mail.",
              "💳 **Problema com pagamento** → Verifique se o cartão não está bloqueado ou com limite insuficiente. Tente PIX como alternativa.",
            ],
          },
          {
            type: "tip",
            content:
              "Mais de 80% dos problemas são resolvidos reconectando o WhatsApp ou verificando se o agente está ativo. Sempre comece por aí antes de contatar o suporte.",
          },
        ],
      },
      {
        id: "support-hours",
        title: "Horários e política de atendimento",
        description: "Saiba quando e como nossa equipe está disponível",
        tags: ["horário", "atendimento", "suporte", "disponibilidade", "prazo", "resposta"],
        difficulty: "beginner",
        content: [
          {
            type: "list",
            heading: "Informações de atendimento:",
            content: [
              "📅 **Dias**: Segunda a Sexta-feira",
              "⏰ **Horário**: 9h às 18h (horário de Brasília)",
              "📱 **Canal**: WhatsApp +55 17 99164-8288",
              "⚡ **Tempo médio de resposta**: até 4 horas úteis",
              "🚨 **Urgências técnicas** (sistema fora do ar): Tratamos com prioridade máxima",
            ],
          },
          {
            type: "tip",
            content:
              "Fora do horário comercial, nossa Central de Ajuda (este guia) tem resposta para os problemas mais comuns. A maioria das dúvidas pode ser resolvida consultando os artigos antes mesmo de precisar do suporte.",
          },
        ],
      },
    ],
  },
];

// ─── Componente: ArticleView ─────────────────────────────────────────────────

function ArticleView({
  article,
  category,
  onBack,
}: {
  article: Article;
  category: Category;
  onBack: () => void;
}) {
  const difficultyMap = {
    beginner: { label: "Iniciante", color: "bg-green-100 text-green-700" },
    intermediate: { label: "Intermediário", color: "bg-yellow-100 text-yellow-700" },
    advanced: { label: "Avançado", color: "bg-red-100 text-red-700" },
  };
  const diff = difficultyMap[article.difficulty];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Breadcrumb + voltar */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-auto p-1 gap-1">
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </Button>
        <span>/</span>
        <span>{category.title}</span>
        <span>/</span>
        <span className="text-foreground font-medium truncate">{article.title}</span>
      </div>

      {/* Header do artigo */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="secondary" className={diff.color}>
            {diff.label}
          </Badge>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">{article.title}</h1>
        <p className="text-muted-foreground">{article.description}</p>
      </div>

      {/* Conteúdo do artigo */}
      <div className="space-y-6">
        {article.content.map((section, idx) => {
          if (section.type === "text") {
            return (
              <p key={idx} className="text-foreground leading-relaxed">
                {section.content as string}
              </p>
            );
          }

          if (section.type === "steps") {
            return (
              <div key={idx} className="space-y-3">
                {section.heading && (
                  <h3 className="font-semibold text-foreground">{section.heading}</h3>
                )}
                <ol className="space-y-2">
                  {(section.content as string[]).map((step, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span
                        className="text-foreground text-sm leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: step.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"),
                        }}
                      />
                    </li>
                  ))}
                </ol>
              </div>
            );
          }

          if (section.type === "list") {
            return (
              <div key={idx} className="space-y-2">
                {section.heading && (
                  <h3 className="font-semibold text-foreground">{section.heading}</h3>
                )}
                <ul className="space-y-1.5">
                  {(section.content as string[]).map((item, i) => (
                    <li key={i} className="flex gap-2 items-start">
                      <span className="text-muted-foreground mt-1">•</span>
                      <span
                        className="text-foreground text-sm leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: item.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"),
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          }

          if (section.type === "tip") {
            return (
              <div
                key={idx}
                className="flex gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20"
              >
                <Lightbulb className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-sm text-foreground leading-relaxed">
                  <strong>Dica:</strong> {section.content as string}
                </p>
              </div>
            );
          }

          if (section.type === "warning") {
            return (
              <div
                key={idx}
                className="flex gap-3 p-4 rounded-lg bg-orange-50 border border-orange-200 dark:bg-orange-950/20 dark:border-orange-800"
              >
                <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-orange-800 dark:text-orange-200 leading-relaxed">
                  <strong>Atenção:</strong> {section.content as string}
                </p>
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* Tags */}
      <div className="mt-8 pt-6 border-t border-border">
        <p className="text-xs text-muted-foreground mb-2">Tópicos relacionados:</p>
        <div className="flex flex-wrap gap-1.5">
          {article.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* CTA WhatsApp para artigos de suporte */}
      {category.id === "support-tickets" && (
        <div className="mt-6 p-5 rounded-xl bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-800 text-center">
          <p className="text-sm font-semibold text-green-800 dark:text-green-200 mb-3">
            Precisa de ajuda personalizada? Fale com a gente!
          </p>
          <a
            href="https://wa.me/5517991648288?text=Olá!%20Preciso%20de%20ajuda%20com%20o%20AgenteZap."
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-semibold text-sm transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Falar no WhatsApp — +55 17 99164-8288
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Componente: CategoryView ────────────────────────────────────────────────

function CategoryView({
  category,
  onSelectArticle,
  onBack,
}: {
  category: Category;
  onSelectArticle: (article: Article) => void;
  onBack: () => void;
}) {
  const Icon = category.icon;
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-auto p-1 gap-1">
          <ChevronLeft className="w-4 h-4" />
          Central de Ajuda
        </Button>
        <span>/</span>
        <span className="text-foreground font-medium">{category.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className={`p-2 rounded-lg bg-muted`}>
          <Icon className={`w-6 h-6 ${category.color}`} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">{category.title}</h1>
          <p className="text-sm text-muted-foreground">{category.description}</p>
        </div>
      </div>

      {/* Artigos */}
      <div className="space-y-2">
        {category.articles.map((article) => (
          <button
            key={article.id}
            onClick={() => onSelectArticle(article)}
            className="w-full text-left flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent hover:border-accent-foreground/20 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground text-sm group-hover:text-primary transition-colors">
                {article.title}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {article.description}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground ml-3 flex-shrink-0 group-hover:text-primary transition-colors" />
          </button>
        ))}
      </div>

      {/* CTA WhatsApp para categoria de suporte */}
      {category.id === "support-tickets" && (
        <div className="mt-8 p-5 rounded-xl bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-800 text-center">
          <p className="text-base font-semibold text-green-800 dark:text-green-200 mb-1">
            Fale direto com o suporte
          </p>
          <p className="text-sm text-green-700 dark:text-green-300 mb-4">
            Nossa equipe responde em até 4 horas úteis, de segunda a sexta das 9h às 18h.
          </p>
          <a
            href="https://wa.me/5517991648288?text=Olá!%20Preciso%20de%20ajuda%20com%20o%20AgenteZap."
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-semibold text-sm transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Abrir WhatsApp — +55 17 99164-8288
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal: HelpCenter ────────────────────────────────────────

export default function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  // Pesquisa global em todas as categorias/artigos
  const searchResults = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return [];

    const results: Array<{ article: Article; category: Category }> = [];
    HELP_CATEGORIES.forEach((cat) => {
      cat.articles.forEach((art) => {
        const matchTitle = art.title.toLowerCase().includes(query);
        const matchDesc = art.description.toLowerCase().includes(query);
        const matchTags = art.tags.some((t) => t.includes(query));
        const matchContent = art.content.some((s) => {
          const c = Array.isArray(s.content) ? s.content.join(" ") : s.content;
          return c.toLowerCase().includes(query);
        });
        if (matchTitle || matchDesc || matchTags || matchContent) {
          results.push({ article: art, category: cat });
        }
      });
    });
    return results;
  }, [searchQuery]);

  const totalArticles = HELP_CATEGORIES.reduce((s, c) => s + c.articles.length, 0);

  // ── Navegação: artigo aberto
  if (selectedArticle && selectedCategory) {
    return (
      <div className="min-h-full bg-background">
        <ArticleView
          article={selectedArticle}
          category={selectedCategory}
          onBack={() => setSelectedArticle(null)}
        />
      </div>
    );
  }

  // ── Navegação: categoria aberta
  if (selectedCategory) {
    return (
      <div className="min-h-full bg-background">
        <CategoryView
          category={selectedCategory}
          onSelectArticle={(art) => setSelectedArticle(art)}
          onBack={() => setSelectedCategory(null)}
        />
      </div>
    );
  }

  // ── Home da Central de Ajuda
  return (
    <div className="min-h-full bg-background">
      {/* Hero */}
      <div className="bg-gradient-to-b from-primary/5 to-background px-4 py-10 text-center">
        <div className="inline-flex items-center gap-2 text-primary mb-3">
          <HelpCircle className="w-6 h-6" />
          <span className="text-sm font-semibold uppercase tracking-wide">Central de Ajuda</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
          Como podemos te ajudar?
        </h1>
        <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
          {totalArticles} artigos cobrindo todas as funcionalidades do AgenteZap
        </p>

        {/* Barra de busca */}
        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar artigos... (ex: 'conectar whatsapp', 'prompt', 'delivery')"
            className="pl-9 pr-9 h-10 bg-background shadow-sm"
            autoFocus={false}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pb-12">
        {/* ── Resultados de busca */}
        {searchQuery && (
          <div className="mt-6">
            <p className="text-sm text-muted-foreground mb-4">
              {searchResults.length > 0
                ? `${searchResults.length} resultado(s) para "${searchQuery}"`
                : `Nenhum resultado para "${searchQuery}"`}
            </p>
            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map(({ article, category }) => {
                  const Icon = category.icon;
                  return (
                    <button
                      key={article.id}
                      onClick={() => {
                        setSelectedCategory(category);
                        setSelectedArticle(article);
                      }}
                      className="w-full text-left flex items-start gap-3 p-4 rounded-lg border border-border hover:bg-accent transition-colors group"
                    >
                      <Icon className={`w-4 h-4 ${category.color} flex-shrink-0 mt-0.5`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                          {article.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{article.description}</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">{category.title}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground ml-2 flex-shrink-0 group-hover:text-primary" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Grid de categorias (só quando não há busca) */}
        {!searchQuery && (
          <>
            {/* Acesso rápido — Início */}
            <div className="mt-8 mb-6">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                Começo rápido
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    title: "Conectar WhatsApp",
                    desc: "Escaneie o QR Code em 2 minutos",
                    icon: Smartphone,
                    articleId: "onboarding-connect",
                    catId: "onboarding",
                  },
                  {
                    title: "Configurar Agente IA",
                    desc: "Escreva o prompt e ative o agente",
                    icon: Bot,
                    articleId: "onboarding-agent",
                    catId: "onboarding",
                  },
                  {
                    title: "Enviar mensagem em massa",
                    desc: "Dispare para centenas de contatos",
                    icon: Send,
                    articleId: "mass-send-setup",
                    catId: "mass-send",
                  },
                ].map(({ title, desc, icon: Icon, articleId, catId }) => {
                  const cat = HELP_CATEGORIES.find((c) => c.id === catId)!;
                  const art = cat.articles.find((a) => a.id === articleId)!;
                  return (
                    <button
                      key={articleId}
                      onClick={() => {
                        setSelectedCategory(cat);
                        setSelectedArticle(art);
                      }}
                      className="text-left flex items-start gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/30 transition-colors group"
                    >
                      <div className="p-1.5 rounded-md bg-primary/10 flex-shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                          {title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Todas as categorias */}
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
              Todas as categorias
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {HELP_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat)}
                    className="text-left flex items-start gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/30 transition-colors group"
                  >
                    <div className="p-1.5 rounded-md bg-muted flex-shrink-0 mt-0.5">
                      <Icon className={`w-4 h-4 ${cat.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                        {cat.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {cat.description}
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-2">
                        {cat.articles.length} artigo{cat.articles.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 group-hover:text-primary transition-colors mt-1" />
                  </button>
                );
              })}
            </div>

            {/* Ainda com dúvidas? */}
            <div className="mt-10 p-6 rounded-xl border border-border bg-card text-center">
              <HelpCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold text-foreground mb-1">Não encontrou o que precisava?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Nossa equipe de suporte está pronta para ajudar você diretamente pelo WhatsApp.
              </p>
              <a
                href="https://wa.me/5517991648288?text=Olá!%20Preciso%20de%20ajuda%20com%20o%20AgenteZap."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-semibold text-sm transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Falar com o Suporte no WhatsApp
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
