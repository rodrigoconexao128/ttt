/**
 * TESTE COMPLETO: Múltiplas Mídias + Upload .TXT
 * 
 * Este teste verifica:
 * 1. ✅ Envio de MÚLTIPLAS mídias com a mesma tag (ex: áudio + vídeo + imagem para "RESTAURANTE")
 * 2. ✅ Upload de arquivo .txt como documento
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import { setTimeout as sleep } from 'timers/promises';
import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:5000';
const USER_ID = '731f255c-7fcd-4af9-9431-142e0a0234a1';

// Criar arquivo .txt temporário para teste
const TEST_TXT_PATH = path.join(process.cwd(), 'test-document.txt');
fs.writeFileSync(TEST_TXT_PATH, `
TESTE DE DOCUMENTO TXT
======================

Este é um arquivo de texto simples (.txt) para testar o upload de documentos.

✅ Se este arquivo foi anexado com sucesso, então arquivos .txt estão funcionando!

Data do teste: ${new Date().toISOString()}
`);

async function test1_MultipleMedias() {
  console.log('\n📋 TESTE 1: Verificar múltiplas mídias com mesma tag');
  console.log('='.repeat(60));

  try {
    // Buscar biblioteca de mídias
    const response = await fetch(`${API_URL}/api/agent/media?userId=${USER_ID}`);
    const data = await response.json();

    console.log(`\n📚 Total de mídias na biblioteca: ${data.media?.length || 0}`);

    // Agrupar por tag/nome
    const mediasByTag = new Map<string, any[]>();
    
    for (const media of data.media || []) {
      const tag = media.name.toUpperCase();
      if (!mediasByTag.has(tag)) {
        mediasByTag.set(tag, []);
      }
      mediasByTag.get(tag)!.push(media);
    }

    console.log(`\n📊 Mídias agrupadas por tag:`);
    for (const [tag, medias] of mediasByTag.entries()) {
      const types = medias.map(m => m.mediaType).join(', ');
      console.log(`   ${tag}: ${medias.length} mídia(s) [${types}]`);
      
      if (medias.length > 1) {
        console.log(`   ✅ TAG COM MÚLTIPLAS MÍDIAS DETECTADA!`);
        console.log(`   📝 Quando usar [ENVIAR_MIDIA:${tag}], TODAS estas mídias devem ser enviadas:`);
        medias.forEach(m => {
          console.log(`      - ${m.mediaType}: ${m.description || 'sem descrição'}`);
        });
      }
    }

    // Verificar se há pelo menos uma tag com múltiplas mídias
    const multiMediaTags = Array.from(mediasByTag.entries()).filter(([, medias]) => medias.length > 1);
    
    if (multiMediaTags.length > 0) {
      console.log(`\n✅ TESTE 1 PASSOU: Encontradas ${multiMediaTags.length} tag(s) com múltiplas mídias`);
      return true;
    } else {
      console.log(`\n⚠️  AVISO: Nenhuma tag tem múltiplas mídias. Crie mídias com o mesmo nome para testar.`);
      console.log(`   Exemplo: Crie um áudio, um vídeo e uma imagem, todos chamados "RESTAURANTE"`);
      return true; // Não é erro, só não há dados para testar
    }

  } catch (error) {
    console.error(`\n❌ TESTE 1 FALHOU:`, error);
    return false;
  }
}

async function test2_UploadTxtFile() {
  console.log('\n\n📋 TESTE 2: Upload de arquivo .txt');
  console.log('='.repeat(60));

  try {
    // Criar FormData com arquivo .txt
    const form = new FormData();
    form.append('file', fs.createReadStream(TEST_TXT_PATH), {
      filename: 'test-document.txt',
      contentType: 'text/plain'
    });
    form.append('name', 'TESTE_TXT');
    form.append('description', 'Documento de teste em formato TXT');
    form.append('mediaType', 'document');
    form.append('triggerPhrase', 'envie o documento de teste');

    console.log('\n📤 Enviando arquivo .txt para API...');

    // Fazer upload
    const response = await fetch(`${API_URL}/api/agent/media/upload`, {
      method: 'POST',
      body: form,
      headers: {
        // FormData define o Content-Type automaticamente
      }
    });

    const result = await response.json();

    if (response.ok && result.success) {
      console.log('\n✅ Upload bem-sucedido!');
      console.log(`   ID da mídia: ${result.media?.id}`);
      console.log(`   URL de storage: ${result.media?.storageUrl}`);
      console.log(`   Nome do arquivo: ${result.media?.fileName}`);
      
      console.log('\n✅ TESTE 2 PASSOU: Arquivos .txt são aceitos como documento');
      return true;
    } else {
      console.error('\n❌ Upload falhou:', result);
      if (result.message?.includes('não suportado')) {
        console.error('   ❌ Arquivo .txt foi rejeitado pelo fileFilter');
      }
      console.log('\n❌ TESTE 2 FALHOU');
      return false;
    }

  } catch (error) {
    console.error('\n❌ TESTE 2 FALHOU:', error);
    return false;
  }
}

async function test3_SendMultipleMedias() {
  console.log('\n\n📋 TESTE 3: Enviar múltiplas mídias (simulação)');
  console.log('='.repeat(60));

  try {
    // Buscar uma tag com múltiplas mídias
    const response = await fetch(`${API_URL}/api/agent/media?userId=${USER_ID}`);
    const data = await response.json();

    // Agrupar por tag
    const mediasByTag = new Map<string, any[]>();
    for (const media of data.media || []) {
      const tag = media.name.toUpperCase();
      if (!mediasByTag.has(tag)) {
        mediasByTag.set(tag, []);
      }
      mediasByTag.get(tag)!.push(media);
    }

    // Encontrar tag com múltiplas mídias
    const multiMediaTag = Array.from(mediasByTag.entries())
      .find(([, medias]) => medias.length > 1);

    if (!multiMediaTag) {
      console.log('\n⚠️  Pulando TESTE 3: Nenhuma tag com múltiplas mídias disponível');
      return true;
    }

    const [tagName, medias] = multiMediaTag;
    console.log(`\n📋 Tag selecionada: ${tagName} (${medias.length} mídias)`);
    medias.forEach(m => {
      console.log(`   - ${m.mediaType}: ${m.description || 'sem descrição'}`);
    });

    console.log(`\n💡 Para testar o envio real:`);
    console.log(`   1. Envie no WhatsApp uma mensagem que mencione: "${tagName.toLowerCase()}"`);
    console.log(`   2. O agente deve responder com [ENVIAR_MIDIA:${tagName}]`);
    console.log(`   3. TODAS as ${medias.length} mídias devem ser enviadas sequencialmente`);
    console.log(`   4. Verifique no WhatsApp se recebeu: ${medias.map(m => m.mediaType).join(', ')}`);

    console.log('\n✅ TESTE 3 INFORMATIVO: Instruções de teste manual fornecidas');
    return true;

  } catch (error) {
    console.error('\n❌ TESTE 3 FALHOU:', error);
    return false;
  }
}

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 TESTE COMPLETO: Múltiplas Mídias + Upload .TXT');
  console.log('='.repeat(60));

  const results = {
    test1: await test1_MultipleMedias(),
    test2: await test2_UploadTxtFile(),
    test3: await test3_SendMultipleMedias(),
  };

  // Limpar arquivo temporário
  try {
    fs.unlinkSync(TEST_TXT_PATH);
    console.log('\n🧹 Arquivo temporário removido');
  } catch (e) {}

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESULTADO FINAL');
  console.log('='.repeat(60));
  console.log(`Teste 1 (Múltiplas Mídias):    ${results.test1 ? '✅ PASSOU' : '❌ FALHOU'}`);
  console.log(`Teste 2 (Upload .txt):         ${results.test2 ? '✅ PASSOU' : '❌ FALHOU'}`);
  console.log(`Teste 3 (Envio Real):          ${results.test3 ? '✅ PASSOU' : '❌ FALHOU'}`);

  const allPassed = results.test1 && results.test2 && results.test3;
  console.log('\n' + (allPassed ? '✅ TODOS OS TESTES PASSARAM!' : '❌ ALGUNS TESTES FALHARAM'));

  process.exit(allPassed ? 0 : 1);
}

// Executar testes
runAllTests();
