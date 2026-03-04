# Pesquisa Completa: whatsmeow, CTWA, PDO e Mensagens Indecifráveis em Dispositivos Vinculados

> Pesquisa realizada em Junho/2026 — Fontes: código-fonte whatsmeow, Baileys, Evolution API, Issues/PRs GitHub

---

## Índice

1. [Resumo Executivo](#1-resumo-executivo)
2. [O Problema: Por que mensagens CTWA não chegam em dispositivos vinculados](#2-o-problema)
3. [Como o whatsmeow trata CTWA/PDO (análise detalhada do código-fonte)](#3-whatsmeow-detalhado)
4. [Como o Baileys trata CTWA (PR #2334 — MERGED)](#4-baileys)
5. [Evolution API e o problema CTWA](#5-evolution-api)
6. [Abordagens alternativas além do PDO retry](#6-alternativas)
7. [Dicas de configuração para melhorar a taxa de sucesso do PDO](#7-configuracao)
8. [É possível forçar o telefone a responder mais rápido?](#8-forcar-telefone)
9. [Tabela comparativa: whatsmeow vs Baileys vs Evolution API](#9-comparacao)
10. [Referências](#10-referencias)

---

## 1. Resumo Executivo

**O problema central**: Mensagens originadas de anúncios Facebook/Instagram "Click-to-WhatsApp" (CTWA) chegam aos dispositivos vinculados (companion/linked devices) **sem criptografia** — o endpoint de anúncios da Meta **não cifra para dispositivos multi-device**. Elas chegam com uma tag `<unavailable>` sem filhos `<enc>`, tornando impossível a decifragem normal.

**A solução padrão**: PDO (Peer Data Operation) — o dispositivo vinculado envia uma solicitação ao telefone principal pedindo que ele reenvie o conteúdo decifrado. Isso é chamado de **Placeholder Message Resend**.

**Estado atual**:
- **whatsmeow** (Go): Suporte completo desde commit `fe67855` (Ago/2023). Requer `AutomaticMessageRerequestFromPhone = true`.
- **Baileys** (TypeScript): Fix **merged na master** via PR #2334 (Jun/2026). A infraestrutura `requestPlaceholderResend` existia mas nunca era chamada para CTWA.
- **Evolution API**: Problema endêmico em várias versões (v2.3.3–2.3.6+). Workaround comunitário: downgrade para v2.3.4, mas com trade-offs.

---

## 2. O Problema

### 2.1 Por que mensagens CTWA são diferentes?

Quando um usuário clica em um anúncio do Facebook/Instagram com botão "Click-to-WhatsApp":

1. A mensagem é criada pelo backend de anúncios da Meta
2. A Meta entrega a mensagem ao servidor do WhatsApp
3. **O endpoint de anúncios da Meta NÃO cifra a mensagem para dispositivos vinculados** (linked devices)
4. O telefone principal recebe a mensagem normalmente (ele é o destino primário do Signal Protocol)
5. Os dispositivos vinculados recebem um stanza XML com `<unavailable type="...">` mas **sem nenhum filho `<enc>`**

> **Citação de @purpshell (mantenedor Baileys, Set/2025)**:
> "This is an issue from WhatsApp. The problem is that Meta Ads's endpoint does not encrypt the message for linked devices."

### 2.2 Como a mensagem chega ao dispositivo vinculado

```xml
<!-- Stanza XML recebida pelo dispositivo vinculado -->
<message from="5512981234567@s.whatsapp.net" ...>
  <unavailable type="2" />
  <!-- NOTA: NÃO há filhos <enc> com pkmsg/msg/skmsg -->
</message>
```

Compare com uma mensagem normal:
```xml
<message from="5512981234567@s.whatsapp.net" ...>
  <enc type="pkmsg" v="2">
    <content>...bytes cifrados...</content>
  </enc>
</message>
```

### 2.3 O que acontece se não tratarmos?

- A mensagem fica como "placeholder" ou simplesmente é descartada silenciosamente
- O usuário vê a mensagem no WhatsApp oficial do telefone, mas **não no bot/API**
- Somente após responder manualmente pelo telefone, as mensagens futuras começam a chegar
- Isso é **devastador** para negócios que usam chatbots para atendimento de leads de anúncios

---

## 3. Como o whatsmeow Trata CTWA/PDO (Análise Detalhada do Código-Fonte)

### 3.1 Detecção de mensagens indisponíveis (`message.go`)

No arquivo `message.go`, função `decryptMessages()`:

```go
// Verifica se a mensagem é "unavailable" (sem criptografia)
unavailable := node.GetOptionalChildByTag("unavailable")
if unavailable != nil && len(node.GetChildrenByTag("enc")) == 0 {
    // Mensagem chegou sem nenhum nó <enc>
    // → É um caso de CTWA ou outro tipo de mensagem não cifrada
    
    go cli.immediateRequestMessageFromPhone(info)
    
    evt := &events.UndecryptableMessage{
        Info:            *info,
        IsUnavailable:   true,
        UnavailableType: unavailable.AttrGetter().String("type"),
    }
    cli.dispatchEvent(evt)
    return
}
```

**Pontos-chave**:
- A detecção é feita pela presença de `<unavailable>` + ausência de `<enc>`
- Chama `immediateRequestMessageFromPhone()` **imediatamente** (sem delay)
- Dispara evento `UndecryptableMessage` com `IsUnavailable: true`
- O `UnavailableType` captura o tipo (ex: "2" para anúncios)

### 3.2 Mecanismo de retry para falhas de decifragem (`retry.go`)

Para mensagens que possuem `<enc>` mas falham na decifragem (caso diferente de CTWA):

```go
func (cli *Client) sendRetryReceipt(node *waBinary.Node, info *types.MessageInfo, forceIncludeIdentity bool) {
    // Máximo de 5 tentativas de retry
    if retryCount >= 5 {
        cli.Log.Warnf("Retry count for %s is at %d, not sending retry receipt", id, retryCount)
        return
    }
    
    // Na PRIMEIRA falha (retryCount == 1):
    if retryCount == 1 {
        if cli.SynchronousAck {
            // Se ACK síncrono, pede ao telefone IMEDIATAMENTE
            go cli.immediateRequestMessageFromPhone(info)
        } else {
            // Senão, agenda com delay (padrão 5 segundos)
            go cli.delayedRequestMessageFromPhone(info)
        }
    }
    
    // Envia retry receipt ao remetente (protocolo Signal)
    // ...
}
```

### 3.3 Solicitação ao telefone via PDO (`retry.go` + `send.go`)

**Delayed Request** (com delay configurável):

```go
// RequestFromPhoneDelay é o delay padrão antes de pedir ao telefone (5 segundos)
var RequestFromPhoneDelay = 5 * time.Second

func (cli *Client) delayedRequestMessageFromPhone(info *types.MessageInfo) {
    // Verifica se auto-rerequest está habilitado
    if !cli.AutomaticMessageRerequestFromPhone {
        return
    }
    
    ctx, cancel := context.WithCancel(context.Background())
    
    // Salva a função de cancelamento (pode ser cancelada se a mensagem chegar no retry)
    cli.pendingPhoneRerequestLock.Lock()
    cli.pendingPhoneRerequests[info.ID] = cancel
    cli.pendingPhoneRerequestLock.Unlock()
    
    // Espera o delay (pode ser cancelado)
    select {
    case <-time.After(RequestFromPhoneDelay):
        // Timeout: envia PDO request ao telefone
        cli.sendPeerRequestForMessage(info)
    case <-ctx.Done():
        // Cancelado: mensagem chegou via retry normal
        return
    }
}
```

**Immediate Request** (sem delay — usado para mensagens `<unavailable>`/CTWA):

```go
func (cli *Client) immediateRequestMessageFromPhone(info *types.MessageInfo) {
    if !cli.AutomaticMessageRerequestFromPhone {
        return
    }
    
    // Envia imediatamente sem esperar
    cli.sendPeerRequestForMessage(info)
}
```

### 3.4 Construção da mensagem PDO (`send.go`)

```go
func (cli *Client) BuildUnavailableMessageRequest(
    chat types.JID,
    senderJID types.JID,
    id types.MessageID,
) *waE2E.Message {
    return &waE2E.Message{
        ProtocolMessage: &waE2E.ProtocolMessage{
            Type: waE2E.ProtocolMessage_PEER_DATA_OPERATION_REQUEST_MESSAGE.Enum(),
            PeerDataOperationRequestMessage: &waE2E.PeerDataOperationRequestMessage{
                PeerDataOperationRequestType: 
                    waE2E.PeerDataOperationRequestType_PLACEHOLDER_MESSAGE_RESEND.Enum(),
                PlaceholderMessageResendRequest: []*waE2E.PeerDataOperationRequestMessage_PlaceholderMessageResendRequest{{
                    MessageKey: &waCommon.MessageKey{
                        RemoteJID:   proto.String(chat.String()),
                        FromMe:      proto.Bool(senderJID.IsEmpty()),
                        ID:          proto.String(id),
                        Participant: participantToString(chat, senderJID),
                    },
                }},
            },
        },
    }
}
```

**Envio via Peer Message** (mensagem para o próprio dispositivo):
```go
func (cli *Client) SendPeerMessage(ctx context.Context, msg *waE2E.Message) error {
    // Envia mensagem para o próprio JID (telefone principal)
    // O telefone recebe e processa o pedido PDO
}
```

### 3.5 Recebimento da resposta PDO (`message.go`)

```go
func (cli *Client) handlePlaceholderResendResponse(
    info *types.MessageInfo,
    resp *waE2E.PeerDataOperationResult,
) {
    // 1. Extrai os bytes da mensagem original
    webMsgBytes := resp.GetPlaceholderMessageResendResponse().GetWebMessageInfoBytes()
    
    // 2. Desserializa o WebMessageInfo completo
    webMsg := &waWeb.WebMessageInfo{}
    err := proto.Unmarshal(webMsgBytes, webMsg)
    
    // 3. Parseia como mensagem normal
    parsed, err := cli.ParseWebMessage(chatJID, webMsg)
    
    // 4. Marca como originada de PDO request
    parsed.UnavailableRequestID = info.ID
    
    // 5. Dispara evento normal de mensagem recebida
    cli.dispatchEvent(parsed)
}
```

### 3.6 Roteamento da resposta PDO (`message.go`)

```go
func (cli *Client) handleProtocolMessage(info *types.MessageInfo, msg *waE2E.Message) {
    protoMsg := msg.GetProtocolMessage()
    
    // Verifica se é uma resposta PDO
    peerResp := protoMsg.GetPeerDataOperationRequestResponseMessage()
    if peerResp != nil {
        // Verifica o tipo de operação
        switch peerResp.GetPeerDataOperationRequestType() {
        case waE2E.PeerDataOperationRequestType_PLACEHOLDER_MESSAGE_RESEND:
            for _, result := range peerResp.GetPeerDataOperationResult() {
                cli.handlePlaceholderResendResponse(info, result)
            }
        }
    }
}
```

### 3.7 Cancelamento de request pendente

Se o retry normal (via Signal Protocol) funcionar antes do PDO:

```go
func (cli *Client) cancelDelayedRequestFromPhone(msgID types.MessageID) {
    cli.pendingPhoneRerequestLock.Lock()
    cancel, ok := cli.pendingPhoneRerequests[msgID]
    if ok {
        cancel() // Cancela o timer do delayedRequestMessageFromPhone
        delete(cli.pendingPhoneRerequests, msgID)
    }
    cli.pendingPhoneRerequestLock.Unlock()
}
```

### 3.8 Fluxo completo (diagrama)

```
CTWA Ad Message (sem criptografia para linked device)
         │
         ▼
[Dispositivo vinculado recebe stanza XML]
         │
         ├─ <unavailable> presente + sem <enc>?
         │          │
         │         SIM → immediateRequestMessageFromPhone()
         │          │         │
         │          │         ▼
         │          │    BuildUnavailableMessageRequest()
         │          │         │
         │          │         ▼
         │          │    SendPeerMessage() → telefone principal
         │          │         │
         │          │         ▼
         │          │    [Telefone processa e responde com PDO]
         │          │         │
         │          │         ▼
         │          │    handleProtocolMessage()
         │          │         │
         │          │         ▼
         │          │    handlePlaceholderResendResponse()
         │          │         │
         │          │         ▼
         │          │    dispatchEvent(*events.Message)
         │          │    com UnavailableRequestID preenchido
         │          │
         │         NÃO (tem <enc> mas falha decrypt)
         │          │
         │          ▼
         │    sendRetryReceipt() → remetente
         │    + delayedRequestMessageFromPhone() (5s delay)
         │          │
         │          ├─ Se retry funcionar antes de 5s:
         │          │    cancelDelayedRequestFromPhone()
         │          │
         │          └─ Se 5s passarem sem sucesso:
         │               sendPeerRequestForMessage() → telefone
         │
         └─ Evento UndecryptableMessage disparado
```

---

## 4. Como o Baileys Trata CTWA (PR #2334 — MERGED)

### 4.1 Histórico do problema no Baileys

| Data | Evento |
|------|--------|
| Ago/2025 | Issue #1723 aberta: "Messages from Facebook/Instagram Ads are not received until manual reply" |
| Ago-Set/2025 | 23+ comentários de "x2", "x3", etc — problema generalizado |
| Set/2025 | @purpshell confirma: "Meta's ads endpoint does not encrypt for linked devices" |
| Set/2025 | @viniciussricci descobre o mecanismo PDO manualmente |
| Jan/2026 | PR #2287 (rsalcara) — primeira tentativa, fechado |
| Jan/2026 | PR #2292 (jeffersonfelixdev/zapperapi) — segunda tentativa, aprovado mas depois descobriu-se incompleto |
| Jun/2026 | **PR #2334 (jlucaso1) — FIX DEFINITIVO, MERGED** |

### 4.2 Como o PR #2334 funciona (Baileys)

De acordo com a descrição do PR por @jlucaso1:

> "messages from Facebook/Instagram Click-to-WhatsApp ads arrive at companion devices without an `enc` node — Meta's ads endpoint doesn't encrypt for linked devices. Previously Baileys just ACKed and silently dropped these, so `messages.upsert` was never fired."

**Fluxo end-to-end implementado**:

1. **Detecção**: Ads message chega sem nó `enc` → `decryptables === 0` → stub CIPHERTEXT
2. **ACK + Placeholder**: Handler dá ACK no stanza e faz upsert do stub CIPHERTEXT como placeholder
3. **Cache de Metadados**: `requestPlaceholderResend(cleanKey, msgData)` dispara em background, **cacheando os metadados originais** (key com LID, pushName, timestamps)
4. **Correlação**: `messages.update` emite com `requestId` em `stubParameters[1]` para consumidores correlacionarem
5. **Dedup Window**: Após janela de 2 segundos de deduplicação, envia PDO request ao telefone
6. **Resposta PDO**: Telefone responde com `PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE`
7. **Merge com Cache**: `processMessage` decodifica `webMessageInfoBytes`, **mescla com metadados cacheados** (preserva detalhes LID que o telefone pode omitir)
8. **Evento Final**: `messages.upsert` dispara com a mensagem real decodificada

### 4.3 Diferencial: Cache de metadados

A inovação do PR #2334 (sugerida por @purpshell) foi cachear os metadados originais da mensagem:

> **@purpshell**: "PDO responses from the phone usually omit things like LID details. We could cache the message key data and everything around the message itself and then apply the WebMessageInfo.message"
>
> **@jlucaso1**: "Yeah makes sense, implemented it. We cache the original msg metadata (key w/ LID, pushName, timestamps etc.) and when the PDO response comes back we just apply the .message from the decoded response onto the cached data"

### 4.4 Filtros de exclusão

O PR também adiciona filtros (como faz o WhatsApp Web):
- `bot_unavailable_fanout` — excluído
- `hosted_unavailable_fanout` — excluído  
- `view_once_unavailable_fanout` — excluído
- Mensagens com mais de **14 dias** — excluídas

### 4.5 Como usar no Baileys (pós-merge)

```typescript
// Após atualizar para versão com PR #2334:
// npm install @whiskeysockets/baileys@latest

// Não é necessária configuração especial!
// O fix está integrado no fluxo padrão de messages-recv.ts

sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const msg of messages) {
        // Mensagens CTWA agora chegam aqui normalmente
        // Podem ter um pequeno delay (2s dedup + tempo do telefone responder)
        console.log('Mensagem recebida:', msg.key.id, msg.message);
    }
});
```

---

## 5. Evolution API e o Problema CTWA

### 5.1 Estado atual

A Evolution API é um wrapper popular sobre o Baileys. O problema de CTWA é amplamente reportado:

- **Issue #2243**: "Evolution não responde aos anúncios de ads da meta" — 15+ comentários
- **Issue #2078**: "Messages from ads not reaching Evolution API"
- **Issue #2066**: "Initial message from Facebook Ads not received"
- **Issue #1648**: Similar CTWA problem

### 5.2 Workarounds conhecidos

1. **Downgrade para v2.3.4**: Versão mais estável para ads, mas com trade-offs:
   - Problemas de reconexão de QR Code no Android
   - Menor estabilidade geral
   
2. **PR #2332 (Multi-Device Fix)**: Removeu identificação `WebClient` do browser, usando modo nativo MD:
   - Previne desconexões quando Android está ativo
   - Não resolve CTWA diretamente, mas melhora estabilidade multi-device

3. **Atualizar Baileys subjacente**: Com o merge do PR #2334 no Baileys master, a Evolution API deveria eventualmente incorporar o fix quando atualizar sua dependência do Baileys.

### 5.3 Recomendação para Evolution API

A melhor abordagem para Evolution API é:
1. Aguardar a próxima release que incorpore o Baileys com PR #2334
2. Ou fazer fork e atualizar manualmente a dependência do Baileys para a versão com o fix
3. Monitorar issues do Evolution API para anúncio de fix oficial

---

## 6. Abordagens Alternativas Além do PDO Retry

### 6.1 Retry Receipt padrão (Signal Protocol)

**O que é**: Enviar um "retry receipt" ao remetente solicitando reenvio da mensagem com nova sessão criptográfica.

**Limitação para CTWA**: Não funciona para mensagens de anúncios porque o remetente é o endpoint de ads da Meta, que não tem sessão criptográfica com o dispositivo vinculado.

### 6.2 Decodificação manual da resposta PDO (workaround Baileys pré-fix)

Antes do PR #2334, @viniciussricci documentou um workaround:

```typescript
sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
        const protoMsg = msg.message?.protocolMessage;
        const isPlaceholder =
            protoMsg?.type === 'PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE' &&
            protoMsg?.peerDataOperationRequestResponseMessage
                ?.peerDataOperationRequestType === 'PLACEHOLDER_MESSAGE_RESEND';

        if (!isPlaceholder) continue;

        const bytes =
            protoMsg.peerDataOperationRequestResponseMessage
                ?.peerDataOperationResult?.[0]
                ?.placeholderMessageResendResponse?.webMessageInfoBytes;

        if (!bytes) continue;

        const decoded = proto.WebMessageInfo.decode(bytes);
        // Processar decoded como mensagem normal
    }
});
```

**Limitação**: Dependia do PDO request ser disparado manualmente, já que o Baileys não fazia isso automaticamente.

### 6.3 Fork rsalcara/InfiniteAPI

@rsalcara criou um fork do Baileys chamado **InfiniteAPI** com funcionalidades extras:

- **CTWA Recovery automático**: `enableCTWARecovery` config option (default: true)
- **Métricas Prometheus**: Para tracking de recuperação CTWA
- **Lógica de fallback**: Se PDO falhar, tenta abordagens alternativas

### 6.4 API Oficial do WhatsApp Business (Cloud API)

A abordagem mais confiável para receber mensagens de anúncios:

- Usa a **API oficial do Meta** (Cloud API ou On-Premises API)
- Não depende de dispositivo vinculado
- Mensagens de anúncios chegam diretamente via webhook
- **Trade-off**: Custo por mensagem, requer aprovação de template, etc.

### 6.5 WPP Connect

O WPP Connect (wppconnect-team) usa abordagem diferente (injeção no WhatsApp Web). Status do suporte CTWA não foi encontrado na pesquisa, mas por usar o mesmo protocolo multi-device, provavelmente enfrenta o mesmo problema.

---

## 7. Dicas de Configuração para Melhorar a Taxa de Sucesso do PDO

### 7.1 whatsmeow — Configuração essencial

```go
import "go.mau.fi/whatsmeow"

client := whatsmeow.NewClient(deviceStore, log)

// ⚠️ OBRIGATÓRIO: Habilitar auto-rerequest do telefone
// Sem isso, NÃO haverá PDO request automático!
client.AutomaticMessageRerequestFromPhone = true

// ✅ Opcional: Reduzir o delay do PDO request (padrão: 5 segundos)
// Para mensagens CTWA (unavailable), já é imediato
// Para falhas de decrypt normais, o delay aplica
whatsmeow.RequestFromPhoneDelay = 3 * time.Second  // Reduzir de 5s para 3s
```

### 7.2 Manter o telefone online

**O fator MAIS IMPORTANTE para o PDO funcionar**:

- O telefone principal DEVE estar online e com conexão ativa ao WhatsApp
- Se o telefone estiver offline, em modo avião, ou com WhatsApp fechado, o PDO **não funcionará**
- Recomendações:
  - Manter o telefone **sempre conectado ao Wi-Fi**
  - Desabilitar **otimização de bateria** para o WhatsApp
  - Usar um telefone dedicado que fica sempre ligado e conectado
  - Considerar usar um telefone Android barato como "servidor" dedicado

### 7.3 Evitar desconexões do dispositivo vinculado

- Não use identificação de browser `WebClient` (bug corrigido no Evolution API PR #2332)
- Use o modo nativo Multi-Device
- Mantenha a sessão ativa com heartbeats regulares
- Não tenha muitas sessões de dispositivos vinculados simultâneas

### 7.4 Tratar eventos UndecryptableMessage (whatsmeow)

```go
client.AddEventHandler(func(evt interface{}) {
    switch v := evt.(type) {
    case *events.UndecryptableMessage:
        if v.IsUnavailable {
            log.Printf("Mensagem CTWA/unavailable detectada: %s (tipo: %s)", 
                v.Info.ID, v.UnavailableType)
            // O PDO request já foi enviado automaticamente
            // A mensagem real chegará via events.Message com UnavailableRequestID
        } else {
            log.Printf("Falha de decrypt: %s (tentativa %d)", 
                v.Info.ID, v.DecryptFailMode)
        }
    
    case *events.Message:
        if v.UnavailableRequestID != "" {
            log.Printf("✅ Mensagem recuperada via PDO! ID: %s (request: %s)",
                v.Info.ID, v.UnavailableRequestID)
        }
        // Processar mensagem normalmente
    }
})
```

### 7.5 Ajuste do timeout

Se o telefone é lento (rede ruim, aparelho antigo):

```go
// Aumentar timeout de IQ requests (padrão pode ser insuficiente)
// Requer ajuste no código ou fork
// O whatsmeow usa 75 segundos por padrão para IQ requests
```

### 7.6 Monitoramento

Implemente logging/métricas para:
- Quantidade de mensagens `UndecryptableMessage` com `IsUnavailable: true`
- Quantidade de mensagens recuperadas via PDO (`UnavailableRequestID != ""`)
- Taxa de sucesso PDO (recuperadas / solicitadas)
- Tempo médio de resposta PDO
- Falhas de PDO (timeout, telefone offline)

---

## 8. É Possível Forçar o Telefone a Responder Mais Rápido?

### 8.1 Resposta curta: **Não diretamente**

Não existe nenhum mecanismo documentado ou descoberto pela comunidade para forçar o telefone a processar e responder ao PDO request mais rapidamente. O fluxo depende de:

1. O telefone receber a mensagem PDO (depende da conectividade)
2. O WhatsApp no telefone processar o request (depende do sistema operacional)
3. O telefone enviar a resposta (depende da conectividade)

### 8.2 O que pode ser feito para minimizar latência

| Fator | Ação | Impacto |
|-------|------|---------|
| Conectividade do telefone | Manter em Wi-Fi estável + 4G como backup | Alto |
| Otimização de bateria | Desabilitar para WhatsApp | Alto |
| Delay do PDO request | Reduzir `RequestFromPhoneDelay` | Médio (só para decrypt failures, não CTWA) |
| Modo CTWA no whatsmeow | Já é `immediate` por padrão | — (já otimizado) |
| Sistema operacional | Android preferivelmente (menos restrições de background) | Médio |
| Aparelho | Usar telefone com bom processador e RAM | Baixo-Médio |
| Dedup window (Baileys) | O PR #2334 usa 2 segundos — não reduzir | Baixo (anti-spam) |

### 8.3 Tempos observados na prática

Com base nas discussões da comunidade:

- **Melhor caso**: 2-5 segundos (telefone online, boa conexão)
- **Caso típico**: 5-15 segundos
- **Pior caso**: Timeout (telefone offline ou lento)
- **Sem PDO**: Mensagem nunca chega ao dispositivo vinculado

### 8.4 Abordagem de fallback

Se o PDO falhar (timeout), as opções são:

1. **Re-tentar o PDO**: Enviar novo request após delay
2. **Logging**: Registrar a falha para análise
3. **Notificação**: Alertar o operador que há mensagens perdidas
4. **API oficial**: Usar Cloud API do WhatsApp como fallback para leads de ads

---

## 9. Tabela Comparativa

| Aspecto | whatsmeow (Go) | Baileys (TypeScript) | Evolution API |
|---------|----------------|---------------------|---------------|
| **Suporte CTWA/PDO** | ✅ Desde Ago/2023 | ✅ PR #2334 (Jun/2026) | ❌ Depende do Baileys |
| **Configuração necessária** | `AutomaticMessageRerequestFromPhone = true` | Nenhuma (automático) | Aguardar atualização |
| **Detecção unavailable** | `<unavailable>` sem `<enc>` | `decryptables === 0` | N/A |
| **Delay PDO (CTWA)** | Imediato | 2s (dedup window) | N/A |
| **Delay PDO (decrypt fail)** | 5s (configurável) | — | N/A |
| **Cache metadados** | Via `ParseWebMessage` | ✅ Cache explícito (LID, pushName) | N/A |
| **Max retries** | 5 | — | N/A |
| **Evento de mensagem recuperada** | `events.Message` com `UnavailableRequestID` | `messages.upsert` normal | N/A |
| **Filtros de exclusão** | Não documentados | bot_unavailable, hosted_unavailable, view_once, >14 dias | N/A |

---

## 10. Referências

### Código-fonte whatsmeow
- [message.go](https://github.com/tulir/whatsmeow/blob/main/message.go) — Decifragem, detecção unavailable, handlePlaceholderResendResponse
- [retry.go](https://github.com/tulir/whatsmeow/blob/main/retry.go) — sendRetryReceipt, delayedRequestMessageFromPhone, immediateRequestMessageFromPhone
- [send.go](https://github.com/tulir/whatsmeow/blob/main/send.go) — BuildUnavailableMessageRequest, SendPeerMessage
- [client.go](https://github.com/tulir/whatsmeow/blob/main/client.go) — AutomaticMessageRerequestFromPhone, pendingPhoneRerequests
- [Commit fe67855](https://github.com/tulir/whatsmeow/commit/fe67855) — Implementação original do auto re-request from phone

### Issues/PRs whatsmeow
- [Issue #438](https://github.com/tulir/whatsmeow/issues/438) — Undecryptable messages
- [Issue #922](https://github.com/tulir/whatsmeow/issues/922) — Related undecryptable issue
- [Discussion #739](https://github.com/tulir/whatsmeow/discussions/739) — "Unavailable message from Facebook Ads"

### Baileys
- [**PR #2334 (MERGED)**](https://github.com/WhiskeySockets/Baileys/pull/2334) — Fix definitivo para CTWA
- [PR #2292 (CLOSED)](https://github.com/WhiskeySockets/Baileys/pull/2292) — Tentativa anterior (zapperapi)
- [PR #2287 (CLOSED)](https://github.com/WhiskeySockets/Baileys/pull/2287) — Primeira tentativa (rsalcara)
- [Issue #1723 (CLOSED por #2334)](https://github.com/WhiskeySockets/Baileys/issues/1723) — Issue original CTWA, 23+ comentários

### Evolution API
- [Issue #2243](https://github.com/EvolutionAPI/evolution-api/issues/2243) — "Evolution não responde aos anúncios de ads da meta"
- [Issue #2078](https://github.com/EvolutionAPI/evolution-api/issues/2078) — CTWA parcial v2.3.4
- [PR #2332](https://github.com/EvolutionAPI/evolution-api/pull/2332) — Multi-Device Fix

---

*Documento gerado com base em análise direta do código-fonte e issues/PRs dos repositórios oficiais.*
