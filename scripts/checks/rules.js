#!/usr/bin/env node
// Architecture + security rule checks for a single file (RULES.md / SECURITY.md).
// Used by the git pre-commit hook (on staged files) and by the Claude Code PostToolUse hook (on edited files).
//
//   node scripts/checks/rules.js <file> [<file> ...]     → exit 1 and print violations
//   echo '<hook json>' | node scripts/checks/rules.js --hook   → exit 2 with violations on stderr (Claude fixes them)

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const rel = f => path.relative(ROOT, path.resolve(f)).split(path.sep).join('/');
const isCode = f => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f);

// Each rule: which files it applies to, the pattern that breaks it, and the message (with the rule's source).
const RULES = [
  { name: 'secret', applies: f => !f.startsWith('scripts/checks/') && !f.endsWith('.env.example'),
    test: /postgres(ql)?:\/\/[^\s'"`]*:[^\s'"`@]+@|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    msg: 'Looks like a secret (DB URL with password, AWS key or private key). Secrets live only in SAM params / Vercel env (SECURITY.md T7).' },
  { name: 'core-purity', applies: f => f.startsWith('packages/core/') && isCode(f),
    test: /from ['"](pg|@neondatabase\/[^'"]+|react|react-dom|@aws-sdk\/[^'"]+|aws-sdk)['"]|\bfetch\(|Date\.now\(\)/,
    msg: 'packages/core must stay pure: no db, React, AWS SDK, fetch or Date.now() (RULES.md → Architecture boundaries).' },
  { name: 'fetch-outside-api', applies: f => f.startsWith('apps/web/src/') && !f.startsWith('apps/web/src/api/') && isCode(f),
    test: /\bfetch\(/,
    msg: 'Only apps/web/src/api may call fetch; use a TanStack Query hook (RULES.md → Frontend).' },
  { name: 'raw-colour', applies: f => f.startsWith('apps/web/src/') && !f.endsWith('styles/tokens.css') && /\.(tsx|ts|css)$/.test(f),
    test: /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b(?![\w-])/,
    msg: 'Raw hex colour — use a token from styles/tokens.css (RULES.md → Frontend, DESIGN.md → Colors).' },
  { name: 'inner-html', applies: f => f.startsWith('apps/') && isCode(f),
    test: /dangerouslySetInnerHTML|\.innerHTML\s*=/,
    msg: 'Never render data as HTML — CSV values are untrusted (SECURITY.md T5).' },
  { name: 'sql-concat', applies: f => f.startsWith('services/') && isCode(f),
    test: /(query|sql)\s*\(\s*`[^`]*\$\{|(SELECT|INSERT|UPDATE|DELETE)[^;'"`]*['"`]\s*\+/i,
    msg: 'SQL built from strings — use parameterised queries (RULES.md → Backend, SECURITY.md T4).' },
  { name: 'spread-minmax', applies: isCode,
    test: /Math\.(max|min)\(\s*\.\.\./,
    msg: 'Math.max/min(...array) overflows the stack on large uploads — use a loop (RULES.md → Backend).' },
  { name: 'eval', applies: isCode,
    test: /\beval\(|new Function\(/,
    msg: 'eval / new Function is not allowed (SECURITY.md → Web app).' },
  { name: 'only-test', applies: f => /\.(test|spec)\.(ts|tsx|js)$/.test(f),
    test: /\b(it|test|describe)\.only\(/,
    msg: '.only left in a test — it silently skips the rest of the suite.' },
];

function checkFile(file) {
  const r = rel(file);
  if (r.startsWith('..') || path.isAbsolute(r)) return []; // outside the repo (e.g. scratch files)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return [];
  if (r.startsWith('data/') || r.includes('node_modules/') || r.startsWith('dist/')) return [];
  const text = fs.readFileSync(file, 'utf8');
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const rule of RULES) {
      if (!rule.applies(r)) continue;
      if (/rules-ignore/.test(line)) continue; // escape hatch: must be explained in the same line
      if (rule.test.test(line)) out.push(`${r}:${i + 1}  [${rule.name}] ${rule.msg}`);
    }
  });
  return out;
}

module.exports = { checkFile };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--hook') {
    let input = '';
    process.stdin.on('data', d => (input += d)).on('end', () => {
      let file;
      try { const j = JSON.parse(input); file = j.tool_input?.file_path || j.tool_response?.filePath; } catch { process.exit(0); }
      if (!file) process.exit(0);
      const v = checkFile(file);
      if (v.length) { process.stderr.write('Rule check failed — fix before continuing:\n' + v.join('\n') + '\n'); process.exit(2); }
      process.exit(0);
    });
  } else {
    const v = args.flatMap(checkFile);
    if (v.length) { console.error(v.join('\n')); process.exit(1); }
  }
}
