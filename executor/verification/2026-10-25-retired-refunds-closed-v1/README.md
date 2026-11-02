# 失败批次退出、原路退款与普通钱包领取闭环

[独立完整审计](SUMMARY.json)：24 个实际 UPS、0 笔成交，费用 24.000133 测试 PSY。两名原付款人的 QA FT 均原路退回并由普通钱包领取；FT 2483/2484 各 1000 枚总量及逐账户余额核对，QA NFT 2496 和待领取状态保持不变。有限资金集合的 native 差额等于全部实际回执费用。

原取消 nonce 44 由已确认的授权纯 noop 排除。新 nonce 45 原生提交返回 413 后，受控恢复只发送原签名请求一次；未重签、改 nonce、延长期限或增加业务。两个观察回执经原字节和状态绑定合并为一次 UPS。两项最终未注资 QA 订单清理并非成交。

归档保留失败、未知广播、单次发送锁、候选、读取故障、确认、退款和领取的原件，以及每份完整保存请求的独立验证。`uniqueVerifiedRequestByteHashes` 统计不同请求字节，JSON 序列化变化可能对应相同数学证明；不能据此声称不同证明数。

退款快照比较兼容实时与无损 JSON 类型，同时检查原持有人、NFT 和完整有限 Outbox 范围。15 项针对性回归通过；不以测试数宣称生产级。Node/SDK 未改，SDK 1466 份源文件哈希复核见 [边界](BOUNDARIES.json)。HTTP 413 的根因仍未确定。

本轮所有完整签名请求的 nonce 已由精确审计链消费；不含钱包、私钥或密钥恢复文件。本轮费用和耗时排除在下一轮干净真实成交性能对照之外。无全市场公平、运行服务身份或跨机器协调结论。

复现（只读离线）：

```sh
python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-25-retired-refunds-closed-v1
```

`manifest.json` 逐文件绑定压缩前后 SHA256，原产物没有覆盖。使用归档原件重跑 `executor/acceptance/auditRetiredVerifierRecovery.mjs CASE ORIGINAL_QA_CASE FRESH_REPORT_DIR` 还需清单固定的独立验证器和原 QA 公开身份资料；不需要钱包密钥。
