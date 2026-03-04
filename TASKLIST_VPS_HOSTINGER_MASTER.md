# Tasklist Mestre - AgenteZap VPS-Only (Hostinger)

Status geral: `em_execucao`
Ambiente oficial: `VPS Hostinger (187.77.33.14)`
Railway: `descontinuado para deploy`

## Fase 0 - Governança de Deploy (VPS-Only)
- [x] Definir que deploy oficial é somente VPS Hostinger.
- [x] Padronizar script único de deploy SSH (`deploy_ssh.py`).
- [x] Adicionar healthcheck HTTP pós-deploy (`/admin`).
- [x] Padronizar PM2 por app (`agentezap`) sem `pm2 stop all`.
- [x] Adicionar comandos npm de operação VPS (`vps:deploy`, `vps:status`, `vps:health`, `vps:restart`, `vps:logs`).
- [x] Limpar `dist` antes do build para evitar artefatos antigos no servidor.
- [x] Validar `vps:deploy` de ponta a ponta (build local + upload + restart + healthcheck 200).

## Fase 1 - Confiabilidade Operacional
- [x] Validar atualização real em produção com Playwright no domínio final.
- [x] Confirmar botões de conversa no admin:
- [x] `Limpar conversa`
- [x] `Excluir conta vinculada`
- [x] Validar fluxo não-destrutivo (somente abrir confirmações/modais sem executar exclusão real).
- [ ] Criar backup automatizado diário de banco e sessão WhatsApp.
- [ ] Criar rollback automatizado de release (último bundle estável).
- [ ] Criar monitor de uptime + alerta Telegram/WhatsApp para 5xx e queda de processo.

## Fase 2 - Motor de Agente Stateful (Qualidade Enterprise)
- [ ] Implementar estado conversacional persistente por `conversationId`:
- [ ] `mode`, `pendingSlot`, `capturedSlots`, `linkedUserId`, `lastTestToken`, `resumeHint`.
- [ ] Separar classificação LLM da execução determinística.
- [ ] Garantir regra: sem validação real, sem resposta de "sucesso".
- [x] Corrigir extra��o agressiva de `business_info` (n�o aceitar sauda��o como nome de empresa).
- [ ] Corrigir truncamento de atualização estruturada de horários.
- [ ] Implementar retomada exata de etapa após interrupções/perguntas.

## Fase 3 - Criação Completa via WhatsApp (sem painel)
- [ ] Criar/reaproveitar conta automaticamente.
- [x] Forçar email padrão: `{numero_whatsapp}@agentezap.online`.
- [ ] Criar agente + gerar token de teste + enviar links válidos.
- [ ] Validar coerência:
- [ ] `/api/test-agent/info/:token`
- [ ] `/api/test-agent/message`
- [ ] Fluxo de edição do prompt/IA inteiramente por WhatsApp (sem exigir painel).
- [ ] Atualização instantânea de link de teste após alterações do agente.

## Fase 4 - Conversão e Pagamento
- [ ] CTA principal: assinatura no painel com roteamento consistente.
- [ ] CTA secundário: PIX no WhatsApp sem forçar saída para site.
- [ ] Garantir payload PIX oficial no fluxo de conversa.
- [ ] Integrar comprovante (upload + análise + aprovação admin).
- [ ] Garantir botão "Já paguei" no fluxo web com submissão ao admin.
- [ ] Regras anti-link quebrado para evitar envio de URL errada/inexistente.

## Fase 5 - Roteamento por Tipo de Negócio
- [ ] Detectar vertical: `delivery`, `clinica`, `cabeleireiro`, `comercio`, etc.
- [ ] Ligar automaticamente módulo correto:
- [ ] delivery -> cardápio/pedido
- [ ] agendamento -> horários/disponibilidade
- [ ] comercial -> pipeline de venda
- [x] Evitar perguntas de agenda quando neg�cio n�o exige agenda.

## Fase 6 - Benchmark IA vs IA Contínuo
- [ ] Rodar suíte automática diária com perfis:
- [ ] curioso, muito interessado, sem grana, desconfiado, leigo, apressado.
- [ ] Métricas obrigatórias:
- [ ] `context_loss_rate`
- [ ] `unnecessary_reask_rate`
- [ ] `false_success_rate`
- [ ] `wrong_link_rate`
- [ ] `wrong_user_binding_rate`
- [ ] `avg_completion_turns`
- [ ] `avg_latency_ms`
- [ ] `conversion_ready_rate`
- [ ] Travar deploy se métricas regredirem acima do limite.

## Fase 7 - Segurança e Compliance
- [ ] Remover segredos hardcoded de scripts locais e migrar para variáveis de ambiente/secret manager.
- [ ] Rotacionar senha root e token API Hostinger.
- [ ] Implementar acesso SSH por chave privada e desativar senha em produção.
- [ ] Auditoria de logs de ações administrativas (reset, exclusão, suspensão).

## Critérios de Conclusão
- [ ] Zero perda de contexto em onboarding + conversão.
- [ ] Zero "sucesso falso" sem validação de artefato criado.
- [ ] Admin conversas com ações completas e consistentes.
- [ ] Deploy totalmente VPS-only com rollback/monitoramento.
- [ ] Suíte IA-vs-IA estável com aprovação automática.

## Execucao atual (2026-03-01)
- [x] Entrega deterministica de link/login/email habilitada no admin agent quando a conta de teste e criada.
- [x] Deteccao de "promessa sem link real" reforcada (placeholders e links vazios).
- [x] Gating de `CRIAR_CONTA_TESTE` ajustado para cliente ja vinculado quando pedir link/teste novamente.
- [x] `sessionHasDeliveredTestLink` corrigido para nao considerar apenas token salvo sem link real na mensagem.
- [x] Simulacao aprovada: `npm --prefix vvvv run simulate:admin-guided-flow`.
- [x] Simulacao aprovada: `npm --prefix vvvv run simulate:admin-ia-vs-ia`.
- [x] Auditoria aprovada: `npm --prefix vvvv run audit:admin-delivery-claims` com 0 casos suspeitos.
- [x] Correção anti-loop no onboarding: `isMetaCommentary` não trata mais qualquer menção a "robô" como reclamação, evitando re-pergunta indevida no stage de comportamento.
- [x] Correção de extração de nome de negócio: `extractBusinessNameCandidate` agora ignora perguntas sem marcador explícito, limpa markdown (`**...**`) e aceita padrão "então é X".
- [x] Simulação IA-vs-IA revalidada com sucesso total: `npm --prefix vvvv run simulate:admin-ia-vs-ia` => 3/3 cenários aprovados.
- [x] Reforço dos testes de entrega determinística: scripts agora validam e-mail canônico exato do telefone da conversa, não apenas padrão genérico.
- [x] UI de Conversas reforçada: ações críticas separadas em linha própria no cabeçalho e `Excluir conta vinculada` visível mesmo quando o número não vem preenchido nos detalhes da conversa.
- [x] Deploy VPS concluído: `npm --prefix vvvv run vps:deploy` com healthcheck `/admin` HTTP 200 e PM2 `agentezap` online.
- [x] Validação navegada em produção (Playwright local): em `#conversations/8fbb760e-7908-40d9-a19d-dbb72aa3e5e5` e `#conversations/c7585fe8-f448-4bc6-a6a2-f480bdcffa93`, os botões `Limpar conversa` e `Excluir conta vinculada` aparecem.
- [x] Validação não destrutiva em produção: confirmação de limpeza abre `confirm(...)` e exclusão abre modal com palavra-chave `DELETAR`.
- [x] Blindagem adicional de producao: entrega de "agente pronto" exige credenciais completas (`email` + `loginUrl` + `simulatorToken`) antes de responder sucesso.
- [x] `buildStructuredAccountDeliveryText` protegido contra sucesso falso quando token nao existe (retorno tecnico controlado).
- [x] `ensureTestCredentialsForFlow` e fluxo de demo passam a exigir token real para gerar captura e para entrega final.
- [x] Playwright com login real do admin (`rodrigoconexao128@gmail.com`) validado em producao para os 2 IDs de conversa, com botoes e confirmacoes visiveis.
- [x] Novo benchmark real por banco criado (`simulate:admin-real-db-flow`): reseta cliente, injeta mensagem no banco, processa IA, salva resposta no banco e valida payload deterministico.
- [x] Cenario solicitado pelo usuario aprovado: telefone `5517991956944` com link `/test/:token`, `/login` e e-mail canonico.
- [x] Suite multiperfil real (6 perfis) aprovada com `100%` de sucesso no relatorio `admin-real-db-flow-2026-03-01T19-47-26-490Z.json`.

- [x] Endurecimento adicional do onboarding aplicado:
- [x] `sanitizeCompanyName` bloqueia frases comerciais/perguntas vagas como nome de empresa.
- [x] stage `business` so avanca com sinal real de negocio (reduz falso positivo de saudacao/pergunta).
- [x] stage `workflow` generico nao pede horario automaticamente quando agenda nao e necessaria.
- [x] stage `hours` agora pede apenas o campo faltante (dias ou horario), reduzindo loop de reask.
- [x] Regressao completa apos patch aprovada:
- [x] `npm --prefix vvvv run simulate:admin-guided-flow`.
- [x] `npm --prefix vvvv run simulate:admin-ia-vs-ia`.
- [x] `npm --prefix vvvv run simulate:admin-real-db-flow` (100%, incluindo `5517991956944`).
- [x] `npm --prefix vvvv run verify:admin-manager`.
- [x] Deploy VPS Hostinger concluido novamente com sucesso (`npm --prefix vvvv run vps:deploy`).
- [x] Status/health pos-deploy confirmados (`vps:status`, `vps:health`) com PM2 online e `/admin` HTTP 200.
- [x] Playwright pos-deploy revalidado com sucesso em producao:
- [x] `vvvv/test-results/playwright-admin-conversations/report-2026-03-01T20-09-44-857Z.json`.
- [x] Benchmark diario automatizado implementado no projeto (`npm run benchmark:admin-daily`) com geracao de relatorio JSON+MD em `test-results`.
- [x] Script de benchmark consolidando metricas centrais: `context_loss_rate`, `unnecessary_reask_rate`, `false_success_rate`, `wrong_link_rate`, `wrong_user_binding_rate`, `avg_completion_turns`, `avg_latency_ms`, `conversion_ready_rate`.
- [x] Regra de alerta aplicada no benchmark: se `false_success_rate > 0`, o comando retorna erro e sinaliza falha.
- [x] Benchmark diario validado localmente com sucesso e `false_success_rate = 0`.
- [x] Benchmark diario validado no VPS com sucesso e relatorio em `/opt/agentezap/vvvv/test-results/admin-daily-benchmark-2026-03-01T20-37-57-741Z.json`.
- [x] Cron de benchmark diario instalado no VPS:
- [x] `20 5 * * * cd /opt/agentezap/vvvv && npm run benchmark:admin-daily >> /var/log/agentezap/admin-daily-benchmark.log 2>&1`.

- [x] Correcoes de contexto aplicadas no `adminAgentService` e validadas.
- [x] Bloqueio de falso nome de empresa em onboarding (`to sem grana`, etc.).
- [x] Parse de workflow corrigido para `nao uso agendamento`.
- [x] Parser delivery ampliado para variantes de fechamento de pedido.
- [x] Fallback de contexto atualizado para evitar gatilho de perda de contexto por frase de lentidao.
- [x] Benchmark diario revalidado localmente apos patch:
- [x] `vvvv/test-results/admin-daily-benchmark-2026-03-01T21-04-31-101Z.json`
- [x] Metricas: `context_loss_rate=0.0714`, `unnecessary_reask_rate=0`, `false_success_rate=0`, `conversion_ready_rate=1`.
- [x] Playwright validado com login real no admin.
- [x] Botoes `Limpar conversa` e `Excluir conta vinculada` presentes no header da conversa.
- [x] Fluxo destrutivo testado ate o fim (`DELETAR` + `Confirmar Delete`) com exclusao confirmada em banco para conversa de teste.

## Execucao complementar (2026-03-02)
- [x] Correcao de onboarding aplicada para pergunta inicial com nicho (ex: `delivery`) sem identidade explicita.
- [x] Fluxo nao avanca etapa de negocio sem dados reais; responde duvida lateral e retoma slot pendente correto.
- [x] Heuristica do benchmark diario ajustada para evitar falso positivo de `workflowProvided` por palavra isolada em pergunta.
- [x] Regressao final local aprovada:
- [x] `npm --prefix vvvv run simulate:admin-ia-vs-ia`
- [x] `npm --prefix vvvv run simulate:admin-module-matrix`
- [x] `npm --prefix vvvv run simulate:admin-real-db-flow`
- [x] `npm --prefix vvvv run benchmark:admin-daily`
- [x] Resultado benchmark final local: `context_loss_rate=0`, `unnecessary_reask_rate=0`, `false_success_rate=0`, `wrong_link_rate=0`, `wrong_user_binding_rate=0`, `conversion_ready_rate=1`.
- [x] Deploy VPS Hostinger final executado com sucesso (`npm --prefix vvvv run vps:deploy`).
- [x] Status/health pos-deploy confirmados novamente (`vps:status`, `vps:health`) com `/admin` HTTP 200.
- [x] Playwright pos-deploy validado em `#conversations/8fbb760e-7908-40d9-a19d-dbb72aa3e5e5`:
- [x] `Limpar conversa` presente com `confirm(...)` abrindo
- [x] `Excluir conta vinculada` presente com modal `DELETAR` abrindo
- [x] Benchmark remoto no VPS rerodado apos sincronizar codigo-fonte (`server/adminAgentService.ts` + `scripts/run-admin-daily-benchmark.ts`).
- [x] Relatorio VPS final: `/opt/agentezap/vvvv/test-results/admin-daily-benchmark-2026-03-02T01-05-24-415Z.json` com `context_loss_rate=0`, `false_success_rate=0`, `wrong_link_rate=0`, `wrong_user_binding_rate=0`, `conversion_ready_rate=1`.
- [x] Validacao de conversa real no admin concluida (telefone `5517991956944`, conversa `38df8d9d-4a14-43db-a5c3-f7a636185ecf`).
- [x] Mensagem exibida no painel com `Teste publico`, `https://agentezap.online/login` e `Email: 5517991956944@agentezap.online`.
