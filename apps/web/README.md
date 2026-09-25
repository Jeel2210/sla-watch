# SLA Watch Web App

React frontend for the SLA monitoring dashboard. Built with Vite, React 18, and TanStack Query.

## Quick Start

### Development

```bash
# Set the API URL (Lambda Function URL from Phase 2)
export VITE_API_URL="https://xxx.lambda-url.region.on.aws/"

# Start dev server
npm run dev
# Opens at http://localhost:5173
```

### Build

```bash
npm run build    # Creates dist/ for deployment
npm run preview  # Preview the production build locally
```

## Deployment (Vercel)

```bash
# From project root, install Vercel CLI
npm install -g vercel

# Deploy
cd apps/web
vercel --prod

# Set environment variable during deployment
# Name: VITE_API_URL
# Value: <Lambda Function URL>
```

Or use Vercel dashboard:
1. Connect this GitHub repo (Jeel2210/sla-watch)
2. Set root directory: `apps/web`
3. Add environment variable `VITE_API_URL`
4. Deploy

## Features

- **Upload CSV**: Drag-and-drop interface; gzips file in browser before upload
- **Recent uploads table**: Shows latest files processed
- **Upload summary**: Stats for the last uploaded file

## Pages (Phase 3+)

- **Dashboard**: Stats panel (collapsible), hex map, timeline, incidents view
- **Logs**: Filterable by date range, service, agent, region, status
- **Uploads**: List all uploads with search; switch between them
- **Data report**: What was detected and fixed in the CSV
- **Full view**: Full hex chart modal fitting to screen

## API Integration

All data fetching through `src/api/client.ts` using:
- `uploadCsv(file)` — POST /uploads
- `getHealth()` — GET /health
- `getUploads(options)` — GET /uploads

Frontend uses TanStack Query for:
- Automatic caching and re-fetching
- Pagination with cursor support
- Request cancellation on filter changes
- Loading and error states

## Styling

All colors defined in `src/styles/tokens.css`:
- Light mode (default)
- Dark mode (via `prefers-color-scheme` or `data-theme="dark"`)

Never use raw hex colors in components; always reference CSS variables.

## Component Library

Built with simple, reusable components:
- Panel: white box with title and controls
- StatStrip: 5-cell grid for KPIs
- Pill: colored label (Met / Missed)
- Table: sortable logs and lists
- Dialog: modals (full view, data report)

## Testing

```bash
npm run typecheck   # TypeScript validation
```

(Unit tests added in Phase 3)

## Troubleshooting

**"Cannot connect to API"**
- Check `VITE_API_URL` is set and the Lambda function is running
- Test: `curl -s https://<function-url>/health | jq .`

**"File upload fails with 400"**
- File might be empty or not a CSV
- Check browser console for the actual error

**"Build fails with TypeScript errors"**
- Run `npm run typecheck` to see detailed errors
- Ensure `import.meta.env.VITE_*` is used for environment variables (not `process.env`)
