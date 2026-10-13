# AMM 大金额候选版本

v1 已于 2026-10-12 部署为测试合约 **2425**，SD-key 金库为 **317504**。
真实退款证明发现未初始化 pUSDT 分区的读取问题，尚未通过完整 UPS 验收。
修复候选位于 `v2/`，尚未部署。两个版本使用 PSY 0 / pUSDT 4，支持每种资产储备、输入和 LP 总份额
最多 `1_000_000_000_000` 最小单位。对于九位小数的 PSY，这是 **1000 PSY**，
相对当前 AMM 1758 的 0.01 PSY 上限提高 100000 倍。pUSDT 的显示数量应按其实际精度换算。
这仍然是有界版本，不能称为无限金额支持或生产就绪。

## 实现

- `generate.mjs` 固定旧合约源码 SHA256，生成可审查的直线代码；`--check` 只检查重现性。
- `contract/src/main.psy.rs` 使用四段 `2^28` 进制整数比较验证兑换报价、初始 LP 平方根、
  后续 LP 份额和撤出金额。没有新增输入见证，没有增加状态字段。
- `quote.mjs` 使用 BigInt 提供与候选合约一致的限额和报价；添加流动性仍要求精确比例。
- `operationCalls.mjs` 使用候选金额配置。旧 `amm/operationCalls.mjs` 继续限制 10000000。
- `artifactGate.mjs` 检查 22 字段布局、14 方法 ABI、参数数量和 IR 一致性。
  通过此检查仍返回 `deploymentReady: false`，不是部署证明验证器。
- `vm-tests/` 使用相邻 Node 的编译器和 VM 库进行本地验证，没有修改 Node 源码。

### 整数约束

对 `a,b < 2^56`，先各拆成两个 28 位整数，再按列相乘并传递进位。
每个中间列值都小于 `2^58`，严格低于 Goldilocks 模数，因而不会在字段内回绕。
四个规范化段表示完整的最多 112 位乘积，按高位到低位比较。

代码中的 `/ 268435456` 是字段除法。它只用在 `原值 - 已提取低28位` 上；
这个差值在整数域中能被 `2^28` 整除，因此其字段商等于有界整数进位。
它不是一般的整数向下取整实现。

兑换仍证明 `out * denominator <= numerator < (out + 1) * denominator`。
扩大后的分母仍小于 `2 × 10^16`，但分子及乘积使用完整整数比较。
私有函数返回值在当前编译器中存在问题，因此代码直接展开，**不依赖 invoke_sync**。

## 复现

从 `psy-template` 根目录运行，需要相邻 `psy-node`、指定 Rust toolchain 和本地依赖缓存：

```sh
node amm/wide/generate.mjs --check
npm run build:amm-wide -- /private/tmp/amm-wide-candidate-new
AMM_WIDE_ARTIFACT=/private/tmp/amm-wide-candidate-new/compilation_artifact.json npm run test:amm-wide
AMM_WIDE_ARTIFACT=/private/tmp/amm-wide-candidate-new/compilation_artifact.json npm run test:amm-wide:vm
npm run test:exchanges
```

输出目录必须不存在；构建拒绝覆盖旧文件。可设置 `CARGO_TARGET_DIR` 使用单独构建缓存。
已保存的 `verification-2026-10-11/compiled-final/` 可用于本地测试的默认输入。

## 已验证与剩余部署条件

本地验证包含 128 组随机 VM 兑换及错误报价、上限、错误付款、错误付款人、重放、
LP 初始平方根与后续添加/撤出边界；用独立 u128 计算作比较。
同一段算术还通过生产 DPN opcode 电路生成和验证零知识证明，拒绝字段回绕伪造。
完整 swap/add/remove CFC 可以构建，未发生 target 冲突。

**算术子电路证明与完整 CFC 构建不能替代完整状态 CFC / UPS 证明和真实链交易。**
部署前仍需：

1. 在干净、已审查的依赖版本上重新构建；本轮本地 Node 有他人未提交修改，记录在产物 provenance。
2. 生成独立 code/layout 根，准备并独立验证新部署的 empty → 22-field layout 证明。
3. 使用新的合约 ID 和独立金库，重新计算、注册相匹配的 SD-key fingerprint。
4. 对精确部署产物进行完整状态证明和证明前复扫，完成真实 PSY/pUSDT 资金核对。

当前每次操作仍要求 `1_000_100_000` PSY 最小单位手续费托管；网络费用没有降低。
升级权限、部分成交、多订单管理、全网请求发现和独立外部审计仍有后续工作。
本地测试记录见 [验证报告](verification-2026-10-11/REPORT.md)。

## 2026-10-12 真实状态跟进

v1 的部署入块、链上代码/布局根及金库注册均已核验。钱包权限按用户授权仅扩展
新测试钱包，旧三位用户策略未改。PSY 退款在广播前的完整 UPS 预检中失败；
VM 见证确认 PSY 分支仍读取未初始化的 pUSDT 分区，零合约叶与空状态树根不一致。

v2 仅将 swap/refund 的分支内外部资产读取从固定 4 改为已经约束为 0/4 的 `asset`。
该候选通过真实状态完整退款 CFC 证明、4 项 VM 测试及独立初始布局证明验证；
这不代表完整 UPS 或真实兑换通过。部分 LP 退款/关闭仍需已初始化的付款人 pUSDT 分区。

固定 SDK 包使用提交基线及三份已记录 hash 的既有 session-binding 补丁，仍不是干净的
上游 SDK 发布；1892 个输入文件再次核验未变。共享 Node 源码和运行服务未改。
资金状态、原始失败和后续部署条件见 [本轮报告](deployments/staging-2026-10-12/REPORT.md)。
