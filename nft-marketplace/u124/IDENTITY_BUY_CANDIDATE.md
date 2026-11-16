# Selected NFT identity approval candidate

This opt-in source candidate is not imported by the production factory, client,
Executor or wallet. It has not been compiled, proved, deployed or accepted on a
network. Host tests inspect source preservation and calldata encoding only.

The current `open_buy` approves a seller, listing nonce and U124 price but has no
approved token ID or metadata inputs. An RPC display check cannot close this
gap. `identity-buy-candidate.mjs` replaces that entry with
`open_buy_identity_v1`. It does not leave the unbound entry accessible.

The replacement retains all original checks and writes. Before the first local
write, it requires the explicit collection ID to equal the compiled collection,
the recipient to equal the signing buyer, and all four token ID and all four
metadata words to equal authenticated seller-listing state read by the same
call. It also rejects an all-zero token ID. Metadata may be all zero. Identity
words use canonical Goldilocks field values; they are not truncated to U124
amount limbs. Original pool, seller, listing nonce, price, deadline, buyer nonce,
funding, uniqueness, buyer priority, sale and refund rules remain unchanged.
The same strictly increasing seller listing nonce links this approval to the
existing settlement path. The seller cannot replace that listing's identity
while its order is open; existing settlement checks also bind the deposited NFT
payload to that listing. No gifting or new winner selection is introduced.

The 17 flattened calldata words are:

1. Pool, seller, listing nonce.
2. U124 price low and high limbs, deadline, buyer nonce.
3. Collection ID and signing-buyer recipient.
4. Four expected token ID words and four expected metadata hash words.

The frozen SDK commit is
`01b8f2b0a077367a7b9879baba1a72aea8ab5510`, client commit
`7058070057c3242b5d8b29e1a31d498aaa4202c0`. In that source,
`client_prover/psy_core/psy_data/src/dpn/sd_key.rs:19` sets
`SDKEY_MAX_CALLDATA_WORDS` to 128. The VM checks actual calldata length and its
declared length in `psy_vm/src/dpn/vm/exec.rs:283`; compiler ABI generation sums
parameter felt sizes in `psy_compiler/src/abi/mod.rs:510`. Source digests are
included in `FROZEN_CAPACITY`; `psy_compiler/src/types/layout.rs:56` assigns four
felts to each `Hash`. A 17-word signature fitting this upper bound does
not establish successful compilation, SDK session binding or proof acceptance.

## Required integration gates

- Build a **new** candidate with the actual prepared collection (height 30),
  payment FT (height 31), Native (height 32) and market identities. Preserve the
  original artifacts. Audit all eight added seller-state reads in the compiler's
  foreign-read report. Check the actual ABI's new selector, 17 inputs, zero
  outputs and absence of `open_buy`.
- Add a versioned factory/client route that rejects the old ABI, authorizes the
  exact new call and binds all 17 approved words, signing account, ordered calls,
  session, sig_hash, actual source roots, chain instance, deadline and fees.
  Recompute the key and all dependency pins. Existing fingerprints and reviewed
  resources are not compatible evidence for this candidate.
- Use a reviewed full-field calldata encoder for all eight identity words. The
  existing generic `call()` helper caps inputs at 62 bits and cannot encode the
  full canonical Goldilocks identity range. Do not truncate these words or route
  them through an amount-limb encoder. Reject missing, sparse or inherited array
  indexes, accessor words and every noncanonical word before approval and
  persistence. The candidate helper snapshots own data descriptors once and
  assembles calldata from validated copies, without invoking supplied iterators.
- Prove actual bytecode plus full UPSs for buy, sale and ordinary claim. Reject
  every token/metadata word mutation, wrong collection/recipient, listing nonce
  replacement, changed seller/price, expired listing and stale state. Verify
  failure leaves state and funds unchanged. Include U124 boundaries, competing
  buyers, cancellation, refunds, unique delivery and exact recovery.
- Ordinary user funding and the buy approval must remain in the same complete
  signed UPS. Preserve prepare-account and existing fee/payment ordering. A
  detached unsigned plan or valid Endcap alone is not approval evidence.
- Until those gates and a separately budgeted new-instance live acceptance pass,
  keep NFT purchase writes closed. The parent owns native resources and finance;
  this module performs neither.

Run the host regressions with:

```sh
node --test nft-marketplace/u124/identity-buy-candidate.test.mjs
```
