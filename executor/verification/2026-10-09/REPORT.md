# Psy Executor 第一版验证：2026-10-09

状态：实现和本地回归通过；三个现有市场的链上只读扫描通过。

## 已实现

- `executor/service.mjs`：统一服务入口，独立金库 worker，配置验证、全局证明并发上限、退避、JSON 状态和心跳。
- `executor/worker.mjs`：先核对广播回执，再扫描请求；结果不确定时暂停该金库；其他金库继续运行。
- `bondingcurve/chainReader.mjs`：买卖、陈旧/无效报价及到期退款、毕业后退款；初始化/毕业需显式开关和固定配置。
- 公共调用文件持久化，重启时校验或重建；提交日志由子进程直接写文件，主进程退出后仍可找回 leaf 并核对 included 回执。
- journal 事件原子发布，同机死进程锁恢复，指纹 scope 校验；并发恢复不删除新锁。
- 退款构造按原付款数量处理，支持无法执行报价的已付款曲线订单，不修改链上合约或 SDK 电路。
- [运行说明](../../README.md)、[三个金库配置示例](../../examples/service.json)。

## 验证

`node --test amm/*.test.mjs amm/contract/*.test.mjs orderbook/*.test.mjs bondingcurve/*.test.mjs bondingcurve/contract/*.test.mjs launchamm/*.test.mjs executor/*.test.mjs`

**110 项通过，0 失败、0 跳过。** 新测试覆盖同金库互斥、真实子进程退出后的锁恢复、提交进程输出持久化、未知广播暂停、缓存文件缺失、并发读取完整 journal、启动网络故障退避、停止信号等待中断、用户列表刷新、金库故障隔离、只读模式，以及实际回执 checkpoint 不被扫描 checkpoint 覆盖。

新服务使用临时独立配置，对 AMM 1758 / 499200、Orderbook 64 / 591872、Curve 66 / 1297920 进行只读扫描，均在 checkpoint 210073 通过身份、根、fingerprint 和状态读取，当前 action 均为空。Curve 二号实例已毕业。`live-scan.log`、`status.json` 保存结果。

本轮没有使用新服务提交真实结算；子进程中断测试使用本地模拟驱动。本轮之前的真实交易验收见 [三合约报告](../../../tests/live/three-contracts-2026-10-09/REPORT.md)，其中 33 笔实际交易的资金守恒和收尾通过，使用的是改造前执行器。本报告不把这些历史回执计为新服务真实提交。

## 当前边界

第一版为单机常驻服务，扫描配置的用户或可热更新的用户 ID 文件。全链用户索引、跨机器竞争、分布式 lease 和执行者激励继续按路线图推进。用户输出领取及请求关闭由原钱包/SDK 完成。

自动恢复仅适用于明确死亡的同机锁和可找回交易 leaf 的提交。未知 leaf、旧格式/异机/不完整锁和中断的 acquisition gate 会暂停对应金库，需运维核对。不会用超时推定交易失败后重复提交。

`summary.json` 记录源码 SHA、原有 Node 三处核心改动保持原样的 SHA，以及历史证据 280 个文件校验结果。所有原部署产物和测试证据保留。配置示例使用现有 staging 身份，运行前需配置 RPC 和已批准的公共 driver 路径。
