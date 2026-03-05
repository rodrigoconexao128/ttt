#!/usr/bin/env python3
"""
Script Python para gerar áudio usando edge-tts
Usado pelo ttsService.ts quando edge-tts CLI não está no PATH
"""
import asyncio
import sys
import edge_tts

async def generate_audio(text: str, voice: str, rate: str, pitch: str, output_file: str):
    """Gera áudio usando edge-tts"""
    try:
        # Criar comunicator com as configurações
        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        
        # Salvar áudio
        await communicate.save(output_file)
        
        print(f"✅ Áudio salvo em: {output_file}")
        return 0
    except Exception as e:
        print(f"❌ Erro ao gerar áudio: {e}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    if len(sys.argv) < 6:
        print("Uso: python edge-tts-generator.py <text> <voice> <rate> <pitch> <output_file>", file=sys.stderr)
        sys.exit(1)
    
    text = sys.argv[1]
    voice = sys.argv[2]
    rate = sys.argv[3]
    pitch = sys.argv[4]
    output_file = sys.argv[5]
    
    exit_code = asyncio.run(generate_audio(text, voice, rate, pitch, output_file))
    sys.exit(exit_code)
