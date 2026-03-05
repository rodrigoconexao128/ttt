/**
 * Teste completo do fluxo de mídia:
 * 1. Criar usuário teste
 * 2. Criar agente para o usuário
 * 3. Adicionar mídia ao agente
 * 4. Testar se a mídia é enviada
 */

import knex from "knex";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const db = knex({
  client: "pg",
  connection: process.env.DATABASE_URL,
  pool: { min: 0, max: 1 },
});

async function main() {
  try {
    console.log("🚀 Iniciando teste completo do fluxo de mídia...\n");

    // 1. Buscar ou criar usuário teste
    console.log("1️⃣ Buscando usuário teste...");
    let user = await db("users")
      .where({ email: "teste@agentezap.com" })
      .first();

    if (!user) {
      console.log("   Criando novo usuário...");
      [user] = await db("users")
        .insert({
          email: "teste@agentezap.com",
          name: "Usuário Teste",
          phone: "+5511999999999",
          role: "user",
          onboarding_completed: true,
        })
        .returning("*");
      console.log(`   ✅ Usuário criado: ${user.id}`);
    } else {
      console.log(`   ✅ Usuário encontrado: ${user.id}`);
    }

    // 2. Criar ou atualizar agente
    console.log("\n2️⃣ Configurando agente...");
    let agent = await db("ai_agent_config")
      .where({ user_id: user.id })
      .first();

    const agentPrompt = `# IDENTIDADE
Sou o Vendedor Virtual da Loja Teste. Atendo clientes com cordialidade.

# CONTEXTO
Loja de produtos diversos com catálogo de imagens.

# QUANDO CLIENTE PEDIR CATÁLOGO
Quando o cliente perguntar sobre "catalogo" ou "produtos", você DEVE incluir a tag [MEDIA:CATALOGO_TESTE] na sua resposta.

Exemplo: "Aqui está nosso catálogo! [MEDIA:CATALOGO_TESTE]"`;

    if (!agent) {
      [agent] = await db("ai_agent_config")
        .insert({
          user_id: user.id,
          prompt: agentPrompt,
          is_active: true,
          model: "mistral-small-latest",
        })
        .returning("*");
      console.log(`   ✅ Agente criado`);
    } else {
      await db("ai_agent_config")
        .where({ user_id: user.id })
        .update({ prompt: agentPrompt });
      console.log(`   ✅ Agente atualizado`);
    }

    // 3. Adicionar mídia de teste
    console.log("\n3️⃣ Adicionando mídia de teste...");
    
    // Deletar mídias antigas deste usuário
    await db("agent_media_library").where({ user_id: user.id }).del();
    
    const mediaUrl = "https://via.placeholder.com/300x200.png?text=CATALOGO";
    
    await db("agent_media_library").insert({
      user_id: user.id,
      name: "CATALOGO_TESTE",
      media_type: "image",
      storage_url: mediaUrl,
      description: "Catálogo de produtos da loja",
      when_to_use: "catalogo",
      is_active: true,
      send_alone: false,
      display_order: 0,
    });
    console.log(`   ✅ Mídia adicionada: ${mediaUrl}`);

    // 4. Criar token de teste
    console.log("\n4️⃣ Criando token de teste...");
    let token = await db("test_agent_tokens")
      .where({ user_id: user.id })
      .first();

    if (!token) {
      [token] = await db("test_agent_tokens")
        .insert({
          user_id: user.id,
          token: "TEST_" + Date.now(),
          agent_name: "Vendedor Virtual",
          company_name: "Loja Teste",
        })
        .returning("*");
      console.log(`   ✅ Token criado: ${token.token}`);
    } else {
      console.log(`   ✅ Token existente: ${token.token}`);
    }

    // 5. Verificar mídia no banco
    console.log("\n5️⃣ Verificando mídia no banco...");
    const medias = await db("agent_media_library")
      .where({ user_id: user.id, is_active: true })
      .select("*");
    
    console.log(`   📚 Mídias encontradas: ${medias.length}`);
    medias.forEach((m) => {
      console.log(`      - ${m.name}: ${m.when_to_use} (${m.media_type})`);
    });

    console.log("\n✅ TESTE CONFIGURADO COM SUCESSO!");
    console.log(`\n🔗 Link do Test Agent: http://localhost:5000/test/${token.token}`);
    console.log(`\n📝 Para testar:`);
    console.log(`   1. Abra o link acima`);
    console.log(`   2. Digite: "quero ver o catalogo"`);
    console.log(`   3. O agente deve responder com a imagem`);
    
  } catch (error) {
    console.error("❌ Erro:", error);
  } finally {
    await db.destroy();
  }
}

main();
