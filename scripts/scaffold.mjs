#!/usr/bin/env node

/**
 * Psy Protocol Template Scaffolding Tool
 * 
 * Safely copies a template directory to a target destination while strictly
 * stripping local configuration markers and build artifacts:
 * - Removes .issuer_configured (ensures destination requires explicit configuration)
 * - Removes target/ build artifacts
 * - Removes node_modules/
 * - Removes .DS_Store
 * - Prevents recursive infinite directory creation via canonical symlink-aware path containment checks
 * 
 * Usage:
 *   node scripts/scaffold.mjs <token|nft|dapp|source_dir> <target_directory>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const validTemplates = ['token', 'nft', 'dapp'];

function printUsage() {
  console.log(`
Psy Protocol Template Scaffolding Tool

Usage:
  node scripts/scaffold.mjs <token|nft|dapp|source_dir> <target_directory>

Examples:
  node scripts/scaffold.mjs token my_new_token
  node scripts/scaffold.mjs nft my_new_nft
  node scripts/scaffold.mjs dapp my_new_dapp
  node scripts/scaffold.mjs ./custom_template ./my_new_project
`);
}

/**
 * Resolves the canonical real path for a path that may not exist yet,
 * by resolving realpath on the closest existing ancestor directory and
 * appending the remaining non-existent subpath components.
 * This ensures symlinks in any existing part of the path are fully expanded.
 */
function resolveCanonicalPath(inputPath) {
  const absolutePath = path.resolve(inputPath);
  if (fs.existsSync(absolutePath)) {
    return fs.realpathSync(absolutePath);
  }

  let current = absolutePath;
  const nonExistentSegments = [];

  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break; // reached root
    nonExistentSegments.unshift(path.basename(current));
    current = parent;
  }

  const realAncestor = fs.existsSync(current) ? fs.realpathSync(current) : current;
  return path.join(realAncestor, ...nonExistentSegments);
}

const args = process.argv.slice(2);
if (args.length < 2 || args.includes('-h') || args.includes('--help')) {
  printUsage();
  process.exit(args.length === 0 ? 0 : 1);
}

const sourceArg = args[0];
const targetArg = args[1];

// 1. Resolve source directory
let sourceDir;
if (validTemplates.includes(sourceArg)) {
  sourceDir = path.join(REPO_ROOT, sourceArg);
} else {
  sourceDir = path.resolve(process.cwd(), sourceArg);
}

if (!fs.existsSync(sourceDir)) {
  console.error(`✖ Error: Source template directory not found: ${sourceDir}`);
  process.exit(1);
}

if (!fs.statSync(sourceDir).isDirectory()) {
  console.error(`✖ Error: Source path is not a directory: ${sourceDir}`);
  process.exit(1);
}

// 2. Canonical realpath resolution and symlink-aware path containment verification
const resolvedSource = path.resolve(sourceDir);
const resolvedTarget = path.resolve(process.cwd(), targetArg);

const canonicalSource = resolveCanonicalPath(resolvedSource);
const canonicalTarget = resolveCanonicalPath(resolvedTarget);

if (canonicalSource === canonicalTarget) {
  console.error(`✖ Error: Target directory cannot be identical to source directory: ${resolvedTarget}`);
  process.exit(1);
}

const relToSource = path.relative(canonicalSource, canonicalTarget);
if (!relToSource.startsWith('..') && !path.isAbsolute(relToSource)) {
  console.error(`✖ Error: Target directory '${resolvedTarget}' (canonical: '${canonicalTarget}') cannot be located inside source directory '${resolvedSource}' (canonical: '${canonicalSource}').`);
  process.exit(1);
}

const relToTarget = path.relative(canonicalTarget, canonicalSource);
if (!relToTarget.startsWith('..') && !path.isAbsolute(relToTarget)) {
  console.error(`✖ Error: Source directory '${resolvedSource}' (canonical: '${canonicalSource}') cannot be located inside target directory '${resolvedTarget}' (canonical: '${canonicalTarget}').`);
  process.exit(1);
}

if (fs.existsSync(resolvedTarget)) {
  console.error(`✖ Error: Target directory already exists: ${resolvedTarget}`);
  process.exit(1);
}

// 3. Copy recursively excluding forbidden distribution artifacts
const STRIP_FILES = new Set(['.issuer_configured', '.DS_Store']);
const STRIP_DIRS = new Set(['node_modules', 'target', '.tsbuild', 'dist']);

function copyDirClean(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (STRIP_DIRS.has(entry.name)) continue;
      copyDirClean(srcPath, destPath);
    } else if (entry.isFile()) {
      if (STRIP_FILES.has(entry.name)) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log(`Scaffolding from '${sourceDir}' into '${resolvedTarget}'...`);
copyDirClean(canonicalSource, resolvedTarget);

// Double-check: ensure destination has no .issuer_configured anywhere
const destMarker = path.join(resolvedTarget, '.issuer_configured');
if (fs.existsSync(destMarker)) {
  fs.unlinkSync(destMarker);
}

console.log(`✔ Successfully scaffolded into ${resolvedTarget}.`);
console.log(`ℹ Notice: The new project is in an unconfigured state.`);
console.log(`  To configure and deploy, run:`);
console.log(`    cd ${path.relative(process.cwd(), resolvedTarget) || '.'}`);
console.log(`    npm run configure -- --issuer <YOUR_USER_ID>`);
console.log(`    npm run check:preflight`);
