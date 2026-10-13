# U124 Orderbook

新版本为两个 U124 Token 提供精确整单成交。订单金额、最低成交额与累计 Outbox 游标均为 `[low62, high62]`；原生 PSY 仅支付手续费。保留原付款人撤销、期限、nonce、限价与结算竞争保护。

入口：`contract/src/main.psy.rs`、`client.mjs`。SD-key 采用固定 9 调用，成交绑定双方及两资产金额，撤销只能返还原付款人。

公共构建、整数实现、SD-key 驱动和验证记录见 [升级说明](../../amm/u124/README.md)。新实例已部署为 Orderbook **2435**、金库 **1539136**，使用 U124 资产 2431/2432 完成真实成交、退款和重放拒绝测试。现有 Orderbook 64 未更新。
