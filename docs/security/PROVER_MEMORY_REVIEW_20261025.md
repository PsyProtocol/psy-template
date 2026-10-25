# 完整证明与常驻资源内存验收（2026-10-25，已闭环）

## 结论与范围

内存释放策略已接入正式 Executor；**默认保持关闭，macOS 可明确选择 `release-unused-v1`**。本轮证明了回收点 RSS 与任务结束后的常驻 RSS 下降，**没有证明整体结算更快**。候选普通钱包的多项耗时及整轮耗时反而更长，不能以少量证明阶段变快宣称全面性能提升。

沿用 `markets-batch-capacity-recovery-20261020`。SDK 固定为 `0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`，1,466 个消费源码文件在开始与结束核验一致；不改 Node，不换 SDK，不更新合约代码／布局，不覆盖原始产物。

这是四市场共用证明／Executor 代码的改进；本轮新增真实配对使用**同一个隔离 QA Book 2497／金库 662720**，每轮 2 成员、1 笔成交，每方 1 QA FT。没有声称四市场都重新完成了本轮验收、最大批次验收或跨机器协调。

## 实际修改

1. 普通钱包使用独占创建、同步落盘的 lifecycle JSONL，记录启动、进程、ready、派发、原生返回、身份检查和完成。即使原生 ACK 后客户端失败，也保留已观察的时刻；原请求结果不明时，不自动重签或重复付款。
2. 严格资源观察器按发布清单 SHA256 识别普通钱包、完整市场证明器和 sealed 副本，修复上一轮遗漏完整市场进程的问题。保存观察器／发布清单身份、PID、父 PID，每秒采样；日志流式写出。
3. 应用侧在取得拥有所有权的完整证明／end-cap 输入后，释放交易会话，再进行完整验证、最终依赖／nonce／状态检查和提交。公共电路继续常驻。macOS 分配器仅回收未使用页，未复用旧状态证明、见证、nonce 或签名。
4. `proverMemoryMode` 属于正式 Executor 配置与资源绑定；未知模式拒绝，不通过放松完整调用栈、会话、费用、固定 Node verifier/common 或状态端点校验兼容旧版。非 macOS 的新驱动明确拒绝回收模式。
5. JSONL 已进入归档与钱包材料检查，避免新的冷启动证据被归档器遗漏。

使用本轮 SHA 固定的驱动时，可在 compact admission Executor 配置中明确设置：

```json
{"proverMode":"resident","proverMemoryMode":"release-unused-v1"}
```

默认 `retain-v1`。不能把该配置当作任意历史驱动已支持回收的能力声明；当前已验收驱动身份在归档 `RELEASE.json` 中。

## 同条件实测

两轮使用同一机器、同一 SDK、同一二进制、相同应用源码闭包、2 个 Rayon 线程／原生进程、同一 QA 实例和成交量；两轮都使用常驻资源。交易见证和状态逐笔新建。两轮之间余额、Outbox、nonce 和状态链连续性已核验。

| 指标 | retain-v1 | release-unused-v1 |
|---|---:|---:|
| 原生证明进程采样 RSS 合计最大值 | 12.452 GiB | 12.011 GiB |
| 普通钱包任务完成后 RSS 中位数 | 1525.4 MiB | 1374.1 MiB |
| 市场证明任务完成后 RSS 中位数 | 1853.4 MiB | 1723.6 MiB |
| Executor Node 进程阶段端点最大 RSS | 489.9 MiB | 537.9 MiB |
| 公共电路构建，4 次／轮 | 41.62～42.18 秒 | 41.69～42.04 秒 |
| 新进程卖方／买方订单任务 | 135.850／131.527 秒 | 148.266／166.146 秒 |
| 4 次暖态费用准备平均任务耗时 | 61.829 秒 | 72.872 秒 |
| 承诺完整证明准备 | 146.363 秒 | 124.601 秒 |
| 结算完整证明准备 | 194.674 秒 | 202.207 秒 |
| 承诺＋结算完整证明准备 | 341.037 秒 | 326.808 秒 |
| 承诺 ACK→索引及共同可见 | 34.423 秒 | 39.041 秒 |
| 结算 ACK→索引及共同可见 | 77.374 秒 | 35.693 秒 |
| 卖方普通钱包领取端到端 | 142.352 秒 | 138.358 秒 |
| 买方普通钱包领取端到端 | 142.326 秒 | 153.336 秒 |
| 协议截止等待 | 0.411 秒 | 58.827 秒 |
| 实测整轮，含读取／等待／快照 | 2255.177 秒 | 2694.058 秒 |
| 实际成交数／实际 UPS | 1／17 | 1／17 |
| 实际测试 PSY 费用 | 17.000115 | 17.000119 |

所有 22 个普通钱包任务都保存了完整外层时间与 lifecycle；8 个新进程的电路构建、76 个构建／证明／会话清理 RSS 回收点均完整。上一轮两笔缺失的历史外层时间仍保留为缺失，未从日志反推填补。

候选回收调用前后，普通钱包任务清理的 RSS 中位数由 1539.3→1374.1 MiB，市场任务清理由 1888.8→1723.6 MiB；retain 对照回收点基本不变。API 耗时中位数约 51～199 ms，包含在外层任务计时中。分配器返回的 advisory released-bytes 为 0，**不用于计算收益**，以实际 RSS 前后读数与独立采样为准。

### 测量限制和取舍

- 采样 RSS 包含空闲常驻进程与共享页，最大值不是真实瞬时峰值、整机物理占用或独占堆分配量；Node 端点另列，未把不同时刻峰值相加。
- 冷启动指新进程重新构建 SDK 电路；OS／SDK 磁盘缓存未清空，Cargo 构建 45.07 秒属于另一项构建证据。
- 完整证明准备包括 SDK 内部 RPC、调用证明、递归及 end-cap；不是纯 CPU／VM 速度。原始分项均保留。
- 单次顺序配对、起始余额／nonce 不同，RPC、确认与 OS 压缩会波动。采样峰值下降约 3.54%，不能推导普适峰值改善。暖态费用准备变慢、Node 端点增加、结算证明变慢及整轮增加均如实保留。
- 此模式适合明确选择内存取舍的运行配置；本轮没有支持将其设为默认或宣称整体加速的证据。

## 安全与真实验收

- 50 项 JS 回归通过，包含并发门、改换身份／SDK／依赖、原生 ACK 后客户端失败保留时间及禁止替代付款、精确回执对账和资源生命周期。另有 2 项原生模式／活跃缓冲区测试、1 项 JSONL 归档与钱包材料拒绝测试。数量不能替代实际证明与财务核验。
- 两轮共 34 个实际 UPS／34 个独立请求，全部由固定 Node key/common 的独立原生验证器完整核验；统计／费用／状态端点匹配。无孤立的额外完整请求、未决付款或重复付款。
- 两位用户实际普通钱包领取成功；每轮各 −1 输入 FT／+1 输出 FT，有限 QA 账户和 Outbox 的 FT 与 native 总额守恒，NFT 身份和元数据不变。两轮中间没有插入额外资金操作，4 个签名账户的 nonce／状态链连续。
- QA FT 2483／2484 各 18 decimals；native 测试 PSY 0 为 9 decimals；QA NFT 2496 未移动。既有 pUSDT 未使用。
- 独立准备：从自有 QA 卖方转 10 测试 PSY 给自有 sponsor 并普通领取。2 个原始 UPS 单独完整验证，费用 2.000004 PSY，不计入配对性能。准备脚本在原始 transfer ACK 后停止以纠正 native claim 方法；通过原请求对账恢复。父端恢复工具的两次失败没有创建替代 transfer 或额外 claim；已保存的 helper 失败源码／日志保留。最初 inline 父脚本和一次 EEXIST 的原始终端输出未归档，未冒充原件；实际原生生产者源码／二进制身份、精确输入、wire、证明和回执完整。见 `SETUP-RECOVERY-NOTES-v1.json`。
- 本轮总实际费用 36.000238 测试 PSY（配对 34.000234＋准备 2.000004）。全部请求、回执、身份、状态根、费用、源码与失败恢复记录归档；钱包文件与密钥未归档。

### 双 Felt 费用差异的证据

候选多 0.000004 PSY。累计 claim 游标跨越 `2^62`，Book 输入领取两条及用户输出领取两条 high limb 从 0→1；claim 的 low 位于 4-Felt 叶的偏移 3，high 位于下一叶偏移 0，恰好新增 4 个 DA 叶，每叶 1000 native atoms。send low/high 与余额 low/high 同叶，不能把每个新增 high scalar 都算成新增 DA 叶。实际回执和请求 SHA 在 `U124-FEE-EXPLANATION-v1.json`，没有将其归因于内存策略。

## 尚未解决

公共电路构建仍约 42 秒、每个常驻 SDK 仍保留数 GB 公共资源；本轮未缓存固定验证 common data，完整验证仍约 3.1 秒／次；完整调用证明、递归及 SDK 读取仍占主要成本。真实确认和协议等待仍影响端到端性能。

仅本机 macOS、单次 Book 薄批次配对；未重新做四市场最大容量、跨机器、长期内存稳定性或高负载吞吐验收。随机排序、全市场抗审查、实际 Node 镜像／升级授权的既有外部边界未由本轮关闭。不能宣称生产级或链上 TPS 提升。

## 报告、源码与重现

- [构建与回归证据](../../executor/verification/2026-10-25-prover-memory-build-v1)
- [完整真实成交证据](../../executor/verification/2026-10-25-prover-memory-complete-v1)
- [逐项性能与内存](../../executor/verification/2026-10-25-prover-memory-complete-v1/MEMORY-PERFORMANCE.json)
- [完整费用与验收闭环](../../executor/verification/2026-10-25-prover-memory-complete-v1/ACCEPTANCE-CLOSED.json)
- [双 Felt DA 费用解释](../../executor/verification/2026-10-25-prover-memory-complete-v1/U124-FEE-EXPLANATION.json)
- 代码入口：`executor/config.mjs`、`executor/compactAdmissionAdapter.mjs`、`executor/ordinaryResident.mjs`、`amm/u124/vm-tests/src/prover_resources.rs`。
- 验收入口：`executor/acceptance/runProverMemoryComparison.mjs`，串行执行 retain 真成交→完整审计→release 真成交→完整审计；异常停止，不自动恢复金融任务。源闭包在执行前独立冻结。
- 复核工具：`auditRpcOrdinaryComparison.mjs`、`auditMemoryFunding.mjs`、`reportRpcOrdinaryComparison.mjs`、`reportProverMemory.mjs`、`verifyCompactArchive.py`。构建命令、完整源码、解析后的 SDK 路径及固定工具链在构建归档 `RESOLVED-BUILD-v1.json`。

原始持久目录 `psy-market-recovery-20261023/prover-memory-performance-live-v1` 已关闭；以后不能在这个目录重跑金融验收。新轮次使用新的目录，保留原始请求与证据。
