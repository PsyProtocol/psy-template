# AMM 未初始化资产分区读取修复候选

尚未部署；不要把 `compiled-v2` 初次尝试当成最终候选。
最终源码为 `contract/src/main.psy.rs`，源码 SHA256：
`bb0c5b6c5dd9b1ad128618b0145ab2785550d1bd331bfacab29c648aa75c3975`。

代码根为 `4c959661f636981349452f346ea39e276d42c3f47dc427ee50a7aee9e864bfb6`。
布局保持 22 字段、14 方法，金额范围和 SD-key 原付款人约束不变。

修改仅有两处：`swap` 和 `refund_unclaimed` 的 pUSDT 分支读取使用 `asset`，
其值已由函数入口约束为 0/4。编译器会为非活动分支也生成状态读取，
因此 PSY 路径实际读取 PSY 分区，而 pUSDT 路径仍读取 pUSDT 分区。

已用真实新钱包状态生成并验证完整退款 CFC，旧版同状态证明因零合约叶与空树根
不一致而失败。4 项 VM 测试及初始布局证明也通过，完整 UPS 和真实兑换尚待验收。
部分 LP 退款与关闭仍读取两个资产分区，付款人需先初始化 pUSDT 分区；
没有通过跳过未付款资产检查来解除此限制。

复现源码：`node amm/wide/v2/generate.mjs --check`。
最终编译产物和证明记录位于 `../deployments/staging-2026-10-12/compiled-v2-final/`。
