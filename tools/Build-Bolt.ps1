param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot 'releases' }
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
if (-not $outputRoot.StartsWith($projectRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Build output must stay inside this project.' }
$runtimeNode = Join-Path $PSScriptRoot 'runtime\node.exe'
$runtimeLicense = Join-Path $PSScriptRoot 'runtime\LICENSE.txt'
foreach ($required in @($runtimeNode, $runtimeLicense, (Join-Path $projectRoot 'node_modules\pdfjs-dist\package.json'))) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Missing build dependency: $required" }
}
$runtimeVersion = (& $runtimeNode -p 'process.versions.node').Trim()
$architecture = (& $runtimeNode -p 'process.arch').Trim()
if ($LASTEXITCODE -ne 0 -or $architecture -ne 'x64') { throw 'This build requires a working Windows x64 Node runtime.' }
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$stage = Join-Path $outputRoot ('.bolt-build-' + [guid]::NewGuid().ToString('N'))
$bundle = Join-Path $stage 'Bolt'
$resources = Join-Path $bundle 'resources'
$zipPath = Join-Path $outputRoot 'Bolt.zip'
$zipTemp = Join-Path $outputRoot ('.bolt-' + [guid]::NewGuid().ToString('N') + '.zip')
try {
    foreach ($dir in @('app\public\assets', 'extension', 'runtime', 'node_modules')) { New-Item -ItemType Directory -Path (Join-Path $resources $dir) -Force | Out-Null }
    foreach ($dir in @('tools', 'docs')) { New-Item -ItemType Directory -Path (Join-Path $bundle $dir) -Force | Out-Null }
    Copy-Item -LiteralPath (Join-Path $projectRoot 'Start Bolt.cmd') -Destination $bundle
    Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\GUIDE.md') -Destination (Join-Path $bundle 'docs')
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Start-Bolt.ps1') -Destination (Join-Path $bundle 'tools')
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $projectRoot 'app') -File) {
        if (($file.Extension -eq '.cjs' -and $file.Name -notlike 'upgrade-*') -or $file.Name -eq 'vault.ps1') { Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $resources 'app') }
    }
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $projectRoot 'app\public') -File) { Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $resources 'app\public') }
    Copy-Item -LiteralPath (Join-Path $projectRoot 'app\public\assets\bolt-transparent.png') -Destination (Join-Path $resources 'app\public\assets')
    foreach ($name in @('core.js', 'runner.js', 'content.js')) { Copy-Item -LiteralPath (Join-Path $projectRoot "extension\$name") -Destination (Join-Path $resources 'extension') }
    foreach ($name in @('package.json', 'package-lock.json')) { Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $resources }
    foreach ($name in @('pdfjs-dist', '@napi-rs')) {
        $dependency = Join-Path $projectRoot "node_modules\$name"
        if (Test-Path -LiteralPath $dependency) { Copy-Item -LiteralPath $dependency -Destination (Join-Path $resources 'node_modules') -Recurse }
    }
    Copy-Item -LiteralPath $runtimeNode -Destination (Join-Path $resources 'runtime\node.exe')
    Copy-Item -LiteralPath $runtimeLicense -Destination (Join-Path $resources 'runtime\LICENSE.txt')
    $packageReadme = @'
# Bolt - ready to run

<p align="center"><img src="resources/app/public/assets/bolt-transparent.png" alt="Bolt" width="144"></p>

1. Extract this entire folder. Do not launch from inside the ZIP.
2. Open **Start Bolt.cmd**. Keep **tools/** and **resources/** beside it.
3. Follow **Finish setup** in Bolt if Ollama or a model is missing. Chrome or Brave is also required; the launcher explains if neither is installed.

Node.js and PDF-reading dependencies are bundled for Windows x64. No npm commands or Node installation are required. Chrome/Brave and Ollama are installed separately. Use the app's Download model button for the one-time local AI model download (about 2.5 GB for the default model).

Bolt defaults to two source-based answer checks and guesses off. Unsupported or disagreeing answers stay available for review. These checks use more local AI time and can still be wrong; confidence is a model estimate, not a correctness score. See Settings for the source checks, explicit guessing option, and larger already-installed models.

**Bolt is intended for educational purposes only. It is not approved or endorsed for cheating, causing harm, or other misuse.** Use it only for learning and activities you have permission to automate. Follow school policies, site terms, and applicable laws. Do not cheat, fabricate participation, manipulate rewards, harass, impersonate, commit fraud, or access accounts without permission. Review AI answers and sources. Bolt is independent of connected platforms; this statement does not grant permission or prevent consequences for misuse.

**docs/GUIDE.md** contains the full guide and disclaimer. **resources/** contains the app and runtime. Private accounts, progress, and PDF data are created in **resources/.app-runtime/** on first use; no personal data is bundled. Keep your current folder and saved data when updating, and never share that private folder. Saved logins work only with the same Windows user.
'@
    Set-Content -LiteralPath (Join-Path $bundle 'README.md') -Value $packageReadme -Encoding UTF8
    $files = @(Get-ChildItem -LiteralPath $bundle -File -Recurse | Sort-Object FullName | ForEach-Object {
        [ordered]@{ path = $_.FullName.Substring($bundle.Length + 1).Replace('\','/'); bytes = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    })
    [ordered]@{ product='Bolt'; platform='win32'; architecture=$architecture; node=$runtimeVersion; builtAt=[DateTime]::UtcNow.ToString('o'); files=$files } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $bundle 'package-manifest.json') -Encoding UTF8
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory($stage, $zipTemp, [IO.Compression.CompressionLevel]::Optimal, $false)
    Move-Item -LiteralPath $zipTemp -Destination $zipPath -Force
    $checksum = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Set-Content -LiteralPath ($zipPath + '.sha256') -Value "$checksum  Bolt.zip" -Encoding ASCII
    Write-Output "Built $zipPath ($($files.Count) files, bundled Node $runtimeVersion)."
} finally {
    # Delete only the generated staging paths inside this build's output directory.
    foreach ($temporary in @($stage, $zipTemp)) {
        $resolved = [IO.Path]::GetFullPath($temporary)
        if ($resolved.StartsWith($outputRoot + '\', [StringComparison]::OrdinalIgnoreCase) -and ([IO.Path]::GetFileName($resolved) -like '.bolt-*')) {
            if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
        }
    }
}
