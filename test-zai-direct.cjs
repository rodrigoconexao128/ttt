
const https = require('https');

const apiKey = "0a519da5296f47a5a4ba57d1ab8cc29f.AA1IAazQ21XzJyn3";
const model = "glm-4-flash"; // Trying a cheaper/faster model first

const data = JSON.stringify({
  model: model,
  messages: [
    { role: "user", content: "Hello, are you working?" }
  ]
});

const options = {
  hostname: 'api.z.ai',
  path: '/api/paas/v4/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'Content-Length': Buffer.byteLength(data)
  }
};

console.log(`Testing Z.AI with model: ${model}`);
console.log(`Key: ${apiKey.substring(0, 10)}...`);

const req = https.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('BODY:', body);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
