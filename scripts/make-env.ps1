# Creates .env from .env.example, replacing every "change-me-*" placeholder with a
# fresh random value. Used by start.bat and dev.bat. Never overwrites an existing .env.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$example = Join-Path $root '.env.example'
$target = Join-Path $root '.env'

if (Test-Path $target) {
  Write-Host '.env already exists, leaving it alone.'
  exit 0
}
if (-not (Test-Path $example)) {
  Write-Error '.env.example is missing.'
  exit 1
}

function New-Secret([int]$bytes) {
  $buffer = New-Object byte[] $bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
  return (-join ($buffer | ForEach-Object { $_.ToString('x2') }))
}

$text = [System.IO.File]::ReadAllText($example)
$text = $text.Replace('change-me-postgres', (New-Secret 16))
$text = $text.Replace('change-me-session', (New-Secret 32))
$text = $text.Replace('change-me-admin', (New-Secret 8))

# Write UTF-8 without a byte-order mark so the first key in the file is read correctly.
[System.IO.File]::WriteAllText($target, $text, (New-Object System.Text.UTF8Encoding($false)))
Write-Host 'Created .env with random passwords.'
