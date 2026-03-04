# Tasklist: Otimização de Delivery IA vs IA (Mistral)

Esta lista de tarefas foca na criação de um ambiente de teste robusto "IA vs IA" para aperfeiçoar o fluxo de delivery, garantindo 100% de sucesso em cenários complexos antes da ativação.

## 🛠️ Configuração e Preparação
1. [x] **Verificar Conexão Supabase**: Confirmar acesso ao projeto `bnfpcuzjvycudccycqqt` e localizar usuário `bigacaicuiaba@gmail.com`.
2. [ ] **Recuperar Chaves de API**: Obter a chave Mistral/OpenAI do banco de dados para usar nos testes (mesma chave de produção).
3. [ ] **Criar Gerador de Personas (Client AI)**: Script para gerar 10 personalidades de clientes diferentes (impaciente, indeciso, prolixo, etc).
4. [x] **Desenvolver Harness de Teste (Loop)**: Criar `test-ia-vs-ia-loop.ts` que gerencia a troca de mensagens entre Agente e Cliente simulado.

## 🤖 Desenvolvimento dos Agentes
5. [ ] **Implementar Cenário "Meio a Meio"**: Configurar prompt do Cliente IA para exigir especificamente pizzas meio a meio.
6. [ ] **Integrar Lógica Atual**: Conectar o harness diretamente ao `deliveryAIService.ts` para testar a lógica real (não apenas o prompt).
7. [ ] **Gerenciamento de Estado**: Garantir que o histórico da conversa seja passado corretamente para ambos os lados (memória).
8. [ ] **Detecção de Sucesso**: Implementar verificação automática se o pedido foi finalizado (status `CONFIRMED` ou inserção no banco).

## 🧪 Ciclo de Testes e Refinamento
9. [ ] **Executar Teste Base (10 Clientes)**: Rodar primeira bateria sem modificações para estabelecer a taxa de erro atual.
10. [ ] **Análise de Falhas**: Identificar gargalos (ex: falha em entender endereço, erro no cálculo de meio a meio, loop infinito).
11. [ ] **Refinamento de Prompt (Iteração 1)**: Ajustar `deliveryAIService.ts` para corrigir erros óbvios de instrução.
12. [ ] **Aprimorar Extração de Dados**: Melhorar Regex/Lógica em `extractCustomerInfo` se a IA falhar em estruturar os dados.
13. [ ] **Teste de Conversa Longa**: Forçar cenários onde o cliente enrola muito para testar "memória" e paciência do agente.
14. [ ] **Correção de "Amnésia"**: Ajustar janela de contexto ou resumo se o agente esquecer itens anteriores.
15. [ ] **Refinamento de Prompt (Iteração 2)**: Focar na apresentação do Resumo do Pedido para garantir clareza absoluta.

## 🏆 Validação Final e Entrega
16. [ ] **Bateria de Estresse "Meio a Meio"**: Testar especificamente variações complexas de pizza combinada.
17. [ ] **Validação de Banco de Dados**: Confirmar se os pedidos "finalizados" estão salvando corretamente no Supabase.
18. [ ] **Validação 10/10**: O sistema só passa se 10 de 10 conversas resultarem em pedido correto.
19. [ ] **Documentação do Prompt**: Salvar a versão "perfeita" do prompt como referência ("frozen gold standard").
20. [ ] **Preparar Deploy**: Limpar código de debug e deixar pronto para ativação em produção.
