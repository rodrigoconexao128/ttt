
import { parseAdminMediaTags } from './server/adminMediaStore';

// Mock do getAdminMediaByName para o teste
const mockGetAdminMediaByName = async (adminId: string | undefined, name: string) => {
    if (name === 'COMO_FUNCIONA') return { name: 'COMO_FUNCIONA' };
    return null;
};

async function testFallbackLogic(textWithoutActions: string) {
    console.log(`\n🧪 Testando texto: "${textWithoutActions}"`);
    
    let textForMediaParsing = textWithoutActions;
    const lowerText = textWithoutActions.toLowerCase();
    
    // Lógica copiada do adminAgentService.ts para validação
    const hasMediaTag = /\[ENVIAR_MIDIA:/i.test(textForMediaParsing);
  
    if (!hasMediaTag) {
        // Fallback para COMO_FUNCIONA
        if (lowerText.includes('como funciona') || lowerText.includes('funciona assim') || lowerText.includes('explicar como funciona') || lowerText.includes('vale a pena')) {
            // Verificar se existe a mídia COMO_FUNCIONA
            const media = await mockGetAdminMediaByName(undefined, 'COMO_FUNCIONA');
            if (media) {
                console.log('   🔧 [LOGICA] Fallback: Adicionando mídia COMO_FUNCIONA automaticamente');
                textForMediaParsing += ' [ENVIAR_MIDIA:COMO_FUNCIONA]';
            }
        }
    } else {
        // Regex para pegar tags incompletas no final da string
        const brokenTagRegex = /\[ENVIAR_?$/i;
        if (brokenTagRegex.test(textForMediaParsing)) {
            console.log('   🔧 [LOGICA] Fallback: Corrigindo tag quebrada no final');
            // Se o contexto sugere como funciona, completa
            if (lowerText.includes('como funciona') || lowerText.includes('vale a pena')) {
                textForMediaParsing = textForMediaParsing.replace(brokenTagRegex, '') + ' [ENVIAR_MIDIA:COMO_FUNCIONA]';
            }
        }
    }

    console.log(`   📝 Texto Final: "${textForMediaParsing}"`);
    
    const { mediaActions } = parseAdminMediaTags(textForMediaParsing);
    console.log(`   ✅ Ações Detectadas:`, JSON.stringify(mediaActions));
    
    return mediaActions;
}

async function runTests() {
    console.log("🚀 Iniciando bateria de testes de lógica de mídia...");

    // Teste 1: Tag quebrada no final (O caso que o usuário relatou: "[ENVIAR_...")
    await testFallbackLogic("Vale muito a pena sim! Vou te mandar um áudio. [ENVIAR_");

    // Teste 2: Sem tag nenhuma, mas com palavra chave "vale a pena"
    await testFallbackLogic("Vale a pena sim, o sistema é ótimo.");

    // Teste 3: Tag com espaços (Novo suporte no regex)
    console.log(`\n🧪 Testando Regex com espaços: "[ENVIAR_MIDIA: COMO_FUNCIONA ]"`);
    const { mediaActions } = parseAdminMediaTags("Aqui está o áudio [ENVIAR_MIDIA: COMO_FUNCIONA ]");
    console.log(`   ✅ Ações Detectadas:`, JSON.stringify(mediaActions));

    // Teste 4: Tag correta (Controle)
    await testFallbackLogic("Aqui está a explicação [ENVIAR_MIDIA:COMO_FUNCIONA]");
}

runTests();
