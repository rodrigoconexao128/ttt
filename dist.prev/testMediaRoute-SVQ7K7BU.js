import {
  storage
} from "./chunk-YXNU4RTD.js";
import "./chunk-YCIPFGXJ.js";
import "./chunk-HIRAYR4B.js";
import "./chunk-WF5ZUJEW.js";
import "./chunk-KFQGP6VL.js";

// server/testMediaRoute.ts
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
var router = Router();
router.post("/api/test/setup-media-flow", async (req, res) => {
  try {
    console.log("\u{1F680} Configurando fluxo de teste de m\xEDdia...");
    let user = await storage.getUserByEmail("teste@agentezap.com");
    if (!user) {
      const userId = uuidv4();
      await storage.createUser({
        id: userId,
        email: "teste@agentezap.com",
        name: "Usu\xE1rio Teste",
        phone: "+5511999999999",
        role: "user"
      });
      user = await storage.getUserByEmail("teste@agentezap.com");
      console.log(`\u2705 Usu\xE1rio criado: ${user?.id}`);
    } else {
      console.log(`\u2705 Usu\xE1rio encontrado: ${user.id}`);
    }
    if (!user) {
      return res.status(500).json({ error: "Falha ao criar/buscar usu\xE1rio" });
    }
    const agentPrompt = `# IDENTIDADE
Sou o Vendedor Virtual da Loja Teste. Atendo clientes com cordialidade.

# CONTEXTO
Loja de produtos diversos com cat\xE1logo de imagens.

# INSTRU\xC7\xD5ES IMPORTANTES PARA M\xCDDIA
Quando o cliente perguntar sobre "catalogo" ou "produtos", voc\xEA DEVE incluir EXATAMENTE a tag [MEDIA:CATALOGO_TESTE] no final da sua resposta.

Exemplo correto:
Cliente: "quero ver o catalogo"
Voc\xEA: "Claro! Aqui est\xE1 nosso cat\xE1logo completo: [MEDIA:CATALOGO_TESTE]"`;
    let agent = await storage.getAgentConfig(user.id);
    if (!agent) {
      await storage.createAgentConfig({
        userId: user.id,
        prompt: agentPrompt,
        isActive: true,
        model: "mistral-small-latest"
      });
      console.log(`\u2705 Agente criado`);
    } else {
      await storage.updateAgentPrompt(user.id, agentPrompt);
      console.log(`\u2705 Agente atualizado`);
    }
    console.log("\u{1F4F8} Configurando m\xEDdia...");
    await storage.db("agent_media_library").where({ user_id: user.id }).del();
    const mediaUrl = "https://via.placeholder.com/300x200.png?text=CATALOGO";
    await storage.db("agent_media_library").insert({
      user_id: user.id,
      name: "CATALOGO_TESTE",
      media_type: "image",
      storage_url: mediaUrl,
      description: "Cat\xE1logo de produtos da loja",
      when_to_use: "catalogo",
      is_active: true,
      send_alone: false,
      display_order: 0
    });
    console.log(`\u2705 M\xEDdia adicionada: ${mediaUrl}`);
    let token = await storage.db("test_agent_tokens").where({ user_id: user.id }).first();
    if (!token) {
      [token] = await storage.db("test_agent_tokens").insert({
        user_id: user.id,
        token: "TEST_MEDIA_" + Date.now(),
        agent_name: "Vendedor Virtual",
        company_name: "Loja Teste"
      }).returning("*");
      console.log(`\u2705 Token criado: ${token.token}`);
    } else {
      console.log(`\u2705 Token existente: ${token.token}`);
    }
    const medias = await storage.db("agent_media_library").where({ user_id: user.id, is_active: true }).select("*");
    res.json({
      success: true,
      userId: user.id,
      token: token.token,
      testUrl: `http://localhost:5000/test/${token.token}`,
      mediasCount: medias.length,
      medias: medias.map((m) => ({
        name: m.name,
        whenToUse: m.when_to_use,
        type: m.media_type
      })),
      instructions: [
        "1. Abra o link testUrl",
        "2. Digite: 'quero ver o catalogo'",
        "3. O agente deve incluir [MEDIA:CATALOGO_TESTE] na resposta",
        "4. O frontend deve exibir a imagem"
      ]
    });
  } catch (error) {
    console.error("\u274C Erro ao configurar teste:", error);
    res.status(500).json({ error: String(error) });
  }
});
var testMediaRoute_default = router;
export {
  testMediaRoute_default as default
};
