# U124 三市场升级验证报告

日期：2026-10-12。范围：AMM、Orderbook、Bonding Curve 的合约、SD-key 和配套构建/调用工具。均为独立的新版本。

## 最终版本

最终产物为 **`build-close-reviewed/`** 和 **`compiled-close-reviewed/`**。`build/`、`build-final/`、`compiled/` 是保留的中间版本，已被最终版本替代，不用于部署。最终源码快照为 `source/`，配置和构建来源记载在 `build-close-reviewed/provenance.json`。

| 项目 | 方法数 | 状态字段数 | 状态树高度 |
| --- | ---: | ---: | ---: |
| AMM | 16 | 19 | 31 |
| Orderbook | 7 | 15 | 31 |
| Bonding Curve | 11 | 20 | 31 |

AMM 支持双向兑换、初始与追加 LP、提取、双资产退款和取消提取；Orderbook 支持精确整单撮合和两方向撤销；Curve 支持初始化、买卖、过时报价退款及毕业。关闭订单按类型/资产拆为独立入口，避免有效调用读取未使用 Token 的未初始化状态。客户端 `closeCall` 自动选择正确入口。

金额为 `[low62, high62]`，最大 `2^124-1`。两个交易资产均使用新 U124 Token；原生 PSY 保持单 Felt，仅支付网络手续费。没有使用 `invoke_sync`。

## 已执行验证

- **5 项 JS 测试通过**：18 位精度、大整数报价与 LP、精确限价匹配、配置溢出拒绝、无损 JSON、ABI/SD-key 调用形状、读取高度、双 Felt 状态解码及签名请求。
- **6 项实际字节码生命周期测试通过**：三个市场与新 Token 的编译代码一起执行；覆盖 `10^28` 量级金额、两个兑换方向、初始/追加/提取 LP、单/双资产退款、整单成交、买卖、过时报价退款、毕业、nonce 重放、错误付款人和错误高位金额。
- **13 组整数运算证明样本通过预期判定**：最大 U124 乘积、跨 limb 乘法、18 位大金额报价、接近最大 U124 的报价、错误向上/向下取整及模域余数伪造。正确样本生成并验证 Plonky2 证明，错误样本不能证明。
- **17 个 SD-key 分支证明通过**：AMM 8、Orderbook 3、Curve 6。**30 个攻击证明被拒绝**：收款人替换、高位金额替换、资产替换、调用重排、超额烧费、未知分支，以及签名所指的调用栈、nonce、调用数量和结束状态篡改。
- **34 个完整生产 CFC 成功构建**；独立工具重算三个市场的代码根与规范布局根。各结果在 `compiled-close-reviewed/<market>/cfc-review.json`。
- 应用编译器及公开 SD-key 驱动已编译，三个离线 fingerprint 已核验，见 `fingerprints-close-reviewed.json`。

测试日志：`js-tests-close-reviewed.log`、`rust-tests-close-reviewed.log`、`*-cfc-close-reviewed.log`。机器可读摘要：`summary.json`。

## 实际验证边界

VM 测试中的原生 PSY 手续费使用记账 oracle；两份 U124 Token 和市场逻辑使用实际字节码。整数证明和 SD-key 证明已生成并验证；完整 CFC 的验证是电路构建及代码/布局根核验，**不等于真实状态 witness 的 CFC 证明或完整 UPS 证明**。

本轮没有向链上部署、更新、注册、充值或提交交易。`deploymentReady`、`fullStateCfcProof`、`fullUpsProof`、`registered`、`broadcast` 均为 false。新驱动的 `preflight` 入口已实现，留待真实新 Token/市场/金库状态齐备后运行。

配置中的 Token 42/43、市场 1000/1001/1002、issuer 5、target 400 均为测试编号，不能作为测试网部署信息。当前原生 PSY/pUSDT 的单 Felt ABI 不能冒充 U124 交易资产。发布应使用新市场与新金库，核验实际 Token ABI/根、规范初始布局证明和完整 UPS 预检；本版本不用于直接更新现有市场的布局。

## 既有内容保持情况

重新核验先前封存清单，全部通过：新 Token 既有证据 **61 文件**、AMM staging 既有证据 **196 文件**、冻结 SDK **1892 文件**。记录见 `preserved-seals.json`。

本轮源码改动位于三个 `u124/` 新目录及冻结构建目录中对应的应用工具副本。未修改共享 Node、MCP、原 Token/launch-token、旧市场源码、旧部署产物或运行中的 executor；未提交或推送 Git。

报告、源快照、编译产物和日志以 `SHA256SUMS` 封存。`bin/`、`build*/` 和 `compiled*/` 为本地证据/可执行产物，已通过本目录 `.gitignore` 排除，避免作为普通源码提交。
