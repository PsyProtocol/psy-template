# Psy Markets 工作台

现有 React/Vite dApp 上的 AMM、双池组合、Orderbook、Bonding Curve、NFT Market 和订单中心。当前是**明确标记的离线演示**，尚未接入真实市场提交、领取或取消服务。钱包连接不能开启真实交易。

## 运行

使用 Node.js >=22.12（本轮使用已有的 Node.js 24.19.0）和 npm：

```sh
cd dapp
npm ci --ignore-scripts
npm run build
npm run test:markets
npm run dev
```

地址为 http://127.0.0.1:5273。开发服务器仅绑定本机，限制可读取目录，禁止读取 .secrets、环境文件、keystore 和 Git 内容。不要把开发服务器暴露为公网交易服务。依赖由 package-lock.json 固定；没有更新或替换链侧 Executor/Rust SDK。

## 已实现

- AMM 单池及现有 QA-A → QA-B → QA-A 双池路径的金额、滑点、收款人、费用上限与草稿期限预览。
- 直接复用 token/wide/arithmetic.mjs 和 amm/u124/client.mjs。金额使用 BigInt 与完整 U124 双 Felt，QA FT 18 位精度，测试 PSY 9 位；小额非零输出不显示成零。
- 订单中心、筛选、完整金额、分阶段演示、取消、原请求对账、最终输出与实际剩余资产领取演示。
- 双池中间 Outbox 必须先领取，之后才能进入第二跳；首跳成交后的退款显示实际 QA-B，不假装按原价撤销首跳。
- 刷新恢复本地演示记录、JSON 导出、桌面/手机布局、键盘焦点、原生对话框和减少动态效果。

## 边界

所有初始储备、报价、订单、状态变化与待领取金额均为本地演示。QA-A/QA-B 合约号仅作已有 QA 实例的参考，不构成运行时身份认证，也不是既有 pUSDT。没有读取或验证链上余额，没有生成证明、实际回执、签名意图、链上 nonce 或真实交易哈希。

表单的分钟是本地草稿偏好，尚未转换为链上 checkpoint 期限。费用数值是用户上限，不是已验证的整条路径费用估计。浏览器存储不是金融 journal；记录损坏时保留原值并停止自动保存。演示不提供跨标签页金融协调。

真实提交入口永久关闭于当前版本，没有环境变量开关。UI 不包含签名/广播调用；旧 TokenPanel 不在当前应用入口。未来接入必须复用正式 Executor/client 适配器，以精确网络、用户、nonce、期限、合约/资产/金库/SD-key 身份、完整调用栈、sig_hash、费用和状态端点进行验证；未知广播先按原请求对账。HTTP 可访问或钱包已连接都不能替代这些门禁。

旧 npm SDK 只用于类型导入，现已用本地浏览器消息接口类型替代；没有引入另一个 SDK。React 仍为 18.3.1。UI 工具链的锁定与开发服务器审计独立于链侧 SDK 发行。

## 结构

- src/markets/domain.mjs：独立的演示草稿、状态、精确金额和关闭的实时门禁。
- src/markets/SwapPanel.tsx、RoutePreview.tsx：表单和实际阶段说明。
- src/markets/OrderTable.tsx、OrderDialog.tsx：订单、取消、恢复与领取演示。
- src/markets/AssetsPanel.tsx：未验证链上余额与演示待领取的明确区分。
- src/hooks/usePsy.ts、src/lib/psy.ts：现有钱包公开账户连接，清理监听和计时资源。
- design/2026-10-26：设计参考和已记录的功能性偏差。

历史 Token 教程保留在 [LEGACY_TOKEN_DEMO.md](LEGACY_TOKEN_DEMO.md)，不适用于当前四市场 UI；不要用其历史依赖或部署步骤探测旧合约兼容性。

## 品牌与语言

当前 UI 统一为英文。Logo、favicon、Geist 字体直接复用现有 psy-dapp 官方资源，采用当前共用的 psy-editorial 产品主题：白底、黑字、钴蓝、直角控件。来源及逐文件 SHA256 见 design/2026-10-26/BRAND-PROVENANCE-v2.json；初版生成图、中文及紫色方案仅保留为已废弃的设计历史。

## Liquidity 入口

侧栏 Liquidity 提供现有 AMM 池的 Add liquidity **离线预览**：两种代币数量、存入比例、最少 LP 份额、owner ID 和费用预算。直接复用 `addShares` 的严格比例及双 Felt/U124 检查，不用 `min` 近似、不假造自动超额退款。LP 份额展示内部原始单位，不假设为 18 位小数的 FT。Demo 使用明确的 1:1 储备 fixture；现已补充 Remove liquidity 的比例取出离线预览，原始 LP 份额、向下取整、最低供应和持有量边界复用既有 withdraw。LP 持仓、真实入金、创建空池、实际移除流动性、签名和提交未接通。网络名称为 Psy testnet，资产 ticker 保持 PSY。

## 公共读取与规划层

新增 Live connection（只读），以及单池/流动性表单的 Prepare RPC-based plan。启动 `npm run gateway -- /绝对路径/持久化unsigned-plan目录` 后，UI 通过同源代理连接本机 5274 网关，可读取真实配置的 RPC、核对已审查身份并生成未签名调用计划、按原 end-user leaf 查询回执。RPC 数据明确标记为观察值，不冒充状态证明；演示订单不会变为链上记录。

`npm run test:gateway` 运行共享客户端、网关及未来精确钱包传输 seam 的回归。说明和具体缺失的钱包接口见 [market-client/README.md](../market-client/README.md)。当前没有钱包的分阶段精确证明/广播适配，没有 Executor 控制接口；资金写入仍关闭。RPC 恢复本身不会开启交易。

## 三市场页面与本地草稿

新增 #orderbook、#curve、#nft：整单买卖限价预览、Curve 整数 lots 买卖及毕业进度、NFT 浏览/搜索/排序/购买和挂牌预览。全英文并复用现有官方 Psy logo、Geist、白黑钴蓝主题；手机以 Market navigation 切换七个入口。

Orderbook 明确完整交换双方 offer，不暗示部分成交或 maker-price 找零；价格、订单 checkpoint、owner 优先级来自现有批次规则。Curve 复用 curveQuote，买入 deposit cap 向上取整、卖出最低到账向下取整；毕业不自动创建 AMM。NFT 购买绑定示例 collection、token、metadata、seller、listing nonce 和完整双 Felt 价格；挂牌保存不发布。

新草稿独立存于 psy.markets.product-drafts.v1，保存/详情/筛选/本地取消/导出，刷新严格重算并校验全部字段；原 AMM 演示数据不迁移或覆盖。新草稿只有 draft/cancelled，绝不伪造链上成交、领取或退款。损坏记录保留原值、停止自动保存。浏览器本地存储没有认证、跨标签页或金融日志保证。

三个页面均为 local-fixture，合约/金库/key 身份未赋值，没有新市场实时 gateway、证明、签名、Executor 投影或资金写入。真实接入仍须完成原钱包安全接口、认证状态与端到端验收；增加页面没有关闭这些缺口。参见 design/2026-10-26/THREE-MARKETS-v1.md 和 ../executor/verification/2026-10-26-three-market-ui-v1/README.md。
