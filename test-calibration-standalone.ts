/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🧪 TESTE STANDALONE: Sistema de Auto-Calibração de Prompts
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Execute com: npx tsx test-calibration-standalone.ts
 * 
 * Este script testa o sistema de calibração sem precisar subir o servidor.
 * Valida:
 * 1. Geração de cenários de teste
 * 2. Loop IA Cliente vs IA Agente
 * 3. Análise de respostas
 * 4. Reparo automático de prompts
 */

import 'dotenv/config';
import { PromptCalibrationService, calibrarPromptEditado } from './server/promptCalibrationService';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || '';

// ═══════════════════════════════════════════════════════════════════════════
// PROMPTS DE TESTE
// ═══════════════════════════════════════════════════════════════════════════

const PROMPT_BASE_PIZZARIA = `Você é João, atendente da Pizza Veloce 🍕

CARDÁPIO:
- Calabresa: R$ 40
- Mussarela: R$ 38
- Frango: R$ 42
- Portuguesa: R$ 45

REGRAS:
- Seja simpático e objetivo
- Entrega grátis acima de R$ 50
- Horário: 18h às 23h
- Aceita dinheiro e cartão`;

const PROMPT_BASE_CLINICA = `Você é Maria, atendente da Clínica Sorriso Perfeito 🦷

SERVIÇOS:
- Limpeza: R$ 150
- Clareamento: R$ 500
- Consulta: R$ 100

REGRAS:
- Seja empática e profissional
- Não dê diagnósticos
- Agende consultas
- Aceita convênio Amil e SulAmérica`;

// ═══════════════════════════════════════════════════════════════════════════
// CENÁRIOS DE TESTE
// ═══════════════════════════════════════════════════════════════════════════

interface TesteCalibração {
  nome: string;
  promptOriginal: string;
  instrucaoEdicao: string;
  promptEditado: string;
  expectativa: string;
}

const TESTES: TesteCalibração[] = [
  {
    nome: "✅ Teste 1: Adicionar PIX (deve passar)",
    promptOriginal: PROMPT_BASE_PIZZARIA,
    instrucaoEdicao: "Adicione que aceitamos PIX",
    promptEditado: PROMPT_BASE_PIZZARIA.replace(
      "Aceita dinheiro e cartão",
      "Aceita dinheiro, cartão e PIX"
    ),
    expectativa: "Cliente pergunta se aceita PIX → Agente confirma que aceita"
  },
  {
    nome: "✅ Teste 2: Mudar nome do atendente (deve passar)",
    promptOriginal: PROMPT_BASE_PIZZARIA,
    instrucaoEdicao: "Mude o nome do atendente para Roberto",
    promptEditado: PROMPT_BASE_PIZZARIA.replace("João", "Roberto"),
    expectativa: "Cliente pergunta quem está falando → Agente diz Roberto"
  },
  {
    nome: "✅ Teste 3: Adicionar convênio (deve passar)",
    promptOriginal: PROMPT_BASE_CLINICA,
    instrucaoEdicao: "Adicione que também aceita convênio Unimed",
    promptEditado: PROMPT_BASE_CLINICA.replace(
      "convênio Amil e SulAmérica",
      "convênio Amil, SulAmérica e Unimed"
    ),
    expectativa: "Cliente pergunta sobre Unimed → Agente confirma que aceita"
  },
  {
    nome: "❌ Teste 4: Edição mal feita (deve falhar e reparar)",
    promptOriginal: PROMPT_BASE_PIZZARIA,
    instrucaoEdicao: "Adicione horário de almoço das 11h às 14h",
    promptEditado: PROMPT_BASE_PIZZARIA, // Não foi editado! Simulando erro
    expectativa: "Cliente pergunta sobre almoço → Sistema deve detectar falha e reparar"
  },
  {
    nome: "✅ Teste 5: Mudar tom para mais informal",
    promptOriginal: PROMPT_BASE_CLINICA,
    instrucaoEdicao: "Seja mais informal e use gírias de WhatsApp como 'vc', 'tbm', 'blz'",
    promptEditado: PROMPT_BASE_CLINICA.replace(
      "Seja empática e profissional",
      "Seja empática e informal. Use 'vc', 'tbm', 'blz' naturalmente."
    ),
    expectativa: "Resposta do agente deve ter tom informal"
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL DE TESTE
// ═══════════════════════════════════════════════════════════════════════════

async function executarTestes() {
  console.log("\n");
  console.log("╔═══════════════════════════════════════════════════════════════════╗");
  console.log("║     🧪 TESTE STANDALONE: Auto-Calibração de Prompts              ║");
  console.log("╚═══════════════════════════════════════════════════════════════════╝");
  console.log("\n");

  // Verificar API key
  if (!MISTRAL_API_KEY) {
    console.error("❌ MISTRAL_API_KEY não encontrada no .env");
    console.log("   Configure a variável de ambiente MISTRAL_API_KEY");
    process.exit(1);
  }
  console.log(`✅ API Key configurada: ${MISTRAL_API_KEY.substring(0, 10)}...`);
  console.log("\n");

  const resultados: { nome: string; sucesso: boolean; score: number; tempo: number }[] = [];

  for (let i = 0; i < TESTES.length; i++) {
    const teste = TESTES[i];
    
    console.log("─".repeat(70));
    console.log(`\n📋 ${teste.nome}`);
    console.log(`   Instrução: "${teste.instrucaoEdicao}"`);
    console.log(`   Expectativa: ${teste.expectativa}`);
    console.log("");

    try {
      const resultado = await calibrarPromptEditado(
        teste.promptEditado,
        teste.instrucaoEdicao,
        MISTRAL_API_KEY,
        "mistral",
        {
          numeroCenarios: 2, // Reduzido para testes mais rápidos
          maxTentativasReparo: 2,
          scoreMinimoAprovacao: 60
        }
      );

      console.log(`\n📊 RESULTADO:`);
      console.log(`   Score: ${resultado.scoreGeral}/100`);
      console.log(`   Cenários: ${resultado.cenariosAprovados}/${resultado.cenariosTotais} aprovados`);
      console.log(`   Reparos: ${resultado.tentativasReparo}`);
      console.log(`   Tempo: ${resultado.tempoMs}ms`);
      console.log(`   Status: ${resultado.sucesso ? "✅ APROVADO" : "❌ REPROVADO"}`);

      // Mostrar detalhes dos cenários
      for (const r of resultado.resultados) {
        console.log(`\n   📝 Cenário ${r.cenarioId}:`);
        console.log(`      Cliente: "${r.perguntaCliente.substring(0, 50)}..."`);
        console.log(`      Agente: "${r.respostaAgente.substring(0, 80)}..."`);
        console.log(`      ${r.passou ? "✅" : "❌"} Score: ${r.score}/100 - ${r.motivo.substring(0, 50)}...`);
      }

      resultados.push({
        nome: teste.nome,
        sucesso: resultado.sucesso,
        score: resultado.scoreGeral,
        tempo: resultado.tempoMs
      });

    } catch (error: any) {
      console.error(`\n❌ ERRO no teste: ${error.message}`);
      resultados.push({
        nome: teste.nome,
        sucesso: false,
        score: 0,
        tempo: 0
      });
    }

    // Pequena pausa entre testes para evitar rate limit
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESUMO FINAL
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("\n\n");
  console.log("╔═══════════════════════════════════════════════════════════════════╗");
  console.log("║                      📊 RESUMO FINAL                              ║");
  console.log("╚═══════════════════════════════════════════════════════════════════╝");
  console.log("");

  const aprovados = resultados.filter(r => r.sucesso).length;
  const tempoTotal = resultados.reduce((acc, r) => acc + r.tempo, 0);
  const scoreMedia = resultados.reduce((acc, r) => acc + r.score, 0) / resultados.length;

  console.log(`   Total de testes: ${resultados.length}`);
  console.log(`   Aprovados: ${aprovados} (${((aprovados / resultados.length) * 100).toFixed(0)}%)`);
  console.log(`   Score médio: ${scoreMedia.toFixed(1)}/100`);
  console.log(`   Tempo total: ${(tempoTotal / 1000).toFixed(1)}s`);
  console.log("");

  console.log("   Detalhes:");
  for (const r of resultados) {
    const status = r.sucesso ? "✅" : "❌";
    console.log(`   ${status} ${r.nome.substring(0, 40)} | Score: ${r.score} | ${r.tempo}ms`);
  }

  console.log("\n");

  // Exit code baseado no resultado
  const sucesso = aprovados >= resultados.length * 0.6; // Pelo menos 60% deve passar
  console.log(sucesso 
    ? "🎉 TESTES PASSARAM! Sistema de calibração funcionando corretamente."
    : "⚠️ TESTES FALHARAM! Revisar implementação."
  );

  process.exit(sucesso ? 0 : 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUÇÃO
// ═══════════════════════════════════════════════════════════════════════════

executarTestes().catch(error => {
  console.error("❌ Erro fatal:", error);
  process.exit(1);
});
