# 升级授权边界：发布前待确认

日期：2026-10-19。以下来自本地 `psy-node` 基线
`5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6` 的只读源码检查；未改动
Node，未构造、签名或向任何网络发送更新请求。没有核验实际服务端部署版本、
反向代理或网络访问策略，因此不能将下述源码发现直接等同于现网可利用结论。

## 观察到的检查

- [Coordinator update RPC](https://github.com/PsyProtocol/psy-node/blob/5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6/psy_node_common/src/coordinator/edge/api.rs)
  将更新对象交给内部处理函数。
- [内部处理函数](https://github.com/PsyProtocol/psy-node/blob/5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6/psy_node_common/src/coordinator/edge/handler.rs)
  检查已存在合约与请求的 deployer 值相同、树高不变及布局证明有效，拒绝更新原生合约 0。
- [更新请求结构](https://github.com/PsyProtocol/psy-node/blob/5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6/client_prover/psy_core/psy_data/src/qblock/cmds/deploy_contract.rs)
  包含 deployer、代码、白名单、根及布局证明；该结构中没有看到独立的部署者授权签名字段。
- [此版本 Edge HTTP 配置](https://github.com/PsyProtocol/psy-node/blob/5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6/psy_node_common/src/coordinator/edge/server.rs)
  显示 CORS 和压缩层；这些层自身不能证明部署者对具体更新的授权。

上述字段一致性、布局证明和网络访问权限不自动等价于“升级请求由部署者授权”。
发布审查必须定位并验证完整的实际授权路径，不能只凭 deployer 哈希推断。

## 需由协议 / 运维 / 安全团队确认的证据

1. 实际网络运行的 commit、RPC 暴露方式及升级请求认证位置。
2. 认证怎样绑定到具体合约、旧根、新根、布局端点及防重放上下文。
3. 升级权限的持有者、批准机制及是否存在可验证的不可升级部署机制。
4. 在隔离环境验证未授权请求会被拒绝；所有者字段相同本身不应构成授权。
5. 经独立审查确认后，把对应源码、配置和拒绝测试结果纳入发布记录。

不应通过线上更新尝试验证本问题，也不应把改用另一普通钱包或 SD-key 部署者
直接宣称为不可升级保证。布局合法与调用内容授权也不能代替升级授权。

## 本仓库本轮解决了什么

Executor 将完整依赖根持久化；Rust 应用驱动在证明前、UPS 验证后、广播前复查，
配置替换、根变化、金库注册变化会阻止本执行器继续广播。这能关闭本执行器的
漏检路径，但无法约束其他公开 SD-key 执行者，或消除最后一次读取之后的升级窗口。

SD-key fingerprint 仍未认证被调用合约的 code/layout roots。升级授权与不可升级
保证需要先有可验证证据，独立安全审计也尚未完成；当前不声明六个合约全部生产级。
