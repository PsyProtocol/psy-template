# Psy Markets 工作台

现有 React/Vite dApp 上的第一版 AMM、双池组合和订单中心。当前是**明确标记的离线演示**，尚未接入真实市场提交、领取或取消服务。钱包连接不能开启真实交易。

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
