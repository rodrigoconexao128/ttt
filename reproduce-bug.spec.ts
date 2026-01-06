
import { test, expect } from '@playwright/test';

test('reproduce editor stale state bug', async ({ page }) => {
  // 1. Login
  await page.goto('http://localhost:5000/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('Samplemixaudio@gmail.com');
  await page.getByRole('textbox', { name: 'Senha' }).fill('@Youriding95');
  await page.getByRole('button', { name: 'Entrar' }).click();
  
  // Wait for dashboard
  await page.waitForURL('http://localhost:5000/dashboard');

  // 2. Go to Agent Studio
  await page.getByRole('button', { name: 'Meu Agente IA' }).click();
  await page.waitForURL('http://localhost:5000/meu-agente-ia');

  // 3. Check initial prompt in "Editar" tab
  // Switch to Edit tab
  await page.getByRole('button', { name: 'Editar' }).click();
  const initialPrompt = await page.locator('textarea').first().inputValue();
  console.log('Initial Prompt Length:', initialPrompt.length);

  // 4. Switch to Chat tab and request change
  await page.getByRole('button', { name: 'Chat' }).click();
  const uniqueToken = `TOKEN_${Date.now()}`;
  await page.getByPlaceholder('Digite sua mensagem...').fill(`Por favor, adicione o código "${uniqueToken}" no final do prompt.`);
  await page.getByPlaceholder('Digite sua mensagem...').press('Enter');

  // 5. Wait for AI response (bubble from assistant)
  // We wait for the "Editei o prompt..." message or similar
  await page.waitForResponse(response => 
    response.url().includes('/api/agent/prompt/edit') && response.status() === 200,
    { timeout: 60000 }
  );
  
  // Wait a bit for UI to settle
  await page.waitForTimeout(3000);

  // 6. Switch back to "Editar" tab
  await page.getByRole('button', { name: 'Editar' }).click();
  const newPrompt = await page.locator('textarea').first().inputValue();
  console.log('New Prompt Length:', newPrompt.length);

  // 7. Verify if uniqueToken is present
  if (newPrompt.includes(uniqueToken)) {
    console.log('✅ PASS: Prompt updated in UI');
  } else {
    console.log('❌ FAIL: Prompt NOT updated in UI (Stale State Bug)');
    console.log('Expected to find:', uniqueToken);
  }

  // 8. Refresh page to verify backend persistence
  await page.reload();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Editar' }).click();
  const reloadedPrompt = await page.locator('textarea').first().inputValue();
  
  if (reloadedPrompt.includes(uniqueToken)) {
    console.log('✅ PASS: Prompt was saved to Backend (visible after reload)');
  } else {
    console.log('❌ FAIL: Prompt was NOT saved to Backend');
  }

});
