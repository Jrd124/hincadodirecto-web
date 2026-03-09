# Devuelve la contrasena de Gmail para Himalaya.
# Primero usa la variable de entorno; si no existe, lee el archivo cifrado (tras ejecutar guardar_contrasena_gmail.ps1 una vez).

Add-Type -AssemblyName System.Security -ErrorAction SilentlyContinue
$pass = $env:HIMALAYA_GMAIL_APP_PASSWORD
if ($pass) {
    Write-Output ($pass -replace "\s", "")
    exit
}

$archivo = "$env:APPDATA\himalaya_gmail.dat"
if (-not (Test-Path $archivo)) {
    exit
}

try {
    $entropy = [byte[]]@(0x48,0x69,0x6d,0x61,0x6c,0x61,0x79,0x61)
    $encrypted = [System.IO.File]::ReadAllBytes($archivo)
    $bytes = [System.Security.Cryptography.ProtectedData]::Unprotect($encrypted, $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    $plain = [System.Text.Encoding]::UTF8.GetString($bytes)
    Write-Output $plain
} catch {
    exit
}
