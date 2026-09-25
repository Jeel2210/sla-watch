# SLA Watch API

AWS Lambda function for processing CSV uploads, cleaning data, computing SLA stats, and storing results in Neon Postgres.

## Structure

- `src/handler.ts` - Function URL entry point and router
- `src/routes/` - Endpoint handlers (thin: parse → call core → respond)
- `src/db/` - Neon client, parameterized queries, migrations
- `src/lib/` - Error handling and logging utilities
- `template.yaml` - SAM infrastructure template

## Setup

### Prerequisites

- Node.js 20+
- AWS account with IAM user credentials configured locally (`aws configure`)
- Neon Postgres project with connection string
- SAM CLI installed (`sam --version`)

### 1. Initialize Database

Run migrations on your Neon database:

```bash
# In your Neon SQL editor or via psql:
for f in services/api/src/db/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done   # 001 once; 002+ are re-runnable
```

### 2. Configure Environment

Secrets go to SAM parameters (not in git). Use environment variables:

```bash
export DATABASE_URL="<your-neon-connection-string>"
export ALLOWED_ORIGIN="https://your-vercel-app.vercel.app"
```

See `.env.example` for variable names.

### 3. Build and Deploy

```bash
# From project root
npm install
npm run typecheck

# Navigate to API service
cd services/api

# Build Lambda function
npm run build

# Deploy with SAM
sam build
sam deploy --guided --parameter-overrides \
  DatabaseUrl="$DATABASE_URL" \
  AllowedOrigin="$ALLOWED_ORIGIN"
```

The output will include the **Lambda Function URL** — copy this into your Vercel env as `VITE_API_URL`.

## API Endpoints

### POST /uploads (gzipped CSV)
- Request: Gzipped CSV file in body, `x-file-name` header
- Response: 201 (new upload) or 200 (duplicate), with upload ID and summary
- Errors: 400 (bad), 413 (too large), 422 (wrong columns)

### GET /health
- Quick health check: returns `{ ok, db }`

### GET /uploads?cursor&limit&q
- List uploads with pagination and search

### GET /uploads/:id
- Get upload details and data report

### GET /uploads/:id/stats
- Stat strip: missed SLA, allowed downtime, incidents, lowest availability, stored count

### GET /uploads/:id/services?q&cursor&limit
- Service list, worst first, with server-side search

### GET /uploads/:id/checks?from&to&service&agent&region&sort&cursor&limit
- Log rows with filters and keyset cursor pagination

### GET /uploads/:id/incidents?cursor&limit
- Incident rows (outage windows)

### GET /uploads/:id/timeline?bins&offset&limit
- Per-service failure counts per bin (for timeline chart)

### GET /uploads/:id/services/:sid/hex?from&days
- Hourly failure counts for one day-page (for hex map)

## Deployment Notes

- **Reserved concurrency:** 5 (to stay within free tier)
- **Timeout:** 120 seconds (covers the largest file: ~4s clean + ~10s inserts)
- **Batch size:** 5,000 rows per INSERT (memory and query size stay flat)
- **Transactions:** One per upload (rollback if anything fails)
- **Body limit:** 6 MB (gzipped; browser pre-compresses ~10×)
- **Decompressed cap:** 50 MB (gzip-bomb guard)

## Testing Locally

```bash
# Run typecheck
npm run typecheck

# Run unit tests (when added)
npm run test
```

## Troubleshooting

### "Cannot connect to database"
- Check `DATABASE_URL` in env
- Verify Neon project is active
- Test connection: `psql "$DATABASE_URL" -c "select 1"`

### "Request too large (6 MB limit)"
- File is not gzipped or too large raw
- Browser should gzip in the upload flow

### "Decompressed too large (50 MB limit)"
- Gzip bomb detected (compressed file expands to >50 MB)
- Upload a smaller or less repetitive file

### Lambda timeout
- File >50 MB or database slow
- Increase timeout in SAM template (max 900s)
- Check Neon connection limits

## Redeploy

```bash
# After code changes
npm run build
sam deploy --no-confirm-changeset
```

## Monitoring

Logs appear in CloudWatch:

```bash
aws logs tail /aws/lambda/sla-watch-api --follow
```

Each request logs one JSON line: `{ route, uploadId, ms, rows, status }`
