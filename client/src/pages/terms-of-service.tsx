import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Scale, Shield, AlertTriangle, CreditCard, XCircle, Users, Gavel } from "lucide-react";
import { Link } from "wouter";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header minimalista */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="container max-w-4xl mx-auto py-4 px-4 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2 text-slate-600 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
          <span className="text-xs text-slate-400 font-medium">
            Atualizado em 10 de Janeiro de 2026
          </span>
        </div>
      </header>

      <main className="container max-w-4xl mx-auto py-12 px-4">
        {/* Título do documento */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-900 text-white mb-6">
            <FileText className="h-8 w-8" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
            Termos de Uso
          </h1>
          <p className="text-slate-500 mt-3 text-lg">
            Contrato de Prestação de Serviços — AgenteZap
          </p>
        </div>

        {/* Índice navegável */}
        <nav className="mb-12 p-6 bg-slate-50 rounded-2xl border border-slate-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
            Índice
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              { id: "1", icon: Scale, label: "Objeto do Contrato" },
              { id: "2", icon: FileText, label: "Funcionalidades" },
              { id: "3", icon: Shield, label: "Diretrizes de Uso" },
              { id: "4", icon: AlertTriangle, label: "Suspensão e Estorno" },
              { id: "5", icon: Users, label: "Obrigações das Partes" },
              { id: "6", icon: CreditCard, label: "Pagamentos" },
              { id: "7", icon: XCircle, label: "Rescisão" },
              { id: "8", icon: Gavel, label: "Disposições Finais" },
            ].map((item) => (
              <a
                key={item.id}
                href={`#sec-${item.id}`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm transition-all group"
              >
                <item.icon className="h-4 w-4 text-slate-400 group-hover:text-slate-600" />
                <span>{item.id}. {item.label}</span>
              </a>
            ))}
          </div>
        </nav>

        {/* Conteúdo do Contrato */}
        <article className="space-y-10">
          
          {/* Seção 1 */}
          <section id="sec-1" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white text-sm font-bold">
                1
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Objeto do Contrato
              </h2>
            </div>
            <div className="pl-11 space-y-4 text-slate-600 leading-relaxed">
              <p>
                <strong className="text-slate-700">1.1.</strong> O presente instrumento ("Contrato") estabelece 
                as condições gerais para utilização da plataforma AgenteZap ("Plataforma"), 
                ferramenta de automação de atendimento via WhatsApp com inteligência artificial.
              </p>
              <p>
                <strong className="text-slate-700">1.2.</strong> Ao utilizar a Plataforma, o CONTRATANTE declara 
                ter lido, compreendido e aceito integralmente todos os termos deste Contrato.
              </p>
              <p>
                <strong className="text-slate-700">1.3.</strong> A Plataforma destina-se exclusivamente ao uso 
                comercial e profissional, em conformidade com a legislação vigente e as diretrizes 
                estabelecidas pela AgenteZap.
              </p>
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* Seção 2 */}
          <section id="sec-2" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white text-sm font-bold">
                2
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Funcionalidades da Plataforma
              </h2>
            </div>
            <div className="pl-11 space-y-4 text-slate-600 leading-relaxed">
              <p>
                <strong className="text-slate-700">2.1.</strong> A Plataforma disponibiliza as seguintes funcionalidades:
              </p>
              <ul className="space-y-2 text-slate-600 list-disc list-inside ml-4">
                <li>Agente de IA para atendimento automatizado via WhatsApp</li>
                <li>Sistema de Follow-up inteligente para reengajamento de leads</li>
                <li>Gestão de conversas e histórico de mensagens</li>
                <li>Sistema de Kanban para gestão de leads</li>
                <li>Biblioteca de mídias (áudios, imagens, vídeos)</li>
                <li>Envio em massa com controle de limites</li>
                <li>Sistema de agendamentos</li>
                <li>Qualificação automática de leads</li>
                <li>Integrações via webhooks</li>
                <li>Relatórios e estatísticas</li>
              </ul>
              <p>
                <strong className="text-slate-700">2.2.</strong> Todas as funcionalidades são destinadas 
                a auxiliar negócios legítimos em suas operações comerciais.
              </p>
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* Seção 3 - Diretrizes de Uso */}
          <section id="sec-3" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white text-sm font-bold">
                3
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Diretrizes de Uso
              </h2>
            </div>
            <div className="pl-11 space-y-6 text-slate-600 leading-relaxed">
              
              {/* Aviso importante */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-amber-800 text-sm font-medium">
                  ⚠️ O descumprimento das diretrizes abaixo pode resultar em suspensão imediata da conta.
                </p>
              </div>

              <p>
                <strong className="text-slate-700">3.1.</strong> É vedada a utilização da Plataforma para:
              </p>

              {/* Categoria 1 - Serviços não alinhados */}
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="font-semibold text-slate-800 mb-2">
                  3.1.1. Categorias de serviço não contempladas
                </p>
                <p className="text-sm text-slate-500 mb-3">
                  Determinadas categorias de serviços não estão contempladas em nossas diretrizes de uso. 
                  Esta classificação reflete exclusivamente os critérios internos da plataforma e não 
                  representa juízo de valor sobre as atividades em si. Os serviços abaixo não são 
                  suportados pela AgenteZap:
                </p>
                <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside ml-4">
                  <li>Consultas ou atendimentos de natureza espiritual, mística ou esotérica</li>
                  <li>Serviços de cartomancia, tarô, astrologia ou similares</li>
                  <li>Práticas ritualísticas ou cerimoniais de qualquer natureza</li>
                  <li>Serviços que prometam resultados em âmbitos amorosos, financeiros ou de saúde através de meios não convencionais</li>
                </ul>
              </div>

              {/* Categoria 2 - Conteúdo proibido */}
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="font-semibold text-slate-800 mb-2">
                  3.1.2. Conteúdo adulto e atividades ilegais
                </p>
                <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside ml-4">
                  <li>Pornografia ou conteúdo sexualmente explícito</li>
                  <li>Prostituição ou serviços de acompanhantes</li>
                  <li>Venda ou promoção de substâncias ilícitas</li>
                  <li>Jogos de azar não regulamentados</li>
                  <li>Comercialização de produtos contrabandeados ou falsificados</li>
                </ul>
              </div>

              {/* Categoria 3 - Práticas abusivas */}
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="font-semibold text-slate-800 mb-2">
                  3.1.3. Práticas abusivas
                </p>
                <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside ml-4">
                  <li>Golpes, fraudes ou esquemas de pirâmide financeira</li>
                  <li>Spam em massa ou mensagens não solicitadas</li>
                  <li>Phishing ou coleta ilegal de dados pessoais</li>
                  <li>Assédio, bullying ou intimidação</li>
                  <li>Discurso de ódio ou discriminação</li>
                  <li>Disseminação de notícias falsas ou desinformação</li>
                </ul>
              </div>

              <p>
                <strong className="text-slate-700">3.2.</strong> A Plataforma monitora ativamente 
                padrões de uso. Contas que violarem estas diretrizes serão suspensas automaticamente 
                e terão o WhatsApp desconectado imediatamente.
              </p>
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* Seção 4 - Suspensão e Estorno */}
          <section id="sec-4" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white text-sm font-bold">
                4
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Suspensão de Conta e Política de Estorno
              </h2>
            </div>
            <div className="pl-11 space-y-4 text-slate-600 leading-relaxed">
              <p>
                <strong className="text-slate-700">4.1.</strong> A CONTRATADA reserva-se o direito de 
                suspender imediatamente qualquer conta que viole os termos deste Contrato, sem 
                necessidade de aviso prévio.
              </p>
              <p>
                <strong className="text-slate-700">4.2.</strong> Em casos de suspensão por violação de políticas:
              </p>
              <ul className="space-y-1 text-slate-600 list-disc list-inside ml-4">
                <li>Todas as funcionalidades da conta serão desativadas</li>
                <li>O WhatsApp será desconectado automaticamente</li>
                <li>O Agente de IA deixará de responder</li>
                <li>O sistema de Follow-up será interrompido</li>
                <li>O acesso ao painel administrativo será bloqueado</li>
                <li>Não será possível reconectar o WhatsApp ou enviar mensagens</li>
              </ul>
              <p>
                <strong className="text-slate-700">4.3. Política de estorno:</strong> Em caso de 
                suspensão definitiva por violação de políticas, a CONTRATADA realizará o estorno 
                proporcional do valor pago referente ao período não utilizado, descontando:
              </p>
              <ul className="space-y-1 text-slate-600 list-disc list-inside ml-4">
                <li>Dias já utilizados do plano</li>
<li>Custos de API já consumidos</li>
              </ul>
              <p>
                <strong className="text-slate-700">4.4.</strong> O estorno será processado em até 
                15 (quinze) dias úteis na mesma forma de pagamento utilizada na contratação.
              </p>
              <p>
                <strong className="text-slate-700">4.5.</strong> A suspensão da conta não exime o 
                CONTRATANTE de responsabilidades legais decorrentes do uso indevido da Plataforma.
              </p>
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* Seção 5 - Obrigações */}
          <section id="sec-5" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white text-sm font-bold">
                5
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Obrigações das Partes
              </h2>
            </div>
            <div className="pl-11 space-y-4 text-slate-600 leading-relaxed">
              <p><strong className="text-slate-700">5.1. Obrigações do CONTRATANTE:</strong></p>
              <ul className="space-y-1 text-slate-600 list-disc list-inside ml-4">
                <li>Utilizar a Plataforma conforme as leis aplicáveis e as diretrizes da AgenteZap</li>
                <li>Manter suas credenciais de acesso em sigilo</li>
                <li>Respeitar os limites de uso do plano contratado</li>
                <li>Não compartilhar ou revender acesso à Plataforma</li>
                <li>Manter seus dados cadastrais atualizados</li>
                <li>Respeitar as políticas do WhatsApp</li>
              </ul>
              <p><strong className="text-slate-700">5.2. Obrigações da CONTRATADA:</strong></p>
              <ul className="space-y-1 text-slate-600 list-disc list-inside ml-4">
                <li>Garantir disponibilidade mínima de 99% da Plataforma</li>
                <li>Fornecer suporte técnico em horário comercial</li>
                <li>Manter a confidencialidade dos dados do CONTRATANTE</li>
                <li>Comunicar manutenções programadas com antecedência</li>
                <li>Processar estornos conforme política estabelecida</li>
              </ul>
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* Seção 6 - Pagamentos */}
          <section id="sec-6" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white text-sm font-bold">
                6
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Pagamentos e Renovação
              </h2>
            </div>
            <div className="pl-11 space-y-4 text-slate-600 leading-relaxed">
              <p>
                <strong className="text-slate-700">6.1.</strong> Os planos são cobrados de forma 
                recorrente (mensal ou anual), conforme opção escolhida pelo CONTRATANTE.
              </p>
              <p>
                <strong className="text-slate-700">6.2.</strong> O pagamento deve ser realizado até 
                a data de vencimento. Atrasos superiores a 5 (cinco) dias podem resultar em 
                suspensão temporária do serviço.
              </p>
              <p>
                <strong className="text-slate-700">6.3.</strong> A renovação é automática, podendo 
                o CONTRATANTE cancelar a qualquer momento através do painel administrativo.
              </p>
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* Seção 7 - Rescisão */}
          <section id="sec-7" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white text-sm font-bold">
                7
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Rescisão e Cancelamento
              </h2>
            </div>
            <div className="pl-11 space-y-4 text-slate-600 leading-relaxed">
              <p>
                <strong className="text-slate-700">7.1.</strong> O CONTRATANTE pode cancelar sua 
                assinatura a qualquer momento, sem multa, continuando a ter acesso ao serviço 
                até o final do período pago.
              </p>
              <p>
                <strong className="text-slate-700">7.2.</strong> A CONTRATADA pode rescindir o 
                contrato imediatamente em caso de violação dos termos de uso, sem direito a 
                restituição integral.
              </p>
              <p>
                <strong className="text-slate-700">7.3.</strong> Em caso de rescisão por violação 
                de políticas, aplica-se a política de estorno descrita na Seção 4.3.
              </p>
            </div>
          </section>

          <hr className="border-slate-200" />

          {/* Seção 8 - Disposições Finais */}
          <section id="sec-8" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-white text-sm font-bold">
                8
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Disposições Finais
              </h2>
            </div>
            <div className="pl-11 space-y-4 text-slate-600 leading-relaxed">
              <p>
                <strong className="text-slate-700">8.1.</strong> Este Contrato será regido pelas 
                leis da República Federativa do Brasil.
              </p>
              <p>
                <strong className="text-slate-700">8.2.</strong> Fica eleito o foro da comarca de 
                São Paulo/SP para dirimir quaisquer dúvidas ou controvérsias oriundas deste Contrato.
              </p>
              <p>
                <strong className="text-slate-700">8.3.</strong> A tolerância de uma parte quanto 
                a qualquer violação deste Contrato não constituirá renúncia ao direito de exigir 
                seu cumprimento.
              </p>
              <p>
                <strong className="text-slate-700">8.4.</strong> Em caso de dúvidas, o CONTRATANTE 
                pode entrar em contato através do suporte da Plataforma.
              </p>
            </div>
          </section>

          {/* Declaração de aceite */}
          <div className="mt-12 p-6 bg-slate-900 text-white rounded-2xl text-center">
            <p className="text-slate-300 text-sm leading-relaxed">
              Ao utilizar a Plataforma AgenteZap, você declara estar ciente e de acordo 
              com todos os termos e condições aqui estabelecidos.
            </p>
          </div>
        </article>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-slate-200 text-center">
          <p className="text-sm text-slate-400">
            © 2026 AgenteZap — Todos os direitos reservados
          </p>
          <p className="text-xs text-slate-300 mt-2">
            Dúvidas? Entre em contato com nosso suporte.
          </p>
        </footer>
      </main>
    </div>
  );
}
