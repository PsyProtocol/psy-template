# 检查点读取故障与原批次续跑前缀

本归档是阶段证据，**不是成功性能配对或整轮资产守恒验收**。原目录 `fixed-verifier-performance-live-v4` 不覆盖；完整续跑及领取结果待另行审计。

原 fresh 基线在两份订单与首笔费用准备确认后、预热和队列冻结前，公开检查点读取耗尽传输重试而退出。实际 **3 UPS、0 成交、3.000015 测试 PSY**；QA FT 为 2483/2484，不是既有 pUSDT。资源观察器在失败后关闭。ACK 与精确包含证据分开保存。

应用增加 `checkpointHeads`：仅对明确 `ReadUnavailable` 的整组检查点读取再尝试一次，丢弃失败组全部结果，先排空并发读取；不重试签名、证明、发送或业务动作。现有单 RPC 三次有界重试保留；总共最多两组。鉴权、数据、JSON 格式及身份错误不进入此恢复。正常读取无额外 RPC，观测失败不影响金融校验。

手动 `resumePreEpochComparison` 仅接受三笔原请求均精确确认、完整证明重新验证、当前用户 nonce/端点一致、原金库未变、相同网络和依赖，以及恰好一份原未用费用授权。任何新阶段、封口计划、额外入金、已用授权或错误目标均拒绝。三笔已确认操作不重新签名/发送；后续任务生成新状态上下文。

首次续跑因无损 JSON 对象原型差异拒绝，保留原报告；第二代统一无损比较并通过三份真实完整证明及端点/授权守卫。外层首次诊断还因误用金融整数序列化器记录小数计时失败，未改变金融动作；新专用父入口使用观测序列化器，并总是记录成功/失败墙钟结果。相关 **21 项回归通过**，数量不等同于生产级结论。

复现回归：

```sh
node --test executor/checkpointHeads.test.mjs executor/publicState.test.mjs executor/readRetry.test.mjs executor/acceptance/preEpochResume.test.mjs
python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-26-checkpoint-read-recovery-v1 --original-base /path/to/psy-market-recovery-20261023
```

`SUMMARY.json` 是原 `INTERRUPTED-PREFIX-v1.json` 的逐字节副本；`manifest.json` 映射每份原件和压缩哈希。`PUBLICATION-CHECK.json` 核对实际私钥字符串与已消费 nonce；仅归档这三笔已确认载荷，不含继续执行中的请求。`BOUNDARIES.json` 核对固定 SDK 1466 份来源及 Node 既有差异未变。没有 SDK 迁移、Node 修改或旧合约代码/布局更新。

重启已破坏常驻资源连续性；本轮后续结果属于恢复验收，不能放宽干净配对门槛、补造冷启动计时、跳过独立证明审计或宣称加速/TPS。RPC 根因、运行服务镜像/升级授权、跨机器协调和全市场抗审查不由本归档关闭。
