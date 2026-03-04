/**
 * Gera áudio TTS da explicação do curso e cadastra no agent_media_library
 * Usa o TTS do sistema (Puter/AWS Polly) e grava no Supabase Storage.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { generateWithPuterBrazilian, generateWithEdgeTTS, generateWithWindowsTTS, generateWithGoogleTTS } from './ttsService';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

const USER_ID = '84170f76-0076-4878-a31d-28b58dfb2365';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const EXPLICACAO_CURSO = `Essa graduação é na modalidade 100% online, todos os estudos são feitos pelo Portal do Aluno. Por lá, você acessa suas aulas, materiais, atividades, trabalhos e provas, podendo estudar de onde estiver e no horário que preferir.

Ao ser aprovado no vestibular, você já garante três bolsas de estudo automaticamente. A primeira é a bolsa de incentivo, válida por todo o curso. A segunda é a bolsa de pontualidade, ela te dá desconto extra pagando até o quinto dia útil. E a terceira é a bolsa de primeiro semestre, que deixa os primeiros seis meses com valor diferenciado.

Os valores do curso estão detalhados na imagem que te enviei. A primeira mensalidade do semestre acontece sempre em janeiro, para quem inicia os estudos no começo do ano, ou em julho, para quem começa no meio do ano.

Também existe o PagFácil, onde você pode pagar apenas uma entrada e dividir o valor das primeiras mensalidades ao longo do curso. Vou te enviar um vídeo explicando melhor.

Além disso, há bolsas adicionais, como bolsa ENEM, bolsa para servidor público e para empresas conveniadas.

A inscrição é feita por aqui mesmo, de forma rápida. Precisamos só de algumas informações básicas. Depois disso, te envio o link do vestibular, que pode escolher entre uma redação ou três perguntas simples, e o link da primeira mensalidade, que já funciona como matrícula.

Outra promoção é a de indicação! Você pode ganhar dinheiro indicando amigos. A cada aluno indicado que pagar a primeira mensalidade, você garante cinquenta reais direto no seu Pix.`;

async function uploadAudio(buffer: Buffer, storagePath: string, contentType: string): Promise<string> {
  const { error } = await supabase.storage
    .from('agent-media')
    .upload(storagePath, buffer, { contentType, upsert: true });

  if (error) {
    throw new Error(`Erro upload: ${error.message}`);
  }

  const { data } = supabase.storage.from('agent-media').getPublicUrl(storagePath);
  if (!data?.publicUrl) {
    throw new Error('Não foi possível obter a URL pública');
  }

  return data.publicUrl;
}

async function upsertMedia(url: string, fileName: string, mimeType: string) {
  const name = 'AUDIO_EXPLICACAO_CURSO';
  const whenToUse = 'Enviar quando o cliente pedir explicação do curso, quiser saber sobre um curso, pedir explicação, ou perguntar sobre a graduação (Administração, Marketing, Contabilidade, etc).';

  const { data: existing } = await supabase
    .from('agent_media_library')
    .select('id')
    .eq('user_id', USER_ID)
    .eq('name', name)
    .single();

  if (existing?.id) {
    const { error } = await supabase
      .from('agent_media_library')
      .update({
        media_type: 'audio',
        storage_url: url,
        file_name: fileName,
        mime_type: mimeType,
        description: 'Áudio com explicação geral do curso (EAD, bolsas, PagFácil, inscrição)',
        when_to_use: whenToUse,
        caption: '🎤 Explicação em áudio sobre o curso',
        is_ptt: true,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) throw new Error(`Erro update: ${error.message}`);
    return;
  }

  const { error } = await supabase
    .from('agent_media_library')
    .insert({
      user_id: USER_ID,
      name,
      media_type: 'audio',
      storage_url: url,
      file_name: fileName,
      mime_type: mimeType,
      description: 'Áudio com explicação geral do curso (EAD, bolsas, PagFácil, inscrição)',
      when_to_use: whenToUse,
      caption: '🎤 Explicação em áudio sobre o curso',
      is_ptt: true,
      send_alone: false,
      is_active: true,
    });

  if (error) throw new Error(`Erro insert: ${error.message}`);
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_KEY não definido');
  }

  console.log('🎙️ Gerando áudio TTS...');
  let audioBuffer: Buffer | null = null;
  let fileExt = 'mp3';
  let mimeType = 'audio/mpeg';

  try {
    audioBuffer = await generateWithPuterBrazilian(EXPLICACAO_CURSO);
  } catch (error) {
    console.warn('⚠️ Puter TTS falhou, tentando Edge TTS...');
  }

  if (!audioBuffer) {
    try {
      audioBuffer = await generateWithEdgeTTS(EXPLICACAO_CURSO, 'pt-BR-FranciscaNeural', '+0%', '+0Hz');
    } catch (error) {
      console.warn('⚠️ Edge TTS (CLI) falhou, tentando edge-tts-generator.py...');
      try {
        const tmpDir = path.join(process.cwd(), 'tmp');
        const tmpFile = path.join(tmpDir, `tts-${Date.now()}.mp3`);

        const escapedText = EXPLICACAO_CURSO
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\$/g, '\\$')
          .replace(/`/g, '\\`');

        const scriptPath = path.join(process.cwd(), 'server', 'edge-tts-generator.py');
        const cmd = `python "${scriptPath}" "${escapedText}" "pt-BR-FranciscaNeural" "+0%" "+0Hz" "${tmpFile}"`;

        await execPromise(cmd, { timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
        const fs = await import('fs');
        audioBuffer = fs.readFileSync(tmpFile);
        fs.unlinkSync(tmpFile);
      } catch (error) {
        console.warn('⚠️ edge-tts-generator.py falhou.');
        audioBuffer = null;
      }
    }
  }

  if (!audioBuffer) {
    try {
      console.warn('⚠️ Tentando Windows TTS (say.js)...');
      audioBuffer = await generateWithWindowsTTS(EXPLICACAO_CURSO, 1.0);
      fileExt = 'wav';
      mimeType = 'audio/wav';
    } catch (error) {
      console.warn('⚠️ Windows TTS falhou, tentando Google TTS...');
      audioBuffer = await generateWithGoogleTTS(EXPLICACAO_CURSO, 'pt-BR');
      fileExt = 'mp3';
      mimeType = 'audio/mpeg';
    }
  }

  if (!audioBuffer) {
    throw new Error('Não foi possível gerar o áudio TTS');
  }

  console.log(`✅ Áudio gerado: ${audioBuffer.length} bytes`);

  const storagePath = `${USER_ID}/audio_explicacao_curso.${fileExt}`;
  console.log('☁️ Fazendo upload para Supabase Storage...');
  const publicUrl = await uploadAudio(audioBuffer, storagePath, mimeType);

  console.log('✅ URL pública:', publicUrl);
  console.log('🗃️ Salvando mídia no agent_media_library...');

  const fileName = `audio_explicacao_curso.${fileExt}`;
  await upsertMedia(publicUrl, fileName, mimeType);

  console.log('✅ Áudio cadastrado com sucesso!');
}

main().catch((err) => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
