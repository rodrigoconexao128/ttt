# 🔐 PERSISTIR SESSÕES DO WHATSAPP NO RAILWAY

## Problema
As sessões do WhatsApp (arquivos `auth_*`) são perdidas a cada deploy porque estão sendo salvas no diretório efêmero do container.

## Solução: Volume Persistente

### ✅ 1. Volume Já Criado

Volume configurado:
- **Nome**: `vvvv-volume`
- **Mount Path**: `/data`
- **Status**: Online
- **Tamanho**: 500 MB

### 2. Adicionar Variável de Ambiente (FALTA FAZER)

1. No Railway, vá em **Variables** (não é "Volumes", é a aba ao lado)
2. Clique em **"+ New Variable"**
3. Adicione:
   - **Variable Name**: `SESSIONS_DIR`
   - **Value**: `/data/whatsapp-sessions`
4. Clique em **"Add"**

### 3. Redeploy (Depois de Adicionar a Variável)

Após criar o volume e adicionar a variável:
1. Vá em **Deployments**
2. Clique em **"Redeploy"** no último deploy

## Como Funciona

O código já está preparado para usar volumes:

```typescript
// server/whatsapp.ts linha 131
const SESSIONS_BASE = process.env.SESSIONS_DIR || "./";
```

- **Sem SESSIONS_DIR**: Salva em `./` (efêmero, perde a cada deploy)
- **Com SESSIONS_DIR**: Salva em `/data/whatsapp-sessions` (volume persistente)

## Verificar se Está Funcionando

Após o redeploy:

1. Conecte o WhatsApp normalmente
2. Faça um novo deploy (push para GitHub)
3. **A sessão deve ser mantida** - não vai pedir QR Code novamente

## Estrutura dos Arquivos de Sessão

No volume serão salvos:
```
/data/whatsapp-sessions/
  auth_[userId]/
    creds.json
    app-state-sync-*.json
  auth_admin_[adminId]/
    creds.json
    app-state-sync-*.json
```

## Backup Manual (Opcional)

Para fazer backup das sessões via Railway CLI:

```bash
railway volume list
railway volume backup whatsapp-sessions-volume
```

## Troubleshooting

### Sessão ainda está sendo perdida?

1. Verifique se o volume foi criado corretamente
2. Verifique se a variável `SESSIONS_DIR` está definida
3. Cheque os logs para confirmar o caminho:
   ```
   Railway logs -> buscar por "SESSIONS_BASE"
   ```

### Erro de permissão

Se houver erro de escrita no volume:
1. O Railway geralmente configura permissões automaticamente
2. Se persistir, pode ser necessário ajustar no script de inicialização

## Alternativa: Banco de Dados

Se volumes não estiverem disponíveis no seu plano Railway, você pode:

1. Salvar as credenciais no Supabase/PostgreSQL (mais complexo)
2. Usar serviço externo como S3/R2 para armazenar sessões

Mas **volumes são a solução recomendada** e mais simples.
