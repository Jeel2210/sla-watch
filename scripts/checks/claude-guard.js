#!/usr/bin/env node
// Claude Code PreToolUse guard: stops actions that would bypass the project's checks.
// Reads the hook JSON on stdin; exit 2 = block (stderr is shown to Claude), exit 0 = allow.
//   Bash:        git commit/push with --no-verify, or disabling core.hooksPath
//   Write/Edit:  the sample fixtures in data/samples/ (test answer keys) and real .env files
let input = '';
process.stdin.on('data', d => (input += d)).on('end', () => {
  let j; try { j = JSON.parse(input); } catch { process.exit(0); }
  const tool = j.tool_name, ti = j.tool_input || {};
  const block = msg => { process.stderr.write(msg + '\n'); process.exit(2); };

  if (tool === 'Bash') {
    // look only at real git invocations: split on && || ; | and newlines, keep segments that start with "git"
    const gitCmds = String(ti.command || '').split(/&&|\|\||[;|\n]/).map(s => s.trim()).filter(s => /^git\s/.test(s));
    for (const g of gitCmds) {
      if (/^git\s+(commit|push)\b/.test(g) && /(\s--no-verify\b|\s-n\b)/.test(g))
        block('Blocked: --no-verify skips the project checks (RULES.md → Git). Fix the failing check instead.');
      if (/^git\s+config\b.*core\.hooksPath/.test(g) && !/core\.hooksPath\s+\.githooks\s*$/.test(g))
        block('Blocked: core.hooksPath must stay ".githooks" so the checks keep running.');
    }
  }

  if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit') {
    const f = String(ti.file_path || '').replace(/\\/g, '/');
    if (/\/data\/samples\//.test(f))
      block('Blocked: data/samples/ holds the original assignment files and test answer keys — never edit them.');
    if (/(^|\/)\.env(\.[^/]*)?$/.test(f) && !f.endsWith('.env.example'))
      block('Blocked: .env files hold secrets. Put variable names in .env.example; values go in SAM params / Vercel env.');
  }
  process.exit(0);
});
