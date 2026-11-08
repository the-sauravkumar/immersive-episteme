[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [ValidateSet('production', 'preview')][string]$Environment = 'production',
  [switch]$DryRun,
  [switch]$Yes,
  [switch]$Force,
  [switch]$BuildVersionFromGit,
  [string[]]$Only,
  [string]$VercelCommand = 'npx --yes vercel@60.1.3'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (Test-Path 'C:\Tools\Node\node.exe') { $env:Path = "C:\Tools\Node;$env:Path" }

if (-not (Test-Path -LiteralPath $EnvFile)) { throw "Env file not found: $EnvFile" }
$envPath = (Resolve-Path -LiteralPath $EnvFile).Path
if ($Environment -eq 'preview' -and ((Split-Path -Leaf $envPath) -notmatch 'preview')) {
  throw 'Preview needs its own env file with "preview" in its name (scratch database, preview origin). Pushing the production file to Preview would give every branch build the production database and bucket.'
}

$buildVersion = $null
if ($BuildVersionFromGit) {
  $buildVersion = (& git -C $repo rev-parse --short HEAD).Trim()
  if (-not $buildVersion) { throw 'git rev-parse failed' }
  $dirty = & git -C $repo status --porcelain
  if ($dirty) { Write-Warning "Working tree has uncommitted changes; APP_BUILD_VERSION=$buildVersion names HEAD, not them." }
}

function Invoke-EnvJson([bool]$withValues) {
  $a = @('tsx', 'scripts/deploy/lib/env-json.ts', '--env-file', $envPath)
  if ($withValues) { $a += '--with-values' }
  if ($buildVersion) { $a += @('--build-version', $buildVersion) }
  Push-Location $repo
  try { $out = & npx --no-install @a } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw "env-json.ts failed (exit $LASTEXITCODE)" }

  try { return (($out -join "`n") | ConvertFrom-Json) } catch { throw 'env-json.ts output was not valid JSON (content withheld).' }
}

$plan = Invoke-EnvJson $false
$items = @($plan.items)
if ($Only) {
  foreach ($i in $items) {
    if ($i.action -eq 'push' -and $Only -notcontains $i.name) { $i.action = 'skip'; $i.reason = 'not in -Only' }
  }
}

Write-Host ""
Write-Host "Plan: vercel env add -> $Environment   (file: $envPath)"
Write-Host ("{0,-28} {1,-7} {2,7}  {3,-5}  {4}" -f 'NAME', 'TYPE', 'BYTES', 'DO', 'NOTE')
foreach ($i in $items) {
  $type = if ($i.kind -eq 'secret') { 'Secret' } else { 'Config' }
  $note = $i.reason
  if ($i.name -eq 'APP_BUILD_VERSION' -and $buildVersion) { $note = "git HEAD $buildVersion" }
  Write-Host ("{0,-28} {1,-7} {2,7}  {3,-5}  {4}" -f $i.name, $type, $i.bytes, $i.action, $note)
}
Write-Host ("Total pushed: {0} bytes of the {1}-byte per-deployment limit." -f $plan.totalBytes, $plan.limitBytes)

$blocked = @()
if (@($plan.missingRequired).Count -gt 0 -and -not $Only) { $blocked += "missing required: $(@($plan.missingRequired) -join ', ')" }
if (@($plan.refused).Count -gt 0) { $blocked += "refused names in the file: $(@($plan.refused) -join ', ')" }
if ($plan.totalBytes -ge $plan.limitBytes) { $blocked += 'over the 64 KB limit' }
foreach ($b in $blocked) { Write-Host "BLOCKED: $b" -ForegroundColor Yellow }

if ($DryRun) {
  Write-Host ""
  Write-Host "Dry run: nothing was sent to Vercel. Commands a real run would execute (value on stdin):"
  foreach ($i in $items | Where-Object { $_.action -eq 'push' }) {
    $flag = if ($i.kind -eq 'secret') { '--sensitive' } else { '--no-sensitive' }
    $f = if ($Force) { ' --force' } else { '' }
    Write-Host "  $VercelCommand env add $($i.name) $Environment $flag$f --yes"
  }
  if ($blocked.Count -gt 0) { exit 1 } else { exit 0 }
}

if (-not $Yes) { throw 'Refusing to change Vercel configuration without -Yes (confirm with the project lead first). Use -DryRun to preview.' }
if ($blocked.Count -gt 0) { throw "Fix the env file first: $($blocked -join '; ')" }
$projectFile = Join-Path $repo '.vercel\project.json'
if (-not (Test-Path $projectFile)) { throw 'Project not linked: run `npx vercel@60.1.3 link` in the repo first (RUNBOOK step 6).' }
$proj = Get-Content -Raw $projectFile | ConvertFrom-Json
Write-Host "Linked project: $($proj.projectName) (projectId $($proj.projectId), orgId $($proj.orgId)) -> $Environment"

function Invoke-Vercel([string]$arguments, [string]$stdin) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $env:ComSpec
  $psi.Arguments = "/d /s /c `"$VercelCommand $arguments`""
  $psi.WorkingDirectory = $repo
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $errTask = $p.StandardError.ReadToEndAsync()
  $outTask = $p.StandardOutput.ReadToEndAsync()
  if ($null -ne $stdin) { $p.StandardInput.Write($stdin) }
  $p.StandardInput.Close()
  $p.WaitForExit()
  return [pscustomobject]@{ Code = $p.ExitCode; Out = $outTask.Result + $errTask.Result }
}

$who = Invoke-Vercel 'whoami' $null
if ($who.Code -ne 0) { throw 'Vercel CLI is not logged in: the user runs `! npx vercel@60.1.3 login` (interactive).' }
Write-Host "Vercel account: $(($who.Out -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 1).Trim())"

$full = Invoke-EnvJson $true
$values = @{}
foreach ($i in @($full.items)) { if ($null -ne $i.value) { $values[$i.name] = [string]$i.value } }
$full = $null

$failed = 0
foreach ($i in $items | Where-Object { $_.action -eq 'push' }) {
  $flag = if ($i.kind -eq 'secret') { '--sensitive' } else { '--no-sensitive' }
  $f = if ($Force) { ' --force' } else { '' }
  $value = $values[$i.name]
  $r = Invoke-Vercel "env add $($i.name) $Environment $flag$f --yes" $value
  $msg = $r.Out
  if ($value -and $value.Length -ge 4) { $msg = $msg.Replace($value, '***') }
  $last = ($msg -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 1)
  if ($r.Code -eq 0) {
    Write-Host ("OK    {0,-28} {1}" -f $i.name, $(if ($i.kind -eq 'secret') { 'Secret' } else { 'Config' }))
  } else {
    $failed++
    Write-Host ("FAIL  {0,-28} exit {1}: {2}" -f $i.name, $r.Code, $last) -ForegroundColor Red
    if ($msg -match 'already exists') { Write-Host '      (exists: rerun with -Force -Only <NAME> to overwrite)' }
  }
}
$values.Clear()

Write-Host ""
Write-Host "Check names and types with: $VercelCommand env ls $Environment"
Write-Host 'Env changes apply to NEW deployments only: redeploy (RUNBOOK step 9).'
if ($failed -gt 0) { exit 1 }
