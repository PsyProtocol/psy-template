# psy-dapp-template

Psy token contract + React/Vite/TS frontend, wired to the psy-wallet browser
extension via `window.psy`.

```
dapp/
├── contract/                 # Psy smart contract
│   ├── Dargo.toml
│   └── src/main.psy          # PsyTokenContract: mint / burn / transfer / claim / batch_transfer_{2,5}
└── src/                      # React frontend
    ├── App.tsx               # connect → call contract
    ├── lib/psy.ts            # window.psy helpers (waitForPsy, connect, sendCall)
    ├── lib/token.ts          # builds ContractCallArgs for each token method
    ├── hooks/usePsy.ts       # connection state
    └── components/           # ConnectBar, TokenPanel, TxLog
```

## Prerequisites

- The Psy toolchain (`psyc` / `psy-cli`), installed via `psyup install`
- Node 18+ and pnpm
- The [psy-wallet](https://app-stg.psy-protocol.xyz/wallet) browser extension
  installed and unlocked (it injects `window.psy` on page load)

## 1. Configure, Build & Deploy the contract

```sh
# 1. From dapp/, configure your canonical on-chain user ID as ISSUER_USER_ID (Mandatory)
npm run configure -- --issuer <YOUR_USER_ID>

# 2. Strict preflight verification (verifies explicit configuration record via .issuer_configured)
npm run check:preflight

# 3. Verify the selected wallet's issuer user ID on this network
npm run check:deployer

# 4. Build and deploy with the same wallet and network configuration
npm run deploy:checked
```

> [!NOTE]
> **Deployment credentials**: Set exactly one of `PRIVATE_KEY` or `KEYSTORE_PATH` (plus `WALLET_PASSWORD` for a keystore), and point `RPC_CONFIG` at the intended network. The checked command queries the first registered user ID for that wallet's public key, rejects a mismatch, builds, then deploys. Direct `psyup deploy` bypasses this wrapper.

Note the printed `contract_id` — the frontend needs it.

## 2. Run the frontend

```sh
# from dapp/
pnpm install                                 # installs @psy-protocol/psy-sdk from npm
echo 'VITE_PSY_CONTRACT_ID=<id>' > .env.local
pnpm dev                                     # http://localhost:5173
```

Open the page, click **Connect wallet**, then mint / burn / transfer / claim.
Each action calls `window.psy.sendTransaction(account, callArgs)` and the
wallet popup asks you to approve it.

## How the frontend talks to the chain

The psy-wallet extension injects a provider as `window.psy`.
Its surface, used here:

```ts
window.psy.requestAccounts(): Promise<string[]>
window.psy.sendTransaction(account, callArgs): Promise<string>
window.psy.on('accountsChanged', listener)
```

`callArgs` is a `ContractCallArgs` (or array) — `{ contract_id, method_name, inputs[] }` —
imported from `@psy-protocol/psy-sdk`. See [`src/lib/token.ts`](src/lib/token.ts) for
one builder per contract method.

Reads (e.g. balance) are intentionally **not** wired up in this template:
`window.psy` doesn't expose a read RPC, so balance display would need either
a public RPC endpoint or the SDK's `PsyUserWallet`. Add it when you need it.

## Customizing

- **Change the contract**: edit `contract/src/main.psy`, rebuild, redeploy,
  and update `src/lib/token.ts` to match the new method signatures.
- **Change the SDK source**: the dependency is `"@psy-protocol/psy-sdk": "^1.1.12"`
  in `package.json`. Update the version there when newer releases are available.
- **Used as a `psyup new --template dapp` template**: `psyup new` rewrites
  the project name in `Dargo.toml` and `package.json`'s `name` field.
