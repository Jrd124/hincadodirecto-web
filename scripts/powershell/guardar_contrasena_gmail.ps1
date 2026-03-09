# Guarda la contrasena de aplicacion de Gmail de forma segura (solo tu usuario de Windows puede leerla).
# Ejecuta este script UNA SOLA VEZ; despues Himalaya y los scripts no te pediran la contrasena.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security
$archivo = "$env:APPDATA\himalaya_gmail.dat"

Write-Host "Contrasena de aplicacion de Gmail - se guardara cifrada solo para tu usuario." -ForegroundColor Cyan
$sec = Read-Host "Pega tu contrasena de aplicacion (16 caracteres)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
$plain = ($plain -replace "\s", "")

$entropy = [byte[]]@(0x48,0x69,0x6d,0x61,0x6c,0x61,0x79,0x61)  # "Himalaya"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($plain)
$encrypted = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[System.IO.File]::WriteAllBytes($archivo, $encrypted)

Write-Host "Listo. La contrasena esta guardada. No tendras que volver a introducirla." -ForegroundColor Green
Write-Host "Puedes borrarla cuando quieras eliminando: $archivo" -ForegroundColor Gray
