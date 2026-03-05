
import pkg from 'pg';
const { Pool } = pkg;
import { Mistral } from "@mistralai/mistralai";
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.join(process.cwd(), '.env') });

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "ZgYFI0WS48O4PqlSRP7jvS9TsfPbiyqL";

async function main() {
  console.log('🚀 Testando Cenários de Pagamento (Instalação vs Mensalidade)...');

  const newPrompt = `🛰️ IDENTIDADE — EDSON | RASTRO CITY
Você é o Edson, atendente comercial da Rastro City.
NUNCA diga que é um assistente virtual, bot ou IA.

═══════════════════════════════════════
🚨 REGRA CRÍTICA DE COMPROVANTES (LEIA COM ATENÇÃO)
═══════════════════════════════════════
Ao receber um comprovante (imagem/PDF) ou aviso de pagamento, você deve CLASSIFICAR O CLIENTE:

TIPO A: NOVO CLIENTE (Venda)
- Identificação: Vocês estavam negociando planos, valores ou agendamento nas mensagens IMEDIATAMENTE ANTERIORES.
- Ação: "Recebi! Vou validar com o financeiro e já volto para agendarmos sua instalação."

TIPO B: CLIENTE ANTIGO (Mensalidade)
- Identificação: O cliente disse "mensalidade", "boleto", OU não há histórico recente de negociação de planos (ex: cliente mandou comprovante do nada).
- Ação: "Recebi! Vou pedir para darem baixa no sistema. Obrigado e conte conosco!"
- ⛔ NUNCA ofereça instalação para o TIPO B.

CONTEXTO VAZIO = TIPO B (MENSALIDADE).
Se o cliente chegar mandando o comprovante sem conversar antes, ASSUMA QUE É MENSALIDADE.

═══════════════════════════════════════
🎯 SEU OBJETIVO (Apenas se NÃO recebeu comprovante)
═══════════════════════════════════════
Para prospects interessados:
CONVERTER o cliente em instalação agendada.
- Seja PERSUASIVO e AMIGÁVEL
- Respostas CURTAS (3-5 linhas máximo)
- SEMPRE termine com PERGUNTA ou CALL-TO-ACTION

═══════════════════════════════════════
📌 FLUXO DE ATENDIMENTO
═══════════════════════════════════════

SAUDAÇÃO (1ª mensagem):
"Olá! 😊 Que bom te ver por aqui. Seja muito bem vindo(a).
Meu nome é Edson, da Rastro City. Para agilizar seu atendimento, vou lhe mandar algumas informações abaixo sobre nossos serviços ⤵️
🛰️Monitoramento em tempo real! Tecnologia avançada para garantir sua segurança. 
Carro ou Moto?"

APÓS RESPONDER CARRO/MOTO:
"Ótima escolha! 🚗/🏍️
A Rastro City oferece rastreamento 24h com GPS de ponta:
✅ Localização em tempo real no app
✅ Bloqueio do veículo pelo celular  
✅ Suporte na recuperação em caso de roubo
✅ Instalação GRÁTIS em domicílio

Planos a partir de R$50/mês! Quer conhecer?"

QUANDO MOSTRAR PLANOS:
"📋 NOSSOS PLANOS:
🔹 Básico R$50/mês - Rastreamento + Bloqueio pela Central
🔹 Padrão R$60/mês - + Bloqueio no APP ⭐ MAIS VENDIDO
🔹 Premium R$80/mês - + Alarme anti-furto

✨ Instalação GRÁTIS! Sem fidelidade!
Qual te interessou? Posso agendar sua instalação agora!"

FECHAMENTO (quando demonstrar interesse):
"Excelente escolha! 🎉 Pra agendar sua instalação gratuita, preciso de:
📸 CNH ou RG
📸 Documento do veículo
📍 Endereço da instalação
📱 2 números para contato

Pode me enviar? Qual melhor dia pra você?"

═══════════════════════════════════════
🔥 TÉCNICAS DE FECHAMENTO
═══════════════════════════════════════
- Se hesitar: "Instalação é GRÁTIS e sem fidelidade! Pode testar sem compromisso."
- Se comparar preço: "Por R$50/mês você tem segurança 24h! É menos de R$2 por dia."

═══════════════════════════════════════
📚 CONHECIMENTO
═══════════════════════════════════════
TECNOLOGIA: GPS + GSM/GPRS, precisão de 3m.
APP: Android/iOS, localização tempo real, histórico 6 meses.
ROUBO: Central 24h, suporte recuperação.
CANCELAMENTO: Sem fidelidade, cancela quando quiser.
INSTALAÇÃO: Grátis em domicílio.
PAGAMENTO: 1ª mensalidade na instalação.
EQUIPAMENTO: Comodato.`;

  const client = new Mistral({ apiKey: MISTRAL_API_KEY });

  // CENÁRIO 1: Novo Cliente (Espera-se agendamento)
  console.log('\n🔵 CENÁRIO 1: Novo Cliente (Planos -> Pagamento -> Comprovante)');
  const messagesNew = [
    { role: "system", content: newPrompt },
    { role: "assistant", content: "Nossos planos são a partir de R$50. Qual prefere?" },
    { role: "user", content: "Quero o de 60 reais. Como pago?" },
    { role: "assistant", content: "Pode pagar via PIX. Segue a chave 12345. Me mande o comprovante para eu agendar a instalação." },
    { role: "user", content: "[IMAGEM COMPROVANTE]" }
  ];
  
  const responseNew = await client.chat.complete({
    model: "mistral-small-latest",
    messages: messagesNew,
    temperature: 0.1,
  });
  console.log('IA:', responseNew.choices[0]?.message?.content);


  // CENÁRIO 2: Cliente Recorrente (Menciona mensalidade)
  console.log('\n🟠 CENÁRIO 2: Cliente Recorrente (Mensalidade -> Comprovante)');
  const messagesRecurring = [
    { role: "system", content: newPrompt },
    { role: "user", content: "Oi Edson, bom dia. Segue o comprovante da mensalidade desse mês." },
    { role: "user", content: "[IMAGEM COMPROVANTE]" }
  ];

  const responseRecurring = await client.chat.complete({
    model: "mistral-small-latest",
    messages: messagesRecurring,
    temperature: 0.1,
  });
  console.log('IA:', responseRecurring.choices[0]?.message?.content);

  // CENÁRIO 3: Cliente Ambíguo (Só manda foto sem contexto)
  console.log('\n🟡 CENÁRIO 3: Ambíguo (Sem contexto, deve assumir mensalidade)');
  const messagesAmbiguous = [
    { role: "system", content: newPrompt },
    { role: "user", content: "[IMAGEM]" },
    { role: "user", content: "pago" }
  ];

  const responseAmbiguous = await client.chat.complete({
    model: "mistral-small-latest",
    messages: messagesAmbiguous, // SEM histórico
    temperature: 0.1,
  });
  console.log('IA:', responseAmbiguous.choices[0]?.message?.content);


  const USER_ID = '4bf0c68b-78ee-4d8c-bca3-6644e51015c4';
  const c1 = responseNew.choices[0]?.message?.content.toLowerCase();
  const c2 = responseRecurring.choices[0]?.message?.content.toLowerCase();
  const c3 = responseAmbiguous.choices[0]?.message?.content.toLowerCase();

  const c1HasInstall = c1.includes('instalação') || c1.includes('agendarmos');
  const c2HasInstall = c2.includes('instalação') || c2.includes('agendarmos');
  const c3HasInstall = c3.includes('instalação') || c3.includes('agendarmos');

  if (c1HasInstall && !c2HasInstall && !c3HasInstall) {
    console.log('\n\n✅ TESTES APROVADOS! Atualizando banco de dados...');
    
    // Conectar ao Supabase (DB real) para atualizar
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
        `UPDATE ai_agent_config SET prompt = $1 WHERE user_id = $2`,
        [newPrompt, USER_ID]
    );
    console.log('🎉 Banco de dados atualizado com sucesso!');
    await pool.end();
  } else {
    console.log('\n\n❌ FALHA NOS TESTES. Não atualizando o banco.');
    console.log('C1 (deve ter):', c1HasInstall);
    console.log('C2 (NÃO deve ter):', c2HasInstall);
    console.log('C3 (NÃO deve ter):', c3HasInstall);
  }

}

main();
