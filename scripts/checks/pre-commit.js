#!/usr/bin/env node
// Pre-commit checks (run by .githooks/pre-commit). Fast: only staged files, plus the project's
// lint / typecheck / unit tests once they exist in package.json.
//
//   1. Forbidden files      .env, node_modules, build output, generated stress CSVs, files > 5 MB
//   2. Rule checks          scripts/checks/rules.js on staged files (secrets, architecture, security)
//   3. JSON validity        staged *.json
//   4. Markdown links       relative links in staged *.md must point to real files
//   5. Project scripts      npm run lint / typecheck / test:unit (only if defined)

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { checkFile } = require('./rules');

const ROOT = path.resolve(__dirname, '..', '..');
process.chdir(ROOT);
const MAX_BYTES = 5 * 1024 * 1024;

const staged = execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf8' })
  .split('\n').map(s => s.trim()).filter(Boolean);
if (!staged.length) process.exit(0);

const problems = [];
const add = (area, msg) => problems.push(`  ✗ [${area}] ${msg}`);

// 1. forbidden files
for (const f of staged) {
  if (/(^|\/)\.env(\.|$)/.test(f) && !f.endsWith('.env.example')) add('files', `${f} — env files hold secrets; commit .env.example only`);
  if (/(^|\/)(node_modules|dist|build|\.aws-sam|\.vercel|coverage)\//.test(f)) add('files', `${f} — generated output`);
  if (/^data\/stress\/.*\.csv$/.test(f)) add('files', `${f} — generated stress data; recreate with /generate-stress`);
  if (fs.existsSync(f) && fs.statSync(f).size > MAX_BYTES) add('files', `${f} — larger than 5 MB`);
}

// 2. rule checks
for (const f of staged) for (const v of checkFile(f)) add('rules', v);

// 3. JSON validity
for (const f of staged.filter(f => f.endsWith('.json') && fs.existsSync(f))) {
  try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { add('json', `${f} — ${e.message}`); }
}

// 4. markdown relative links
for (const f of staged.filter(f => f.endsWith('.md') && fs.existsSync(f))) {
  const text = fs.readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const link = m[1].split('#')[0];
    if (!link || /^(https?:|mailto:)/.test(link)) continue;
    const target = path.resolve(path.dirname(f), decodeURI(link));
    if (!fs.existsSync(target)) add('links', `${f} → ${m[1]} does not exist`);
  }
}

// 5. project scripts (lint / typecheck / fast tests), once the codebase has them
if (fs.existsSync('package.json')) {
  const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts || {};
  for (const s of ['lint', 'typecheck', 'test:unit']) {
    if (!scripts[s]) continue;
    process.stdout.write(`  … npm run ${s}\n`);
    const r = spawnSync('npm', ['run', '-s', s], { stdio: 'inherit', shell: true });
    if (r.status !== 0) add('scripts', `npm run ${s} failed`);
  }
}

if (problems.length) {
  console.error('\nPre-commit checks failed:\n' + problems.join('\n') + '\n\nFix these, then commit again. (Do not bypass with --no-verify.)\n');
  process.exit(1);
}
console.log(`  ✓ pre-commit: ${staged.length} staged file(s) passed`);
