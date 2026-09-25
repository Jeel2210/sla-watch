#!/bin/bash
# SLA Watch API Deployment Script
# Deploy Lambda function + configure URL + set environment variables
# Usage: ./deploy.sh -d "postgres://..." -o "https://your-domain.com"

set -e

# Default values
FUNCTION_NAME="sla-watch-api"
REGION="${AWS_REGION:-us-east-1}"
RUNTIME="nodejs20.x"

# Parse arguments
while getopts "d:o:f:r:h" opt; do
  case $opt in
    d) DATABASE_URL="$OPTARG" ;;
    o) ALLOWED_ORIGIN="$OPTARG" ;;
    f) FUNCTION_NAME="$OPTARG" ;;
    r) REGION="$OPTARG" ;;
    h) echo "Usage: $0 -d DATABASE_URL -o ALLOWED_ORIGIN [-f FUNCTION_NAME] [-r REGION]"; exit 0 ;;
    *) echo "Invalid option: -$OPTARG"; exit 1 ;;
  esac
done

# Use env vars if not provided
DATABASE_URL="${DATABASE_URL:-$DATABASE_URL}"
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-*}"

echo "=== SLA Watch API Deployment ==="

# Validate inputs
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DatabaseUrl is required (-d flag or DATABASE_URL env var)"
  exit 1
fi

echo "Checking AWS CLI..."
if ! command -v aws &> /dev/null; then
  echo "✗ AWS CLI not found. Install from: https://aws.amazon.com/cli/"
  exit 1
fi
echo "✓ AWS CLI found"

echo "Verifying AWS credentials..."
ACCOUNT=$(aws sts get-caller-identity --query Account --output text --region "$REGION")
if [ $? -ne 0 ]; then
  echo "✗ AWS credentials not configured. Run: aws configure"
  exit 1
fi
echo "✓ AWS authenticated (Account: $ACCOUNT)"

echo "Building TypeScript..."
npm run build
if [ $? -ne 0 ]; then
  echo "✗ Build failed"
  exit 1
fi
echo "✓ Build complete"

echo "Creating deployment package..."
rm -f lambda.zip
zip -r lambda.zip dist/ > /dev/null
echo "✓ Zip created (lambda.zip)"

echo "Checking if Lambda function exists..."
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" &> /dev/null; then
  echo "Function exists, updating code..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb://lambda.zip \
    --region "$REGION" > /dev/null
  echo "✓ Function code updated"
else
  echo "Function does not exist, creating..."

  ROLE_ARN="arn:aws:iam::$ACCOUNT:role/lambda-sla-watch-api-role"

  if ! aws iam get-role --role-name "lambda-sla-watch-api-role" &> /dev/null; then
    echo "Creating IAM role..."

    TRUST_POLICY='{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "lambda.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }]
    }'

    aws iam create-role \
      --role-name "lambda-sla-watch-api-role" \
      --assume-role-policy-document "$TRUST_POLICY" > /dev/null

    aws iam attach-role-policy \
      --role-name "lambda-sla-watch-api-role" \
      --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" > /dev/null

    echo "✓ IAM role created"
    sleep 3
  fi

  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime "$RUNTIME" \
    --role "$ROLE_ARN" \
    --handler "dist/handler.handler" \
    --zip-file fileb://lambda.zip \
    --timeout 120 \
    --memory-size 512 \
    --region "$REGION" > /dev/null

  echo "✓ Lambda function created"
fi

echo "Setting environment variables..."
aws lambda update-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --environment "Variables={DATABASE_URL=$DATABASE_URL,ALLOWED_ORIGIN=$ALLOWED_ORIGIN}" \
  --region "$REGION" > /dev/null
echo "✓ Environment variables set"

echo "Creating/updating Function URL..."
if aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$REGION" &> /dev/null; then
  echo "Function URL exists, updating CORS..."
  API_URL=$(aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$REGION" --query FunctionUrl --output text)
  aws lambda update-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --cors "AllowOrigins=$ALLOWED_ORIGIN,AllowMethods=GET;POST;OPTIONS,AllowHeaders=Content-Type;x-file-name" \
    --region "$REGION" > /dev/null
else
  echo "Creating Function URL..."
  API_URL=$(aws lambda create-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --auth-type NONE \
    --cors "AllowOrigins=$ALLOWED_ORIGIN,AllowMethods=GET;POST;OPTIONS,AllowHeaders=Content-Type;x-file-name" \
    --region "$REGION" \
    --query FunctionUrl --output text)
fi

echo "✓ Function URL ready"

echo ""
echo "=== Deployment Complete ==="
echo "Function Name: $FUNCTION_NAME"
echo "Region: $REGION"
echo "API URL: $API_URL"
echo ""
echo "Next steps:"
echo "1. Set VITE_API_URL=$API_URL in your Vercel deployment"
echo "2. Deploy web app: cd apps/web && vercel --prod"
echo "3. Test: curl -s ${API_URL}health | jq ."
echo ""

# Save config
cat > deploy-config.json <<EOF
{
  "FunctionName": "$FUNCTION_NAME",
  "Region": "$REGION",
  "ApiUrl": "$API_URL",
  "DeployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
echo "Config saved to deploy-config.json"

echo ""
echo "✓ Ready to deploy to Vercel!"
