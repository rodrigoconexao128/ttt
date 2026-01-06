
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    // Fallback? try reading .env file manually
    try {
        const fs = require('fs');
        const envConfig = require('dotenv').parse(fs.readFileSync('.env'));
        for (const k in envConfig) {
            process.env[k] = envConfig[k]
        }
    } catch (e) {
        console.log("Could not read .env file");
    }
  }

  if (!process.env.DATABASE_URL) { 
      console.error("Still no DATABASE_URL");
      return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const email = 'Samplemixaudio@gmail.com';
  console.log(`Searching for user: ${email}`);
  
  try {
    const users = await pool.query(`
        SELECT id, email, name FROM users
        WHERE email ILIKE $1
    `, [email]);
    
    if (users.rows.length === 0) {
        console.log('User not found.');
        return;
    }
    
    const user = users.rows[0];
    console.log(`FOUND USER: ${user.id}: ${user.email} (${user.name})`);
    
    // Check Legacy Config
    const agent = await pool.query(`
        SELECT id, prompt, model, is_active FROM ai_agent_config WHERE user_id = $1
    `, [user.id]);
    
    if (agent.rows.length > 0) {
        console.log(`\nLEGACY CONFIG:`);
        console.log(`  ID: ${agent.rows[0].id}`);
        console.log(`  Active: ${agent.rows[0].is_active}`);
        console.log(`  Prompt Length: ${(agent.rows[0].prompt || '').length}`);
        console.log(`  Prompt Preview:\n${(agent.rows[0].prompt || '').substring(0, 300)}...`);
    } else {
        console.log('\nLEGACY CONFIG: NONE');
    }

    // Check Business Config (Advanced)
    const business = await pool.query(`
        SELECT id, is_active, agent_name, company_name, products_services FROM business_agent_configs WHERE user_id = $1
    `, [user.id]);
    
    if (business.rows.length > 0) {
        console.log(`\nBUSINESS CONFIG (ADVANCED):`);
        console.log(`  ID: ${business.rows[0].id}`);
        console.log(`  Active: ${business.rows[0].is_active}`);
        console.log(`  Agent Name: ${business.rows[0].agent_name}`);
        console.log(`  Products/Services: ${JSON.stringify(business.rows[0].products_services).substring(0, 100)}...`);
    } else {
        console.log('\nBUSINESS CONFIG: NONE');
    }
  } catch (err) {
      console.error("DB Error:", err);
  } finally {
      await pool.end();
  }
}

main().catch(console.error).finally(() => process.exit(0));
