# INSTRUCOES PARA FUNCIONARIOS - DEPLOY RAILWAY

## RESUMO RAPIDO

Para fazer deploy no Railway, SEMPRE use uma destas opcoes:

### Opcao 1: Script Automatico (MAIS FACIL)
```powershell
cd vvvv
.\deploy.ps1
```

### Opcao 2: Manual
```powershell
cd "C:\Users\Windows\Downloads\agentezap correto"
railway up
```

---

## POR QUE NAO FUNCIONA DE DENTRO DE vvvv/?

**ERRO COMUM:**
```
(.venv) PS C:\...\vvvv> railway up
Failed to upload code with status code 404 Not Found
```

**EXPLICACAO:**
- O projeto Railway esta configurado com `rootDirectory = "vvvv"`
- Isso significa: "pegue o codigo de RAIZ + vvvv/"
- Se voce executar de dentro de vvvv/, o Railway procura vvvv/vvvv/ (NAO EXISTE!)

**ESTRUTURA:**
```
agentezap correto/          <- Execute railway up AQUI
├── railway.toml            <- Configuracao: rootDirectory = "vvvv"
└── vvvv/                   <- Codigo da aplicacao
    ├── deploy.ps1          <- OU use este script
    ├── package.json
    └── server/
```

---

## PASSO A PASSO DETALHADO

### Usando o Script (Recomendado)

1. Abra PowerShell
2. Va para qualquer pasta do projeto:
   ```powershell
   cd "C:\Users\Windows\Downloads\agentezap correto\vvvv"
   ```
3. Execute o script:
   ```powershell
   .\deploy.ps1
   ```
4. Aguarde 2-3 minutos para build completar

### Usando Comando Manual

1. Abra PowerShell
2. Va para a RAIZ do projeto:
   ```powershell
   cd "C:\Users\Windows\Downloads\agentezap correto"
   ```
3. Execute o deploy:
   ```powershell
   railway up
   ```
4. Aguarde 2-3 minutos

---

## O QUE ACONTECE DURANTE O DEPLOY?

1. **Compressao**: Railway compacta o codigo
2. **Upload**: Envia para servidores Railway
3. **Build**: Instala dependencias (npm install)
4. **Compilacao**: Roda npm run build
5. **Deploy**: Inicia novo container
6. **Sessoes WhatsApp**: Reconectam (2-5 minutos)

**TOTAL**: 5-10 minutos para deploy completo com todas as sessoes conectadas

---

## VERIFICAR SE DEU CERTO

### Ver logs em tempo real:
```powershell
cd "C:\Users\Windows\Downloads\agentezap correto"
railway logs
```

### Ver status do servico:
```powershell
railway status
```

Deve mostrar:
```
Project: handsome-mindfulness
Environment: production
Service: vvvv
```

---

## CHECKLIST PRE-DEPLOY

- [ ] Codigo esta commitado no Git
- [ ] Build local passou: `npm run build`
- [ ] Esta na pasta correta (raiz ou usando script)
- [ ] Railway CLI esta instalado e autenticado

---

## PERGUNTAS FREQUENTES

**P: Por que as sessoes demoram para conectar?**
R: Deploy novo = container novo = todas as sessoes precisam reconectar. Normal demorar 2-5 minutos.

**P: Onde ficam os arquivos de sessao?**
R: No volume /data do Railway. Sao persistidos entre deploys.

**P: Posso fazer deploy de qualquer branch?**
R: Sim, mas certifique-se que o codigo esta testado.

**P: Como cancelar um deploy em andamento?**
R: Pressione Ctrl+C no terminal.

---

**Criado em**: 2026-02-11
**Valido para**: Railway CLI v4.23.0+
