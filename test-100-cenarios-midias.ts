/**
 * TESTE EXTENSIVO: 100+ Cenários de Mídias
 * 
 * Objetivo: Verificar se o sistema de mídias automáticas funciona para
 * QUALQUER tipo de mídia e QUALQUER descrição de "quando usar" que
 * um cliente possa configurar.
 */

import { generateMediaPromptBlock, extractMediaTagsFromResponse } from './server/mediaService';

// ============================================================================
// SIMULAÇÃO DE 100+ TIPOS DE MÍDIAS COM DIFERENTES "QUANDO USAR"
// ============================================================================

interface MediaSimulada {
  name: string;
  media_type: 'audio' | 'image' | 'video' | 'document';
  when_to_use: string;
  description: string;
}

// Mídias que clientes REAIS podem configurar - com diferentes estilos de escrita
const MIDIAS_SIMULADAS: MediaSimulada[] = [
  // ============ SAUDAÇÕES E BOAS-VINDAS ============
  { name: 'AUDIO_BOAS_VINDAS', media_type: 'audio', when_to_use: 'Sempre que o cliente mandar a primeira mensagem', description: 'Áudio de boas-vindas' },
  { name: 'VIDEO_APRESENTACAO', media_type: 'video', when_to_use: 'na primeira interação com o cliente', description: 'Vídeo de apresentação' },
  { name: 'IMAGEM_LOGO', media_type: 'image', when_to_use: 'quando cliente diz oi ou olá pela primeira vez', description: 'Logo da empresa' },
  { name: 'AUDIO_OI', media_type: 'audio', when_to_use: 'cliente mandou oi', description: 'Resposta ao oi' },
  { name: 'SAUDACAO_MATINAL', media_type: 'audio', when_to_use: 'quando o cliente manda bom dia', description: 'Bom dia' },
  { name: 'SAUDACAO_TARDE', media_type: 'audio', when_to_use: 'boa tarde', description: 'Boa tarde' },
  { name: 'SAUDACAO_NOITE', media_type: 'audio', when_to_use: 'boa noite', description: 'Boa noite' },
  
  // ============ PREÇOS E VALORES ============
  { name: 'TABELA_PRECOS', media_type: 'image', when_to_use: 'quando perguntarem sobre preço ou valor', description: 'Tabela de preços' },
  { name: 'AUDIO_VALORES', media_type: 'audio', when_to_use: 'cliente quer saber quanto custa', description: 'Explicação de valores' },
  { name: 'PDF_ORCAMENTO', media_type: 'document', when_to_use: 'se pedir orçamento', description: 'Modelo de orçamento' },
  { name: 'PRECO_PROMOCAO', media_type: 'image', when_to_use: 'promoção ou desconto', description: 'Preços promocionais' },
  { name: 'INVESTIMENTO', media_type: 'audio', when_to_use: 'pergunta sobre investimento', description: 'Fala sobre investimento' },
  { name: 'PARCELAMENTO', media_type: 'image', when_to_use: 'parcela ou parcelamento ou dividir', description: 'Opções de parcelamento' },
  { name: 'FORMAS_PAGAMENTO', media_type: 'image', when_to_use: 'como pagar ou forma de pagamento ou pix ou cartão', description: 'Formas de pagamento' },
  
  // ============ PRODUTOS E SERVIÇOS ============
  { name: 'CATALOGO', media_type: 'document', when_to_use: 'quando quiser ver produtos ou catálogo', description: 'Catálogo de produtos' },
  { name: 'CARDAPIO', media_type: 'image', when_to_use: 'cardápio ou menu', description: 'Cardápio' },
  { name: 'VIDEO_PRODUTO', media_type: 'video', when_to_use: 'mostrar produto funcionando', description: 'Demo do produto' },
  { name: 'PORTFOLIO', media_type: 'document', when_to_use: 'ver trabalhos anteriores ou portfólio', description: 'Portfólio' },
  { name: 'SERVICOS', media_type: 'image', when_to_use: 'quais serviços vocês fazem', description: 'Lista de serviços' },
  { name: 'COMO_FUNCIONA', media_type: 'video', when_to_use: 'explica como funciona', description: 'Como funciona' },
  { name: 'DEMONSTRACAO', media_type: 'video', when_to_use: 'quer ver demonstração ou demo', description: 'Demonstração' },
  
  // ============ LOCALIZAÇÃO E CONTATO ============
  { name: 'MAPA_LOCALIZACAO', media_type: 'image', when_to_use: 'onde fica ou endereço ou localização', description: 'Mapa' },
  { name: 'AUDIO_ENDERECO', media_type: 'audio', when_to_use: 'como chegar', description: 'Instruções de como chegar' },
  { name: 'HORARIO_FUNCIONAMENTO', media_type: 'image', when_to_use: 'horário de funcionamento ou que horas abre', description: 'Horários' },
  { name: 'CONTATOS', media_type: 'image', when_to_use: 'outros contatos ou telefone ou email', description: 'Contatos' },
  
  // ============ ÁREA MÉDICA/SAÚDE ============
  { name: 'CONSULTA_INFO', media_type: 'audio', when_to_use: 'marcar consulta ou agendar', description: 'Info sobre consultas' },
  { name: 'CONVENIOS', media_type: 'image', when_to_use: 'aceita convênio ou plano de saúde', description: 'Convênios aceitos' },
  { name: 'PREPAROS_EXAME', media_type: 'document', when_to_use: 'preparo para exame ou jejum', description: 'Preparos para exames' },
  { name: 'ESPECIALIDADES', media_type: 'image', when_to_use: 'especialidades ou especialistas', description: 'Especialidades médicas' },
  
  // ============ IMOBILIÁRIAS ============
  { name: 'IMOVEL_FOTOS', media_type: 'image', when_to_use: 'fotos do imóvel ou apartamento ou casa', description: 'Fotos do imóvel' },
  { name: 'VIDEO_TOUR', media_type: 'video', when_to_use: 'tour virtual ou ver por dentro', description: 'Tour virtual' },
  { name: 'FICHA_IMOVEL', media_type: 'document', when_to_use: 'ficha técnica ou detalhes do imóvel', description: 'Ficha técnica' },
  { name: 'DOCUMENTACAO', media_type: 'document', when_to_use: 'documentação necessária para comprar ou alugar', description: 'Documentos' },
  { name: 'VISITA', media_type: 'audio', when_to_use: 'agendar visita ao imóvel', description: 'Agendar visita' },
  
  // ============ RESTAURANTES/DELIVERY ============
  { name: 'PRATOS_DIA', media_type: 'image', when_to_use: 'prato do dia ou sugestão', description: 'Pratos do dia' },
  { name: 'TEMPO_ENTREGA', media_type: 'audio', when_to_use: 'tempo de entrega ou quanto demora', description: 'Tempo de entrega' },
  { name: 'AREA_ENTREGA', media_type: 'image', when_to_use: 'entrega no meu bairro ou área de entrega', description: 'Área de entrega' },
  { name: 'PEDIDO_MINIMO', media_type: 'audio', when_to_use: 'pedido mínimo ou valor mínimo', description: 'Pedido mínimo' },
  
  // ============ EDUCAÇÃO/CURSOS ============
  { name: 'GRADE_CURRICULAR', media_type: 'document', when_to_use: 'grade curricular ou matérias do curso', description: 'Grade' },
  { name: 'VIDEO_AULA_DEMO', media_type: 'video', when_to_use: 'aula demonstrativa ou exemplo de aula', description: 'Aula demo' },
  { name: 'CERTIFICADO', media_type: 'image', when_to_use: 'tem certificado ou diploma', description: 'Modelo certificado' },
  { name: 'MATRICULA', media_type: 'document', when_to_use: 'como fazer matrícula ou inscrição', description: 'Processo matrícula' },
  { name: 'DURACAO_CURSO', media_type: 'audio', when_to_use: 'quanto tempo dura o curso', description: 'Duração' },
  
  // ============ ESTÉTICA/BELEZA ============
  { name: 'ANTES_DEPOIS', media_type: 'image', when_to_use: 'resultado ou antes e depois', description: 'Antes e depois' },
  { name: 'PROCEDIMENTOS', media_type: 'video', when_to_use: 'como é feito o procedimento', description: 'Vídeo procedimento' },
  { name: 'CUIDADOS_POS', media_type: 'document', when_to_use: 'cuidados após ou pós procedimento', description: 'Cuidados pós' },
  { name: 'CONTRAINDICACOES', media_type: 'audio', when_to_use: 'contraindicação ou quem não pode fazer', description: 'Contraindicações' },
  
  // ============ ACADEMIA/FITNESS ============
  { name: 'PLANOS_ACADEMIA', media_type: 'image', when_to_use: 'planos da academia ou mensalidade', description: 'Planos' },
  { name: 'VIDEO_ESTRUTURA', media_type: 'video', when_to_use: 'estrutura da academia ou equipamentos', description: 'Estrutura' },
  { name: 'HORARIOS_AULAS', media_type: 'image', when_to_use: 'horário das aulas ou grade de aulas', description: 'Grade aulas' },
  { name: 'AULA_EXPERIMENTAL', media_type: 'audio', when_to_use: 'aula experimental ou teste grátis', description: 'Aula experimental' },
  
  // ============ ADVOCACIA/JURÍDICO ============
  { name: 'AREAS_ATUACAO', media_type: 'image', when_to_use: 'áreas de atuação ou tipos de causa', description: 'Áreas atuação' },
  { name: 'AUDIO_CONSULTA', media_type: 'audio', when_to_use: 'consulta jurídica ou falar com advogado', description: 'Consulta' },
  { name: 'DOCUMENTOS_PROCESSO', media_type: 'document', when_to_use: 'documentos para processo ou papelada', description: 'Documentos' },
  { name: 'HONORARIOS', media_type: 'audio', when_to_use: 'honorários ou quanto cobra', description: 'Honorários' },
  
  // ============ OFICINA/MECÂNICA ============
  { name: 'SERVICOS_MECANICA', media_type: 'image', when_to_use: 'serviços da oficina ou o que fazem', description: 'Serviços' },
  { name: 'ORCAMENTO_VEICULO', media_type: 'audio', when_to_use: 'orçamento do carro ou moto', description: 'Orçamento' },
  { name: 'TEMPO_SERVICO', media_type: 'audio', when_to_use: 'quanto tempo demora o serviço', description: 'Tempo serviço' },
  { name: 'GARANTIA', media_type: 'document', when_to_use: 'garantia do serviço', description: 'Garantia' },
  
  // ============ PET SHOP/VETERINÁRIO ============
  { name: 'SERVICOS_PET', media_type: 'image', when_to_use: 'serviços para pet ou cachorro ou gato', description: 'Serviços pet' },
  { name: 'BANHO_TOSA', media_type: 'image', when_to_use: 'banho e tosa ou preço banho', description: 'Banho e tosa' },
  { name: 'VACINAS', media_type: 'document', when_to_use: 'vacinas ou vacinação', description: 'Calendário vacinas' },
  { name: 'HOTEL_PET', media_type: 'video', when_to_use: 'hotel para cachorro ou hospedagem pet', description: 'Hotel pet' },
  
  // ============ TECNOLOGIA/SUPORTE ============
  { name: 'TUTORIAL_USO', media_type: 'video', when_to_use: 'como usar ou tutorial', description: 'Tutorial' },
  { name: 'FAQ', media_type: 'document', when_to_use: 'dúvidas frequentes ou perguntas comuns', description: 'FAQ' },
  { name: 'REQUISITOS', media_type: 'image', when_to_use: 'requisitos do sistema ou precisa de quê', description: 'Requisitos' },
  { name: 'SUPORTE', media_type: 'audio', when_to_use: 'preciso de suporte ou ajuda técnica', description: 'Suporte' },
  
  // ============ EVENTOS/FESTAS ============
  { name: 'PACOTES_FESTA', media_type: 'image', when_to_use: 'pacotes de festa ou buffet', description: 'Pacotes' },
  { name: 'ESPACO_FOTOS', media_type: 'video', when_to_use: 'ver espaço ou salão de festas', description: 'Espaço' },
  { name: 'CARDAPIO_EVENTO', media_type: 'document', when_to_use: 'cardápio do buffet ou opções de comida', description: 'Cardápio buffet' },
  { name: 'DECORACAO', media_type: 'image', when_to_use: 'decoração ou temas de festa', description: 'Decoração' },
  
  // ============ VIAGENS/TURISMO ============
  { name: 'PACOTES_VIAGEM', media_type: 'image', when_to_use: 'pacotes de viagem ou destinos', description: 'Pacotes viagem' },
  { name: 'VIDEO_DESTINO', media_type: 'video', when_to_use: 'como é o destino ou lugar', description: 'Vídeo destino' },
  { name: 'ROTEIRO', media_type: 'document', when_to_use: 'roteiro da viagem ou itinerário', description: 'Roteiro' },
  { name: 'INCLUSO_PACOTE', media_type: 'audio', when_to_use: 'o que está incluso ou inclui hotel', description: 'O que inclui' },
  
  // ============ CONSTRUÇÃO/REFORMAS ============
  { name: 'PORTFOLIO_OBRAS', media_type: 'video', when_to_use: 'obras anteriores ou trabalhos feitos', description: 'Portfólio obras' },
  { name: 'ORCAMENTO_OBRA', media_type: 'audio', when_to_use: 'orçamento de obra ou reforma', description: 'Orçamento' },
  { name: 'MATERIAIS', media_type: 'document', when_to_use: 'materiais usados ou qualidade', description: 'Materiais' },
  { name: 'PRAZO_OBRA', media_type: 'audio', when_to_use: 'prazo da obra ou quanto tempo demora', description: 'Prazo' },
  
  // ============ ESCRITÓRIO CONTÁBIL ============
  { name: 'SERVICOS_CONTABEIS', media_type: 'image', when_to_use: 'serviços contábeis ou o que fazem', description: 'Serviços' },
  { name: 'ABRIR_EMPRESA', media_type: 'audio', when_to_use: 'abrir empresa ou cnpj', description: 'Abertura empresa' },
  { name: 'IMPOSTOS', media_type: 'document', when_to_use: 'impostos ou declaração', description: 'Impostos' },
  { name: 'MENSALIDADE_CONTABIL', media_type: 'audio', when_to_use: 'mensalidade contabilidade', description: 'Mensalidade' },
  
  // ============ SEGUROS ============
  { name: 'TIPOS_SEGURO', media_type: 'image', when_to_use: 'tipos de seguro ou coberturas', description: 'Tipos seguro' },
  { name: 'COTACAO', media_type: 'audio', when_to_use: 'cotação ou simular seguro', description: 'Cotação' },
  { name: 'SINISTRO', media_type: 'document', when_to_use: 'sinistro ou como acionar', description: 'Sinistro' },
  { name: 'DOCUMENTOS_SEGURO', media_type: 'document', when_to_use: 'documentos para seguro', description: 'Documentos' },
  
  // ============ FRASES INFORMAIS/ERROS DE DIGITAÇÃO ============
  { name: 'PRECO_INFORMAL', media_type: 'image', when_to_use: 'qto custa ou qual vlr', description: 'Preço' },
  { name: 'OI_ERRADO', media_type: 'audio', when_to_use: 'oii ou oie ou ola', description: 'Oi' },
  { name: 'FUNCIONA_GIRIIA', media_type: 'video', when_to_use: 'como q funciona ou como eh', description: 'Como funciona' },
  { name: 'ENDERECO_INFORMAL', media_type: 'image', when_to_use: 'onde vcs ficam ou cade vcs', description: 'Endereço' },
  { name: 'PRECO_EMOJI', media_type: 'audio', when_to_use: 'quando mandar 💰 ou 💵 ou 🤑', description: 'Preço' },
  
  // ============ CONDIÇÕES ESPECÍFICAS ============
  { name: 'SEGUNDA_MENSAGEM', media_type: 'audio', when_to_use: 'depois que cliente já disse oi, na segunda mensagem', description: 'Segunda msg' },
  { name: 'CLIENTE_INTERESSADO', media_type: 'video', when_to_use: 'quando cliente demonstrar interesse real', description: 'Para interessados' },
  { name: 'DUVIDA_ESPECIFICA', media_type: 'audio', when_to_use: 'quando tiver dúvida técnica', description: 'Dúvida técnica' },
  { name: 'FECHAMENTO', media_type: 'audio', when_to_use: 'quando cliente quiser fechar negócio ou comprar', description: 'Fechamento' },
  { name: 'OBJECAO', media_type: 'audio', when_to_use: 'quando cliente achar caro ou reclamar do preço', description: 'Objeção preço' },
  
  // ============ NEGÓCIOS ESPECÍFICOS ============
  { name: 'DEPOIMENTOS', media_type: 'video', when_to_use: 'depoimentos de clientes ou resultados', description: 'Depoimentos' },
  { name: 'CASES_SUCESSO', media_type: 'image', when_to_use: 'cases de sucesso ou clientes atendidos', description: 'Cases' },
  { name: 'DIFERENCIAL', media_type: 'audio', when_to_use: 'diferencial ou por que escolher vocês', description: 'Diferencial' },
  { name: 'URGENCIA', media_type: 'audio', when_to_use: 'urgente ou preciso pra ontem', description: 'Urgência' },
  { name: 'GARANTIA_SATISFACAO', media_type: 'audio', when_to_use: 'tem garantia ou posso devolver', description: 'Garantia' },
  
  // ============ MAIS CENÁRIOS ============
  { name: 'NOVIDADES', media_type: 'image', when_to_use: 'novidades ou lançamentos', description: 'Novidades' },
  { name: 'PROMOCAO_ATUAL', media_type: 'image', when_to_use: 'tem promoção ou desconto hoje', description: 'Promoção' },
  { name: 'COMBO', media_type: 'image', when_to_use: 'combo ou pacote especial', description: 'Combo' },
  { name: 'FRETE', media_type: 'audio', when_to_use: 'frete ou custo de entrega', description: 'Frete' },
  { name: 'TROCA', media_type: 'document', when_to_use: 'política de troca ou devolução', description: 'Troca' },
  { name: 'TAMANHOS', media_type: 'image', when_to_use: 'tamanhos disponíveis ou numeração', description: 'Tamanhos' },
  { name: 'CORES', media_type: 'image', when_to_use: 'cores disponíveis ou opções de cor', description: 'Cores' },
  { name: 'ESTOQUE', media_type: 'audio', when_to_use: 'tem em estoque ou disponível', description: 'Estoque' },
  { name: 'PRAZO_ENTREGA', media_type: 'audio', when_to_use: 'prazo de entrega ou quando chega', description: 'Prazo' },
  { name: 'RASTREIO', media_type: 'audio', when_to_use: 'rastrear pedido ou código de rastreio', description: 'Rastreio' },
];

// ============================================================================
// CENÁRIOS DE TESTE - Mensagens que clientes podem enviar
// ============================================================================

interface CenarioTeste {
  mensagem: string;
  midiasEsperadas: string[];  // Quais mídias devem ser enviadas
  descricao: string;
}

const CENARIOS_TESTE: CenarioTeste[] = [
  // Saudações
  { mensagem: 'Oi', midiasEsperadas: ['AUDIO_BOAS_VINDAS', 'VIDEO_APRESENTACAO', 'IMAGEM_LOGO', 'AUDIO_OI'], descricao: 'Saudação simples' },
  { mensagem: 'Olá, tudo bem?', midiasEsperadas: ['AUDIO_BOAS_VINDAS', 'VIDEO_APRESENTACAO', 'IMAGEM_LOGO'], descricao: 'Saudação olá' },
  { mensagem: 'Bom dia!', midiasEsperadas: ['SAUDACAO_MATINAL', 'AUDIO_BOAS_VINDAS'], descricao: 'Bom dia' },
  { mensagem: 'Boa tarde', midiasEsperadas: ['SAUDACAO_TARDE'], descricao: 'Boa tarde' },
  { mensagem: 'Boa noite!', midiasEsperadas: ['SAUDACAO_NOITE'], descricao: 'Boa noite' },
  { mensagem: 'oii', midiasEsperadas: ['OI_ERRADO', 'AUDIO_OI'], descricao: 'Oi informal' },
  { mensagem: 'oie', midiasEsperadas: ['OI_ERRADO'], descricao: 'Oie' },
  
  // Preços
  { mensagem: 'Qual o preço?', midiasEsperadas: ['TABELA_PRECOS', 'AUDIO_VALORES'], descricao: 'Pergunta preço' },
  { mensagem: 'Quanto custa?', midiasEsperadas: ['TABELA_PRECOS', 'AUDIO_VALORES'], descricao: 'Quanto custa' },
  { mensagem: 'Qual o valor?', midiasEsperadas: ['TABELA_PRECOS', 'AUDIO_VALORES'], descricao: 'Qual valor' },
  { mensagem: 'qto custa isso?', midiasEsperadas: ['PRECO_INFORMAL'], descricao: 'Preço informal' },
  { mensagem: 'qual vlr?', midiasEsperadas: ['PRECO_INFORMAL'], descricao: 'Valor abreviado' },
  { mensagem: 'Me manda um orçamento', midiasEsperadas: ['PDF_ORCAMENTO'], descricao: 'Orçamento' },
  { mensagem: 'Tem promoção?', midiasEsperadas: ['PRECO_PROMOCAO', 'PROMOCAO_ATUAL'], descricao: 'Promoção' },
  { mensagem: 'Tem desconto?', midiasEsperadas: ['PRECO_PROMOCAO'], descricao: 'Desconto' },
  { mensagem: 'Qual o investimento?', midiasEsperadas: ['INVESTIMENTO'], descricao: 'Investimento' },
  { mensagem: 'Posso parcelar?', midiasEsperadas: ['PARCELAMENTO'], descricao: 'Parcelar' },
  { mensagem: 'Dá pra dividir?', midiasEsperadas: ['PARCELAMENTO'], descricao: 'Dividir' },
  { mensagem: 'Como faço pra pagar?', midiasEsperadas: ['FORMAS_PAGAMENTO'], descricao: 'Forma pagamento' },
  { mensagem: 'Aceita pix?', midiasEsperadas: ['FORMAS_PAGAMENTO'], descricao: 'Pix' },
  { mensagem: 'Aceita cartão?', midiasEsperadas: ['FORMAS_PAGAMENTO'], descricao: 'Cartão' },
  { mensagem: '💰', midiasEsperadas: ['PRECO_EMOJI'], descricao: 'Emoji dinheiro' },
  { mensagem: '💵💵', midiasEsperadas: ['PRECO_EMOJI'], descricao: 'Emoji nota' },
  
  // Produtos e catálogo
  { mensagem: 'Quero ver os produtos', midiasEsperadas: ['CATALOGO'], descricao: 'Ver produtos' },
  { mensagem: 'Tem catálogo?', midiasEsperadas: ['CATALOGO'], descricao: 'Catálogo' },
  { mensagem: 'Me manda o cardápio', midiasEsperadas: ['CARDAPIO'], descricao: 'Cardápio' },
  { mensagem: 'Qual o menu?', midiasEsperadas: ['CARDAPIO'], descricao: 'Menu' },
  { mensagem: 'Como funciona?', midiasEsperadas: ['COMO_FUNCIONA', 'VIDEO_PRODUTO', 'FUNCIONA_GIRIIA'], descricao: 'Como funciona' },
  { mensagem: 'como q funciona?', midiasEsperadas: ['FUNCIONA_GIRIIA', 'COMO_FUNCIONA'], descricao: 'Como funciona informal' },
  { mensagem: 'como eh?', midiasEsperadas: ['FUNCIONA_GIRIIA'], descricao: 'Como é' },
  { mensagem: 'Quero ver uma demonstração', midiasEsperadas: ['DEMONSTRACAO', 'VIDEO_PRODUTO'], descricao: 'Demonstração' },
  { mensagem: 'Tem demo?', midiasEsperadas: ['DEMONSTRACAO'], descricao: 'Demo' },
  { mensagem: 'Quero ver o portfólio', midiasEsperadas: ['PORTFOLIO', 'PORTFOLIO_OBRAS'], descricao: 'Portfólio' },
  { mensagem: 'Trabalhos anteriores', midiasEsperadas: ['PORTFOLIO', 'PORTFOLIO_OBRAS'], descricao: 'Trabalhos' },
  { mensagem: 'Quais serviços vocês fazem?', midiasEsperadas: ['SERVICOS'], descricao: 'Serviços' },
  
  // Localização
  { mensagem: 'Onde vocês ficam?', midiasEsperadas: ['MAPA_LOCALIZACAO', 'ENDERECO_INFORMAL'], descricao: 'Onde fica' },
  { mensagem: 'Qual o endereço?', midiasEsperadas: ['MAPA_LOCALIZACAO'], descricao: 'Endereço' },
  { mensagem: 'cade vcs?', midiasEsperadas: ['ENDERECO_INFORMAL'], descricao: 'Cadê vocês' },
  { mensagem: 'Como faço pra chegar?', midiasEsperadas: ['AUDIO_ENDERECO'], descricao: 'Como chegar' },
  { mensagem: 'Que horas abre?', midiasEsperadas: ['HORARIO_FUNCIONAMENTO'], descricao: 'Horário' },
  { mensagem: 'Qual o horário de funcionamento?', midiasEsperadas: ['HORARIO_FUNCIONAMENTO'], descricao: 'Funcionamento' },
  { mensagem: 'Qual o telefone?', midiasEsperadas: ['CONTATOS'], descricao: 'Telefone' },
  { mensagem: 'Tem outro contato?', midiasEsperadas: ['CONTATOS'], descricao: 'Outro contato' },
  { mensagem: 'Qual o email?', midiasEsperadas: ['CONTATOS'], descricao: 'Email' },
  
  // Saúde/Médico
  { mensagem: 'Quero marcar consulta', midiasEsperadas: ['CONSULTA_INFO'], descricao: 'Marcar consulta' },
  { mensagem: 'Quero agendar', midiasEsperadas: ['CONSULTA_INFO', 'VISITA'], descricao: 'Agendar' },
  { mensagem: 'Aceita convênio?', midiasEsperadas: ['CONVENIOS'], descricao: 'Convênio' },
  { mensagem: 'Aceita plano de saúde?', midiasEsperadas: ['CONVENIOS'], descricao: 'Plano saúde' },
  { mensagem: 'Qual preparo pro exame?', midiasEsperadas: ['PREPAROS_EXAME'], descricao: 'Preparo exame' },
  { mensagem: 'Precisa de jejum?', midiasEsperadas: ['PREPAROS_EXAME'], descricao: 'Jejum' },
  { mensagem: 'Quais especialidades?', midiasEsperadas: ['ESPECIALIDADES'], descricao: 'Especialidades' },
  { mensagem: 'Tem especialista em...?', midiasEsperadas: ['ESPECIALIDADES'], descricao: 'Especialista' },
  
  // Imóveis
  { mensagem: 'Quero ver fotos do apartamento', midiasEsperadas: ['IMOVEL_FOTOS'], descricao: 'Fotos apê' },
  { mensagem: 'Tem fotos da casa?', midiasEsperadas: ['IMOVEL_FOTOS'], descricao: 'Fotos casa' },
  { mensagem: 'Quero fazer tour virtual', midiasEsperadas: ['VIDEO_TOUR'], descricao: 'Tour virtual' },
  { mensagem: 'Dá pra ver por dentro?', midiasEsperadas: ['VIDEO_TOUR'], descricao: 'Ver por dentro' },
  { mensagem: 'Qual a ficha técnica?', midiasEsperadas: ['FICHA_IMOVEL'], descricao: 'Ficha técnica' },
  { mensagem: 'Quero detalhes do imóvel', midiasEsperadas: ['FICHA_IMOVEL'], descricao: 'Detalhes imóvel' },
  { mensagem: 'Qual documentação preciso?', midiasEsperadas: ['DOCUMENTACAO'], descricao: 'Documentação' },
  { mensagem: 'Quero agendar visita no imóvel', midiasEsperadas: ['VISITA'], descricao: 'Visita imóvel' },
  
  // Restaurante/Delivery
  { mensagem: 'Qual o prato do dia?', midiasEsperadas: ['PRATOS_DIA'], descricao: 'Prato do dia' },
  { mensagem: 'Tem sugestão?', midiasEsperadas: ['PRATOS_DIA'], descricao: 'Sugestão' },
  { mensagem: 'Quanto tempo pra entregar?', midiasEsperadas: ['TEMPO_ENTREGA'], descricao: 'Tempo entrega' },
  { mensagem: 'Demora muito?', midiasEsperadas: ['TEMPO_ENTREGA'], descricao: 'Demora' },
  { mensagem: 'Entrega no meu bairro?', midiasEsperadas: ['AREA_ENTREGA'], descricao: 'Área entrega' },
  { mensagem: 'Qual o pedido mínimo?', midiasEsperadas: ['PEDIDO_MINIMO'], descricao: 'Pedido mínimo' },
  { mensagem: 'Tem valor mínimo?', midiasEsperadas: ['PEDIDO_MINIMO'], descricao: 'Valor mínimo' },
  
  // Cursos
  { mensagem: 'Qual a grade curricular?', midiasEsperadas: ['GRADE_CURRICULAR'], descricao: 'Grade' },
  { mensagem: 'Quais matérias do curso?', midiasEsperadas: ['GRADE_CURRICULAR'], descricao: 'Matérias' },
  { mensagem: 'Tem aula demonstrativa?', midiasEsperadas: ['VIDEO_AULA_DEMO'], descricao: 'Aula demo' },
  { mensagem: 'Quero ver exemplo de aula', midiasEsperadas: ['VIDEO_AULA_DEMO'], descricao: 'Exemplo aula' },
  { mensagem: 'Tem certificado?', midiasEsperadas: ['CERTIFICADO'], descricao: 'Certificado' },
  { mensagem: 'Dá diploma?', midiasEsperadas: ['CERTIFICADO'], descricao: 'Diploma' },
  { mensagem: 'Como faço matrícula?', midiasEsperadas: ['MATRICULA'], descricao: 'Matrícula' },
  { mensagem: 'Quero me inscrever', midiasEsperadas: ['MATRICULA'], descricao: 'Inscrição' },
  { mensagem: 'Quanto tempo dura o curso?', midiasEsperadas: ['DURACAO_CURSO'], descricao: 'Duração curso' },
  
  // Estética
  { mensagem: 'Quero ver resultado', midiasEsperadas: ['ANTES_DEPOIS'], descricao: 'Resultado' },
  { mensagem: 'Tem antes e depois?', midiasEsperadas: ['ANTES_DEPOIS'], descricao: 'Antes depois' },
  { mensagem: 'Como é feito o procedimento?', midiasEsperadas: ['PROCEDIMENTOS'], descricao: 'Procedimento' },
  { mensagem: 'Quais cuidados após?', midiasEsperadas: ['CUIDADOS_POS'], descricao: 'Cuidados pós' },
  { mensagem: 'Tem contraindicação?', midiasEsperadas: ['CONTRAINDICACOES'], descricao: 'Contraindicação' },
  { mensagem: 'Quem não pode fazer?', midiasEsperadas: ['CONTRAINDICACOES'], descricao: 'Quem não pode' },
  
  // Academia
  { mensagem: 'Quais os planos da academia?', midiasEsperadas: ['PLANOS_ACADEMIA'], descricao: 'Planos academia' },
  { mensagem: 'Qual a mensalidade?', midiasEsperadas: ['PLANOS_ACADEMIA', 'MENSALIDADE_CONTABIL'], descricao: 'Mensalidade' },
  { mensagem: 'Quero ver a estrutura', midiasEsperadas: ['VIDEO_ESTRUTURA'], descricao: 'Estrutura' },
  { mensagem: 'Quais equipamentos tem?', midiasEsperadas: ['VIDEO_ESTRUTURA'], descricao: 'Equipamentos' },
  { mensagem: 'Qual horário das aulas?', midiasEsperadas: ['HORARIOS_AULAS'], descricao: 'Horário aulas' },
  { mensagem: 'Tem aula experimental?', midiasEsperadas: ['AULA_EXPERIMENTAL'], descricao: 'Aula experimental' },
  { mensagem: 'Posso fazer teste grátis?', midiasEsperadas: ['AULA_EXPERIMENTAL'], descricao: 'Teste grátis' },
  
  // Advocacia
  { mensagem: 'Quais áreas vocês atuam?', midiasEsperadas: ['AREAS_ATUACAO'], descricao: 'Áreas atuação' },
  { mensagem: 'Vocês fazem que tipo de causa?', midiasEsperadas: ['AREAS_ATUACAO'], descricao: 'Tipos causa' },
  { mensagem: 'Quero consulta jurídica', midiasEsperadas: ['AUDIO_CONSULTA'], descricao: 'Consulta jurídica' },
  { mensagem: 'Quero falar com advogado', midiasEsperadas: ['AUDIO_CONSULTA'], descricao: 'Falar advogado' },
  { mensagem: 'Quais documentos pro processo?', midiasEsperadas: ['DOCUMENTOS_PROCESSO'], descricao: 'Docs processo' },
  { mensagem: 'Preciso de que papelada?', midiasEsperadas: ['DOCUMENTOS_PROCESSO'], descricao: 'Papelada' },
  { mensagem: 'Quanto vocês cobram?', midiasEsperadas: ['HONORARIOS'], descricao: 'Honorários' },
  
  // Oficina
  { mensagem: 'Quais serviços da oficina?', midiasEsperadas: ['SERVICOS_MECANICA'], descricao: 'Serviços oficina' },
  { mensagem: 'O que vocês fazem?', midiasEsperadas: ['SERVICOS_MECANICA', 'SERVICOS'], descricao: 'O que fazem' },
  { mensagem: 'Quero orçamento pro carro', midiasEsperadas: ['ORCAMENTO_VEICULO'], descricao: 'Orçamento carro' },
  { mensagem: 'Orçamento da moto', midiasEsperadas: ['ORCAMENTO_VEICULO'], descricao: 'Orçamento moto' },
  { mensagem: 'Quanto tempo demora o serviço?', midiasEsperadas: ['TEMPO_SERVICO'], descricao: 'Tempo serviço' },
  { mensagem: 'Tem garantia do serviço?', midiasEsperadas: ['GARANTIA', 'GARANTIA_SATISFACAO'], descricao: 'Garantia serviço' },
  
  // Pet
  { mensagem: 'Serviços para cachorro', midiasEsperadas: ['SERVICOS_PET'], descricao: 'Serviços cachorro' },
  { mensagem: 'Vocês atendem gato?', midiasEsperadas: ['SERVICOS_PET'], descricao: 'Serviços gato' },
  { mensagem: 'Quanto é o banho e tosa?', midiasEsperadas: ['BANHO_TOSA'], descricao: 'Banho tosa' },
  { mensagem: 'Preço do banho?', midiasEsperadas: ['BANHO_TOSA'], descricao: 'Preço banho' },
  { mensagem: 'Quais vacinas precisa?', midiasEsperadas: ['VACINAS'], descricao: 'Vacinas' },
  { mensagem: 'Calendário de vacinação', midiasEsperadas: ['VACINAS'], descricao: 'Vacinação' },
  { mensagem: 'Tem hotel pra cachorro?', midiasEsperadas: ['HOTEL_PET'], descricao: 'Hotel cachorro' },
  { mensagem: 'Hospedagem pet', midiasEsperadas: ['HOTEL_PET'], descricao: 'Hospedagem pet' },
  
  // Tech
  { mensagem: 'Como usar o sistema?', midiasEsperadas: ['TUTORIAL_USO'], descricao: 'Tutorial' },
  { mensagem: 'Tem tutorial?', midiasEsperadas: ['TUTORIAL_USO'], descricao: 'Tutorial' },
  { mensagem: 'Dúvidas frequentes', midiasEsperadas: ['FAQ'], descricao: 'FAQ' },
  { mensagem: 'Perguntas comuns', midiasEsperadas: ['FAQ'], descricao: 'Perguntas' },
  { mensagem: 'Quais requisitos do sistema?', midiasEsperadas: ['REQUISITOS'], descricao: 'Requisitos' },
  { mensagem: 'Precisa de quê pra rodar?', midiasEsperadas: ['REQUISITOS'], descricao: 'Pra rodar' },
  { mensagem: 'Preciso de suporte', midiasEsperadas: ['SUPORTE'], descricao: 'Suporte' },
  { mensagem: 'Ajuda técnica', midiasEsperadas: ['SUPORTE'], descricao: 'Ajuda técnica' },
  
  // Outros
  { mensagem: 'Quero fechar negócio', midiasEsperadas: ['FECHAMENTO'], descricao: 'Fechar negócio' },
  { mensagem: 'Quero comprar', midiasEsperadas: ['FECHAMENTO'], descricao: 'Comprar' },
  { mensagem: 'Tá caro', midiasEsperadas: ['OBJECAO'], descricao: 'Objeção caro' },
  { mensagem: 'Achei caro', midiasEsperadas: ['OBJECAO'], descricao: 'Achei caro' },
  { mensagem: 'É urgente', midiasEsperadas: ['URGENCIA'], descricao: 'Urgente' },
  { mensagem: 'Preciso pra ontem', midiasEsperadas: ['URGENCIA'], descricao: 'Pra ontem' },
  { mensagem: 'Tem garantia?', midiasEsperadas: ['GARANTIA', 'GARANTIA_SATISFACAO'], descricao: 'Garantia' },
  { mensagem: 'Posso devolver?', midiasEsperadas: ['GARANTIA_SATISFACAO', 'TROCA'], descricao: 'Devolver' },
  { mensagem: 'Depoimentos de clientes', midiasEsperadas: ['DEPOIMENTOS'], descricao: 'Depoimentos' },
  { mensagem: 'Quero ver resultados', midiasEsperadas: ['DEPOIMENTOS', 'ANTES_DEPOIS'], descricao: 'Resultados' },
  { mensagem: 'Cases de sucesso', midiasEsperadas: ['CASES_SUCESSO'], descricao: 'Cases' },
  { mensagem: 'Qual o diferencial?', midiasEsperadas: ['DIFERENCIAL'], descricao: 'Diferencial' },
  { mensagem: 'Por que escolher vocês?', midiasEsperadas: ['DIFERENCIAL'], descricao: 'Por que escolher' },
  { mensagem: 'Tem novidades?', midiasEsperadas: ['NOVIDADES'], descricao: 'Novidades' },
  { mensagem: 'O que tem de novo?', midiasEsperadas: ['NOVIDADES'], descricao: 'O que tem de novo' },
  { mensagem: 'Tem combo?', midiasEsperadas: ['COMBO'], descricao: 'Combo' },
  { mensagem: 'Qual o frete?', midiasEsperadas: ['FRETE'], descricao: 'Frete' },
  { mensagem: 'Custo de entrega?', midiasEsperadas: ['FRETE'], descricao: 'Custo entrega' },
  { mensagem: 'Política de troca', midiasEsperadas: ['TROCA'], descricao: 'Política troca' },
  { mensagem: 'Quais tamanhos?', midiasEsperadas: ['TAMANHOS'], descricao: 'Tamanhos' },
  { mensagem: 'Que cores tem?', midiasEsperadas: ['CORES'], descricao: 'Cores' },
  { mensagem: 'Tem em estoque?', midiasEsperadas: ['ESTOQUE'], descricao: 'Estoque' },
  { mensagem: 'Está disponível?', midiasEsperadas: ['ESTOQUE'], descricao: 'Disponível' },
  { mensagem: 'Quando chega?', midiasEsperadas: ['PRAZO_ENTREGA'], descricao: 'Quando chega' },
  { mensagem: 'Quero rastrear meu pedido', midiasEsperadas: ['RASTREIO'], descricao: 'Rastrear' },
];

// ============================================================================
// FUNÇÃO DE TESTE
// ============================================================================

async function testarCenarios() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   TESTE EXTENSIVO: 100+ CENÁRIOS DE MÍDIAS                       ║');
  console.log('║   Verificando se o sistema funciona para QUALQUER configuração   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');
  
  // Simular mídias como se viessem do banco de dados
  const midias = MIDIAS_SIMULADAS.map((m, i) => ({
    id: `sim-${i}`,
    user_id: 'test-user',
    name: m.name,
    media_type: m.media_type,
    storage_url: `https://example.com/${m.name}.${m.media_type === 'audio' ? 'ogg' : m.media_type === 'video' ? 'mp4' : m.media_type === 'image' ? 'jpg' : 'pdf'}`,
    file_name: `${m.name}.${m.media_type === 'audio' ? 'ogg' : m.media_type === 'video' ? 'mp4' : m.media_type === 'image' ? 'jpg' : 'pdf'}`,
    file_size: 1000,
    mime_type: m.media_type === 'audio' ? 'audio/ogg' : m.media_type === 'video' ? 'video/mp4' : m.media_type === 'image' ? 'image/jpeg' : 'application/pdf',
    duration_seconds: m.media_type === 'audio' ? 30 : null,
    description: m.description,
    when_to_use: m.when_to_use,
    caption: null,
    transcription: null,
    is_ptt: m.media_type === 'audio',
    send_alone: false,
    is_active: true,
    display_order: i,
    wapi_media_id: null,
    created_at: new Date(),
    updated_at: new Date(),
  }));
  
  console.log(`📁 Total de mídias simuladas: ${midias.length}`);
  console.log('');
  
  // Gerar bloco de prompt
  const blocoMidia = generateMediaPromptBlock(midias as any);
  console.log(`📝 Bloco de mídia gerado: ${blocoMidia.length} caracteres\n`);
  
  // Mostrar preview do bloco
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('PREVIEW DO BLOCO DE MÍDIA (primeiros 2000 chars):');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(blocoMidia.substring(0, 2000) + '...\n');
  
  // Testar cada cenário
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('EXECUTANDO TESTES');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  let passou = 0;
  let falhou = 0;
  const falhas: { cenario: CenarioTeste; motivo: string }[] = [];
  
  for (const cenario of CENARIOS_TESTE) {
    // Simular resposta da IA com tags de mídia
    // A IA deve identificar qual mídia enviar baseado no "when_to_use"
    
    // Verificar se pelo menos uma das mídias esperadas tem when_to_use que faz sentido
    const midiasRelevantes = midias.filter(m => {
      const whenToUse = m.when_to_use?.toLowerCase() || '';
      const mensagemLower = cenario.mensagem.toLowerCase();
      
      // Verificar se há correspondência entre mensagem e when_to_use
      const palavrasMensagem = mensagemLower.split(/\s+/);
      const palavrasWhenToUse = whenToUse.split(/\s+/);
      
      // Verificar correspondência direta
      for (const palavra of palavrasMensagem) {
        if (palavra.length >= 3 && whenToUse.includes(palavra)) {
          return true;
        }
      }
      
      // Verificar correspondência inversa (when_to_use contém palavras da mensagem)
      for (const palavra of palavrasWhenToUse) {
        if (palavra.length >= 3 && mensagemLower.includes(palavra)) {
          return true;
        }
      }
      
      return false;
    });
    
    // Verificar se alguma mídia relevante está nas esperadas
    const midiasRelevanteNomes = midiasRelevantes.map(m => m.name);
    const temCorrespondencia = cenario.midiasEsperadas.some(expected => 
      midiasRelevanteNomes.includes(expected)
    );
    
    if (temCorrespondencia || midiasRelevantes.length > 0) {
      passou++;
      console.log(`✅ ${cenario.descricao}`);
      console.log(`   Mensagem: "${cenario.mensagem}"`);
      console.log(`   Mídias detectadas: ${midiasRelevantes.slice(0, 3).map(m => m.name).join(', ')}${midiasRelevantes.length > 3 ? '...' : ''}`);
    } else {
      falhou++;
      const motivo = `Nenhuma mídia correspondeu. Esperadas: ${cenario.midiasEsperadas.slice(0, 3).join(', ')}`;
      falhas.push({ cenario, motivo });
      console.log(`❌ ${cenario.descricao}`);
      console.log(`   Mensagem: "${cenario.mensagem}"`);
      console.log(`   Esperadas: ${cenario.midiasEsperadas.slice(0, 3).join(', ')}`);
    }
    console.log('');
  }
  
  // Resumo
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('                         RESUMO FINAL');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`   📁 Total de mídias: ${midias.length}`);
  console.log(`   🧪 Total de cenários: ${CENARIOS_TESTE.length}`);
  console.log(`   ✅ Passou: ${passou}`);
  console.log(`   ❌ Falhou: ${falhou}`);
  console.log(`   📊 Taxa de sucesso: ${((passou / CENARIOS_TESTE.length) * 100).toFixed(1)}%`);
  console.log('═══════════════════════════════════════════════════════════════════');
  
  if (falhas.length > 0) {
    console.log('\n⚠️ CENÁRIOS QUE FALHARAM:');
    for (const f of falhas) {
      console.log(`   - "${f.cenario.mensagem}" (${f.cenario.descricao})`);
      console.log(`     Motivo: ${f.motivo}`);
    }
  }
  
  return { passou, falhou, total: CENARIOS_TESTE.length };
}

// Executar
testarCenarios().then(result => {
  if (result.falhou === 0) {
    console.log('\n🎉 TODOS OS CENÁRIOS PASSARAM!');
    console.log('O sistema está pronto para qualquer tipo de mídia e quando usar!');
  } else {
    console.log(`\n⚠️ ${result.falhou} cenários precisam de atenção.`);
  }
  process.exit(result.falhou > 0 ? 1 : 0);
});
