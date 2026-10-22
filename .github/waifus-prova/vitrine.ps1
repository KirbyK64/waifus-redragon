# Deixa a área de trabalho com cara de PC de quem usa: papel de parede das duas e as janelas do runner minimizadas.
# As fotos da tela inteira mostram o app como a pessoa veria, e não por cima do terminal de log do GitHub.
param([Parameter(Mandatory = $true)][string]$Papel)
$arq = Join-Path $env:TEMP 'waifus-papel.jpg'
Invoke-WebRequest -Uri $Papel -OutFile $arq
Add-Type @'
using System.Runtime.InteropServices;
public static class PapelDeParede {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int SystemParametersInfo(int acao, int param, string arquivo, int flags);
}
'@
# 20 = SPI_SETDESKWALLPAPER; 3 = grava no perfil e avisa as janelas
[void][PapelDeParede]::SystemParametersInfo(20, 0, $arq, 3)
(New-Object -ComObject Shell.Application).MinimizeAll()
