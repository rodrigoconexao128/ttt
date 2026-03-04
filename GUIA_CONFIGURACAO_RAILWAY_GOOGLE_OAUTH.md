# 🔧 Guia de Configuração: Railway + Google OAuth

## ⚠️ PROBLEMA IDENTIFICADO

**Erro:** `redirect_uri_mismatch` (Google OAuth 400)

**Causa:** A variável `GOOGLE_REDIRECT_URI` no Railway estava configurada incorretamente ou ausente.

---

## ✅ SOLUÇÃO: Configurar Variáveis no Railway

### Passo 1: Acessar Variáveis do Railway

1. Acesse: https://railway.app/
2. Selecione seu projeto **AgentZap**
3. Clique na aba **Variables**

### Passo 2: Adicionar/Corrigir Variáveis

Adicione ou corrija as seguintes variáveis de ambiente:

```bash
GOOGLE_CLIENT_ID=374200700676-ih5t54862m2i5tn3bk1rdf96jm4ujje4.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_REDIRECT_URI=https://agentezap.online/api/google-calendar/callback
```

### Passo 3: Salvar e Aguardar Deploy

- Clique em **Save** ou **Add Variable**
- O Railway fará **redeploy automático**
- Aguarde 2-3 minutos para o deploy completar

---

## 🔐 Configuração no Google Cloud Console

### ⚠️ URI CORRETO (Não usar /scheduling!)

Certifique-se de que o Google Cloud Console tenha **EXATAMENTE** estas URIs:

```
http://localhost:5000/api/google-calendar/callback
https://agentezap.online/api/google-calendar/callback
```

### Como Verificar/Corrigir:

1. Acesse: https://console.cloud.google.com/
2. Selecione seu projeto
3. Vá em **APIs & Services** > **Credentials**
4. Clique no **OAuth 2.0 Client ID** criado
5. Na seção **Authorized redirect URIs**, verifique se as URIs acima estão cadastradas
6. Se necessário, clique em **+ ADD URI** para adicionar
7. **IMPORTANTE:** Remova URIs com `/scheduling` se existirem (estão incorretas!)
8. Clique em **SAVE**

---

## 🧪 Testar Configuração

Após configurar Railway e Google Cloud Console:

1. Acesse: https://agentezap.online/agendamentos
2. Clique em **"Conectar com Google"**
3. Uma janela popup deve abrir solicitando permissões
4. Autorize o acesso
5. Você será redirecionado de volta para `/agendamentos` com sucesso

### ✅ Sucesso
Se você vê a mensagem "Conectado com sucesso" ou o status muda para "Conectado", está funcionando!

### ❌ Erro Persiste
Se ainda aparecer `redirect_uri_mismatch`:

1. Verifique se as variáveis no Railway estão **EXATAMENTE** como acima
2. Verifique se o Google Cloud Console tem as URIs **EXATAMENTE** como acima
3. Aguarde 5 minutos (cache do Google pode demorar)
4. Tente em uma janela anônima do navegador

---

## 📋 Checklist Final

- [ ] `GOOGLE_CLIENT_ID` adicionado no Railway
- [ ] `GOOGLE_CLIENT_SECRET` adicionado no Railway
- [ ] `GOOGLE_REDIRECT_URI` = `https://agentezap.online/api/google-calendar/callback` no Railway
- [ ] URIs corretas cadastradas no Google Cloud Console
- [ ] Deploy do Railway completado com sucesso
- [ ] Teste de conexão realizado em https://agentezap.online/agendamentos
- [ ] Conexão Google Calendar funcionando ✅

---

## 🚨 IMPORTANTE: Erro Comum na Documentação

**❌ URI INCORRETA (encontrada em docs antigas):**
```
https://agentezap.online/api/scheduling/google-calendar/callback
```

**✅ URI CORRETA (usada pelo código):**
```
https://agentezap.online/api/google-calendar/callback
```

**Diferença:** A rota real **NÃO** tem `/scheduling` no meio!

Arquivos corrigidos:
- ✅ `.env`
- ✅ `.env.example`
- ✅ `GUIA_GOOGLE_CALENDAR.md`

---

## 📞 Suporte

Se continuar com problemas, verifique os logs do Railway:

```bash
cd "c:\Users\Windows\Downloads\agentezap correto\vvvv"
railway logs --lines 50
```

Procure por erros relacionados a "GoogleCalendar" ou "OAuth".
