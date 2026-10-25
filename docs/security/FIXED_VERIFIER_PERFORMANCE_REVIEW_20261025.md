# 固定验证资源复用与暖态回退调查（2026-10-25）

沿用 `markets-batch-capacity-recovery-20261020` 与已选 session-bound SDK；不修改 Node、SDK、市场定价或旧合约代码/布局。原始构建、请求和回执不覆盖。

## 上一轮回退归因

基于已关闭的 `prover-memory-performance-live-v1`。每轮两成员、一笔实际 Orderbook 成交、17 UPS，并非四市场容量验收。

四次暖态费用准备，平均每项阶段差值：

| 阶段 | release-unused 相对 retain |
| --- | ---: |
| 会话初始化（含 SDK 读取） | +3.660 秒 |
| 调用证明（含 SDK RPC） | +2.075 秒 |
| 签名和 end-cap | +0.147 秒 |
| 完整证明验证 | -0.057 秒 |
| 提交前状态检查 | +1.470 秒 |
| 广播到 HTTP 结果 | +3.780 秒 |

这四项均已暖机，没有再次构建 WalletSession 电路。固定验证库仍在每次完整验证时重建，约 3.1 秒，但它不是上一轮变慢的全部原因。初始化/证明阶段未区分 SDK 内部 CPU 和网络等待，不能从该实验认定全部回退由分配器或 RPC 引起。

整轮 2255.177 → 2694.058 秒，增加 438.881 秒。按实际验收脚本的串行依赖预算分解：普通钱包临界区间 +295.974 秒，市场成功执行步骤 +63.539 秒，协议 cutoff +58.416 秒，其余读取/规划/快照与计时边界 +20.952 秒。并行对取真实起止区间，不把并行任务耗时相加为墙钟时间。

复现：`executor/acceptance/diagnoseWarmFees.mjs CASE FRESH_REPORT`；报告记录源文件 SHA256，不改旧证据。

## 本轮应用修改

`fixed_verifier.rs` 为同一二进制/冻结 SDK 内的固定 Node end-cap key 与 common data 提供 `OnceLock`。只保存不可变电路验证资源，不保存证明验证结果、见证、用户/市场状态、nonce、费用、交易或签名。SDK 的 `get_cached_common_data_library` 实际每次创建四类 lookalike 电路；缓存只保留所需 common data，不保留整个临时 prover 库。

每次访问校验显式网络 profile 与编译网络域。每笔请求重新执行完整证明验证，实际会话 verifier key 仍与固定 key 比较；调用栈、sig_hash/会话绑定、caller、参数、费用、状态端点、依赖根、nonce 和有效期检查不放松。市场/普通签名者的外层 resident 绑定与状态隔离保留。没有磁盘反序列化缓存或外部提供的 verifier key。

`fixedVerifierMode` 只接受 `fresh-v1` 或 `cached-v1`，属于 resident 环境身份。错误模式失败，不降级跳过验证。默认 `cached-v1`；原 `proverMemoryMode` 默认仍为 `retain-v1`。

首个访问仍需构建固定库；短命的 verify-prepared/broadcast-prepared 子进程各自仍有该开销。这里不宣称消除了所有冷构建或实现跨进程缓存。

## 验证进展

- 固定 key/common 缓存与原 SDK 现场构建对象严格相等；无关电路证明在两路径都被拒绝。
- 已完成相关 JS 回归 53 项；完整真实证明篡改/网络域回归及新真实成交配对验收进行中。
- 新配对：同一二进制、SDK、机器、两线程、`retain-v1`；唯一主动变量是 `fresh-v1` 与 `cached-v1`。各轮一笔实际撮合、普通钱包领取和独立全证明/费用/资产守恒审计。QA 资金准备独立记录，不计入性能结果。
- 目前尚无本轮端到端加速、确认吞吐或生产级结论。最终结果将在完整回执、状态和证明审计关闭后追加。

外部边界保持：运行服务镜像身份/升级授权未由本轮证明；无跨机器协调或全市场抗审查结论；保持确定性排序；不存在认证随机源的新交付。

## 首轮网络中断与恢复

`fixed-verifier-performance-live-v1` 在承诺 UPS 已获 HTTP 结果后，回执列表读取连续返回 HTTP 500。原父进程安全退出，原证明、请求和广播身份保留。使用只读 `reconcileComparisonOriginal.mjs` 确认原承诺已包含，没有再次 prove/submit。随后仅完成该批次剩余的结算和普通钱包领取。

该恢复轮已独立验证 17 个实际 UPS、一笔成交、普通钱包领取、资金守恒和费用。因为发生进程退出与资源重建，整轮排除在干净的缓存性能配对之外；不补造缺失的父进程计时，也不覆盖 cutoff 或原失败日志。

应用修复：`receiptReader` 对耗尽有界重试后的纯读取不可用返回明确 `unresolved/readUnavailable`，保留原广播 gate，允许后续按相同身份轮询。只捕获 `ReadUnavailable`；HTTP 401、无效身份、结构/认证错误仍抛出。返回未知不是交易拒绝或重签授权。父日志输出 `PSY_RECEIPT_READ_UNAVAILABLE` 以统计实际故障次数。长期不可用仍受上层轮询预算限制。

新增故障回归及相关测试 28 项通过：三次 HTTP 500 不产生其他请求，下一轮精确恢复；401 不吞掉。新的 `fixed-verifier-performance-live-v2` 使用相同修复后的读取路径和同一二进制做配对，引用原 QA 资金准备及恢复审计，没有另行充值或替换旧业务操作。配对还在运行，结果待审计关闭。
