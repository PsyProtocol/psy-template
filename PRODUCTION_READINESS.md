# 2026-10-19：驱动冻结、请求证据与 UPS 元数据绑定

本轮继续只修改应用仓库，不修改 Node、协议电路、六个合约源码或已注册的 SD-key policy；没有部署或广播。既有合约 code/layout roots 和 fingerprint 不因本次驱动修改而改变。

- U124 与 NFT Market 的 Executor 配置要求显式 `walletSha256`，只执行匹配审核摘要的独立私有副本；安装目录中的二进制替换不会改变运行中的驱动。副本被修改或权限改变时停止证明/提交。
- JS 和 Rust 在 RPC 前核对 policy 选中分支的全部显式调用，包括所有收款人、资产、方法与参数，补齐此前普通分支只检查首个市场调用的应用预检。链上原有整栈 SD-key 约束继续保留。
- 完整 UPS 证明验证后，驱动显式绑定四个证明公开输入与即将广播的 end-cap state transition/stats，并检查新用户叶哈希、用户 ID、checkpoint 的内部一致性。
- 驱动对实际读取的原始 calls/guard 文件输出 SHA256；Executor 的 preflight、提交与恢复校验同一组摘要。旧缓存 proof 不能冒充新版 proof，既有 pending 广播仍可只读对账。
- NFT 工程验收升级为 evidence version 2，核对完整调用组、审核过的驱动摘要、guard 身份与全部依赖、RPC 配置封存及请求摘要；交换两份合法成交日志不能伪造另一笔操作的覆盖率。

完整离线回归：237 项 JavaScript、62 次 Rust VM/CFC/layout/SD-key/FT 测试执行通过，0 失败、0 跳过；驱动 release 构建通过。实际执行冻结后的新驱动，与上一版驱动比较四组 policy 的 fingerprint / publicKeyHash 均一致；七份编译产物（公开/隐私 FT、NFT、三市场、NFT Market）逐字节一致。

摘要报告依然来自受信驱动；它不是协议新增的公开输入，也不是独立签名的安全审计。Node 升级授权路径、SD-key 中的代码根认证、独立安全审计等边界仍在，不能仅通过填写摘要将这些事项认定为已完成。

---

# 2026-10-19：广播前绑定与历史状态回归

本轮只修改 psy-template 的应用驱动、执行器及测试；Node 运行时、VM 和协议电路源码未修改，没有部署或广播交易。

## 代码修复

- U124 三市场及 NFT Market 使用新的 `guarded-preflight` / `guarded-submit` 驱动入口。绑定文件必须完整覆盖 policy 的全部被调用合约，包括市场、FT、NFT、PSY 手续费资产和配置中的 bootstrap AMM，禁止缺漏、重复或额外依赖。
- Rust 应用驱动在证明前、UPS 验证后、广播意图落盘前重新读取 code/layout roots、状态树高度和金库注册，并验证实际证明对应的金库 ID。网络、市场、fingerprint 和公开 SD-key 公钥哈希必须匹配。
- 金库绑定文件持久化，重启时不允许自动接受变化的根。PSY 根在首次使用时从受信 RPC 建立基线，其余根来自显式部署配置。需要变更基线时必须作为新发布审查。
- ABI、policy、市场配置、RPC 配置和资产 ABI 在运行期间变化时停止证明或提交；新提交拒绝缺少 guard 验证标记的驱动输出。旧提交日志保留只读对账能力。
- 修复 journal 即时对账没有传递本次独立日志路径的问题：子进程已保存广播身份但父进程没有拿到 stdout 时，也能立即找到准确回执，避免无必要地停留在 unresolved。
- Executor 拒绝越出 24 位范围的合约 ID，以及市场与资产 ID 重叠的配置。

## 新增与加强的验收

- 本地实际 HTTP RPC 回归验证驱动每次重新读取当前 code/layout roots、树高和注册身份，变化时拒绝。
- JavaScript 回归覆盖全部市场/资产/PSY 根变化、运行中配置替换、重启基线变化、旧驱动拒绝与精确日志恢复。
- 公开及隐私 FT 的实际字节码分别验证历史发送额度不能重复领取；spender 本地 terminal close 后，即使远端提供历史 ACTIVE 委托状态也不能再次花费，退款后不能再次退款。
- 三市场实际字节码验证远端付款人的历史 OPEN 订单不能重复执行已提交的退款；NFT 字节码验证历史发送队列不能重复领取。
- 统一离线入口增加独立公开 FT profile 的执行，以及三个市场共八个 close 方法的生产树高 CFC 构建；不能只在隐私 FT 的兼容接口上运行公开方法测试。

本轮完整离线结果：227 项 JavaScript 测试、60 次 Rust VM/CFC/layout/SD-key/FT 测试执行通过，0 失败，0 跳过；Rust 应用驱动 release 构建通过。60 次执行包含公开/隐私 FT 两个 profile 分别运行相同公开方法回归。

## 不能据此消除的边界

上述重复根检查属于受信执行器的应用防护。RPC 叶子并未在这里独立认证；检查与广播之间仍可能发生升级，其他公开执行者也不受此检查约束。合约不可升级保证或明确接受的升级权限治理仍须独立落实。 本地 Node 基线的升级入口还需核验实际授权路径：deployer 字段一致不等于持有者授权；详见[升级授权审查记录](docs/security/UPGRADE_AUTHORITY_REVIEW_20261019.md)。此记录仅为只读源码观察，不代表已核验现网部署。

历史状态测试使用实际字节码与显式混合快照，本地 caller 状态保持当前；它们不构成 Node 对陈旧 caller 证明的独立验收。委托仍为合作关闭，不能称为单方面即时撤销。安全审计、权限治理和生产运维验收尚未完成，因此仍不声明全部生产级。

---

# 2026-10-19：关闭三项 fixture 测试缺口

原先被标记为 ignored 的三项测试现已接入同一离线验收入口：

- `curve_bootstrap_advances_donor_cursor_and_allows_post_graduation_refund`：实际 Curve 字节码验证毕业费不足时回滚、两个捐款人的累计游标推进、毕业后旧买家新订单退款。
- `curve_bootstrap_binds_seed_recipient_method_minimum_deadline_nonce_and_fee_donor`：实际 SD-key 证明验证毕业分支，并拒绝收款人、方法、最低流动性、deadline、nonce 和手续费捐款人篡改。
- `public_acceptance_payer_only_funds_fixed_markets_and_returns_to_fixed_funders`：实际 SD-key 证明验证原测试付款人的九个固定分支，拒绝把剩余资金退给其他账户。

准备脚本从当前源码重新编译 bootstrap Curve，生成配置、policy 和样本，同时生成固定测试付款人的 policy；所有输入与产物仍由 manifest 冻结。三项测试不再带 `ignore`，缺少 fixture 会直接失败。统一入口还拒绝包含 ignored Rust 测试的结果，不能把跳过当作验收成功。

补测发现并修复了 policy 预校验器漏接原有 `bounded_test_payer` 类型的问题。仅显式恢复该已存在类型，调用数量、字段范围和 witness 校验继续生效，合法 policy 的电路约束未放宽。

本轮离线验证结果：221 项 JavaScript、44 项实际 VM/CFC/layout/SD-key/FT 测试通过，0 项合约测试跳过。bootstrap 配置里的 code/layout root 为显式测试占位值；这些测试不验证代码根认证，也没有向链上提交更新。

这关闭了先前列出的三项测试缺口。独立安全审计与合约升级权限边界仍需落实，不能据此把整套代码直接标为生产级。

---

# 2026-10-16 代码安全验收

本轮评估代码与证明约束。没有修改 Node，没有部署或更新链上合约。不能仅凭本轮回归把六个合约统一标为生产级。

## 新增修复和验证

- SD-key policy JSON 在分配电路前验证市场类型、调用数量、branch、method/contract ID、witness 索引和 Goldilocks 常量。畸形输入返回错误，避免 panic 或非规范字段进入电路。合法 policy 的电路与 fingerprint 不变。
- AMM、Orderbook、Bonding Curve 使用实际 SD-key gadget 验证所有授权分支，并拒绝每个调用的方法替换、caller 冒充、额外调用、付款人替换、高 limb 修改、收款人重定向、错误资产、调用重排和签名摘要篡改。
- NFT 和 NFT Market 执行实际编译字节码，覆盖 128 个接收持有槽全部占满、失败后游标和身份不变、释放槽后精确领取、重复领取/销毁/结算拒绝、越权 mint，以及后置检查失败的写入回滚。
- FT 执行公开和隐私字节码，覆盖 U124 进借位、边界值、总量守恒、重复领取、错金额/错面额证明、两棵隐私树容量失败的原子回滚、委托关闭和原付款人退款。
- 同批钱包修复普通 checkpoint 刷新误使预览失效、精确费用失败时的确认门禁、单/双 Felt FT 公开调用与累计账本适配、地址十六进制解析和小窗口布局。
- 同批 Services 把实时消息与历史重放分开，历史进度独立持久化，仅完整扫描成功后推进；增加真实 PostgreSQL、Redis 和本地 WebSocket 回归。

## 可复现的离线验证

冻结兼容的 `compile`、`compile_private`、`compile_market`、`compile_nft_market` 四个 release 编译器，放入外部目录。工具源码分别在既有 VM tests 的 `src/bin/` 中；使用锁定依赖和 `nightly-2025-09-20` 构建。不要复用旧产物目录。

```sh
node tests/security/prepare-six-contracts.mjs --compiler-bin /absolute/frozen/bin --out /absolute/new/artifacts
CARGO_TARGET_DIR=/absolute/isolated/rust-target node tests/security/run-six-contracts.mjs --artifacts /absolute/new/artifacts --out /absolute/new/results
```

要求支持项目依赖的 Node.js、Rust 工具链和本地 Cargo 依赖缓存。脚本记录输入源码、编译器和产物 SHA256，执行 JavaScript 回归、真实 VM、CFC/layout 与 SD-key 证明测试；失败退出非零。仅生成离线证据，不广播。Curve bootstrap 和测试付款人专用 fixture 已包含在准备及验收脚本中，三项测试默认执行，任何 ignored Rust 测试都会使验收失败。真实网络 UPS 和跨机器可用性不属于这套离线验证。

## 仍须明确的资金安全边界

1. SD-key fingerprint 认证完整调用栈、method ID 和参数；当前协议没有给该 gadget 认证可调用合约的 code/layout root。执行器检查 roots 只能约束遵守检查的执行器。公开私钥允许任何人提交满足 fingerprint 的交易，因此升级者替换同 ID 实现属于实际信任边界。生产使用须有经核验的不可升级保证或明确接受的升级权限治理；应用代码不能单独消除这一边界。
2. 跨用户读取可来自历史 checkpoint。退款、撤单与委托关闭的安全性依赖付款人累计游标和调用者当前状态；委托撤销仍是合作关闭，不能宣称单方面即时冻结 spender。超时也不能安全追回已转给永久离线接收人的 NFT。
3. 需要独立合约/密码学安全审计。本文的不同模型代码审查和自动回归不等于独立安全审计，也不构成六合约端到端安全证明。

以下历史记录保留；时间较早的“仍需验收”应与新增证据一起阅读。

---

# 生产验收边界

本仓库当前仍不声明 mainnet production ready。部署、回归和测试网结算是工程证据；它们不代替独立审计、生产运行验收或权限治理。

## 按模块检查

| 模块 | 工程证据 | 上线前仍需验收 |
| --- | --- | --- |
| U124 FT | 两个 62 位 limb；18 位精度；公开版实际字节码和三市场交易；[新增私有版本地验证](token/wide/private/README.md) | 独立审计、发行及升级权限治理；实际浏览器隐私转账与领取已在 2026-10-15 验证 |
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
