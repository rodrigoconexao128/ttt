const XLSX = require('xlsx');
const path = require('path');

try {
  const filePath = path.join(__dirname, 'LISTA IA.xlsx');
  console.log('Lendo arquivo:', filePath);
  
  const wb = XLSX.readFile(filePath);
  console.log('Sheets:', wb.SheetNames);
  
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, {header: 1, defval: ''});
  
  console.log('\n=== HEADERS (linha 1) ===');
  console.log(JSON.stringify(data[0], null, 2));
  
  console.log('\n=== TOTAL DE LINHAS ===');
  console.log(data.length - 1, 'produtos');
  
  console.log('\n=== PRIMEIRAS 5 LINHAS DE DADOS ===');
  for(let i = 1; i <= 5 && i < data.length; i++) {
    console.log(`Linha ${i}:`, JSON.stringify(data[i]));
  }
  
  console.log('\n=== ANÁLISE DE ESTRUTURA ===');
  const headers = data[0];
  headers.forEach((h, idx) => {
    console.log(`Coluna ${idx}: "${h}"`);
  });
  
} catch (error) {
  console.error('Erro:', error.message);
}
