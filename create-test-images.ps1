Add-Type -AssemblyName System.Drawing

$colors = @(
    [System.Drawing.Color]::Blue,
    [System.Drawing.Color]::Red,
    [System.Drawing.Color]::Green
)
$labels = @("Test1", "Test2", "Test3")

for ($i = 0; $i -lt 3; $i++) {
    $bmp = New-Object System.Drawing.Bitmap(200, 200)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear($colors[$i])
    $font = New-Object System.Drawing.Font("Arial", 20)
    $g.DrawString($labels[$i], $font, [System.Drawing.Brushes]::White, 30, 80)
    $g.Dispose()
    $font.Dispose()
    $path = "C:\Users\Windows\Downloads\agentezap correto\vvvv\test-image$($i+1).png"
    $bmp.Save($path)
    $bmp.Dispose()
    Write-Host "Created test-image$($i+1).png"
}
