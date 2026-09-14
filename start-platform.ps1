[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ollamaExe = Join-Path $appRoot "runtime\ollama\ollama.exe"
$modelRoot = Join-Path $appRoot "runtime\ollama-models"
$platformExe = Join-Path $appRoot "QizhiTrainingPlatform.exe"
$sourceServer = Join-Path $appRoot "backend\server.py"
$startedOllama = $null

$env:QIZHI_OPEN_BROWSER = "1"
$env:LEVEL_AGENT_CREWAI = "1"
$env:LEVEL_AGENT_MODEL = "ollama/qwen3:0.6b"
$env:LEVEL_AGENT_BASE_URL = "http://127.0.0.1:11434"
$env:OLLAMA_HOST = "127.0.0.1:11434"
$env:OLLAMA_MODELS = $modelRoot
$env:OLLAMA_NO_CLOUD = "1"

function Test-OllamaReady {
    try {
        Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 1 | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

try {
    Write-Host "Starting Qizhi Training Platform..." -ForegroundColor Cyan
    Write-Host "Keep this window open. The first-professional bootstrap code appears here."

    if (Test-Path -LiteralPath $ollamaExe) {
        New-Item -ItemType Directory -Force -Path $modelRoot | Out-Null
        if (-not (Test-OllamaReady)) {
            $startedOllama = Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden -PassThru
            for ($attempt = 0; $attempt -lt 60; $attempt++) {
                Start-Sleep -Milliseconds 500
                if (Test-OllamaReady) { break }
                if ($startedOllama.HasExited) { break }
            }
        }
        if (Test-OllamaReady) {
            Write-Host "Local AI is enabled (qwen3:0.6b)." -ForegroundColor Green
        }
        else {
            Write-Warning "Local AI could not start. The platform will use its safe rule-based fallback."
        }
    }
    else {
        Write-Warning "Bundled Ollama was not found. The platform will use its safe rule-based fallback."
    }

    if (Test-Path -LiteralPath $platformExe) {
        & $platformExe
        $exitCode = $LASTEXITCODE
    }
    elseif (Test-Path -LiteralPath $sourceServer) {
        $python = Get-Command python -ErrorAction SilentlyContinue
        if (-not $python) {
            throw "Neither QizhiTrainingPlatform.exe nor a Python runtime for the source server was found."
        }
        & $python.Source $sourceServer
        $exitCode = $LASTEXITCODE
    }
    else {
        throw "The delivery package is incomplete: the application was not found."
    }
}
catch {
    Write-Host "Startup failed: $($_.Exception.Message)" -ForegroundColor Red
    $exitCode = 1
}
finally {
    if ($startedOllama -and -not $startedOllama.HasExited) {
        Stop-Process -Id $startedOllama.Id -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "The platform stopped with exit code: $exitCode"
Read-Host "Press Enter to close this window" | Out-Null
exit $exitCode
