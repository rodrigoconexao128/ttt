# 📘 Guia de Deploy - Railway (AgenteZap)

## 🏗️ Arquitetura de 2 Serviços

O sistema roda em **2 serviços** separados no Railway:

| Serviço | ID | Função | Volume | Auto-Deploy |
|---------|-----|--------|--------|-------------|
| **Proxy** (vvvv-proxy) | `8a3c5692` | Proxy reverso, recebe tráfego externo | ❌ Sem volume | ✅ Sim (via `git push`) |
| **Worker** (vvvv) | `5c181da5` | App completo + sessões WhatsApp | ✅ `/data` | ❌ Não (manual via script) |

### Por que 2 serviços?
- **Proxy** pode ser atualizado a qualquer momento sem afetar conexões WhatsApp
- **Worker** mantém volume `/data` com sessões WhatsApp persistentes
- Conexões WhatsApp ficam ATIVAS mesmo durante deploy do Proxy

---

## 🚀 Deploy do PROXY (seguro, pode fazer a qualquer momento)

O Proxy é linkado no `.railway/config.json`. Deploy é seguro e **NÃO afeta conexões WhatsApp**.

### Método 1: Git Push (Recomendado - Auto-Deploy)
```powershell
cd "C:\Users\Windows\Downloads\agentezap correto\vvvv"
git add -A
git commit -m "sua mensagem"
git push origin main
# ✅ Proxy deploya automaticamente em ~30s
```

### Método 2: Railway Up (Manual)
```powershell
cd "C:\Users\Windows\Downloads\agentezap correto"   # RAIZ do repo (NÃO vvvv/)
railway up
# ✅ Deploya apenas o Proxy (~1-2 min)
```

> ⚠️ O `railway up` deve ser executado da **RAIZ** (`agentezap correto/`), NÃO de dentro de `vvvv/`.

---

## 🔧 Deploy do WORKER (use com cuidado)

O Worker **NÃO** tem auto-deploy. Deploya apenas via script dedicado:

```powershell
cd "C:\Users\Windows\Downloads\agentezap correto\vvvv"
node deploy-worker.mjs
# ⏳ Demora ~2-3 minutos
# Sessões WhatsApp reconectam automaticamente após restart (~30s-2min)
```

### Quando deploiar o Worker?
- Mudanças em `server/*.ts` (rotas, WhatsApp, middleware, etc.)
- Mudanças no frontend (o Worker serve os arquivos estáticos)
- Mudanças em schemas/migrations

### Quando NÃO precisa deploiar o Worker?
- O Proxy auto-deploy via `git push` é suficiente quando a mudança é apenas no proxy

---

## ⚠️ REGRAS CRUCIAIS

1. **`railway up` = PROXY APENAS** → Seguro, não afeta conexões WhatsApp
2. **`node deploy-worker.mjs` = WORKER** → Reinicia sessões (reconectam em ~30s-2min)
3. **NUNCA** execute `railway up` de dentro de `vvvv/` (erro 404)
4. **Auto-deploy do Worker está DESLIGADO** por design — evita restarts acidentais
5. **Volume `/data`** persiste entre deploys — sessões WhatsApp sobrevivem

---

## 📂 Estrutura de Configuração

```
agentezap correto/              ← RAIZ (railway up AQUI para proxy)
├── .railway/
│   └── config.json             ← Linkado ao PROXY (8a3c5692)
├── railway.toml                ← rootDirectory = "vvvv"
├── railway.json                ← Configs de build/deploy
└── vvvv/                       ← Código da aplicação
    ├── deploy-worker.mjs       ← Script de deploy do Worker
    ├── package.json
    ├── server/
    ├── client/
    └── ...
```

---

## 📞 Verificar Status

```powershell
# Ver projeto/serviço linkado
railway status

# Ver logs em tempo real
railway logs

# Ver logs de build do último deploy
railway logs --deployment
```

---

## ✅ Checklist de Deploy

### Para mudanças no frontend ou server:
1. `cd vvvv`
2. `git add -A && git commit -m "mensagem"` 
3. `git push origin main` (proxy auto-deploya)
4. `node deploy-worker.mjs` (se mudou server ou frontend)

### Para mudanças apenas no proxy:
1. `git push origin main` (auto-deploy)

---

**Última atualização**: 2026-02-20
