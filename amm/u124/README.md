# 三个市场的 U124 升级版本

本版本适配 `token/wide` 的 `[low62, high62]` 金额，金额上限为 `2^124 - 1`。Token 可采用 0–18 位 decimals；市场计算始终使用原始整数单位。交易资产 A/B 都必须是新 U124 Token。原生 PSY（合约 0）单独支付手续费。

| 市场 | 升级内容 | 公共方法 |
| --- | --- | ---: |
| AMM | 双向兑换、初始/追加流动性、LP 份额与提取、付款人撤回 | 16 |
| Orderbook | 两资产精确成交、限价检查、独立付款人游标、撤销 | 7 |
| Bonding Curve | 双 Felt 库存与报价、买卖、过期/过时报价退款、毕业交接 | 11 |

代码位于 `amm/u124`、`orderbook/u124`、`bondingcurve/u124`。公共整数生成器、构建工具和 SD-key 驱动位于本目录。新版本已使用新合约及新 SD-key 金库部署并完成真实结算。原有三个市场、原生 PSY/pUSDT、Node、正式 MCP 和原 executor 保持原状。真实测试使用新 U124 资产 2431/2432（18 decimals）；市场 ID 为 AMM 2434、Orderbook 2435、Curve 2436。完整结果见 [2026-10-13 真实结算报告](deployments/staging-2026-10-12/continuation-2026-10-13/REPORT.md)。

## 合约与 SD-key

- 合约验证用户签名订单、累计 Outbox 的**两个 limb**、nonce、期限、价格和库存/储备，并更新游标。
- SD-key 固定整组 **9 个调用**：市场 guard、手续费/资产 claim、指定收款人的 transfer、noop 填充、最后一个自动 PSY burn。
- 任意人可以执行公开 SD-key，退款目的地固定为原付款人。仅修改高位金额、插入转账、替换资产、改变调用顺序或改收款人都不满足 fingerprint。
- 每位用户一次挂一个订单；nonce 与结算游标使成交/退款竞争只能有一个成功。Curve 另外绑定 `expected_sold`，过时报价仍可退款。
- 无 `invoke_sync`。调用者提供兑换/LP 结果，合约用整数乘积和上下界验证确切的向下取整结果。

金额加减校验 62 位 limb、进位、借位和溢出。乘积使用 30 位内部 digit，保留完整 248 位乘积及加权报价的更宽结果；每列中间值小于 `2^63`。计算不将 U124 合并为一个 Felt，不使用 JavaScript Number 处理金额。

AMM 仍收取 30 bps，初始锁定 1000 个最小 LP 单位，追加流动性要求精确比例，避免舍入转移价值。Orderbook 仍采用精确整单成交。Curve 使用离散线性价格，`cap/liquidity` 各不超过 1,000,000 lots；`unit/base/step` 是 U124，构建时检查总库存和全曲线报价不溢出。

## 外部 ABI 与证明高度

新 Token 的 Outbox 为 offset **33554453**、stride **4**，`amount_sent` 为两个 Felt；状态树高度 **31**。原生 PSY Outbox 为 offset **3**、stride **2**、单 Felt，读取高度为 **32**。

当前 DSL 编译器的 typed foreign read 会沿用市场自身高度。应用构建工具 `vm-tests/src/lib.rs::compile_market` 为原生 PSY 的读取注入常量高度 32，保留市场/新 Token 的高度 31，并重新生成字节码。此过程不修改 Node 或编译器仓库。构建 pass 保证 Felt targets 密集编号。新的 `ranges.rs` 把 close 的双 Felt self-external range 读取降为两个交易内的 single 读取，避开冻结 SDK 的 range 缓存键错误，并保留同一 UPS 内前序调用的状态变化。`artifactGate.mjs` 检查两个读取的位置、高度、密集引用、金额宽度、布局、方法及入参数量。**旧 v6 实例仍采用 UPS 起始快照读取，close 需独立执行；新构建的同笔领取关闭须以对应真实 UPS 验证为准。不得部署原始 DSL 编译器输出，应使用下面的构建入口。**

## 构建

先用已核验的 SDK 编译应用工具；此仓库要求 `psy-node` 位于 `psy-template` 的同级目录。

```sh
CARGO_TARGET_DIR=/private/tmp/psy-u124-target cargo +nightly-2025-09-20 build \
  --offline --locked --release --manifest-path amm/u124/vm-tests/Cargo.toml --bins

node amm/u124/build.mjs \
  --config config.json --market-ids market-ids.json --out /private/tmp/u124-build-new \
  --compiler /private/tmp/psy-u124-target/release/compile_market \
  --token-a token-a-compilation_artifact.json --token-b token-b-compilation_artifact.json
```

配置示例见 `verification-2026-10-12/fixture-config.json`。其中 Token 42/43、市场 1000/1001/1002、issuer 5、target 400 **仅为本地测试编号**。真实构建需提供两份实际 U124 Token ABI、实际 Token ID、预期新市场 ID，以及 Curve 的 issuer/target 和经济参数。构建生成新目录、各市场的完整编译产物、固定 SD-key policy 和 provenance；拒绝覆盖原目录。

## 客户端与执行

`client.mjs` 提供 BigInt 金额编码、兑换/LP/Curve 报价、精确整单匹配、ABI 调用、付款计划和无损 JSON 编解码。`orderbook/u124/client.mjs`、`bondingcurve/u124/client.mjs` 是对应入口。`closeCall` 按实际订单类型/资产选择独立关闭方法，不读未使用 Token。RPC 响应应先经 `parseLosslessJson`，禁止普通 `JSON.parse` 把金额转换为 Number。ABI/编译产物由 Rust 原样保存；JS 的 ABI 检查不重写这些产物。

`policy.mjs` 的 witness 顺序：

```text
branch, payer, peer, x_low, x_high, y_low, y_high,
z_low, z_high, lots, nonce, peer_nonce, actual_fee
```

`makePolicy` 从新 ABI 生成整组调用形状。`signingRequest(policy, fields)` 生成八个显式调用及签名参数，第十三项可置 0，驱动会填入 SDK 实际自动烧费（`1e9 + DA_slots*1000`，最多 100 slots）。Orderbook 成交时将第二位卖家的完整手续费押金返给该卖家，第一位卖家承担网络费用；其他操作的未烧费余量留在金库，不计入交易储备。

驱动只使用公开 SD-key 值，不导入普通钱包私钥：

```sh
market_wallet fingerprint policy.json
market_wallet preflight policy.json calls.json rpc-config.json
```

`preflight` 完成本地证明并独立验证 UPS endcap，不提交。驱动还实现 `register` 和 `submit` 两个显式入口。`market_wallet` 与 `market_wallet_verified` 共用驱动；两者的 `submit` / `verified-submit` 都独立验证将提交的同一份完整 UPS 证明，检查最新用户锚点及 nonce 后提交一次。

调用数量、绑定市场和金额 limb 的检查在 RPC 初始化前完成。SDK 的金额范围 panic 会丢弃整个证明会话，返回 JSON 错误 `invalid_amount_range` 和退出码 1；不会继续签名或广播。其他未知 panic 返回 `sdk_runtime_panic`，不输出 panic 原始内容。该处理位于应用驱动，冻结 SDK 内部仍可能产生 unwind。

驱动发送前输出并 flush `broadcast_intent`（`userId`、`nonce`、`endUserLeafHash`）。发送开始后遇到错误会返回 `submission_unknown`、`submitted:null`，必须按该叶哈希查询回执。此输出本身不是持久日志；运行时应通过 `executor/journal.mjs` 在广播前持久记录意图，并阻止未对账金库继续执行。单机金库锁和链上 nonce/锚点分别负责执行者协调和竞争证明判定。

补强结果见 [错误处理、边界与并发验证报告](verification-2026-10-13-hardening-01/REPORT.md)。该报告包含真实状态非法报价拒绝、本地多执行者争用测试及[外部审计交接材料](verification-2026-10-13-hardening-01/AUDIT_HANDOFF.md)。本地并发测试不表示已经测出链上 TPS。

## 验证与测试网发布边界

2026-10-12 离线初版结果见 [REPORT.md](verification-2026-10-12/REPORT.md)：JS 校验、实际市场+Token 字节码生命周期、大整数 op-gadget 证明、SD-key 正反例证明及全部 CFC 构建。原生 PSY 在 VM 生命周期中使用记账 oracle；该离线初版当时未进行部署、注册、充值或广播。后续真实验证已完成 64 笔链上用户交易、12 笔经独立完整 UPS 验证的 SD-key 结算与 5 项未提交的拒绝测试，见上面的真实结算报告。

该布局与现有测试网单 Felt 市场不兼容。发布时应使用**新市场合约与新 SD-key 金库**，逐个确认新 Token 的代码/布局根及高度、独立验证初始布局证明、注册对应 fingerprint，再执行真实状态 UPS 预检与小额交易。不得将本版本作为旧合约的就地 layout 更新。原来的测试网资产、订单和资金不能通过直接改布局自动迁移。

The [2026-10-14 live report](../../executor/verification/2026-10-14-resume-01/REPORT.md)
confirms all three same-UPS claim/close paths on fresh contracts 2443/2444/2446,
Curve graduation seeding a predeployed AMM, and two real executors recovering
a proof-owner crash without duplicate broadcast or asset movement.
