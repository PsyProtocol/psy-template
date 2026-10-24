# 双池组合真实验收 — 2026-10-24

## 范围与身份

当前分支 `markets-batch-capacity-recovery-20261020`，沿用冻结 SDK manifest
`0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`。
未修改 Node、切换 SDK、更新旧合约或覆盖原始运行证据。

- QA-A 2483、QA-B 2484：18 decimals，分别发行 1000，发行管理权已放弃。
- 新 AMM 2485 / 金库 1012928；新 AMM 2486 / 金库 718016。
- 支付费用使用测试 PSY（9 decimals），未使用既有 pUSDT。
- 成功控制器 2491 / 1445056，超时恢复 2489 / 134336，部分成交恢复 2492 / 1756352。
- 普通签名钱包 owner U 1717440（realm 1）、S 406720（realm 0）；覆盖真实跨 realm 资金发送及领取。

最初两个结果未知的部署继续隔离、无后续注资，**没有重发或宣布已丢弃**。
第二个 QA FT 改用独立发布者的隔离部署，精确回执内容哈希
`ea8eaafd385df8425dd8e03010c47e8ea66c915d4a3304ddd3e1230613b7ad6f`
对应 2484，其代码、布局、发布者、发行与两池实际交易均已核对。
这解决可用实例的验收，并不表示找回了旧未知请求的回执。
另一次部署 API 的 ID 错配在注资前被阻止，见
[原始调查](DEPLOY_RECEIPT_ID_COLLISION_20261024.md)。

## 三条真实终态

| 场景 | 实际成交 | 普通钱包领取 checkpoint | 领取的交易本金 |
| --- | --- | --- | --- |
| 双池成功 | 2 | 371528 | 输入 4.611686018427387921 QA-A，最终收到 3.141711878267176122 QA-A |
| 首跳入队超时 | 0 | 371903 | 原 1 QA-A 退回 |
| 首跳成交、第二跳取消 | 1 | 372434 | 实际获得的 0.633097631070860774 QA-B 退回 |

三次普通钱包领取均另含明确声明的 1 atomic unit QA-B 初始化退款与剩余测试 PSY。
成功输入的 U124 两个 limb 为 `[17, 1]`，未经浮点转换。成功路径真实中间输出为 3.738416797288011079 QA-B，最终满足原签名最低到账
3.110294759484504360 QA-A。部分恢复的第一跳不可逆；退回的是中间 QA-B，
没有按原价撤销，也没有完成目标 QA-A 意图。

终态复核 checkpoint 372450：三控制器 phase 99，QA/native 可支配余额均为 0，
与明确九账户集合之间所有双向 Outbox 均无待领取余额。第二池未发生部分恢复场景的第二笔成交。
第二跳无历史 consent 的证据同时绑定控制器 `consent_sent=0`、完整 9 UPS / nonce 9
与实际回执；不靠市场清理后 admission 字段为 0 推断历史。

| 控制器场景 | 原生预算 PSY | 控制器回执实际烧费 | owner 毛退款 | 净市场服务托管 |
| --- | --- | --- | --- | --- |
| 成功 | 20.002000000 | 8.000070000 | 10.001730000 | 2.000200000 |
| 零成交超时 | 20.002000000 | 7.000057000 | 13.001943000 | 0 |
| 一成交恢复 | 20.002000000 | 9.000076000 | 10.001824000 | 1.000100000 |

各行预算严格等于后面三列之和。普通 owner 最后领取另烧费
1.000006000 / 1.000006000 / 1.000004000 PSY；毛退款不等于净余额增加。
外部市场 sponsor、普通用户和 LP 操作另列，不混入控制器预算或将注资当作烧费。
固定 checkpoint 九账户（含内部 Outbox）分别守恒 1000 QA-A / 1000 QA-B；
自 constituent 基线后 98 笔回执合计烧费 98.000777000 PSY，包含 bootstrap/LP/sponsor，
不是仅三条组合意图的成本，也不是全网资金证明。

## 故障与恢复

1. 零成交路径在生成 admission 证明时错过原封口期限，尚无可广播 admission 请求。
   旧 consent 不续签；精确空批 abort、owner 取消、sender-bound refund 后普通钱包领取。
   终态重复进入检查保持原金融文件哈希，未产生第二笔付款。
2. 部分恢复的第二池退款已在 372269 确认，随后的 `start-compact-session`
   遭遇真实 realm-1 连接错误。原 worker/supervisor 停止，保存
   `broadcastMayHaveBeenAttempted=false`、`automaticRetry=false`，无 request/intent/receipt/preflight。
3. 显式恢复核对原七笔已确认任务、完整 intent、当前 owner/phase/nonce 7、零未决广播、
   相同依赖/key 及新状态见证，只继续后续领取与返还。原七份结果哈希保持不变。
   后续确认 372384 / 372426，普通钱包领取 372434；没有重做注资、首跳或市场退款。
4. 这是已验证的具体恢复入口；不能据此声称自动 SDK 重连、跨机器故障接管或未知广播自动恢复。

## 证明与证据入口

所有路径是原始运行目录的相对路径；归档使用逐文件 gzip 与 SHA256 manifest，
不包含钱包恢复文件、私钥或二进制。压缩包完整性检查与密码学证明验证分开报告。

- `composition-live-v2/public/INITIALIZED-LIVE-ACCEPTANCE-COMPLETE-v1.json`：三条终态。
- `composition-live-v2/public/COMPOSITION-RECOVERY-AUDIT-v1.json`：九账户资产、Outbox、98 回执与费用。
- `composition-live-v2/public/COMPOSITION-TERMINAL-STATE-AUDIT-v1.json`：最终状态、代码/布局、储备与已知资金流残留。
- `composition-live-v2/public/SDK-SOURCE-CHECK-v5.json`：1466 SDK 源文件、锁文件、构建配置和 genesis 一致。

正式结果的回执别名必须找到唯一原始广播意图，匹配完整 task 和付款账户，再验证原 request。
旧 included 日志必须与原广播意图处于同一日志目录。歧义、篡改、错误付款人或越界请求拒绝，
不会为报告核对生成替代交易。原 v1 验证中途停止的产物保留，完整复核使用新 v2 目录。

## 完整核验与性能（同一实际运行，未构造对照组）

- `composition-final-receipt-verification-v2/SUMMARY.json`：**98/98** 完整 UPS，
  pinned end-cap key/common 验证、精确 request/nonce/end-leaf/费用；篡改实际费用拒绝。
- `composition-live-v2/public/COMPOSITION-OWNER-CLAIMS-AUDIT-v1.json`：三次普通 owner
  真实历史 start/end leaf、FT/native 余额增加、sender sent / receiver claimed 游标和费用一致。
- `composition-live-v2/public/COMPOSITION-LIVE-PERFORMANCE-v1.json`：逐 UPS 阶段、调用数、
  RPC、失败、实际成交、费用、资源复用与 ordinary claim 时间；未测项保留 null。
- `composition-final-regression-v6.log`：20 项针对性 JS 验收回归通过，含完整任务/付款人/
  唯一广播意图/原日志目录/越界请求拒绝。回归不替代上面两个独立核验。

| 场景 | 控制器完整 UPS preflight 范围（秒） | 广播意图至回执与共同 checkpoint 观察范围（秒） | 普通领取进程（秒） | 领取进程结束至共同观察（秒） | 首次 adapter 至最终领取观察（分钟） |
| --- | --- | --- | --- | --- | --- |
| 双池成功 | 99.512–151.558 | 92.567–198.437 | 141.804 | 157.151 | 164.565 |
| 零成交超时 | 91.390–137.467 | 96.796–264.799 | 134.729 | 156.744 | 118.945 |
| 一成交恢复 | 92.946–182.253 | 95.466–323.952 | 110.470 | 61.451 | 181.483 |

口径：preflight 是真实完整证明/验证阶段墙钟，仍可能包含 SDK 见证与状态读取，
不是纯密码学 CPU；广播意图到共同观察还含提交前复核、HTTP、轮询，不等于服务端纯确认延迟。
ordinary 进程含构建/读状态/证明/验证/提交，未把它全部标成密码学证明耗时。
端到端含 source/key 检查、队列截止等待、sponsor、故障、人工诊断与恢复，不含早期 SDK 编译、
部署和 LP 准备；不是稳态吞吐或服务 SLO。各阶段可能嵌套，不相加伪造总耗时。

本轮首次 adapter source/IR/key/RPC 检查 205.494–228.126 秒；resident key 构建
1.096–1.213 秒、session 构建 41.590–46.865 秒，按每个进程首项去重。
这些启动描述不能当作冷构建完整耗时或暖态加速比。冷二进制构建时间未测。
部分恢复的 fund/open-1 使用同一个 adapter UUID / PID，7 调用的完整 preflight
分别 136.872 / 139.571 秒；真实新状态与 nonce 分别证明，未复用旧状态证明。
这是不同操作，不能称作优化前/后对照。

本次控制器逐项 call proving 34.898–81.645 秒，recursive finalize
12.417–22.191 秒，end-cap 4.389–4.830 秒，完整证明验证 2.937–3.408 秒。
三笔实际市场 settle 均为 7 调用，完整 preflight 144.694–162.168 秒；
每批只有一个组合成员，未由此证明最大容量或多池完全并行。
状态读取、报价、scan/isCurrent 和提交墙钟逐项保存在原报告，未观测的 SDK 内部细分不补造。
记录到一个 admission 过期失败和一个 controller session-read 失败；未增加成交计数，
没有未知结果重播。确切重复进入与恢复过程、额外检查单独保留。

机器 darwin arm64，10 logical CPUs / 32 GiB RAM。每 2 秒采样的已知钱包进程
RSS 合计最大 11,550,539,776 bytes（约 10.76 GiB），含并发 QA 工具、可能重复计共享页，
不是所有进程的真峰值或逐阶段内存。原观察日志与封口 SUMMARY 一起保留。
没有同条件旧/新网络对照；chain TPS、精确服务端 finality、匹配加速比均不作结论。

## 尚未由本次验收保证的范围

- 多 UPS / 多金库工作流，**没有跨金库原子提交或原价回滚**。
- A→B→A 机制验收；不是三资产兑换、原生 PSY 路由、NFT 组合或任意路径。
- 初始仍须明确发送另一资产 1 atomic unit 建根；没有隐藏为交易预存，但不是 A-only onboarding。
- 普通钱包签名 CLI 的真实领取，不等于浏览器扩展 UI 验收。
- 确定性有限队列，不是全市场纳入完整性、抗审查或已认证未来随机排序。
- 同机日志竞争与进程恢复不等于跨机器协调或断电接管。
- 本地冻结可复现不等于上游发行、运行镜像认证、底层升级授权或代码/布局信任边界关闭。
- 完整证明与 RPC 延迟仍高；没有同条件旧/新真实网络对照，不宣称加速或生产级。


## 归档与代码

[完整证据目录](../../executor/verification/2026-10-24-composition-final-live-v1/README.md)
包含 12,797 files / 116,096,142 compressed bytes; all original bytes compared。
[Manifest](../../executor/verification/2026-10-24-composition-final-live-v1/manifest.json)
和 [完整性结果](../../executor/verification/2026-10-24-composition-final-live-v1/INTEGRITY.json)
提供逐文件来源、原件/压缩哈希与比对结果；不能把完整性结果当成 UPS 验证。

恢复入口：[resumePartialRecovery](../../composition/acceptance/resumePartialRecovery.mjs)；
终态检查：[terminalStateAudit](../../composition/acceptance/terminalStateAudit.mjs)；
精确请求定位：[receiptRequestLocator](../../composition/acceptance/receiptRequestLocator.mjs)；
完整证明检查：[verifyReceiptBundle](../../composition/acceptance/verifyReceiptBundle.mjs)；
性能报告：[livePerformance](../../composition/acceptance/livePerformance.mjs)。
归档内有对应精确源码快照；现有基础合约不负责整条组合路径编排。
