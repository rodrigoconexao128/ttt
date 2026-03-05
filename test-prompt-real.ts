
import { generateProfessionalAgentPrompt } from './server/adminAgentService';

async function run() {
    console.log("🚀 Iniciando teste de geração de prompt...");
    
    const prompt = await generateProfessionalAgentPrompt(
        "Ana",
        "Loja de Roupas",
        "Vendedora",
        "Loja de roupas femininas. O cliente enviou fotos do catálogo. Temos vestidos a partir de R$50."
    );
    
    console.log("\n✅ Prompt Gerado:\n");
    console.log(prompt);
}

run().catch(console.error);
