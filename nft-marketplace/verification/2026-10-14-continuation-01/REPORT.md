# NFT Marketplace v2 实现与验收记录

日期：2026-10-14。仓库：PsyProtocol/psy-template，main；本轮开始于 `c17f166f9bd88406b462070ff0d07e0062a9ac3b`。

## 当前结果

**部署、注册及离线验证完成；真实挂单证明失败，成交/退款验收未完成。** `deploymentReady` 和 `fullUpsVerified` 保持 false。没有向测试金库转入 NFT、FT 或手续费，不应将它作为已验收产品使用。

| 对象 | ID | 验证情况 |
| --- | --- | --- |
| 独立 NFT v3 | 2447 | 初次部署，布局 0 → 14，资产初始化/mint 已确认 |
| 独立 U124 FT，decimals 18 | 2448 | 初次部署，布局 0 → 15，mint/转账/claim 已确认 |
| Marketplace v2 | 2451 | 初次部署，布局 0 → 22，代码/布局根及收据匹配 |
| Marketplace SD-key 金库 | 1755712 | 公开身份及精确 fingerprint 对应唯一链上 ID |

测试 FT 是本轮独立发行的 U124 FT，不是 pUSDT。PSY 来自隔离钱包的 MCP faucet，到账后已 claim；旧 Alice/Bob/Charlie 钱包策略没有修改。

## 本轮实现

- 合约追加 `results[user]`，记录最近一次成交/退款的 nonce、对方、金额、NFT ID/metadata、输出游标。
- 结果查询在同一 checkpoint 区分成交、退款、请求取消，以及 FT/NFT/PSY 是否领取；不会把新订单的取消套在旧结果上。
- 明确取消竞争：签署 `request_cancel` 是请求；金库退款确认才完成撤回。历史远端状态证明可能先成交，结果记录对此保持可见。
- 新增初次部署预检。独立验证 ABI/layout、公开部署者、代码白名单、旧端点为空且字段/槽位为零、新根和新数量；没有更新部署或广播接口。
- 四 Felt ID/metadata 分别用 `Hash` 打包，17 Felt 结果记录保留全部内容，避免原类型 DAG 19 节点超过 16 节点限制。
- 生成器将校验/读取安排在本地写入之前；artifact gate 拒绝本地写入后的自账户外部读取。该变更尚未解决真实证明错误。

没有修改 psy-node、MCP 服务、既有 NFT/FT 资产源码或三个已有市场的合约/策略；旧运行服务保持运行。

## 验证

| 验证 | 结果 |
| --- | --- |
| JavaScript | 90/90，无跳过 |
| Rust | 14/14 |
| VM/本地状态模型 | 11 场景，包含高位金额、退款归属、双买家、溢付/不足、队列满回滚、结果游标 |
| CFC 构建 | 13 个市场方法；构建成功不等于认证状态证明成功 |
| SD-key 证明 | 6 个有效分支；18 个恶意调用/签名变体拒绝 |
| Canonical layout | 2 份真实初次证明；14 个字段/槽位/root/owner/code/height/证明篡改拒绝 |
| 最终格式化源码 | 与实际部署编译产物完全相同；policy 与 2451 实际绑定完全相同 |
| 最终初次预检 | 源码/产物/验证器哈希绑定通过；0 → 22；与链上代码和布局根匹配 |
| 普通 `noop` | 回执及历史用户叶匹配，确认上链 |
| 真实 `open_listing` | 本地 CFC 证明失败；没有广播 |

## 失败与保留的尝试

1. 未打包的结果 struct 导致 canonical 类型 DAG 19 > 16；在产物/部署前拒绝。
2. Marketplace 2449 的 `open_listing` 报 row 612、`0 != 6517168151423181400`；没有广播或入金。
3. 仅规范化标量 `TargetAt` 没有改变 CFC 指纹。新部署请求返回已有 2449；实际 code root 与预期不同，部署核对拦截。原部署没有被更新。
4. 调整为先读取/校验再写入后，部署得到 2451。真实挂单仍报：

```text
contract_id=2451 method=open_listing input_count=6
Partition containing Wire(Wire { row: 269, column: 12 }) was set twice
with different values: 0 != 15152617885907939637
```

5. 一次独立 `noop` 上链后，新的挂单调用再次在广播前复现同一错误。不是重播未知广播请求；两个失败调用均明确停在证明阶段。
6. SD-key 注册响应成功后，首次立即查询尚未返回账户 ID；只做只读核对，稍后确认唯一 ID 1755712，没有再次注册。
7. 直接 Rust HTTPS 注册的旧尝试失败后，先核对身份/checkpoint 再单独提交。临时 SDK 传输使用系统 CA 验证 TLS、持久审计且不重试写请求；普通钱包仍通过安装的 MCP。临时进程现已清理。

这些结果无法确认错误根因。另观察到新金库未初始化的 NFT/FT 上层用户合约叶为零，而状态树 API 返回非零空树根；还需要对照认证 CFC 的上下层 proof 和入口/当前 root，不能直接把该观察认定为本次错误原因。

## 余额及边界

最终检查：卖家 NFT=1、FT=80；买家 NFT=0、FT=20；金库 NFT=0、FT=0、PSY=0。所有市场订单 kind=0。报价 5×10^18 仅为失败调用的测试输入，不是已完成成交。

尚缺真实成交、退款、领取的完整 UPS 验收及独立审计。拍卖、版税、多合集路由、全链订单自动发现及完整历史索引不在当前实现中。

## 原始证据位置

本机本仓库 `nft-marketplace/verification/2026-10-14-continuation-01/`。机器名、绝对目录、根/哈希、最终 checkpoint 见 `RESULTS.json`。

- `market-read-first/`：实际部署的源码、ABI、compiled artifact、policy 和编译来源。
- `market-final-formatted/`：本次提交生成器对应源码；编译产物与实际部署完全相同。
- `market-read-first-initial/`、`final-formatted-review-v2/`：原始请求、canonical layout proof、独立报告及日志。
- `read-first-market-deploy-confirmed.json`、`read-first-vault.json`：部署和注册核对。
- `evidence/rf-08-listing-open-*`、`evidence/rf-init-open-*`：已脱敏 MCP 请求/证明错误；`rf-init-noop-confirmed.json`：noop 回执核对。
- `live-final-state.json`、测试日志及 `LOCAL-EVIDENCE-SHA256SUMS`：余额、验证及原证据封存哈希。

原始产物、早期失败尝试和旧封存文件均保留；仅公开报告进入 Git，原始 JSON/proof/日志/临时脚本留在本地忽略目录。未导出私钥、助记词或钱包恢复文件。

## 下一步

先获得上述挂单的完整认证状态 witness 与目标冲突定位，在本地复现并验证，再考虑新的初次部署或经独立验证的代码变更；证明通过之前不向金库入金。继续保持现网布局不更新，不重播不确定请求。
