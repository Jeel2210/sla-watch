# SLA Watch API Deployment

One-command deployment to AWS Lambda with automatic configuration.

## Prerequisites

- AWS CLI configured: `aws configure`
- Node.js 20+
- Valid Neon PostgreSQL connection string

## Deploy (Windows PowerShell)

```powershell
cd services\api

.\deploy.ps1 -DatabaseUrl "<neon-connection-string>" -AllowedOrigin "https://your-domain.com"
```

Or use environment variables:

```powershell
$env:DATABASE_URL = "<neon-connection-string>"
$env:ALLOWED_ORIGIN = "https://your-domain.com"
.\deploy.ps1
```

See `.env.example` for variable names.

## Deploy (Mac/Linux Bash)

```bash
cd services/api

chmod +x deploy.sh
./deploy.sh -d "<neon-connection-string>" -o "https://your-domain.com"
```

Or:

```bash
export DATABASE_URL="<neon-connection-string>"
export ALLOWED_ORIGIN="https://your-domain.com"
./deploy.sh
```

Secrets go in environment only (not committed). See `.env.example`.

## What the Script Does

1. ✅ Builds TypeScript (`npm run build`)
2. ✅ Creates deployment zip from `dist/`
3. ✅ Creates Lambda function (if first deploy)
4. ✅ Updates function code (if redeploy)
5. ✅ Sets environment variables
6. ✅ Creates/updates Function URL with CORS
7. ✅ Outputs the API URL for Vercel

## Output

Script prints:

```
=== Deployment Complete ===
Function Name: sla-watch-api
Region: us-east-1
API URL: https://xxxxx.lambda-url.us-east-1.on.aws/

Next steps:
1. Set VITE_API_URL=https://xxxxx.lambda-url.us-east-1.on.aws/ in Vercel
2. Deploy web app: cd apps/web && vercel --prod
3. Test: curl -s https://xxxxx.lambda-url.us-east-1.on.aws/health | jq .
```

## Redeploy (After Code Changes)

```powershell
# Windows
.\deploy.ps1

# Mac/Linux
./deploy.sh
```

Uses saved config from `deploy-config.json` if no args provided.

## Troubleshooting

**"AWS credentials not configured"**
```bash
aws configure
# Enter: AWS Access Key ID, Secret Access Key, Region, Output format
```

**"Cannot find module"**
```bash
npm install
```

**"Build failed"**
```bash
npm run typecheck  # Check for TypeScript errors
npm run build      # See detailed build output
```

**"Function creation failed"**
- Check that your IAM user has Lambda and IAM permissions
- Verify Region is correct

## Environment Variables

| Variable | Required | Example |
|---|---|---|
| `DATABASE_URL` | Yes | Neon connection string (see `.env.example`) |
| `ALLOWED_ORIGIN` | No | `https://app.vercel.app` or `*` |
| `AWS_REGION` | No | `us-east-1` (default) |

## Customization

Edit script for:
- **Function name:** `-f sla-watch-api-prod`
- **Region:** `-r eu-west-1`
- **Memory:** Edit `--memory-size` in script (512 MB default)
- **Timeout:** Edit `--timeout` in script (120 s default)

## Cost

Free tier covers:
- 1M requests/month
- 400,000 GB-seconds/month
- Generous for low-traffic apps

See [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)
