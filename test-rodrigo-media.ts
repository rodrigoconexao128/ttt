/**
 * Teste para verificar se o sistema de mídias está funcionando corretamente
 * para o usuário rodrigo4@gmail.com
 * 
 * Execute: npx tsx test-rodrigo-media.ts
 */

import { db } from "./server/db";
import { agentMediaLibrary, users, aiAgentConfig } from "@shared/schema";
import { eq } from "drizzle-orm";
import { generateMediaPromptBlock, parseMistralResponse } from "./server/mediaService";
import { getMistralClient } from "./server/mistralClient";

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

async function testRodrigoMedia() {
  console.log(`\n${COLORS.cyan}╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║     TESTE DE MÍDIAS - USUÁRIO rodrigo4@gmail.com             ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝${COLORS.reset}\n`);

  try {
    // 1. Buscar usuário
    console.log(`${COLORS.yellow}📋 1. Buscando usuário rodrigo4@gmail.com...${COLORS.reset}`);
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'rodrigo4@gmail.com'))
      .limit(1);

    if (!user) {
      console.log(`${COLORS.red}❌ Usuário não encontrado!${COLORS.reset}`);
      return;
    }

    console.log(`${COLORS.green}✅ Usuário encontrado: ID = ${user.id}${COLORS.reset}\n`);

    // 2. Buscar config do agente
    console.log(`${COLORS.yellow}📋 2. Buscando configuração do agente...${COLORS.reset}`);
    
    const [agentConfig] = await db
      .select()
      .from(aiAgentConfig)
      .where(eq(aiAgentConfig.userId, user.id))
      .limit(1);

    if (!agentConfig) {
      console.log(`${COLORS.red}❌ Agente não configurado!${COLORS.reset}`);
      return;
    }

    console.log(`${COLORS.green}✅ Agente configurado:`);
    console.log(`   - Ativo: ${agentConfig.isActive}`);
    console.log(`   - Modelo: ${agentConfig.model}`);
    console.log(`   - Prompt (primeiros 200 chars): ${agentConfig.prompt?.substring(0, 200)}...${COLORS.reset}\n`);

    // 3. Buscar mídias
    console.log(`${COLORS.yellow}📋 3. Buscando mídias do usuário...${COLORS.reset}`);
    
    const medias = await db
      .select()
      .from(agentMediaLibrary)
      .where(eq(agentMediaLibrary.userId, user.id));

    if (medias.length === 0) {
      console.log(`${COLORS.red}❌ Nenhuma mídia encontrada!${COLORS.reset}`);
      return;
    }

    console.log(`${COLORS.green}✅ Encontradas ${medias.length} mídias:${COLORS.reset}`);
    for (const media of medias) {
      const icon = media.mediaType === 'audio' ? '🎤' : 
                   media.mediaType === 'image' ? '🖼️' : 
                   media.mediaType === 'video' ? '🎬' : '📄';
      console.log(`\n   ${icon} ${COLORS.cyan}${media.name}${COLORS.reset}`);
      console.log(`      Tipo: ${media.mediaType}`);
      console.log(`      Descrição: ${media.description || 'Sem descrição'}`);
      console.log(`      ${COLORS.magenta}Quando usar: ${media.whenToUse || 'NÃO CONFIGURADO'}${COLORS.reset}`);
      console.log(`      Ativo: ${media.isActive}`);
      console.log(`      URL: ${media.storageUrl?.substring(0, 50)}...`);
    }

    // 4. Gerar bloco de mídia para prompt
    console.log(`\n${COLORS.yellow}📋 4. Gerando bloco de mídia para prompt...${COLORS.reset}`);
    const mediaBlock = generateMediaPromptBlock(medias);
    console.log(`\n${COLORS.blue}--- INÍCIO DO BLOCO DE MÍDIA ---${COLORS.reset}`);
    console.log(mediaBlock);
    console.log(`${COLORS.blue}--- FIM DO BLOCO DE MÍDIA ---${COLORS.reset}\n`);

    // 5. Testar a IA com uma mensagem simulando cliente
    console.log(`${COLORS.yellow}📋 5. Testando resposta da IA com cenários de mídia...${COLORS.reset}\n`);
    
    const testCases = [
      { 
        message: "Oi, tudo bem?", 
        expected: "Primeira mensagem - deve enviar mídia de início",
        checkMedia: true 
      },
      { 
        message: "Trabalho com vendas", 
        expected: "Resposta sobre para que precisa - deve enviar mídia COMO_FUNCIONA",
        checkMedia: true 
      },
      { 
        message: "Quero assinar", 
        expected: "Cliente quer assinar - não precisa mídia, só texto explicativo",
        checkMedia: false 
      },
    ];

    const mistral = await getMistralClient();

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      console.log(`\n${COLORS.cyan}┌─ TESTE ${i + 1}: ${tc.message}${COLORS.reset}`);
      console.log(`${COLORS.cyan}│  Esperado: ${tc.expected}${COLORS.reset}`);

      // Construir prompt com mídias
      const systemPrompt = agentConfig.prompt + '\n\n' + mediaBlock;

      try {
        const response = await mistral.chat.complete({
          model: agentConfig.model || 'mistral-small-latest',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: tc.message }
          ],
          temperature: 0.7,
          maxTokens: 800,
        });

        const responseText = response.choices?.[0]?.message?.content;
        if (typeof responseText === 'string') {
          console.log(`${COLORS.cyan}│${COLORS.reset}`);
          console.log(`${COLORS.cyan}│  ${COLORS.green}Resposta da IA:${COLORS.reset}`);
          console.log(`${COLORS.cyan}│${COLORS.reset}  ${responseText.substring(0, 500)}${responseText.length > 500 ? '...' : ''}`);

          // Verificar tags de mídia
          const parsed = parseMistralResponse(responseText);
          const mediaActions = parsed?.actions || [];

          if (mediaActions.length > 0) {
            console.log(`${COLORS.cyan}│${COLORS.reset}`);
            console.log(`${COLORS.cyan}│  ${COLORS.magenta}📁 Tags de mídia detectadas:${COLORS.reset}`);
            for (const action of mediaActions) {
              console.log(`${COLORS.cyan}│${COLORS.reset}     - ${action.media_name}`);
            }
          } else {
            console.log(`${COLORS.cyan}│${COLORS.reset}`);
            console.log(`${COLORS.cyan}│  ${tc.checkMedia ? COLORS.red : COLORS.green}📁 Nenhuma tag de mídia detectada${COLORS.reset}`);
          }

          // Verificar se há texto "[ÁUDIO ENVIADO PELO AGENTE]" na resposta
          if (responseText.includes('[ÁUDIO ENVIADO') || responseText.includes('ÁUDIO ENVIADO')) {
            console.log(`${COLORS.cyan}│${COLORS.reset}`);
            console.log(`${COLORS.cyan}│  ${COLORS.red}⚠️ PROBLEMA: Texto "[ÁUDIO ENVIADO...]" apareceu na resposta!${COLORS.reset}`);
          }
        }
      } catch (error) {
        console.log(`${COLORS.cyan}│  ${COLORS.red}❌ Erro: ${error}${COLORS.reset}`);
      }

      console.log(`${COLORS.cyan}└─────────────────────────────────────────${COLORS.reset}`);
      
      // Delay entre testes
      await new Promise(r => setTimeout(r, 1000));
    }

    // 6. Verificar se o problema é o formato da tag
    console.log(`\n${COLORS.yellow}📋 6. Verificando se o prompt usa o formato correto de tags...${COLORS.reset}`);
    
    const promptText = agentConfig.prompt || '';
    
    // Verificar formatos usados no prompt
    const hasSendMedia = promptText.includes('[SEND_MEDIA:');
    const hasMedia = promptText.includes('[MEDIA:');
    const hasEnviarMidia = promptText.includes('[ENVIAR_MIDIA:');

    console.log(`\n   Formatos encontrados no prompt:`);
    console.log(`   - [SEND_MEDIA:...] : ${hasSendMedia ? COLORS.red + 'SIM (INCORRETO)' : COLORS.green + 'NÃO'}${COLORS.reset}`);
    console.log(`   - [MEDIA:...] : ${hasMedia ? COLORS.green + 'SIM (CORRETO)' : COLORS.yellow + 'NÃO'}${COLORS.reset}`);
    console.log(`   - [ENVIAR_MIDIA:...] : ${hasEnviarMidia ? COLORS.yellow + 'SIM (FORMATO ADMIN)' : COLORS.green + 'NÃO'}${COLORS.reset}`);

    if (hasSendMedia && !hasMedia) {
      console.log(`\n   ${COLORS.red}⚠️ PROBLEMA IDENTIFICADO: O prompt usa [SEND_MEDIA:...] mas o sistema espera [MEDIA:...]${COLORS.reset}`);
      console.log(`   ${COLORS.yellow}💡 SOLUÇÃO: Atualizar o prompt do agente para usar [MEDIA:NOME] ao invés de [SEND_MEDIA:NOME]${COLORS.reset}`);
    }

    console.log(`\n${COLORS.green}═══════════════════════════════════════════════════════════════`);
    console.log(`                        TESTE CONCLUÍDO!`);
    console.log(`═══════════════════════════════════════════════════════════════${COLORS.reset}\n`);

  } catch (error) {
    console.error(`${COLORS.red}❌ Erro geral: ${error}${COLORS.reset}`);
  } finally {
    process.exit(0);
  }
}

testRodrigoMedia();
