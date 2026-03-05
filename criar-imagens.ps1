Add-Type -AssemblyName System.Drawing

# Cardápio (Restaurante)
$bmp = New-Object System.Drawing.Bitmap(300,200)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.FillRectangle([System.Drawing.Brushes]::Gold, 0, 0, 300, 200)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::DarkRed)
$font = New-Object System.Drawing.Font("Arial", 18, [System.Drawing.FontStyle]::Bold)
$g.DrawString("CARDAPIO", $font, $brush, 50, 80)
$bmp.Save("cardapio.png")
$bmp.Dispose()
$g.Dispose()
Write-Host "cardapio.png criada"

# Menu Especial
$bmp = New-Object System.Drawing.Bitmap(300,200)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.FillRectangle([System.Drawing.Brushes]::SaddleBrown, 0, 0, 300, 200)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Wheat)
$font = New-Object System.Drawing.Font("Arial", 16, [System.Drawing.FontStyle]::Bold)
$g.DrawString("MENU ESPECIAL", $font, $brush, 30, 80)
$bmp.Save("menu-especial.png")
$bmp.Dispose()
$g.Dispose()
Write-Host "menu-especial.png criada"

# Tabela de Preços
$bmp = New-Object System.Drawing.Bitmap(300,200)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.FillRectangle([System.Drawing.Brushes]::Pink, 0, 0, 300, 200)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::DarkMagenta)
$font = New-Object System.Drawing.Font("Arial", 18, [System.Drawing.FontStyle]::Bold)
$g.DrawString("TABELA", $font, $brush, 80, 80)
$bmp.Save("tabela-precos.png")
$bmp.Dispose()
$g.Dispose()
Write-Host "tabela-precos.png criada"

# Promoção
$bmp = New-Object System.Drawing.Bitmap(300,200)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.FillRectangle([System.Drawing.Brushes]::OrangeRed, 0, 0, 300, 200)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Yellow)
$font = New-Object System.Drawing.Font("Arial", 20, [System.Drawing.FontStyle]::Bold)
$g.DrawString("PROMOCAO", $font, $brush, 50, 80)
$bmp.Save("promocao.png")
$bmp.Dispose()
$g.Dispose()
Write-Host "promocao.png criada"
