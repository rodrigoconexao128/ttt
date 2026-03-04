
import 'dotenv/config';
import { db } from "./server/db";
import { users, aiAgentConfig, systemConfig } from "./shared/schema";
import { eq } from "drizzle-orm";

async function checkConfig() {
  console.log("Checking DB configuration...");

  // 1. Get User ID
  const userList = await db.select().from(users).where(eq(users.email, "bigacaicuiaba@gmail.com"));
  if (userList.length === 0) {
    console.error("User 'bigacaicuiaba@gmail.com' not found!");
    process.exit(1);
  }
  const user = userList[0];
  console.log(`Found User: ${user.email} (ID: ${user.id})`);

  // 2. Get AI Config (Prompt)
  const aiConfigList = await db.select().from(aiAgentConfig).where(eq(aiAgentConfig.userId, user.id));
  if (aiConfigList.length === 0) {
    console.error("AI Config not found for this user!");
  } else {
    console.log("AI Config Found:");
    console.log("- Model:", aiConfigList[0].model);
    console.log("- Prompt Length:", aiConfigList[0].prompt.length);
  }

  // 3. Get System Config (Keys)
  const configs = await db.select().from(systemConfig);
  console.log("System Config Keys found:");
  configs.forEach(c => {
    if (c.chave.includes("key")) {
       console.log(`- ${c.chave}: ${c.valor ? "********" + c.valor.slice(-4) : "NULL"}`); 
    }
  });

  process.exit(0);
}

checkConfig().catch(console.error);
