# Simulador de Chat do Admin (Rodrigo)

Este simulador permite testar o fluxo do Agente Admin (Rodrigo) localmente, sem precisar conectar ao WhatsApp ou fazer deploy.

## Como Acessar

1. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
2. Acesse no navegador:
   [http://localhost:5000/admin-simulator](http://localhost:5000/admin-simulator)

## Funcionalidades

- **Chat em Tempo Real**: Converse com o agente como se estivesse no WhatsApp.
- **Envio de Imagens**: Teste o fluxo de análise de mídia (Vision AI).
- **Persistência de Sessão**: O estado da conversa é mantido no backend (memória/banco) baseado no número de telefone.

## Fluxo de Teste Recomendado (Mídia)

1. **Envie uma imagem** pelo simulador.
2. O agente deve:
   - Receber a imagem.
   - Analisar com Mistral Vision.
   - Perguntar o contexto ("O que é essa imagem?").
3. **Responda com o contexto** (ex: "É uma foto do prato do dia").
4. O agente deve:
   - Gerar um resumo e descrição.
   - Pedir confirmação ("Entendi, é uma foto de... Posso salvar?").
5. **Confirme** (ex: "Sim").
6. O agente deve salvar a mídia na biblioteca.

## Notas Técnicas

- O simulador usa a rota `/api/test/admin-chat`.
- As imagens são enviadas como Base64 para o backend.
- O backend processa a mensagem usando a mesma função `processAdminMessage` que o webhook do WhatsApp usa.
