$ErrorActionPreference = "Stop"

if ($env:OS -ne "Windows_NT") {
    throw "This provisioning script is for Windows only."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDirectory = Join-Path $repoRoot "secrets\runtime"
$keyPath = Join-Path $runtimeDirectory "app_encryption_key"

if (Test-Path -LiteralPath $keyPath) {
    throw "An encryption key already exists at $keyPath. Refusing to overwrite it."
}

$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$systemSid = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")
$administratorsSid = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")
$principals = @($currentSid, $systemSid, $administratorsSid)

if (-not (Test-Path -LiteralPath $runtimeDirectory)) {
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
}

# Protect the runtime directory from inherited access and grant access only
# to the current user, Local System, and local Administrators.
$directoryAcl = New-Object System.Security.AccessControl.DirectorySecurity
$directoryAcl.SetAccessRuleProtection($true, $false)
$directoryInheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
$noPropagation = [System.Security.AccessControl.PropagationFlags]::None
$allow = [System.Security.AccessControl.AccessControlType]::Allow
$fullControl = [System.Security.AccessControl.FileSystemRights]::FullControl

foreach ($principal in $principals) {
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
        $principal, $fullControl, $directoryInheritance, $noPropagation, $allow
    )
    [void]$directoryAcl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $runtimeDirectory -AclObject $directoryAcl

# Generate 32 bytes from the operating system cryptographic RNG.
$keyBytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($keyBytes)
    $keyHex = [BitConverter]::ToString($keyBytes).Replace("-", "")
    $encodedKey = [System.Text.Encoding]::ASCII.GetBytes($keyHex)

    # CreateNew prevents replacing a key if another process creates it first.
    $stream = [System.IO.File]::Open(
        $keyPath,
        [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write,
        [System.IO.FileShare]::None
    )
    try {
        $stream.Write($encodedKey, 0, $encodedKey.Length)
        $stream.Flush($true)
    }
    finally {
        $stream.Dispose()
    }

    # Apply a protected file ACL, independent of inherited parent permissions.
    $fileAcl = New-Object System.Security.AccessControl.FileSecurity
    $fileAcl.SetAccessRuleProtection($true, $false)
    foreach ($principal in $principals) {
        $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
            $principal, $fullControl, $allow
        )
        [void]$fileAcl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $keyPath -AclObject $fileAcl

    Write-Host ""
    Write-Host "Encryption key generated." -ForegroundColor Green
    Write-Host "Runtime key file: $keyPath"
    Write-Host ""
    Write-Warning "The recovery key will be printed once. Do not run this while PowerShell transcription, screen recording, or session logging is enabled."
    Write-Host "Save this value in your password manager. Do not send it in chat or commit it."
    Write-Host ""
    Write-Host $keyHex -ForegroundColor Yellow
    Write-Host ""

    $confirmation = Read-Host "After saving the recovery key, type SAVED"
    if ($confirmation -cne "SAVED") {
        Write-Warning "The key file remains in place. Save the recovery copy before continuing. Do not rerun this script."
    }
    else {
        Write-Host "Recovery copy confirmed. Provisioning completed." -ForegroundColor Green
    }
}
finally {
    $rng.Dispose()
    [Array]::Clear($keyBytes, 0, $keyBytes.Length)
    if ($encodedKey) {
        [Array]::Clear($encodedKey, 0, $encodedKey.Length)
    }
    Remove-Variable keyHex -ErrorAction SilentlyContinue
    Remove-Variable encodedKey -ErrorAction SilentlyContinue
}
