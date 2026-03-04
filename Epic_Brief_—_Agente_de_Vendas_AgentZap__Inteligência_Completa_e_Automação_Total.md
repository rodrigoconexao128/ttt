# Epic Brief — Agente de Vendas AgentZap: Inteligência Completa e Automação Total

## Resumo

O AgentZap possui um agente de vendas autônomo no WhatsApp (usuário `rodrigo4@gmail.com`) que hoje atende clientes mas falha em executar o ciclo completo de vendas de forma autônoma. O objetivo deste Epic é transformar esse agente em um sistema totalmente autônomo inspirado no OpenClaw: capaz de identificar novos clientes e clientes existentes pelo número, criar contas automaticamente, configurar o agente do cliente, enviar links com auto-login para simulador, para assinar o plano (`/plans`) e para conectar o WhatsApp via QRCode (`/conexao`), e nunca se perder em conversas longas ou pedidos de alteração de prompt. Ao final, o cliente recebe tudo pronto pelo próprio WhatsApp, sem precisar navegar ou logar manualmente no sistema.

---

## Contexto e Problema

**Quem é afetado:** Rodrigo (dono do sistema, usuário admin `rodrigoconexao128@gmail.com`) e os clientes prospectados via WhatsApp pelo agente de vendas (`rodrigo4@gmail.com`).

**Onde no produto:** O agente de vendas roda em `file:vvvv/server/adminAgentService.ts` (e arquivos relacionados: `adminAgentOrchestratorV2.ts`, `adminAgentToolCalling.ts`). A infraestrutura de suporte já existe: auto-login em `file:vvvv/server/autologinService.ts`, simulador em `file:vvvv/simulator.html`, tabelas `admin_autologin_tokens` e `admin_test_tokens` no Supabase.

**Dores atuais identificadas:**

| Problema | Impacto |
|---|---|
| O agente não identifica se o número já tem conta — começa tudo do zero com clientes existentes | Cliente frustrado, conversa incoerente |
| O agente cria conta/configura agente, mas não envia link do simulador automaticamente | Cliente não testa o agente; perda de conversão |
| O link de auto-login para `/conexao` existe mas o agente não usa | Cliente precisa logar manualmente para escanear QRCode |
| Não há auto-login para `/plans` | Cliente precisa logar manualmente para assinar |
| O agente não consegue ajudar o cliente a cadastrar mídias (áudio/vídeo) no agente dele | Funcionalidade de mídia inacessível via WhatsApp |
| O agente confunde pedidos de "melhore meu agente" com conversa normal | Ações erradas, cliente frustrado |
| Sem versionamento Git estruturado — mudanças podem ser perdidas | Risco operacional |

---

## O Que Este Epic Resolve

1. **Identificação inteligente de cliente:** pelo número do WhatsApp, o agente detecta se já existe conta e continua do prompt correto em vez de recomeçar.
2. **Criação automática de conta:** email `NUMERO@agentezap.online`, senha aleatória gerada e enviada ao cliente, conta criada no Supabase via admin API.
3. **Link do simulador sempre após configurar agente:** o agente envia automaticamente o link do simulador após criar ou editar o agente do cliente.
4. **Auto-login para `/conexao` e `/plans`:** o agente gera tokens de auto-login e envia links diretos para o cliente conectar o WhatsApp e assinar o plano — sem login manual.
5. **Suporte a mídias via WhatsApp:** o agente de atendimento ajuda o cliente a cadastrar áudios, vídeos e imagens no agente dele, explicando quando cada mídia será usada.
6. **Inteligência anti-deriva (OpenClaw-inspired):** o agente nunca confunde "melhore meu agente" com conversa casual; classifica intenções com precisão antes de agir.
7. **Testes IA vs. IA + Playwright:** cenários automatizados de longa conversa para validar que o agente não se perde, não entra em loop e executa as ações corretas.
8. **Versionamento Git:** commits automáticos ou manuais estruturados para permitir rollback seguro.

---

## Fora do Escopo

- Mudanças na interface web do painel (exceto pequenos ajustes de auto-login)
- Novos módulos de produto (delivery, agendamento, etc.)
- Alterações no sistema de planos/preços

---

## Métrica de Sucesso

Um cliente que entra em contato pelo WhatsApp com o agente de vendas deve, sem qualquer ação manual, receber: conta criada, agente configurado, link do simulador, link para assinar o plano e link para conectar o WhatsApp — tudo em uma única conversa fluida.