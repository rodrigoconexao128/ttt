/**
 * 🧪 Teste do Website Scraper
 * Execute com: npx ts-node test-website-scraper.ts
 * 
 * Este script testa a extração de dados de um website
 */

import { scrapeWebsite, validateUrl, formatContextForAgent } from "./server/websiteScraperService";

async function testScraper() {
  console.log("🌐 TESTE DO WEBSITE SCRAPER");
  console.log("=".repeat(50));

  // URL de teste
  const testUrl = "https://www.temdearte.com.br/";
  
  console.log(`\n📍 URL de teste: ${testUrl}`);
  console.log("-".repeat(50));

  // 1. Validar URL
  console.log("\n1️⃣ Validando URL...");
  const validation = validateUrl(testUrl);
  console.log(`   ✅ Válida: ${validation.valid}`);
  console.log(`   📎 URL normalizada: ${validation.normalizedUrl || "N/A"}`);
  
  if (!validation.valid) {
    console.log(`   ❌ Erro: ${validation.error}`);
    return;
  }

  // 2. Fazer scraping
  console.log("\n2️⃣ Iniciando scraping (pode demorar até 30s)...");
  const startTime = Date.now();
  
  try {
    const result = await scrapeWebsite(validation.normalizedUrl!);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`   ⏱️ Tempo: ${elapsed}s`);
    console.log(`   ✅ Sucesso: ${result.success}`);
    
    if (!result.success) {
      console.log(`   ❌ Erro: ${result.error}`);
      return;
    }

    // 3. Mostrar resultados
    console.log("\n3️⃣ RESULTADOS:");
    console.log("-".repeat(50));
    
    console.log(`   🏪 Nome do site: ${result.websiteName || "Não identificado"}`);
    console.log(`   📝 Descrição: ${result.websiteDescription?.substring(0, 100) || "N/A"}...`);
    console.log(`   📄 Texto extraído: ${result.extractedText.length} caracteres`);
    console.log(`   📦 Produtos encontrados: ${result.productsFound}`);
    console.log(`   📑 Páginas analisadas: ${result.pagesScraped}`);

    // 4. Informações do negócio
    console.log("\n4️⃣ INFORMAÇÕES DO NEGÓCIO:");
    console.log("-".repeat(50));
    const info = result.businessInfo;
    if (info.contactPhone) console.log(`   📞 Telefone: ${info.contactPhone}`);
    if (info.contactEmail) console.log(`   📧 Email: ${info.contactEmail}`);
    if (info.address) console.log(`   📍 Endereço: ${info.address}`);
    if (info.socialMedia) {
      console.log("   📱 Redes sociais:");
      Object.entries(info.socialMedia).forEach(([name, url]) => {
        console.log(`      - ${name}: ${url}`);
      });
    }

    // 5. Lista de produtos
    console.log("\n5️⃣ PRODUTOS ENCONTRADOS:");
    console.log("-".repeat(50));
    if (result.products.length > 0) {
      result.products.slice(0, 10).forEach((product, i) => {
        console.log(`   ${i + 1}. ${product.name}`);
        if (product.price) console.log(`      💰 Preço: ${product.price}`);
        if (product.description) console.log(`      📝 ${product.description.substring(0, 80)}...`);
      });
      if (result.products.length > 10) {
        console.log(`   ... e mais ${result.products.length - 10} produtos`);
      }
    } else {
      console.log("   ⚠️ Nenhum produto encontrado com estrutura padrão");
    }

    // 6. Preview do contexto formatado
    console.log("\n6️⃣ CONTEXTO FORMATADO (preview):");
    console.log("-".repeat(50));
    console.log(result.formattedContext.substring(0, 1000));
    if (result.formattedContext.length > 1000) {
      console.log(`\n   ... (${result.formattedContext.length - 1000} caracteres restantes)`);
    }

    console.log("\n" + "=".repeat(50));
    console.log("✅ TESTE CONCLUÍDO COM SUCESSO!");
    console.log("=".repeat(50));

  } catch (error: any) {
    console.error(`\n❌ ERRO NO TESTE: ${error.message}`);
    console.error(error.stack);
  }

  // Fechar browser
  const { closeBrowser } = await import("./server/websiteScraperService");
  await closeBrowser();
  
  process.exit(0);
}

// Executar
testScraper().catch(console.error);
