import type { PsyStatus } from '../hooks/usePsy'

interface Props {
  status: PsyStatus
  account: string | null
  connecting: boolean
  onConnect: () => void
}

export function ConnectBar({ status, account, connecting, onConnect }: Props) {
  return (
    <header className="connect-bar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <span>PSY Token</span>
      </div>

      <div className="connect-actions">
        {status === 'detecting' && (
          <span className="muted">
            <span className="status-dot detecting" />
            Detecting wallet…
          </span>
        )}
        {status === 'missing' && (
          <span className="muted">
            <span className="status-dot err" />
            psy-wallet not detected
          </span>
        )}
        {status === 'available' && !account && (
          <button type="button" onClick={onConnect} disabled={connecting}>
            {connecting ? 'Connecting...' : 'Connect wallet'}
          </button>
        )}
        {account && (
          <span className="account" title={account}>
            <span className="status-dot ok" />
            {account.slice(0, 6)}…{account.slice(-4)}
          </span>
        )}
      </div>
    </header>
  )
}
