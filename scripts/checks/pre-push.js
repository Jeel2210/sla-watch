#!/usr/bin/env node
// Pre-push: the slower, full checks (RULES.md → Testing, SECURITY.md → Dependencies).
// Runs only the scripts that exist in package.json, so it grows with the codebase.
//   npm run test         full suite incl. fixture tests on data/samples (+ stress files if generated)
//   npm run build        web + api must build
//   npm audit            no high/critical vulnerabilities
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

process.chdir(path.resolve(__dirname, '..', '..'));
if (!fs.existsSync('package.json')) { console.log('  ✓ pre-push: no package.json yet — nothing to run'); process.exit(0); }

const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts || {};
const steps = [
  ...['test', 'build'].filter(s => scripts[s]).map(s => ['npm', ['run', '-s', s]]),
  ['npm', ['audit', '--audit-level=high', '--omit=dev']],
];
for (const [cmd, args] of steps) {
  console.log(`  … ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (r.status !== 0) { console.error(`\nPre-push failed at: ${cmd} ${args.join(' ')}\n`); process.exit(1); }
}
console.log('  ✓ pre-push: all checks passed');
