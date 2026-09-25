---
description: Generate stress-test CSVs (same mess as the sample files, more services/days) into data/stress/
argument-hint: "[preset: small | medium | large | xl | chaos] or [--services N --days N --seed N --out file.csv]"
allowed-tools: Bash(node .claude/commands/generate-stress.js:*), Bash(ls:*)
---

Generate stress-test data for the SLA dashboard with the project's generator script.

Arguments given: `$ARGUMENTS`

1. Build the command:
   - No arguments → `node .claude/commands/generate-stress.js` (writes small, medium, large and chaos).
   - A single preset word (`small`, `medium`, `large`, `xl`, `chaos`) → `node .claude/commands/generate-stress.js --preset <word>`.
   - Anything starting with `--` → pass it through as-is: `node .claude/commands/generate-stress.js $ARGUMENTS`.
2. Run it from the project root.
3. List what was written: `ls -la data/stress`.
4. Report back in a short table: file name, services, days, size. Mention that
   `data/stress/stress_incident_log.json` is the answer key for the injected incidents.

Presets (from `generate-stress.js` in this folder):

| Preset | Services | Days | Seed | Notes |
|---|---|---|---|---|
| small | 10 | 14 | 11 | |
| medium | 25 | 30 | 22 | |
| large | 50 | 90 | 33 | ≈ 33 MB, ≈ 464k rows |
| xl | 100 | 180 | 44 | very large; only generate on request |
| chaos | 30 | 30 | 55 | padded fields, upper-case units, 4xx codes, 3 agents, 4 regions, long names |

Do not commit `data/stress/*.csv` (see RULES.md → Git); the generator is deterministic, so the files can be recreated.
