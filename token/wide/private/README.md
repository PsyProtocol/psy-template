# 双 Felt FT 的隐私票据功能

独立私有版源文件：`src/main.psy.rs`。保留公开 U124 FT 的 20 个方法，新增
`private_transfer` / `private_claim`，共 22 个方法。金额仍为 `[low62, high62]`，
支持 0～18 位精度及最大 `2^124−1` 个最小单位。

## 两棵票据树

链上现有 `PrivateNoteInclusionCircuit` 证明一个 Felt 金额。此版本复用它，
为非零 low / high limb 分别创建票据，high 票据的面值单位是 `2^62`。
证明使用同一原生电路、同一个检查点；领取方法核对两条路径后一次性入账。
任一证明、余额范围或 nullifier 检查失败，整次领取失败。

| 项目 | low | high |
|---|---:|---:|
| 根的 Felt offset | 1174405224 | 1174405228 |
| 根的四 Felt leaf index | 293601306 | 293601307 |
| 票据金额范围 | 1～2^62−1 | 1～2^62−1 |
| 每棵树容量 | 2^20 | 2^20 |

根的 leaf index 固定在合约的证明公开输入中，不能由调用者选择。
将 low 证明拿去领取 high 会导致会话树根校验失败。

每张票据使用独立的 nullifier secret 和 note secret：

```text
receiver = Poseidon(user_id, 1337, random0, random1)
note_secret_hash = Poseidon(nullifier_secret[4], note_secret[4])
commitment = Poseidon2(Poseidon2(receiver, [limb,0,0,0]), note_secret_hash)
nullifier = Poseidon(nullifier_secret[4])
```

已消费 nullifier 写入领取者分区的 `private_nullifiers`；收款人绑定防止另一用户领取。
同次双 limb 领取不能使用相同 nullifier。零 limb 不创建票据，领取参数必须使用全零
nullifier 和空会话路径。票据不能重复消费；若收款人选择分次领取两个 limb，
已经消费的 limb 也不能再次领取。应用默认一次性领取完整金额。

**这是隐私票据与隐藏票据来源的证明机制，不代表所有金额、余额、调用参数、事件
或交易关系都不可观察。** 转出事件包含发送者和 commitment；转入参数包含收款金额。
没有提供完全匿名或全面金额保密保证。隐私强度还取决于链上的数据公开方式。

## 客户端

`client.mjs` 保留 BigInt，提供完整公开方法与两个新增调用构造器。
`preparePrivateTransfer` 使用系统随机数产生票据秘密，调用方必须安全保管 bundle。
不得把 bundle、nullifier secret、note secret 或收款随机数写入公开日志/测试报告。

```js
import {preparePrivateTransfer,preparePrivateClaim} from './client.mjs';
import {losslessJson} from '../arithmetic.mjs';

const {call,bundle}=await preparePrivateTransfer({
  contractId:NEW_PRIVATE_TOKEN_ID,
  recipient:RECEIVER_ID,
  amount:10n**27n+7n,
  hashProvider, // SDK Poseidon: hashNoPad(values), twoToOne(left,right), BigInt hashes
});
// 通过钱包执行 call；等待确认，取得同一检查点的票据/状态/用户树路径。
const claim=await preparePrivateClaim({
  bundle,userTreeRoot,checkpointId,hashProvider,
  proveNote,       // 原生电路证明；返回 fingerprint、publicInputs 和原生 proof/verifier data
  addSessionProof,// 将原生证明加入接收者会话；返回 16-bit leaf index
  getSessionPath, // 从当前会话读取 {index,siblings,root}
});
// 同一会话执行 claim.call；不能在路径生成后再插入其他证明或调用。
const wire=losslessJson(claim.call);
```

`preparePrivateClaim` 先添加全部非零 limb 的证明，再读取最终会话路径。
它重算 commitment、nullifier、证明公开输入哈希及路径根，并要求两条路径根相同。
不能直接复用旧 SDK 的单 Felt `ClaimBatchItem::PrivateTransfer` 参数编码。
现有 SDK 的通用 external-proof/session-call 接口可以用于上述适配；当前 MCP 钱包
尚未提供这一双 limb bundle 的专用入口，本轮没有修改钱包或 MCP 服务。

`vm-tests` 的 `prove_note_u124` 二进制可离线生成并验证原生证明：

```sh
prove_note_u124 PRIVATE_WITNESS_JSON NEW_PROOF_JSON
```

输入为 SDK `PrivateNoteInclusionInput`，必须包含一致的同检查点路径。
输出只有 ZK proof、verifier data、fingerprint 和公开输入哈希，不包含 witness。
辅助 JSON 的四 Felt 指纹和公开输入使用十进制字符串；JS 接入时显式 `.map(BigInt)`。
`noteProofJson` / `verifierDataJson` 是不透明 JSON 字符串，直接传给 Rust SDK 解析；
不要在 JavaScript 中用普通 `JSON.parse` 再重编码其内部 Felt，以免丢失精度。

## 构建与验证

```sh
node token/wide/private/generate.mjs --check
npm run test:token-wide-private

# 只读归档相邻 psy-node，在新目录的副本中暴露现有 VM intrinsics。
# 不修改 Node checkout，不部署 Node。
npm run build:token-wide-private:toolchain -- /private/tmp/psy-private-u124-toolchain-new
# 从 toolchain.json 读取两个二进制路径：
export TOKEN_WIDE_PRIVATE_COMPILER=/path/to/compile_private
export TOKEN_WIDE_PRIVATE_FINGERPRINT=/path/to/fingerprint
npm run build:token-wide-private -- /private/tmp/psy-private-u124-build-new --issuer REGISTERED_ISSUER_ID

# 针对该工具链归档中的 crate（同样位于 toolchain.json）：
TOKEN_WIDE_PRIVATE_ARTIFACT=/path/to/compilation_artifact.json \
TOKEN_WIDE_ARTIFACT=/path/to/compilation_artifact.json \
  cargo +nightly-2025-09-20 test --offline --locked --release \
  --manifest-path /path/to/isolated/vm-tests/Cargo.toml --test privacy --test public_token -- --test-threads=1
```

编译检查会拒绝错误 ABI、错误根位置、非 32 层状态树及不匹配的原生电路指纹。
输出目录必须不存在。模板 issuer 5 仅用于本地夹具；正式构建要绑定实际发行者。

## 兼容性与状态

此版增加两棵树、nullifier map 和使状态树达到 32 层的保留空间。
**需要新的合约 ID；不能直接覆盖现有公开 U124 FT 或旧单 Felt FT。**
虽然保留了公开方法的 ABI 和原字段 offset，现有余额与市场的合约 ID 绑定不会自动迁移。
AMM、Orderbook、Bonding Curve、NFT Market 目前继续使用它们已有的公开资产；
隐私转账功能不会自动使市场交易成为隐私交易。

本轮通过实际编译、真实原生票据证明、DPN VM/断言电路和公开功能回归。
验证使用合成检查点与本地状态适配器，不等于完整认证状态 CFC/UPS或测试网验收。
尚未部署，也未标记生产就绪。nullifier map 每个领取者最多 2^20 项；
无票据秘密恢复、隐私余额迁移和已发布隐私票据的单方面撤销功能。
