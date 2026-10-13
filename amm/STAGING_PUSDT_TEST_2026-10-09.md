# PSY/pUSDT staging 补充验收：2026-10-09

状态：**此前待授权的 AMM 与 Orderbook 真实资产测试已完成，最终资金和 LP 核对通过**。本轮复用 AMM 合约 1758 / 金库 499200、Orderbook 合约 64 / 金库 591872；没有提交部署或更新。10 月 5 日的部署产物、报告和 SHA 清单保留。

## 授权与执行方式

用户明确授权“允许仅新增这两个金库”。Alice（1882112）、Bob（1283072）、Charlie（861696）的原收款列表改为 `[758784, 591872, 499200]`；修改时逐项验证额度、方法权限和已有花费计数未变。测试过程中正常付款仍会增加策略的花费计数。

普通钱包操作通过已安装 MCP 钱包完成，使用专用 `transfer` / `claim_batch` 支付，客户端禁止通过通用 `call_contract` 调用代币合约 0/4。每次写入匹配历史 leaf 与 included 回执后才继续。公共 SD-key 执行器使用受链上 fingerprint 约束的完整 UPS，并保留按金库串行的持久化 journal。没有读取或导出普通钱包私钥、助记词或恢复文件。

PSY 精度为 9，pUSDT 精度为 6。资金沿用用户此前转入的 1,000 pUSDT及原测试 PSY；本轮没有额外转入资产或铸币。付款中的 `1,000,100,000 nanoPSY` 执行费 escrow 与兑换本金分开核对；该规模用于验证流程，不代表经济模型已适合生产。

## 完成的真实链上场景

- Orderbook：Charlie 的 pUSDT 到期退款、Alice 的 PSY 到期退款，均领取退款并关闭订单。此前两轮相反方向整单撮合记录见 [10 月 5 日报告](STAGING_PUSDT_TEST_2026-10-05.md)。
- AMM：Alice 作为第二位 LP 增加各 500,000 基础单位并获得 500,000 份，随后全部撤出；份额归零，储备恢复为各 1,000,000。
- AMM：Charlie 以 10,000 nanoPSY 换得 9,871 个 pUSDT 基础单位；Bob 用同额 pUSDT 换得 9,940 nanoPSY，输出已领取、订单已关闭。
- AMM：PSY 和 pUSDT 各一次到期退款；PSY 单腿入金和 pUSDT 单腿入金各一次 LP 退款。本金返原付款人，费用按已部署规则结算。
- AMM：Bob 的已付费、到期撤资取消，储备和持有份额与取消前一致；随后撤出全部 999,000 份用户 LP，仅保留 1,000 份永久锁定 LP。

以下为本轮 12 笔公共结算的实际 included 回执。输入数组按已部署 ABI 保存，原始调用栈在证据 journal 中。

| 市场 | 方法 | 输入 | checkpoint | content hash |
| --- | --- | --- | --- | --- |
| orderbook | cancel_usdt_order | `[861696,200000,3]` | 205177 | `0215520605e084afc7f6ab4e0d2b923108a286e1e85e67642f709a18e7564b1a` |
| orderbook | cancel_psy_order | `[1882112,1000,3]` | 205254 | `f1b580166ee2f30cf8078d80cd00f0712c0907d4324ba41257e2b61ef964c005` |
| amm | add_liquidity | `[1882112,500000,500000,500000,1]` | 205326 | `fe36f25b70b3037d972c6a30082c7d24b153b6e8791b3c0105268f6a91b97f7a` |
| amm | remove_liquidity | `[1882112,500000,500000,500000,2]` | 205389 | `0223def51527556f1d2b790a79e43d16afbdcf4e74d28366bc76a3f7abc6905a` |
| amm | swap | `[861696,0,10000,9871,1]` | 205456 | `bc871930c7e45f2195326bcc9362d238f875f2e9f1f79cbf446f894e13aefd74` |
| amm | swap | `[1283072,4,9871,9940,2]` | 205523 | `34e60832b417e8b04b31506ed410fa5c5004ba9ee1196bbd6f4738a48693968c` |
| amm | refund_unclaimed | `[861696,0,1000]` | 205588 | `9e8ce33ec5294838fc83f06283c0c0da01ee3aa8888233cc8b4e73ce26ef46cf` |
| amm | refund_unclaimed | `[1882112,4,10000]` | 205655 | `997215ffc5b0fa1ce2a9ff811c547bf2b7561a4acb3c13d7adb909eac9b4c121` |
| amm | refund_add_unclaimed | `[861696,10000,0]` | 205724 | `6cdff57d488f03433b564d26749ad834dcb8d5dbf6dafc89001beb484126aae5` |
| amm | refund_add_unclaimed | `[861696,0,10000]` | 205797 | `eaef13c536035f9c4cb70a4ac1f78fcbf478f08c7c0ad0915177a806d54f6fb5` |
| amm | cancel_remove | `[1283072,3]` | 205875 | `9751ebaf49ecb9128a78d9eabcfe88b8f8a813465474e220027aef78252d9a1a` |
| amm | remove_liquidity | `[1283072,999000,999059,999000,4]` | 205941 | `a2694a397fcb26bdca4b5ab6d748e56af11727937557641d3e7990b2d9fe2278` |

## 最终资金与 LP 核对

基准 checkpoint **205104**，最终余额 checkpoint **205974**，审计时间 **2026-10-09T03:00:41.751Z**。三个测试钱包与两个金库合计 **58 笔 UserEndcap**，按 content hash 去重，实际网络手续费从 included 回执提取。

| 检查 | 结果 |
| --- | --- |
| pUSDT 总量 | `1000000000 = 1000000000` 基础单位 |
| PSY 及手续费 | `2807697702000 + 58000216000 = 2865697918000` nanoPSY |
| 相关账户待领取资产 | 0 |
| 未关闭订单 | 0 |
| 未确认公共广播 | 0 |
| 用户 LP | 三个用户均为 0 |
| 永久锁定 LP | 1,000；未分配给用户槽位 |
| 最终储备 | PSY 1001、pUSDT 1000 基础单位 |
| AMM 剩余原生费用 allowance | 1018000 nanoPSY，未计入储备 |

审计逐一比较四项退款和撤资取消的中间状态，确认储备与各用户份额未变；同时确认 LP 总量等于用户份额加永久锁定份额，pUSDT 金库余额等于其储备，PSY 金库余额覆盖储备与剩余费用 allowance。对账范围包含这五个账户之间全部已知 Outbox/claim 游标。

## 本地代码收尾

- token 与 dApp 的 `cancel_unclaimed_payment`、dApp 调用封装和 ABI 已同步；遗失的当前模板编译产物已重建。NFT 当前产物也与当前源码重新编译一致。
- `npm test` 通过：原生单元及 E2E 编译/ABI 检查，加 89 项交易市场、执行器和客户端权限回归。
- `token/vm-tests` 的 5 项编译后 VM 回归通过，覆盖 legacy、公有 v3、私有 v3：仅退原付款人、SDK 余额不变、游标防重复、claimed 退款总额约束、非法参数/溢出、私有 note 状态保留。
- 私有 v3 使用临时独立 SDK 副本构建已有编译器补丁，通过 fingerprint 检查并生成 22 方法产物；没有修改 SDK checkout 的核心源码。
- dApp TypeScript 检查通过；本地 SD-key 签名摘要回归验证允许方法接受、实际交易摘要不授权方法拒绝。该回归基于本地 SDK 及其既有改动，不证明 staging 已部署相同电路。

这些模板退款源码及新编译产物未部署到已有代币合约；本轮 AMM/Orderbook 退款由各自已注册的 SD-key 策略执行。

## 仍需另行处理

后续经用户授权，MCP 通用入口的合约 0/4 检查已修复，客户端确认接口适配已补好；默认 MCP 回归 1,136 通过、0 失败、11 忽略。另行审阅复现 5 项被忽略的历史策略问题，服务切换暂停，详见 [MCP 修复记录](../MCP_PAYMENT_POLICY_REVIEW_2026-10-09.md)。当前客户端付款限制已启用；既有交易证据中的历史报告保持原样。

跨机器执行竞争、分布式 lease、用户索引发现和执行者经济模型继续列入 [执行网络路线图](../SDKEY_EXECUTION_NETWORK_ROADMAP.md)。当前 Orderbook 实现整单撮合，部分成交需要单独设计。

## 证据

[本轮完整证据](deployments/staging-pusdt-2026-10-09/) 包含钱包策略修改前后公开响应、源码版本信息、编译与测试日志、普通钱包请求和回执、公共执行器 journal、同 checkpoint 余额、最终审计及 SHA 清单。失败的本地构建尝试也保留，最终通过日志另行标明。普通钱包凭据与会话 token 未包含。两个执行器已按 SIGTERM 正常退出（exit 0）；对本轮全部 12 个已完成任务进行 journal 重放检查，均返回 already-included，证明和提交回调次数为 0，没有追加执行记录。
