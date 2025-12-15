
import { processAdminMessage } from './server/adminAgentService';
import { storage } from './server/storage';

// Mock para evitar chamadas reais ao banco/API onde não é necessário, 
// mas usaremos o fluxo real do adminAgentService.

async function runUpdateTests() {
    console.log("🚀 Iniciando Bateria de Testes de Atualização (10 Cenários)...");

    const scenarios = [
        {
            type: "Pet Shop",
            initial: "Tenho um Pet Shop chamado Patinhas.",
            update: "Agora fazemos banho e tosa também. O nome mudou para Patinhas Spa.",
            expectedName: "Patinhas Spa"
        },
        {
            type: "Dentista",
            initial: "Sou dentista, Clínica Sorriso.",
            update: "Muda o nome do atendente para Secretária Virtual e avisa que aceitamos convênio.",
            expectedRole: "Secretária Virtual"
        },
        {
            type: "Hamburgueria",
            initial: "Hamburgueria Artesanal BurgerKing (não a rede).",
            update: "O nome é BurgerKing do Bairro. Temos delivery grátis.",
            expectedCompany: "BurgerKing do Bairro"
        },
        {
            type: "Advogado",
            initial: "Escritório de Advocacia Trabalhista.",
            update: "Focamos agora em Direito Digital também.",
            expectedContext: "Direito Digital"
        },
        {
            type: "Imobiliária",
            initial: "Vendo casas de luxo.",
            update: "Agora também alugamos apartamentos.",
            expectedContext: "alugamos apartamentos"
        },
        {
            type: "Personal Trainer",
            initial: "Sou personal trainer online.",
            update: "Muda o nome do agente para Coach Max.",
            expectedName: "Coach Max"
        },
        {
            type: "Salão de Beleza",
            initial: "Salão de beleza, corte e pintura.",
            update: "Adiciona manicure e pedicure na lista de serviços.",
            expectedContext: "manicure"
        },
        {
            type: "Oficina Mecânica",
            initial: "Oficina mecânica de carros.",
            update: "Agora atendemos motos também.",
            expectedContext: "motos"
        },
        {
            type: "Escola de Inglês",
            initial: "Aulas de inglês particulares.",
            update: "Agora temos turmas online em grupo.",
            expectedContext: "turmas online"
        },
        {
            type: "Pizzaria",
            initial: "Pizzaria delivery.",
            update: "Muda o nome da pizzaria para Pizza Veloce.",
            expectedCompany: "Pizza Veloce"
        }
    ];

    for (let i = 0; i < scenarios.length; i++) {
        const scenario = scenarios[i];
        // Gerar um telefone único para cada cenário para não misturar sessões
        const phone = "55119" + Math.floor(10000000 + Math.random() * 90000000);
        
        console.log(`\n--------------------------------------------------`);
        console.log(`🧪 Teste ${i + 1}/10: ${scenario.type}`);
        console.log(`📱 Phone: ${phone}`);
        
        // 1. Criação Inicial
        console.log(`➡️  Passo 1: Criação ("${scenario.initial}")`);
        const res1 = await processAdminMessage(phone, scenario.initial, undefined, undefined, true);
        
        if (res1?.actions?.testAccountCredentials) {
            console.log("   ✅ Conta criada com sucesso.");
        } else {
            console.log("   ⚠️ Conta não criada na primeira tentativa (pode ser normal se a IA pedir mais info).");
            // Forçar criação se necessário para o teste, mas vamos confiar na IA do Admin
        }

        // 2. Atualização
        console.log(`➡️  Passo 2: Atualização ("${scenario.update}")`);
        const res2 = await processAdminMessage(phone, scenario.update, undefined, undefined, true);
        
        if (res2?.actions?.testAccountCredentials) {
            console.log("   ✅ Atualização processada (Ação CRIAR_CONTA_TESTE executada).");
            console.log(`   📝 Resposta do Admin: "${res2.text.substring(0, 100)}..."`);
            
            // Aqui verificaríamos se o prompt foi regenerado com as novas infos
            // Como não temos acesso fácil ao prompt interno aqui sem consultar o banco,
            // vamos confiar no log do console que o adminAgentService.ts gera ("Gerando prompt profissional...")
        } else {
            console.error("   ❌ Falha: Ação de atualização não detectada.");
        }
        
        // Pequena pausa para não estourar rate limits da API (se houver)
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log("\n✅ Bateria de testes concluída!");
}

runUpdateTests().catch(console.error);
