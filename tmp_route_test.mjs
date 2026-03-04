const email='rodrigo4@gmail.com'; const password='Ibira2019!';

const loginRes = await fetch('http://localhost:5000/api/auth/signin',{
 method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,password})
});
console.log('login status',loginRes.status);
const setCookie=loginRes.headers.get('set-cookie');
console.log('has cookie',!!setCookie);
const body=await loginRes.json();
console.log('login keys',Object.keys(body));

const cfg={monday:{enabled:true,open:'09:00',close:'19:00'},tuesday:{enabled:true,open:'09:00',close:'19:00'},wednesday:{enabled:true,open:'09:00',close:'19:00'},thursday:{enabled:true,open:'09:00',close:'19:00'},friday:{enabled:true,open:'09:00',close:'19:00'},saturday:{enabled:true,open:'09:00',close:'17:00'},sunday:{enabled:false,open:'09:00',close:'17:00'},__break:{enabled:true,start:'12:10',end:'13:05'}};

let r=await fetch('http://localhost:5000/api/salon/config',{method:'PUT',headers:{'Content-Type':'application/json','Cookie':setCookie||''},body:JSON.stringify({opening_hours:cfg})});
console.log('put status',r.status);
console.log('put text',await r.text());

r=await fetch('http://localhost:5000/api/salon/config',{headers:{'Cookie':setCookie||''}});
console.log('get status',r.status);
console.log('get text',await r.text());
process.exit(0);
