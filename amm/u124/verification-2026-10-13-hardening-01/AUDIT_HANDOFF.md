# U124 三市场审计交接

日期：2026-10-13。机器：本机 macOS，仓库 `/Users/geir/Downloads/QED资料/litepaper/psy-template`。分支 `main`，基准 commit `aaaaad2762ab589c3259f0f538e2424780a68334`；本轮补强尚未提交，**以 SOURCE_AND_TOOL_HASHES.json 和 SHA256SUMS 定义实际交接版本**。本文是内部准备材料，尚无第三方审计结论。

## 范围和身份

| 产品 | 合约 | SD-key 金库 | 真实测试资产 |
| --- | ---: | ---: | --- |
| AMM | 2434 | 490560 | U124A 2431 / U124B 2432 |
| Orderbook | 2435 | 1539136 | 同上 |
| Bonding Curve | 2436 | 1014848 | 同上 |

两个资产均为 18 decimals、两个 62-bit limb；原生 PSY 仅用于手续费。完整代码根、布局根、状态树高度及 checkpoint 保存在 live-roots.json。固定 fingerprint 的核验在 CLI_RESULTS.json。公共 SD-key 的签名材料有意公开，安全性取决于 fingerprint 对整组调用的约束。

交接材料包括公开的部署源码和编译产物快照 `source/deployed-v6/`、本轮应用驱动与测试快照 `source/application/`、新鲜离线 fixture 的构建来源、日志和哈希清单。钱包私钥、助记词、恢复文件不在交接范围。大型 source/bin/fixture 目录通过本目录 .gitignore 排除；完整本地包通过 SHA256SUMS 识别。

## 建议重点复核的不变量

1. **数值完整性**：每个 limb < 2^62；金额加减不溢出/下溢；248-bit 乘积和更宽加权乘积不被 Goldilocks 模域运算截断；向下取整唯一性、最小输出和 LP 锁定 1000 原始单位。
2. **资产归属**：Outbox sent/claimed 的两个 limb 与用户订单对应；重复或伪造充值不能被 claim；退款目的地固定原付款人；Token/native 布局和读取高度分别为 31/32。
3. **调用约束**：全部分支固定 9 个调用及其顺序、Token ID、收款人、金额高低位、nonce 和实际自动 burn。请独立复核 SD-key circuit 的约束覆盖，不能仅依赖客户端检查。
4. **竞争和恢复**：同一订单成交与退款只有一个成功；整个 UPS 原子提交；证明后的锚点/nonce 过时应拒绝；广播响应丢失按精确叶哈希对账，未恢复前不执行后续交易。
5. **Curve**：expected_sold 与实际 sold 绑定；过时报价可退款；库存/储备足额；毕业只能到固定 target，不能重复交接。测试中的 target 是普通账号，自动接入 AMM 初始化未实现。
6. **编译及链验证**：密集 Felt target 重编号、SplitBits 参数语义、外部 ABI 高度和规范布局根。历史合约 62 的布局更新事故材料在既有报告中；本产品布局升级使用新合约，不能照搬旧布局更新证明。

## 当前证据及限制

- [上一轮真实结算报告](../deployments/staging-2026-10-12/continuation-2026-10-13/REPORT.md)：64 笔用户交易、12 笔提交前独立验证的完整 UPS 结算、5 项断言拒绝；回执及历史用户叶匹配，资产最终对账。
- [本轮报告](REPORT.md)：生产 VM 的异常回归、实际 Token/市场字节码生命周期、本地线程竞争、本地执行日志压力、真实状态非法报价只读预检。
- 本地 VM 使用 native PSY 记账 oracle；竞争版本锁是链锚点提交的模型。不能把这部分视为真实状态 CFC/UPS 证明或链上高并发吞吐结果。
- close 的外部 Token 游标读取使用 UPS 起始快照，**close 必须单独执行一个 UPS**。不能与改变同一游标的操作合并。
- SDK 底层仍可能 panic；驱动捕获 unwind 后丢弃会话。abort、内存耗尽、进程被杀等仍由持久执行日志及外部进程监督恢复。
- 金库文件锁是单机/共享目录协调；跨机器运行需要明确的协调与 fencing 方案。目前未进行 coordinator/realm 故障注入或链上高并发负载测量。

## 独立审计验收

外部团队应复现构建和测试，独立检查实际电路约束及链上代码根，给出漏洞列表、严重性、可复现实例和修复复核；报告需写明 source/SDK/compiler 哈希、范围及未覆盖项。补强测试通过不等于第三方审计完成。本轮没有联系或发送材料给外部团队。
