# 📋 TASKLIST: OTIMIZAÇÃO CONTÍNUA E PROFUNDA (IA vs IA)

Objetivo: Realizar 100 testes iterativos, analisando cada lote profundamente e calibrando o prompt para perfeição humana e conversão focada em "Conta Grátis" e "Plano R$49".

## 🚀 Fase 1: Configuração e Estrutura (Estado Atual)
- [x] Criar script de teste base (já existe `teste-profundo-ia-vs-ia.ts`)
- [ ] Adaptar script para execução unitária/lote pequeno (para análise detalhada)
- [ ] Criar sistema de log detalhado para leitura do agente

## 🔄 Fase 2: Ciclos de Teste e Calibragem (Iterativo)

### Ciclo 1: Clientes "Fáceis" e Diretos (1-10)
*Foco: Validar se o básico funciona (preço, link, cadastro) sem parecer robô.*
- [ ] Executar testes com perfis Quentes/Diretos
- [ ] **ANÁLISE PROFUNDA DO AGENTE:** Ler conversas, identificar "robotices", falhas de tom.
- [ ] **CALIBRAGEM:** Ajustar prompt imediatamente.

### Ciclo 2: Clientes com Dúvidas e Objeções Leves (11-30)
*Foco: "Funciona pra mim?", "Tenho medo de não saber usar".*
- [ ] Executar testes com perfis Mornos/Inseguros
- [ ] **ANÁLISE PROFUNDA:** Verificar empatia e clareza na explicação.
- [ ] **CALIBRAGEM:** Melhorar tratamento de objeções e incentivo ao teste grátis.

### Ciclo 3: Clientes "Difíceis", Céticos e Chatbot-Haters (31-50)
*Foco: Quebrar barreira de "falar com robô", clientes grossos ou impacientes.*
- [ ] Executar testes com perfis Frios/Céticos
- [ ] **ANÁLISE PROFUNDA:** Verificar paciência e capacidade de contornar negatividade.
- [ ] **CALIBRAGEM:** Ajustar tom de paciência e persuasão sutil.

### Ciclo 4: Segmentos Específicos e Técnicos (51-75)
*Foco: Contexto de nicho (Mecânica, Advogado, Médico, Loja).*
- [ ] Executar testes com perfis de Nicho
- [ ] **ANÁLISE PROFUNDA:** Verificar se a IA usa o vocabulário do cliente.
- [ ] **CALIBRAGEM:** Inserir exemplos de nicho no prompt.

### Ciclo 5: Teste de Stress e Casos Extremos (76-100)
*Foco: Áudios longos, erros de português, confusão mental do cliente.*
- [ ] Executar testes caóticos
- [ ] **ANÁLISE PROFUNDA:** Resiliência e clareza.
- [ ] **CALIBRAGEM FINAL:** Polimento final.

## 🎯 Metas de Qualidade
- [ ] Conversão acima de 90%
- [ ] Zero "alucinações" de preço (manter R$49 se citado)
- [ ] Zero loops de "Olá, sou o Rodrigo"
- [ ] Indução natural ao cadastro gratuito ("Cria sua conta, é rapidinho")
