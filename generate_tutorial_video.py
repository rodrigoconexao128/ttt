import asyncio
from playwright.async_api import async_playwright
from gtts import gTTS
import os

# PREREQUISITES:
# pip install playwright gTTS
# playwright install chromium

# Configuration
EMAIL = "rodrigo7777@teste.com"
PASSWORD = "Ibira2019!"
BASE_URL = "https://agentezap.online"
OUTPUT_DIR = "tutorial_assets"

SCRIPT = [
    {
        "text": "Bem-vindo ao AgenteZap. Vamos fazer um tour pelo sistema.",
        "action": "login"
    },
    {
        "text": "Este é o seu Dashboard. Aqui você tem uma visão geral do desempenho do seu agente.",
        "selector": "[data-testid='button-nav-stats']"
    },
    {
        "text": "Na aba Conversas, você pode gerenciar todos os atendimentos em tempo real.",
        "selector": "[data-testid='button-nav-conversations']",
        "click": True
    },
    {
        "text": "Em Conexão, você conecta seu WhatsApp lendo o QR Code.",
        "selector": "[data-testid='button-nav-connection']",
        "click": True
    },
    {
        "text": "Aqui em Meu Agente IA, você configura a personalidade e o conhecimento do seu robô.",
        "selector": "[data-testid='button-nav-ai']",
        "click": True
    },
    {
        "text": "Use a Biblioteca de Mídias para enviar áudios e imagens.",
        "selector": "[data-testid='button-nav-media-library']",
        "click": True
    },
    {
        "text": "O Kanban ajuda a organizar seus leads e vendas visualmente.",
        "selector": "[data-testid='button-nav-kanban']",
        "click": True
    },
    {
        "text": "E nas Configurações, você ajusta os detalhes da sua conta.",
        "selector": "[data-testid='button-settings']",
        "click": True
    }
]

async def run():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    print("Generating audio files...")
    try:
        for i, step in enumerate(SCRIPT):
            tts = gTTS(step["text"], lang='pt')
            tts.save(f"{OUTPUT_DIR}/step_{i}.mp3")
    except Exception as e:
        print(f"Error generating audio (is gTTS installed?): {e}")
        print("Skipping audio generation.")

    print("Starting browser automation...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False) # Headless=False to see it
        context = await browser.new_context(record_video_dir=OUTPUT_DIR, record_video_size={"width": 1280, "height": 720})
        page = await context.new_page()

        # Login
        print("Logging in...")
        await page.goto(f"{BASE_URL}/login")
        await page.fill("input[type='email']", EMAIL)
        await page.fill("input[type='password']", PASSWORD)
        await page.click("button[type='submit']")
        
        # Wait for dashboard
        try:
            await page.wait_for_url("**/dashboard", timeout=15000)
        except:
            print("Login might have failed or taken too long. Continuing anyway...")

        await asyncio.sleep(2)

        for i, step in enumerate(SCRIPT):
            print(f"Step {i}: {step['text']}")
            if "selector" in step:
                # Highlight element
                try:
                    locator = page.locator(step["selector"]).first
                    # Scroll into view if needed
                    await locator.scroll_into_view_if_needed()
                    
                    # Highlight effect (border)
                    await locator.evaluate("el => el.style.border = '4px solid red'")
                    await asyncio.sleep(1)
                    
                    if step.get("click"):
                        await locator.click()
                        await asyncio.sleep(3) # Wait for navigation/render
                    
                    # Remove highlight
                    await locator.evaluate("el => el.style.border = ''")
                    
                except Exception as e:
                    print(f"Could not interact with {step['selector']}: {e}")
            
            await asyncio.sleep(2) 

        await context.close()
        await browser.close()
        print(f"Video saved to {OUTPUT_DIR}")

if __name__ == "__main__":
    asyncio.run(run())
