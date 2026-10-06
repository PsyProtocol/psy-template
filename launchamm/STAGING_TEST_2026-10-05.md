# 毕业入池、AMM 与自动执行器测试 — 2026-10-05

网络：Psy Sepolia staging。最终核对时间 **2026-10-05 05:07:45 UTC / 台北 13:07:45**，checkpoint **157884**。

## 结果

| 项目 | 本轮结果 |
| --- | --- |
| Bonding Curve → AMM | 实际毕业、转出储备、自动 claim 并建立初始 LP，已入块 |
| AMM 流动性 | Alice 添加 10,000 LP，再全部撤出；两种资产均实际领取 |
| AMM 兑换 | Bob 完成 PSY → 代币 1494 → PSY，输出符合报价，已领取并关闭订单 |
| AMM 退款 | Charlie 的 PSY 订单过期后退回原付款人，已领取并关闭 |
| LP 撤出取消 | Charlie 的订单过期后取消，29,000 LP 及储备不变 |
| Orderbook | 合约 64 自动退回 Charlie 的 PSY 本金，已领取并关闭 |
| 并发与恢复 | 第二进程被锁拦截；证明期间另一用户补齐付款后，服务重扫并分别完成两笔任务 |
| 回执 | **54 笔用户 endcap 全部匹配 included 回执，0 笔未匹配**；新部署回执另行保存 |
| 守恒 | PSY、代币总量、LP 份额及已知账户间待领取金额检查全部通过 |

本轮真实资产是 **PSY 和新发行代币 1494**。PSY/pUSDT 的新增兑换和双边撮合仍待测试资产；现有三个 MCP 测试钱包 pUSDT 均为 0。不能把本轮代币 1494 的测试计作 pUSDT 测试。

## 部署与身份

| 对象 | 合约 / 用户 ID | 用途 |
| --- | ---: | --- |
| 新伴随发行代币 | 合约 1494 | 固定发行人 Charlie，供应 6,000,000,000 基础单位 |
| 曲线 | 合约 66 | 经 code/layout 核对后复用，使用全新的金库状态分区 |
| 新曲线 SD-key 金库 | 用户 1297920 | 接收发行库存、买卖付款及毕业费 |
| 最终 AMM | 合约 1503 | 41 个字段、15 个方法，含 LP 撤出取消 |
| AMM SD-key 金库 | 用户 773632 | 固定接收曲线毕业资产，执行完整 AMM UPS |
| Orderbook | 合约 64 / 金库 591872 | 复用已有正确部署，本轮测试自动 PSY 退款 |
| 首版 AMM 候选 | 合约 1492 | 14 个方法，未用于本轮金库资金；原产物保留 |

1492 缺少已付费 LP 撤出订单的取消路径，因此增加 `cancel_remove` 并部署新的 1503，没有更新 1492。曲线的同内容部署尝试返回了已有 66 的历史回执；随后明确复用已验证的代码和布局，以新金库隔离状态。部署工具现已在提交前拒绝同内容的已入块部署。

普通钱包：Alice **1882112**、Bob **1283072**、Charlie **861696**。签名、付款、领取和关闭均通过已安装 Psy Wallet MCP。部署使用 Alice 已有权限，没有扩大 Charlie 的策略权限。普通钱包私钥、助记词、恢复文件及 owner/session token 未收入证据。

本轮没有新增 PSY faucet 领取，沿用上一轮三个钱包各 1,000 PSY faucet 的余额。只铸造了测试代币 1494，没有铸造 PSY。

AMM fingerprint 固定源曲线 **66**、源金库 **1297920**、发行人 **861696**、代币 **1494**及交易单位。`register_pair` 预判连续注册 ID，并在付款前核对实际注册映射；没有解除来源绑定。

| 金库 | Fingerprint |
| --- | --- |
| 新曲线 | `32f8aa396b594ca786d5102119a1af5858f82b8f23a13bda9efd45bcedf0d3c5` |
| 新 AMM | `07de53fc40b456d84d182dd4edcd99051dac849b378a2d80bfd3a30045757783` |
| Orderbook | `46e467428361d649f9113914fc5faa989af97d3c3a3de9e8bbd50b7e05d85dcf` |

## 布局与证明检查

新部署使用 **空布局 → 新布局** 证明。准备请求经过独立 code/layout 重算、ABI 字段/槽位/方法检查，以及 canonical layout proof 的密码学验证后，保存精确提交意图并单次广播。入块后再次核对链上的 code root 和 layout root。

1503 的前 26 个字段保留曲线 ABI 前缀，用于读取源曲线的毕业状态。它的 code root 为 `7454c52728393fdbadb1b343a3d6b236834387c02d8cbd160cc66a000a65a3e5`，layout root 为 `bd2b7b63fea8aadd1ea8377c28941bf52dc47511e2c7faf8fd1659ab714379e1`，槽位数 **2,214,592,548**，树高 **32**。

本轮没有提交任何合约更新，没有操作合约 62，也没有修改 psy-node 源码。旧部署、首版候选和原始证明均保留。

## 实际业务流程

交易单位：`psyUnit=1,000 nanoPSY`、`tokenUnit=1,000,000` 代币基础单位；**1 PSY = 1,000,000,000 nanoPSY**。表中的 AMM 储备为交易单位，转账为基础单位。

1. Charlie 一次发行 6,000,000,000 代币基础单位，并将库存及初始化费付给新曲线金库。
2. Alice 买入 2 批，Bob 买入 1 批，均领取代币并关闭订单。曲线达到 sold=3，储备 300,003,000 nanoPSY。
3. 曲线毕业，向 AMM 金库转出 300,003,000 nanoPSY 和 3,000,000,000 代币基础单位。自动执行器 claim 并入池，储备为 **300,003 / 3,000**，总 LP **30,000**；Charlie 持有 **29,000**，另 **1,000** 永久锁定。
4. Alice 添加 100,001,000 nanoPSY 和 1,000,000,000 代币基础单位，获得 10,000 LP。储备变为 **400,004 / 4,000**，总 LP 40,000。撤出这 10,000 LP 后，两种本金完整返还并实际领取，恢复原储备及总 LP。
5. Bob 输入 10,000,000 nanoPSY，得到 **96,000,000** 代币基础单位，储备 **310,003 / 2,904**；再输入这些代币，得到 **9,891,000 nanoPSY**，储备 **300,112 / 3,000**。乘积依次为 **900,009,000 → 900,248,712 → 900,336,000**，符合 30 bps 手续费及整数舍入的报价。
6. Charlie 的 LP 撤出设置了无法满足的最低输出；到期取消只消耗执行费用，LP 和储备不变。另一个 PSY 兑换订单到期后，**100,000 nanoPSY 本金只退给 Charlie**，实际领取后关闭。
7. Orderbook 的 PSY 订单到期，**400,000 nanoPSY 本金只退给 Charlie**，实际领取后关闭。

AMM 为 5 个显式调用加自动 burn；曲线和 Orderbook 为 6 个显式调用加自动 burn。同一金库 UPS 中包含 guard、必要的 claim/transfer 和费用约束。使用现有 deferred 执行机制，没有使用 `invoke_sync`。普通 MCP 开单、付款、领取和关闭是分别提交的单方法调用，本轮不声称它们在同一 UPS 中完成。

## 公共 SD-key 入块记录

以下为 services **content hash**，不是驱动返回的 end-user leaf hash。两者通过历史用户树叶、用户 ID、checkpoint 和 included 回执共同匹配。

| 操作 | checkpoint | 入块 UTC | content hash |
| --- | ---: | --- | --- |
| 曲线初始化 | 157143 | 03:52:48 | `a12c0de6c3d8d45063bfe44930a61cf622ef41ba40f93cd1794b13142e33d137` |
| Alice 买入 2 批 | 157186 | 03:57:06 | `5622b140d8a484d93b3aca8383dbb5828c3f15742772530405176c01038edf69` |
| Bob 买入 1 批 | 157240 | 04:02:30 | `2d6ec4cd01a5e487474cc0f58a0f1b26754d85c8f3526691261c8a82bdb109a2` |
| 毕业 | 157268 | 04:05:18 | `5e43c2f602eed5d8c0bf369327e6fbbc2417e4d7548591e6d332cd367bdef95e` |
| 自动入池 | 157354 | 04:13:54 | `563f8034e556cee0a63f92c433b9167fea0aac87dcf0787a58c2e906d27f1eb1` |
| 添加 LP | 157485 | 04:27:00 | `a5f91067c424b613875e423e96bf9885b22a3868ad4779aacbe32b6236fa9d17` |
| 撤出 LP | 157561 | 04:34:36 | `cc4e546dfb97344769e0dfe1f86a3c3fbce392e3fe6ee4223bdffa603e0bfe27` |
| Orderbook PSY 退款 | 157583 | 04:36:48 | `5ddbf16440a736a23fc3d57442823e92f53473454bfd7de233bebc28542bf5cb` |
| PSY → 代币 | 157628 | 04:41:24 | `ad3fd440c0760388aac17d944626acb4def1fc74e9fb0204192e31f2557f75fc` |
| 取消 LP 撤出 | 157684 | 04:47:00 | `1d825cec165d2bcbaa66902c4eccfe51268618531991f831b6b561775b3fd819` |
| 代币 → PSY | 157808 | 04:59:24 | `51aa0214672aeaf78450c9ce1da09be8f4b6a63e66d229791915895499d01043` |
| AMM PSY 退款 | 157832 | 05:01:48 | `ab2e3ad8fd3b3f9cf6a8a7b0c646a894cd81a59d71c77e81441976fc409a6334` |

## 并发与恢复实测

- Bob 仅支付反向兑换代币、没有支付执行费时，订单没有成交；状态快照记录 consumed nonce 仍为 1，订单 nonce 为 2。
- Charlie 退款进入证明阶段后，Bob 补齐执行费。执行器的复核选择了不同任务，记录 `stale`，没有广播当次退款，也没有退出。随后完成 Bob 兑换，再重新验证并完成 Charlie 退款。
- Charlie 这笔退款日志共有 **2 次 planned、1 次 proved、1 次 broadcast-intent、1 次 broadcast-result、1 次 included**。复用的是预检调用文件和参数；提交驱动仍重新生成证明。
- 另一个本地进程尝试执行同一个 Bob 兑换任务，被共享金库锁挡在校验、证明和提交之前。
- 证明前后的任务复核、持久广播意图、历史 leaf 与回执核对均已启用。索引滞后曾使结果暂为 unresolved；确认入块前，服务阻止该金库的新广播，没有据此重付。
- 只读 RPC、只读 Orderbook CLI 和强制 `PROVE_ONLY` 的网络预检有有限重试。合约断言失败不重试；签名和提交不用这套重试。watch 模式会重新扫描过期任务或查询失败。

这验证了同机共享日志的并发保护及两个用户的任务选择变化。**不同机器同时广播同一任务的链上竞争、非正常断电及全部 SDK 故障类型尚未实测**。

## 最终余额与守恒

金额为基础单位。以下六个账户的 PSY 和代币 1494 之间没有待领取转账。

| 账户 | PSY / nanoPSY | 代币 1494 | AMM LP |
| --- | ---: | ---: | ---: |
| Alice 1882112 | 954,599,000,000 | 2,000,000,000 | 0 |
| Bob 1283072 | 971,099,325,000 | 1,000,000,000 | 0 |
| Charlie 861696 | 971,999,246,000 | 0 | 29,000 |
| 新曲线金库 1297920 | 368,000 | 0 | 0 |
| AMM 金库 773632 | 300,753,000 | 3,000,000,000 | 0 |
| Orderbook 金库 591872 | 459,000 | 0 | 0 |

- 曲线 `phase=2`、sold=3、储备与发行库存为 0。368,000 nanoPSY 是剩余费用 allowance。
- AMM `phase=1`、储备基础单位 **300,112,000 nanoPSY / 3,000,000,000 代币**，总 LP 30,000 = Charlie 29,000 + 锁定 1,000。AMM 原生 PSY 余额多出的 **641,000** 为累计未用完的费用 allowance。
- 代币余额合计 **6,000,000,000**，与一次性发行总量一致。
- 原生 PSY 核对以初始化前 checkpoint **157059** 为基准，此时发行已完成。六账户原始余额 **2,950,999,360,000** = 最终余额 **2,897,999,151,000** + 基准之后 53 笔交易实际手续费 **53,000,209,000**。
- 54 笔 endcap 中的发行交易发生在该基准之前，其费用已扣在基准余额中，不重复计费。Orderbook 基准余额包括原有 364,000 nanoPSY 费用余量。
- 三个钱包的曲线和 AMM 订单，以及 Charlie 的 Orderbook 订单均为 kind=0。两金库日志最终 reconcile 均为空。

## 本地验证

| 范围 | 结果 |
| --- | --- |
| AMM、Orderbook、Bonding Curve、launch AMM 与 executor 的 JavaScript | 75 / 75 |
| 新 AMM SD-key 的 Rust 证明测试 | 1 / 1，覆盖 11 个合法分支和错误调用栈 |
| 编译产物 VM 测试 | 3 / 3 |

覆盖错误来源、缺少费用、部分付款、单位不整除、LP 限额、重放、输出重定向、超额费用、过期退款、LP 撤出取消，以及广播不确定时禁止再发。VM 使用离线 65/66/67 编号和模拟事务回滚，不是这些编号的本轮链上交易，也没有单独验证节点的实际回滚实现。

```sh
node --test launchamm/*.test.mjs executor/*.test.mjs orderbook/*.test.mjs bondingcurve/*.test.mjs amm/*.test.mjs
cargo test --offline --release --manifest-path launchamm/sdkey-circuit/Cargo.toml --lib --test compiled_handoff --target-dir ../psy-node/target
```

## 代码、证据与剩余工作

代码在 `launchamm/` 与 `executor/`；Orderbook 的只读查询恢复在 `orderbook/chainReader.mjs`。部署检查入口是 `deploymentGate.mjs`、`deployThroughMcp.mjs` 及 Rust `review_deploy`。`cancel_remove` 是本轮新 AMM 合约增加的方法。

公开证据在 `deployments/staging-2026-10-05/`：包含最终及首版合约源码、编译 JSON、layout 证明、精确提交请求、独立验证结果、部署回执、MCP 响应、调用栈、执行日志、最终状态、余额核对和 SHA-256 清单。代币模板保留零占位常量，实际部署源码的 issuer=861696、supply=6,000,000,000，已单独冻结保存。原始运行文件仍在本 Mac 的 `/private/tmp/psy-launchamm-staging-20261005/`。

仓库路径 `/Users/geir/Downloads/QED资料/litepaper/psy-template`，分支 `main`，基准 commit `377f4703aec2f945e3e650ade4810572ccb93f6a`。所用 SDK 仓库 `psy-node` 为分支 `multi_chain`，HEAD `5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6`。本轮改动未提交、未推送。

自动执行器目前是扫描明确配置用户的**单机原型**，不是完整分布式执行网络。下一阶段为真实 PSY/pUSDT 联测、用户发现、跨机器租约/竞争测试及运营费用设计。Orderbook 当前为整单撮合，部分成交尚未实现；错汇、多付及未按要求付费的通用恢复也未完成。当前公共执行成本约 1 PSY 加数据费，仍高于本轮小额交易本金。

两个测试执行器、临时 MCP 连接和防睡眠进程均已结束，活动 MCP 钱包恢复为 Alice。pUSDT 需要可用 faucet 入口或测试资产到账后继续；已安装 MCP faucet 只提供 PSY，当前临时 L2 配置没有初始化 L1 钱包和桥接流程。
