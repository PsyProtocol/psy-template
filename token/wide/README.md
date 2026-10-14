# 双 Felt 公共 Token（U124）

这是独立的公共 Token 版本，已在测试网部署为资产 **2431 / 2432**，并用于三个 U124 市场的真实结算。金额表示为 `[low, high]`：

```text
amount = low + high × 2^62
0 ≤ low, high < 2^62
最大最小单位金额 = 2^124 − 1
                   = 21267647932558653966460912964485513215
```

18 位小数时，最大金额为 **21,267,647,932,558,653,966.460912964485513215 枚**。
每个 limb 用 62 位，使低位相加和高位进位的中间值最多为 `2^63−1`，低于 Goldilocks 模数。
这不是 uint128/uint256。余额、供应量、累计转账及授权额度均使用两个 Felt。

## 已实现

- 保留公共版全部 20 个方法：元数据、供应量上限、铸币、销毁与结算、转账/领取、
  批量转账、原付款人退款、协作式授权撤销。
- 余额、total_minted、total_supply、max_supply、burn_requested/burn_settled，
  Outbox sent/claimed、delegation allocation/spent 都转换为两个 limb。
- 显式位分解和加权重组约束规范范围；从 63 位低位和提取进位，按位比较计算借位。
  不把两 limb 相加/相乘成单个 Felt，不依赖 invoke_sync。
- 原付款人、发行者权限、版本和协作关闭检查保留。用户 ID 使用 24 位约束，
  channel index 使用 4 位约束，channel version 使用 62 位范围。
- `arithmetic.mjs` 使用 BigInt 解析和显示 0～18 位精度；`callBuilder.mjs` 覆盖全部公共 ABI。

`set_metadata` 保留原公共版的管理语义：发行者可在放弃管理权限之前修改元数据。
协作撤销仍需要 spender 关闭；没有新增单方面安全撤销能力。
本文件描述的公开 U124 版本没有私有 note 方法。
新增的[双 Felt 私有版](private/README.md)保留这些公开方法并增加隐私转账与领取，
使用独立的 32 层布局，必须以新合约部署，不能覆盖本版的既有实例。

## 调用与整数精度

```js
import {parseUnits,losslessJson} from './arithmetic.mjs';
import {createTokenCallBuilder} from './callBuilder.mjs';

const token = createTokenCallBuilder(42); // 替换为新部署的合约 ID
const amount = parseUnits('1000000000.123456789012345678',18);
const call = token.transfer(200,amount);
const wire = losslessJson(call); // 金额以两个精确的 JSON 整数发送
```

62 位 limb 可能超过 JavaScript Number 的安全整数范围。不能先 `Number(limb)`，
也不能用普通 `JSON.parse` 读取大整数后再序列化。Rust `u64` JSON 输入可解析上面的整数文本；
客户端读取金额时需保留整数文本或使用支持 BigInt 的 JSON 解析器。
现有只接受安全 Number 的钱包/SDK调用层必须接入此编码后才能发送大额 U124。

## 编译和测试

从仓库根目录运行；需要相邻 SDK 源码和本地 Rust 依赖缓存。
输出目录必须不存在。发行者 ID 是本次新构建的显式参数，不会修改旧 Token 的发行者配置。

```sh
node token/wide/generate.mjs --check
npm run test:token-wide
npm run test:token-wide:vm
npm run build:token-wide -- /private/tmp/token-u124-new --issuer 1239104
```

可通过 `TOKEN_WIDE_COMPILER=/path/to/offline-compile` 使用冻结的编译器二进制。
该二进制参数为 `<source> <new-output-directory>`。默认走本项目 Rust 编译包装器。
`src/main.psy.rs` 的 issuer 5 是本地测试占位；部署构建必须使用真实注册账户。
构建检查始终返回 `deploymentReady: false`。

本地记录见 [验证报告](verification-2026-10-12/REPORT.md)。最终本地夹具仅为
`verification-2026-10-12/compiled-reviewed/`；其他 compile 尝试仅用于保留诊断证据。

## 部署和兼容边界

初版离线验证后，新实例已部署并完成真实市场结算，见[结算报告](../../amm/u124/deployments/staging-2026-10-12/continuation-2026-10-13/REPORT.md)。新版本的布局和 ABI 不兼容旧单 Felt Token；
必须使用新的合约 ID，旧余额迁移需另行设计，不能直接覆盖旧部署。

PSY 0 / pUSDT 4、网络手续费、桥和原有市场仍使用当前接口。
新 [U124 AMM / Orderbook / Bonding Curve](../../amm/u124/README.md) 已适配两 limb 金额和宽整数定价，并完成独立新实例的真实结算。
原生 PSY/pUSDT 的链级迁移需要协调预编译合约、SDK、钱包、桥和既有消费者。

算术证明和本地 VM 通过不代表完整状态 CFC、UPS或真实资金验收通过。
完成这些检查前，不标记为生产就绪。
