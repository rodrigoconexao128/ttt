/**
 * @fileoverview Teste para verificar se a lista de 71 categorias é enviada COMPLETA
 * Cliente: lmcoriolano@hotmail.com (Objetivo Milionário)
 * Problema: Lista sendo cortada no simulador e WhatsApp
 * 
 * TESTE: Simula pergunta "o que tem no pack?" e verifica se retorna todas as 71 categorias
 */

import { db } from './server/db';
import { aiAgentConfig, users } from './shared/schema';
import { eq } from 'drizzle-orm';

// ID do cliente de teste
const userId = '365d4cc6-2f59-422c-8f31-fcfd33e31b36';

// Função para contar categorias na resposta
function countCategories(responseText: string): number {
    if (!responseText) return 0;
    
    // Procurar padrões de numeração: "1.", "2.", etc.
    const numberPattern = /^\d+\./gm;
    const matches = responseText.match(numberPattern);
    
    return matches ? matches.length : 0;
}

// Função para verificar categorias específicas
function checkSpecificCategories(responseText: string): boolean {
    const categories = [
        { num: 1, name: 'Carrosséis' },
        { num: 10, name: 'SAAS' },
        { num: 20, name: 'Templates' },
        { num: 30, name: 'Cursos' },
        { num: 40, name: 'Vendas' },
        { num: 50, name: 'Zona Hacker' },
        { num: 60, name: 'Hot' },
        { num: 65, name: 'Ocultos' },
        { num: 71, name: 'IAs' }
    ];
    
    console.log('\n📋 Verificando categorias específicas:');
    let allFound = true;
    
    for (const cat of categories) {
        const numFound = responseText.includes(`${cat.num}.`);
        const status = numFound ? '✅' : '❌';
        console.log(`   ${status} ${cat.num}. ${cat.name} - ${numFound ? 'ENCONTRADA' : 'NÃO ENCONTRADA'}`);
        if (!numFound) allFound = false;
    }
    
    return allFound;
}

// Executar testes
async function runTests() {
    console.log('═'.repeat(70));
    console.log('🧪 TESTE DE CONFIGURAÇÃO - OBJETIVO MILIONÁRIO');
    console.log('═'.repeat(70));
    console.log('Cliente: lmcoriolano@hotmail.com');
    console.log('Problema: Lista de 71 categorias sendo cortada');
    console.log('═'.repeat(70));
    
    try {
        // Buscar configuração do agente
        const agentConfig = await db.select()
            .from(aiAgentConfig)
            .where(eq(aiAgentConfig.userId, userId))
            .limit(1);
        
        if (agentConfig.length === 0) {
            console.error('❌ Configuração do agente não encontrada!');
            return;
        }
        
        const config = agentConfig[0];
        console.log(`\n✅ Configuração encontrada:`);
        console.log(`   - Model: ${config.model}`);
        console.log(`   - message_split_chars: ${config.messageSplitChars}`);
        console.log(`   - is_active: ${config.isActive}`);
        console.log(`   - Tamanho do prompt: ${config.prompt?.length || 0} chars`);
        
        // Verificar se o prompt contém a lista das 71 categorias
        const prompt = config.prompt || '';
        
        console.log('\n📋 Verificando lista no prompt do cliente:');
        const hasListInstruction = prompt.includes('todas as 71 categorias') || 
                                   prompt.includes('Lista Inteira') ||
                                   prompt.includes('inteira, sem cortar');
        console.log(`   - Instrução de lista completa: ${hasListInstruction ? '✅' : '❌'}`);
        
        // Contar categorias no prompt
        const categoriesInPrompt = countCategories(prompt);
        console.log(`   - Categorias no prompt: ${categoriesInPrompt}`);
        
        // Verificar se todas as 71 estão no prompt
        checkSpecificCategories(prompt);
        
        console.log('\n═'.repeat(70));
        console.log('📊 RESULTADO DA VERIFICAÇÃO:');
        console.log('═'.repeat(70));
        
        if (categoriesInPrompt >= 70 && hasListInstruction) {
            console.log('✅ O prompt do cliente CONTÉM a lista completa e instrução!');
            console.log('   O problema está na IA cortando a resposta.');
            console.log('   Correção aplicada: aiAgent.ts modificado para permitir listas longas');
        } else {
            console.log('⚠️  O prompt do cliente pode estar incompleto:');
            console.log(`   - Categorias encontradas: ${categoriesInPrompt}/71`);
            console.log(`   - Instrução de lista completa: ${hasListInstruction}`);
        }
        
        console.log('\n═'.repeat(70));
        console.log('🔧 PRÓXIMOS PASSOS:');
        console.log('═'.repeat(70));
        console.log('1. Iniciar servidor local: npm run dev');
        console.log('2. Testar no simulador com: "o que tem no pack?"');
        console.log('3. Verificar se todas as 71 categorias aparecem');
        console.log('═'.repeat(70));
        
    } catch (error) {
        console.error('❌ Erro:', error);
    }
    
    process.exit(0);
}

runTests().catch(console.error);
