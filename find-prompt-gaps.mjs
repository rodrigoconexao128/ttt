// Mining gaps: perguntas de clientes reais NÃO cobertas pelo prompt v2
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'rodrigo-conversations.json'), 'utf8'));
const pairs = data.allPairs || [];

// Tópicos já cobertos no prompt v2 (keywords)
const COVERED_TOPICS = [
  ['preco', 'valor', 'custa', '49', '99', '199', '599'],
  ['cancelar', 'cancelamento', 'pre-pago', 'prepago', 'multa', 'sair'],
  ['link', 'assinar', 'assinatura', 'contratar', 'plano'],
  ['teste', 'testar', 'gratis', 'gratuito', '25 mensag'],
  ['internet', 'sem internet', 'servidor', 'offline', 'desligado'],
  ['ilimitado', 'limite', 'quantas conversas', 'quantidade'],
  ['humanizado', 'humano', 'robo', 'chatbot', 'ia real'],
  ['midia', 'audio', 'video', 'pdf', 'imagem', 'foto'],
  ['numero adicional', 'multiplos numeros', 'varios numeros', '10 numeros'],
  ['instagram', 'facebook', 'redes sociais'],
  ['suporte', 'ajuda', 'atendimento da equipe'],
  ['implementacao', 'implementar', 'setup', 'configurar para mim'],
  ['ligacao', 'ligar', 'chamada', 'call'],
  ['anual', 'plano anual', 'mensalidade anual'],
  ['desconto', 'promocao', 'promo'],
];

// Tópicos potencialmente NÃO cobertos
const GAP_KEYWORDS = [
  { topic: 'Conectar WhatsApp / QR Code', kws: ['qr', 'qrcode', 'qr code', 'conectar', 'conexao', 'escanear', 'scan', 'numero para conectar', 'vincular'] },
  { topic: 'WhatsApp banido / meta', kws: ['banir', 'banido', 'ban', 'meta proibe', 'bloquear numero', 'numero bloqueado'] },
  { topic: 'WhatsApp Business vs pessoal', kws: ['whatsapp business', 'business', 'pessoal', 'conta business', 'wp business'] },
  { topic: 'Como treinar / configurar IA', kws: ['treinar', 'treinamento', 'como configurar', 'configuracao', 'prompt', 'ensinar a ia', 'cadastrar'] },
  { topic: 'Integração CRM / sistema', kws: ['crm', 'integracao', 'integrar', 'sistema', 'salesforce', 'hubspot', 'rdstation', 'pipedrive', 'api'] },
  { topic: 'Forma de pagamento', kws: ['pix', 'boleto', 'cartao', 'cartão', 'forma de pagamento', 'pagar com', 'parcel'] },
  { topic: 'Recarga / vencimento / renovação', kws: ['renovar', 'renovacao', 'vencer', 'vencimento', 'data de pagamento', 'recarregar', 'expirar'] },
  { topic: 'Histórico de conversas', kws: ['historico', 'ver conversa', 'relatorio', 'dashboard', 'visualizar mensagem'] },
  { topic: 'Mais de um agente / funcionario', kws: ['mais de um agente', 'funcionario', 'vendedor', 'equipe', 'time', 'colaborador', 'usuario'] },
  { topic: 'Notificação quando IA não sabe', kws: ['notificar', 'notificacao', 'avisar', 'quando nao sabe', 'assumir conversa', 'transferir', 'desativar ia', 'pausar ia'] },
  { topic: 'Como fazer follow-up automático', kws: ['follow up', 'followup', 'follow-up', 'retomar conversa', 'lead sumiu', 'nao respondeu', 'follow'] },
  { topic: 'Enviar mensagem em massa (ZVMA)', kws: ['massa', 'disparo', 'broadcast', 'campanha', 'zvma', 'enviar para todos', 'lista de transmissao'] },
  { topic: 'Verificação WhatsApp (tick verde)', kws: ['tick verde', 'verificado', 'negocio verificado', 'verificacao', 'lacre verde'] },
  { topic: 'Velocidade / tempo de resposta da IA', kws: ['rapido', 'tempo de resposta', 'demora', 'instantaneo', 'segundos', 'delay', 'quanto tempo para responder'] },
  { topic: 'Dados e privacidade', kws: ['dado', 'privacidade', 'lgpd', 'seguro', 'seguranca', 'protecao de dados'] },
  { topic: 'Como transferir de outro plano/plataforma', kws: ['migrar', 'migracao', 'transferir', 'mudar de plataforma', 'portabilidade', 'cancela outro'] },
  { topic: 'Suporte tecnico / bug', kws: ['bug', 'erro', 'problema', 'nao funciona', 'parou', 'travou', 'nao conecta', 'help'] },
  { topic: 'Cards de horário de atendimento IA', kws: ['horario', 'fora do horario', 'funcionamento', 'dias da semana', 'final de semana', 'sabado', 'domingo'] },
];

console.log('Analisando', pairs.length, 'pares de conversa...\n');
console.log('='.repeat(70));
console.log('PERGUNTAS DE CLIENTES NÃO COBERTAS PELO PROMPT V2');
console.log('='.repeat(70));

const SK_AGENTEZAP = ['agentezap','agente zap','plano','funciona','assinar','contratar',
  'conta','testar','preco','preço','valor','quanto','configurar','suporte','pagar',
  'mensalidade','whatsapp','automatico','ia','bot','qualificacao','plataforma'];

const isAboutProduct = t => t && SK_AGENTEZAP.some(k => t.toLowerCase().includes(k));

const manual = pairs.filter(p => 
  !p.answer_is_ai && 
  isAboutProduct(p.question) && 
  p.question.length > 15 && 
  p.answer.length > 10
);

console.log(`Total pares manuais relevantes: ${manual.length}\n`);

for (const gap of GAP_KEYWORDS) {
  const matches = manual.filter(p => {
    const q = (p.question || '').toLowerCase();
    const a = (p.answer || '').toLowerCase();
    return gap.kws.some(kw => q.includes(kw) || a.includes(kw));
  });
  
  if (matches.length === 0) continue;
  
  // deduplicate by first 60 chars of question
  const seen = new Set();
  const unique = [];
  for (const m of matches) {
    const key = m.question.slice(0, 60).toLowerCase().trim();
    if (!seen.has(key)) { seen.add(key); unique.push(m); }
  }
  
  console.log(`\n─── ${gap.topic} (${unique.length} ocorrências) ───`);
  unique.slice(0, 3).forEach(p => {
    console.log(`  Q: ${p.question.slice(0, 120).trim()}`);
    console.log(`  R: ${p.answer.slice(0, 120).trim()}`);
    console.log('');
  });
}

console.log('\n' + '='.repeat(70));

// Summary count
const summary = GAP_KEYWORDS.map(gap => {
  const m = manual.filter(p => {
    const q = (p.question || '').toLowerCase();
    const a = (p.answer || '').toLowerCase();
    return gap.kws.some(kw => q.includes(kw) || a.includes(kw));
  });
  return { topic: gap.topic, count: m.length };
}).filter(x => x.count > 0).sort((a, b) => b.count - a.count);

console.log('\nTÓPICOS POR FREQUÊNCIA (mais pedidos):');
summary.forEach((s, i) => console.log(`  ${i+1}. ${s.topic}: ${s.count} ocorrências`));
