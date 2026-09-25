# Build the API with turbo + esbuild and push it to the existing Lambda function.
# Usage (from anywhere):
#   .\services\api\deploy.ps1
#   .\services\api\deploy.ps1 -DatabaseUrl "postgres://..." -AllowedOrigin "https://sla-watch-tau.vercel.app"
# DatabaseUrl / AllowedOrigin are optional: when omitted, the function's current values are kept.

param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$AllowedOrigin = $env:ALLOWED_ORIGIN,
  [string]$FunctionName = "sla-watch-api",
  [string]$Region = "ap-south-1",
  # Same as MemorySize in template.yaml: a 50 MB CSV needs well over 512 MB.
  [int]$MemoryMB = 2048
)

$ErrorActionPreference = "Stop"
$apiDir = $PSScriptRoot
$repoRoot = Resolve-Path "$apiDir\..\.."
$zipPath = Join-Path $apiDir "dist\lambda.zip"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Invoke-Native([scriptblock]$cmd, [string]$what) {
  & $cmd
  if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" }
}

$aws = (Get-Command aws -ErrorAction SilentlyContinue).Source
if (-not $aws) { $aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe" }
if (-not (Test-Path $aws)) { throw "AWS CLI not found. Install it from https://aws.amazon.com/cli/ and run 'aws configure'." }

Step "Checking AWS credentials"
Invoke-Native { & $aws sts get-caller-identity --query Arn --output text } "aws sts get-caller-identity"

Step "Building api (turbo -> esbuild single-file bundle)"
Push-Location $repoRoot
try { Invoke-Native { npx turbo run build --filter=api } "turbo build" } finally { Pop-Location }

# One file only: avoids Windows PowerShell writing backslash paths into the zip,
# which Lambda (Linux) extracts as literal file names like "dist\routes\upload.js".
Step "Packaging dist/index.mjs"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $apiDir "dist\index.mjs") -DestinationPath $zipPath
Write-Host ("lambda.zip: {0:N0} KB" -f ((Get-Item $zipPath).Length / 1KB))

Step "Uploading code to $FunctionName ($Region)"
Invoke-Native { & $aws lambda update-function-code --function-name $FunctionName --region $Region --zip-file "fileb://$zipPath" --query LastUpdateStatus --output text } "update-function-code"
Invoke-Native { & $aws lambda wait function-updated-v2 --function-name $FunctionName --region $Region } "wait function-updated"

Step "Updating configuration (handler, memory $MemoryMB MB, env)"
$current = & $aws lambda get-function-configuration --function-name $FunctionName --region $Region --output json | ConvertFrom-Json
$vars = @{}
if ($current.Environment -and $current.Environment.Variables) {
  $current.Environment.Variables.PSObject.Properties | ForEach-Object { $vars[$_.Name] = $_.Value }
}
if ($DatabaseUrl) { $vars["DATABASE_URL"] = $DatabaseUrl }
if ($AllowedOrigin) { $vars["ALLOWED_ORIGIN"] = $AllowedOrigin }
if (-not $vars["DATABASE_URL"]) { throw "DATABASE_URL is not set on the function. Pass -DatabaseUrl once." }
if (-not $vars["ALLOWED_ORIGIN"]) { $vars["ALLOWED_ORIGIN"] = "*" }

# Env goes through a JSON file so '&', '=' and '?' in the connection string survive the shell.
$envFile = Join-Path $env:TEMP "sla-watch-env-$PID.json"
try {
  [System.IO.File]::WriteAllText($envFile, (@{ Variables = $vars } | ConvertTo-Json -Compress), [System.Text.UTF8Encoding]::new($false))
  Invoke-Native { & $aws lambda update-function-configuration --function-name $FunctionName --region $Region --handler index.handler --memory-size $MemoryMB --environment "file://$envFile" --query LastUpdateStatus --output text } "update-function-configuration"
} finally {
  Remove-Item $envFile -Force -ErrorAction SilentlyContinue
}
Invoke-Native { & $aws lambda wait function-updated-v2 --function-name $FunctionName --region $Region } "wait function-updated"

Step "Smoke test GET /health"
$url = (& $aws lambda get-function-url-config --function-name $FunctionName --region $Region --query FunctionUrl --output text).TrimEnd('/')
# curl.exe, not Invoke-WebRequest: PowerShell 5.1's HTTP client can stall ~60 s before connecting.
$health = curl.exe -sS --max-time 60 -w " [HTTP %{http_code}]" "$url/health"
if ($LASTEXITCODE -ne 0 -or $health -notmatch '\[HTTP 200\]') {
  Write-Host "Health check failed: $health" -ForegroundColor Red
  Write-Host "Logs: aws logs tail /aws/lambda/$FunctionName --region $Region --since 10m"
  exit 1
}
Write-Host $health -ForegroundColor Green

Write-Host "`nDeployed. API URL: $url" -ForegroundColor Green
