
import "dotenv/config";
import { db } from "./server/db";
import { plans } from "@shared/schema";

async function main() {
  try {
    const allPlans = await db.select().from(plans);
    console.log("Current Plans:");
    console.log(JSON.stringify(allPlans, null, 2));
  } catch (error) {
    console.error("Error fetching plans:", error);
  }
  process.exit(0);
}

main();
