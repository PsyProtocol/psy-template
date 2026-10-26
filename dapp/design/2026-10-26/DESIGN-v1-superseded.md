# Psy Markets UI specification

Primary screen: `primary-concept-v1.png`, generated with the built-in Image Gen
tool on 2026-10-26. This reference is for code-native UI, not an image shipped as
an interactive screen. Existing React/Vite app and wallet provider are reused.

Subject: a Chinese test-market workbench for AMM, the existing QA-A→QA-B→QA-A
two-pool workflow, and an order/claim centre. No UI for unsupported market paths.

Tokens: white #fff surfaces, cool #f7f8fb rail, #242330 foreground, #727482
muted text, #e9e8ef hairlines, #7048e8 purple and #eee8ff selection, #109fa5
QA-B, amber offline notice. Sans system/PingFang Chinese body and headings;
tabular numeric data. 208px rail at 1440px, 64px header, 32px content gutters;
16px body, 13px utility, 32px heading. The swap form has one 14px frame;
the adjacent route/timeline stays open. Full-width native order table below.

Signature: thin purple route segments between token nodes, aligned with a
five-stage vertical timeline. SVG utility icons use 1.8px rounded strokes.
Mobile: compact horizontal nav, stacked form and route, contained table scroll;
no page-width overflow. Dialogs trap focus and return it to the invoking control.
Reduced motion disables transitions. No decorative or remote image assets.

Allowed primary copy: Psy Markets; 交易工作台; 兑换; 订单中心; 资产与领取;
连接钱包; Sepolia 测试网; 实时服务未接入; 设置金额、到账下限和收款人。;
演示模式：本地数据，真实提交已暂停。; 单池 AMM; 双池组合; 支付;
预计收到; QA-A; QA-B; 滑点上限; 有效期; 收款人; 最低到账;
费用上限; 预览订单; 预览不会签名或发送交易; 执行路径; 从下单到到账;
提交订单; 固定批次; 生成证明; 网络确认; 领取到账; 最近订单;
仅演示记录; 查看全部; 订单; 路径; 金额; 状态; 操作; 查看详情.

Intentional functional corrections to the generated reference, chosen before
implementation:

- Network fees use test PSY (9 decimals), never QA-A. The value is an editable
  **user budget**, not a claimed whole-route fee quote or an actual fee burn.
- Amounts and minimum output come from existing U124/AMM BigInt functions;
  illustrative numbers in the image do not override arithmetic.
- Receiver is editable without a wallet for offline preview. A wallet account
  string is not assumed to be a verified on-chain user ID. No automatic funding.
- Time in minutes is a local draft preference, not a conversion to checkpoint
  expiry. No signed/chain intent is produced by this UI until live integration.
- QA metadata, reserves, records, request IDs, refunds and progress are explicitly
  local demonstrations, not authenticated state, proof, receipt or balances.
- A required order/preview dialog extends the same design language to show full
  amounts, fees, recipient, stages, cancellation and actual-asset recovery.
  A partial two-hop example refunds QA-B, not the original QA-A at its old price.
- First release has no live submit/claim/cancel gateway and no override flag.
  Wallet connection alone must never enable it. A blocked live action remains
  visible in preview; demo actions only mutate the local demo store.

Architecture: `App` composes `WorkbenchShell`, `SwapPanel`, `RoutePreview`,
`OrderTable`, `OrderDialog`, `AssetsPanel`; pure `markets` domain functions and
demo fixtures/store stay separate. Existing arithmetic/AMM client sources are
imported directly. The old npm SDK was only a TypeScript type dependency;
replace that type with the documented browser-provider message shape, not a
different SDK. Rust/Executor SDK pins and market contracts remain untouched.

## Final comparison and fidelity ledger

Reviewed with `view_image` on the concept and actual IAB desktop/mobile images,
including the final clean desktop (`desktop-final-v2.jpg`) after resetting
scroll to zero. Native viewport 1505×1045 and responsive viewport 390×844.
Full-page screenshots include downstream content beyond viewport height.

| Point | Concept / rendering | Resolution |
| --- | --- | --- |
| Layout | White header, cool rail, framed left form, open right route, native table | Preserved. Rail is `clamp(208px,16.6vw,250px)` (about 250px at the reference size), correcting the initial approximate extraction. |
| Palette | True white, purple/lavender controls, teal QA-B, amber demo notice | Preserved; muted/semantic text darkened for readability. No imagery or colour overlay added. |
| Type and icons | Sans Chinese, tabular quantities, serif Psi, 1.8px outline utilities | Shared tokens and SVG components, explicit input/select/button sizing; system Chinese font fallback remains platform dependent. |
| Financial copy | Reference fee unit and illustrative amounts were not authoritative | Uses test PSY budget plus existing BigInt quotes; balance/identity unverified; recipient editable for unsigned preview. These are deliberate corrections, not pixel-identical copy. |
| Form density | New fee budget needs a meaningful control | Recipient/budget share a row. Native form about 621px high; recent table around y865. Added explanatory copy makes full page taller than the concept. |
| Data and output selector | Reference seed rows and independent output dropdown | Rows now reflect exercised demo states. Output asset is derived from fixed supported path, with no decorative/inert output dropdown. No invented live metrics/hash. |
| Mobile | Same families, stacked form/route, compact nav | No document overflow at 390px (375px content with scrollbar); table scroll stays contained. |
| Keyboard | Native dialog initially let Shift+Tab escape in the WebView | Added explicit boundary trap, verified both directions plus Escape/focus restoration. Skip link focuses main content. Initial failure is preserved. |
| Screenshot method | Ego CDP capture timed out twice; IAB viewport-only capture clipped | IAB full-page captures and DOM geometry used; scroll reset prevents sticky/fixed compositor displacement. Hidden skip link uses accessible clipping instead of offscreen transforms. |

Above-the-fold copy review: navigation, heading, tabs, action, route and stages
match the specified information architecture. All new visible safety/fee/copy
differences are listed above or in the pre-implementation correction list.
There are no unresolved clipping or inert-control issues in the tested core
flows. This is a faithful implementation of the concept **with the documented
financial and functional corrections**, not a pixel-identity or production
financial-security claim. Ego Lite 0.6.0.16 also offered an update; it was not
upgraded, and its temporary task was closed after the IAB fallback.
