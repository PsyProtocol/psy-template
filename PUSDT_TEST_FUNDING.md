# pUSDT 补充资产与联测说明

本文记录真实 PSY/pUSDT 联测的资产来源、部署边界和验收条件。2026 年 10 月 5 日，用户从 Psy 用户 90112 向 Bob（1283072）转入 **1,000 pUSDT**，转账在 checkpoint 160793 入块；Bob 通过已安装 MCP 钱包领取，领取在 checkpoint 160813 入块。随后 Bob 向 Alice 和 Charlie 各分配 1 pUSDT，两人也已通过 MCP 领取。

## 接收测试资产

本轮资产已经补充，无需再次转入。接收钱包为 Psy Sepolia staging 的 **Bob，Psy-01283072，用户 ID 1283072**。Psy 上的 pUSDT 是 **合约 4**，精度为 6；1 pUSDT = 1,000,000 基础单位。原生 PSY 是合约 0，精度为 9。

如果使用公开转账，请同时提供发送方的 **Psy 用户 ID** 和交易回执。Bob 需要通过 MCP `claim_all` 指定发送方及 `token: "USDT"` 领取；发送方的转账入块与 Bob 的可用余额增加是两个步骤。如果使用隐私转账，应先通过 MCP 获取 Bob 的完整接收信息并完成 note 投递，随后核对领取回执。

到账后基准 checkpoint 为 **160847**：Alice（1882112）持有 1 pUSDT，Bob（1283072）持有 998 pUSDT，Charlie（861696）持有 1 pUSDT；三人及 Orderbook 金库之间没有待领取资产。本轮所有普通钱包写操作使用 MCP，按交易回执入块顺序执行。

## Faucet 与桥接能力

已安装 MCP 的 `claim_faucet` 描述明确只领取测试 PSY，输入没有代币选择参数。当前源码中的桥接网页提供 EVM 测试网的 pUSDT faucet：先由 EVM 钱包调用 `TokenFaucetManager.claim(token)`，再通过 Router 桥接到 Psy，等待 relayer 证明后领取。

MCP `deposit` 可以执行桥接，但它使用由钱包所有者配置的 L1 签名器。本机配置和继承环境均未配置 `PSY_MCP_L1_KEY`，且本次临时 L2 配置没有初始化 L1 元数据。当前没有可直接调用的 MCP pUSDT faucet 方法。若已有 Psy 链 pUSDT faucet 服务，可提供其公开入口再核验。

不要通过聊天发送私钥、助记词或恢复文件。若采用 L1 路径，签名器应由所有者在钱包服务端配置；本次没有读取旧测试钱包的密钥，也没有尝试调用合约 4 的受限铸币方法。

## AMM 与 Orderbook 的部署边界

| 对象 | 当前边界 | 下一步 |
| --- | --- | --- |
| Launch AMM 合约 1503，金库 773632 | fingerprint 固定代币 1494、曲线 66 及来源金库；代币调用为 `claim` 和 `transfer` | 保留原市场；不能将 token ID 改为 4 后直接使用 |
| 历史 PSY/pUSDT AMM 合约 59，金库 1347584 | 九方法旧部署；较新的本地候选增加订单关闭及防覆盖检查，尚未证明已部署 | 新测试前重新核对链上 code/layout；优先完成并验证候选，再以新合约和新 SD-key 金库隔离测试 |
| 新 PSY/pUSDT AMM 合约 1758，金库 499200 | 22 字段、14 方法；增加订单关闭、防覆盖检查和到期 LP 撤出取消 | 已完成独立编译、证明验证、新部署入块、链上根值核对及 SD-key 注册；真实付款联测等待指定金库白名单授权 |
| Orderbook 合约 64，金库 591872 | 已验证的 PSY/pUSDT 整单撮合与撤销部署 | 重新核对 code/layout/fingerprint 后复用，以新订单和新 nonce 测试 |

pUSDT 合约 4 使用 `simple_claim` 和 `simple_transfer`，与发行代币 1494 的方法不同。新 AMM 必须同时核对资产 ABI、精度、完整调用栈及 fingerprint，不能只替换配置中的 token ID。旧 AMM 的本地候选源码也不能视为链上现状。

新部署沿用独立 code/layout 重算、ABI 核对、空布局到新布局的 canonical proof 验证、提交意图保存、单次广播及入块后根值核对。合约 62 和 63 不用于新订单，也不提交更新；上一轮原产物及 SHA 清单保持原样。

## 到账后的测试顺序

以下是完整验收清单；资产领取、基准、新 AMM 部署注册、两轮 Orderbook 撮合及 AMM 初始化已完成，其余付款联测等待明确的钱包收款白名单授权，见 [阶段报告](amm/STAGING_PUSDT_TEST_2026-10-05.md)。

1. 通过 MCP 领取到账资产，保存 included 回执及 PSY/pUSDT 可用余额；读取相关账户与待领取金额，以到账后的同一 checkpoint 建立新基准。
2. 先在 Orderbook 64 做一对完整成交：Alice 卖 PSY、Bob 卖 pUSDT；领取两边输出并关闭订单，再换方向做第二轮。随后分别测试 PSY 和 pUSDT 到期撤销，资金只退原付款人。
3. 每个 Orderbook 卖单按现有规则支付本金与执行费。费用 escrow 为 **1,000,100,000 nanoPSY**；整单卖出上限为 **10,000,000 基础单位**。每种资产分别处理精度，不把相同基础单位数解释为相同币值。
4. 为 PSY/pUSDT AMM 完成候选编译、真实 CFC/SD-key 证明及新部署检查，注册并核对新金库后再支付初始化资产。测试初始 LP、双向兑换、增减 LP、两种资产退款、订单关闭及重新开单；已付费 LP 撤出取消也必须有明确恢复路径。
5. 使用至少三个 MCP 钱包验证多用户订单。重复同一任务、证明期间状态变化及广播结果不确定时，核对无重复支付且不能将输出转给第三人。
6. 最终确认相关订单全部关闭、广播日志全部 resolved。PSY 余额加已知待领取金额及实际手续费应与基准一致；pUSDT 余额加待领取金额应守恒；LP 总量应等于用户份额加永久锁定份额。

新增测试独立保存源码、编译 JSON、layout 证明、精确请求、回执、调用栈、余额基准和 SHA 清单。此前 [10 月 5 日报告](launchamm/STAGING_TEST_2026-10-05.md) 的 54 笔交易属于 PSY/代币 1494 测试，不计作本轮 pUSDT 测试。

## 核查依据

- 本次公开 MCP 响应保存在 [资产核查证据目录](launchamm/deployments/pusdt-funding-check-2026-10-05/)，包括三个钱包的余额、钱包列表及活动钱包恢复结果。
- MCP 源码：`../psy-node/client_prover/psy_mcp_server/src/private_tools.rs`、`src/claims_tools.rs`、`src/l1.rs`。本次未修改这些文件；当前已安装工具的描述与参数另经 `listTools` 核对。
- Faucet 网页源码：`../psy-dapp/apps/bridge/src/pages/FaucetPage.tsx`。
- 历史 AMM 部署与限制：[部署报告](amm/DEPLOYMENT_READINESS_2026-09-28.md)、[订单生命周期候选报告](amm/STAGING_LIFECYCLE_CANDIDATE_2026-09-30.md)。
- Orderbook 金额、费用及调用栈：[operationCalls.mjs](orderbook/operationCalls.mjs)。

前次零余额核查目录保留为历史记录。新增资产来源为用户转账；没有调用 pUSDT 铸币方法，也没有读取普通钱包私钥或恢复文件。最终联测报告需要以 included 回执、订单状态和资金守恒核对为准。
