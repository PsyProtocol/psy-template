# U124 三合约真实结算测试报告

日期：2026-10-13。网络：Psy staging（配置名称 `sepolia`）。最终对账 checkpoint：**262325**。

结果：**通过**。两个独立用户跨两个 Realm，完成 **64 笔已确认用户链上交易**，其中 **12 笔 SD-key 市场结算**在提交前独立验证了同一份完整 UPS 证明。另有 **5 项断言拒绝测试**，均未提交交易。

## 合约和资产

| 项目 | 合约 ID | SD-key 金库 |
| --- | ---: | ---: |
| AMM | 2434 | 490560 |
| Orderbook | 2435 | 1539136 |
| Bonding Curve | 2436 | 1014848 |

交易资产为新 U124 测试 Token：A **2431**、B **2432**，均为 **18 decimals**，金额编码为 `[low62, high62]`。原生 PSY（合约 0、9 decimals）支付手续费。此次交易资产不是原生 PSY 或旧 pUSDT 4。两个 Token 各发行 1200 个，来自本次测试发行钱包；PSY 费用资金来自此前 MCP faucet。

测试用户：A 506944（Realm 0），B 1866816（Realm 1）。曲线毕业接收人固定为测试用户 B，测试交接不包含自动初始化 AMM 流动性。

## 真实结算覆盖

| 市场 | 已确认的 SD-key 结算 | 已完成的领取及状态检查 |
| --- | --- | --- |
| AMM | 50 A / 50 B 加池；10 A 换 8.312489578122394530 B；退回 5 A；提取 10 LP | 订单全部关闭；全部 claim；提取返还 12 A 和 8.337502084375521094 B |
| Orderbook | 8 A ↔ 10 B 精确撮合；撤销新增 5 B 订单 | 两方 claim；第二位用户领取手续费退款；撤单退款 claim；金库交易资产归零 |
| Curve | 初始化 30 A；买 4 A 支付 4.6 B；退回过时报价 1 B；卖回 1 A 获 1.3 B；买 17 A 支付 35.7 B；毕业交接 10 A / 39 B | 所有订单关闭并 claim；phase=2、sold=20、报价储备=0、金库交易资产归零 |

每笔普通钱包操作通过已安装 MCP 钱包执行；公开 SD-key 通过应用驱动执行。发生回执不确定时仅核对历史用户叶哈希和交易回执，未重复转账或 claim。第 62 步 claim 曾遇查询超时，后确认已在 checkpoint 262050 上链。

## 未提交的负面测试

| 用例 | 链上真实状态下的拒绝原因 |
| --- | --- |
| 10-amm-replay-rejected | `assertion failed: order consumed (left: 0, right: 1)` |
| 17-book-replay-rejected | `assertion failed: order consumed (left: 0, right: 1)` |
| 30-curve-stale-rejected | `assertion failed: stale quote (left: 0, right: 1)` |
| 53a-amm-slippage-rejected | `assertion failed: slippage (left: 0, right: 1)` |
| 53b-amm-wrong-payer-rejected | `assertion failed: wrong order (left: 0, right: 1)` |

额外诊断：直接传入超过储备的 100 B 输出时，本地 SDK VM 的 `SplitBits` 范围检查触发 panic，未生成或提交证明，付款人用户叶哈希未改变。该输入改为合法整数报价后，验证用户最低输出的 `slippage` 断言拒绝。原始日志保留；SDK 的非法输入错误处理仍有改进空间。

## 最终资产对账

| 账户 | Token A | Token B |
| --- | ---: | ---: |
| 用户 A | 924 | 168.337502084375521094 |
| 用户 B | 228 | 998.31248957812239453 |
| AMM 金库 | 48 | 33.350008337502084376 |
| Orderbook 金库 | 0 | 0 |
| Curve 金库 | 0 | 0 |
| 合计 / 链上总供应量 | **1200** | **1200** |

金额全程按整数验证，无浮点换算。所有用户订单 `kind=0`。AMM 真实余额等于储备；LP 总量为 40×10^18，用户 A 份额为 40×10^18−1000，另 **1000 个最小 LP 单位保持锁定**。上表只列交易资产，PSY 手续费余量单独留在各金库。

## 本轮修复

1. 修复应用构建产物的 Felt target 稀疏索引：原生 PSY 高度常量放在 index 0，重映射符号引用，保留输入位置、SplitBits 位数和状态命令序号。
2. 修复 close 的当前用户原生 PSY 读取高度，补齐自己 / 其他用户两条路径：PSY 32，U124 Token / 市场 31。
3. 冻结 SDK 的 self-external range witness 缓存键中 length/epoch 参数顺序有误。应用构建仅将 close 的 Token 游标读取转成绑定当前用户的 OtherUser 读取；使用 UPS 起始快照，**close 独立执行为一个 UPS**。构建检查禁止旧 self-external range 形状，并验证用户 target 来自 GetUserId、在读取前已定义。

三次代码修复阶段均只更新新市场的 bytecode；ABI、方法 ID、layout、注册的 SD-key fingerprint 保持一致。每次独立验证 canonical identity-layout 证明，匹配当时真实旧叶。最终布局字段数 AMM 19→19、Orderbook 15→15、Curve 20→20。

未修改 Node、正式 MCP 安装、旧三个市场、原生 PSY/pUSDT 或原 executor。六份原始校验清单全部保持不变（1892 / 196 / 61 / 157 / 33 / 369 文件）。钱包策略仍为单笔 5 PSY、每日及总预算 50 PSY、原三个新金库收款人；累计策略占用 A 31.0006 PSY、B 41.0007 PSY。测试结束活动钱包已通过 MCP 恢复为 Alice 1882112。

测试临时 HTTPS 转发脚本遇到 positional params 兼容错误后已修正；正式 MCP 未改。转发验证 TLS，只缓存匹配固定 code root 的公开字节码；状态、证明、回执不缓存，交易提交不自动重试。

## 最终代码根

- amm: `fc9a963b4cf094c302d04abce2b2bd996116086c2ca1403f12f1f81e7b59f941`
- orderbook: `3d6ea07471f4f45dac9d7bb8df91804ed6c8e5004c0e08a90cf27ff285739f91`
- bondingcurve: `ac8e59ba71bb842d36342a74a425efd3ce621f05a730ff68119d75d51334c099`

## 证据位置与边界

- `RECONCILIATION.json`：精确整数对账、LP 原始叶、最终 code/layout 根、拒绝原因。
- `steps/*.json`、`evidence/*.json`：每笔请求、已脱敏结果、匹配用户历史叶哈希的 included 回执。
- `operations/`、`logs/`：SD-key 调用计划、提交前验证结果、原始本地诊断。
- `code-updates-v4/`、`code-updates-v6/`：旧叶、更新请求、独立 layout 验证报告、更新回执；编译产物保存在 `markets-dense-v*/`。
- `ORIGINAL_SEALS_VERIFIED.json`：原始产物完整性检查。

大体积证明和编译产物保留在本机，未覆盖原产物；不包含普通钱包私钥、助记词或恢复文件。此次覆盖双用户功能结算及原付款人退款。高并发负载、最大容量实链交易和第三方安全审计尚未覆盖。
