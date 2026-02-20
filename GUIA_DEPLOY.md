# Guia de Deploy — AgenteZap

## ⚠️ REGRA MAIS IMPORTANTE ⚠️

**NUNCA faça deploy do Worker diretamente.** O Worker roda as sessões WhatsApp de 54+ clientes. Se reiniciar desnecessariamente, TODAS as sessões caem e precisam reconectar.

## Arquitetura: 2 Serviços

| Serviço | Railway | O que faz | Auto-deploy? |
|---------|---------|-----------|--------------|
| **Proxy** (vvvv-proxy) | `8a3c5692` | Recebe requests e repassa pro Worker | ✅ Sim (git push) |
| **Worker** (vvvv) | `5c181da5` | App completo + WhatsApp + Banco | ❌ Não (protegido) |

O `railway up` está configurado para deploiar o **Proxy** (seguro).

## Como fazer Deploy

### Mudanças no Frontend (telas, CSS, componentes React)
```bash
git add . && git commit -m "descrição" && git push origin main
```
- O Proxy deploya automaticamente (~2 min)
- O Worker NÃO reinicia
- Sessões WhatsApp NÃO são afetadas
- `railway up` também funciona (vai pro Proxy)

### Mudanças no Backend (rotas, lógica, banco de dados)
```bash
git add . && git commit -m "descrição"
node deploy-worker.mjs
```
- O script cria trigger temporário, faz push, monitora deploy, e remove trigger
- Worker reinicia mas sessões WhatsApp **reconectam automaticamente** (auth files no volume /data)
- Proxy também deploya (pelo push)

### ⛔ O que NÃO fazer
- **NÃO** mude `SERVICE_MODE` em nenhum serviço
- **NÃO** delete o volume `/data` do Worker (tem auth files de 54+ sessões)
- **NÃO** faça `railway up` linkado ao Worker (o .railway/config.json já aponta pro Proxy)
- **NÃO** mexa nos arquivos `server/proxy.ts` ou `server/full-app.ts` sem necessidade
- **NÃO** altere código relacionado ao Baileys/WhatsApp sem saber o que está fazendo

## Variáveis de Ambiente Importantes

| Variável | Worker | Proxy |
|----------|--------|-------|
| `SERVICE_MODE` | worker | proxy |
| `PORT` | 5000 | 8080 |
| `WA_WORKER_URL` | — | http://vvvv.railway.internal:5000 |
| `SESSIONS_DIR` | /data/whatsapp-sessions | — |
| `RAILWAY_BUILDER` | — | NIXPACKS |

## Para IAs/Agentes de Código (OpenClaw, Cursor, etc.)

Se você é uma IA fazendo alterações neste projeto:

1. **Alterações seguras** (frontend, componentes, CSS): faça `git push origin main` ou `railway up`
2. **Alterações no backend**: use `node deploy-worker.mjs` após o commit
3. **NÃO mexa em**: `server/proxy.ts`, `server/full-app.ts`, `server/index.ts`, conexões WhatsApp/Baileys
4. **NUNCA** faça `railway link` para o serviço worker (ID: 5c181da5)
5. O `.railway/config.json` DEVE apontar para serviceId `8a3c5692-67d5-4886-a756-18c39f6b2afd` (Proxy)

## IDs dos Serviços (referência)

- Project: `ad92eb6d-31d4-45b2-9b78-56898787e384`
- Worker: `5c181da5-0dd2-4883-8838-4e85604f2941` (NÃO TOCAR)
- Proxy: `8a3c5692-67d5-4886-a756-18c39f6b2afd` (deploy seguro)
- Environment: `ae4fcb07-80c5-457b-a0e4-64faccecde44`
