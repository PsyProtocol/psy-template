# QA nonce 44：精确确认并排除原取消请求

2026-10-25 11:10 UTC。本次追加紧凑版 noop 发送已获用户明确授权；不删除旧发送锁，不自动重试。

- [精确包含回执](INCLUDED.json)：用户 1717440，nonce 44；checkpoint/common checkpoint 382717；content hash `eb36f22eb27dd0ff2a673e131d93a10abd36c6ea6cf9f3907135af5151a6e469`；实际费用 1,000,001,000 atoms，即 1.000001 测试 PSY。
- [冲突排除证据](CONFIRMED-CONFLICT.json)：两份独立完整验证的请求同用户、公钥、nonce、起始根，结束根不同；noop 的精确历史端点、索引回执、费用和 common 可见性均匹配。原取消请求由确认的 nonce 冲突排除，不依赖超时或过期推断。
- 紧凑请求实际发送 466,115 bytes，HTTP 200/`ok` 后继续等到精确包含；不是以 ACK 代替确认。无 FT/NFT 转移。
- 发送前两次检查分别因状态码 BigInt/Number 比较、原 413 响应尾换行被拦截，均在创建新发送目录/意图/发送锁及 HTTP 提交之前。旧 source closure 保留；新增无损表示及实际归档 413 响应回归，见 `REGRESSION.txt`。

`manifest.json` 与 `files/` 保存原请求、胜出请求、精确发送和响应、预检、完整验证、回执及只读起始观察，全部原字节压缩存档。两份 nonce 44 请求均已失去未来执行能力：胜出请求已经消费，原请求已由确认冲突排除；因此此处可公开其证明载荷。钱包文件和密钥不包含在内。

完整性复现（不等于证明验证）：

```sh
python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-25-nonce-retirement-confirmed-v1
```

这份证据只关闭 nonce 恢复阶段；后续新取消、SD-key 原路退款、普通钱包领取及全费用/守恒审计另行交付，不能视为已完成退款或成交性能配对。
