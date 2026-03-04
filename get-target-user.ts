
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTMzODksImV4cCI6MjA3NzkyOTM4OX0.AVDgFqn1h-00a5CzS2SZYlcXl4TxtKVrdjKDkN08kVM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  try {
    // 1. Get User ID - List all to find correct one
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .limit(20);

    if (userError) {
      console.log('Error fetching users:', userError);
      return;
    }

    console.log('Users found:', users.length);
    users.forEach(u => console.log(`${u.id}: ${u.email}`));

    const targetUser = users.find(u => u.email === 'contato@jbeletrica.com.br');

    if (!targetUser) {
        console.log("Target user contato@jbeletrica.com.br NOT FOUND in top 20 list.");
        return;
    }
    const userData = targetUser;

    console.log('User Found:');
    console.log('ID:', userData.id);
    console.log('Email:', userData.email);

    // 2. Get Config
    const { data: configData, error: configError } = await supabase
      .from('ai_agent_config')
      .select('prompt')
      .eq('user_id', userData.id)
      .single();

    if (configError) {
        console.log("Error fetching config:", configError);
    } else {
        console.log('Current Prompt Length:', configData.prompt?.length);
        console.log('-----------------------------------');
        console.log(configData.prompt);
        console.log('-----------------------------------');
    }

  } catch (e) {
    console.error(e);
  }
}

main();
