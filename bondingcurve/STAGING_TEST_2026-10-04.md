# 测试结果 — 2026-10-04

网络：Psy Sepolia staging。沿用已部署的代币 **65**、曲线 **66** 和公共 SD-key 金库 **758784**。本轮没有更新合约，没有修改 psy-node 源码。

## 本地回归

| 范围 | 结果 |
| --- | --- |
| AMM JavaScript | 27 / 27 通过 |
| Orderbook JavaScript | 17 / 17 通过 |
| Bonding Curve JavaScript（含回执核对） | 16 / 16 通过 |
| SD-key Rust 策略证明 | 3 / 3 通过 |
| 已部署字节码的多用户 VM 测试 | 4 / 4 通过 |

新增 `sdkey-circuit/tests/compiled_lifecycle.rs` 直接加载保存的部署编译产物，覆盖多用户买卖、过时报价退款、卖出退款、毕业后退款、价格/库存/nonce/期限检查，以及 100 轮买入卖出后的储备与总量守恒。该测试使用本地状态，并模拟事务失败回滚与手续费；不是 100 轮现网交易，也不验证节点的实际回滚实现。

SD-key 测试补齐六个合法分支，并拒绝额外/缺失调用、调用顺序变化、错误代币、nonce 篡改、输出重定向、金额扩大及超过 escrow 的手续费。变更限于测试代码，生产策略 fingerprint 未改变。

## 钱包与已确认链上操作

普通钱包及 faucet 均通过 Psy Wallet MCP 操作，私钥保留在 MCP 服务端。公共金库使用原有公开 SD-key 驱动。

| 角色 | 用户 ID | 初次 faucet |
| --- | ---: | ---: |
| Issuer / Alice | 1882112 | 1,000 PSY，已领取 |
| Bob / 毕业接收者 | 1283072 | 1,000 PSY，已领取 |
| Charlie，新建 MCP 钱包 | 861696 | 1,000 PSY，已领取 |

已经确认：发行人一次铸出 6,000,000,000 代币单位；重复铸币和非发行人铸币均在本地证明执行阶段被合约断言拒绝，未提交。

初始化前核对发行人 Outbox：代币 6,000,000,000，PSY 1,000,100,000。金库 fingerprint 仍为 `3eda54589294415dda512d0d054146acf13ed9176094b89b1a1f3b858e43349e`。

初始化 receipt：

- checkpoint：**136937**，UTC **2026-10-03 18:02:30**。
- 服务索引器 content hash：`adee7be8c1fda85acfc564dc76f0ffcdb4b8a5453c326faf090cd22d7e00d63c`。
- 驱动返回的 end-user leaf hash：`c7d457c2eb9d17140d73c884f4424cfc2ef1b1c89f45c4225c4bf6bd24afd3a0`。这是不同类型的标识，不能当作 services 的 content hash 使用。
- receipt 显示 7 次调用、手续费 1,000,010,000；链上 `phase=1`、库存 6,000,000,000、储备 0、PSY 手续费余量 90,000。

Alice 买入两批；Bob 的竞争旧报价被拒绝，退还本金并实际领取；Bob 重新报价买入一批；Alice 卖出一批并实际领取 PSY，随后另一卖单撤回并领取代币。Alice 最后一笔买入已入块，金库达到 `soldLots=3`、`psyReserve=300,003,000`、剩余库存 3,000,000,000。毕业和 Charlie 的毕业后退款均已入块：`phase=2`、储备与库存均为零。Bob 已实际领取 3,000,000,000 毕业库存，总持有量 4,000,000,000；两人的 PSY 均已实际领取，所有订单已关闭。48 笔提交全部经历史叶与 included receipt 匹配，未匹配数量为 0。

新增 `receiptCheck.mjs`：用返回的 end-user leaf hash 匹配历史用户树叶，再核对索引器的 content hash、所属用户、checkpoint 和 included receipt。五个测试覆盖广播错误但已入块、索引滞后、历史叶不匹配、回执不一致及读取失败。未确认的尝试保持 unresolved，不能据此自动重付。

## 已确认公共 SD-key 操作

| 操作 | checkpoint | 入块 UTC | content hash |
| --- | ---: | --- | --- |
| 初始化 | 136937 | 2026-10-03T18:02:30Z | `adee7be8c1fda85acfc564dc76f0ffcdb4b8a5453c326faf090cd22d7e00d63c` |
| Alice 买入 2 批 | 140836 | 2026-10-04T00:39:12Z | `98b7dc40b6f3342898c07f62fd828155898777273eb7ca248c906084ea625a2c` |
| Bob 旧报价退款 | 140902 | 2026-10-04T00:45:48Z | `822797aadb334e8adb9a171aeebe78fdd3cf12e42ee273e20fa9ffceac7d4dc5` |
| Bob 新报价买入 | 141063 | 2026-10-04T01:01:54Z | `36e588a5c257440a7bb49c3998f10861517c863b04b8079af9ff4f038bc29712` |
| Alice 卖出 1 批 | 141527 | 2026-10-04T01:48:18Z | `6ba7706d1f27fcec958327fef40d1927624eeaec0355c5f74a163c795d45d9e8` |
| Alice 卖单撤回 | 147351 | 2026-10-04T11:31:48Z | `3e72d13b8dd5ed3cff34cd1c3a65f5c4ffbdff7b63a04700ee01419dfae435bf` |
| Alice 最后买入 1 批 | 147454 | 2026-10-04T11:42:06Z | `3229b52238b5bdddfb00619fc821efeb90c4c240428517d877e43626f59dc467` |
| 毕业 | 147516 | 2026-10-04T11:48:18Z | `14ba3cf88a3262bb07947c08b29232030bebbd9fc489e7f81cd99b269b643902` |
| Charlie 毕业后退款 | 147542 | 2026-10-04T11:50:54Z | `60823b187098d16882c14ac70c9eba8a83c9aee644a926ca47be63868e441dc4` |

## 最终余额与守恒

快照 checkpoint **147572**，UTC **2026-10-04T11:53:58.579Z**。以下金额为链上基础单位（1 PSY = 1,000,000,000）。

| 角色 | PSY | 代币 65 |
| --- | ---: | ---: |
| Alice / Issuer | 970,799,338,000 | 2,000,000,000 |
| Bob / 毕业接收者 | 987,199,773,000 | 4,000,000,000 |
| Charlie | 993,999,888,000 | 0 |
| 公共 SD-key 金库 | 835,000 | 0 |

- 代币余额合计 **6,000,000,000**，等于一次性发行总量；无待领取代币。
- PSY 当前余额合计 **2,951,999,834,000** + 回执手续费 **48,000,166,000** = faucet **3,000,000,000,000**；无待领取交易本金。
- 金库 `phase=2`、`soldLots=3`、`psyReserve=0`、库存为 0。金库剩余 **835,000** 是未用完的手续费 escrow，不属于买卖储备。
- 三个用户订单均为 kind=0；全部来源 Outbox 的累计支付均已由金库领取，结算游标与累计值一致。

## 负向检查

重复铸币、非发行人铸币、旧报价成交、重复退款、未达阈值毕业，以及毕业后再开买单，均在本地执行/证明阶段被合约断言拒绝，未提交到链。最后一次通过 MCP 调用 `open_buy` 返回 `vault not trading`，没有付款或新订单。篡改整栈、收款人、金额等 SD-key 策略负向案例在本地证明测试中拒绝。

## 执行问题与处理

已安装 MCP 二进制在获取可选 L1 配置失败时无法启动。本轮在临时目录复制配置，仅移除 `l1_config_url`；L2 网络、端点、钱包身份和全局配置保持原值。本轮不测试 L1 桥。

远端 prove 服务多次连接失败，普通钱包 MCP 与公共 SD-key 驱动改用临时配置中的本地 prover；没有修改全局配置。一次 Bob 开单证明失败后核对订单为空及付款为零才重试。Alice nonce=3 开单返回网络错误，但其 deterministic leaf 已在历史树与回执中核实入块，因此没有重试。另一次 fee 调用外层超时，没有可用 leaf；关闭旧连接、核对多个后续区块的 Outbox 无增量后才单次付款，最终累计金额证实只有一次 fee。

Mac 电源日志显示长时间 Deep Idle/Maintenance Sleep，造成请求中断和执行时间跳跃；链仍在持续出块。后续使用绑定 MCP 进程、最长 30 分钟的临时 `caffeinate`，结束时清理。钱包会话只在原有策略额度内刷新。

普通 MCP `call_contract` 当前每次只支持一个调用，因此开单、付款、领取、关闭分开提交；金库结算/退款仍是原子六调用加自动 burn 的同一 UPS。每个依赖步骤都核对入链状态。本轮不声称普通开单与付款已在同一 UPS 中实测。

## 本轮范围与限制

- 本轮真实交易资产为 PSY 与伴随发行代币 65。AMM/Orderbook 只运行本地回归；没有新增真实 pUSDT 兑换测试。
- 六调用加 fee burn 的公共 SD-key UPS 实际成功入块；负向断言和错误策略均在本地拒绝，没有向链发送无效证明。
- 所有付款都要求精确的本金与 escrow；多付/重复付费的恢复流程尚未实现。扣除实际 gas 后的 escrow 余量留在金库，与 `psyReserve` 分开记账。
- 毕业目标 1283072 是普通测试接收账户；自动创建和注入兼容 AMM 市场尚未完成。
- 没有更新 62 或其他合约，没有修改 psy-node，也没有提交或推送代码。

## 重现与原始文件

```sh
npm run test:amm
npm run test:orderbook
npm run test:bondingcurve
cargo test --offline --release --manifest-path bondingcurve/sdkey-circuit/Cargo.toml --lib --target-dir ../psy-node/target
cargo test --offline --release --manifest-path bondingcurve/sdkey-circuit/Cargo.toml --test compiled_lifecycle --target-dir ../psy-node/target
```

公开回执、调用栈、状态快照和日志已复制到 `deployments/staging-2026-10-04/`，并附 SHA-256 清单。原始文件位于本 Mac 的 `/private/tmp/psy-curve-staging-20261003/`。日期为本轮起始日期，执行跨越 UTC 10 月 3–4 日。旧部署证据 `deployments/staging-2026-09-30/` 保持原样。

仓库：`/Users/geir/Downloads/QED资料/litepaper/psy-template`，分支 `main`，基准 commit `377f4703aec2f945e3e650ade4810572ccb93f6a`。本轮改动尚未提交或推送。
