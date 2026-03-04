import bcrypt from 'bcryptjs';

async function generateHash() {
  const password = 'Ibira2019!';
  const hash = await bcrypt.hash(password, 10);
  console.log('Hash bcrypt:', hash);
}

generateHash();
