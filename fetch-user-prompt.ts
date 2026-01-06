
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkPrompt() {
  const email = 'rodrigo4@gmail.com';
  
  // 1. Get User ID
  const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
  const user = users.find(u => u.email === email);

  if (!user) {
    console.error('User not found:', email);
    return;
  }

  console.log('User ID:', user.id);

  // 2. Get Config
  const { data: config, error: configError } = await supabase
    .from('ai_agent_config')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (configError) {
    console.error('Error fetching config:', configError);
    return;
  }

  console.log('--- PROMPT START ---');
  console.log(config.prompt);
  console.log('--- PROMPT END ---');
}

checkPrompt();
