#!/usr/bin/env python3
"""
Script para converter imagens PNG/JPG para WebP otimizado
Reduz tamanho em ~90% mantendo qualidade visual
"""

from PIL import Image
import os
from pathlib import Path

# Configurações
IMG_DIR = Path("findeas theme/assets/img")
QUALITY_DESKTOP = 80
QUALITY_MOBILE = 75
SIZE_DESKTOP = (382, 382)
SIZE_MOBILE = (382, 382)  # Mesmo tamanho para evitar baixa resolução

# Imagens principais para converter
IMAGES_TO_CONVERT = [
    {
        "source": "image1.png",
        "outputs": [
            {"name": "image1.webp", "size": SIZE_DESKTOP, "quality": QUALITY_DESKTOP},
            {"name": "image1-mobile.webp", "size": SIZE_MOBILE, "quality": QUALITY_MOBILE}
        ]
    },
    {
        "source": "222.png",
        "outputs": [
            {"name": "222.webp", "size": SIZE_DESKTOP, "quality": QUALITY_DESKTOP},
            {"name": "222-mobile.webp", "size": SIZE_MOBILE, "quality": QUALITY_MOBILE}
        ]
    },
    {
        "source": "111.jpg",
        "outputs": [
            {"name": "111.webp", "size": (382, 593), "quality": QUALITY_DESKTOP},
            {"name": "111-mobile.webp", "size": (382, 593), "quality": QUALITY_MOBILE}  # Mesmo tamanho
        ]
    }
]

# Logos para converter (600x600 -> 96x96 para retina)
LOGOS = [
    "logo-atica.png",
    "logo-earth.png",
    "logo-tvit.png",
    "logo-9.png"
]
LOGO_SIZE = (96, 96)  # 2x para retina displays (exibido como 48x48)

# Logos grandes para converter (2x resolution para retina)
BRAND_LOGOS = [
    {"source": "logo-treva.png", "size": (202, 56)},  # 2x para retina displays
    {"source": "logo-muzica.png", "size": (224, 56)},  # 2x para retina displays
    {"source": "logo-goldline.png", "size": (240, 56)}  # 2x para retina displays
]

def format_size(bytes):
    """Formata tamanho em bytes para KB/MB"""
    kb = bytes / 1024
    if kb < 1024:
        return f"{kb:.1f} KB"
    return f"{kb/1024:.1f} MB"

def convert_image(source_path, output_path, target_size, quality):
    """Converte e redimensiona imagem para WebP"""
    try:
        # Abrir imagem original
        img = Image.open(source_path)
        
        # Converter RGBA para RGB se necessário
        if img.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
            img = background
        
        # Redimensionar mantendo aspect ratio
        img.thumbnail(target_size, Image.Resampling.LANCZOS)
        
        # Salvar como WebP
        img.save(output_path, 'WEBP', quality=quality, method=6)
        
        # Calcular economia
        original_size = os.path.getsize(source_path)
        new_size = os.path.getsize(output_path)
        savings = ((original_size - new_size) / original_size) * 100
        
        print(f"✅ {output_path.name}")
        print(f"   {format_size(original_size)} → {format_size(new_size)} (-{savings:.1f}%)")
        
        return True
    except Exception as e:
        print(f"❌ Erro ao converter {source_path.name}: {e}")
        return False

def main():
    print("🎨 Conversor de Imagens para WebP - AgenteZap")
    print("=" * 60)
    
    if not IMG_DIR.exists():
        print(f"❌ Diretório não encontrado: {IMG_DIR}")
        return
    
    total_original = 0
    total_new = 0
    converted = 0
    
    # Converter imagens principais
    print("\n📸 Convertendo imagens principais...")
    for img_config in IMAGES_TO_CONVERT:
        source_path = IMG_DIR / img_config["source"]
        
        if not source_path.exists():
            print(f"⚠️  Arquivo não encontrado: {source_path.name}")
            continue
        
        print(f"\n🔄 Processando {img_config['source']}...")
        original_size = os.path.getsize(source_path)
        
        for output in img_config["outputs"]:
            output_path = IMG_DIR / output["name"]
            if convert_image(source_path, output_path, output["size"], output["quality"]):
                converted += 1
                total_original += original_size
                total_new += os.path.getsize(output_path)
    
    # Converter logos pequenos (2x resolution para retina)
    print("\n🏢 Convertando logos de integração (96x96 para retina)...")
    for logo in LOGOS:
        source_path = IMG_DIR / logo
        
        if not source_path.exists():
            print(f"⚠️  Logo não encontrado: {logo}")
            continue
        
        output_path = IMG_DIR / logo.replace('.png', '.webp')
        original_size = os.path.getsize(source_path)
        
        if convert_image(source_path, output_path, LOGO_SIZE, QUALITY_DESKTOP):
            converted += 1
            total_original += original_size
            total_new += os.path.getsize(output_path)
    
    # Converter logos de marca
    print("\n🎯 Convertendo logos de marca...")
    for logo_config in BRAND_LOGOS:
        source_path = IMG_DIR / logo_config["source"]
        
        if not source_path.exists():
            print(f"⚠️  Logo não encontrado: {logo_config['source']}")
            continue
        
        output_path = IMG_DIR / logo_config["source"].replace('.png', '.webp')
        original_size = os.path.getsize(source_path)
        
        if convert_image(source_path, output_path, logo_config["size"], QUALITY_DESKTOP):
            converted += 1
            total_original += original_size
            total_new += os.path.getsize(output_path)
    
    # Resumo final
    print("\n" + "=" * 60)
    print("📊 RESUMO DA CONVERSÃO")
    print("=" * 60)
    print(f"✅ Imagens convertidas: {converted}")
    print(f"📦 Tamanho original: {format_size(total_original)}")
    print(f"📦 Tamanho novo: {format_size(total_new)}")
    
    if total_original > 0:
        total_savings = ((total_original - total_new) / total_original) * 100
        print(f"💾 Economia total: {format_size(total_original - total_new)} (-{total_savings:.1f}%)")
    
    print("\n🚀 Próximos passos:")
    print("   1. Verifique as imagens em: findeas theme/assets/img/")
    print("   2. Execute: git add \"findeas theme/assets/img/*.webp\"")
    print("   3. Execute: git commit -m \"feat: adicionar imagens WebP otimizadas\"")
    print("   4. Execute: git push vvvv main")
    print("   5. Teste no PageSpeed Insights!")

if __name__ == "__main__":
    main()
