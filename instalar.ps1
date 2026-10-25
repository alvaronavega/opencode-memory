<#
.SYNOPSIS
  Instala (ou remove) o opencode-memory no OpenCode local.

.DESCRIPTION
  Copia o pacote do plugin para o diretório de plugins do OpenCode e garante o
  arquivo de configuração global. O script é idempotente: rodar de novo não
  sobrescreve nada, a menos que você use -Force.

.PARAMETER Force
  Sobrescreve uma instalação existente do plugin.

.PARAMETER Uninstall
  Remove o plugin instalado (não apaga a memória dos projetos).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\instalar.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Uninstall
#>
[CmdletBinding()]
param(
  [switch]$Force,
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Get-OpencodeConfigDir {
  if ($env:XDG_CONFIG_HOME -and $env:XDG_CONFIG_HOME.Trim() -ne "") {
    return (Join-Path $env:XDG_CONFIG_HOME "opencode")
  }
  return (Join-Path (Join-Path $HOME ".config") "opencode")
}

function Write-Info($message) {
  Write-Host $message -ForegroundColor Cyan
}

function Write-Ok($message) {
  Write-Host $message -ForegroundColor Green
}

$configDir = Get-OpencodeConfigDir
$pluginsDir = Join-Path $configDir "plugins"
$kitDir = Join-Path $pluginsDir "opencode-memory"
$globalConfig = Join-Path $configDir "memory.json"

if ($Uninstall) {
  if (Test-Path $kitDir) {
    Remove-Item -Recurse -Force $kitDir
    Write-Ok "Plugin removido de $kitDir"
  } else {
    Write-Info "Plugin não estava instalado em $kitDir"
  }
  Write-Info "A memória dos projetos (MEMORY.md) não foi tocada."
  Write-Info "O config global continua em $globalConfig"
  exit 0
}

Write-Info "Instalando opencode-memory..."
Write-Info "  origem:  $sourceDir"
Write-Info "  destino: $kitDir"

if ((Test-Path $kitDir) -and -not $Force) {
  Write-Info "Já existe uma instalação. Use -Force para sobrescrever."
} else {
  if (Test-Path $kitDir) { Remove-Item -Recurse -Force $kitDir }
  New-Item -ItemType Directory -Force -Path $kitDir | Out-Null

  foreach ($file in @("index.ts", "package.json", "README.md")) {
    $from = Join-Path $sourceDir $file
    if (Test-Path $from) {
      Copy-Item -Force $from (Join-Path $kitDir $file)
    }
  }

  $srcFrom = Join-Path $sourceDir "src"
  if (Test-Path $srcFrom) {
    $srcTo = Join-Path $kitDir "src"
    # Remove antes: Copy-Item -Recurse aninha a pasta quando o destino já existe.
    if (Test-Path $srcTo) { Remove-Item -Recurse -Force $srcTo }
    Copy-Item -Recurse -Force $srcFrom $srcTo
  }

  Write-Ok "Plugin copiado."
}

if (-not (Test-Path $globalConfig)) {
  New-Item -ItemType Directory -Force -Path $configDir | Out-Null
  $config = @"
{
  "version": 1,
  "auto": true,
  "enabled": true
}
"@
  # UTF-8 sem BOM: o Set-Content do PowerShell 5.1 gravaria com BOM e o JSON
  # deixaria de ser parseável.
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($globalConfig, $config, $utf8NoBom)
  Write-Ok "Config global criado: $globalConfig"
} else {
  Write-Info "Config global já existe (mantido): $globalConfig"
}

Write-Host ""
Write-Ok "Pronto."
Write-Host ""
Write-Host "Próximos passos:"
Write-Host "  1. Reinicie o OpenCode (ou rode /reload dentro dele)."
Write-Host "  2. Abra uma pasta de projeto: o MEMORY.md é criado automaticamente."
Write-Host "  3. Digite /mem help para ver os comandos."
Write-Host ""
Write-Host "Para desinstalar: powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Uninstall"
