# MCP 权限修复及确认接口：2026-10-09

状态：**通用代币调用入口修复、Nostr 过时测试修正、客户端确认接口适配已完成。默认完整回归 1,136 通过、0 失败、11 忽略；另行执行 5 项被忽略的历史策略诊断均失败。已安装服务尚未切换，正在确认这 5 项的处理范围。**

## 已完成

1. MCP 通用 `call_contract` 最前面拒绝直接调用合约 **0（PSY）/4（pUSDT）** 的所有方法，早于钱包、网络、策略记账、证明和提交。返回 `gate: policy`、`submitted: false`，引导使用专用代币工具。
2. handler 测试验证拒绝后非零策略花费、会话额度和持久化文件保持原样；自定义合约 64/1494/1758 仍进入原调用流程。
3. 修正 Nostr 过时测试。提交 `73f9b85a27efb986be3e0267a34386887073ccf7`（9 月 9 日）明确移除了充值 proof 外层 `version`；Bridge 发送端和钱包接收端也使用无外层版本格式。原测试残留 `version == 2`，造成默认回归失败。本次只改测试，生产消息格式逐字不变，并增加全局/链内索引、秒级时间戳、token 合约 ID、root/nullifier/count 和加密 secrets 检查。
4. `scripts/mcp_confirmed_client.mjs` 提供 `prepareMcpTransaction` 和 `executeMcpTransaction`，由调用者先展示 summary，完成所有者确认后再传入 owner 凭据。执行只接收票据和凭据，不能修改交易字段；没有旧直接接口 fallback。
5. 客户端 `mcp_payment_guard` 同时拒绝 raw / prepare 通用代币调用。5 项客户端测试通过；适配层覆盖当前服务的全部 16 项交易操作。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| 默认 MCP crate 全部 19 个测试目标 | 1,136 通过、0 失败、11 忽略，exit 0 |
| 本地双网络 RPC | 实际执行，未因 sandbox 跳过 |
| 真实 MCP stdio | 8 次通用代币调用被拒绝、3 个自定义合约正常路由、确认票据重放被拒绝 |
| 客户端适配 | 5 通过，0 失败，无 raw fallback |
| 模板 exchange/executor/security 回归 | 93 通过、0 失败、0 跳过 |
| 独立 ignored policy 诊断 | 0 通过、5 失败，exit 101 |
| 链上提交、真实钱包文件写入 | 本次接口验证为 0 |

默认回归通过不等于所有权限问题已修复。11 项忽略条目包含 5 项历史 policy finding，另 6 项是重复引入的调试工具、在线 Nostr relay 和在线 L1/RPC 测试；完整条目与日志见 `verification.json`。没有执行在线调试/faucet 工具。

## 新复现的历史策略问题

这 5 项来自原有 `tests/adversarial_policy.rs` 的 ignored 测试；生产 `policy.rs` 尚未修改：

- 跨天退款错误扣减新一天的已花额度。
- 空收款人 alias 列表被当作入账，跳过白名单。
- `0x1234` 与公开用户 ID `1234` 归一化混淆。
- `self` 哨兵可在对外花费的策略检查中跳过收款人限制。
- 损坏的策略文件随后被覆盖，原预算/暂停状态丢失。

这些是策略引擎诊断，不代表已对链实施转账攻击；某些输入还会被下游地址解析拒绝。它们没有因本次改动新增，也没有被记为通过。已向用户询问“全部修复后切换”或“完成本次补丁、暂缓切换”。依据 `psy-node/AGENTS.md` 的失败处理规则，目前停止服务安装/发布。

## 范围与架构

MCP 是独立 `psy-mcp-server` 程序，通过 RPC 调用链；源码位于 `psy-node/client_prover/psy_mcp_server/` 并复用 Rust 钱包/证明器依赖。只修改 MCP 接口、测试和模板客户端；出块、coordinator、共识、电路、VM 和链上合约没有本次改动。

本次入口检查不分析任意自定义合约的 deferred 代币效果。`call_contract` 仍是具有较大权限的合约交互，不应被视为任意合约的收款人/本金审计器。

## 构建与证据

- 基础源码：`PsyProtocol/psy-node` 的 `multi_chain`，HEAD `5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6` 加本地 MCP 补丁；尚未提交或推送。
- Genesis 已有配置/数据：gitlink `9ea96ca13f60247c22b2108f086fb9cd1287ba94`，没有重新生成。
- 构建目录：`/private/tmp/psy-mcp-policy-fix-20261009/clean-node`，基础 HEAD 干净 archive 加 6 个 MCP 文件，原 Cargo.lock，release/locked/offline。
- 候选：`/private/tmp/psy-mcp-policy-fix-20261009/target/release/psy-mcp-server`。
- 当前候选 SHA-256：`4c7202a3257e7dbae53947a6f4a747074674764becff135513cd6978ef670630`。
- 已安装 `/Users/geir/.psy/bin/psy-mcp-server` 未替换，SHA-256 `1c02ada7f06a3274e6ac6f359fbddae12aeba926a08454d8f4e7e0b660a6b38d`。
- [本轮源码、补丁和日志](tests/security/mcp-policy-fix-followup-2026-10-09/)。
- [初次修复证据](tests/security/mcp-policy-fix-2026-10-09/) 保留当时 1 项默认回归失败的原始记录。初次候选的历史 hash 不代表后续构建覆盖后的候选。

当前源码原有 `prepare_* / execute_*` 流程要求 owner 凭据；已安装服务仍是旧的直接交易接口。客户端适配已提供，但没有自动确认真实交易、修改钱包策略、切换真实钱包或重启既有服务。

仓库原有的三处电路/证明器/VM 编辑保持原 hash，未带入候选。本轮及此前 AMM/Orderbook 部署、交易证据和 SHA 清单均保留。后续 commit 需按 AGENTS.md 对确切 staged diff 完成独立审阅；push 仍需明确仓库、目标 ref 和范围。
