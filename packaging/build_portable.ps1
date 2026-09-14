[CmdletBinding()]
param(
    [switch]$FolderOnly,
    [switch]$ReuseDownloads
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$buildRoot = Join-Path $projectRoot ".portable-build"
$releaseRoot = Join-Path $projectRoot "release"
$packageName = "QizhiTrainingPlatform-Portable"
$packageRoot = Join-Path $releaseRoot $packageName
$archivePath = Join-Path $releaseRoot ($packageName + ".zip")
$uvRoot = Join-Path $buildRoot "uv"
$uvExe = Join-Path $uvRoot "uv.exe"
$venvRoot = Join-Path $buildRoot "venv"
$pythonExe = Join-Path $venvRoot "Scripts\python.exe"
$ollamaArchive = Join-Path $buildRoot "downloads\ollama-windows-amd64.zip"
$ollamaRoot = Join-Path $buildRoot "ollama"
$modelRoot = Join-Path $buildRoot "ollama-models"
$pyinstallerDist = Join-Path $buildRoot "pyinstaller-dist"
$pyinstallerWork = Join-Path $buildRoot "pyinstaller-work"

function Assert-ProjectChild {
    param([Parameter(Mandatory = $true)][string]$Path)
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $prefix = $projectRoot.TrimEnd("\") + "\"
    if (-not $fullPath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to operate outside the project: $fullPath"
    }
    return $fullPath
}

function Reset-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)
    $safePath = Assert-ProjectChild $Path
    if (Test-Path -LiteralPath $safePath) {
        Remove-Item -LiteralPath $safePath -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $safePath | Out-Null
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
    )
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FilePath failed with exit code: $LASTEXITCODE"
    }
}

function Copy-PublicTree {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )
    $sourceRoot = [System.IO.Path]::GetFullPath($Source).TrimEnd("\")
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Get-ChildItem -LiteralPath $sourceRoot -File -Recurse | Where-Object {
        $_.Name -notlike "*.orig"
    } | ForEach-Object {
        $relative = $_.FullName.Substring($sourceRoot.Length).TrimStart("\")
        $destinationFile = Join-Path $Destination $relative
        New-Item -ItemType Directory -Force -Path (Split-Path $destinationFile) | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $destinationFile -Force
    }
}

if ($env:OS -ne "Windows_NT" -or -not [Environment]::Is64BitOperatingSystem) {
    throw "This packager requires 64-bit Windows 10/11."
}

Write-Host "[1/6] Preparing an isolated build environment" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $buildRoot, $releaseRoot, (Split-Path $ollamaArchive) | Out-Null

if (-not (Test-Path -LiteralPath $uvExe)) {
    $uvArchive = Join-Path $buildRoot "downloads\uv-windows.zip"
    Invoke-WebRequest -Uri "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip" -OutFile $uvArchive
    Reset-Directory $uvRoot
    Expand-Archive -LiteralPath $uvArchive -DestinationPath $uvRoot -Force
    $foundUv = Get-ChildItem -LiteralPath $uvRoot -Filter "uv.exe" -File -Recurse | Select-Object -First 1
    if (-not $foundUv) { throw "uv.exe was not found in the downloaded archive." }
    if ($foundUv.FullName -ne $uvExe) { Copy-Item -LiteralPath $foundUv.FullName -Destination $uvExe -Force }
}

$env:UV_PYTHON_INSTALL_DIR = Join-Path $buildRoot "python"
$env:UV_CACHE_DIR = Join-Path $buildRoot "uv-cache"
Invoke-Checked $uvExe "python" "install" "3.13"
Invoke-Checked $uvExe "venv" $venvRoot "--python" "3.13" "--clear"
Invoke-Checked $uvExe "pip" "install" "--python" $pythonExe "-r" (Join-Path $projectRoot "packaging\requirements-portable.txt")

$sitePackages = Join-Path $venvRoot "Lib\site-packages"
if (Test-Path -LiteralPath (Join-Path $sitePackages "litellm")) {
    throw "Security check failed: unwanted LiteLLM was found in the build environment."
}

Write-Host "[2/6] Building the application" -ForegroundColor Cyan
Reset-Directory $pyinstallerDist
Reset-Directory $pyinstallerWork
Push-Location $projectRoot
try {
    Invoke-Checked $pythonExe "-m" "PyInstaller" "--noconfirm" "--clean" "--distpath" $pyinstallerDist "--workpath" $pyinstallerWork (Join-Path $projectRoot "packaging\qizhi_portable.spec")
}
finally {
    Pop-Location
}
$frozenRoot = Join-Path $pyinstallerDist "QizhiTrainingPlatform"
if (-not (Test-Path -LiteralPath (Join-Path $frozenRoot "QizhiTrainingPlatform.exe"))) {
    throw "PyInstaller did not produce the application executable."
}
Write-Host "[3/6] Preparing local Ollama and qwen3:0.6b" -ForegroundColor Cyan
if (-not $ReuseDownloads -or -not (Test-Path -LiteralPath $ollamaArchive)) {
    Invoke-WebRequest -Uri "https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip" -OutFile $ollamaArchive
}
Reset-Directory $ollamaRoot
Expand-Archive -LiteralPath $ollamaArchive -DestinationPath $ollamaRoot -Force
$ollamaExe = Join-Path $ollamaRoot "ollama.exe"
if (-not (Test-Path -LiteralPath $ollamaExe)) {
    throw "ollama.exe was not found in the downloaded archive."
}

New-Item -ItemType Directory -Force -Path $modelRoot | Out-Null
$previousOllamaHost = $env:OLLAMA_HOST
$previousOllamaModels = $env:OLLAMA_MODELS
$ollamaProcess = $null
try {
    $env:OLLAMA_HOST = "127.0.0.1:11439"
    $env:OLLAMA_MODELS = $modelRoot
    $ollamaProcess = Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden -PassThru
    $ollamaReady = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Milliseconds 500
        try {
            Invoke-RestMethod -Uri "http://127.0.0.1:11439/api/tags" -TimeoutSec 1 | Out-Null
            $ollamaReady = $true
            break
        }
        catch {
            if ($ollamaProcess.HasExited) { break }
        }
    }
    if (-not $ollamaReady) { throw "The temporary Ollama service could not start." }
    Invoke-Checked $ollamaExe "pull" "qwen3:0.6b"
}
finally {
    if ($ollamaProcess -and -not $ollamaProcess.HasExited) {
        Stop-Process -Id $ollamaProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($null -eq $previousOllamaHost) { Remove-Item Env:OLLAMA_HOST -ErrorAction SilentlyContinue }
    else { $env:OLLAMA_HOST = $previousOllamaHost }
    if ($null -eq $previousOllamaModels) { Remove-Item Env:OLLAMA_MODELS -ErrorAction SilentlyContinue }
    else { $env:OLLAMA_MODELS = $previousOllamaModels }
}

Write-Host "[4/6] Assembling a clean delivery directory" -ForegroundColor Cyan
Reset-Directory $packageRoot
Copy-Item -Path (Join-Path $frozenRoot "*") -Destination $packageRoot -Recurse -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "index.html") -Destination $packageRoot
Copy-PublicTree (Join-Path $projectRoot "css") (Join-Path $packageRoot "css")
Copy-PublicTree (Join-Path $projectRoot "js") (Join-Path $packageRoot "js")
New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot "backend"), (Join-Path $packageRoot "runtime") | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot "backend\schema.sql") -Destination (Join-Path $packageRoot "backend\schema.sql")
Copy-Item -LiteralPath $ollamaRoot -Destination (Join-Path $packageRoot "runtime\ollama") -Recurse
Copy-Item -LiteralPath $modelRoot -Destination (Join-Path $packageRoot "runtime\ollama-models") -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "start-platform.bat") -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "start-platform.ps1") -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "PORTABLE_README.md") -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "THIRD_PARTY_NOTICES.md") -Destination $packageRoot

$buildInfo = @(
    "Qizhi Training Platform - Windows Portable",
    "Built at: $([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss zzz'))",
    "AI: enabled by default; local Ollama + qwen3:0.6b",
    "Data: a new database is created under backend on first launch"
)
Set-Content -LiteralPath (Join-Path $packageRoot "BUILD_INFO.txt") -Value $buildInfo -Encoding utf8

Write-Host "[5/6] Checking privacy exclusions and generating checksums" -ForegroundColor Cyan
$forbidden = Get-ChildItem -LiteralPath $packageRoot -Recurse -Force | Where-Object {
    $_.Name -in @(".document_key", ".git") -or
    $_.Name -like "*.db" -or $_.Name -like "*.db-wal" -or $_.Name -like "*.db-shm" -or
    $_.Name -like "*.orig" -or
    $_.FullName -match "[\\/](private_documents|backups|litellm)([\\/]|$)"
}
if ($forbidden) {
    $paths = ($forbidden | ForEach-Object FullName) -join [Environment]::NewLine
    throw "Forbidden files were found in the delivery package: $([Environment]::NewLine)$paths"
}

$checksumPath = Join-Path $packageRoot "SHA256SUMS.txt"
$checksums = Get-ChildItem -LiteralPath $packageRoot -File -Recurse |
    Where-Object FullName -ne $checksumPath |
    Sort-Object FullName |
    ForEach-Object {
        $relative = $_.FullName.Substring($packageRoot.Length + 1).Replace("\", "/")
        "$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower())  $relative"
    }
Set-Content -LiteralPath $checksumPath -Value $checksums -Encoding ascii

Write-Host "[6/6] Finalizing delivery" -ForegroundColor Cyan
if (-not $FolderOnly) {
    $safeArchive = Assert-ProjectChild $archivePath
    if (Test-Path -LiteralPath $safeArchive) { Remove-Item -LiteralPath $safeArchive -Force }
    $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
    if (-not $tar) { throw "tar.exe was not found; use -FolderOnly to produce only a directory." }
    Invoke-Checked $tar.Source "-a" "-c" "-f" $archivePath "-C" $releaseRoot $packageName
    Write-Host "Portable archive: $archivePath" -ForegroundColor Green
}
Write-Host "Portable folder: $packageRoot" -ForegroundColor Green
Write-Host "Current databases, accounts, records, keys, backups, and Git history were excluded." -ForegroundColor Green
