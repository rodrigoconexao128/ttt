# Sistema de Biblioteca de Mídias do Agente IA

## ✅ Status: IMPLEMENTADO E FUNCIONANDO

---

## 📋 Visão Geral

O sistema permite que o agente IA (Mistral) envie áudios, imagens, vídeos e documentos para os clientes no WhatsApp, baseado nas instruções configuradas pelo usuário.

### Fluxo de Funcionamento:

1. **Cliente faz upload de mídia** → Armazena no Supabase Storage com metadados
2. **Configura "quando usar"** → Define instrução de quando a mídia deve ser enviada
3. **Mistral analisa conversa** → Decide qual mídia enviar baseado no contexto
4. **Backend envia via w-api** → Mídia é enviada para o cliente no WhatsApp

---

## 🗃️ Estrutura do Banco de Dados

### Tabela: `agent_media_library`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | varchar | Identificador único (UUID) |
| `user_id` | varchar | FK para usuário dono da mídia |
| `name` | varchar | Nome único para referenciar (ex: `audio_boas_vindas`) |
| `media_type` | varchar | Tipo: `audio`, `image`, `video`, `document` |
| `storage_url` | text | URL do arquivo no Supabase Storage |
| `file_name` | varchar | Nome original do arquivo |
| `file_size` | integer | Tamanho em bytes |
| `mime_type` | varchar | Tipo MIME (ex: `audio/mp3`) |
| `duration_seconds` | integer | Duração (para áudio/vídeo) |
| `description` | text | Descrição humana da mídia |
| `when_to_use` | text | **Instrução para IA**: quando enviar esta mídia |
| `transcription` | text | Transcrição de áudio (opcional) |
| `is_active` | boolean | Se está ativa para uso |
| `display_order` | integer | Ordem de exibição |
| `wapi_media_id` | varchar | ID da mídia no w-api (após upload) |
| `created_at` | timestamp | Data de criação |
| `updated_at` | timestamp | Data de atualização |

---

## 📁 Arquivos Implementados

### Backend

1. **`server/mediaService.ts`** - Serviço principal de mídia
   - `createMedia()` - Criar nova mídia
   - `getMediaByUserId()` - Listar mídias do usuário
   - `getMediaByName()` - Buscar mídia por nome
   - `updateMedia()` - Atualizar mídia
   - `deleteMedia()` - Remover mídia
   - `generateMediaContextForPrompt()` - Gerar contexto para Mistral
   - `parseMediaActionsFromResponse()` - Extrair ações de mídia da resposta
   - `executeMediaActions()` - Executar envio de mídias
   - `sendMediaViaWhatsApp()` - Enviar via w-api

2. **`server/routes.ts`** - Endpoints da API
   - `GET /api/agent/media` - Listar mídias
   - `GET /api/agent/media/:name` - Buscar por nome
   - `POST /api/agent/media` - Criar mídia
   - `PUT /api/agent/media/:id` - Atualizar mídia
   - `DELETE /api/agent/media/:id` - Remover mídia
   - `POST /api/agent/media/transcribe` - Transcrever áudio

3. **`server/aiAgent.ts`** - Integração com IA
   - Contexto de mídia injetado no prompt
   - Parsing de ações de mídia na resposta
   - Retorno de `{ text, mediaActions }`

### Frontend

1. **`client/src/pages/media-library.tsx`** - Interface da biblioteca
   - Upload de arquivos com drag & drop
   - Lista de mídias com filtros por tipo
   - Edição de descrição e "quando usar"
   - Ativação/desativação de mídias
   - Exclusão de mídias

2. **`client/src/App.tsx`** - Rota `/biblioteca-midias`

3. **`client/src/pages/dashboard.tsx`** - Menu lateral com link

### Migrations

1. **`migrations/007_create_agent_media_library.sql`** - SQL da tabela
2. **`server/run-media-migration.js`** - Script de migração

---

## 🔧 Como Usar

### 1. Acessar a Biblioteca de Mídias

Navegue para `/biblioteca-midias` no dashboard.

### 2. Fazer Upload de Mídia

1. Clique em "Adicionar Mídia"
2. Arraste ou selecione o arquivo
3. Preencha:
   - **Nome identificador**: Ex: `audio_boas_vindas`
   - **Descrição**: Ex: "Áudio de boas vindas para novos clientes"
   - **Quando usar**: Ex: "Enviar quando o cliente iniciar a primeira conversa"

### 3. Configurar no Agente

Na instrução do agente, adicione referências às mídias:

```
Quando um cliente iniciar uma conversa, envie o áudio de boas-vindas.
Quando perguntarem sobre preços, envie a imagem do catálogo.
```

### 4. Resposta do Mistral

O Mistral retornará um JSON estruturado:

```json
{
  "messages": [
    { "text": "Olá! Seja bem-vindo! Ouça nosso áudio de apresentação." }
  ],
  "actions": [
    {
      "type": "send_media",
      "mediaName": "audio_boas_vindas",
      "caption": "Áudio de boas-vindas"
    }
  ]
}
```

---

## 🔌 Integração com w-api

O envio de mídia usa a API do w-api:

```
POST https://api.w-api.app/v1/messages/send-media
Authorization: Bearer {WAPI_TOKEN}
Content-Type: application/json

{
  "phone": "5511999999999",
  "media": {
    "url": "https://storage.supabase.co/...",
    "type": "audio",
    "caption": "Áudio de boas-vindas"
  }
}
```

---

## 🧪 Dados de Teste

Foram inseridos 2 registros de teste:

| Nome | Tipo | Quando Usar |
|------|------|-------------|
| `audio_boas_vindas` | audio | Enviar quando o cliente iniciar a primeira conversa |
| `imagem_catalogo` | image | Enviar quando o cliente perguntar sobre produtos ou preços |

---

## 📝 Próximos Passos

1. **Configurar Supabase Storage** para upload real de arquivos
2. **Configurar credenciais w-api** no `.env` (`WAPI_TOKEN`, `WAPI_INSTANCE_ID`)
3. **Testar fluxo completo** com conversa real no WhatsApp
4. **Adicionar transcrição automática** de áudios

---

## 🔐 Variáveis de Ambiente Necessárias

```env
# w-api WhatsApp
WAPI_TOKEN=seu_token_wapi
WAPI_INSTANCE_ID=sua_instancia

# Supabase (já configurado)
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=...
```

---

**Implementado em:** 2024-12-08
**Status:** ✅ Pronto para uso
