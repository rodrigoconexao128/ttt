import { createClient } from '@supabase/supabase-js';

console.log('start');
const sup = createClient('https://bnfpcuzjvycudccycqqt.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTMzODksImV4cCI6MjA3NzkyOTM4OX0.AVDgFqn1h-00a5CzS2SZYlcXl4TxtKVrdjKDkN08kVM');
const { data, error } = await sup.auth.signInWithPassword({ email:'rodrigo4@gmail.com', password:'Ibira2019!' });
if (error) throw error;
const token = data.session.access_token;
console.log('login ok');

const cfg = {
  monday:{enabled:true,open:'09:00',close:'19:00'},
  tuesday:{enabled:true,open:'09:00',close:'19:00'},
  wednesday:{enabled:true,open:'09:00',close:'19:00'},
  thursday:{enabled:true,open:'09:00',close:'19:00'},
  friday:{enabled:true,open:'09:00',close:'19:00'},
  saturday:{enabled:true,open:'09:00',close:'17:00'},
  sunday:{enabled:false,open:'09:00',close:'17:00'},
  __break:{enabled:true,start:'12:15',end:'13:10'}
};

let r = await fetch('http://localhost:5000/api/salon/config', {
  method:'PUT',
  headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
  body: JSON.stringify({ opening_hours: cfg })
});
console.log('PUT status', r.status);
let j = await r.json();
console.log('saved break', JSON.stringify(j?.opening_hours?.__break));

r = await fetch('http://localhost:5000/api/salon/config', { headers:{ Authorization:`Bearer ${token}` } });
console.log('GET status', r.status);
j = await r.json();
console.log('loaded break', JSON.stringify(j?.opening_hours?.__break));
process.exit(0);
