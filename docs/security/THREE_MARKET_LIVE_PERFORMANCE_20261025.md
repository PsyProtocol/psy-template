# 三市场真实成交与证明恢复验收（2026-10-25）

本轮沿用 `markets-batch-capacity-recovery-20261020` 和冻结 SDK；不改 Node，不更新已有合约代码/布局，不切换 SDK。原始文件与失败尝试全部保留。时间为 UTC；报告日期为台北时间。

## 结果与资金口径

- **3 笔经济成交、5 个订单成员、48 笔实际 UPS 回执、51 份不同完整证明**，独立验证通过。
- 普通签名 QA 钱包两笔领取均确认于 **376332**；本轮新金库与两名交易者之间的 FT 待领取余额清零，NFT 仅归属买家 **406720**，token ID 与 metadata 不变。
- 8 个已知账户/金库的两种 QA FT 总量各为 1000；逐账户、金库净变化和 Native 费用守恒均核验。范围是本次有限账户集合。
- 资产为 QA FT-A **2483**、QA FT-B **2484**（均 18 decimals）及 QA NFT collection **2496**。费用使用测试 PSY（9 decimals）；**未使用既有 pUSDT**。

| 市场 | 合约 / 金库 | 成员 / 成交 | 承诺确认 | 结算确认 |
|---|---|---|---|---|
| Orderbook | 2497 / 662720 | 2 / 1 | 375695 | 375801 |
| Bonding Curve | 2498 / 302272 | 1 / 1 | 375675 | 375786 |
| NFT Market | 2499 / 1072320 | 2 / 1 | 376149 | 376278 |

Owner 1717440 净增 5 QA-A、QA-B 不变；Buyer 406720 净减 4 QA-A、1 QA-B，并取得唯一 NFT；Curve 金库净减 1 QA-A、净增 1 QA-B。Book/NFT 金库及两座既有 AMM 资产金库的 FT 净变化为零。Curve 的 2 QA-B 上限实际支出 1，剩余 1 已领取退款。

费用：快照区间 38 笔 UPS 共 **38.000412 测试 PSY**；此前准备 10 笔共 **10.000077**；本案例实际 48 笔合计 **48.000489**。只读证明对照与拒绝测试不广播、不收交易费。

## 本轮代码改造

- 完整、已验证的密码学 UPS 在最终公共读取前持久化；`liveGuardsPending` 与最终成功检查分开记录。保存证明本身不授权广播。
- 最终只读失败或父进程在 journal `proved` 前退出后，按 driver / task / policy / RPC config 精确绑定查找候选，由 native 再验完整证明、调用栈、会话/sig_hash、费用、网络/代码/布局、起始状态、nonce 和期限，再复用原请求。重验失败停止，不自动重新证明/付款。未知广播仍先对账。
- 证明资源延迟到确实需要新证明时启动；缓存恢复不再无故构建另一套会话。常驻 scope 保持完整身份绑定、每 key 单任务与失败进程退出检查。
- 公共读取仅合并同时在途的相同请求；完成即移除，不跨任务缓存交易见证或 nonce。Rust 独立公共 guard 读取仍有 1/4 的受限并发。
- 已确认 nonce 冲突终结的旧任务会立即报告真实终态，避免等待旧回执。市场定价、撮合优先级、NFT 唯一成交、共享金库和确定性排序保持原语义。

## 性能数据与对照

### 真实成交（每市场一个薄批次样本）

| 市场 | 承诺→结算观测窗口 | 承诺+结算费用 / 测试 PSY | 提交响应→索引/共同状态观测：承诺 / 结算 |
|---|---:|---:|---:|
| orderbook | 19.62 分钟 | 2.000048 | 32.455 / 41.099 秒 |
| bondingcurve | 17.49 分钟 | 2.000045 | 22.660 / 35.700 秒 |
| nftmarket | 22.60 分钟 | 2.000072 | 32.771 / 27.673 秒 |

窗口针对实际包含的两个 UPS，包含准备、证明、检查、HTTP、轮询和本机调度，排除此前入队/资助及最终领取；NFT 包含故障注入的进程重启。此前失效任务、开发/构建暂停和恢复保留在全案例时间线中。**这些数据不是服务端纯出块时间、稳态吞吐或链 TPS；没有同条件旧版网络确认组。**

| 市场 / 阶段 | 实际调用数 | 完整 native 每任务预检 | SDK 调用证明（含内部读取） | 显式递归收尾 | end-cap | 完整证明验证 |
|---|---:|---:|---:|---:|---:|---:|
| 2497 / batch_commit | 3 | 293.331 s | 179.439 s | 9.346 s | 4.628 s | 3.052 s |
| 2497 / batch_settle | 11 | 345.911 s | 253.303 s | 33.434 s | 4.601 s | 3.047 s |
| 2498 / batch_commit | 3 | 167.756 s | 106.569 s | 8.937 s | 4.657 s | 3.024 s |
| 2498 / batch_settle | 8 | 277.426 s | 188.797 s | 24.389 s | 4.597 s | 3.137 s |
| 2499 / batch_commit | 3 | 190.930 s | 123.971 s | 8.997 s | 4.449 s | 3.014 s |
| 2499 / batch_settle | 12 | 326.449 s | 223.312 s | 35.738 s | 4.803 s | 3.087 s |

以上是 wall time；调用证明包含 SDK 内部 RPC、执行、证明及部分递归，不能当作纯 CPU。常驻进程启动的 key/session 构建另列在原始报告；native 内部未归因时间不擅自归到 RPC。

| 普通签名 QA 钱包领取 | 冷进程启动→提交响应 | 响应→索引/共同状态观测 | 费用 / 测试 PSY |
|---|---:|---:|---:|
| buyer-payout-claim-v1 | 224.940 s | 48.480 s | 1.000009 |
| owner-payout-claim-v1 | 228.781 s | 59.180 s | 1.000009 |

普通钱包冷进程总量包含构建、读取、证明、验证和 HTTP；当前旧版 ordinary 客户端内部未单独分离纯证明与 RPC，报告明确保留该缺口。

### 同输入组件对照

- Curve 初始化的一对完整 UPS：相同认证起点、完整 public core、nonce、费用和结束状态，暖态 native 预检 **98.504 s**，冷进程 **180.060 s**。冷态另含约 42.334 s key/session 构建和 7.353 s 历史源准备，调用阶段也存在抖动；这是一对样本，不能把总差值全归因于算法提速，更不能当网络加速。
- 同一份已验证 UPS 的 guard ABBA（每种两次）：Book 均值 **17.621→14.124 s**；Curve **16.378→15.373 s**。这是完整保存证明的提交前检查对照，不是重新证明性能。NFT 对照因原提交窗口耗尽而未完成，保留两个部分样本，不给加速结论。
- NFT 真实父进程重启：原密码学准备 **182.122 s**（最终检查另计），重启后 native 精确重验 **22.873 s**。原请求哈希不变，只有一份完整生成的证明、一次 journal `proved`、一次广播意图和一笔实际回执；无重复付款。两者阶段范围不同，不计算整体加速百分比。
- 合并读取的只读 ABBA：每次 4 个并发快照和 4 个固定 checkpoint 的同值叶读取。所有返回值相同。

| 顺序 | 逻辑尝试 | 物理 owner | 合并等待者 | wall time |
|---|---:|---:|---:|---:|
| baseline | 12 | 12 | 0 | 17.746 s |
| optimized | 16 | 4 | 12 | 39.835 s |
| optimized | 12 | 3 | 9 | 2.377 s |
| baseline | 12 | 12 | 0 | 9.537 s |

第一组 optimized 包含超时与重试，没有删掉慢样本；请求数减少，**延迟对照结果混合，不能声称整体读取提速**。这只是刻意重复的读取模式，不是整个 Executor 的加速。实际仪表记录 3,625 次 JS 逻辑尝试、3,536 个观测到的物理 owner、89 个合并等待者；不覆盖 SDK 内部读。

内存：13,086 个采样点，最大观测到的所选钱包进程 RSS 之和 **12.134 GiB**，主机 32 GiB。两个观察器版本之间有 **8.332 s** 缺测空隙。RSS 可能重复计共享页，包含同时运行的所选钱包/验证进程；不是独占内存、真实峰值或内存降低结论。缺失父进程端点显式记 null。

构建 v3 为同 SDK 缓存下的应用增量构建 **40.78 s**；不是 SDK 从零冷编译。一轮默认编译器尝试被停止，未发布或执行；保留日志，随后明确使用冻结 `nightly-2025-09-20`。

## 安全与恢复证据

- 首轮空队列超时：Book/NFT 按规则 abort；Curve 旧 admission 广播结果未知，直到同起始叶/nonce 4 的合法超时 abort 实际确认才终结旧请求。两份完整证明独立核验，journal 记 `resolved-by-confirmed-conflict`，没有谎称未广播。
- 订单/资金未重复创建：新 epoch 重新签入队同意，复用原始存款，已接受集合完整处理。
- NFT 真实进程重启、精确请求复用、一次确认，及**已消费 UPS 在未过期时被 native 起始状态/nonce 检查拒绝**；拒绝测试没有广播。
- 48 笔实际回执逐份核对 proof/core、费用与连续 nonce/状态端点；另核验冷对照和未选候选，共 51 份不同完整证明。篡改真实费用字段的 UPS 被独立验证器拒绝。
- 本轮 47 项客户端/adapter/resident 回归、20 项 journal/终态回归、Rust guard 两项及报告证据回归通过。测试数量不是生产级依据。
- 汇总器第一轮在 null-prototype JSON 的比较上停止；字段比较修正后全量重新验证。报告首次因缺失内存字段停止；改为 null 后重生并复现数值。原始失败日志和各代源码均保留。

## 未关闭项与性能边界

1. 缺少同条件旧版与新版的整段真实网络 A/B 及稳态/满容量负载组；本轮是各一笔薄批次的真实样本。整个资金快照区间约 5.07 小时，包含首轮失效、恢复、等待和应用修复/构建，不可当正常交易延迟或链容量。
2. 主要剩余成本：SDK 调用证明及内部读取、应用反复状态复核、普通签名客户端冷启动/费用准备；显式 end-cap 本身约 4.4～4.8 s，不能只优化它来宣称整段改善。普通客户端内部细分与 SDK 全冷构建仍缺测。
3. SDK 上游迁移/正式发行与运行镜像、升级授权信任证据仍是独立事项；本轮冻结依赖并核验，未迁移。
4. 本机日志/锁/重启证据不证明跨机器协调。确定性封口队列范围内完整性不等于全市场抗审查；认证未来随机源仍未接通。
5. 共享金库状态按可验证顺序演进；两个独立证明任务的并发与证明聚合不等于同池交易完全并行。未引入统一批价、流动性分片或 invoke_sync。

## 代码与可复验材料

- [完整证明持久化客户端](../../amm/u124/vm-tests/src/bin/compact_market_wallet.rs)、[恢复与原生重验](../../executor/preflightRecovery.mjs)、[正式 Executor adapter](../../executor/compactAdmissionAdapter.mjs)、[常驻资源](../../executor/residentScope.mjs)、[在途读取合并](../../executor/readSingleFlight.mjs)。
- [真实重启验收入口](../../executor/acceptance/resumeDurableNftV2.mjs)、[已消费证明拒绝测试](../../executor/acceptance/rejectConsumedNftProof.mjs)、[独立审计](../../executor/acceptance/auditThreeMarkets.mjs)、[性能报告生成](../../executor/acceptance/reportThreeMarketPerformance.mjs)。
- 最终 [关闭索引](../../executor/verification/2026-10-25-three-market-performance-complete-v1/ACCEPTANCE-CLOSED.json)、[审计摘要](../../executor/verification/2026-10-25-three-market-performance-complete-v1/AUDIT-SUMMARY.json)、[性能 JSON](../../executor/verification/2026-10-25-three-market-performance-complete-v1/PERFORMANCE.json)、[读取 ABBA](../../executor/verification/2026-10-25-three-market-performance-complete-v1/READ-ABBA.json)、[依赖检查](../../executor/verification/2026-10-25-three-market-performance-complete-v1/DEPENDENCY-CHECK.json)、[原始压缩清单](../../executor/verification/2026-10-25-three-market-performance-complete-v1/manifest.json)。
- 冻结 SDK：`batching/dependencies/session-bound-sdk-20261020/manifest.json` SHA `0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`。全部 1,466 个源码哈希、配置和原 Node diff 均核验未变。
- 原客户端 SHA `bb15dc44…6e520`；本轮 durable 客户端 SHA `39be37cc…3c02f`；独立验证器 SHA `95344886…9cf`。完整值在 TOOLS/RELEASE 及依赖检查中。Book/Curve 真实成交使用原应用版本，NFT 使用 durable 版本；共同 SDK 与市场语义相同，但不是同条件整段版本 A/B。

原始机器目录：`/Users/geir/Downloads/QED资料/litepaper/psy-market-recovery-20261023/three-markets-performance-live-v1`。最终审计 `independent-verification-v2/SUMMARY.json`，最终报告 `public/PERFORMANCE-v3.json`。独立原生二进制不放进 Git；提供源码、冻结构建记录与 SHA。钱包、私钥和恢复文件不在证据包。

只读复验（需要按冻结依赖构建的本机工具；输出目录必须全新）：

```sh
python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-25-three-market-performance-complete-v1
# 上面仅验证压缩/原始字节，不替代密码学验证。
# 原机器可重验原始请求；其他路径需按 manifest.records 找到并解压 request.json，
# 用冻结 SDK 编译的 verify_saved_ups 验证，不能改写原请求或把路径重建当成新提交。
PSY_CASE_DIR='/Users/geir/Downloads/QED资料/litepaper/psy-market-recovery-20261023/three-markets-performance-live-v1'
PSY_REVIEW_LABEL=review-$(date -u +%Y%m%dT%H%M%SZ)
PSY_FRESH_AUDIT_DIR="$PSY_CASE_DIR/independent-$PSY_REVIEW_LABEL"
PSY_FRESH_REPORT="$PSY_CASE_DIR/public/PERFORMANCE-$PSY_REVIEW_LABEL.json"
node executor/acceptance/auditThreeMarkets.mjs "$PSY_CASE_DIR" "$PSY_FRESH_AUDIT_DIR"
node executor/acceptance/reportThreeMarketPerformance.mjs "$PSY_CASE_DIR" "$PSY_FRESH_AUDIT_DIR/SUMMARY.json" "$PSY_FRESH_REPORT" "$PSY_CASE_DIR/public/RESOURCE-SEGMENTS-v1.json"
```

此处为已完成案例的只读复验入口。带资金的恢复入口会检查 COMPLETE 并拒绝重跑；新网络/新案例仍需重新配置隔离身份、部署与资金，不是无配置通用发行。
