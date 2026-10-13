#!/usr/bin/env node

import { readFile } from 'node:fs/promises'

async function loadLayout(path) {
  const abi = JSON.parse(await readFile(path, 'utf8'))
  const layout = abi?.contract?.state_layout
  if (!layout || !Array.isArray(layout.fields)) {
    throw new Error(`${path}: missing contract.state_layout.fields`)
  }
  return layout
}

function printLayout(label, layout) {
  console.log(`${label}: ${layout.field_count} fields, ${layout.slot_count} slots`)
  for (const field of layout.fields) {
    console.log(`  ${field.field_id}: ${field.name} @ ${field.start_slot} (${field.slot_count} slots)`)
  }
}

const paths = process.argv.slice(2)
if (paths.length < 1 || paths.length > 2) {
  console.error('Usage: node scripts/inspect_abi_layout.mjs <old-abi.json> [new-abi.json]')
  process.exitCode = 2
} else {
  try {
    const oldLayout = await loadLayout(paths[0])
    printLayout(paths[0], oldLayout)

    if (paths[1]) {
      const newLayout = await loadLayout(paths[1])
      printLayout(paths[1], newLayout)
      const unchangedPrefix = oldLayout.fields.every((field, index) => {
        const next = newLayout.fields[index]
        return next && field.field_id === next.field_id && field.name === next.name &&
          field.start_slot === next.start_slot && field.slot_count === next.slot_count &&
          JSON.stringify(field.type) === JSON.stringify(next.type)
      })
      console.log(`Layout: ${oldLayout.field_count} → ${newLayout.field_count} fields; append-only prefix: ${unchangedPrefix}`)
      if (!unchangedPrefix || newLayout.fields.length < oldLayout.fields.length) process.exitCode = 1
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
