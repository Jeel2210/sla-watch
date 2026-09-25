# SLA Watch API — Deployment

## How the build works

- `packages/core` is a **TypeScript-source** package (`main: src/index.ts`). It has no build step; whoever
  consumes it compiles it (Vite for web, Vitest for tests, esbuild for the API).
- `services/api` builds with **esbuild** into **one file**, `dist/index.mjs`: handler + routes + `@sla/core`
  + `pg` + `@neondatabase/serverless`. The zip holds only that file: no `node_modules`, no `package.json`.
- `tsc` in the API is **typecheck only** (`noEmit`). Its output was never runnable by Node: extensionless ESM
  imports and an unbuilt workspace package.
- The monorepo is driven by **Turborepo**: `npm run build | typecheck | test` at the root.

Lambda settings: handler `index.handler`, runtime `nodejs24.x`, 512 MB, 120 s, Function URL (auth `NONE`).

## Deploy (existing function)

Prerequisites: Node 20+, `npm install` at the repo root, AWS CLI v2 with `aws configure` done.

```powershell
# Windows
.\services\api\deploy.ps1
```

```bash
# macOS / Linux / CI (needs `zip`)
./services/api/deploy.sh
```

The script builds with turbo, zips `dist/index.mjs`, uploads it, sets the handler to `index.handler`,
keeps the function's existing env vars, and calls `GET /health`. It fails loudly if any step fails.

Change env vars (only needed once or when they change):

```powershell
.\services\api\deploy.ps1 -DatabaseUrl "<neon-connection-string>" -AllowedOrigin "https://sla-watch-tau.vercel.app"
```

Defaults: function `sla-watch-api`, region `ap-south-1` (`-FunctionName` / `-Region`, or `-f` / `-r` in bash).

## New AWS account (first-time setup)

`template.yaml` describes the function for SAM. Build first, then deploy the prebuilt bundle:

```bash
npm run build
sam deploy --guided --template-file services/api/template.yaml
```

Don't run `sam deploy` against the existing `sla-watch-api` function. It was created in the console, so
CloudFormation would fail on the name clash. Use the deploy script for that function.

## Troubleshooting

- **Logs:** `aws logs tail /aws/lambda/sla-watch-api --region ap-south-1 --since 10m`
- **Browser says "CORS error"** on every call: the function is probably crashing on startup. Crash responses
  carry no CORS headers, so check the logs first.
- **`/health` returns 503** (`db: false`): `DATABASE_URL` is wrong, or the Neon project is suspended.
