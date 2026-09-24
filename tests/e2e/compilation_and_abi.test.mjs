import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '../..');

test('Compilation & ABI Verification E2E', async (t) => {
  // 0. Compile both token artifacts, the dApp contract, and staging-compatible NFT v3.
  await t.test('All contracts compile cleanly', () => {
    execSync('npm run build', { cwd: join(REPO_ROOT, 'token'), stdio: 'pipe' });
    execSync('psyup build', { cwd: join(REPO_ROOT, 'dapp/contract'), stdio: 'pipe' });
    execSync('npm run build', { cwd: join(REPO_ROOT, 'nft'), stdio: 'pipe' });
  });

  // 1. PSY-20 Pure Token ABI Verification
  await t.test('PSY-20 Token ABI satisfies standard specification', () => {
    const abiPath = join(REPO_ROOT, 'token/target/token.abi.json');
    assert.ok(existsSync(abiPath), 'token.abi.json must exist');
    const abi = JSON.parse(readFileSync(abiPath, 'utf-8'));

    assert.equal(abi.schema_version, '2.0.0', 'Schema version must be 2.0.0');
    assert.equal(abi.contract.name, 'PsyTokenContract');

    // Verify complete-source storage fields, including the terminal spender ledger.
    const stateFieldNames = abi.contract.state.map(s => s.name);
    assert.deepEqual(stateFieldNames, [
      'balance',
      'last_claimed_pow_rewards_checkpoint_id',
      'claimed_rewards',
      'other_user_info',
      'note_count',
      'note_root',
      'last_path',
      'mint_authority',
      'is_mint_renounced',
      'total_minted',
      'total_supply',
      'max_supply',
      'burn_requested',
      'burn_settled',
      'decimals',
      'symbol',
      'name',
      'token_uri',
      'delegations',
      'delegation_spends',
      'state_map'
    ]);

    // Verify canonical note_root offset and leaf index alignment
    const noteRootField = abi.contract.state.find(s => s.name === 'note_root');
    assert.equal(noteRootField.offset, 33554436);
    assert.equal(noteRootField.offset / 4, 8388609);

    // Verify complete-source methods, including private claims and burn settlement.
    const methodNames = abi.contract.methods.map(m => m.name).sort();
    assert.deepEqual(methodNames, [
      'batch_transfer_2',
      'batch_transfer_5',
      'burn',
      'claim',
      'close_delegation_channel',
      'finalize_revoke_delegation',
      'mint',
      'mint_to',
      'open_delegation_channel',
      'private_claim',
      'private_transfer',
      'renounce_mint_authority',
      'request_revoke_delegation',
      'set_extended_metadata',
      'set_max_supply',
      'set_metadata',
      'set_mint_authority',
      'settle_burn',
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

    // Verify private_claim method inputs
    const privateClaimMethod = abi.contract.methods.find(m => m.name === 'private_claim');
    assert.equal(privateClaimMethod.inputs.length, 9);
    assert.deepEqual(privateClaimMethod.inputs.map(i => i.name), [
      'nullifier_hash', 'receiver', 'amount', 'user_tree_root', 'checkpoint_id', 'note_root_slot', 'random0', 'random1', 'proof'
    ]);

    // Verify dual-ledger spend_delegation method inputs
    const spendDelegationMethod = abi.contract.methods.find(m => m.name === 'spend_delegation');
    assert.equal(spendDelegationMethod.inputs.length, 4);
    assert.deepEqual(spendDelegationMethod.inputs.map(i => i.name), ['owner', 'channel_idx', 'amount', 'recipient']);

    // Verify cooperative revocation inputs.
    const requestRevokeMethod = abi.contract.methods.find(m => m.name === 'request_revoke_delegation');
    assert.equal(requestRevokeMethod.inputs.length, 1);
    assert.deepEqual(requestRevokeMethod.inputs.map(i => i.name), ['channel_idx']);

    const finalizeRevokeMethod = abi.contract.methods.find(m => m.name === 'finalize_revoke_delegation');
    assert.equal(finalizeRevokeMethod.inputs.length, 2);
    assert.deepEqual(finalizeRevokeMethod.inputs.map(i => i.name), ['channel_idx', 'spender']);
  });

  // 2. DApp Contract ABI Verification
  await t.test('DApp Contract ABI aligns with PSY-20 standard', () => {
    const abiPath = join(REPO_ROOT, 'dapp/contract/target/token.abi.json');
    assert.ok(existsSync(abiPath), 'dapp contract token.abi.json must exist');
    const abi = JSON.parse(readFileSync(abiPath, 'utf-8'));

    assert.equal(abi.schema_version, '2.0.0');
    assert.equal(abi.contract.name, 'PsyTokenContract');
    assert.equal(abi.contract.methods.length, 20);
  });

  // 3. PSY-721 NFT ABI Verification
  await t.test('PSY-721 NFT ABI satisfies standard specification', () => {
    const abiPath = join(REPO_ROOT, 'nft/target/v3/abi.json');
    assert.ok(existsSync(abiPath), 'NFT v3 ABI must exist');
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
    const slotType = abi.types.find(t => t.name === 'NFTSlot');
    const outboxType = abi.types.find(t => t.name === 'NFTOutbox');
    assert.equal(slotType.fields.find(f => f.name === 'token_id').type.name, 'Hash');
    assert.equal(outboxType.fields.find(f => f.name === 'token_id_0').type.name, 'Hash');
    assert.equal(abi.contract.state.find(s => s.name === 'owned_tokens').type.item_felt_size, 9);
    assert.equal(abi.contract.state.find(s => s.name === 'outbox').type.item_felt_size, 35);
    assert.equal(outboxType.fields.find(f => f.name === 'nonce_acked').type.name, 'Felt');

    // Verify six staging v3 NFT methods; authority is initialized by set_collection_metadata.
    const methodNames = abi.contract.methods.map(m => m.name).sort();
    assert.deepEqual(methodNames, [
      'acknowledge',
      'claim',
      'mint',
      'renounce_mint_authority',
      'set_collection_metadata',
      'transfer'
    ]);

    // Verify mint inputs: slot_idx, local_id, metadata_hash (local_id hashed on-chain with creator)
    const mintMethod = abi.contract.methods.find(m => m.name === 'mint');
    assert.equal(mintMethod.inputs.length, 3);
    assert.deepEqual(mintMethod.inputs.map(i => i.name), ['slot_idx', 'local_id', 'metadata_hash']);

    // Verify set_collection_metadata inputs (symbol, base_uri_hash)
    const setCollectionMetadataMethod = abi.contract.methods.find(m => m.name === 'set_collection_metadata');
    assert.equal(setCollectionMetadataMethod.inputs.length, 2);
    assert.deepEqual(setCollectionMetadataMethod.inputs.map(i => i.name), ['symbol', 'base_uri_hash']);
  });
});
