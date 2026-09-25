#!/usr/bin/env bash
# Build the API with turbo + esbuild and push it to the existing Lambda function.
# Usage: ./services/api/deploy.sh [-d DATABASE_URL] [-o ALLOWED_ORIGIN] [-f FUNCTION_NAME] [-r REGION]
# -d / -o are optional: when omitted, the function's current values are kept.
set -euo pipefail

FUNCTION_NAME="sla-watch-api"
REGION="ap-south-1"
NEW_DATABASE_URL="${DATABASE_URL:-}"
NEW_ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-}"

while getopts "d:o:f:r:h" opt; do
  case $opt in
    d) NEW_DATABASE_URL="$OPTARG" ;;
    o) NEW_ALLOWED_ORIGIN="$OPTARG" ;;
    f) FUNCTION_NAME="$OPTARG" ;;
    r) REGION="$OPTARG" ;;
    *) echo "Usage: $0 [-d DATABASE_URL] [-o ALLOWED_ORIGIN] [-f FUNCTION_NAME] [-r REGION]"; exit 1 ;;
  esac
done

API_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$API_DIR/../.." && pwd)"
ZIP_PATH="$API_DIR/dist/lambda.zip"

step() { printf '\n==> %s\n' "$1"; }

command -v aws >/dev/null || { echo "AWS CLI not found. Install it and run 'aws configure'."; exit 1; }
command -v zip >/dev/null || { echo "'zip' not found. Install it (e.g. apt install zip)."; exit 1; }

step "Checking AWS credentials"
aws sts get-caller-identity --query Arn --output text

step "Building api (turbo -> esbuild single-file bundle)"
(cd "$REPO_ROOT" && npx turbo run build --filter=api)

step "Packaging dist/index.mjs"
rm -f "$ZIP_PATH"
zip -j "$ZIP_PATH" "$API_DIR/dist/index.mjs" >/dev/null

step "Uploading code to $FUNCTION_NAME ($REGION)"
aws lambda update-function-code --function-name "$FUNCTION_NAME" --region "$REGION" \
  --zip-file "fileb://$ZIP_PATH" --query LastUpdateStatus --output text
aws lambda wait function-updated-v2 --function-name "$FUNCTION_NAME" --region "$REGION"

step "Updating configuration (handler, env)"
ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT
aws lambda get-function-configuration --function-name "$FUNCTION_NAME" --region "$REGION" --output json \
  | NEW_DATABASE_URL="$NEW_DATABASE_URL" NEW_ALLOWED_ORIGIN="$NEW_ALLOWED_ORIGIN" node -e '
      let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
        const vars = JSON.parse(s).Environment?.Variables ?? {};
        if (process.env.NEW_DATABASE_URL) vars.DATABASE_URL = process.env.NEW_DATABASE_URL;
        if (process.env.NEW_ALLOWED_ORIGIN) vars.ALLOWED_ORIGIN = process.env.NEW_ALLOWED_ORIGIN;
        if (!vars.DATABASE_URL) { console.error("DATABASE_URL is not set on the function. Pass -d once."); process.exit(1); }
        vars.ALLOWED_ORIGIN ??= "*";
        process.stdout.write(JSON.stringify({ Variables: vars }));
      });' > "$ENV_FILE"
aws lambda update-function-configuration --function-name "$FUNCTION_NAME" --region "$REGION" \
  --handler index.handler --environment "file://$ENV_FILE" --query LastUpdateStatus --output text
aws lambda wait function-updated-v2 --function-name "$FUNCTION_NAME" --region "$REGION"

step "Smoke test GET /health"
URL="$(aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$REGION" --query FunctionUrl --output text)"
URL="${URL%/}"
if ! curl -fsS --max-time 60 "$URL/health"; then
  echo "Health check failed. Logs: aws logs tail /aws/lambda/$FUNCTION_NAME --region $REGION --since 10m"
  exit 1
fi

printf '\n\nDeployed. API URL: %s\n' "$URL"
