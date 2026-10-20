# 四个市场的共享金库批次预检（2026-10-20）

记录性质：**预检分支的历史结果，不能据此部署或公布批处理 TPS。** 后续实现及实际验证请看 [实现结果](MARKET_BATCH_V2_RESULTS_20261020.md)。

基线：`459a1fef4c91100161677ffd57043f461c4f7638`。预检分支只新增预检程序、证明探针、证据和设计。没有修改 Node、FT、NFT、四个市场的现有源码、布局、SD-key 指纹或部署产物，没有 RPC 广播。

## 1. 图片与可实现范围

用户提供图片描述：用户独立提交 covenant；处理者按用户 ID 收取付款；按照上一区块随机数产生的顺序更新池状态；签名电路约束顺序及调用；最终递归聚合证明。

这是一项架构目标，图片中关于随机数、矿工激励、隐私和 MEV 的断言不作为当前代码已具备这些性质的证据。当前预检结论：

| 项目 | 结论 |
| --- | --- |
| 共享金库、多用户独立提交 | 可以沿用；同一金库的状态依赖仍顺序计算 |
| 现有 SD-key 批量调用 | 不兼容：AMM / Book / Curve 固定 9 次，NFT Market 固定 10 次，含自动 burn |
| 单 UPS 的统一 16 次硬上限 | **不能如此认定**。配置有 16 常量，但底层 gadget 的实际构建和 SDK 会使用 key 自己配置的精确数量 |
| 本地 32 次调用内省 | 合成 SD-key 电路、动态输入、基础证明及两层递归 minifier 的可复现实测见证据；不等于 32 次真实市场调用的完整 UPS 或现网接纳 |
| UPS 原子性 | 一个 end-cap 绑定一个用户的起止状态、完整调用栈和调用数；待执行债务必须清空。不生成合法 end-cap 就不能提交中途状态 |
| 多 UPS 组成一个大批次 | 不具备天然跨 UPS 原子性。需要逐批状态机和故障恢复，不能称为一个原子交易 |
| checkpoint seed 的真实性 | DPN 可通过历史 checkpoint Merkle 证明认证 seed；不是 Executor 自报一个随机数 |
| 随机性、公平性 | **未满足**：本地 coordinator 使用 `thread_rng` 产生 seed；没有核实 VRF、不可偏置信标或其他不可操纵保证 |
| 当前合约 / SD-key 的 seed 接口 | 未接通。DPN 的原始读取存在，但当前市场生成器、编译入口和 SD-key 的状态读取没有形成完整 seed 认证链路 |
| 吞吐 | 本轮只测授权证明组件成本；真实批次 VM、完整 UPS、确认吞吐仍未测，报告均为 `null` |

## 2. 调用容量与成本

### 2.1 现有模板不能简单串起来

`amm/u124/policy.mjs` 把一次操作补齐到 8 次显式调用，再自动 burn，精确总数 9。
`nft-marketplace/policy.mjs` 补齐到 9 次显式调用，再 burn，精确总数 10。
`amm/u124/vm-tests/src/policy.rs` 和 `wallet_driver.rs` 也校验这些精确数量和 13 个 witness 字段。

UPS、inline 和 deferred 树高度 16 是树的编码容量，**不是 16 次调用的意思**，更不是可承诺的生产批次规模。SDK 的内省按 `num_introspectable_transactions` 精确匹配调用数；本次底层探针验证了 9、10、16、17、32。超出 16 的结果只证明本地构造器没有在此处强制该常量，不能外推服务请求上限、注册准入或性能。

初步预算：新的结算 UPS 预留两个批次包络调用和一个自动 burn。下表移除旧模板的 noop 和旧 burn，仅估算新模板的调用数；不允许直接用旧 key 签这些新栈。

| 操作 | 每单 / 每对非 padding 调用 | 两个操作 + 包络 + burn | 16 次预算的理论容量 |
| --- | ---: | ---: | ---: |
| AMM swap | 4 | 11 | 3 单 |
| AMM 双资产退款 | 6 | 15 | 2 单 |
| Orderbook match | 8 | 19 | 1 对（2 个用户订单） |
| Curve buy / sell，现有精确报价 | 4 | 11 | 3 单 |
| NFT Market sale | 9 | 21 | 1 笔（卖方 + 买方） |

这是现有分支的预算，并非最终最大批次。Curve 限价买入的差额退款、批次结果记录、费用结算、NFT ACK 都可能增加成本。初始化、毕业、激活先维持独立操作，不能混入任意交易批次。

**候选首版上限：32 次调用，最多 2 个交易操作。** Book 是最多 2 对、4 个用户订单；NFT Market 是最多 2 笔销售、4 个订单。这是待完整 UPS 验证的配置，不是已实现能力。如果服务 / 证明准入不通过，必须降低或更改应用内调用模板，不能修改 Node 绕过限制。

### 2.2 实测口径

机器：Apple M1 Max，10 个逻辑 CPU，32 GiB，macOS 15.7.3；Rust `nightly-2025-09-20`，release 构建，离线锁定依赖。

探针 `batch_preflight.rs` 对每个调用使用两个动态 62 位 witness，约束完整调用栈和签名 digest；每个长度测 3 次基础证明、两层递归压缩和验证；另测尾调用替换、交换顺序、截断、额外调用、签名栈替换，共 25 个拒绝案例。它没有市场状态 Merkle 读取、市场算术、资金守恒或 UPS end-cap。

| 内省调用数 | 基础证明 + 两层压缩中位耗时 | 压缩后验证中位耗时 | 压缩后证明字节数 |
| --- | ---: | ---: | ---: |
| 9 | 755.21 ms | 3.53 ms | 130568 |
| 10 | 764.45 ms | 3.46 ms | 130568 |
| 16 | 757.83 ms | 3.53 ms | 130568 |
| 17 | 762.97 ms | 3.47 ms | 130568 |
| 32 | 756.79 ms | 3.59 ms | 130568 |

结果以 `batching/evidence/20261020/sdkey-dynamic-cost.json` 为准。所有长度在此合成模板中均落在 degree bits 12 的填充电路范围内。**不能用组件耗时的倒数计算市场 TPS**；不能把证明大小近似不变解释成交易计算量没有增长。样本只有每档 3 次，不作为稳定生产延迟或 p95。

依赖目录已有本轮开始之前的本地修改。报告绑定其 commit、tracked diff 哈希和关键源码哈希；结果只适用于这个实际依赖快照，不宣称已经对齐现网版本。未复制 diff、私钥或钱包文件。

### 2.3 费用门槛

当前 driver 限制自动 burn 在 `1_000_000_000..=1_000_100_000`，以 1000 递增；现有 fee escrow 为 `1_000_100_000`。
end-cap 根据 `GUTA_FEE + DA_FEE × slots_modified` 约束费用。
新批次增加状态写入，不能沿用单单的 100-slot 余量作为无限预算，也不能重复领取用户累计付款。

新版本必须把 commit UPS、settle UPS、失败重证、ACK、输出领取与差额退款的费用分开统计。没有得到完整 UPS 的实际 slots / fee 之前，不扩大任何旧钱包授权或修改它的额度。

## 3. 原子性与失败边界

源码证据：

- `psy_network_circuit/.../ups_end_cap.rs`：签名 digest 绑定 start/end leaf、checkpoint、tx hash、tx count；检查费用及空执行债务。
- `psy_network_circuit/.../ups_end_cap_tree.rs`：递归证明关联同一 proof tree。
- 应用 `wallet_driver.rs`：独立验证 end-cap 证明及公开端点后才可能广播。
- 应用 `executor/journal.mjs`：写入 durable broadcast-intent；未知结果阻塞该金库的下一次修改，以精确 end leaf 回执核对。

所以，结算 UPS 中最后一步失败，前面步骤不能成为独立链上提交。但**已经确认的批次承诺 UPS 不会被结算失败回滚**，需要超时恢复分支。

当前 VM 的 clone/compare-and-commit 测试不是 Node admission 的证明。本轮原子性结论是源码和已有端点验证机制的能力判断；新批次仍要专门测中段 / 尾段失败、真实全状态证明和旧 anchor 竞争。

## 4. 随机排序缺口

认证路径：`GetCheckpointLeafStats` 将 stats 和 global roots 的哈希合成 checkpoint leaf，用历史 Merkle 证明连接到 session 的 checkpoint tree root，并输出 seed 的 4 个 Felt。更换 seed 而不更新认证证明应该使电路失败；新应用需要为此建立正反向完整测试。

本地生成路径：`coordinator_guta_update_gatherer.rs::get_temp_guta_rand_seed` 使用 `rand::thread_rng().fill_bytes`，再经 coordinator output 写入 checkpoint stats。因此可认证的是“这个 checkpoint 承诺了这个 seed”；这不证明生成者不能重抽或偏置，也不证明 seed 在选定订单集合时不可预测。现网版本未知，不能从本地源码断言线上一定采用相同逻辑。

随机版本启用前必须同时具备：

1. 被证明绑定的 seed 读取和固定的 seed checkpoint，不能挑历史 checkpoint。
2. 在 seed 可知前已经上链固定候选集合，并认证承诺在较早 checkpoint 中的存在。仅在合约填一个较早的数字，不足以证明承诺的实际包含时间。
3. 经核验的随机源不可偏置 / 不可预测假设；处理重组和最终性。
4. 排序电路约束 seed + 域 + batch ID + order ID，确定性处理并列，证明执行集合是承诺集合的排列。
5. 禁止丢弃不利 seed 后重新选集合、重新编号、选择性 abort 再开奖。

本分支未添加任何本机随机排序。首版设计是**可验证确定性批次**，不宣传随机公平、消除夹击或完全消除 MEV。

## 5. 放行条件和下一阶段

具体实现及测试矩阵见 [批次 V2 设计](../design/MARKET_BATCH_V2.md)。实施顺序：

1. 绑定批次集合、状态机与排序规则，生成新布局 / 新 SD-key，先不部署。
2. 单金库 AMM 两单、Curve 限价两单、Book 两对、NFT 两笔的字节码、认证 CFC、全 UPS 正反向验证。
3. 确认新调用数、输入数量、费用和注册配置在现有服务范围内；独立核验部署产物和布局，保留所有旧产物。
4. 接入 Executor durable batch journal，补齐崩溃 / 取消 / 重复 / 双执行者竞争测试。
5. 输出批次 1 / 2 的完整成本和确认吞吐。任一门槛未通过，继续报告未完成，不以模型、授权探针或递归聚合速度代替真实结果。

本轮尚未完成：四个市场批次入口、集合认证电路、排序电路、批次 SD-key、故障恢复状态机、真实批处理吞吐与现网准入。现有六合约及 Executor 的旧测试不能替代这些新增验证。


后续实现：独立 `batch-v2` profile 已放在 `batching/v2/`。最终采用 40 槽 / 74 Felts，随机排序继续关闭。本文为原预检记录；实现后的验证与性能以 `MARKET_BATCH_V2_RESULTS_20261020.md` 及对应冻结产物哈希为准，不沿用本预检的容量候选数字。
