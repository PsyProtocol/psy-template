#!/usr/bin/env node

// Read-only gate for the one-time contract 62 layout migration. This checks the
// request that will be submitted, rather than inferring safety from source code.
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const CONTRACT_ID = 62
const OLD_ROOT = '2b8e491302cd3c68db18d829cb1b9c3b5325ef6f5e02368552686f88b547cbf3'
const NEW_ROOT = 'bbef9ad2b2c993db2102e7d6bf239d6a1b0483cc47be2911224bb53497189fd3'
const OLD_LAYOUT_SHA256 = '578844c50836e2421a28264b9d22a9ce4e308e22385d5d9a081a2b9c8d7c6cb1'
const NEW_LAYOUT_SHA256 = '8f87ba18252da55255e90afa1a7813f6d462d10969d47f8042d71af1791359b9'
const OLD_ABI = join(here, 'contract/deployed-62.abi.json')
const NEW_ABI = join(here, 'contract/target/abi.json')
const DEFAULT_CLI = resolve(here, '../../psy-node/target/release/psy_user_cli')
const GOLDILOCKS_MODULUS = 18446744069414584321n

function fail(message) {
  throw new Error(message)
}

function equal(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${expected}, got ${actual}`)
}

function hexRoot(values) {
  return [...values].reverse().map(value => value.toString(16).padStart(16, '0')).join('')
}

export function proofPublicInputs(bytes) {
  if (!Array.isArray(bytes) || bytes.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
    fail('canonical_layout_proof must be a byte array')
  }
  const buffer = Buffer.from(bytes)
  // Bincode ProofWithPublicInputs ends with a Vec<F>: length u64 + 19 u64s.
  // This extracts endpoints; the coordinator verifies the proof cryptographically.
  if (buffer.length < 160 || buffer.readBigUInt64LE(buffer.length - 160) !== 19n) {
    fail('canonical_layout_proof does not end with 19 public inputs')
  }
  return Array.from({ length: 19 }, (_, index) =>
    buffer.readBigUInt64LE(buffer.length - 152 + index * 8) % GOLDILOCKS_MODULUS)
}

function layoutFromAbi(abi, label) {
  const layout = abi?.contract?.state_layout
  if (!layout || !Array.isArray(layout.fields) || layout.fields.length !== layout.field_count) {
    fail(`${label} has no valid contract.state_layout`)
  }
  return layout
}

function layoutDigest(layout) {
  return createHash('sha256').update(JSON.stringify(layout)).digest('hex')
}

function contractLeaf(result) {
  const leaf = result?.data?.Contract ?? result
  if (!leaf || typeof leaf !== 'object') fail('missing contract leaf')
  return leaf
}

export function checkUpdateLayout({ oldAbi, newAbi, request, chainLeaf }) {
  const oldLayout = layoutFromAbi(oldAbi, 'old ABI')
  const newLayout = layoutFromAbi(newAbi, 'new ABI')
  const leaf = contractLeaf(chainLeaf)

  equal(layoutDigest(oldLayout), OLD_LAYOUT_SHA256, 'pinned old ABI layout')
  equal(layoutDigest(newLayout), NEW_LAYOUT_SHA256, 'pinned new ABI layout')
  equal(oldAbi.contract.state_tree_height, newAbi.contract.state_tree_height, 'state tree height')
  equal(oldLayout.layout_version, newLayout.layout_version, 'layout version')
  equal(oldLayout.field_count, 14, 'old ABI field count')
  equal(newLayout.field_count, 17, 'new ABI field count')
  if (newLayout.slot_count <= oldLayout.slot_count) fail('new layout must append slots')
  for (let index = 0; index < oldLayout.fields.length; index++) {
    if (JSON.stringify(oldLayout.fields[index]) !== JSON.stringify(newLayout.fields[index])) {
      fail(`existing ABI field ${index + 1} changed; migration must be append-only`)
    }
  }
  equal(newLayout.fields.slice(14).map(field => field.name).join(','),
    'active_consumed_nonce,active_settled_psy_sent,active_settled_usdt_sent', 'appended fields')

  equal(leaf.state_layout_root, OLD_ROOT, 'on-chain old layout root')
  equal(leaf.state_layout_field_count, oldLayout.field_count, 'on-chain old field count')
  equal(leaf.state_layout_slot_count, oldLayout.slot_count, 'on-chain old slot count')
  equal(leaf.state_tree_height, oldAbi.contract.state_tree_height, 'on-chain state tree height')

  equal(request.contract_id, CONTRACT_ID, 'request contract ID')
  equal(request.deployer, leaf.deployer, 'request deployer')
  equal(request.layout_protocol_version, oldLayout.layout_version, 'request layout version')
  equal(request.state_layout_root, NEW_ROOT, 'request new layout root')
  equal(request.state_layout_field_count, newLayout.field_count, 'request new field count')
  equal(request.state_layout_slot_count, newLayout.slot_count, 'request new slot count')
  equal(request.code_definition?.state_tree_height, leaf.state_tree_height, 'request state tree height')

  const pi = proofPublicInputs(request.canonical_layout_proof)
  equal(pi[0], BigInt(CONTRACT_ID), 'proof contract ID')
  equal(pi[1], BigInt(oldLayout.layout_version), 'proof layout version')
  equal(hexRoot(pi.slice(2, 6)), OLD_ROOT, 'proof old layout root')
  equal(pi[6], BigInt(oldLayout.field_count), 'proof old field count')
  equal(pi[7], BigInt(oldLayout.slot_count), 'proof old slot count')
  equal(hexRoot(pi.slice(8, 12)), NEW_ROOT, 'proof new layout root')
  equal(pi[12], BigInt(newLayout.field_count), 'proof new field count')
  equal(pi[13], BigInt(newLayout.slot_count), 'proof new slot count')
  equal(pi[14], BigInt(newLayout.field_count - oldLayout.field_count), 'proof appended field count')

  return {
    contractId: CONTRACT_ID,
    old: { root: OLD_ROOT, fields: oldLayout.field_count, slots: oldLayout.slot_count },
    next: { root: NEW_ROOT, fields: newLayout.field_count, slots: newLayout.slot_count },
  }
}

function optionsFromArgv(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    if (!key?.startsWith('--') || !argv[index + 1]) fail(`invalid option ${key ?? ''}`)
    if (!['--request', '--chain-leaf', '--old-abi', '--new-abi', '--cli', '--rpc-config'].includes(key)) {
      fail(`unknown option ${key}`)
    }
    options[key.slice(2)] = argv[index + 1]
  }
  if (!options.request) fail('usage: node orderbook/check_update_layout.mjs --request <update-command.json> [--chain-leaf <saved-leaf.json> for offline check]')
  return options
}

async function liveLeaf(cli, rpcConfig) {
  const dir = await mkdtemp(join(tmpdir(), 'psy-orderbook-leaf-'))
  const output = join(dir, 'leaf.json')
  try {
    const args = ['get-contract-leaf-data', '--contract-id', String(CONTRACT_ID), '--result-file', output]
    if (rpcConfig) args.push('--rpc-config', rpcConfig)
    const result = spawnSync(cli, args, { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 })
    if (result.error) fail(`could not read live contract leaf: ${result.error.message}`)
    if (result.status !== 0) fail(`could not read live contract leaf: ${result.stderr.trim() || result.stdout.trim()}`)
    return JSON.parse(await readFile(output, 'utf8'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function main() {
  const options = optionsFromArgv(process.argv.slice(2))
  const [oldAbi, newAbi, request, chainLeaf] = await Promise.all([
    readFile(options['old-abi'] ?? OLD_ABI, 'utf8').then(JSON.parse),
    readFile(options['new-abi'] ?? NEW_ABI, 'utf8').then(JSON.parse),
    readFile(options.request, 'utf8').then(JSON.parse),
    options['chain-leaf']
      ? readFile(options['chain-leaf'], 'utf8').then(JSON.parse)
      : liveLeaf(options.cli ?? DEFAULT_CLI, options['rpc-config']),
  ])
  const result = checkUpdateLayout({ oldAbi, newAbi, request, chainLeaf })
  console.log(JSON.stringify({ ...result, mode: options['chain-leaf'] ? 'offline snapshot' : 'live chain', valid: true }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`layout check failed: ${error.message}`); process.exitCode = 1 })
}
