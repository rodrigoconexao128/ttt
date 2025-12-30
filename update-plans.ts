
import "dotenv/config";
import { db } from "./server/db";
import { plans } from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  try {
    console.log("Updating plans...");

    // 1. Update Plano Mensal to 99.99
    // ID from previous check: a4c42297-1d4a-4348-9e27-00eebe96143a
    await db.update(plans)
      .set({ valor: "99.99" })
      .where(eq(plans.id, "a4c42297-1d4a-4348-9e27-00eebe96143a"));
    console.log("Updated Plano Mensal to 99.99");

    // 2. Create new plan "Implementação Mensal"
    const newPlan = {
      nome: "Implementação Mensal",
      descricao: "Implementação completa diluída na mensalidade",
      valor: "199.99",
      periodicidade: "mensal",
      tipo: "implementacao_mensal",
      descontoPercent: 0,
      badge: "NOVO",
      destaque: false,
      ordem: 4,
      limiteConversas: -1,
      limiteAgentes: 1,
      caracteristicas: [
        "Configuração completa da IA",
        "Personalização do agente",
        "Treinamento inicial",
        "Suporte prioritário",
        "Mensalidade fixa",
        "Sem taxa de adesão alta"
      ],
      ativo: true
    };

    await db.insert(plans).values(newPlan);
    console.log("Created new plan: Implementação Mensal");

  } catch (error) {
    console.error("Error updating plans:", error);
  }
  process.exit(0);
}

main();
