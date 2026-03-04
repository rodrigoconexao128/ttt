import { createClient } from '@supabase/supabase-js';
console.log('start');
const sup = createClient('https://bnfpcuzjvycudccycqqt.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTMzODksImV4cCI6MjA3NzkyOTM4OX0.AVDgFqn1h-00a5CzS2SZYlcXl4TxtKVrdjKDkN08kVM');
console.log('client ok');
const p = sup.auth.signInWithPassword({email:'rodrigo4@gmail.com',password:'Ibira2019!'});
const timeout = new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),15000));
const {data,error}= await Promise.race([p,timeout]);
console.log('done',!!data, error?.message);
