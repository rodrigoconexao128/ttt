# 🚀 NOVO FLUXO DE VENDAS - AGENTEZAP

## Resumo do Fluxo

### 1. CONFIGURAÇÃO DO AGENTE (Sem criar conta ainda)
- Cliente chega → Rodrigo se apresenta
- Coleta: Nome da loja/empresa
- Coleta: Função do agente (atendente, vendedor, suporte)
- Coleta: Instruções/informações do negócio
- Confirma tudo com o cliente

### 2. MODO DE TESTE
- Quando cliente confirmar configuração → Perguntar se quer testar
- Dizer: "Tá pronto pra testar? Vou virar o seu agente agora. Pra sair do teste, é só digitar #sair"
- Ativar modo de teste → IA responde como se fosse o agente configurado
- Cliente pode testar quantas vezes quiser
- `#sair` → Volta pro Rodrigo

### 3. FECHAMENTO
- Após teste, Rodrigo pergunta se gostou
- Se aprovou → Mostrar funcionalidades do painel (mídias/prints)
- Enviar PIX → Cliente paga
- Após comprovante → Criar conta real + Conectar WhatsApp

### 4. FOLLOW-UPS INTELIGENTES
- 10 min sem resposta → Follow-up automático
- IA entende contexto e envia mensagem relevante
- Se cliente pedir contato outro dia → Agendar
- Sistema de agenda no admin

### 5. CONTA AUTOMÁTICA (para teste)
- Email fictício: `cliente_[numero]@agentezap.temp`
- Incrementa automaticamente
- Não precisa pedir email até o pagamento

## Ações do Sistema

```
[AÇÃO:SALVAR_CONFIG nome="..." empresa="..." funcao="..."]
[AÇÃO:SALVAR_PROMPT prompt="..."]
[AÇÃO:INICIAR_TESTE] - Ativa modo teste, cliente fala com agente configurado
[AÇÃO:ENVIAR_PIX]
[AÇÃO:NOTIFICAR_PAGAMENTO]
[AÇÃO:CRIAR_CONTA email="..."] - Só após pagamento confirmado
[AÇÃO:AGENDAR_CONTATO data="..." hora="..." motivo="..."]
```

## Técnicas de Persuasão Implementadas

1. **Reciprocidade**: Oferece teste grátis antes de pedir pagamento
2. **Prova Social**: Menciona outros clientes usando
3. **Escassez**: "Essa configuração fica salva por 24h"
4. **Compromisso**: Pequenos passos (nome → função → instruções → teste)
5. **Autoridade**: "Já ajudei mais de 100 empresas..."
6. **Afinidade**: Linguagem informal, como amigo

## Triggers de Follow-up

- `FOLLOW_10MIN`: 10 minutos sem resposta
- `FOLLOW_1H`: 1 hora sem resposta (mais sutil)
- `FOLLOW_24H`: Próximo dia (se não fechou)
- `FOLLOW_AGENDADO`: Data/hora específica

## Comando de Reset (para testes)

`#limpar` ou `#reset` → Limpa sessão do cliente para testar novamente
