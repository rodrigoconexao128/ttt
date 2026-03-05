# 📋 TASKLIST COMPLETA - Mídias no Chat de Conversas

## 📊 Análise do Estado Atual

### ✅ O QUE FUNCIONA:
1. **Áudios do cliente** - Baixando corretamente com URL base64
2. **Áudios do dono** - Baixando e salvando corretamente  
3. **Imagens do cliente** - Baixando corretamente com URL base64
4. **Transcrição de áudios** - Funcionando automaticamente
5. **Player de áudio básico** - Componente MessageAudio existe

### ❌ O QUE NÃO FUNCIONA:

#### 1. **Vídeos (CRÍTICO)**
- **Problema**: Vídeos NÃO estão sendo baixados - `media_url` é NULL
- **Localização**: `server/whatsapp.ts` linhas 1662-1664 e 2019-2033
- **Causa**: Falta o download do vídeo na função handleOutgoingMessage (mensagens do dono)
- **Impacto**: Vídeos enviados pelo dono não aparecem na interface

#### 2. **Documentos/PDFs (CRÍTICO)**
- **Problema**: Documentos NÃO estão sendo baixados - apenas nome do arquivo
- **Localização**: `server/whatsapp.ts` linhas 2035-2038
- **Causa**: Não há chamada `downloadMediaMessage` para documentos
- **Impacto**: PDFs e outros documentos não podem ser visualizados/baixados

#### 3. **Imagens do Dono (PARCIAL)**
- **Problema**: Imagens enviadas pelo dono (fromMe=true) às vezes não têm URL
- **Localização**: `server/whatsapp.ts` linhas 1655-1658
- **Causa**: Falta download de imagem na função handleOutgoingMessage

#### 4. **Player de Áudio estilo WhatsApp**
- **Problema**: O player existe mas não tem visual idêntico ao WhatsApp
- **Componente**: `client/src/components/message-audio.tsx`
- **Requisitos**: Waveform visual, botão play circular verde, onda animada

---

## 🔧 TAREFAS A EXECUTAR

### FASE 1: Backend - Correção do Download de Mídias

#### Task 1.1: Corrigir download de VÍDEOS do dono ⏳
**Arquivo**: `server/whatsapp.ts`
**Linha**: ~1662-1664
**Ação**: Adicionar `downloadMediaMessage` para vídeos na função `handleOutgoingMessage`

#### Task 1.2: Corrigir download de IMAGENS do dono ⏳
**Arquivo**: `server/whatsapp.ts`  
**Linha**: ~1655-1658
**Ação**: Adicionar `downloadMediaMessage` para imagens na função `handleOutgoingMessage`

#### Task 1.3: Corrigir download de DOCUMENTOS do cliente ⏳
**Arquivo**: `server/whatsapp.ts`
**Linha**: ~2035-2038
**Ação**: Adicionar `downloadMediaMessage` para documentos e salvar com URL

#### Task 1.4: Corrigir download de DOCUMENTOS do dono ⏳
**Arquivo**: `server/whatsapp.ts`
**Linha**: ~1680-1684
**Ação**: Adicionar `downloadMediaMessage` para documentos

---

### FASE 2: Frontend - Melhorar Componentes de Mídia

#### Task 2.1: Criar componente MessageDocument para PDFs/arquivos ⏳
**Arquivo**: `client/src/components/message-document.tsx` (NOVO)
**Funcionalidades**:
- Preview de PDF inline se possível
- Ícone indicando tipo de arquivo
- Botão de download
- Nome do arquivo visível

#### Task 2.2: Melhorar MessageAudio para estilo WhatsApp ⏳
**Arquivo**: `client/src/components/message-audio.tsx`
**Melhorias**:
- Botão play circular verde (estilo WhatsApp)
- Waveform visual (onda sonora)
- Animação durante reprodução
- Velocidade de reprodução (1x, 1.5x, 2x)

#### Task 2.3: Criar componente MessageVideo ⏳
**Arquivo**: `client/src/components/message-video.tsx` (NOVO)
**Funcionalidades**:
- Player de vídeo inline
- Controles de reprodução
- Fullscreen
- Download

#### Task 2.4: Atualizar chat-area.tsx para usar novos componentes ⏳
**Arquivo**: `client/src/components/chat-area.tsx`
**Ações**:
- Importar MessageDocument
- Importar MessageVideo melhorado
- Atualizar renderização de documentos

---

### FASE 3: Testes

#### Task 3.1: Testar envio de PDF pelo WhatsApp ⏳
#### Task 3.2: Testar envio de vídeo pelo WhatsApp ⏳
#### Task 3.3: Testar envio de imagem pelo dono ⏳
#### Task 3.4: Verificar player de áudio no frontend ⏳

---

## 📝 Notas Técnicas

### Baileys - downloadMediaMessage
```typescript
import { downloadMediaMessage } from "@whiskeysockets/baileys";

// Para baixar mídia:
const buffer = await downloadMediaMessage(waMessage, "buffer", {});
const mediaUrl = `data:${mimetype};base64,${buffer.toString("base64")}`;
```

### Tipos de Mídia Suportados pelo Baileys:
- `imageMessage` - Imagens (JPG, PNG, etc)
- `audioMessage` - Áudios (OGG, MP3)
- `videoMessage` - Vídeos (MP4)
- `documentMessage` - Documentos (PDF, DOC, etc)
- `stickerMessage` - Stickers (WebP)

### Schema do Banco (messages):
```sql
media_type VARCHAR(50)      -- 'image', 'audio', 'video', 'document'
media_url TEXT              -- URL ou base64 data
media_mime_type VARCHAR(100) -- Ex: 'application/pdf', 'video/mp4'
media_duration INTEGER      -- Duração em segundos (audio/video)
media_caption TEXT          -- Legenda
```

---

## 🎯 Ordem de Execução Recomendada

1. ✅ Analisar código atual (FEITO)
2. ✅ Verificar banco de dados (FEITO)
3. ⏳ Task 1.1 - Vídeos do dono
4. ⏳ Task 1.2 - Imagens do dono
5. ⏳ Task 1.3 - Documentos do cliente
6. ⏳ Task 1.4 - Documentos do dono
7. ⏳ Task 2.1 - Componente MessageDocument
8. ⏳ Task 2.2 - Melhorar MessageAudio
9. ⏳ Task 2.3 - Componente MessageVideo
10. ⏳ Task 2.4 - Atualizar chat-area
11. ⏳ Testes completos

---

**Data**: 09/01/2026
**Status**: Em andamento
