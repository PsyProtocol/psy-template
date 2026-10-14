# NFT Marketplace v1 本地验收 — 2026-10-14

## 实现

- 一口价卖单和买单；绑定 NFT v3、U124 FT、原付款人、四 Felt NFT ID / metadata hash、FIFO 序号、价格、期限和订单 nonce。
- 卖家/买家签署取消；到期或失效订单退款；买家少付/多付按实际未领取增量退款；只付手续费的独立退款；完全未入金的订单释放。
- 六个 SD-key 分支，每个严格约束十个调用。NFT 临时槽位固定为 0，成交在同一个金库 UPS 中领取并发出 NFT 和付款。收款人之后自行 claim。
- 沿用 Executor 的持久日志、完整 UPS 预检入口、广播标记、回执核对和未知提交保护。新增 NFT/FT 的 code root、layout root、状态树高度和 ABI 绑定。
- 现有三个市场仍是九个调用。新版驱动对三份已安装策略重新计算 fingerprint，全部与原值相等。原有常驻服务没有切换或重启。

## 验证

| 验证 | 结果 |
| --- | --- |
| JavaScript：NFT、Executor、U124 市场及编译产物接入 | 85 通过，0 失败，0 跳过 |
| Rust：实际 NFT/FT/市场字节码场景 | 9 场景通过 |
| Rust：市场全部 CFC 构建 | 13 个方法通过；非成交方法 degree 12，成交 degree 13 |
| Rust：完整 SD-key 签名证明 | 六个分支证明及验证通过 |
| 恶意签名证明 | 18 种篡改被拒绝 |
| 旧市场 fingerprint | AMM / Orderbook / Curve 均保持原值 |
| 真实链提交 | 本轮没有 |

字节码测试通过真实 NFT mint/transfer/claim 和 U124 FT mint/transfer/claim 初始化。
覆盖：正常成交和领取、金额高位、重复成交、取消与成交竞争、过期边界、多买家竞争、原付款人退款、少付/多付退款、手续费单独入金、空订单释放、NFT ID / metadata / FIFO 替换、金库临时槽位占用、满队列失败时完整回滚、ACK 回收，以及 ACK 不挪用活动订单的费用。

恶意 SD-key 证明覆盖：修改领取发送者和临时槽位、修改 ACK 收款人、修改 NFT/FT 收款人、金额高位、手续费返还金额、调用顺序、NFT 资产 ID、burn 上限，以及伪造交易摘要、计数、nonce 或最终用户状态。

## 编译与资产范围

本地夹具：NFT 41、U124 FT 42、市场 1000、金库 100，发行者 5；这些是内存 VM 的测试 ID，**不是本轮新部署的链上合约**。

NFT 资产源码保持原样，使用 `nft/src/main.psy.rs` 重新编译。FT 使用已核验的 U124 测试产物。应用编译 pass 绑定 NFT 树高 30、FT / 市场 31、Native PSY 32。方法接口、目标密集编号及外部读取高度通过 artifact gate。

本轮编译碰到的普通数组跨用户索引和比较 opcode 兼容问题已在应用层修复：市场分别保存 NFT ID 和 metadata hash 的四个 scalar 字段，应用编译器处理比较引用重排；没有修改 Node、NFT 或 FT 的布局。失败尝试的源码和日志另存，未覆盖旧产物。

## 证据与复现

公开机器可读结果见 [RESULTS.json](RESULTS.json)。模块命令、费用规则和配置见 [README](../../README.md)。

本机完整原始证据位于本目录的 `evidence/`、`source/`、`bin/` 和 `SHA256SUMS`，Git 忽略大体积原始产物。工作副本位于 `/private/tmp/psy-nft-market-20261014/`。冻结 SDK 只作为只读依赖，目录为 `amm/wide/deployments/staging-2026-10-12/build/psy-node`；版本基线 `5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6` 加此前既有的客户端签名绑定修复。本轮没有修改该 SDK。

验证日志保留所有测试名称和结果。文件哈希由本目录 `SHA256SUMS` 保存。没有普通钱包私钥、助记词或恢复文件。

## 尚未通过的门槛

- 未生成这个部署实例的完整认证状态 UPS 证明，未部署/注册新的 NFT 市场或金库，也未做真实链上买卖。
- VM 的 Native PSY 手续费是本地 oracle；Executor 接入测试使用 RPC/driver doubles。这两者不替代真实手续费与网络证明验收。
- CFC 已构建，SD-key 已证明，但不宣称已经证明全部含认证状态的 CFC / UPS。
- 没有独立外部审计、跨机器执行和高 TPS 验证。只扫描配置用户及其引用的卖家。
- 一用户一订单、一合集一支付资产；没有拍卖、报价单、版税、平台抽成或私密 NFT。额外/无关联 NFT、结算后追加入金和非精确费用入金不在自动恢复保证范围内。

因此 `deploymentReady` 和 `fullUpsVerified` 仍为 false；当前结论是第一版实现通过本地验证。
