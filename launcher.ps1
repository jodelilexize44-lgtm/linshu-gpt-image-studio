param(
  [switch]$NoOpen,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Url = "http://127.0.0.1:5173"
$Server = Join-Path $Root "server.mjs"
$Log = Join-Path $Root "server.log"
$ErrLog = Join-Path $Root "server.err.log"

function Test-AppReady {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200
  } catch {
    return $false
  }
}

Write-Host "Linshu GPT Image Studio Launcher"
Write-Host "Project: $Root"
Write-Host "URL: $Url"
Write-Host ""

if (-not (Test-Path $Server)) {
  Write-Host "ERROR: server.mjs was not found."
  if (-not $NoPause) { Read-Host "Press Enter to close" }
  exit 1
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "ERROR: Node.js was not found."
  Write-Host "Please install Node.js 20 or newer: https://nodejs.org/"
  if (-not $NoPause) { Read-Host "Press Enter to close" }
  exit 1
}

if (Test-AppReady) {
  Write-Host "Server is already running."
} else {
  Write-Host "Starting local server..."
  if (Test-Path $ErrLog) { Remove-Item -LiteralPath $ErrLog -Force }

  try {
    Start-Process `
      -FilePath "cmd.exe" `
      -ArgumentList @("/c", "node.exe server.mjs >> server.log 2>> server.err.log") `
      -WorkingDirectory $Root `
      -WindowStyle Minimized
  } catch {
    Write-Host "ERROR: failed to start Node.js."
    Write-Host $_.Exception.Message
    Read-Host "Press Enter to close"
    exit 1
  }
}

Write-Host "Waiting for server..."
for ($i = 1; $i -le 30; $i++) {
  if (Test-AppReady) {
    Write-Host "Server is ready."
    if (-not $NoOpen) {
      Write-Host "Opening browser..."
      Start-Process $Url
    }
    Write-Host ""
    Write-Host "If the browser did not open, visit this URL manually:"
    Write-Host $Url
    Write-Host ""
    Write-Host "You can close this launcher window."
    if (-not $NoPause) { Read-Host "Press Enter to close" }
    exit 0
  }
  Start-Sleep -Seconds 1
}

Write-Host ""
Write-Host "ERROR: server did not become ready within 30 seconds."
Write-Host "Log file: $Log"
Write-Host "Error log: $ErrLog"
Write-Host ""

if (Test-Path $ErrLog) {
  Write-Host "---- server.err.log ----"
  Get-Content -LiteralPath $ErrLog -Tail 60
}

if (Test-Path $Log) {
  Write-Host "---- server.log ----"
  Get-Content -LiteralPath $Log -Tail 60
}

if (-not $NoPause) { Read-Host "Press Enter to close" }
exit 1
