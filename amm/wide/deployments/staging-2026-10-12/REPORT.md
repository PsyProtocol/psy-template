# AMM 部署、真实退款预检与修复记录

2026-10-12，Asia/Taipei。本轮没有更新已有合约，没有改共享 Node，也未推送代码。

## 部署与授权

- 测试钱包：1239104，policy `4b1463958640b6c9`。用户允许仅增加 deploy_contract / call_contract 方法及本次金库收款人；单笔 5、每日及总预算 50 PSY 等值保留。Bob、Alice、Charlie 策略未修改。
- 用户选择自行转入 2 pUSDT；没有修改 Bob 策略或从其钱包转账。
- v1 新合约：2425；部署 content hash `762ed2b4ffeb85d4723a220ef34113983492104389a7a2bfde82f5c2c93dd75b`，checkpoint 246173 入块。
- code root `566880556bf5e4dcc0322aa93ec6e443570365b043617309af0e9c4ac7dba87b`；layout root `5ff1d11b3ceac86c3b1e7eb587964371e98b3cab316e774bd0e724775c961f81`，22 字段。
- 新公开 SD-key 金库：317504；pk hash `b8d1d5dafcfb517bea6eca2b36195b271f15e323c6d0af2145bed78b3b0294e7`，fingerprint `bd4691862ae81ca8b5ffcbbc1254e325341c6bfbcb86ac7d3394108b95e96f6f`。
- 链上根与预检完全一致，初始 empty → 22 布局证明已经独立验证。

## 已入块的测试操作

1. PSY 退款订单开立：checkpoint 246407，content hash `2962d382ef4d67e2d1b879661406d177708ff59e5329b89607b51051756d4992`，费用 1.000004 PSY。
2. 向金库支付 1 PSY 本金 + 1.0001 PSY 费用托管：checkpoint 246443，content hash `8cf5c56233b6af52c035af985b6ffb71a937f1d2751ab0844523bd517efab356`，费用 1.000002 PSY。
3. 完整 UPS 预检失败在第 0 个调用 refund_unclaimed，未广播金库交易。

错误：`Partition containing Wire(Wire { row: 593, column: 15 }) was set twice with different values: 0 != 16463394126558395459`。

`evidence/psy-refund-witness-summary.json` 显示，第 7 条 VM 状态命令仍读取
付款人 1239104 的合约 4。该合约叶为全零，实际槽位证明根却为
`d65af5933a094e8329332a714327ba72b1e4dac93c0cde8ee479b9bb36c3fc43`。
其首个 little-endian field 正是报错的 16463394126558395459。
源码分支未阻止编译器生成非活动分支的外部状态读取；这次不是布局更新证明错误。

## 修复候选，未部署

- 最终源码：`../../v2/contract/src/main.psy.rs`，SHA256 `bb0c5b6c5dd9b1ad128618b0145ab2785550d1bd331bfacab29c648aa75c3975`。
- 仅将 swap/refund 内固定合约 4 读取改为受入口约束的 asset。PSY 路径读 PSY，pUSDT 路径读 pUSDT，金额、付款人、费用、nonce 检查保留。
- code root `4c959661f636981349452f346ea39e276d42c3f47dc427ee50a7aee9e864bfb6`；布局与 v1 相同。
- 真实状态 refund_unclaimed 完整 CFC 证明及独立验证通过，127464 字节；`fullUpsVerified: false`，没有广播。
- VM 4/4 通过，含 128 组随机双向兑换、偏差一单位报价、错误付款人/付款及 LP 边界。
- 初始 canonical layout proof 136080 字节独立验证通过。准备 content hash `fd8fd99e88457e2b25989e217b970fb22d3d5e797ccfee43756ed109ea27e635`，未广播。
- 初次 v2 尝试还改了部分 LP 退款读取；审查发现会跳过未领取 pUSDT 的零额检查，已排除。该源码及 compiled-v2 仅保留作为被拒绝尝试，不能部署。最终仅使用 compiled-v2-final。
- 部分 LP 退款/关闭仍要求付款人 pUSDT 分区已经初始化，没有移除安全检查。

## 资金与服务状态

最后公开快照：checkpoint **247031**。

| 项目 | PSY | pUSDT |
| --- | ---: | ---: |
| 测试钱包 1239104 可用余额 | 994.999892 | 0 |
| 金库 317504 可用余额 | 0 | 0 |
| 钱包 → 金库尚未领取 | 2.0001 | 0 |

资金来自之前已确认的 1000 测试 PSY faucet。1 PSY 本金尚未退回，费用托管也未领取。
没有证据表明用户已从已知测试账户转入 pUSDT；未知转出账户仍需用户提供 ID 或交易哈希核验。
链 checkpoint 已继续前进；原常驻 executor 的 PID 77189 仍运行，本轮未替换它。

## 回归与输入固定

- JS 回归 152/152 通过；旧金额上限保持，新扫描器仅在链上 code root 与明确的 wide 根匹配后选用。
- SDK 输入固定包 1892 个文件再次 hash 核验全部通过；提交基线和三份既有 SDK 补丁见 sdk-input-provenance.json。
- 原 compiled、prepared-deploy、初始布局证明、失败日志及历史验证目录保留。
- 不保存或输出普通钱包私钥、助记词、恢复文件或 owner/session 凭证。

## 下一步

1. 用户转入 2 pUSDT 并提供转出 Psy ID/交易哈希；使用 MCP 领取并核验余额，使现有 v1 测试付款人的 pUSDT 分区初始化。
2. 重新为 2425 的原退款生成完整 UPS、独立验证后提交并核对入块，领取 1 PSY 本金，关闭原订单。
3. 修复候选的新部署/金库收款权限需覆盖新的代码和金库，已另外请求。用户此前仅批准了 317504。
4. 候选部署注册后完成真实状态完整 UPS，执行大金额双向兑换、LP 添加/撤出及退款的资产和费用守恒验收。

未通过完整 UPS/真实资金验收前，新版本不得接入常驻服务或标记生产就绪。
