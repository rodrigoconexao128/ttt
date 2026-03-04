import bcrypt from 'bcryptjs';
const pass = 'Ibira2019!';
bcrypt.hash(pass, 10).then(hash => console.log('New hash:', hash)).then(() => process.exit(0));
