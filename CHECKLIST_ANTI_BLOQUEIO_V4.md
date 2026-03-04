# 🛡️ CHECKLIST ANTI-BLOQUEIO WHATSAPP v4.0 - Janeiro 2026

## 📋 CHECKLIST DE PROTEÇÃO COMPLETA (25 ITENS)

### ✅ DELAYS E TIMING

| # | Item | Implementado | Descrição |
|---|------|-------------|-----------|
| 1 | Delay mínimo 8-15 segundos | ✅ | Aumentado de 5-10s para 8-15s entre mensagens |
| 2 | Variação gaussiana | ✅ | Delay usa distribuição gaussiana (mais natural que uniforme) |
| 3 | Delay primeira mensagem | ✅ | 20-40s para primeira msg do dia/sessão |
| 4 | Nunca mesmo segundo | ✅ | Sistema garante que nunca envia duas msgs no mesmo segundo |
| 5 | Cooldown mensagem manual do dono | ✅ | 15s de espera após dono enviar manualmente |
| 6 | Sistema de lotes | ✅ | Após 8 msgs, pausa de 2 minutos |
| 7 | Delays em horário de pico | ✅ | 50% mais delay das 8-12h e 18-22h |

### ✅ COMPORTAMENTO HUMANO

| # | Item | Implementado | Descrição |
|---|------|-------------|-----------|
| 8 | Simular "digitando..." | ✅ | Envia presença "composing" antes de cada msg |
| 9 | Duração proporcional | ✅ | Tempo de digitação proporcional ao tamanho da msg |
| 10 | Pausas sequenciais | ✅ | Delay entre mensagens múltiplas |
| 11 | Mínimo de resposta | ✅ | Nunca responde em menos de 3-5 segundos |
| 12 | Variação no padrão | ✅ | Delays variáveis para não ser previsível |

### ✅ RATE LIMITING POR CONTATO

| # | Item | Implementado | Descrição |
|---|------|-------------|-----------|
| 13 | Máximo msgs/hora por contato | ✅ | Limite de 10 mensagens/hora por contato |
| 14 | Máximo msgs/dia por contato | ✅ | Limite de 30 mensagens/dia por contato |
| 15 | Cooldown mesmo contato | ✅ | 20s mínimo entre msgs para mesmo contato |
| 16 | Detector de spam | ✅ | Deduplicação bloqueia msgs similares em 5 min |

### ✅ PROTEÇÃO DO CANAL

| # | Item | Implementado | Descrição |
|---|------|-------------|-----------|
| 17 | Limite msgs/hora global | ✅ | Máximo 60 mensagens/hora por WhatsApp |
| 18 | Limite msgs/dia global | ✅ | Máximo 500 mensagens/dia por WhatsApp |
| 19 | Detecção bloqueio iminente | ✅ | 3 erros consecutivos ativa Safe Mode |
| 20 | Safe Mode automático | ✅ | Pausa 30 minutos após erros consecutivos |

### ✅ INTEGRAÇÃO COM DONO

| # | Item | Implementado | Descrição |
|---|------|-------------|-----------|
| 21 | Rastrear mensagem manual | ✅ | Sistema registra quando dono envia manualmente |
| 22 | Respeitar delay após manual | ✅ | Bot espera 15s após dono enviar |
| 23 | Contabilizar no rate limit | ✅ | Mensagens manuais contam no limite |
| 24 | Sincronizar fila | ✅ | Fila única inclui msgs do bot e do dono |

### ✅ MONITORAMENTO

| # | Item | Implementado | Descrição |
|---|------|-------------|-----------|
| 25 | Log detalhado | ✅ | Todas decisões de envio são logadas |

---

## ⚙️ CONFIGURAÇÕES DO SISTEMA

```typescript
// Delays entre mensagens
MIN_DELAY_MS: 8000           // 8 segundos mínimo
MAX_DELAY_MS: 15000          // 15 segundos máximo
RANDOM_EXTRA_DELAY_MS: 5000  // 0-5s extras aleatórios

// Primeira mensagem
FIRST_MESSAGE_DELAY_MS: 20000     // 20s primeira msg
FIRST_MESSAGE_MAX_EXTRA_MS: 20000 // +0-20s extra

// Mensagem manual do dono
OWNER_MANUAL_COOLDOWN_MS: 15000   // 15s após dono enviar

// Mesmo contato
SAME_CONTACT_MIN_DELAY_MS: 20000  // 20s entre msgs para mesmo contato

// Sistema de lotes
BATCH_SIZE: 8                     // Após 8 envios
BATCH_PAUSE_MS: 120000            // Pausa de 2 minutos

// Rate limiting por contato
MAX_MESSAGES_PER_CONTACT_HOUR: 10  // 10 msgs/hora por contato
MAX_MESSAGES_PER_CONTACT_DAY: 30   // 30 msgs/dia por contato

// Rate limiting global
MAX_MESSAGES_PER_HOUR: 60          // 60 msgs/hora total
MAX_MESSAGES_PER_DAY: 500          // 500 msgs/dia total

// Horários de pico
PEAK_HOURS: [8-12, 18-22]          // Delays 50% maiores
PEAK_HOUR_MULTIPLIER: 1.5

// Typing (digitando)
TYPING_MIN_MS: 2000                // 2s mínimo digitando
TYPING_MAX_MS: 8000                // 8s máximo digitando
TYPING_CHARS_PER_SECOND: 30        // Velocidade simulada

// Safe Mode
CONSECUTIVE_ERRORS_THRESHOLD: 3    // 3 erros = safe mode
SAFE_MODE_DURATION_MS: 1800000     // 30 minutos
```

---

## 📊 ARQUIVOS MODIFICADOS

| Arquivo | Descrição |
|---------|-----------|
| `server/antiBanProtectionService.ts` | **NOVO** - Serviço central de proteção anti-ban |
| `server/messageQueueService.ts` | Atualizado para usar delays v4.0 e integrar com antiBanProtectionService |
| `server/messageDeduplicationService.ts` | Adicionado 'queue' como MessageSource válido |
| `server/whatsapp.ts` | Integração com registro de mensagens manuais + typing |

---

## 🚨 MOTIVOS COMUNS DE BLOQUEIO E SOLUÇÕES

### 1. Envio muito rápido após mensagem manual do dono
**Problema**: Bot respondia instantaneamente após dono enviar manualmente
**Solução**: Cooldown de 15 segundos após mensagem manual do dono

### 2. Muitas mensagens em sequência
**Problema**: 10+ mensagens em menos de 1 minuto
**Solução**: Sistema de lotes com pausa de 2 minutos após 8 mensagens

### 3. Padrão de bot detectável
**Problema**: Respostas instantâneas e delays consistentes
**Solução**: Variação gaussiana + simulação de digitação + delays em pico

### 4. Mesma mensagem/contato muito frequente
**Problema**: Spam para mesmo contato
**Solução**: Rate limiting de 10 msgs/hora e 30 msgs/dia por contato

### 5. Volume total muito alto
**Problema**: Centenas de mensagens por hora
**Solução**: Limite global de 60/hora e 500/dia

---

## 📈 MÉTRICAS DE MONITORAMENTO

O sistema agora registra e disponibiliza:

- Mensagens por hora/dia por canal
- Mensagens por contato
- Status do Safe Mode
- Erros consecutivos
- Última mensagem manual do dono
- Tempo restante de cooldowns

---

## 🔧 COMANDOS ÚTEIS

```bash
# Ver logs de anti-ban
railway logs --filter "ANTI-BAN"

# Ver estatísticas
railway logs --filter "stats"

# Ver Safe Mode
railway logs --filter "SAFE MODE"
```

---

## ⚠️ IMPORTANTE

1. **NUNCA desabilite os delays** - Os valores foram calibrados para segurança
2. **Monitore os logs** - Busque por "ANTI-BAN" para ver decisões do sistema
3. **Se houver bloqueio**:
   - Aguarde o tempo de restrição do WhatsApp
   - Verifique os logs para entender o padrão
   - Considere aumentar ainda mais os delays

---

## 📅 Histórico de Versões

| Versão | Data | Mudanças |
|--------|------|----------|
| v4.0 | Jan/2026 | Sistema completo anti-ban com rate limiting, safe mode, typing |
| v3.0 | - | Delays 5-10s, lotes de 10 msgs |
| v2.0 | - | Fila por canal |
| v1.0 | - | Delay básico |
