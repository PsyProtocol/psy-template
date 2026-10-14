# 独立服务器运行模板

此模板尚未在 Linux 生产服务器上安装或验收。它提供一个主机上的服务配置；跨机器执行者必须使用经过验证的协调方案，不能各自建立独立日志后宣称具备分布式锁。

## 发布目录

- `/opt/psy-executor/app/`：冻结的 ESM 源码及 `package.json`。
- `/opt/psy-executor/bin/market_wallet_verified`：针对该服务器平台构建并验证的公开 SD-key 驱动。应用构建需启用 HTTPS 支持。
- `/etc/psy-executor/`：service、各金库配置、官方 RPC、ABI、policy、编译配置及发布哈希。配置采用绝对路径。
- `/var/lib/psy-executor/`：持久 runtime、调用文件、广播日志、状态文件和用户发现提示。

程序、策略和 ABI 由部署管理员管理，运行账号只写持久状态目录。不得复制普通钱包私钥、助记词、恢复文件或 MCP owner/session token。运行公开 SD-key 不需要这些资料。

创建专用 `psy-executor` 用户，安装受支持的 Node.js、该平台的驱动和系统 CA 信任。不要把 macOS 二进制复制到 Linux。配置 `maxConcurrentExecutions` 和扫描用户范围后，先核对发布哈希，再运行 `service.mjs ... scan` 验证网络、根、fingerprint、公钥身份和 ABI。通过只读检查及该平台的小额结算验收后，才启用本服务。

## 停止、恢复和监控

`TimeoutStopSec=1200` 为正在执行的证明保留退出时间。广播前的日志和叶哈希必须持久化；被强制终止后，先对账，再处理下一笔。保留整个 runtime 目录及原始日志，不能删除未决记录来恢复运行。

观察系统日志及配置中的 `statusFile`：心跳、checkpoint 是否推进、各金库的 `halted` / `unresolved` / `read-unavailable` 状态、最后确认回执和证明耗时。进程仍运行不代表所有金库正常；单个金库可能已经停止，需要明确的告警与响应流程。

备份并恢复一次 runtime，验证已确认任务不重复广播；在专用环境测量容量、证明资源和节点故障下的行为。记录实际可用性与告警处理结果。模板本身不代表这些验收已经通过。
