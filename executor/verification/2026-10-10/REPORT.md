# Psy Executor 优化验证：2026-10-10

## 本轮修复

1. **旧回执分页查询**：使用已存在的 services `limit=100&offset=…` 接口，逐页核对历史 user leaf 与 included 回执，去重重叠行和 checkpoint 读取。`receiptMaxPages` 默认 20、范围 1..100。页数耗尽、分页不前进或回执不一致时仍为 unresolved，不能据此重发交易。
2. **立即取消排队任务**：停止信号移除尚未执行的任务，无需等待其他证明释放并发槽位；保留 FIFO 顺序、槽位计数和已经执行任务的正常收尾。停止后的扫描不再开启新任务，已恢复回执仍保留在结果中。
3. **调用文件原子发布**：journal 和公共调用文件共用 `durableFile.mjs`，先写入并同步独立临时文件，再以不覆盖已有文件的方式发布并同步父目录。写入期间进程退出只留下未引用的临时文件，下一次能正常生成完整调用文件；已有正式文件若不一致仍停止检查。

## 验证结果

完整市场与执行器回归命令：

```sh
node --test amm/*.test.mjs amm/contract/*.test.mjs orderbook/*.test.mjs bondingcurve/*.test.mjs bondingcurve/contract/*.test.mjs launchamm/*.test.mjs executor/*.test.mjs
```

**119 项通过，0 失败、0 跳过。** 本轮新增 9 个测试，覆盖超过 100 条事件的旧回执、回执身份不一致、分页上限、重叠和重复页面、无 leaf/无效响应、并发不可覆盖发布、真实写入进程中途退出、排队取消与 FIFO 槽位恢复、停止后的恢复回执保留。

使用新 `receiptReader` 对两笔已存在的真实交易做只读复核：

| 金库 | 结果 | 原入块 checkpoint | HTTP 请求数 | 分页 offset |
| --- | --- | --- | --- | --- |
| AMM 499200 | included | 208351 | 6 | 0 |
| Orderbook 591872 | included | 208685 | 4 | 0 |

两笔均与历史证据中的 content hash 相同。实际交易仍在第一页，因此第二页及后续分页由本地受控测试验证。初次受限网络环境出现 DNS 查询失败，随后使用获准的公共网络读取完成复核。

**本轮新交易提交数：0。** 没有修改或部署链上合约、SD-key 电路、Node 或 MCP，也没有启动常驻服务。

## 产物与运行边界

- [运行说明](../../README.md)：新增分页上限、停止行为和临时文件处理说明。
- `regression.log`：完整测试结果。
- `read-receipts.mjs`、`live-receipts.json`：只读复核脚本和结果。
- `summary.json`：当前源码 SHA 和本轮统计。
- `SHA256SUMS`：本目录验证产物校验值。

原三合约证据 280 个文件、10 月 9 日 Executor 证据 5 个文件均校验通过且未覆盖。第一版仍为单机、配置用户扫描；分页查询有明确上限，旧历史超出上限需增加配置或人工核对。进程中断测试不等同于整机断电验证。
