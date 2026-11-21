param([ValidateSet('protect','unprotect')][string]$Operation)
$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Security
    [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $vaultInput = [Console]::In.ReadToEnd()
    $entropyBytes = [Text.Encoding]::UTF8.GetBytes('ChatterHighAuto.Accounts.v1')
    if ($Operation -eq 'protect') {
        $plainBytes = [Text.Encoding]::UTF8.GetBytes($vaultInput)
        $protectedBytes = [Security.Cryptography.ProtectedData]::Protect($plainBytes,$entropyBytes,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        [Console]::Out.Write([Convert]::ToBase64String($protectedBytes))
        [Array]::Clear($plainBytes,0,$plainBytes.Length)
    } else {
        $protectedBytes = [Convert]::FromBase64String($vaultInput)
        $plainBytes = [Security.Cryptography.ProtectedData]::Unprotect($protectedBytes,$entropyBytes,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        [Console]::Out.Write([Text.Encoding]::UTF8.GetString($plainBytes))
        [Array]::Clear($plainBytes,0,$plainBytes.Length)
    }
    $vaultInput = ''
} catch {
    [Console]::Error.Write('Saved login could not be protected or opened for this Windows user.')
    exit 1
}
