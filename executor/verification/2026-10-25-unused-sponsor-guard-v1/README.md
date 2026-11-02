# 未使用赞助款守卫与退款发现修复

v3 的两份订单和首笔费用准备已确认，但 `start_epoch` 前被精确 pending 检查拦下：Sponsor→Book 累计 sent 48.0048、claimed/settled_fee 43.0043，待领取 5.0005 测试 PSY。旧退款脚本在金库余额已足够时仍转入两份 2F，本轮又转入 1F。这里是读取诊断，非完整 UPS 证明；新的真实退款与完整审计另行验收。

新增精确 `sponsorGrant` 规划：零 pending 才允许新付款，完整相符且未消费的授权才可整体采用，其他情况拒绝追加。性能入口在用户新付款前检查赞助 pending；退款继续入口按真实 gas 缺口准备，不盲转 2F。

恢复发现允许明确配置、普通钱包已登记 `request_recovery` 的费用付款人。默认市场范围不自动加入 Sponsor，防止旧登记自动撤回其新 grant。合约和 SD-key 保留原付款人、入金数量、调用栈、费用和状态端点约束；未初始化的 FT 账户明确报缺口，不能以零值绕过认证树。

63 项回归通过。保留 v1 真实部署 ID 夹具与失败日志，以及 v2 标准测试 ID 41/42/43 夹具与通过日志。夹具使用归档 ABI 形状和当前策略生成器，只用于 JS 路由回归，不能替代字节码/完整 UPS 验证。先前漏设 BATCH_BUILD 的首次工具调用也未执行该套 reader 测试；其环境问题不作为产品结果。

本归档没有活跃签名请求、钱包或私钥。新的真实退款/领取、资金守恒、性能前后对照尚未关闭；不宣称生产级。Node 与冻结 SDK 的 1466 份源文件未变。

```sh
python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-25-unused-sponsor-guard-v1
```

完整解压归档后，以 BATCH_BUILD 指向 sponsorship-reader-regression-fixtures-v2、ADMISSION_BUILD 指向 sponsorship-regression-fixtures-v1，运行 node --test executor/sponsorGrant.test.mjs executor/compactAdmission.test.mjs batching/v2/reader.test.mjs executor/acceptance/recoveryGrant.test.mjs executor/acceptance/enrolledRecovery.test.mjs。只读离线，无网络提交。
