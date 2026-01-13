import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

// Configurações
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTMzODksImV4cCI6MjA3NzkyOTM4OX0.AVDgFqn1h-00a5CzS2SZYlcXl4TxtKVrdjKDkN08kVM';
const USER_ID = 'd4a1d307-3d78-4bfe-8ab7-c4a0c3ccbb1c'; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
    const { data, error } = await supabase
        .from('ai_agent_config')
        .select('prompt')
        .eq('user_id', USER_ID)
        .single();
    
    if (error) {
        console.log("Error fetching:", error);
    } else {
        if (data.prompt.includes("RESTRIÇÃO GEOGRÁFICA: ATENDEMOS EXCLUSIVAMENTE")) {
            console.log("SUCCESS: Prompt is updated in DB.");
        } else {
            console.log("FAIL: Prompt in DB is OLD.");
        }
    }
}
check();
