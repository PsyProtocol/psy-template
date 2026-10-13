# AMM 大金额候选与三个市场边界验证

完成日期：2026-10-12，Asia/Taipei。目录保留首次尝试日期 2026-10-11。

## 本轮结果

| 项目 | 完成内容 | 验证 |
| --- | --- | --- |
| AMM 候选 | 储备、输入与 LP 总份额上限提高至 10^12 最小单位；PSY 储备上限 1000 PSY | 当前编译器、独立 u128 VM 对照、算术证明、完整 CFC 构建通过 |
| AMM 兼容性 | 22 个状态字段、14 方法 ABI 与现有 reviewed artifact 一致 | 布局、偏移、参数数目、方法 ID 与重复定义检查通过 |
| Orderbook | 本地撮合器采用准确的限价优先顺序，等价订单按用户 ID 决定顺序 | 输入排列不影响选择；整单数量不兼容时跳过；快照不被修改 |
| Bonding Curve | 加强独立价格求和、最大参数和毕业边界验证 | 1000 组价格/库存对照；实际编译 VM 的买卖、旧报价退款和毕业边界通过 |
| 安全参考模型 | AMM 手续费必须符合 1000 单位 DA 增量；Orderbook burn 必须恰好一个参数 | 与现有 Rust 指纹形状一致的拒绝测试通过；链上策略未改变 |

本轮没有提交交易，没有新增或更新合约，没有切换冻结的 executor 服务。
现网金额上限仍是原配置。这里完成的是**本地候选实现与验证**。

## 测试结果与范围

- `npm run test:exchanges`：**149 / 149 通过**，包含三个市场、Launch AMM、执行器、安全参考模型和新增候选测试。
- 候选 Rust suite：**10 / 10 通过**：4 项大金额 VM 测试、4 项 Curve/Orderbook 边界测试、
  1 项算术证明测试、1 项完整 CFC 构建测试。
- 现有 AMM Rust SD-key suite：**2 / 2 通过**，方法 ABI 和退款原付款人绑定。
  该项使用现有小金额退款样例，不等于大金额完整 UPS 测试。
- 128 组确定种子随机兑换在编译 VM 中与独立 u128 oracle 一致；额外高一单位的报价均被拒绝。
- JS 独立 oracle 验证 1000 组 Curve 价格/库存组合，以及 1000 次大额双向兑换乘积不减。

AMM VM 覆盖两种兑换方向、初始 LP 平方根、后续精确比例添加、撤出、上限、异常储备、
错误付款人、错误付款金额、偏差一单位和重复执行。Curve 的测试包含最大参数一次完整
买入再卖出，以及两用户并发意图的旧报价被拒绝、毕业后的旧付款可退款。
Orderbook 测试包含精确 deadline、价格、费用、重放，以及退款先结算后无法再撮合。
这些顺序执行的 VM 测试证明守卫行为，不证明跨机器实际并发的共识行为。

算术证明使用相同生成器模板，经生产 `SimpleDPNBuilder` opcode gadget 构建，
分别证明 `<=`、`<`、`==` 比较，生成并验证有效证明，拒绝错误乘积、超 56 位输入和字段回绕伪造。
其中回绕反例是 `2^32 × 2^32` 与其 Goldilocks 字段余数 `2^32 - 1`；两边操作数均在范围内。
这是**算术子电路证明**，没有伪装成完整状态 CFC 或 UPS 证明。

完整生产 CFC 构建记录：

| 方法 | IR definitions | State commands | Base degree bits |
| --- | ---: | ---: | ---: |
| swap | 2469 | 24 | 12 |
| add_liquidity | 4004 | 24 | 12 |
| remove_liquidity | 2506 | 20 | 12 |

没有清除断言、删除状态读取或绕过验证来获得这些结果。
没有完整状态见证，因此尚未生成这些完整 CFC 的状态证明。

## 产物和编译路径

- 最终候选：`compiled-final/` 的 ABI、circuit definitions、统一 compilation artifact 和 code bytes。
- `compiled-final/review.json`：源码和各产物 SHA256、编译库仓库 HEAD、相关工作区状态及 lock hash。
- `source/`：本轮 32 个代码/文档文件快照。
- `node-source-hashes.json`：实际读取的 compiler、VM、DPN circuit 源文件 hash。
- `summary.json`：本轮计数、金额上限和旧产物校验结果。
- `exchanges-final-retry.log`、`rust-final.log`、`sdkey-proof-regression.log`：最终成功记录。

编译通过本仓库 `amm/wide/vm-tests/src/bin/compile.rs` 调用相邻 Node 的 `psy_compiler::compile`。
Node HEAD 为 `5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6`；编译时存在他人未提交的
`client_prover/psy_vm/src/ups/sd_key.rs` 修改。本轮未修改 Node；此候选不是干净提交构建的发布产物。
部署前必须重新冻结并审查依赖版本。

## 保留的失败尝试

1. 已安装 0.1.2 CLI 能编译最初的内部 helper 返回值版本，但没有 canonical layout artifact；
   保留 `compiled-attempt-1/`，它不是最终部署候选。
2. 当前仓库编译器处理内部函数返回值时触发 `Expected single felt, got Void`。
   保留 `compile-attempt-2.log` 和 `source-attempt-1.psy.rs`；随后将算术展开为直线代码。
   当前候选不依赖 invoke_sync，也没有修补 Node 编译器。
3. 第一轮 VM 读取了旧 CLI 不生成的统一 artifact，因缺文件失败；改用当前编译器后通过。
4. 完整 JS 回归初次有一个测试误将中文路径的 URL pathname 用作文件路径，保留失败日志；
   改用 `fileURLToPath` 后 149 项全部通过。

## 旧系统与产物完整性

- 2026-10-11 扫描优化证据：38 文件原 SHA256 清单通过。
- 2026-10-11 真实资金验收证据：135 文件原 SHA256 清单通过。
- 活动 executor revision 3：51 个发布文件原 hash 通过；没有重启或替换服务。
- 原 AMM、Curve、Orderbook 合约源码未修改；旧编译产物、注册配置、普通钱包策略未修改。

## 尚未完成的生产条件

1. 完整状态 CFC/UPS 证明预检及真实 PSY/pUSDT 验收。
2. 新合约部署产物的独立 code/layout 根检查、empty → 22-field layout 证明生成和独立验证，
   以及对应新金库的 SD-key fingerprint 注册；不使用旧 62 更新流程。
3. 升级权限治理和手续费经济性。费用托管仍约 1.0001 PSY，没有降低网络基础费用。
4. Orderbook 的部分成交、多订单管理及有可验证时间依据的公平排序。
5. 独立外部审计、长期负载验证和多机执行网络。

金额上限提高 100000 倍不等于生产就绪。当前明确的配置范围为 1000 PSY 储备，
所有文档和 metadata 仍将部署状态标记为未部署/未就绪。
