# U124 三市场错误处理与并发补强

日期：2026-10-13。范围：AMM、Orderbook、Bonding Curve 共用客户端、公开 SD-key 驱动和回归测试。审计交接见 [AUDIT_HANDOFF.md](AUDIT_HANDOFF.md)。

## 修复

1. 驱动捕获冻结 SDK 在执行非法金额时产生的 unwind，丢弃整个失败会话。已知 SplitBits 越界返回 `invalid_amount_range`、`submitted:false`、退出码 **1**；其他未知 panic 使用固定错误类别，隐藏原始 panic 内容。普通合约断言仍返回失败原因。
2. 两个二进制共用 `wallet_driver.rs`。`submit` 与 `verified-submit` 都独立验证同一份完整 UPS 证明，并在发送前检查锚点及 nonce；移除了旧 submit 入口绕过独立验证的路径。
3. 发送前输出并 flush 确切的 `userId / nonce / endUserLeafHash`。发送开始后失败返回 `submission_unknown` 和 `submitted:null`，不能误报为未提交，不能自动重试。持久化和恢复仍由现有执行日志负责。
4. 调用数量、绑定市场和 U124 limb 检查移到 RPC 初始化之前。
5. 修复共用客户端的 JSON 往返：解析器产生 null-prototype 对象，原序列化器无法处理。应用层编码器现在保留嵌套对象、BigInt 和 `__proto__` 等数据键，不改变对象原型。Token 源码未修改。

SDK 内部的 panic 本身仍存在，本轮修复的是应用驱动的失败边界；无需改 Node 或重新部署合约。

## 最终验证

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| JavaScript 回归 | **21/21 通过，0 跳过** | logs/js-tests-final.log |
| Rust 回归 | **14/14 通过**：市场 7、生产 VM 3、运行时 4 | logs/rust-tests-final.log |
| CLI 行为与身份 | 6 个 fingerprint 匹配、6 个输入在不可达 RPC 配置下提前拒绝 | CLI_RESULTS.json |
| 真实状态非法报价 | 最终二进制返回 invalid_amount_range、submitted:false、退出码 1 | logs/live-excessive-output-final.log |
| 只读 RPC 审计 | 无部署、注册、更新、转账或 UPS 广播请求 | readonly-rpc-audit.jsonl |
| 链上身份 | 两个 Token、三个市场的代码/布局根与既有证据一致 | live-roots.json / SUMMARY.json |
| 旧证据封存 | 上轮 631 文件一致；冻结 SDK 的 1887 个非钱包文件一致，5 个钱包 fixture 未读取 | PRESERVED_SEALS.json |

生产 VM 回归载入实际部署 v6 的 AMM 字节码，模拟上轮输入与状态读取：5 A 输入、100 B 输出产生范围 unwind，被捕获为拒绝；使用合法输出 `3197849341433559487` 原始单位则到达用户最小输出的 `slippage` 断言。模拟读取不是链上状态证明。真实状态预检另外载入当前链上状态及证明，在独立只读传输层下复现同一错误类别；该请求来自上轮失败样例，当前状态已有变化，不将它视为原 checkpoint 的重放。

## 并发验证范围

- **执行者压力**：64 个执行者争用每个金库，三个金库并行，8 轮，共 **1536 次尝试**。24 个拥有锁的执行者证明/广播；1512 次争用被拒绝；另外检查每轮已入块任务不再次执行，重复广播数 **0**。这里的证明和回执是明确标记的 fixture。
- **字节码竞争**：三个市场各 4 轮，每轮 8 个线程从相同状态执行实际 Token/市场字节码，96 个候选中 12 个提交到本地锚点模型，84 个被版本变化阻止。每轮再次执行已消费订单均失败，原付款人 claim 后恢复支付前 Token 余额。
- **响应丢失**：三个金库分别模拟发送成功后响应丢失，日志阻止下一笔操作；按精确回执恢复后同一任务不再广播。覆盖新驱动在发送后普通错误及 panic 时的未知状态表达。

这补齐了可重复运行的本地争用、重放和恢复压力测试。**未进行链上高并发提交/TPS 测量、跨机器协调或 coordinator/realm 故障注入**；不能依据本地耗时宣称网络容量。

## 重现

源码要求同级 psy-node；本机使用此前冻结 SDK 下的应用工具副本进行构建，工具和源码哈希在 SOURCE_AND_TOOL_HASHES.json，二进制保存在 bin/。

```sh
# 将以下变量改为本机绝对路径；cargo 测试的 cwd 为包目录。
U124_BUILD=/absolute/path/to/fresh-fixture-artifacts \
  node --test amm/u124/client.test.mjs amm/u124/preflightGate.test.mjs \
  amm/u124/concurrency.test.mjs executor/journal.test.mjs

DENSE_MARKETS=/absolute/path/to/deployed-v6 \
U124_BUILD=/absolute/path/to/fresh-fixture-artifacts \
TOKEN_WIDE_ARTIFACT=/absolute/path/to/token-compilation_artifact.json \
  cargo +nightly-2025-09-20 test --offline --locked --release \
  --manifest-path amm/u124/vm-tests/Cargo.toml \
  --test runtime --test production_dense --test markets
```

中间诊断均保留：首次 Rust 测试使用相对路径导致找不到 fixture；旧离线 fixture 被现有 dense-target gate 拒绝，随后新建当前构建产物；首次 CLI 检查暴露 JSON 往返问题，修复后全部通过。原产物未覆盖。

## 尚需外部工作

第三方安全审计需要独立团队完成，当前材料已备齐，未对外发送。链上高并发容量和故障注入需要另行安排可观测的专用测试环境。上一轮 64 笔用户交易及 12 笔完整 UPS 真实结算证据继续有效；本轮只读验证未新增结算或消耗钱包额度。未提交或推送 Git。
