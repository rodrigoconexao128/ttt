
import { processAdminMessage, generateProfessionalAgentPrompt } from './server/adminAgentService';
import { getMistralClient } from './server/mistralClient';

async function testFlow() {
    // Usar um número aleatório para não conflitar com testes anteriores
    const testPhone = "55119" + Math.floor(10000000 + Math.random() * 90000000);
    console.log(`🧪 Iniciando teste completo com telefone: ${testPhone}`);

    // ------------------------------------------------------------------------
    // CENÁRIO 1: Criação via Texto
    // ------------------------------------------------------------------------
    console.log("\n==================================================");
    console.log("CENÁRIO 1: Criação de Agente via Texto");
    console.log("==================================================");
    
    const userMsg = "Olá, tenho uma loja de suplementos chamada MuscleForce. Quero criar um agente.";
    console.log(`👤 User: "${userMsg}"`);

    // Processar mensagem pelo Admin (Rodrigo) - skipTriggerCheck=true para garantir processamento
    const response = await processAdminMessage(testPhone, userMsg, undefined, undefined, true);
    
    if (!response) {
        console.error("❌ Sem resposta do Admin.");
    } else {
        console.log(`🤖 Admin: "${response.text}"`);
        
        // Verificar se criou credenciais (indica que a ação CRIAR_CONTA_TESTE rodou)
        if (response.actions?.testAccountCredentials) {
            console.log("✅ SUCESSO: Ação CRIAR_CONTA_TESTE executada!");
            console.log(`   📧 Email criado: ${response.actions.testAccountCredentials.email}`);
            console.log(`   🔗 Token Simulador: ${response.actions.testAccountCredentials.simulatorToken}`);
        } else {
            console.log("⚠️ AVISO: A conta não foi criada automaticamente nesta interação.");
        }
    }

    // ------------------------------------------------------------------------
    // CENÁRIO 2: Teste da "Inteligência" do Agente Criado
    // ------------------------------------------------------------------------
    console.log("\n==================================================");
    console.log("CENÁRIO 2: Testando a Persona do Agente Criado");
    console.log("==================================================");

    // Vamos gerar o prompt manualmente para garantir que vemos o resultado, 
    // simulando o que o sistema faz internamente
    const company = "MuscleForce";
    const agentName = "Max";
    const role = "Consultor de Performance";
    const instructions = "Loja de suplementos esportivos. Whey, Creatina, Pré-treino. Foco em ganho de massa. Público maromba.";

    console.log(`⚙️ Gerando prompt profissional para: ${company}...`);
    const systemPrompt = await generateProfessionalAgentPrompt(agentName, company, role, instructions);
    
    console.log("\n📄 Prompt Gerado (Primeiros 300 chars):");
    console.log(systemPrompt.substring(0, 300) + "...\n");

    // Conversar com esse "novo agente"
    const mistral = await getMistralClient();
    const userQuestion = "E aí, quero ficar gigante pro verão. O que eu tomo?";
    
    console.log(`👤 User (para o novo agente): "${userQuestion}"`);
    
    const agentResponse = await mistral.chat.complete({
        model: "mistral-small-latest",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userQuestion }
        ] as any,
    });

    console.log(`🤖 Novo Agente (${agentName}): "${agentResponse.choices?.[0]?.message?.content}"`);

    // ------------------------------------------------------------------------
    // CENÁRIO 3: Interação com Mídia
    // ------------------------------------------------------------------------
    console.log("\n==================================================");
    console.log("CENÁRIO 3: Admin reagindo a Mídia");
    console.log("==================================================");
    
    const mediaMsg = "Dá uma olhada na foto da minha loja.";
    console.log(`👤 User: [IMAGEM] "${mediaMsg}"`);
    
    // Simular envio de imagem - skipTriggerCheck=true
    const mediaResponse = await processAdminMessage(testPhone, mediaMsg, "image", "http://fake.url/photo.jpg", true);
    
    if (mediaResponse) {
        console.log(`🤖 Admin: "${mediaResponse.text}"`);
        // Verificar se ele menciona a imagem ou pede contexto
        if (mediaResponse.text.toLowerCase().includes("foto") || mediaResponse.text.toLowerCase().includes("imagem") || mediaResponse.text.toLowerCase().includes("linda")) {
            console.log("✅ Admin reconheceu a imagem no contexto!");
        }
    }
}

testFlow().catch(console.error);
