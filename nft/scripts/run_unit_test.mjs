#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = dirname(dirname(fileURLToPath(import.meta.url)));
const kind = basename(project);
const source = readFileSync(join(project, 'src/main.psy'), 'utf8');
const cases = readFileSync(join(project, `tests/${kind}_unit_cases.psy`), 'utf8');

// The live NFT artifact is .psy.rs. A green legacy dargo suite must also
// prove that the staging source compiles with the selected v3 CLI.
execFileSync(process.execPath, [join(project, 'scripts/build_v3.mjs')],
  { cwd: project, stdio: 'inherit' });

function replaceOnce(input, pattern, replacement, name) {
  const matches = input.match(new RegExp(pattern.source, 'g'));
  if (matches?.length !== 1) throw new Error(`Expected one ${name} in production source, found ${matches?.length ?? 0}`);
  return input.replace(pattern, replacement);
}

// dargo's single-user test harness fixes the caller to user 5 and does not let tests
// set the mock deployer key. Derive this legacy compatibility fixture from its
// current source on every run; keep the harness substitutions explicit.
let fixture = replaceOnce(source, /pub const ISSUER_USER_ID: Felt = \d+;/,
  'pub const ISSUER_USER_ID: Felt = 5;', 'issuer constant');
fixture = replaceOnce(fixture,
  /fn assert_caller_is_deployer\(\) \{[\s\S]*?\n\}(?=\n\n#\[contract\])/,
  'fn assert_caller_is_deployer() {\n    assert(get_user_id() == 5, "test harness caller must be user 5");\n}',
  'deployer check');

if (kind === 'nft') {
  // dargo has no second registered user partition, so the legacy remote ACK
  // branch cannot execute in this harness.
  fixture = replaceOnce(fixture,
    /let mut acknowledged_claimed = prev_outbox\.nonce_claimed;\n        let local_in_flight = prev_outbox\.nonce_sent - prev_outbox\.nonce_claimed;\n        if local_in_flight >= 4 \{[\s\S]*?\n        \};/,
    'let acknowledged_claimed = prev_outbox.nonce_claimed;',
    'cross-partition ACK branch');
}

const temporary = mkdtempSync(join(tmpdir(), `psy-${kind}-test-`));
try {
  const file = join(temporary, `${kind}_unit_test.psy`);
  writeFileSync(file, `${fixture}\n\n${cases}\n`);
  execFileSync('dargo', ['test', '--file', file], { cwd: project, stdio: 'inherit' });

  const negativeCases = kind === 'nft' ? [
    {
      name: 'reject nonsequential mint',
      expected: 'local_id must match next sequential mint index',
      body: 'PsyNFTContractRef::set_collection_metadata(1, [0, 0, 0, 0]); PsyNFTContractRef::mint(0, 2, [0, 0, 0, 0]);',
    },
    {
      name: 'reject fifth unclaimed transfer',
      expected: 'FIFO outbox queue full',
      body: `PsyNFTContractRef::set_collection_metadata(1, [0, 0, 0, 0]);
        for i in 0u32..5u32 {
          let idx: Felt = i as Felt;
          PsyNFTContractRef::mint(idx, idx + 1, [1, 0, 0, 0]);
        }
        for i in 0u32..4u32 { PsyNFTContractRef::transfer(i as Felt, 777); }
        PsyNFTContractRef::transfer(4, 777);`,
    },
    {
      name: 'reject mint after renounce',
      expected: 'minting has been renounced',
      body: 'PsyNFTContractRef::set_collection_metadata(1, [0, 0, 0, 0]); PsyNFTContractRef::renounce_mint_authority(); PsyNFTContractRef::mint(0, 1, [0, 0, 0, 0]);',
    },
    {
      name: 'reject metadata after renounce',
      expected: 'contract administration has been renounced',
      body: 'PsyNFTContractRef::set_collection_metadata(1, [0, 0, 0, 0]); PsyNFTContractRef::renounce_mint_authority(); PsyNFTContractRef::set_collection_metadata(2, [0, 0, 0, 0]);',
    },
    {
      name: 'reject out-of-range recipient',
      expected: 'recipient user_id exceeds outbox bounds',
      body: 'PsyNFTContractRef::transfer(0, 16777216);',
    },
  ] : [
    {
      name: 'default delegation gate',
      expected: 'delegation channel creation is gated',
      body: 'PsyTokenContractRef::open_delegation_channel(0, 888, 1);',
    },
    {
      name: 'reject mint authority transfer',
      expected: 'cannot transfer authority outside deployer partition',
      body: 'PsyTokenContractRef::set_metadata(1, 9); PsyTokenContractRef::set_mint_authority(777);',
    },
  ];

  for (const [index, item] of negativeCases.entries()) {
    const negativeFile = join(temporary, `${kind}_negative_${index}.psy`);
    writeFileSync(negativeFile, `${fixture}\n\n#[test]\nfn negative_case() { ${item.body} }\n`);
    const result = spawnSync('dargo', ['test', '--file', negativeFile], {
      cwd: project, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    if (result.error || result.status === 0 || !output.includes(`assertion failed: ${item.expected}`)) {
      throw new Error(`${item.name}: expected assertion "${item.expected}", got exit ${result.status}\n${output}`);
    }
    console.log(`PASS: ${item.name}`);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
