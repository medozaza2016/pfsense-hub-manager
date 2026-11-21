param([switch]$Development)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
function Set-Env([string]$Name,[string]$Value) {
  $lines = @(Get-Content .env)
  $rx = '^\s*' + [regex]::Escape($Name) + '='
  $found = $false
  for ($i=0; $i -lt $lines.Count; $i++) { if ($lines[$i] -match $rx) { $lines[$i]="$Name=$Value"; $found=$true } }
  if (-not $found) { $lines += "$Name=$Value" }
  [IO.File]::WriteAllText((Join-Path (Get-Location) ".env"),(($lines -join [Environment]::NewLine)+[Environment]::NewLine),[Text.UTF8Encoding]::new($false))
}
function Get-Env([string]$Name,[string]$Default="") {
  $line = Get-Content .env | Where-Object { $_ -match ('^'+[regex]::Escape($Name)+'=') } | Select-Object -Last 1
  if ($null -eq $line) { return $Default }
  $value = ($line -replace ('^'+[regex]::Escape($Name)+'='),'').Trim()
  # .env values may be quoted. Remove one matching pair before using them
  # in URLs, Docker arguments, or validation checks.
  if ($value.Length -ge 2) {
    if (($value.StartsWith("'") -and $value.EndsWith("'")) -or
        ($value.StartsWith('"') -and $value.EndsWith('"'))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
  }
  return $value
}
function Read-Hidden([string]$Prompt) {
  $s=Read-Host $Prompt -AsSecureString
  $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p); $s.Dispose() }
}
function Protect-File([string]$Path) {
  $who=[Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls.exe $Path /inheritance:r /grant:r "$($who):(R)" "SYSTEM:(F)" "Administrators:(F)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Unable to secure secret file: $Path" }
}
$ErrorActionPreference="Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
Write-Host "pfSense Hub Manager installer" -ForegroundColor Green

if ($Development) {
  Write-Host "Checking local development prerequisites..." -ForegroundColor Cyan
  $node = Get-Command node -ErrorAction SilentlyContinue
  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $node) { throw "Node.js 22 or newer is required for development. Install the current Node.js LTS release, then reopen PowerShell." }
  if (-not $npm) { throw "npm 10 or newer is required for development. Reinstall Node.js with npm included, then reopen PowerShell." }
  $nodeVersionText = (& node --version).Trim()
  $npmVersionText = (& npm --version).Trim()
  if ($nodeVersionText -notmatch '^v?(\d+)\.') { throw "Unable to determine Node.js version: $nodeVersionText" }
  $nodeMajor = [int]$Matches[1]
  if ($nodeMajor -lt 22) { throw "Node.js 22 or newer is required. Detected $nodeVersionText." }
  if ($npmVersionText -notmatch '^(\d+)\.') { throw "Unable to determine npm version: $npmVersionText" }
  $npmMajor = [int]$Matches[1]
  if ($npmMajor -lt 10) { throw "npm 10 or newer is required. Detected $npmVersionText." }
  Write-Host "Node.js $nodeVersionText and npm $npmVersionText detected." -ForegroundColor Green
  if (-not (Test-Path "node_modules")) {
    Write-Host "Installing workspace dependencies..." -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed. Resolve the npm error before continuing." }
  } else {
    Write-Host "node_modules exists. Checking TypeScript availability..." -ForegroundColor Cyan
  }
  npx --no-install tsc --version
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing or repairing workspace dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed. Resolve the npm error before continuing." }
    npx --no-install tsc --version
    if ($LASTEXITCODE -ne 0) { throw "TypeScript compiler is still unavailable after npm install." }
  }
  Write-Host "Checking Windows native build dependencies..." -ForegroundColor Cyan
  node scripts/repair-native-deps.mjs
  if ($LASTEXITCODE -ne 0) { throw "Windows native dependency repair failed. Resolve the reported package issue before continuing." }

  Write-Host "Checking npm dependency vulnerabilities..." -ForegroundColor Cyan
  npm audit
  $initialAuditExit = $LASTEXITCODE
  if ($initialAuditExit -eq 1) {
    Write-Host "Vulnerabilities found. Applying compatible, non-breaking dependency fixes..." -ForegroundColor Yellow
    npm audit fix
    $fixExit = $LASTEXITCODE
    if ($fixExit -ne 0) {
      Write-Warning "npm audit fix did not resolve every issue or reported an error. Running a final audit to identify remaining findings."
    }
  } elseif ($initialAuditExit -gt 1) {
    Write-Warning "The initial npm audit could not complete (exit code $initialAuditExit). The installer will retry the audit after the fix step."
  } else {
    Write-Host "Initial npm audit found no vulnerabilities." -ForegroundColor Green
  }

  Write-Host "Verifying dependency security after automatic fixes..." -ForegroundColor Cyan
  $auditJson = (& npm audit --json 2>$null | Out-String).Trim()
  $finalAuditExit = $LASTEXITCODE
  if ([string]::IsNullOrWhiteSpace($auditJson)) {
    Write-Warning "npm did not return an audit report (exit code $finalAuditExit). Dependency security could not be verified."
  } else {
    try {
      $auditReport = $auditJson | ConvertFrom-Json
      $counts = $auditReport.metadata.vulnerabilities
      $total = [int]$counts.total
      if ($total -eq 0) {
        Write-Host "Dependency audit passed. No known vulnerabilities remain." -ForegroundColor Green
      } else {
        Write-Warning ("Dependency audit still reports {0} vulnerabilities: {1} critical, {2} high, {3} moderate, {4} low." -f $total, [int]$counts.critical, [int]$counts.high, [int]$counts.moderate, [int]$counts.low)
        Write-Warning "Review the npm audit report. The installer did not use --force or apply breaking major-version upgrades."
      }
    } catch {
      Write-Warning "Unable to parse the final npm audit report. Dependency security could not be verified."
    }
  }

  Write-Host "Running local type checks..." -ForegroundColor Cyan
  npm run typecheck
  if ($LASTEXITCODE -ne 0) { throw "Type checks failed. Fix the reported errors before continuing." }
  Write-Host "Building local application..." -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Local build failed. Fix the reported errors before continuing." }
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker CLI missing. Install/start Docker Desktop." }
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker Desktop engine is not running." }
docker compose version
if ($LASTEXITCODE -ne 0) { throw "Docker Compose v2 is required." }
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
$db=Get-Env "POSTGRES_PASSWORD"
if (-not $db -or $db -match '^replace-with-') {
  $random=[Security.Cryptography.RandomNumberGenerator]::Create(); $randomBytes=[byte[]]::new(32); $random.GetBytes($randomBytes); $random.Dispose(); $db=[BitConverter]::ToString($randomBytes).Replace("-","").ToLowerInvariant()
  Set-Env "POSTGRES_PASSWORD" $db
}
$url=Get-Env "PFSENSE_API_BASE_URL" "https://172.10.50.1:10443"
if (-not $url.StartsWith("https://")) { throw "pfSense API URL must use HTTPS." }
New-Item -ItemType Directory -Force secrets,certs,workspace | Out-Null
$keyFile="secrets\pfsense_api_key"
if (-not (Test-Path $keyFile) -or (Get-Item $keyFile).Length -eq 0) {
  $key=Read-Hidden "Dedicated read-only pfSense API key (hidden)"
  if ([string]::IsNullOrWhiteSpace($key)) { throw "API key cannot be empty." }
  [IO.File]::WriteAllText((Join-Path (Get-Location) $keyFile),$key.Trim(),[Text.UTF8Encoding]::new($false)); $key=$null
}
Protect-File $keyFile
$credentialKeyFile="secrets\device_credentials_key"
if (-not (Test-Path $credentialKeyFile) -or (Get-Item $credentialKeyFile).Length -eq 0) {
  $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
  $bytes=[byte[]]::new(32)
  $rng.GetBytes($bytes)
  $rng.Dispose()
  $credentialKey=[BitConverter]::ToString($bytes).Replace("-","").ToLowerInvariant()
  [IO.File]::WriteAllText((Join-Path (Get-Location) $credentialKeyFile),$credentialKey,[Text.UTF8Encoding]::new($false))
  $credentialKey=$null
}
Protect-File $credentialKeyFile
if (-not (Test-Path certs\pfsense-ca.pem)) {
  $ca=Read-Host "Private pfSense CA PEM path, or Enter if not required"
  if ($ca) { if (-not (Test-Path $ca -PathType Leaf)) { throw "CA file not found." }; Copy-Item $ca certs\pfsense-ca.pem }
}
if (Test-Path certs\pfsense-ca.pem) { Set-Env "PFSENSE_CA_FILE" "/run/certs/pfsense-ca.pem" } else { Set-Env "PFSENSE_CA_FILE" "" }
$enable=Read-Host "Enable code-server (VS Code in browser)? [y/N]"
$files=@("-f","compose.yaml"); $password=$null
if ($enable -match '^(y|yes)$') {
  $files+=@("-f","compose.code-server.yaml")
  if (-not (Test-Path secrets\code_server_password)) {
    $generate=Read-Host "Generate strong code-server password automatically? [Y/n]"
    if ($generate -match '^(n|no)$') { $password=Read-Hidden "Code-server password, minimum 16 characters"; if ($password.Length -lt 16) { throw "Password must be at least 16 characters." } }
    else { $rng=[Security.Cryptography.RandomNumberGenerator]::Create(); $b=[byte[]]::new(32); $rng.GetBytes($b); $rng.Dispose(); $password=[Convert]::ToBase64String($b).TrimEnd('=').Replace('+','-').Replace('/','_') }
    [IO.File]::WriteAllText((Join-Path (Get-Location) "secrets\code_server_password"),$password,[Text.UTF8Encoding]::new($false))
  } else { $password=[IO.File]::ReadAllText("secrets\code_server_password").Trim() }
  Protect-File "secrets\code_server_password"
}
docker compose @files config --quiet
if ($LASTEXITCODE -ne 0) { throw "Compose configuration invalid. Check .env." }
docker compose @files up -d --build --wait --wait-timeout 240
if ($LASTEXITCODE -ne 0) { docker compose @files logs --tail 80; throw "Services failed to become healthy." }
$port=Get-Env "WEB_PORT" "8080"; $app="http://127.0.0.1:$port"
$ok=$false
for ($i=0;$i -lt 20;$i++) { try { $r=Invoke-WebRequest "$app/health" -TimeoutSec 3 -UseBasicParsing; if ($r.StatusCode -eq 200) {$ok=$true;break} } catch { Start-Sleep 2 } }
Write-Host "Installation complete." -ForegroundColor Green
Write-Host "Application: $app"
if (-not $ok) { Write-Warning "Web probe failed. Run docker compose logs web." }
if ($enable -match '^(y|yes)$') {
  $cp=Get-Env "CODE_SERVER_PORT" "8443"; Write-Host "Browser VS Code: http://127.0.0.1:$cp"
  if ($password) { Write-Host "code-server password (shown once): $password" }
}
Write-Host "UI is localhost-only. Keep it private until the production security review is complete."
Write-Host "Troubleshooting: docker compose ps ; docker compose logs -f api"
