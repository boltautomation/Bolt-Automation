param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$resourceRoot = $appRoot
if (Test-Path -LiteralPath (Join-Path $appRoot 'resources\app\server.cjs')) { $resourceRoot = Join-Path $appRoot 'resources' }

function Test-BoltServer([string]$Origin) {
    try { $health = Invoke-RestMethod -Uri "$Origin/health" -TimeoutSec 1; return $health.app -in @('chatterhigh-local-app', 'bolt-local-app') }
    catch { return $false }
}

try {
    $serverPath = Join-Path $resourceRoot 'app\server.cjs'
    if (-not (Test-Path -LiteralPath $serverPath)) { throw 'Extract the entire Bolt ZIP first, then open Start Bolt.cmd inside the extracted Bolt folder.' }
    if (-not $CheckOnly) {
        $desktopCandidates = @((Join-Path $appRoot 'Desktop\Bolt-win32-x64\Bolt.exe'),(Join-Path $appRoot 'releases\desktop-current\Bolt-win32-x64\Bolt.exe'),(Join-Path $appRoot 'releases\desktop\Bolt-win32-x64\Bolt.exe'))
        foreach ($desktopPath in $desktopCandidates) {
            if (Test-Path -LiteralPath $desktopPath) {
                $env:BOLT_LEGACY_DATA_DIR = Join-Path $resourceRoot '.app-runtime'
                if ($resourceRoot -eq $appRoot) { $env:BOLT_DATA_DIR = Join-Path $appRoot '.app-runtime'; $env:BOLT_DESKTOP_PROFILE = Join-Path $appRoot '.app-runtime\desktop' }
                Start-Process -FilePath $desktopPath -WorkingDirectory $appRoot -WindowStyle Normal
                exit 0
            }
        }
    }
    $nodeCandidates = @((Join-Path $resourceRoot 'runtime\node.exe'), (Join-Path $PSScriptRoot 'runtime\node.exe'))
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCommand) { $nodeCandidates += $nodeCommand.Source }
    $nodePath = $null
    foreach ($candidate in $nodeCandidates) { if (Test-Path -LiteralPath $candidate -PathType Leaf) { $nodePath = $candidate; break } }
    if (-not $nodePath) { throw 'The bundled runtime is missing. Extract a fresh copy of Bolt, or install Node.js 22.13+ (22 LTS) or 24+.' }
    $nodeVersion = [version](& $nodePath -p 'process.versions.node')
    if ($LASTEXITCODE -ne 0 -or -not (($nodeVersion.Major -eq 22 -and $nodeVersion.Minor -ge 13) -or $nodeVersion.Major -ge 24)) { throw 'The Node runtime could not start or is too old. Extract a fresh copy of the Bolt package.' }
    & $nodePath -e "try{require.resolve('pdfjs-dist/legacy/build/pdf.mjs',{paths:[process.argv[1]]})}catch{process.exitCode=1}" $resourceRoot
    if ($LASTEXITCODE -ne 0) { throw 'The PDF tools are missing. Extract the whole Bolt package; do not copy only the launcher.' }
    $browserModule = Join-Path $resourceRoot 'app\browser.cjs'
    $browserPath = & $nodePath -e "try{process.stdout.write(require(process.argv[1]).findBrowser())}catch{process.exitCode=1}" $browserModule
    if ($LASTEXITCODE -ne 0) { throw 'Install Google Chrome or Brave, then open Bolt again. Chrome download: https://www.google.com/chrome/' }
    if ($CheckOnly) {
        [pscustomobject]@{ ok=$true; nodeVersion="$nodeVersion"; bundledRuntime=$nodePath -in $nodeCandidates[0..1]; resourceRoot=$resourceRoot; browserFound=[bool]$browserPath } | ConvertTo-Json -Compress
        exit 0
    }
    $port = 43117
    if ($env:CHATTERHIGH_PORT) { $port = [int]$env:CHATTERHIGH_PORT }
    if ($port -lt 1 -or $port -gt 65535) { throw 'The configured app port is invalid.' }
    $origin = "http://127.0.0.1:$port"
    $arguments = @(('"' + $serverPath + '"'), '--open')
    if (Test-BoltServer $origin) {
        Start-Process -FilePath $nodePath -ArgumentList $arguments -WorkingDirectory $resourceRoot -WindowStyle Hidden
        exit 0
    }
    $dataRoot = Join-Path $resourceRoot '.app-runtime'
    New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
    # Start an already-installed local AI service; missing AI is handled in the app.
    try { $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 1 }
    catch {
        $ollamaCommand = Get-Command ollama -ErrorAction SilentlyContinue
        $ollamaPath = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
        if ($ollamaCommand) { $ollamaPath = $ollamaCommand.Source }
        if (Test-Path -LiteralPath $ollamaPath) {
            try { Start-Process -FilePath $ollamaPath -ArgumentList 'serve' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataRoot 'ollama.stdout.log') -RedirectStandardError (Join-Path $dataRoot 'ollama.stderr.log') }
            catch { Write-Verbose 'Ollama could not start automatically. The app will show setup guidance.' }
        }
    }
    $process = Start-Process -FilePath $nodePath -ArgumentList $arguments -WorkingDirectory $resourceRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataRoot 'startup.stdout.log') -RedirectStandardError (Join-Path $dataRoot 'startup.stderr.log')
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        if (Test-BoltServer $origin) { exit 0 }
        if ($process.HasExited) { break }
        Start-Sleep -Milliseconds 200
    }
    throw "Bolt could not finish starting. Check the startup logs in $dataRoot, or close another app using port $port and try again."
} catch {
    if ($CheckOnly) { Write-Error $_.Exception.Message; exit 1 }
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($_.Exception.Message, 'Bolt - setup help') | Out-Null
    exit 1
}
