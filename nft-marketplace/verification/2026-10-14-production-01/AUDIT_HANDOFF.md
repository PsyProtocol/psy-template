# 独立安全审查交接

这份材料是审查输入，不是独立审计结论。工程验收及测试网回执见 [REPORT.md](REPORT.md) 和 [RESULTS.json](RESULTS.json)。

## 源码范围

- FT：`token/wide/src/main.psy.rs`、整数运算及编译适配。
- NFT：`nft/src/main.psy.rs`，四 Felt ID、128 个持有槽、四槽 FIFO 与 ACK。
- AMM：`amm/u124/contract/src/main.psy.rs`。
- Orderbook：`orderbook/u124/contract/src/main.psy.rs`。
- Curve：`bondingcurve/u124/contract/src/main.psy.rs`。
- NFT Market：`nft-marketplace/generate.mjs`、生成源码、ABI gate、policy、reader、client、status、acceptance。
- 公开 SD-key：`amm/u124/vm-tests/src/policy.rs`、`wallet_driver.rs`、运行时错误边界及独立布局 verifier。
- Executor：身份和根绑定、journal、durableFile、driverProcess、worker、回执核对、冻结发布与服务恢复。

## 需要独立确认的安全边界

1. 完整 UPS 的原子性；caller 锚点及 nonce 竞争；失败与响应丢失时是否可能重复执行。
2. 跨 realm、历史远端状态与 checkpoint 的绑定。取消请求和到期条件不能代替已确认的退款；区分当前扫描和任意公开执行者使用历史证明。
3. U124 的范围、进位/借位、乘除及舍入；分支中的实际 delta、消费游标和输出领取游标。
4. NFT 的实际身份、metadata、FIFO、ACK、接收槽满、重放，以及余额/供给与持有槽的一致性。
5. 激活的精确 Native/FT 入金、种子返还、一次性 marker、未初始化用户叶及资产树。
6. 部署者、mint authority 和更新权限的控制。当前 SD-key introspection 校验 ID/method/参数/调用栈；执行器检查代码和布局根。应用检查不构成链上不可升级证明，应明确是否需要不可升级部署或认证代码根的 SD-key。
7. 初始与更新的 layout 证明端点、字段/槽数、高度、类型和 deployer。此次只部署新实例，未更新旧布局。
8. 同机共享日志的能力边界、跨机拓扑、服务可用性、告警、备份恢复及实际资源/链上容量。

不要启用 SDK 明确禁止的未认证 SD-key state reader 或未经认证的 secp 结果来解决这些问题。协议相关结论需要独立验证，不能从应用测试替身推导。

## 本地证据位置

机器：本次开发 Mac。目录：

`/Users/geir/Downloads/QED资料/litepaper/psy-template/nft-marketplace/verification/2026-10-14-production-01`

包含初始 request/report、编译 artifact/ABI、绑定 policy、只读 CFC witness、实际 SDK 调用、持久广播日志、57 份重新核对的回执、实体 NFT 和资产守恒结果、测试日志、冻结二进制及哈希封存。原 v2 失败证据在相邻 `2026-10-14-continuation-01` 目录；旧封存文件未覆盖。

向外部团队交接时选择源码、公开编译/证明资料、公开回执和日志；不要发送普通钱包私钥、助记词、恢复文件、MCP owner/session token 或完整钱包目录。常驻程序不需要这些秘密。

## 重现

使用兼容且冻结的 SDK/toolchain，建立新的产物目录；显式设置 `NFT_MARKET_BUILD` 与 `TOKEN_WIDE_ARTIFACT`。运行 NFT unit/integration、Rust lifecycle/signature/layout 和独立初始部署 preflight。真实验证应使用已保存的公共配置与新的只读输出文件：

```sh
npm run verify:nft-marketplace -- \
  --config /absolute/path/to/executor-three-users.json \
  --evidence /absolute/path/to/acceptance-evidence.json \
  --out /absolute/path/to/fresh-audit-check.json
```

不得重跑实际入金、注册或部署脚本来检查已有回执。第一份独立验收结果与缓存优化后的第二份结果均保留；后者仍重新读取 57 份不同回执，不缓存 pending 回执。
