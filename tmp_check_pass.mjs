import bcrypt from 'bcryptjs';
const hash = '.SW9WhC.6ENELTSezqrY6rf314ZBF8SojP5HpRkciahN4X6';
bcrypt.compare('Ibira2019!', hash).then(r => console.log('rodrigo4 password match:', r)).then(() => {
  return bcrypt.compare('Ibira2019!', '/BX7WUbnG6Iska7pH7wnoA36VyD.');
}).then(r => console.log('rodrigoconexao128 password match:', r)).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
