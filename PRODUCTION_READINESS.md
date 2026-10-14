# 生产验收边界

本仓库当前仍不声明 mainnet production ready。部署、回归和测试网结算是工程证据；它们不代替独立审计、生产运行验收或权限治理。

## 按模块检查

| 模块 | 工程证据 | 上线前仍需验收 |
| --- | --- | --- |
| U124 FT | 两个 62 位 limb；18 位精度；公开版实际字节码和三市场交易；[新增私有版本地验证](token/wide/private/README.md) | 私有版新部署及完整 CFC/UPS验收；独立审计、发行及升级权限治理 |
| NFT | 实际 mint、transfer、claim；身份、metadata、FIFO 和持有槽检查 | 独立审计、发行及升级权限治理 |
| AMM / Orderbook / Curve | [真实结算、退款、领取关闭、Curve 建池和同机崩溃恢复](executor/verification/2026-10-14-resume-01/REPORT.md) | 独立审计、链上容量和故障验收 |
| NFT Market | 独立初始 layout 验证；一次性启用；完整 UPS；成交与取消退款 | 三用户竞争验收结果及发布验收见本次报告；仍须独立审计 |
| Executor | 持久广播意图、精确回执恢复、同机共享日志锁、根与公钥身份检查 | 服务可用性、告警响应和专用生产环境验收 |

## 发布需要满足的条件

1. 冻结源码、ABI、policy、驱动和 code/layout roots，记录哈希；不得覆盖原编译或证明产物。
2. 初次部署使用经过独立验证的空旧布局证明。更新既有合约必须另行核对链上旧布局和证明端点，不能复用初次部署证明。
3. 使用与 fingerprint 对应的公开 SD-key 公钥哈希；普通私钥账号即使注册、持有类似状态，也不能冒充公开金库。
4. 真实 UPS 证明验证后只广播一次；响应丢失时按持久叶哈希对账。缺少回执不能作为重发依据。
5. 验证实际领取、FT 总量、NFT 数量、NFT 身份和 metadata，不能只检查订单状态或余额计数。
6. 独立团队审计合约、SD-key、应用编译适配及更新权限；修复发现项，再重跑受影响的验证。
7. 在专用环境验收可用性、链上容量、故障恢复、备份恢复和告警响应，并记录实际测量结果。

## 升级权限必须审查

当前 policy 校验的是合约 ID、method ID、参数和完整调用栈；`can_read_state` 保持关闭。执行器另行检查 code/layout roots。**这些应用检查不等于 fingerprint 在链上冻结了合约代码。**

若部署者能够更新相同 method ID 的实现，其权限属于资金安全边界。生产发布必须明确升级权限的持有人、控制及恢复方式，审查是否需要不可升级部署或在 SD-key 证明中认证代码根。不能把客户端拒绝执行新代码当作对任意公开执行者的链上约束。本轮没有修改 Node、绕开未认证状态读取限制或对既有合约提交布局更新。

## 并发与运行范围

当前支持一个执行主机上的多个进程共享同一 runtime 目录。链上 nonce/锚点用于判定竞争证明，持久日志负责提交与恢复。同机锁测试不代表跨机器租约或链上 TPS 已通过。

macOS 登录服务依赖机器保持唤醒、网络和用户会话。它适合测试网运行，不构成生产可用性承诺。部署到服务器前需要验证该环境的编译驱动、证书信任、资源容量和运维流程。

## NFT Market 的只读验收

`nft-marketplace/acceptance.mjs` 重新查询交易回执，核对冻结文件、SD-key 身份、实际领取及 FT/NFT 守恒。需要三名真实参与者和启用、成交、取消退款、竞争买家退款的证据。它不签名、不转账、不重试提交。

```sh
npm run verify:nft-marketplace -- \
  --config /absolute/path/to/executor.json \
  --evidence /absolute/path/to/acceptance-evidence.json \
  --out /absolute/path/to/fresh-verification.json
```

通过时输出 `engineeringAcceptanceVerified: true`；`productionReady` 仍为 `false`，并列出外部审计、权限治理与运行验收门槛。验收数据格式由 [测试样例](nft-marketplace/tests/acceptance.test.mjs) 展示；样例中的 RPC 和驱动是明确的测试替身，不能作为真实链上证据。

---

# 既有 FT/NFT 证据与门槛（原记录保留）

# Production readiness gates

This repository is a reference implementation. Passing `npm test` proves local compilation, native single-user test cases, ABI shape, and JavaScript state-model behavior. It does not prove live multi-user settlement or mainnet safety.

## Completed in the local template

- Native test fixtures are generated from the legacy `.psy` sources. Harness-only replacements are explicit in `token/scripts/run_unit_test.mjs` and `nft/scripts/run_unit_test.mjs`. Both runners also compile the staging `.psy.rs` sources; the legacy unit assertions do not execute those sources.
- NFT v3 uses a full four-Felt `Hash` for token IDs and separate inbound-claim and outbound-ACK counters. Older deployments need a separate migration design.
- NFT v3 now stores collection name and base URI alongside its existing symbol and metadata hash. It also supports a one-time lifetime mint cap, owner-initiated burn, and issuer settlement of the monotonic burn counter into `total_supply`. A burn is reflected in the owner's balance immediately and in global supply only after settlement. These fields require a new deployment.
- Issuer configuration is limited to `1..16777215`, matching the Outbox index range.
- Standalone templates provide `deploy:checked`, which checks the selected wallet's first registered user ID against `ISSUER_USER_ID` on the configured network before rebuilding and deploying. Direct `psyup deploy` remains an unchecked escape hatch.
- PSY-20 delegation permits opening 16 escrow slots. Revocation is cooperative: a spender-local terminal close is required before the owner refunds unspent balance. An owner request cannot force a spender to stop or release funds. See [`token/README.md`](token/README.md).
- PSY-20 now stores name, URI, an optional immutable lifetime cap, lifetime minted amount, and outstanding supply. Holders burn locally; the fixed issuer settles each holder's monotonic burn counter to reduce outstanding supply. The issuer can also mint directly to a recipient's claimable Outbox. These fields require a fresh deployment; older contracts have a different storage layout.
- `tests/live/asset_queries.py` reads token and NFT state at one checkpoint using the deployed ABI. It can verify an NFT owner candidate by scanning that user's 128 slots, but it cannot discover the owner of an arbitrary ID without an external index. The RPC returns state proofs; the helper does not independently authenticate checkpoint headers.

## Staging evidence, 2026-09-23

- Two newly registered users in different realms completed a five-transaction PSY token transfer and claim round trip. Contract 0 balances were checked from node state proofs after each confirmation. This verifies the staging transaction path, not the NFT artifact.
- A recipient claim trace anchored at checkpoint 32362 was confirmed at 32388 after the sender's second transfer confirmed at 32382. The recipient's balance rose by the amount available at the old checkpoint, less execution cost. A fresh claim then collected the second transfer. **Staging does not require remote state reads to be fresh at submission.** The node does check the caller's current leaf; this experiment did not bypass that check.
- The legacy NFT `.psy` artifact could not be deployed to staging. A new `nft/src/main.psy.rs` artifact deployed as contract 44. Two users in different realms confirmed mint, A→B claim, B→A claim, ACK, four pending transfers, queue-full rejection, ACK recycling, and ring wraparound. State proofs show the five minted token IDs and metadata arrived unchanged, the issuer slots cleared, and balances matched. A later NFT claim trace anchored before the sender's second transfer was accepted after that transfer; a fresh claim collected the second NFT, with state proofs showing no duplicate in this sequence. The released 0.1.1 `psy_user_cli` executed claims and ACK. Direct `psyup deploy` still targets the legacy artifact; the staging IDE's v3 workflow has not been tested.
- A node-matched local CLI deployed PSY-20 v3 test contract 46. Two cross-realm users confirmed mint, channel opening, delegated spend, recipient claim, owner revocation request, spender close, and refund after the original 60-checkpoint wait. Its final state proof shows no locked escrow. Contract 46 is an earlier revision; the published local 0.1.1 CLI's deployment was rejected with `canonical layout verifier fingerprint mismatch`, showing toolchain and network compatibility remains a release gate.
- PSY-20 v3 revision deployed as staging contract 47. The same two users completed mint, open, spend, claim, request, close, and immediate refund. A further spend after close was rejected. State proofs at checkpoint 34357 show owner balance 10,000, channel status CLOSED and allocation 0, and spender ledger `spent = 300, closed = 1`. [Transactions](tests/live/evidence/2026-09-23/token-delegation-v3-final.json) and [state proofs](tests/live/evidence/2026-09-23/token-delegation-v3-final-state-proofs.json) record the result. A pre-request spend trace was confirmed after the request at checkpoint 34424; [historical-spend evidence](tests/live/evidence/2026-09-23/token-delegation-v3-historical-spend.json) and [final state proofs](tests/live/evidence/2026-09-23/token-delegation-v3-historical-spend-state-proofs.json) record that sequence. On the same earlier revision, a newly generated spend also confirmed after an owner request (request 34617, spend 34623).
- The current active-only source deployed as staging contract 48. Its ordinary two-user delegation flow, close, and immediate refund confirmed. For a separate slot, Alice's request confirmed at 34749; Bob's newly initiated spend was rejected by `channel is not active`, Bob closed, Alice recovered all 100, and state proofs at 34772 show owner balance 10,000, allocation 0, and Bob `spent = 0, closed = 1`. [Flow](tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-flow.json), [negative test](tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-negative.json), and [state proofs](tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-state-proofs.json) record the result. On contract 48, Bob's trace anchored at 34798, Alice's request confirmed at 34807, and Bob's saved trace still spent 40 at 34815. [Historical-spend record](tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-historical-spend.json) and [final state proofs](tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-historical-state-proofs.json) confirm the remaining 60 was later refunded.

## Required before live value use

The new PSY-20 supply controls passed a two-user staging flow on public-only contract 49: `mint_to(600)` and claim, recipient burn of 200, issuer settlement, state proof of `total_minted = 600` and `total_supply = 400`, and rejection of a duplicate settlement and mint past the 1000 cap. See [evidence](tests/live/evidence/2026-09-24/token-supply-v3.json). The separate private v3 profile completed a two-user private note round trip on contract 53; see [evidence](tests/live/evidence/2026-09-25/token-private-v3.json).

The NFT cap and burn revision deployed as staging contract 57. Two users in different realms confirmed metadata initialization, `set_max_supply(2)`, mint, transfer, claim, recipient burn, and issuer settlement. At checkpoint 71169 the ABI-based reads show `total_minted = 1`, `total_supply = 0`, `max_supply = 2`, matching burn requested and settled counters of 1, and zero user balances. A repeated settlement was rejected. [Transaction and state evidence](tests/live/evidence/2026-09-28/nft-supply-v3.json) records the deployed source hash. The final name/base-URI revision deployed as contract 58 and passed live writes, ABI-based reads, text decoding, and non-issuer rejection. [Metadata evidence](tests/live/evidence/2026-09-28/nft-metadata-v3.json) records its source hash.

**PSY-20 release gate:** The ordinary two-user cooperative lifecycle passed on staging contracts 47 and 48. Contract 48 rejected a fresh post-request spend but **accepted a historical ACTIVE proof submitted after the request**. This is direct evidence that the active-only guard cannot provide unilateral allowance revocation. Test concurrent submissions and independent node-side stale-caller rejection. The private v3 source implements `private_transfer` and `private_claim`, and its two-user staging round trip passed; the default public v3 artifact still omits them. Keep the two deployment profiles explicit. Do not present `total_supply` as instantly synchronized with unprocessed burns. If unilateral revocation is a product requirement, implement current-state validation or atomic cross-partition settlement in the protocol before enabling that claim. Pin a CLI whose canonical-layout verifier matches staging.

1. **Real NFT adversarial tests:** The ordinary two-user round trip, four pending NFTs, fifth-send rejection, ring wraparound, and ACK recycling passed on staging with state-proof checks. Still exercise recipient-full slots, concurrent submissions, and deliberately stale NFT proofs.
2. **Historical read safety:** Staging accepted an NFT claim with a historical sender proof and a PSY-20 spend with a historical owner proof after the owner request. A second NFT trace with an old caller leaf was stopped by the client before submission, and the ordinary old-then-fresh sequence preserved NFT ownership. Independently verify node-side rejection of stale caller leaves, then test delegation spends against historical owner proofs after spender close. Do not equate cooperative close with unilateral revocation.
3. **Recipient liveness policy:** Specify whether transfer to an unregistered, inaccessible, or permanently inactive user may lock an NFT indefinitely. Add a protocol-safe recovery or cancellation path if that outcome is unacceptable; a timeout alone is insufficient without a proof-freshness rule.
4. **Account and capacity limits:** Confirm the chain's user ID range and product requirements against the 24-bit Outbox index, 128 active NFT slots per user, and four pending transfers per sender-recipient pair. Change the storage design before deployment if these limits are too small.
5. **Integration contract:** Connect the ABI-based query helper to wallets and an indexed owner-discovery service. Test four-Felt IDs, events, metadata resolution, and indexed candidates against live users. A standard global `ownerOf(token_id)` is unavailable from partition-local state alone.
6. **Shielded NFT flow:** The current private-note wallet exposes its `amount` as a public method input. Using the unique NFT local ID as that amount would link the transfer and claim. A private NFT transfer requires a circuit and wallet flow that hides the token identity while proving one owner debit and one recipient credit; do not present the PSY-20 note method as private NFT support.
7. **Release controls:** Align the IDE and `psyup deploy` with the 0.1.1 CLI's `.psy.rs` compiler and deployment artifact. Pin and verify the CI toolchain installer, run the CI workflow on a clean hosted runner, obtain independent contract and protocol review, and rehearse deployment and recovery on a non-production network.

Do not label a deployment production ready until these gates have evidence attached to the release candidate. Use `deploy:checked`; direct `psyup deploy` bypasses the template's wallet and issuer check.
