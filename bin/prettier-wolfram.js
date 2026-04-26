#!/usr/bin/env node
// bin/prettier-wolfram.js
// Usage: prettier-wolfram lint [options] <glob...>

import { readFileSync } from 'fs';
import { globSync } from 'fs';
import { KernelBridge } from '../src/bridge/index.js';
import { runRules } from '../src/rules/index.js';
import { buildOffsetTable, addOffsets } from '../src/utils/offsets.js';

const [,, command, ...args] = process.argv;

if (command !== 'lint') {
  console.error('Usage: prettier-wolfram lint <glob...>');
  process.exit(1);
}

if (args.length === 0) {
  console.error('Error: provide at least one glob pattern');
  process.exit(1);
}

let lintRules = {};
try {
  lintRules = JSON.parse(process.env.WOLFRAM_LINT_RULES ?? '{}');
} catch {}

const bridge = new KernelBridge();
let totalDiagnostics = 0;

for (const pattern of args) {
  const files = globSync(pattern, { absolute: true });
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    try {
      const cst = await bridge.getCST(source, {});
      const table = buildOffsetTable(source);
      addOffsets(cst, table);
      const diagnostics = await runRules(cst, lintRules);

      for (const d of diagnostics) {
        const line = d.node?.source?.[0]?.[0] ?? '?';
        const col  = d.node?.source?.[0]?.[1] ?? '?';
        console.log(`${file}:${line}:${col}: ${d.level.toUpperCase()} [${d.rule}] ${d.message}`);
        totalDiagnostics++;
      }
    } catch (err) {
      console.error(`${file}: ERROR — ${err.message}`);
    }
  }
}

bridge.close();
process.exit(totalDiagnostics > 0 ? 1 : 0);
