#!/usr/bin/env node
// Stress-test data generator for the SLA monitoring dashboard.
//
// Produces CSVs in the same shape (and with the same kinds of mess) as the
// provided monitoring_checks_*.csv files, but with many more services/days so
// the upload flow, function, DB and dashboard can be pushed until they break.
//
// Usage:
//   node .claude/commands/generate-stress.js                      # small, medium, large, chaos
//   node .claude/commands/generate-stress.js --preset xl          # one preset
//   node .claude/commands/generate-stress.js --services 40 --days 60 --seed 7 --out my.csv
//
// Mess reproduced from the originals (rates measured on the sample files):
//   - rows shuffled, CRLF line endings
//   - ~1.5% timestamps as epoch seconds, ~0.7% as +05:30 offset ISO
//   - ~7.5% duplicate checks from a second agent (same svc+timestamp)
//   - ~0.15% exact duplicate rows
//   - ~1.2% empty latency, a few negative latencies, a few status 999
//   - some services report latency in seconds ("s") instead of ms
//   - ~0.3% missing checks (gaps), scattered 5xx, multi-hour 5xx incidents

const fs = require('fs');
const path = require('path');

const PRESETS = {
  small:  { services: 10,  days: 14,  seed: 11 },
  medium: { services: 25,  days: 30,  seed: 22 },
  large:  { services: 50,  days: 90,  seed: 33 },
  xl:     { services: 100, days: 180, seed: 44 },
  // Beyond the original mess: long names, many agents/regions, 4xx codes,
  // whitespace-padded fields, mixed-case units. For shaking out UI layout
  // and parser assumptions.
  chaos:  { services: 30,  days: 30,  seed: 55, chaos: true },
};
const DEFAULT_PRESETS = ['small', 'medium', 'large', 'chaos'];

const START = Date.UTC(2025, 0, 1); // 2025-01-01
const STEP = 15 * 60 * 1000;
const PER_DAY = 96;

// Deterministic PRNG (mulberry32) so a seed always yields the same file.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DOMAINS = ['auth', 'payments', 'search', 'reports', 'notify', 'billing', 'orders',
  'inventory', 'shipping', 'catalog', 'users', 'profile', 'checkout', 'cart', 'pricing',
  'ledger', 'invoices', 'refunds', 'fraud', 'risk', 'kyc', 'audit', 'events', 'webhooks',
  'email', 'sms', 'push', 'media', 'uploads', 'thumbnails', 'geo', 'maps', 'routing',
  'tracking', 'analytics', 'metrics', 'logs', 'config', 'flags', 'secrets', 'sessions',
  'tokens', 'gateway', 'edge', 'cdn', 'cache', 'queue', 'scheduler', 'cron', 'export'];
const LONG_NAMES = [
  'international-cross-border-payments-reconciliation',
  'customer-identity-verification-and-onboarding-orchestrator',
  'legacy-mainframe-batch-settlement-bridge-adapter-v2',
];

function buildServices(n, r, chaos) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const base = DOMAINS[i % DOMAINS.length];
    const suffix = i < DOMAINS.length ? '' : `-${Math.floor(i / DOMAINS.length) + 1}`;
    let id = `svc-${base}${suffix}`;
    let name = `${base}${suffix}-${r() < 0.2 ? 'worker' : 'api'}`;
    if (chaos && i < LONG_NAMES.length) {
      id = `svc-${LONG_NAMES[i]}`;
      name = `${LONG_NAMES[i]}-api`;
    }
    out.push({
      id, name,
      unit: r() < 0.2 ? 's' : 'ms',     // like search-api in the originals
      base: 60 + Math.floor(r() * 700), // typical latency ms
      jitter: 0.1 + r() * 0.2,
    });
  }
  return out;
}

function makeIncidents(services, days, r) {
  // Roughly one incident per 3 service-weeks, 4-26 checkpoints long.
  const incidents = [];
  const count = Math.max(1, Math.round((services.length * days) / 21));
  for (let k = 0; k < count; k++) {
    const svc = services[Math.floor(r() * services.length)];
    const day = Math.floor(r() * days);
    const from = Math.floor(r() * 80);
    const to = Math.min(PER_DAY - 1, from + 4 + Math.floor(r() * 22));
    incidents.push({ svc: svc.id, day, from, to });
  }
  return incidents;
}

const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
function isoOffset(ms) {
  // Same instant expressed as +05:30 local time (ap-south-1 agents).
  return new Date(ms + 330 * 60000).toISOString().replace('.000Z', '+05:30');
}

function formatTs(ms, r) {
  const x = r();
  if (x < 0.015) return String(Math.floor(ms / 1000));
  if (x < 0.022) return isoOffset(ms);
  return iso(ms);
}

function latencyFor(svc, down, r, chaos) {
  if (r() < 0.012) return '';
  if (r() < 0.0002) return String(-Math.floor(50 + r() * 250));
  let ms = svc.base * (1 + (r() * 2 - 1) * svc.jitter);
  if (down) ms *= 2 + r() * 3;
  if (chaos && r() < 0.001) ms *= 40; // huge outliers for chart scales
  return svc.unit === 's' ? (ms / 1000).toFixed(3) : String(Math.round(ms));
}

function statusFor(down, r, chaos) {
  if (r() < 0.00007) return '999';
  if (down) return ['500', '502', '503'][Math.floor(r() * 3)];
  if (r() < 0.004) return ['500', '502', '503'][Math.floor(r() * 3)];
  if (chaos && r() < 0.003) return ['404', '429', '401'][Math.floor(r() * 3)];
  return '200';
}

function generate({ services: nSvc, days, seed, chaos = false }, outFile) {
  const r = rng(seed);
  const services = buildServices(nSvc, r, chaos);
  const incidents = makeIncidents(services, days, r);
  const downSet = new Set();
  for (const inc of incidents)
    for (let c = inc.from; c <= inc.to; c++) downSet.add(`${inc.svc}|${inc.day}|${c}`);

  const agents = chaos ? ['agent-1', 'agent-2', 'agent-3'] : ['agent-1', 'agent-2'];
  const regions = chaos ? ['ap-south-1', 'us-east-1', 'eu-west-1', 'ap-southeast-2'] : ['ap-south-1'];

  const rows = [];
  for (const svc of services) {
    for (let d = 0; d < days; d++) {
      for (let c = 0; c < PER_DAY; c++) {
        if (r() < 0.003) continue; // gap
        const ms = START + (d * PER_DAY + c) * STEP;
        const down = downSet.has(`${svc.id}|${d}|${c}`);
        const status = statusFor(down, r, chaos);
        const region = regions[Math.floor(r() * regions.length)];
        const mk = (agent) => {
          let unit = svc.unit;
          let name = svc.name;
          if (chaos && r() < 0.01) unit = unit.toUpperCase();
          if (chaos && r() < 0.005) name = ` ${name} `;
          return [svc.id, name, formatTs(ms, r), status, latencyFor(svc, down, r, chaos),
            unit, agent, region].join(',');
        };
        rows.push(mk('agent-1'));
        if (r() < 0.075) rows.push(mk(agents[1 + Math.floor(r() * (agents.length - 1))]));
        if (r() < 0.0015) rows.push(rows[rows.length - 1]);
      }
    }
  }

  // Every original file carries at least one bogus 999 status; guarantee it.
  if (!rows.some((row) => row.split(',')[3] === '999')) {
    const i = Math.floor(r() * rows.length);
    const f = rows[i].split(',');
    f[3] = '999';
    rows[i] = f.join(',');
  }

  // Fisher-Yates shuffle: the originals are not time-ordered.
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }

  const header = 'service_id,service_name,timestamp,status_code,latency,latency_unit,agent,region';
  const fd = fs.openSync(outFile, 'w');
  fs.writeSync(fd, header + '\r\n');
  const CHUNK = 20000;
  for (let i = 0; i < rows.length; i += CHUNK)
    fs.writeSync(fd, rows.slice(i, i + CHUNK).join('\r\n') + '\r\n');
  fs.closeSync(fd);

  const start = iso(START).slice(0, 10);
  const log = {
    days, start, services: services.length, rows: rows.length,
    incidents: Object.fromEntries(incidents.map((inc, i) => [
      `#${i + 1} ${inc.svc} day ${inc.day}`,
      `check-points ${inc.from}-${inc.to} (~${iso(START + inc.from * STEP).slice(11, 16)}-${iso(START + inc.to * STEP).slice(11, 16)} UTC)`,
    ])),
  };
  const size = fs.statSync(outFile).size;
  console.log(`${path.basename(outFile)}: ${nSvc} services x ${days} days, ` +
    `${rows.length.toLocaleString()} rows, ${(size / 1048576).toFixed(1)} MB, ${incidents.length} incidents`);
  return log;
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--chaos') a.chaos = true;
    else if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[++i];
  }
  return a;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.join(__dirname, '..', '..', 'data', 'stress'); // all project data lives under data/
  fs.mkdirSync(outDir, { recursive: true });
  const incidentLog = {};

  if (args.services || args.days) {
    const cfg = {
      services: Number(args.services || 5),
      days: Number(args.days || 9),
      seed: Number(args.seed || 1),
      chaos: !!args.chaos,
    };
    const file = args.out || path.join(outDir,
      `stress_${cfg.services}svc_${cfg.days}d_seed${cfg.seed}${cfg.chaos ? '_chaos' : ''}.csv`);
    incidentLog[path.basename(file)] = generate(cfg, file);
  } else {
    const names = args.preset ? args.preset.split(',') : DEFAULT_PRESETS;
    for (const name of names) {
      const cfg = PRESETS[name];
      if (!cfg) throw new Error(`Unknown preset "${name}". Options: ${Object.keys(PRESETS).join(', ')}`);
      const file = path.join(outDir, `stress_${name}_${cfg.services}svc_${cfg.days}d_seed${cfg.seed}.csv`);
      incidentLog[path.basename(file)] = generate(cfg, file);
    }
  }

  const logFile = path.join(outDir, 'stress_incident_log.json');
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(logFile, 'utf8')); } catch {}
  fs.writeFileSync(logFile, JSON.stringify({ ...existing, ...incidentLog }, null, 2));
  console.log(`Incident ground truth -> ${path.relative(process.cwd(), logFile)}`);
}

main();
