# 原取消请求的精确恢复（nonce 45）

[结果摘要](ORIGINAL-ONLY-RESULT.json)绑定原普通钱包请求及其恢复副本的相同 SHA256、精确回执、checkpoint 和实际费用。原 413、原 `retryAllowed=false` 意图及请求均保留；本次受控恢复只发送同一份签名证明，没有重签、增加 nonce、延长期限或生成另一笔取消。

一次实际 UPS，费用 1.000005 测试 PSY。两条回执观察路径只能归为一次状态变化/一次费用；新增别名校验绑定签名原字节、用户、历史结束根、交易哈希、checkpoint、索引结果及 common 可见性，不要求查询时间或后续 common 头相同。不同原字节或结果不能合并。

新取消原生客户端的紧凑请求也出现 HTTP 413，实际 477,572 bytes，广播阶段约 68.662 秒。**根因仍未确定，不能归因于格式化体积或 HTTP 版本，也不能声称已修复所有 413。** 只读探测中，curl HTTP/1.1、HTTP/2、Node 及相同依赖的 Rust 客户端均成功；Rust auto/http1 实际都是 HTTP/1.1。这些少量并发只读样本不是同条件成交性能对比，不能据此宣称协议切换提速。见 [探测来源](READ-TRANSPORT-PROVENANCE.json)。

当前诊断源码固定并重构只读方法/空 params；不会把含重复字段的原输入直接发送。测试覆盖变更方法、非空参数及重复调度字段。实际 RPC 样本保留冻结的 v1 源码/二进制标识；v2 加固守卫测试单列，没有冒充旧样本使用了新源码。

`manifest.json` 绑定 61 份原始公开产物，包含原/恢复请求、完整独立验证、回执、413 和只读探测及 25 项 JS、2 项 Rust 守卫回归。nonce 45 已消费，因此所含旧证明及只读 padding 内的签名载荷不再有未来执行能力。钱包及私钥不包含在内。

```sh
python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-25-ordinary-exact-recovery-v1
```

这份归档只关闭第一位用户的取消操作；两位用户的最终退款、领取和全费用守恒另行验收，当前不作已全部完成或生产级声明。Node 和所选 SDK 未改动。
