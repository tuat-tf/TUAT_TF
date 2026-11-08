# Shows the current backup decryption key ON THIS SCREEN ONLY, so the owner can copy it
# to a password manager or paper, then checks the copy by re-entering it.
# Nothing is written to disk or sent anywhere. Run it yourself; do not paste the key into chat.
# Usage (Windows PowerShell on the production PC):
#   powershell -NoProfile -ExecutionPolicy Bypass -File D:\TUAT_TF\ops\handoff\show-backup-key.ps1

$ErrorActionPreference = 'Stop'
$OutputEncoding = New-Object System.Text.UTF8Encoding $false

$code = @'
import json, hashlib
runtime = json.load(open('/etc/tuat-local/runtime.json'))
backup = json.load(open(runtime['backupConfigPath']))
key = open(backup['runtimeKey'], 'rb').read()
assert len(key) == 32, 'unexpected key length'
copy = backup.get('recoveryKeyCopy')
if copy:
    assert open(copy, 'rb').read() == key, 'recovery copy differs'
print(key.hex())
print(hashlib.sha256(key).hexdigest())
'@

function Get-Fingerprint([string]$hex) {
    $clean = ($hex -replace '[^0-9a-fA-F]', '').ToLower()
    if ($clean.Length -ne 64) { return $null }
    $bytes = New-Object byte[] 32
    for ($i = 0; $i -lt 32; $i++) { $bytes[$i] = [Convert]::ToByte($clean.Substring($i * 2, 2), 16) }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
}

Write-Host ''
Write-Host 'Backup decryption key will be shown. Make sure nobody else can see the screen.' -ForegroundColor Yellow
Read-Host 'Press Enter to show it' | Out-Null

$out = $code | wsl.exe -d Ubuntu -u root -- nsenter -t 1 -m -- python3 -I -
if ($LASTEXITCODE -ne 0 -or $out.Count -ne 2) { throw 'Could not read the key. Nothing was shown.' }
$hex = $out[0].Trim(); $fingerprint = $out[1].Trim()
$out = $null

$groups = for ($i = 0; $i -lt 64; $i += 8) { $hex.Substring($i, 8) }
Write-Host ''
Write-Host '  Backup decryption key (64 hex characters, shown in 8 groups):'
Write-Host ''
Write-Host ('    ' + ($groups[0..3] -join ' ')) -ForegroundColor Cyan
Write-Host ('    ' + ($groups[4..7] -join ' ')) -ForegroundColor Cyan
Write-Host ''
Write-Host '  Save it WITHOUT the spaces in a password manager (or write it on paper).'
Write-Host '  Label it: TUAT TF backup decryption key (PC_BACKUP_ENCRYPTION_KEY)'
Write-Host ''
Read-Host 'When saved, press Enter (the screen will be cleared)' | Out-Null
$hex = $null; $groups = $null
Clear-Host

for ($try = 1; $try -le 3; $try++) {
    $typed = Read-Host 'Paste or type the key from your saved copy to check it'
    $ok = (Get-Fingerprint $typed) -eq $fingerprint
    $typed = $null
    if ($ok) {
        Write-Host 'OK: your saved copy matches the current backup key.' -ForegroundColor Green
        Clear-Host
        Write-Host 'OK: your saved copy matches the current backup key.' -ForegroundColor Green
        exit 0
    }
    Write-Host 'Does not match. Check for typos (0/o, 1/l, missing characters).' -ForegroundColor Red
}
Write-Host 'Not confirmed. Run the script again.' -ForegroundColor Red
exit 1
