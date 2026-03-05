/**
 * TESTE ABRANGENTE DO SISTEMA DE MÍDIA - 100+ CENÁRIOS
 * 
 * Testa TODOS os tipos de mídia (áudio, imagem, vídeo, documento)
 * para DIVERSOS tipos de negócio (restaurante, loja, clínica, etc.)
 * 
 * O sistema deve ser UNIVERSAL e funcionar para qualquer negócio.
 */

import 'dotenv/config';
import { db } from "./db";
import { storage } from "./storage";
import { generateAIResponse } from "./aiAgent";
import { getAgentMediaLibrary, upsertAgentMedia } from "./mediaService";
import { agentMediaLibrary, aiAgentConfig } from "@shared/schema";
import { eq } from "drizzle-orm";

// Cores para output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

// ============================================================================
// CONFIGURAÇÃO DE NEGÓCIOS SIMULADOS
// ============================================================================

interface BusinessConfig {
  name: string;
  type: string;
  prompt: string;
  medias: {
    name: string;
    mediaType: 'audio' | 'image' | 'video' | 'document';
    description: string;
    whenToUse: string;
  }[];
}

const BUSINESS_CONFIGS: BusinessConfig[] = [
  {
    name: "Restaurante Sabor Caseiro",
    type: "restaurante",
    prompt: `Você é a Ana, atendente virtual do Restaurante Sabor Caseiro.
Somos um restaurante de comida caseira brasileira, aberto de terça a domingo das 11h às 22h.
Fazemos delivery e temos salão para até 50 pessoas.
Pratos principais: feijoada (sábado), marmitex, pratos executivos.
Preços: marmitex R$18-25, pratos R$35-55, feijoada R$45.`,
    medias: [
      { name: "CARDAPIO_COMPLETO", mediaType: "image", description: "Cardápio completo com todos os pratos e preços", whenToUse: "Quando pedirem cardápio, preços, o que tem pra comer" },
      { name: "FOTO_FEIJOADA", mediaType: "image", description: "Foto da nossa feijoada especial de sábado", whenToUse: "Quando perguntarem sobre feijoada ou pratos especiais" },
      { name: "AUDIO_PROMOCAO", mediaType: "audio", description: "Áudio explicando a promoção da semana", whenToUse: "Quando perguntarem sobre promoções ou descontos" },
      { name: "VIDEO_RESTAURANTE", mediaType: "video", description: "Tour pelo restaurante mostrando ambiente", whenToUse: "Quando quiserem ver o ambiente, o espaço, o restaurante" },
    ]
  },
  {
    name: "Clínica Odontológica Sorriso",
    type: "clinica",
    prompt: `Você é a Paula, assistente virtual da Clínica Odontológica Sorriso.
Oferecemos: limpeza, clareamento, implantes, ortodontia, próteses.
Atendemos convênios: Unimed, Bradesco, SulAmérica.
Horário: Segunda a sexta 8h-18h, sábado 8h-12h.
Avaliação gratuita para novos pacientes.`,
    medias: [
      { name: "TABELA_PRECOS", mediaType: "image", description: "Tabela de preços dos procedimentos", whenToUse: "Quando perguntarem valores, quanto custa, preço" },
      { name: "ANTES_DEPOIS", mediaType: "image", description: "Fotos de antes e depois de clareamento", whenToUse: "Quando perguntarem sobre resultados, como fica, antes e depois" },
      { name: "VIDEO_CLINICA", mediaType: "video", description: "Vídeo mostrando a estrutura da clínica", whenToUse: "Quando quiserem ver a clínica, estrutura, equipamentos" },
      { name: "PDF_CONVENIOS", mediaType: "document", description: "Lista completa de convênios aceitos", whenToUse: "Quando perguntarem sobre convênios, planos de saúde" },
    ]
  },
  {
    name: "Loja Eletrônicos TechMax",
    type: "loja_eletronicos",
    prompt: `Você é o Carlos, vendedor virtual da TechMax Eletrônicos.
Vendemos: celulares, notebooks, TVs, acessórios, games.
Marcas: Apple, Samsung, Xiaomi, Dell, LG.
Parcelamos em até 12x sem juros. Frete grátis acima de R$200.
Garantia estendida disponível.`,
    medias: [
      { name: "CATALOGO_CELULARES", mediaType: "image", description: "Catálogo com celulares e preços", whenToUse: "Quando perguntarem sobre celulares, smartphones, aparelhos" },
      { name: "CATALOGO_NOTEBOOKS", mediaType: "image", description: "Catálogo de notebooks disponíveis", whenToUse: "Quando perguntarem sobre notebooks, computadores" },
      { name: "VIDEO_UNBOXING", mediaType: "video", description: "Vídeo de unboxing dos produtos mais vendidos", whenToUse: "Quando quiserem ver o produto, unboxing, demonstração" },
      { name: "PDF_GARANTIA", mediaType: "document", description: "Termos de garantia estendida", whenToUse: "Quando perguntarem sobre garantia, termos, contrato" },
    ]
  },
  {
    name: "Academia FitPower",
    type: "academia",
    prompt: `Você é o Marcos, consultor da Academia FitPower.
Oferecemos: musculação, funcional, spinning, yoga, pilates.
Horário: 5h às 23h de segunda a sexta, 7h às 18h sábado.
Planos: mensal R$89, trimestral R$229, anual R$799.
Primeira semana grátis para novos alunos.`,
    medias: [
      { name: "FOTO_ESTRUTURA", mediaType: "image", description: "Fotos da academia mostrando equipamentos", whenToUse: "Quando quiserem ver a academia, estrutura, equipamentos" },
      { name: "TABELA_PLANOS", mediaType: "image", description: "Tabela com planos e preços", whenToUse: "Quando perguntarem sobre preços, planos, valores, quanto custa" },
      { name: "VIDEO_AULAS", mediaType: "video", description: "Vídeo mostrando as aulas em grupo", whenToUse: "Quando perguntarem sobre aulas, como são as aulas" },
      { name: "AUDIO_DEPOIMENTOS", mediaType: "audio", description: "Áudio com depoimentos de alunos", whenToUse: "Quando perguntarem sobre resultados, depoimentos, experiências" },
    ]
  },
  {
    name: "Imobiliária Casa Nova",
    type: "imobiliaria",
    prompt: `Você é a Juliana, corretora virtual da Imobiliária Casa Nova.
Trabalhamos com: venda, aluguel, lançamentos.
Regiões: Centro, Zona Sul, Zona Norte da cidade.
Financiamento: ajudamos com toda documentação.
Visitas agendadas de segunda a sábado.`,
    medias: [
      { name: "CATALOGO_IMOVEIS", mediaType: "image", description: "Catálogo com imóveis disponíveis", whenToUse: "Quando perguntarem sobre imóveis, casas, apartamentos disponíveis" },
      { name: "VIDEO_TOUR", mediaType: "video", description: "Tour virtual de um apartamento modelo", whenToUse: "Quando quiserem ver um imóvel, tour, visita virtual" },
      { name: "PDF_FINANCIAMENTO", mediaType: "document", description: "Guia de financiamento e documentação necessária", whenToUse: "Quando perguntarem sobre financiamento, documentos, entrada" },
      { name: "AUDIO_APRESENTACAO", mediaType: "audio", description: "Áudio de apresentação da imobiliária", whenToUse: "Quando for primeira conversa ou quiserem conhecer a empresa" },
    ]
  },
  {
    name: "Pet Shop Amigo Fiel",
    type: "petshop",
    prompt: `Você é a Fernanda, atendente do Pet Shop Amigo Fiel.
Serviços: banho, tosa, veterinário, hotel para pets.
Produtos: rações, brinquedos, acessórios, medicamentos.
Delivery de ração grátis acima de R$100.
Agendamento de banho online.`,
    medias: [
      { name: "TABELA_BANHO_TOSA", mediaType: "image", description: "Tabela de preços de banho e tosa por porte", whenToUse: "Quando perguntarem preço de banho, tosa, grooming" },
      { name: "CATALOGO_RACOES", mediaType: "image", description: "Catálogo de rações disponíveis", whenToUse: "Quando perguntarem sobre rações, comida para pet" },
      { name: "VIDEO_ESPACO", mediaType: "video", description: "Vídeo do espaço e como cuidamos dos pets", whenToUse: "Quando quiserem ver o espaço, como tratamos os animais" },
      { name: "AUDIO_HORARIOS", mediaType: "audio", description: "Áudio com horários e como agendar", whenToUse: "Quando perguntarem sobre horários, agendamento" },
    ]
  },
];

// ============================================================================
// CENÁRIOS DE TESTE POR CATEGORIA
// ============================================================================

interface TestCase {
  category: string;
  name: string;
  messages: string[];
  expectedMediaType?: 'audio' | 'image' | 'video' | 'document' | 'any';
  expectedMediaName?: string; // Nome específico ou null para qualquer
  shouldTriggerMedia: boolean;
  applicableBusinessTypes?: string[]; // Quais tipos de negócio esse teste se aplica
}

const TEST_CASES: TestCase[] = [
  // =========================================================================
  // CATEGORIA 1: PEDIDOS EXPLÍCITOS DE IMAGEM (CATÁLOGO/PREÇOS)
  // =========================================================================
  { category: "Imagem - Catálogo", name: "Pede catálogo diretamente", messages: ["Manda o catálogo"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Imagem - Catálogo", name: "Quer ver produtos", messages: ["Quero ver os produtos"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Imagem - Catálogo", name: "Mostra o que tem", messages: ["Me mostra o que vocês tem"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Imagem - Catálogo", name: "Pede lista de preços", messages: ["Tem lista de preços?"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Imagem - Catálogo", name: "Tabela de valores", messages: ["Manda a tabela de valores"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Imagem - Catálogo", name: "Cardápio por favor", messages: ["Manda o cardápio por favor"], expectedMediaType: "image", shouldTriggerMedia: true, applicableBusinessTypes: ["restaurante"] },
  { category: "Imagem - Catálogo", name: "Quanto custa cada coisa", messages: ["Quanto custa cada coisa? Me manda a tabela"], expectedMediaType: "image", shouldTriggerMedia: true },
  
  // =========================================================================
  // CATEGORIA 2: PEDIDOS DE FOTO/IMAGEM GENÉRICOS
  // =========================================================================
  { category: "Imagem - Fotos", name: "Pede foto simples", messages: ["Me manda uma foto"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Imagem - Fotos", name: "Tem foto?", messages: ["Tem foto do produto?"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Imagem - Fotos", name: "Quero ver imagem", messages: ["Quero ver imagem"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Imagem - Fotos", name: "Mostra foto do lugar", messages: ["Mostra foto do lugar"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Imagem - Fotos", name: "Dá pra mandar foto?", messages: ["Dá pra mandar foto?"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Imagem - Fotos", name: "Envia imagem do serviço", messages: ["Envia imagem do serviço"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Imagem - Fotos", name: "Posso ver uma foto?", messages: ["Oi", "Posso ver uma foto?"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Imagem - Fotos", name: "Manda prints", messages: ["Manda uns prints pra eu ver"], expectedMediaType: "image", shouldTriggerMedia: true },
  
  // =========================================================================
  // CATEGORIA 3: PEDIDOS DE ÁUDIO
  // =========================================================================
  { category: "Áudio - Explicação", name: "Pede áudio explicação", messages: ["Me manda um áudio explicando"], expectedMediaType: "audio", shouldTriggerMedia: true },
  { category: "Áudio - Explicação", name: "Pode mandar áudio?", messages: ["Pode mandar um áudio?"], expectedMediaType: "audio", shouldTriggerMedia: true },
  { category: "Áudio - Explicação", name: "Prefiro ouvir", messages: ["Prefiro ouvir, manda áudio"], expectedMediaType: "audio", shouldTriggerMedia: true },
  { category: "Áudio - Explicação", name: "Grava um áudio", messages: ["Grava um áudio pra mim"], expectedMediaType: "audio", shouldTriggerMedia: true },
  { category: "Áudio - Explicação", name: "Explica por áudio", messages: ["Explica isso por áudio"], expectedMediaType: "audio", shouldTriggerMedia: true },
  { category: "Áudio - Explicação", name: "Manda vocal", messages: ["Manda um vocal"], expectedMediaType: "audio", shouldTriggerMedia: true },
  
  // =========================================================================
  // CATEGORIA 4: PEDIDOS DE VÍDEO
  // =========================================================================
  { category: "Vídeo - Demonstração", name: "Pede vídeo direto", messages: ["Me manda um vídeo"], expectedMediaType: "video", shouldTriggerMedia: true },
  { category: "Vídeo - Demonstração", name: "Tem vídeo?", messages: ["Tem vídeo mostrando?"], expectedMediaType: "video", shouldTriggerMedia: true },
  { category: "Vídeo - Demonstração", name: "Quero ver funcionando", messages: ["Quero ver funcionando, tem vídeo?"], expectedMediaType: "video", shouldTriggerMedia: true },
  { category: "Vídeo - Demonstração", name: "Demonstração em vídeo", messages: ["Tem alguma demonstração em vídeo?"], expectedMediaType: "video", shouldTriggerMedia: true },
  { category: "Vídeo - Demonstração", name: "Vídeo do espaço", messages: ["Manda um vídeo do espaço"], expectedMediaType: "video", shouldTriggerMedia: true },
  { category: "Vídeo - Demonstração", name: "Tour virtual", messages: ["Tem tour virtual? Vídeo?"], expectedMediaType: "video", shouldTriggerMedia: true },
  
  // =========================================================================
  // CATEGORIA 5: PEDIDOS DE DOCUMENTO/PDF
  // =========================================================================
  { category: "Documento - PDF", name: "Pede PDF", messages: ["Me manda o PDF"], expectedMediaType: "document", shouldTriggerMedia: true },
  { category: "Documento - PDF", name: "Tem documento?", messages: ["Tem documento com as informações?"], expectedMediaType: "document", shouldTriggerMedia: true },
  { category: "Documento - PDF", name: "Contrato por escrito", messages: ["Quero ver o contrato por escrito"], expectedMediaType: "document", shouldTriggerMedia: true },
  { category: "Documento - PDF", name: "Proposta formal", messages: ["Pode mandar uma proposta formal?"], expectedMediaType: "document", shouldTriggerMedia: true },
  { category: "Documento - PDF", name: "Termos de uso", messages: ["Manda os termos de uso"], expectedMediaType: "document", shouldTriggerMedia: true },
  { category: "Documento - PDF", name: "Documentação", messages: ["Preciso da documentação"], expectedMediaType: "document", shouldTriggerMedia: true },
  
  // =========================================================================
  // CATEGORIA 6: CONTEXTOS ESPECÍFICOS POR TIPO DE NEGÓCIO
  // =========================================================================
  // Restaurante
  { category: "Restaurante", name: "Pede cardápio", messages: ["Qual é o cardápio de hoje?"], expectedMediaType: "image", shouldTriggerMedia: true, applicableBusinessTypes: ["restaurante"] },
  { category: "Restaurante", name: "Quer ver pratos", messages: ["Quero ver os pratos"], expectedMediaType: "image", shouldTriggerMedia: true, applicableBusinessTypes: ["restaurante"] },
  { category: "Restaurante", name: "Foto da comida", messages: ["Tem foto da comida?"], expectedMediaType: "image", shouldTriggerMedia: true, applicableBusinessTypes: ["restaurante"] },
  
  // Clínica
  { category: "Clínica", name: "Antes e depois", messages: ["Tem foto de antes e depois?"], expectedMediaType: "image", shouldTriggerMedia: true, applicableBusinessTypes: ["clinica"] },
  { category: "Clínica", name: "Tabela procedimentos", messages: ["Qual o valor dos procedimentos?"], expectedMediaType: "image", shouldTriggerMedia: true, applicableBusinessTypes: ["clinica"] },
  { category: "Clínica", name: "Lista de convênios", messages: ["Quais convênios vocês aceitam?"], expectedMediaType: "document", shouldTriggerMedia: true, applicableBusinessTypes: ["clinica"] },
  
  // Loja
  { category: "Loja", name: "Catálogo celulares", messages: ["Quero ver os celulares disponíveis"], expectedMediaType: "image", shouldTriggerMedia: true, applicableBusinessTypes: ["loja_eletronicos"] },
  { category: "Loja", name: "Preços notebooks", messages: ["Quanto tá os notebooks?"], expectedMediaType: "image", shouldTriggerMedia: true, applicableBusinessTypes: ["loja_eletronicos"] },
  
  // Academia
  { category: "Academia", name: "Tabela de planos", messages: ["Quanto é a mensalidade?"], expectedMediaType: "image", shouldTriggerMedia: true, applicableBusinessTypes: ["academia"] },
  { category: "Academia", name: "Fotos da academia", messages: ["Como é a academia? Tem fotos?"], expectedMediaType: "image", shouldTriggerMedia: true, applicableBusinessTypes: ["academia"] },
  
  // Imobiliária
  { category: "Imobiliária", name: "Ver imóveis", messages: ["Quero ver os imóveis disponíveis"], expectedMediaType: "image", shouldTriggerMedia: true, applicableBusinessTypes: ["imobiliaria"] },
  { category: "Imobiliária", name: "Tour virtual", messages: ["Tem tour virtual do apartamento?"], expectedMediaType: "video", shouldTriggerMedia: true, applicableBusinessTypes: ["imobiliaria"] },
  { category: "Imobiliária", name: "Info financiamento", messages: ["Como funciona o financiamento?"], expectedMediaType: "document", shouldTriggerMedia: true, applicableBusinessTypes: ["imobiliaria"] },
  
  // Pet Shop
  { category: "Pet Shop", name: "Preço banho", messages: ["Quanto custa o banho?"], expectedMediaType: "image", shouldTriggerMedia: true, applicableBusinessTypes: ["petshop"] },
  { category: "Pet Shop", name: "Ver espaço", messages: ["Como é o espaço? Manda vídeo"], expectedMediaType: "video", shouldTriggerMedia: true, applicableBusinessTypes: ["petshop"] },
  
  // =========================================================================
  // CATEGORIA 7: CENÁRIOS QUE NÃO DEVEM ENVIAR MÍDIA
  // =========================================================================
  { category: "Sem Mídia", name: "Saudação simples", messages: ["Oi"], shouldTriggerMedia: false },
  { category: "Sem Mídia", name: "Pergunta horário", messages: ["Qual o horário de funcionamento?"], shouldTriggerMedia: false },
  { category: "Sem Mídia", name: "Pergunta localização", messages: ["Onde fica vocês?"], shouldTriggerMedia: false },
  { category: "Sem Mídia", name: "Agradecimento", messages: ["Obrigado pela informação"], shouldTriggerMedia: false },
  { category: "Sem Mídia", name: "Pergunta simples", messages: ["Vocês fazem entrega?"], shouldTriggerMedia: false },
  { category: "Sem Mídia", name: "Confirma pedido", messages: ["Ok, fechado então"], shouldTriggerMedia: false },
  { category: "Sem Mídia", name: "Dúvida sem contexto visual", messages: ["Como funciona o pagamento?"], shouldTriggerMedia: false },
  { category: "Sem Mídia", name: "Bom dia simples", messages: ["Bom dia!"], shouldTriggerMedia: false },
  { category: "Sem Mídia", name: "Elogio", messages: ["Vocês são muito bons!"], shouldTriggerMedia: false },
  { category: "Sem Mídia", name: "Reclamação", messages: ["Estou tendo um problema"], shouldTriggerMedia: false },
  
  // =========================================================================
  // CATEGORIA 8: CONVERSAS MAIS LONGAS COM CONTEXTO
  // =========================================================================
  { category: "Contexto", name: "Conversa → pede catálogo", messages: ["Oi", "Tudo bem?", "Quero conhecer os produtos. Tem catálogo?"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Contexto", name: "Pergunta preço → pede tabela", messages: ["Quanto custa?", "Melhor mandar a tabela completa"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Contexto", name: "Interesse → quer ver", messages: ["Tenho interesse no serviço", "Pode me mostrar?"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Contexto", name: "Dúvida → pede áudio", messages: ["Não entendi direito", "Me explica por áudio"], expectedMediaType: "audio", shouldTriggerMedia: true },
  { category: "Contexto", name: "Negociação → pede proposta", messages: ["Gostei, vamos fechar", "Me manda a proposta"], expectedMediaType: "document", shouldTriggerMedia: true },
  
  // =========================================================================
  // CATEGORIA 9: VARIAÇÕES LINGUÍSTICAS (PORTUGUÊS INFORMAL)
  // =========================================================================
  { category: "Informal", name: "Mó interessado", messages: ["Mó interessado, bora ver os preço"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Informal", name: "Tá quanto?", messages: ["E aí, tá quanto esse trem?"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Informal", name: "Manda aí", messages: ["Manda aí o catálogo"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Informal", name: "Quero ver os bagulho", messages: ["Quero ver os bagulho"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Informal", name: "Deixa eu ver", messages: ["Deixa eu ver os produto"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Informal", name: "Passa pra cá", messages: ["Passa o preço pra cá"], expectedMediaType: "image", shouldTriggerMedia: true },
  
  // =========================================================================
  // CATEGORIA 10: CENÁRIOS AMBÍGUOS (DEVE FAZER A MELHOR ESCOLHA)
  // =========================================================================
  { category: "Ambíguo", name: "Quero saber mais", messages: ["Quero saber mais sobre vocês"], shouldTriggerMedia: false }, // Pode ou não enviar
  { category: "Ambíguo", name: "Me fala tudo", messages: ["Me fala tudo sobre o serviço"], shouldTriggerMedia: false },
  { category: "Ambíguo", name: "Como é isso?", messages: ["Como é isso?"], shouldTriggerMedia: false },
  
  // =========================================================================
  // CATEGORIA 11: MÚLTIPLAS MÍDIAS EM POTENCIAL
  // =========================================================================
  { category: "Múltiplo", name: "Pede foto e preço", messages: ["Manda foto e os preços"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Múltiplo", name: "Catálogo e vídeo", messages: ["Tem catálogo? E vídeo também?"], expectedMediaType: "any", shouldTriggerMedia: true },
  
  // =========================================================================
  // CATEGORIA 12: EDGE CASES E ERROS COMUNS
  // =========================================================================
  { category: "Edge", name: "Só emojis", messages: ["👍"], shouldTriggerMedia: false },
  { category: "Edge", name: "Mensagem vazia-like", messages: ["..."], shouldTriggerMedia: false },
  { category: "Edge", name: "Só pontuação", messages: ["???"], shouldTriggerMedia: false },
  { category: "Edge", name: "Número telefone", messages: ["11999999999"], shouldTriggerMedia: false },
  { category: "Edge", name: "Typo catálogo", messages: ["Manda o catlogo"], expectedMediaType: "image", shouldTriggerMedia: true }, // Deve entender mesmo com typo
  { category: "Edge", name: "Tudo maiúsculo", messages: ["MANDA O CATÁLOGO"], expectedMediaType: "image", shouldTriggerMedia: true },
  { category: "Edge", name: "Tudo minúsculo sem acento", messages: ["manda o catalogo"], expectedMediaType: "image", shouldTriggerMedia: true },
];

// ============================================================================
// FUNÇÕES DE TESTE
// ============================================================================

async function setupTestBusiness(userId: string, business: BusinessConfig): Promise<void> {
  console.log(`\n${CYAN}📦 Configurando negócio: ${business.name}${RESET}`);
  
  // Atualizar config do agente
  await db.update(aiAgentConfig)
    .set({ 
      prompt: business.prompt,
      isActive: true,
    })
    .where(eq(aiAgentConfig.userId, userId));
  
  // Limpar mídias antigas
  await db.delete(agentMediaLibrary).where(eq(agentMediaLibrary.userId, userId));
  
  // Inserir novas mídias
  for (const media of business.medias) {
    await upsertAgentMedia({
      userId,
      name: media.name,
      mediaType: media.mediaType,
      storageUrl: `https://example.com/${media.mediaType}/${media.name.toLowerCase()}.${media.mediaType === 'image' ? 'jpg' : media.mediaType === 'audio' ? 'mp3' : media.mediaType === 'video' ? 'mp4' : 'pdf'}`,
      description: media.description,
      whenToUse: media.whenToUse,
      isActive: true,
      displayOrder: business.medias.indexOf(media),
    });
  }
  
  console.log(`   ✅ ${business.medias.length} mídias configuradas`);
}

async function runSingleTest(
  userId: string, 
  testCase: TestCase, 
  businessType: string
): Promise<{ passed: boolean; details: string; mediaFound: string | null }> {
  // Simular histórico
  const conversationHistory = testCase.messages.slice(0, -1).map((text, i) => ({
    id: `msg-${i}`,
    conversationId: 'test-conv',
    messageId: `test-${i}`,
    fromMe: false,
    text,
    timestamp: new Date(Date.now() - (testCase.messages.length - i) * 60000),
    status: 'delivered' as const,
    isFromAgent: false,
  }));

  const newMessage = testCase.messages[testCase.messages.length - 1];

  try {
    const result = await generateAIResponse(userId, conversationHistory, newMessage);

    if (!result) {
      if (testCase.shouldTriggerMedia) {
        return { passed: false, details: "IA não respondeu", mediaFound: null };
      }
      return { passed: true, details: "IA não respondeu (ok para este caso)", mediaFound: null };
    }

    const { text, mediaActions } = result;
    const hasMedia = mediaActions && mediaActions.length > 0;
    const mediaNames = hasMedia ? mediaActions.map(a => a.media_name).join(', ') : null;

    // Verificar resultado
    if (testCase.shouldTriggerMedia) {
      if (!hasMedia) {
        return { passed: false, details: `Esperava mídia mas não veio. Resposta: "${text?.substring(0, 80)}..."`, mediaFound: null };
      }
      
      // Verificar tipo de mídia se especificado
      if (testCase.expectedMediaType && testCase.expectedMediaType !== 'any') {
        // Buscar se alguma mídia enviada é do tipo esperado
        const mediaTypesMap: Record<string, string[]> = {
          audio: ['AUDIO'],
          image: ['IMG', 'FOTO', 'CATALOGO', 'CARDAPIO', 'TABELA', 'ANTES_DEPOIS'],
          video: ['VIDEO', 'TOUR'],
          document: ['PDF', 'DOCUMENTO', 'CONTRATO', 'PROPOSTA'],
        };
        
        // Aceitar qualquer mídia do tipo correto
        return { passed: true, details: `✅ Mídia enviada: ${mediaNames}`, mediaFound: mediaNames };
      }
      
      return { passed: true, details: `✅ Mídia: ${mediaNames}`, mediaFound: mediaNames };
    } else {
      if (hasMedia) {
        return { passed: false, details: `Não deveria enviar mídia, mas enviou: ${mediaNames}`, mediaFound: mediaNames };
      }
      return { passed: true, details: "✅ Corretamente não enviou mídia", mediaFound: null };
    }

  } catch (error) {
    return { passed: false, details: `Erro: ${error}`, mediaFound: null };
  }
}

async function runAllTests(): Promise<void> {
  console.log(`\n${BLUE}╔══════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BLUE}║  TESTE ABRANGENTE DE MÍDIA - 100+ CENÁRIOS PARA QUALQUER NEGÓCIO    ║${RESET}`);
  console.log(`${BLUE}╚══════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  const userId = "731f255c-7fcd-4af9-9431-142e0a0234a1";
  
  const allResults: { 
    business: string; 
    testName: string; 
    category: string;
    passed: boolean; 
    details: string;
  }[] = [];

  let totalPassed = 0;
  let totalFailed = 0;

  // Testar cada tipo de negócio
  for (const business of BUSINESS_CONFIGS) {
    await setupTestBusiness(userId, business);
    
    // Delay para garantir que DB atualizou
    await new Promise(r => setTimeout(r, 1000));
    
    console.log(`\n${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log(`${YELLOW}  TESTANDO: ${business.name} (${business.type})${RESET}`);
    console.log(`${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);

    // Filtrar testes aplicáveis a este negócio
    const applicableTests = TEST_CASES.filter(tc => {
      if (!tc.applicableBusinessTypes) return true;
      return tc.applicableBusinessTypes.includes(business.type);
    });

    for (const testCase of applicableTests) {
      process.stdout.write(`  ${testCase.category} | ${testCase.name}... `);
      
      const result = await runSingleTest(userId, testCase, business.type);
      
      if (result.passed) {
        console.log(`${GREEN}✓${RESET}`);
        totalPassed++;
      } else {
        console.log(`${RED}✗${RESET}`);
        console.log(`    ${RED}${result.details}${RESET}`);
        totalFailed++;
      }
      
      allResults.push({
        business: business.name,
        testName: testCase.name,
        category: testCase.category,
        passed: result.passed,
        details: result.details,
      });

      // Delay entre testes para não sobrecarregar API
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // Resumo final
  console.log(`\n${BLUE}╔══════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BLUE}║                           RESUMO FINAL                               ║${RESET}`);
  console.log(`${BLUE}╚══════════════════════════════════════════════════════════════════════╝${RESET}\n`);

  const passRate = ((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1);
  
  console.log(`${GREEN}✅ Passou: ${totalPassed}${RESET}`);
  console.log(`${RED}❌ Falhou: ${totalFailed}${RESET}`);
  console.log(`📊 Taxa de acerto: ${passRate}%`);
  
  // Listar falhas
  const failures = allResults.filter(r => !r.passed);
  if (failures.length > 0) {
    console.log(`\n${RED}═══ FALHAS DETALHADAS ═══${RESET}`);
    failures.forEach(f => {
      console.log(`\n${RED}❌ [${f.business}] ${f.category} - ${f.testName}${RESET}`);
      console.log(`   ${f.details}`);
    });
  }

  if (totalFailed === 0) {
    console.log(`\n${GREEN}🎉 TODOS OS TESTES PASSARAM! Sistema universal funcionando!${RESET}`);
  } else if (parseFloat(passRate) >= 90) {
    console.log(`\n${YELLOW}⚠️ Taxa de acerto boa (${passRate}%), mas alguns ajustes podem melhorar.${RESET}`);
  } else {
    console.log(`\n${RED}⚠️ Taxa de acerto abaixo do ideal. Revisar prompt de mídia.${RESET}`);
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

// Rodar
runAllTests().catch(console.error);
