# QA nonce 44 恢复：单次提交返回 413

2026-10-25 UTC。原取消请求和本次被授权的 fee-only noop 均未取得精确包含回执。此归档不是恢复成功、退款成功或性能配对结果。

- [恢复摘要](RECOVERY-STATUS.json)：一次实际发送返回 HTTP 413，原响应、发送锁和 unknown 记录完整保留；未追加发送。
- [发送后账户观察](ANCHOR.json)：common 382678、own realm 382679、nonce 43；不能证明排队请求已永久丢弃。
- [紧凑请求完整验证](COMPACT-PROOF-VERIFY.json)：同一证明仅去除 JSON token 外空白，线体积从 1,119,272 降到 466,115 bytes。U124 字面量、字符串和签名/证明内容保留；不是性能 TPS 测量。
- [依赖边界](BOUNDARIES.json)：冻结 SDK 1,466 个源文件未变，Node 既有 diff 未变。
- `files/` 保存 12 份原始公开产物的 gzip；`manifest.json` 逐文件绑定原始字节和压缩字节。包含 19 项回归测试日志、两份只读 unresolved 观察、两次独立完整验证报告及 HTTP 413 原响应。

仍可能执行的签名请求、证明载荷、线请求和钱包文件不在本归档。独立验证报告不可执行。`READABLE-COPIES.json` 绑定可读副本与原文件哈希。

复现完整性检查（不等于完整证明或运行服务身份验证）：

```sh
python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-25-nonce-retirement-413-v1
```

签名请求仅在本机受限目录供授权审阅。后续必须先确认精确胜出回执，再独立验证同用户、nonce、起始根的冲突排除及费用；追加恢复发送需单独授权，现有单次发送锁不能清除。退款和新成交性能配对仍未完成。
