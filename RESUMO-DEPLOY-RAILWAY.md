# GUIA RAPIDO DE DEPLOY - RAILWAY (AgentezZap)

Data: 2026-02-11

## PROBLEMA RESOLVIDO

**Erro que voce teve:**
```
(.venv) PS C:\...\vvvv> railway up
Failed to upload code with status code 404 Not Found
```

**Causa:**
- Executou railway up de dentro de vvvv/
- Railway configurado com rootDirectory="vvvv" na RAIZ
- Resultado: Railway procurou vvvv/vvvv/ (nao existe!)

**Solucao:**
- SEMPRE executar da RAIZ do repositorio
- OU usar script deploy.ps1

---

## COMO FAZER DEPLOY (3 OPCOES)

### OPCAO 1: Script Automatico (RECOMENDADO) ✅

De QUALQUER lugar, execute:

```powershell
cd "C:\Users\Windows\Downloads\agentezap correto\vvvv"
.\deploy.ps1
```

Pronto! O script faz tudo automaticamente.

### OPCAO 2: Manual da Raiz

```powershell
cd "C:\Users\Windows\Downloads\agentezap correto"
railway up
```

### OPCAO 3: Usando npm script (se configurado)

```powershell
cd "C:\Users\Windows\Downloads\agentezap correto"
npm run deploy:v2
```

---

## O QUE NAO FAZER ❌

**NUNCA execute de dentro de vvvv/:**

```powershell
cd vvvv
railway up  # ERRADO! Vai dar 404
```

---

## ESTRUTURA DO PROJETO

```
agentezap correto/              <- RAIZ (execute railway up AQUI)
├── .railway/
│   └── config.json             <- Link do servico Railway
├── railway.toml                <- rootDirectory = "vvvv"
├── railway.json                <- Configs de build
├── GUIA-DEPLOY-RAILWAY.md
├── INSTRUCOES-FUNCIONARIOS.md
└── vvvv/                       <- Codigo da aplicacao
    ├── deploy.ps1              <- Script helper
    ├── package.json
    ├── server/
    ├── client/
    └── ...
```

---

## EXPLICACAO TECNICA

**Como funciona:**

1. Railway le railway.toml na RAIZ
2. Encontra: rootDirectory = "vvvv"
3. Faz build do codigo em: RAIZ + vvvv/
4. Se executar de vvvv/, procura: vvvv/ + vvvv/ = ERRO!

**Correcoes aplicadas:**

1. Removido gitlink quebrado (undefined)
2. Criado railway.toml na raiz
3. Criado .railway/config.json na raiz
4. Criado script deploy.ps1 helper

---

## TEMPO DE DEPLOY

- Upload e compressao: 30s
- Build (npm install + build): 2-3min
- Deploy e start: 30s
- Sessoes WhatsApp reconectando: 2-5min

**TOTAL: 5-10 minutos**

---

## VERIFICAR SE DEU CERTO

```powershell
# Ver status
railway status

# Ver logs
railway logs

# Ver logs de build
railway logs --deployment
```

**Saida esperada de railway status:**
```
Project: handsome-mindfulness
Environment: production
Service: vvvv
```

---

## CHECKLIST PRE-DEPLOY

- [ ] Codigo commitado no Git
- [ ] Build local passou: npm run build
- [ ] Esta na pasta RAIZ (ou usando deploy.ps1)
- [ ] Railway CLI autenticado

---

## ARQUIVOS CRIADOS

1. **deploy.ps1** - Script automatico
2. **GUIA-DEPLOY-RAILWAY.md** - Documentacao tecnica completa
3. **INSTRUCOES-FUNCIONARIOS.md** - Guia simplificado para equipe
4. **RESUMO-DEPLOY-RAILWAY.md** - Este arquivo (resumo rapido)

---

## PARA FUNCIONARIOS

**Instrucao de 1 linha:**

```powershell
cd "C:\Users\Windows\Downloads\agentezap correto\vvvv" ; .\deploy.ps1
```

Copie e cole no PowerShell, aperte Enter e aguarde.

---

## PERGUNTAS FREQUENTES

**P: Por que nao posso executar de vvvv/?**
R: Railway esta configurado para pegar codigo de RAIZ+vvvv/. Se executar de dentro de vvvv/, ele procura vvvv/vvvv/ (nao existe).

**P: Por que as sessoes demoram para conectar?**
R: Deploy novo = container novo = sessoes precisam reconectar com WhatsApp. Normal 2-5min.

**P: Onde ficam os dados das sessoes?**
R: No volume /data do Railway. Persistem entre deploys.

**P: O que faz o deploy.ps1?**
R: Muda para diretorio raiz e executa railway up. Simples e seguro.

---

**FIM DO GUIA**

Problemas? Verifique:
1. Esta usando deploy.ps1?
2. Railway CLI instalado? (railway --version)
3. Railway autenticado? (railway whoami)
4. Git commitado?
