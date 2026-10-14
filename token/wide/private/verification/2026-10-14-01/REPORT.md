# U124 FT 隐私功能本地验证（2026-10-14）

新增独立私有 profile，保留公开 U124 的 20 个方法，新增 private_transfer / private_claim。
两个 62-bit limb 分别绑定到 low/high 票据树，复用现有原生票据包含证明电路。
领取时固定根 leaf index 293601306 / 293601307，同一检查点核对所有证明后一次性入账。

## 结果

- 私有客户端及实际编译 ABI：6/6。
- 私有 VM / 原生证明 / 实际断言 gadget / CFC 构建：5/5。
- 使用私有编译产物执行原公开 FT 行为回归：6/6。
- 原公开版 JavaScript 回归：5/5。
- 离线辅助工具成功生成并验证原生证明，证明与 verifier JSON 以不透明字符串保留大整数精度。
- 编译产物共 22 方法，状态树高度 32，根 offset 与原生 circuit fingerprint 核对一致。
- 验证大额 18 位精度、单 limb、最大 U124、树独立追加、树满时回滚；拒绝重放、跨位换证、金额/收款人/检查点/路径篡改和入账溢出。

## 验证范围

原生证明是真实 Plonky2 proof，并由原生 verifier 验证；所用检查点及用户树是合成夹具。
私有领取的实际编译 DPN 运算和断言由 VM/生产 op gadgets 执行，状态与会话读写由本地适配器提供。
两个完整 CFC 电路能构建；没有生成完整认证状态 CFC 或 UPS，也没有提交链上交易。
已有公开 U124 合约、三个市场、NFT Market、Node 和 MCP 服务均未更改部署。

新增字段使此版使用独立 32 层布局，需要新合约 ID。
部署前仍需独立验证初始 0 → 新布局的 canonical proof，再做真实结算和权限审查。
本轮不声明生产就绪，也不声明所有金额/交易关系完全保密。

## 产物

源代码与使用说明见 ../../README.md、../../src/main.psy.rs、../../client.mjs。
机器可读结果见 RESULTS.json。
原始编译、工具链副本、日志、合成 witness/proof 和源码快照保存在本机同目录，默认不提交远程。
私有测试 witness 只使用人工夹具，无真实钱包私钥或真实票据秘密；报告不包含 witness。
首次测试日志、旧辅助工具版本及其输出保留；最终为 privacy-and-public-tests-v6.log、client-tests-final.log、proof-helper-v2.log。
曾把 22 方法私有产物传给严格只接受 20 方法的公开 ABI gate，按预期拒绝；随后分别验证公开 profile 和新私有 bytecode 上的全部公开行为。

源码 SHA256：4dbf010a0c78809b47a6ae9e966cc625cb2d701636ae44d8bf32c34cb68c541a
编译产物 SHA256：6755b655e5d858361bb221c73669dd81b8247b6327a53fc08301d34fb72a7110
