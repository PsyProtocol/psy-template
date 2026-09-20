#!/usr/bin/env node
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const FORBIDDEN = [
  'E' + 'VM',
  'E' + 'thereum',
  'E' + 'RC-20',
  'E' + 'RC-721',
  'S' + 'olana',
  'S' + 'PL',
  'S' + 'ui',
  'A' + 'ptos',
  'M' + 'ove',
  'O' + 'penZeppelin'
];

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'target', 'dist', 'scripts', '.github']);

function scan(dir) {
  let errors = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    const st = statSync(fullPath);
    if (st.isDirectory()) {
      errors = errors.concat(scan(fullPath));
    } else if (st.isFile()) {
      if (entry === 'package.json') continue;
      const content = readFileSync(fullPath, 'utf-8');
      for (const word of FORBIDDEN) {
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(content)) {
          errors.push(`Found forbidden competitor reference '${word}' in ${fullPath}`);
        }
      }
    }
  }
  return errors;
}

const violations = scan(REPO_ROOT);
if (violations.length > 0) {
  console.error('Audit failed! Found competitor references:');
  violations.forEach(v => console.error(' - ' + v));
  process.exit(1);
} else {
  console.log('\x1b[32m✔ Audit passed: Zero competitor references found across all source files and documents.\x1b[0m');
}
