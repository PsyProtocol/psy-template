import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { checkUpdateLayout } from './check_update_layout.mjs'

const oldAbi = JSON.parse(await readFile(fileURLToPath(new URL('./contract/deployed-62.abi.json', import.meta.url))))
const newAbi = JSON.parse(await readFile(fileURLToPath(new URL('./contract/target/abi.json', import.meta.url))))
const oldRoot = '2b8e491302cd3c68db18d829cb1b9c3b5325ef6f5e02368552686f88b547cbf3'
const newRoot = 'bbef9ad2b2c993db2102e7d6bf239d6a1b0483cc47be2911224bb53497189fd3'
const deployer = 'db28c8685c3c73706d1957096a5fe162091a973c9a50949af575d2d3b2ea9a5b'

function rootValues(root) {
  return Array.from({ length: 4 }, (_, index) => BigInt(`0x${root.slice((3 - index) * 16, (4 - index) * 16)}`))
}

function proof(old = oldRoot, oldFields = 14, oldSlots = 2197815306) {
  const values = [62n, 1n, ...rootValues(old), BigInt(oldFields), BigInt(oldSlots),
    ...rootValues(newRoot), 17n, 2248146954n,
    BigInt(17 - oldFields) + 18446744069414584321n, 0n, 0n, 0n, 0n]
  const bytes = Buffer.alloc(160)
  bytes.writeBigUInt64LE(19n, 0)
  values.forEach((value, index) => bytes.writeBigUInt64LE(value, 8 + index * 8))
  return [...bytes]
}

function input() {
  return {
    oldAbi,
    newAbi,
    chainLeaf: { state_layout_root: oldRoot, state_layout_field_count: 14,
      state_layout_slot_count: 2197815306, state_tree_height: 32, deployer },
    request: { contract_id: 62, deployer, layout_protocol_version: 1,
      state_layout_root: newRoot, state_layout_field_count: 17,
      state_layout_slot_count: 2248146954,
      code_definition: { state_tree_height: 32 }, canonical_layout_proof: proof() },
  }
}

test('accepts the contract 62 append-only 14 to 17 proof', () => {
  const result = checkUpdateLayout(input())
  assert.deepEqual([result.old.fields, result.next.fields], [14, 17])
})

test('rejects the 17 to 17 identity proof that could block the coordinator', () => {
  const value = input()
  value.request.canonical_layout_proof = proof(newRoot, 17, 2248146954)
  assert.throws(() => checkUpdateLayout(value), /proof old layout root/)
})

test('rejects a changed chain layout before another submission', () => {
  const value = input()
  value.chainLeaf.state_layout_root = newRoot
  assert.throws(() => checkUpdateLayout(value), /on-chain old layout root/)
})

test('rejects mutation of any existing ABI field', () => {
  const value = input()
  value.newAbi = structuredClone(newAbi)
  value.newAbi.contract.state_layout.fields[4].start_slot += 1
  assert.throws(() => checkUpdateLayout(value), /pinned new ABI layout/)
})

test('rejects a change to the appended ABI fields', () => {
  const value = input()
  value.newAbi = structuredClone(newAbi)
  value.newAbi.contract.state_layout.fields[16].type.name = 'OtherType'
  assert.throws(() => checkUpdateLayout(value), /pinned new ABI layout/)
})

test('rejects a request whose new endpoint differs from the compiled ABI', () => {
  const value = input()
  value.request.state_layout_slot_count -= 1
  assert.throws(() => checkUpdateLayout(value), /request new slot count/)
})
