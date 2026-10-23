# 隔离部署回执 ID 映射异常（待外部核验）

## 实际观察

2026-10-23 UTC 的两个新控制器初始部署在 checkpoint 370953 被记录为
included。两份 API 回执 `result.contract_id` 都是 **2489**：

- 成功场景请求：`7b3dc71e1561d14859c48f2bb505f2671b50c46a204f04f96be461d2b37ade38`。
- 恢复场景请求：`fa173f9d5761798ce9c313962b32ce5f33f58d6992586c97d5c7cb2b869aa097`。

实际 coordinator 合约元数据却不同：

| 实际 ID | code root | deployer |
| --- | --- | --- |
| 2489 | `8ed56073c14f7bfe3b8383f67a65b44f6e6e854138798d3da6fdd73d31783d79` | `8e9c77e906f653d29d868aafd784b4fff6ac01062f337a1078354bcb9169ccf9` |
| 2490 | `ed8349dce1a5dd83569bf69187d86fd6f525b771b37fe2ea5ffbfdf05eda40ea` | `0110846a44285289643e8e32fb684be8c3006a419ce33d50d3351034db29dd2a` |

成功场景的六项实际元数据／deployer 检查正确拦截了不匹配的回执。
这里没有绕过 ID 校验，也没有把“扫到相同代码”当作原部署回执。
疑点是同一 checkpoint 多部署的回执与分配 ID 的关联；具体责任服务及
运行代码尚未核验，不能据此断言 coordinator 状态分配本身错误。

## 本轮处理

- 两笔原请求和原产物保留，没有重发或更新这些合约。
- 2490 不纳入资金验收；未在该实例注册组合金库或转入组合本金。
- 采用一次有记录的、不同部署身份的独立串行请求，仍运行同一份已审阅
  控制器字节码。新实例 **2491 / 金库 1445056** 的回执、deployer 和完整
  代码／布局／函数／字段数／槽数核验通过；代码中的最终请求 owner 不变。
- 恢复实例 **2489 / 金库 134336** 的原回执和元数据匹配。
- 不改 Node，不更新任何旧合约；此前未注资的 2487、2488／旧 key 保留并退役。

## 外部需要交付的证据

1. 明确负责 `/api/v1/transaction/hash` 部署 `result.contract_id` 的组件及源码位置。
2. 提供同一 checkpoint 多笔不同代码／deployer 初始部署与实际分配 ID 的
   一一对应证据；包含重复索引、重放重建和重启后的回归结果。
3. 修复后通过原 content hash 重新查询，检查是否恢复正确映射，并保留原响应。

本机只读原始记录：`composition-live-v2/public/INITIALIZED-DEPLOYMENT-OCCURRENCES-v2.json`；
一次独立请求的范围：`CONTROLLER-DEPLOYMENT-OVERRIDE-v1.json`。
归档位于 `executor/verification/2026-10-24-composition-initialization-v1`。
这里只含公开请求、证明、回执与身份，不含钱包恢复材料。
