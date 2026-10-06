#!/usr/bin/env node

// Offline endpoint check for a new deployment of the 17-field orderbook.
// The coordinator remains responsible for cryptographic proof verification.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { proofPublicInputs } from './check_update_layout.mjs'

const EMPTY_ROOT = 'b768e4fc8b0b79f516c9da6ea83aa4b13c9a42c646c4c1f9e979ed3ee20855e3'
const NEW_ROOT = 'bbef9ad2b2c993db2102e7d6bf239d6a1b0483cc47be2911224bb53497189fd3'
const CODE_ROOT = 'df01d777a26090b5de37249d84981ce8df978dee6b67ba0c386a778aa0e3bbf2'
const DEPLOYER = 'db28c8685c3c73706d1957096a5fe162091a973c9a50949af575d2d3b2ea9a5b'
const VERIFIER = 'f2be754869220ac3bd68cfba16bbfdf50159cd667c3b445efb0adf807d175e9f'
const FIELDS = 17
const SLOTS = 2248146954
const HEIGHT = 32

function equal(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`)
}

function root(values) {
  return [...values].reverse().map(value => value.toString(16).padStart(16, '0')).join('')
}

export function checkDeployLayout(request) {
  const deploy = request?.deploy_contract
  if (!deploy) throw new Error('missing deploy_contract')
  equal(deploy.deployer, DEPLOYER, 'deployer')
  equal(deploy.code_root, CODE_ROOT, 'code root')
  equal(deploy.code_definition?.state_tree_height, HEIGHT, 'state tree height')
  equal(deploy.code_definition?.functions?.length, 7, 'method count')
  equal(request.layout_protocol_version, 1, 'layout version')
  equal(request.state_layout_root, NEW_ROOT, 'new layout root')
  equal(request.state_layout_field_count, FIELDS, 'new field count')
  equal(request.state_layout_slot_count, SLOTS, 'new slot count')
  equal(request.canonical_layout_verifier_fingerprint, VERIFIER, 'layout verifier')

  const pi = proofPublicInputs(request.canonical_layout_proof)
  equal(pi[0], 0n, 'proof deploy sentinel')
  equal(pi[1], 1n, 'proof layout version')
  equal(root(pi.slice(2, 6)), EMPTY_ROOT, 'proof empty layout root')
  equal(pi[6], 0n, 'proof old field count')
  equal(pi[7], 0n, 'proof old slot count')
  equal(root(pi.slice(8, 12)), NEW_ROOT, 'proof new layout root')
  equal(pi[12], BigInt(FIELDS), 'proof new field count')
  equal(pi[13], BigInt(SLOTS), 'proof new slot count')
  equal(pi[14], BigInt(FIELDS), 'proof appended field count')

  return { emptyRoot: EMPTY_ROOT, newRoot: NEW_ROOT, fields: FIELDS, slots: SLOTS,
    codeRoot: CODE_ROOT, deployer: DEPLOYER }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) {
    console.error('usage: node orderbook/check_deploy_layout.mjs <prepared-deploy-command.json>')
    process.exitCode = 2
  } else {
    readFile(process.argv[2], 'utf8').then(JSON.parse).then(checkDeployLayout)
      .then(result => console.log(JSON.stringify({ valid: true, ...result }, null, 2)))
      .catch(error => { console.error(`deploy layout check failed: ${error.message}`); process.exitCode = 1 })
  }
}
