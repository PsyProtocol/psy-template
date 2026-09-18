import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '../..');

test('Compilation & ABI Verification E2E', async (t) => {
  // 1. PSY-20 Pure Token ABI Verification
  await t.test('PSY-20 Token ABI satisfies standard specification', () => {
    const abiPath = join(REPO_ROOT, 'token/target/token.abi.json');
    assert.ok(existsSync(abiPath), 'token.abi.json must exist');
    const abi = JSON.parse(readFileSync(abiPath, 'utf-8'));

    assert.equal(abi.schema_version, '2.0.0', 'Schema version must be 2.0.0');
    assert.equal(abi.contract.name, 'PsyTokenContract');

    // Verify storage fields
    const stateFieldNames = abi.contract.state.map(s => s.name);
    assert.deepEqual(stateFieldNames, [
      'balance',
      'mint_authority',
      'is_mint_renounced',
      'total_minted',
      'decimals',
      'symbol',
      'other_user_info',
      'delegations',
      'note_count',
      'note_root',
      'last_path'
    ]);

    // Verify 13 standard methods (including set_metadata, private_transfer and spend_delegation)
    const methodNames = abi.contract.methods.map(m => m.name).sort();
    assert.deepEqual(methodNames, [
      'batch_transfer_2',
      'batch_transfer_5',
      'burn',
      'claim',
      'mint',
      'open_delegation_channel',
      'private_transfer',
      'renounce_mint_authority',
      'revoke_delegation_channel',
      'set_metadata',
      'set_mint_authority',
      'spend_delegation',
      'transfer'
    ]);

    // Verify set_metadata method inputs
    const setMetadataMethod = abi.contract.methods.find(m => m.name === 'set_metadata');
    assert.equal(setMetadataMethod.inputs.length, 2);
    assert.deepEqual(setMetadataMethod.inputs.map(i => i.name), ['symbol', 'decimals']);

    // Verify private_transfer method inputs
    const privateTransferMethod = abi.contract.methods.find(m => m.name === 'private_transfer');
    assert.equal(privateTransferMethod.inputs.length, 3);
    assert.deepEqual(privateTransferMethod.inputs.map(i => i.name), ['receiver', 'value', 'note_secret_hash']);

    // Verify spend_delegation method inputs
    const spendDelegationMethod = abi.contract.methods.find(m => m.name === 'spend_delegation');
    assert.equal(spendDelegationMethod.inputs.length, 3);
    assert.deepEqual(spendDelegationMethod.inputs.map(i => i.name), ['channel_idx', 'amount', 'recipient']);
  });

  // 2. DApp Contract ABI Verification
  await t.test('DApp Contract ABI aligns with PSY-20 standard', () => {
    const abiPath = join(REPO_ROOT, 'dapp/contract/target/token.abi.json');
    assert.ok(existsSync(abiPath), 'dapp contract token.abi.json must exist');
    const abi = JSON.parse(readFileSync(abiPath, 'utf-8'));

    assert.equal(abi.schema_version, '2.0.0');
    assert.equal(abi.contract.name, 'PsyTokenContract');
    assert.equal(abi.contract.methods.length, 13);
  });

  // 3. PSY-721 NFT ABI Verification
  await t.test('PSY-721 NFT ABI satisfies standard specification', () => {
    const abiPath = join(REPO_ROOT, 'nft/target/nft.abi.json');
    assert.ok(existsSync(abiPath), 'nft.abi.json must exist');
    const abi = JSON.parse(readFileSync(abiPath, 'utf-8'));

    assert.equal(abi.schema_version, '2.0.0', 'Schema version must be 2.0.0');
    assert.equal(abi.contract.name, 'PsyNFTContract');

    // Verify storage fields
    const stateFieldNames = abi.contract.state.map(s => s.name);
    assert.deepEqual(stateFieldNames, [
      'balance',
      'mint_authority',
      'is_mint_renounced',
      'total_minted',
      'symbol',
      'base_uri_hash',
      'owned_tokens',
      'outbox'
    ]);

    // Verify 6 standard methods (including set_collection_metadata)
    const methodNames = abi.contract.methods.map(m => m.name).sort();
    assert.deepEqual(methodNames, [
      'claim',
      'mint',
      'renounce_mint_authority',
      'set_collection_metadata',
      'set_mint_authority',
      'transfer'
    ]);

    // Verify mint inputs (slot_idx, token_id, metadata_hash)
    const mintMethod = abi.contract.methods.find(m => m.name === 'mint');
    assert.equal(mintMethod.inputs.length, 3);
    assert.deepEqual(mintMethod.inputs.map(i => i.name), ['slot_idx', 'token_id', 'metadata_hash']);

    // Verify set_collection_metadata inputs (symbol, base_uri_hash)
    const setCollectionMetadataMethod = abi.contract.methods.find(m => m.name === 'set_collection_metadata');
    assert.equal(setCollectionMetadataMethod.inputs.length, 2);
    assert.deepEqual(setCollectionMetadataMethod.inputs.map(i => i.name), ['symbol', 'base_uri_hash']);
  });
});
