# TASKLIST — Execução por Partes (baseado em todos os áudios)

Projeto: `C:\Users\Windows\Downloads\agentezap correto\vvvv`
Regra fixa de execução (todas as partes):
1. Implementar
2. Testar em localhost com contas reais
3. Se falhar, corrigir e retestar até 100%
4. Commit
5. Deploy Railway
6. Validar pós-deploy

Credenciais obrigatórias de teste:
- Cliente: `rodrigo4@gmail.com` / `Ibira2019!`
- Admin: `rodrigoconexao128@gmail.com` / `Ibira2019!`

---

## PARTE 1 — Pagamentos / Planos / Admin (prioridade alta)

### 1.1 Fluxo “Já paguei” (cliente normal)
- [ ] Reproduzir erro ao enviar comprovante no “Já paguei”
- [ ] Corrigir upload/armazenamento do comprovante
- [ ] Validar no Admin > Pagamentos visualização do comprovante
- [ ] Validar aprovação/reprovação

### 1.2 Aprovação ativa plano automaticamente
- [ ] Ao clicar em confirmar pagamento, ativar imediatamente plano correto escolhido (mensal/anual)
- [ ] Validar data de início/fim em Gerenciar Clientes (30 dias / 1 ano)
- [ ] Tratar duplicidade de comprovantes: aprovou um, limpar/inutilizar pendentes relacionados

### 1.3 Menu/admin completo e consistência
- [ ] Garantir que menu completo apareça em contexto admin (não só quando entra em Conversas)
- [ ] Garantir acesso ao comprovante PIX em área adequada de Pagamentos

### 1.4 Revenda (pagamento do revendedor)
- [ ] Restaurar geração de QR Code PIX para revenda usando mesma integração de Planos
- [ ] Implementar botão “Já paguei” na Revenda com envio de comprovante
- [ ] Exibir comprovante no Admin para aprovação
- [ ] Aprovação libera cliente do revendedor imediatamente

Testes obrigatórios da Parte 1:
- [ ] Cliente normal: gerar pagamento, enviar comprovante, admin aprovar, plano ativado correto
- [ ] Revendedor: gerar QR PIX, enviar comprovante, admin aprovar, cliente liberado
- [ ] Regressão: aprovação duplicada / comprovante duplicado

---

## PARTE 2 — WhatsApp/Admin Operacional

### 2.1 Sessão WhatsApp admin estável
- [ ] Reproduzir desconexão no painel admin WhatsApp
- [ ] Corrigir persistência/reativação da sessão para manter conectada
- [ ] Validar estabilidade após refresh/restart

### 2.2 Follow-up de não pagantes / recuperação
- [ ] Criar/validar opção ativa no admin para mensagens em janelas (15/30 dias etc.)
- [ ] Garantir leitura de contexto da conversa
- [ ] Mensagem de recuperação: perguntar motivo de saída e proposta de retorno
- [ ] Logs/controle de envio e status por contato

Testes obrigatórios da Parte 2:
- [ ] Simular cliente não pagante com envio em janela configurada
- [ ] Validar conteúdo enviado e registro no histórico

---

## PARTE 3 — Conversas/Atendimento (UX + lógica)

### 3.1 Lista e ações em massa
- [ ] Confirmar assinatura embaixo e mensagem em cima
- [ ] Confirmar selecionar todos / um a um
- [ ] Confirmar ativar IA para todos / desativar IA para todos

### 3.2 Detalhes da conversa
- [ ] Confirmar botão Salvar em campos personalizados (funcional)
- [ ] Trocar “limpar histórico” por “Encerrar chamado” com comportamento correto
- [ ] Encerrar chamado sem apagar histórico (auditoria)
- [ ] Nova interação após encerramento deve iniciar novo contexto operacional

### 3.3 Agendamento com/sem IA
- [ ] Opção de agendar texto manual sem IA
- [ ] Opção gerar com IA + editar antes de agendar
- [ ] Mensagem final enviada deve ser exatamente o texto editado

Testes obrigatórios da Parte 3:
- [ ] Fluxo completo de encerramento e retorno do mesmo cliente
- [ ] Fluxo de agendamento manual e com IA

---

## PARTE 4 — Setores / Roteamento / Relatórios

- [ ] Setores: Financeiro, Suporte, Comercial
- [ ] Múltiplos membros por setor
- [ ] Roteamento por intenção para setor correto
- [ ] Fallback quando setor sem membro ativo
- [ ] Relatório para dono do SaaS (por setor/membro)

Testes obrigatórios da Parte 4:
- [ ] Casos de intenção por setor
- [ ] Fallback sem membro ativo
- [ ] Relatório com dados coerentes

---

## PARTE 5 — Multi-WhatsApp

- [ ] Permitir múltiplas conexões WhatsApp
- [ ] Vincular cada conexão a um agente específico
- [ ] UX minimalista desktop/mobile

Testes obrigatórios da Parte 5:
- [ ] Duas conexões ativas com agentes distintos
- [ ] Mensagens roteando para agente correto

---

## PARTE 6 — Ferramentas Salão + Suporte (revalidação)

- [ ] Validar persistência do horário de almoço (salvar e recarregar)
- [ ] Validar respeito às regras de agenda por serviço/tempo
- [ ] Validar criação/edição de serviços
- [ ] Validar Suporte fora de Ferramentas (encontrável rápido desktop/mobile)
- [ ] Validar chat de chamado com input fixo e UX consistente

---

## Checklist de Entrega por Parte (obrigatório)

- [ ] Evidências de teste real em localhost com as duas contas
- [ ] Lista de arquivos alterados
- [ ] Commit da parte
- [ ] Deploy Railway
- [ ] Validação pós-deploy
- [ ] Só avançar para próxima parte quando a atual estiver 100%
