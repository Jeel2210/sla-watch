# SLA Watch API Deployment Script
# Deploy Lambda function + configure URL + set environment variables
# Usage: .\deploy.ps1 -DatabaseUrl "postgres://..." -AllowedOrigin "https://your-domain.com"

param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$AllowedOrigin = $env:ALLOWED_ORIGIN,
  [string]$FunctionName = "sla-watch-api",
  [string]$Region = "us-east-1",
  [string]$Runtime = "nodejs20.x"
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Error { Write-Host $args -ForegroundColor Red }
function Write-Info { Write-Host $args -ForegroundColor Cyan }

Write-Info "=== SLA Watch API Deployment ==="

# Validate inputs
if (!$DatabaseUrl) {
  Write-Error "ERROR: DatabaseUrl is required"
  Write-Info "Usage: .\deploy.ps1 -DatabaseUrl 'postgres://...' -AllowedOrigin 'https://...'"
  exit 1
}

if (!$AllowedOrigin) {
  $AllowedOrigin = "*"
  Write-Info "AllowedOrigin not specified, using '*' (allow all)"
}

# Check AWS CLI
Write-Info "Checking AWS CLI..."
try {
  $awsVersion = aws --version 2>$null
  Write-Success "✓ AWS CLI found: $awsVersion"
} catch {
  Write-Error "✗ AWS CLI not found. Install from: https://aws.amazon.com/cli/"
  exit 1
}

# Verify AWS credentials
Write-Info "Verifying AWS credentials..."
try {
  $identity = aws sts get-caller-identity --region $Region
  $account = ($identity | ConvertFrom-Json).Account
  Write-Success "✓ AWS authenticated (Account: $account)"
} catch {
  Write-Error "✗ AWS credentials not configured. Run: aws configure"
  exit 1
}

# Build TypeScript
Write-Info "Building TypeScript..."
npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Error "✗ Build failed"
  exit 1
}
Write-Success "✓ Build complete"

# Create zip
Write-Info "Creating deployment package..."
if (Test-Path "lambda.zip") { Remove-Item "lambda.zip" }
Compress-Archive -Path "dist\*" -DestinationPath "lambda.zip"
Write-Success "✓ Zip created (lambda.zip)"

# Check if function exists
Write-Info "Checking if Lambda function exists..."
$functionExists = aws lambda get-function --function-name $FunctionName --region $Region 2>$null
if ($functionExists) {
  Write-Info "Function exists, updating code..."
  aws lambda update-function-code `
    --function-name $FunctionName `
    --zip-file fileb://lambda.zip `
    --region $Region | Out-Null
  Write-Success "✓ Function code updated"
} else {
  Write-Info "Function does not exist, creating..."

  # Create IAM role if needed
  $roleArn = "arn:aws:iam::$account:role/lambda-sla-watch-api-role"
  $roleExists = aws iam get-role --role-name "lambda-sla-watch-api-role" 2>$null

  if (!$roleExists) {
    Write-Info "Creating IAM role..."
    $trustPolicy = @{
      Version = "2012-10-17"
      Statement = @(
        @{
          Effect = "Allow"
          Principal = @{ Service = "lambda.amazonaws.com" }
          Action = "sts:AssumeRole"
        }
      )
    } | ConvertTo-Json

    aws iam create-role `
      --role-name "lambda-sla-watch-api-role" `
      --assume-role-policy-document $trustPolicy | Out-Null

    # Attach basic execution policy
    aws iam attach-role-policy `
      --role-name "lambda-sla-watch-api-role" `
      --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" | Out-Null

    Write-Success "✓ IAM role created"
    Start-Sleep -Seconds 3  # Wait for role to propagate
  }

  aws lambda create-function `
    --function-name $FunctionName `
    --runtime $Runtime `
    --role $roleArn `
    --handler "dist/handler.handler" `
    --zip-file fileb://lambda.zip `
    --timeout 120 `
    --memory-size 512 `
    --region $Region | Out-Null

  Write-Success "✓ Lambda function created"
}

# Set environment variables
Write-Info "Setting environment variables..."
$envVars = @{
  DATABASE_URL = $DatabaseUrl
  ALLOWED_ORIGIN = $AllowedOrigin
} | ConvertTo-Json
aws lambda update-function-configuration `
  --function-name $FunctionName `
  --environment "Variables={DATABASE_URL=$DatabaseUrl,ALLOWED_ORIGIN=$AllowedOrigin}" `
  --region $Region | Out-Null
Write-Success "✓ Environment variables set"

# Create or update Function URL
Write-Info "Creating/updating Function URL..."
$functionUrl = aws lambda get-function-url-config --function-name $FunctionName --region $Region 2>$null
if ($functionUrl) {
  Write-Info "Function URL already exists, updating CORS..."
  aws lambda update-function-url-config `
    --function-name $FunctionName `
    --cors "AllowOrigins=$AllowedOrigin,AllowMethods=GET;POST;OPTIONS,AllowHeaders=Content-Type;x-file-name" `
    --region $Region | Out-Null
  $urlOutput = $functionUrl | ConvertFrom-Json
} else {
  Write-Info "Creating Function URL..."
  $urlOutput = aws lambda create-function-url-config `
    --function-name $FunctionName `
    --auth-type NONE `
    --cors "AllowOrigins=$AllowedOrigin,AllowMethods=GET;POST;OPTIONS,AllowHeaders=Content-Type;x-file-name" `
    --region $Region | ConvertFrom-Json
}

$apiUrl = $urlOutput.FunctionUrl
Write-Success "✓ Function URL ready"

# Output summary
Write-Info "`n=== Deployment Complete ==="
Write-Success "Function Name: $FunctionName"
Write-Success "Region: $Region"
Write-Success "API URL: $apiUrl"
Write-Info "`nNext steps:"
Write-Info "1. Set VITE_API_URL=$apiUrl in your Vercel deployment"
Write-Info "2. Deploy web app: cd apps/web && vercel --prod"
Write-Info "3. Test: curl -s $($apiUrl)health | jq ."

# Save config for next deploy
$config = @{
  FunctionName = $FunctionName
  Region = $Region
  ApiUrl = $apiUrl
  DeployedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
} | ConvertTo-Json
$config | Set-Content -Path "deploy-config.json"
Write-Info "`nConfig saved to deploy-config.json"

Write-Success "`n✓ Ready to deploy to Vercel!"
