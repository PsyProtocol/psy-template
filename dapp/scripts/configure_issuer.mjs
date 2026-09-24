#!/usr/bin/env node

/**
 * Psy Protocol Deployment Configuration Helper
 * 
 * Configures and validates the canonical ISSUER_USER_ID for smart contract deployments:
 * - Standalone Token template: src/main.psy
 * - Standalone NFT template: src/main.psy
 * - Standalone dApp template: contract/src/main.psy
 * - Workspace Root: token/src/main.psy, dapp/contract/src/main.psy, nft/src/main.psy
 * 
 * Usage:
 *   node scripts/configure_issuer.mjs --issuer <USER_ID>   Set canonical issuer user ID (with best-effort rollback)
 *   node scripts/configure_issuer.mjs --check              Check current configuration status
 *   node scripts/configure_issuer.mjs --preflight          Strict check: fails if ISSUER_USER_ID is not explicitly configured
 *   node scripts/configure_issuer.mjs --reset              Reset/remove configuration marker
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '..');

const MAX_USER_ID = 16777215n; // outbox arrays are indexed by 24-bit user IDs
const ISSUER_CONST_REGEX = /pub\s+const\s+ISSUER_USER_ID\s*:\s*Felt\s*=\s*(\d+)\s*;/;
const STATE_FILENAME = '.issuer_configured';

function findTargetFiles() {
  // Case 1: Workspace root containing all three sub-projects
  const rootTargets = [
    path.join(BASE_DIR, 'token', 'src', 'main.psy'),
    path.join(BASE_DIR, 'dapp', 'contract', 'src', 'main.psy'),
    path.join(BASE_DIR, 'nft', 'src', 'main.psy'),
  ];
  if (rootTargets.every(f => fs.existsSync(f))) {
    return rootTargets;
  }

  // Case 2: Standalone Token or NFT project (src/main.psy)
  const singleContract = path.join(BASE_DIR, 'src', 'main.psy');
  if (fs.existsSync(singleContract)) {
    return [singleContract];
  }

  // Case 3: Standalone dApp project (contract/src/main.psy)
  const dappContract = path.join(BASE_DIR, 'contract', 'src', 'main.psy');
  if (fs.existsSync(dappContract)) {
    return [dappContract];
  }

  throw new Error(`Could not find Psy contract source files in ${BASE_DIR}`);
}

function getStateFilePath() {
  return path.join(BASE_DIR, STATE_FILENAME);
}

/**
 * Loads configuration state strictly from the current project directory (BASE_DIR).
 * Notice: No parent directory fallback is performed, preventing subprojects from
 * inheriting arbitrary configuration markers from parent or surrounding directories.
 */
function loadConfigurationState() {
  const primaryPath = getStateFilePath();
  if (fs.existsSync(primaryPath)) {
    try {
      return { path: primaryPath, data: JSON.parse(fs.readFileSync(primaryPath, 'utf-8')) };
    } catch {
      return null;
    }
  }
  return null;
}

function readCurrentIssuer(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Target file not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(ISSUER_CONST_REGEX);
  if (!match) {
    throw new Error(`Could not find ISSUER_USER_ID definition in ${filePath}`);
  }
  return match[1];
}

function checkConfig({ strict = false } = {}) {
  const targetFiles = findTargetFiles();
  console.log('Checking ISSUER_USER_ID configuration across target contract(s)...');
  const ids = [];
  let allReadable = true;

  for (const file of targetFiles) {
    const relPath = path.relative(BASE_DIR, file);
    try {
      const currentId = readCurrentIssuer(file);
      ids.push({ relPath, currentId });
      console.log(`  ✔ [${relPath}]: ISSUER_USER_ID = ${currentId}`);
    } catch (err) {
      console.error(`  ✖ [${relPath}]: ${err.message}`);
      allReadable = false;
    }
  }

  if (!allReadable) {
    process.exit(1);
  }

  const firstId = ids[0].currentId;
  const isUniform = ids.every(item => item.currentId === firstId);
  if (!isUniform) {
    console.error('\n✖ Configuration Mismatch: Target contract templates do not share the same ISSUER_USER_ID.');
    process.exit(1);
  }

  if (BigInt(firstId) < 1n || BigInt(firstId) > MAX_USER_ID) {
    console.error(`✖ ISSUER_USER_ID must be in 1..${MAX_USER_ID}; larger IDs cannot use the 24-bit outbox.`);
    process.exit(1);
  }

  console.log(`\n✔ Configuration is uniform: Canonical ISSUER_USER_ID = ${firstId}`);

  const stateRecord = loadConfigurationState();

  if (strict) {
    if (!stateRecord || !stateRecord.data || typeof stateRecord.data.issuer_user_id === 'undefined') {
      console.error('\n✖ Deployment Preflight FAILED: ISSUER_USER_ID has not been explicitly configured.');
      console.error(`  Target contracts contain ISSUER_USER_ID = ${firstId}, but no explicit configuration record (${STATE_FILENAME}) was found in ${BASE_DIR}.`);
      console.error('  Deploying with an unconfirmed user ID will cause the contract to reject initialization');
      console.error('  and minting from your real account, permanently bricking the deployment.');
      console.error('  Fix: Run `npm run configure -- --issuer <YOUR_USER_ID>` with your real on-chain user ID.');
      console.error('  (Note: Even if your on-chain user ID is 5, you must run configure explicitly to confirm it).');
      process.exit(1);
    }

    const recordedId = String(stateRecord.data.issuer_user_id);
    if (recordedId !== firstId) {
      console.error('\n✖ Deployment Preflight FAILED: Configuration state mismatch.');
      console.error(`  Target contracts have ISSUER_USER_ID = ${firstId}, but ${path.basename(stateRecord.path)} records ${recordedId}.`);
      console.error('  Fix: Re-run `npm run configure -- --issuer <YOUR_USER_ID>`.');
      process.exit(1);
    }

    console.log(`✔ Deployment Preflight PASSED: Explicitly configured ISSUER_USER_ID = ${firstId}.`);
    console.log(`  (Record: confirmed at ${stateRecord.data.configured_at || 'unknown'})`);
    console.log('  ⚠ Toolchain Boundary Notice: This npm preflight check verifies local file configuration.');
    console.log('    - It CANNOT verify whether the private key used for deployment actually owns user ID ' + firstId + ' on-chain.');
    console.log('    - Executing `psyup build` or `psyup deploy` directly in terminal bypasses this npm preflight script.');
    console.log('    - Mandatory deployment verification is not yet closed under the current toolchain.');
  } else {
    if (stateRecord && stateRecord.data && String(stateRecord.data.issuer_user_id) === firstId) {
      console.log(`✔ Status: ISSUER_USER_ID = ${firstId} is explicitly configured (recorded at ${stateRecord.data.configured_at}).`);
    } else {
      console.log(`ℹ Notice: ISSUER_USER_ID = ${firstId} has not been explicitly confirmed via \`npm run configure\`.`);
      console.log('  Before deploying to live networks, run: npm run configure -- --issuer <YOUR_USER_ID>');
    }
  }
}

/**
 * Sequential update with temporary file rename and best-effort rollback:
 * Reads all target files, applies replacements in memory, and writes using
 * temporary files + renameSync. If any step fails, restores previous content.
 * (Note: Multi-file writes in Node.js cannot be guaranteed atomic across the filesystem).
 */
function setIssuer(rawId) {
  let idBigInt;
  try {
    idBigInt = BigInt(rawId);
  } catch {
    console.error(`✖ Error: Invalid user ID '${rawId}'. Must be a positive integer.`);
    process.exit(1);
  }

  if (idBigInt <= 0n || idBigInt > MAX_USER_ID) {
    console.error(`✖ Error: User ID must be in range 1..${MAX_USER_ID}.`);
    process.exit(1);
  }

  const newIdStr = idBigInt.toString();
  const targetFiles = findTargetFiles();
  console.log(`Configuring canonical ISSUER_USER_ID to ${newIdStr}...`);

  // Phase 1: Read all and prepare in-memory updates
  const backups = new Map();
  const updates = new Map();

  for (const file of targetFiles) {
    const relPath = path.relative(BASE_DIR, file);
    const content = fs.readFileSync(file, 'utf-8');
    if (!ISSUER_CONST_REGEX.test(content)) {
      console.error(`✖ Error: Could not find ISSUER_USER_ID in ${relPath}. Aborting without changes.`);
      process.exit(1);
    }
    backups.set(file, content);
    const updated = content.replace(ISSUER_CONST_REGEX, `pub const ISSUER_USER_ID: Felt = ${newIdStr};`);
    updates.set(file, updated);
  }

  // Phase 2: Safe write via temporary files with best-effort rollback
  const writtenFiles = [];
  const tempFilesToClean = [];

  try {
    for (const [file, content] of updates.entries()) {
      const dir = path.dirname(file);
      const tmpFile = path.join(dir, `.main.psy.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`);
      tempFilesToClean.push(tmpFile);
      fs.writeFileSync(tmpFile, content, 'utf-8');
      fs.renameSync(tmpFile, file);
      writtenFiles.push(file);
      console.log(`  ✔ Updated ${path.relative(BASE_DIR, file)}`);
    }
  } catch (err) {
    console.error(`✖ Write error: ${err.message}. Initiating best-effort rollback...`);
    for (const tmp of tempFilesToClean) {
      if (fs.existsSync(tmp)) {
        try { fs.unlinkSync(tmp); } catch {}
      }
    }
    for (const file of writtenFiles) {
      try {
        fs.writeFileSync(file, backups.get(file), 'utf-8');
        console.log(`  ↺ Restored ${path.relative(BASE_DIR, file)}`);
      } catch (rollbackErr) {
        console.error(`  ✖ Critical: Failed to restore ${file}: ${rollbackErr.message}`);
      }
    }
    process.exit(1);
  }

  // Phase 3: Record explicit configuration state strictly in the local project BASE_DIR
  const configState = {
    issuer_user_id: newIdStr,
    configured_at: new Date().toISOString(),
    configured_files: targetFiles.map(f => path.relative(BASE_DIR, f)),
  };
  const stateJson = JSON.stringify(configState, null, 2) + '\n';
  const markerPath = getStateFilePath();

  try {
    fs.writeFileSync(markerPath, stateJson, 'utf-8');
    console.log(`  ✔ Recorded state in ${STATE_FILENAME}`);
  } catch (markerErr) {
    console.warn(`  ⚠ Warning: Could not write state marker ${markerPath}: ${markerErr.message}`);
  }

  console.log(`\n✔ Successfully configured ISSUER_USER_ID to ${newIdStr}.`);
}

function resetConfig() {
  const markerPath = getStateFilePath();
  if (fs.existsSync(markerPath)) {
    fs.unlinkSync(markerPath);
    console.log(`✔ Removed configuration marker ${STATE_FILENAME}`);
  } else {
    console.log(`ℹ No configuration marker ${STATE_FILENAME} found in ${BASE_DIR}.`);
  }
}

function printUsage() {
  console.log(`
Psy Protocol Contract Issuer Configuration Tool

Usage:
  node scripts/configure_issuer.mjs --issuer <USER_ID>   Set canonical issuer user ID (with best-effort rollback)
  node scripts/configure_issuer.mjs --check              Check current configuration status
  node scripts/configure_issuer.mjs --preflight          Strict check: fails if ISSUER_USER_ID is not explicitly configured
  node scripts/configure_issuer.mjs --reset              Reset/remove configuration marker
`);
}

// CLI entrypoint
const args = process.argv.slice(2);
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  printUsage();
  process.exit(0);
}

if (args.includes('--preflight') || (args.includes('--check') && args.includes('--strict'))) {
  checkConfig({ strict: true });
} else if (args.includes('--check')) {
  checkConfig({ strict: false });
} else if (args.includes('--reset') || args.includes('--clean')) {
  resetConfig();
} else if (args.includes('--issuer')) {
  const idx = args.indexOf('--issuer');
  const val = args[idx + 1];
  if (!val || val.startsWith('-')) {
    console.error('✖ Error: Missing value for --issuer.');
    printUsage();
    process.exit(1);
  }
  setIssuer(val);
} else {
  console.error(`✖ Unknown argument(s): ${args.join(' ')}`);
  printUsage();
  process.exit(1);
}
