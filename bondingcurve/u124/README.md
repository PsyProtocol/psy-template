# U124 Bonding Curve

新版本以 U124 Token A 为库存、U124 Token B 为报价资产，原生 PSY 单独支付手续费。`lot_size`、价格、储备、成交与毕业资产数量均适配双 Felt；lots 保持不超过 1,000,000。保留买卖、过时报价退款和固定毕业目的地。

Token、issuer、毕业目标和价格参数在新构建中固定，初始化不能另选配置。无需修改原 launch-token。入口：`contract/src/main.psy.rs`、`client.mjs`。

公共构建、整数实现、SD-key 驱动和验证记录见 [升级说明](../../amm/u124/README.md)。新实例已部署为 Curve **2436**、金库 **1014848**，使用 U124 资产 2431/2432 完成真实买卖、过时报价退款和毕业交接测试。现有 Curve 66 未更新。
