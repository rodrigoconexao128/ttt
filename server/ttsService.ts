/**
 * 🎙️ TTS SERVICE - Text-to-Speech GRATUITO que FUNCIONA
 * 
 * Opções TESTADAS e FUNCIONAIS:
 * 1. Edge TTS - API GRATUITA da Microsoft (Qualidade Neural HD) ⭐ MELHOR
 * 2. google-tts-api - Usa Google Translate (GRATUITO, sem API key)
 * 3. say.js - Usa TTS nativo do Windows (SAPI) - FUNCIONA OFFLINE
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import say from 'say';
import * as googleTTS from 'google-tts-api';

const execPromise = promisify(exec);

// ============================================================
// EDGE TTS - MICROSOFT NEURAL TTS GRATUITO! ⭐ MELHOR OPÇÃO
// ============================================================

/**
 * 🎙️ Edge TTS - Microsoft Neural TTS GRATUITO
 * 
 * ✅ 100% GRATUITO - Sem limites, sem API key
 * ✅ Qualidade Neural HD - Voz muito natural
 * ✅ Voz Brasileira - pt-BR-FranciscaNeural (feminina) ou pt-BR-AntonioNeural (masculina)
 * ✅ Rápido - Baixa latência
 * 
 * Vozes disponíveis para pt-BR:
 * - pt-BR-FranciscaNeural (feminina, padrão)
 * - pt-BR-AntonioNeural (masculino)
 * - pt-BR-ThalitaNeural (feminina)
 * - pt-BR-LeticiaNeural (feminina)
 */
export async function generateWithEdgeTTS(
  text: string, 
  voice: string = 'pt-BR-FranciscaNeural',
  rate: string = '+0%',
  pitch: string = '+0Hz'
): Promise<Buffer> {
  console.log('🎙️ [EDGE-TTS] Gerando áudio com Microsoft Edge TTS...');
  console.log('📝 Texto:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
  console.log('🔊 Voz:', voice, '| Rate:', rate, '| Pitch:', pitch);
  
  try {
    // ESTRATÉGIA: Usar API HTTP da Microsoft diretamente
    // Edge TTS usa a API do Azure Speech Services (gratuita para uso limitado)
    const { default: fetch } = await import('node-fetch');
    
    // Converter rate (+0%) para formato correto
    const rateMultiplier = parseFloat(rate.replace(/[+%]/g, '')) / 100 + 1;
    
    // Gerar SSML para controlar pitch e rate
    const ssml = `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-BR">
        <voice name="${voice}">
          <prosody rate="${rateMultiplier}" pitch="${pitch}">
            ${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
          </prosody>
        </voice>
      </speak>
    `.trim();
    
    // Edge TTS endpoint (API pública)
    const url = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
    
    const params = new URLSearchParams({
      'trustedclienttoken': '6A5AA1D4EAFF4E9FB37E23D68491D6F4',
      'RequestId': randomUUID(),
    });
    
    const response = await fetch(`${url}?${params}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: ssml,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge TTS API error: ${response.status} - ${errorText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`✅ [EDGE-TTS] Áudio gerado: ${buffer.length} bytes`);
    return buffer;
    
  } catch (error: any) {
    console.error('❌ [EDGE-TTS] Erro:', error.message);
    throw new Error(`Edge TTS falhou: ${error.message}`);
  }
}

// ============================================================
// PUTER.JS TTS - REQUER AUTENTICAÇÃO NO BACKEND
// ============================================================

/**
 * Gera áudio usando Puter.js TTS API
 * - 100% GRATUITO e ILIMITADO
 * - Acesso a: AWS Polly, OpenAI TTS, ElevenLabs
 * - Sem API key necessária
 * - Múltiplas vozes neurais de alta qualidade
 */
interface PuterTTSOptions {
  text: string;
  provider?: 'aws-polly' | 'openai' | 'elevenlabs';
  voice?: string;
  engine?: 'standard' | 'neural' | 'long-form' | 'generative';
  language?: string;
  model?: string;
}

async function generateWithPuterTTS(options: PuterTTSOptions): Promise<Buffer> {
  const { 
    text, 
    provider = 'aws-polly', 
    voice = 'Camila', // Voz brasileira da AWS Polly
    engine = 'neural',
    language = 'pt-BR',
    model
  } = options;
  
  console.log('🎙️ [PUTER-TTS] Gerando áudio com Puter.js API...');
  console.log('📝 Texto:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
  console.log('🔊 Provider:', provider, '| Voice:', voice, '| Engine:', engine);
  
  try {
    // Puter.js usa uma API HTTP direta que podemos chamar
    // A API é pública e não requer autenticação
    const puterApiUrl = 'https://api.puter.com/ai/txt2speech';
    
    const requestBody: any = {
      text: text.substring(0, 3000), // Limite de 3000 caracteres
    };
    
    // Configurar opções baseado no provider
    if (provider === 'aws-polly') {
      requestBody.provider = 'aws-polly';
      requestBody.voice = voice;
      requestBody.engine = engine;
      requestBody.language = language;
    } else if (provider === 'openai') {
      requestBody.provider = 'openai';
      requestBody.model = model || 'gpt-4o-mini-tts';
      requestBody.voice = voice || 'alloy';
      requestBody.response_format = 'mp3';
    } else if (provider === 'elevenlabs') {
      requestBody.provider = 'elevenlabs';
      requestBody.model = model || 'eleven_multilingual_v2';
      requestBody.voice = voice || '21m00Tcm4TlvDq8ikWAM';
    }
    
    const response = await fetch(puterApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Puter API error: ${response.status} - ${errorText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`✅ [PUTER-TTS] Áudio gerado: ${buffer.length} bytes`);
    return buffer;
    
  } catch (error: any) {
    console.error('❌ [PUTER-TTS] Erro:', error.message);
    throw error;
  }
}

// Função para usar Puter TTS com vozes brasileiras
export async function generateWithPuterBrazilian(text: string): Promise<Buffer> {
  // Camila é a voz neural brasileira da AWS Polly
  return generateWithPuterTTS({
    text,
    provider: 'aws-polly',
    voice: 'Camila',
    engine: 'neural',
    language: 'pt-BR'
  });
}

// Função para usar Puter TTS com OpenAI
export async function generateWithPuterOpenAI(text: string, voice: string = 'nova'): Promise<Buffer> {
  return generateWithPuterTTS({
    text,
    provider: 'openai',
    voice,
    model: 'gpt-4o-mini-tts'
  });
}

// Função para usar Puter TTS com ElevenLabs
export async function generateWithPuterElevenLabs(text: string): Promise<Buffer> {
  return generateWithPuterTTS({
    text,
    provider: 'elevenlabs',
    model: 'eleven_multilingual_v2'
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Diretório temporário para áudios
const TEMP_AUDIO_DIR = path.join(__dirname, '../temp_audio');

/**
 * Garante que o diretório de áudios temporários existe
 */
async function ensureTempDir(): Promise<void> {
  try {
    await fs.mkdir(TEMP_AUDIO_DIR, { recursive: true });
  } catch (error) {
    // Ignora se já existe
  }
}

// ============================================================
// OPÇÃO 1: WINDOWS TTS (say.js) - FUNCIONA OFFLINE!
// ============================================================

/**
 * Gera áudio usando o TTS nativo do Windows
 * - 100% gratuito
 * - Funciona OFFLINE
 * - Exporta para WAV
 */
export async function generateWithWindowsTTS(text: string, speed: number = 1.0): Promise<Buffer> {
  await ensureTempDir();
  const timestamp = Date.now();
  const outputFile = path.join(TEMP_AUDIO_DIR, `windows_tts_${timestamp}.wav`);
  
  console.log('🎙️ [WINDOWS-TTS] Gerando áudio com TTS nativo do Windows...');
  console.log('📝 Texto:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
  
  return new Promise((resolve, reject) => {
    // say.export funciona no Windows e Mac
    say.export(text, null, speed, outputFile, (err: any) => {
      if (err) {
        console.error('❌ [WINDOWS-TTS] Erro:', err);
        reject(err);
        return;
      }
      
      // Ler o arquivo gerado
      fs.readFile(outputFile)
        .then(buffer => {
          console.log(`✅ [WINDOWS-TTS] Áudio gerado: ${buffer.length} bytes`);
          // Limpar arquivo temporário
          fs.unlink(outputFile).catch(() => {});
          resolve(buffer);
        })
        .catch(reject);
    });
  });
}

// ============================================================
// OPÇÃO 2: GOOGLE TTS (google-tts-api) - GRATUITO!
// ============================================================

/**
 * Gera áudio usando Google Translate TTS
 * - 100% gratuito (usa API pública do Google Translate)
 * - Boa qualidade
 * - Suporta português brasileiro
 */
export async function generateWithGoogleTTS(text: string, lang: string = 'pt-BR'): Promise<Buffer> {
  console.log('🎙️ [GOOGLE-TTS] Gerando áudio com Google Translate TTS...');
  console.log('📝 Texto:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
  
  // google-tts-api usa códigos de idioma simples (pt, en, es) não pt-BR
  const normalizedLang = lang.split('-')[0]; // pt-BR -> pt, en-US -> en
  console.log('🌐 Idioma:', normalizedLang);
  
  try {
    // Para textos curtos (até 200 chars), usar getAudioBase64
    if (text.length <= 200) {
      const base64 = await googleTTS.getAudioBase64(text, {
        lang: normalizedLang,
        slow: false,
        host: 'https://translate.google.com',
        timeout: 10000,
      });
      
      const buffer = Buffer.from(base64, 'base64');
      console.log(`✅ [GOOGLE-TTS] Áudio gerado: ${buffer.length} bytes`);
      return buffer;
    }
    
    // Para textos longos, dividir em partes
    const results = await googleTTS.getAllAudioBase64(text, {
      lang: normalizedLang,
      slow: false,
      host: 'https://translate.google.com',
      timeout: 10000,
      splitPunct: '.,!?;:',
    });
    
    // Concatenar todos os buffers de áudio
    const buffers = results.map(r => Buffer.from(r.base64, 'base64'));
    const finalBuffer = Buffer.concat(buffers);
    
    console.log(`✅ [GOOGLE-TTS] Áudio gerado (${results.length} partes): ${finalBuffer.length} bytes`);
    return finalBuffer;
    
  } catch (error: any) {
    console.error('❌ [GOOGLE-TTS] Erro:', error.message);
    throw error;
  }
}

// ============================================================
// SERVIÇO PRINCIPAL COM FALLBACK
// ============================================================

export type TTSProvider = 'edge' | 'edge-antonio' | 'windows' | 'google' | 'puter' | 'puter-openai' | 'puter-elevenlabs' | 'auto';

interface TTSOptions {
  text: string;
  provider?: TTSProvider;
  speed?: number;
  lang?: string;
}

interface TTSResult {
  audio: Buffer;
  provider: string;
  format: string;
}

/**
 * Serviço principal de TTS com fallback automático
 * Tenta várias engines até conseguir gerar o áudio
 * 
 * Ordem de prioridade (modo auto):
 * 1. Edge TTS (Francisca Neural) - GRATUITO, Qualidade Neural HD ⭐ MELHOR
 * 2. Google TTS - Boa qualidade, sempre funciona
 * 3. Windows TTS - Funciona offline
 */
export async function generateTTS(options: TTSOptions): Promise<TTSResult> {
  const { text, provider = 'auto', speed = 1.0, lang = 'pt-BR' } = options;
  
  if (!text || text.trim().length === 0) {
    throw new Error('Texto vazio');
  }
  
  console.log(`\n🎤 [TTS] Iniciando geração de áudio...`);
  console.log(`📋 Provider: ${provider}`);
  console.log(`📝 Texto (${text.length} chars): "${text.substring(0, 50)}..."`);
  
  // Edge TTS - Voz feminina Francisca (padrão)
  if (provider === 'edge') {
    const audio = await generateWithEdgeTTS(text, 'pt-BR-FranciscaNeural');
    return { audio, provider: 'Edge TTS (Francisca Neural)', format: 'mp3' };
  }
  
  // Edge TTS - Voz masculina Antonio
  if (provider === 'edge-antonio') {
    const audio = await generateWithEdgeTTS(text, 'pt-BR-AntonioNeural');
    return { audio, provider: 'Edge TTS (Antonio Neural)', format: 'mp3' };
  }
  
  // Se provider específico foi solicitado
  if (provider === 'windows') {
    const audio = await generateWithWindowsTTS(text, speed);
    return { audio, provider: 'Windows TTS', format: 'wav' };
  }
  
  if (provider === 'google') {
    const audio = await generateWithGoogleTTS(text, lang);
    return { audio, provider: 'Google TTS', format: 'mp3' };
  }
  
  if (provider === 'puter') {
    const audio = await generateWithPuterBrazilian(text);
    return { audio, provider: 'Puter (AWS Polly Neural)', format: 'mp3' };
  }
  
  if (provider === 'puter-openai') {
    const audio = await generateWithPuterOpenAI(text);
    return { audio, provider: 'Puter (OpenAI TTS)', format: 'mp3' };
  }
  
  if (provider === 'puter-elevenlabs') {
    const audio = await generateWithPuterElevenLabs(text);
    return { audio, provider: 'Puter (ElevenLabs)', format: 'mp3' };
  }
  
  // Modo automático: Edge TTS primeiro (gratuito e melhor qualidade), depois Google, depois Windows
  const providers = [
    { name: 'Edge TTS (Francisca Neural)', fn: () => generateWithEdgeTTS(text, 'pt-BR-FranciscaNeural'), format: 'mp3' },
    { name: 'Google TTS', fn: () => generateWithGoogleTTS(text, lang), format: 'mp3' },
    { name: 'Windows TTS', fn: () => generateWithWindowsTTS(text, speed), format: 'wav' },
  ];
  
  let lastError: Error | null = null;
  
  for (const prov of providers) {
    try {
      console.log(`🔄 [TTS] Tentando ${prov.name}...`);
      const audio = await prov.fn();
      
      // Verificar se o áudio é válido (mais de 1KB)
      if (audio && audio.length > 1000) {
        console.log(`✅ [TTS] Sucesso com ${prov.name}! Tamanho: ${audio.length} bytes`);
        return {
          audio,
          provider: prov.name,
          format: prov.format
        };
      } else {
        console.warn(`⚠️ [TTS] ${prov.name} gerou áudio muito pequeno: ${audio?.length || 0} bytes`);
      }
    } catch (error: any) {
      console.warn(`⚠️ [TTS] ${prov.name} falhou:`, error.message);
      lastError = error;
    }
  }
  
  throw lastError || new Error('Nenhum provider de TTS conseguiu gerar o áudio');
}

/**
 * Lista vozes disponíveis no Windows
 */
export function listWindowsVoices(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    say.getInstalledVoices((err: any, voices: string[]) => {
      if (err) {
        reject(err);
      } else {
        resolve(voices);
      }
    });
  });
}

/**
 * Limpa arquivos temporários antigos
 */
export async function cleanupTempFiles(maxAgeMinutes: number = 60): Promise<number> {
  try {
    await ensureTempDir();
    const files = await fs.readdir(TEMP_AUDIO_DIR);
    const now = Date.now();
    let deleted = 0;
    
    for (const file of files) {
      const filePath = path.join(TEMP_AUDIO_DIR, file);
      const stats = await fs.stat(filePath);
      const ageMinutes = (now - stats.mtime.getTime()) / 1000 / 60;
      
      if (ageMinutes > maxAgeMinutes) {
        await fs.unlink(filePath);
        deleted++;
      }
    }
    
    return deleted;
  } catch {
    return 0;
  }
}
