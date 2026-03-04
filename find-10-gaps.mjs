// Mining top 10 unanswered questions from real conversations
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'rodrigo-conversations.json'), 'utf8'));
const pairs = data.allPairs || [];
const manual = pairs.filter(p => !p.answer_is_ai && p.question.length > 20 && p.answer.length > 20);

const topics = [
  {name:'Follow-up automático', kws:['follow up','followup','follow-up','retomar','lead sumiu','nao respondeu']},
  {name:'Mais de um agente', kws:['mais de um agente','varios agentes','funcionario','vendedor usa','pode ter outro','cada vendedor','equipe usa']},
  {name:'Velocidade resposta IA', kws:['quanto tempo responde','rapido responde','demora pra responder','responde instant','tempo de resposta','velocidade']},
  {name:'Renovar plano', kws:['renovar','renovacao','vencer','venceu','proximo mes','renovar o plano','data de vencimento']},
  {name:'Conectar QR Code', kws:['qr code','qrcode','escanear','conectar o whatsapp','como conecto','leitura de qr']},
  {name:'Integracao sistema', kws:['integrar com','integracao com','api integracao','crm integrar','sistema integrar','conectar sistema']},
  {name:'Horario IA', kws:['horario atendimento','fora do horario','configurar horario','dias e horarios','horario comercial','ia responde de madrugada']},
  {name:'Notificacao lead quente', kws:['notificacao','notificar','avisa quando','alerta quando','quando manda aviso','quando notifica']},
  {name:'Quantos simultaneos', kws:['quantos atendimentos','quantas conversas simultaneas','ao mesmo tempo quantas','limite de atendimentos']},
  {name:'Transferir para humano', kws:['transferir para humano','passar para humano','encaminhar para atendente','transferir atendimento','transfere para']},
];

topics.forEach(topic => {
  const m = manual.filter(p => {
    const t = (p.question+p.answer).toLowerCase();
    return topic.kws.some(k => t.includes(k));
  });
  const seen = new Set();
  const uniq = [];
  for(const p of m){
    const k = p.question.slice(0,50).toLowerCase().trim();
    if(!seen.has(k)){seen.add(k);uniq.push(p);}
  }
  if(uniq.length > 0){
    const best = uniq.slice(0,2);
    console.log('=== '+topic.name+' ('+uniq.length+' ocorr) ===');
    best.forEach(p => {
      console.log('Q: '+p.question.slice(0,150).trim());
      console.log('R: '+p.answer.slice(0,200).trim());
      console.log('');
    });
  }
});
