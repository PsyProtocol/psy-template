# NFT Marketplace v1

一口价 NFT 市场，由 Marketplace 合约、公开 SD-key 和现有 Executor 组成。
绑定一个 NFT v3 合约和一个 U124 FT 支付合约，金额使用 `[low62, high62]`。
原生 PSY 仅用于手续费。没有修改 NFT 资产合约、已有三个市场或 psy-node。

## 交易与退款

1. 卖家在自己的分区签署 `open_listing`。合约读取持有槽位的四 Felt NFT ID、metadata hash，记录指定价格、期限、nonce 和下一笔 FIFO 序号。卖家给金库支付手续费保证金，并转出该 NFT。建议使用 `client.mjs::listingCalls` 在同一个用户 UPS 中完成；它先 ACK 之前已经领取的入金。
2. 买家签署 `open_buy`，明确指定卖家、卖单 nonce 和价格，然后给金库支付 FT 和自己的手续费保证金。`purchaseCalls` 可组合成同一个用户 UPS。
3. 任意执行者可使用公开 SD-key 提交成交。固定的十个调用在一个金库 UPS 内验证订单、领取两人的手续费、领取买家的 FT 和卖家的指定 NFT、ACK 买家的已领取队列、向买家发送 NFT、向卖家发送 FT、返还卖家的手续费保证金、支付网络 burn。
4. 买家自行 `NFT.claim(slot, vault)`；卖家自行 `FT.claim(vault)`，领取返还的 PSY 使用 `simple_claim(vault)`。金库 UPS 的原子性保证两个输出同时发出；收款人随后领取，不表示已经同步写入买家的持有分区。
5. 用户使用 `request_cancel` 签署取消。活跃且未过期的订单不能被观察者任意退款。过期后，任何执行者都可按指纹退款。卖家退款始终发送给卖家；买家的 FT 退款始终发送给该买家。
6. 买家订单取消、过期、引用的卖单被取消/消费/替换后，可以退款。付款不足或超额会按实际未领取 FT 增量退回，不用错误的标价覆盖真实入金。
7. 只付手续费、尚未转出 NFT/FT 的订单有独立退款分支。完全未入金的订单可 `abandon_unfunded`。已结算且没有额外未领取入金的订单可 `close_listing` / `close_buy`，再用更大的 nonce 开单。

买家和卖家的成交准备各要求 **1.0001 PSY** 新的手续费保证金。成交时卖家的这份保证金全部返还；买家的保证金承担成交 UPS 的实际网络费。取消/退款时对应付款人的保证金承担退款 UPS 的网络费。自动 burn 必须处于 1–1.0001 PSY，且为 1000 nanoPSY 的整数倍。最终费用由证明驱动读取，超出范围拒绝广播。保证金的小额剩余留在金库；当前没有任意提现分支。

## 并发与队列

- 每用户一个活动订单；nonce 和金库 `consumed` 游标阻止重复成交/退款。同一卖单有多个买家时，只有一个成功，其余买家可退款。
- NFT 从卖家到金库必须是下一笔 FIFO 项，且恰好新增一个；ID 和 metadata hash 的全部四个 Felt 都要相等。
- 金库使用固定临时槽位 0，并在一次结算内领取、转出，结算之间不持有 NFT。
- 金库发送 NFT 前 ACK 收款人的已领取记录。队列中仍有四笔未领取时整笔结算失败，不会只扣款而漏发 NFT。
- 无后续交易时，收款人可单独注入一份手续费，执行 `ack_delivery` 回收已领取队列。该分支拒绝挪用未结算订单的手续费。
- 原 NFT 合约的 128 个持有槽位和四笔 FIFO 窗口继续适用。买家需保留空槽位，退款收款人也需领取。当前没有收款人分区强制领取功能。

## 代码

| 文件 | 用途 |
| --- | --- |
| `generate.mjs` / `contract/src/main.psy.rs` | 13 个方法的市场合约；源文件中的 41/42 仅为本地测试 ID |
| `policy.mjs` | 六个严格绑定的 SD-key 分支、十个调用、固定临时 NFT 槽位 |
| `client.mjs` | 用户下单/入金组合、BigInt 金额 |
| `reader.mjs` | 单 checkpoint 扫描、成交/退款/ACK 规划 |
| `abi.mjs` / `build.mjs` | NFT/FT ABI 检查、正确外部读取高度、全新产物和来源哈希 |
| `../amm/u124/vm-tests/src/nft_market.rs` | 应用编译 pass：NFT 高度 30、FT/市场 31、PSY 32 |
| `../executor/u124Adapter.mjs` | 复用已有持久提交、回执核对和不明广播保护 |

## 构建与验证

先准备 NFT v3、U124 Token 的编译产物，以及兼容 SDK。构建驱动：

```sh
cargo +nightly-2025-09-20 build --offline --locked --release \
  --manifest-path amm/u124/vm-tests/Cargo.toml \
  --bin compile_nft_market --bin market_wallet_verified
```

配置只包含实际 NFT / FT 合约 ID，例如 `{ "nftId": 41, "tokenId": 42 }`。以下输出目录必须尚不存在：

```sh
npm run build:nft-marketplace -- \
  --config config.json --market-id 1000 --out /tmp/nft-market-fresh/market \
  --compiler /path/to/compile_nft_market \
  --nft /path/to/nft/compilation_artifact.json \
  --token /path/to/token/compilation_artifact.json

node nft-marketplace/samples.mjs \
  /tmp/nft-market-fresh/market/policy.json \
  /tmp/nft-market-fresh/market/policy-samples.json

npm run test:nft-marketplace
NFT_MARKET_BUILD=/tmp/nft-market-fresh TOKEN_WIDE_ARTIFACT=/path/to/token/compilation_artifact.json \
  node --test nft-marketplace/tests/integration.test.mjs
NFT_MARKET_BUILD=/tmp/nft-market-fresh TOKEN_WIDE_ARTIFACT=/path/to/token/compilation_artifact.json \
  cargo +nightly-2025-09-20 test --offline --locked --release \
  --manifest-path amm/u124/vm-tests/Cargo.toml \
  --test nft_market --test nft_sdkey -- --test-threads=1
```

Rust 测试使用本地 ID NFT 41、FT 42、Market 1000、issuer 5。`NFT_MARKET_BUILD/nft/compilation_artifact.json` 必须是对应 NFT v3 的编译产物；测试会通过真实 mint/transfer/claim 初始化资产。签名样例只测试策略，不表示对应订单已经入金。

## Executor 配置

沿用现有 `executor/run.mjs config.json scan|once|watch|reconcile` 和 `executor/service.mjs`。
新实例用 `kind: "nftmarket"`、`profile: "nft-v3-u124"`，需要以下绑定：

```json
{
  "kind": "nftmarket",
  "profile": "nft-v3-u124",
  "network": "staging",
  "contractId": 1000,
  "vaultId": 100,
  "publicKeyHash": "<registered lowercase 64-hex hash>",
  "fingerprint": "<compiled lowercase 64-hex fingerprint>",
  "codeRoot": "<market code root>",
  "layoutRoot": "<market layout root>",
  "abi": "market/compiled/abi.json",
  "driverConfig": "market/config.json",
  "policy": "market/policy.json",
  "wallet": "/path/to/market_wallet_verified",
  "rpcConfig": "/path/to/rpc.json",
  "runtimeDirectory": "/path/to/new-runtime",
  "users": [200, 201],
  "collection": {
    "contractId": 41, "codeRoot": "<NFT code root>",
    "layoutRoot": "<NFT layout root>", "abi": "nft/abi.json"
  },
  "paymentToken": {
    "contractId": 42, "codeRoot": "<FT code root>",
    "layoutRoot": "<FT layout root>", "abi": "token/abi.json"
  }
}
```

这是配置结构示例，占位哈希会被校验拒绝。Executor 启动及执行前绑定网络、三个 code/layout roots、各自状态树高度、金库注册和精确 fingerprint。扫描显式用户列表，并读取买单引用的卖家；尚未实现全链自动发现用户。

## 验收边界

这是第一版实现。未实现拍卖、报价单、版税、平台抽成、多合集路由或私密 NFT 交易。
不承诺处理没有市场订单的任意直接 NFT 入金；额外 NFT 会违反严格序号要求，应使用组合调用避免。额外手续费也必须核对，当前要求精确手续费增量。结算后追加的入金可能阻止关闭，应完成订单再开下一单。

新 NFT Marketplace 应使用**新的合约 ID 和新的 SD-key**。不要拿原始编译器输出直接部署，不要更新既有合约布局。离线 ABI/VM/策略证明及 CFC 构建通过，不等于完整认证状态 UPS 证明、真实链上验收或独立审计。部署就绪标记保持 false，直到对应部署的完整预检和实际回执完成。
