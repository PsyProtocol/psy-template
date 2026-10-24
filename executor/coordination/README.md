# Composition coordination authority

This optional application service coordinates one approved financial scope.
It holds no wallet signing key, reads no chain, and changes no Node service.
The ordinary owner signs funding, cancellation and final claims separately.

## Run locally

1. Generate a strong private bearer credential outside Git. Store it in an
   operator-only file; do not put its contents in command arguments.
2. For each **new, unused** composition runtime run
   `node executor/coordination/probe.mjs CONFIG scope`. Review the emitted scope.
   Existing local financial journals need reviewed migration; silently switching
   journal history by configuration is rejected.
3. Create a private server configuration with exactly `directory`,
   `authTokenFile`, `port` and `scopes`. Use a durable directory outside `/tmp`;
   `scopes` contains the reviewed scope objects, not just their hashes.
4. Run `node executor/coordination/server.mjs SERVER_CONFIG`. The authority
   binds `127.0.0.1` and reports its port. A second authority cannot use the same
   ledger root concurrently.
5. Add `coordinator: {endpoint, authTokenFile}` to the composition configuration.
   Test access with `node executor/coordination/probe.mjs CONFIG read`, then
   run `node composition/run.mjs CONFIG watch`.

The composition CLI also supports `scan`, `once` and `reconcile`. `scan` does
not acquire a lease or prepare/broadcast a financial operation. `once` performs
at most one service cycle. Stop `watch` with SIGTERM/SIGINT; reconcile any
in-flight financial result by its original identity after restart.

## Guarantees and boundaries

- Scope binds network/domain, SDK, vault, fingerprint, public key, intent,
  registry, driver digest and absolute artifact directory.
- The authority rejects two approved scopes for the same network/payer vault.
  A changed intent or artifact path cannot bypass that vault's existing lease;
  changing financial scope requires reviewed history migration.
- Leases fence journal mutations and are checked immediately before invoking
  the financial driver. Shared vault/payer dependencies still apply.
- Planned/proved/broadcast history is durable. Unknown broadcasts block
  substitute financial operations, including after authority restart.
- Lost append acknowledgements are resolved by reading the exact append UUID;
  the client does not blindly repeat the write.
- Proof/request files remain immutable. Lease fencing does not cancel a request
  already sent to the network; exact financial reconciliation remains required.
- Fence loss before driver invocation records no-send evidence only in a
  previously absent submission directory. Existing requests are never replaced.
- Restart budgets persist; the authority additionally caps rebuild reservations
  at three per scope. Record capacity defaults to 10,000 and fails closed;
  retention/capacity changes require reviewed archival and recovery procedures.

## Validation limits

Tests exercise actual loopback HTTP, durable files, separate Node processes,
SIGKILL takeover, lease expiry, append ACK loss and authority restart, with
explicitly simulated proof/chain IO. Formal service integration uses the same
client. These are local tests, not physical two-host acceptance.

Two physical hosts are unavailable. Remote TLS deployment, shared-mount
partition behavior and financial takeover between hosts remain unverified.
The authority is trusted for coordination and availability; it is not Byzantine
consensus or a certificate of runtime identity.

Remote use requires a TLS reverse proxy and authenticated private networking;
non-loopback HTTP is rejected. Every worker must see the same durable artifact
filesystem at the **same absolute path**, with verified permissions, atomic
publication and fsync semantics. Never expose the loopback authority directly
or archive credentials with configuration/evidence.
