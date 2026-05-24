import { useState } from 'react'
import { usePsy } from './hooks/usePsy'
import { ConnectBar } from './components/ConnectBar'
import { TokenPanel } from './components/TokenPanel'
import { TxLog, type LogEntry } from './components/TxLog'

export default function App() {
  const { status, account, error, connect } = usePsy()
  const [log, setLog] = useState<LogEntry[]>([])

  const appendLog = (entry: LogEntry) => setLog((prev) => [entry, ...prev].slice(0, 50))

  return (
    <div className="app">
      <ConnectBar status={status} account={account} onConnect={connect} />

      {error && <div className="warn">⚠️ {error}</div>}

      <main className="content">
        {account ? (
          <>
            <TokenPanel account={account} onLog={appendLog} />
            <TxLog entries={log} />
          </>
        ) : (
          <section className="panel welcome">
            <h1>PSY Token dApp</h1>
            <p>
              A minimal starter built around the contract in{' '}
              <code>contract/src/main.psy</code>. Connect your psy-wallet to
              mint, burn, transfer and claim tokens — all signed in-extension
              via <code>window.psy</code>.
            </p>
          </section>
        )}
      </main>

      <footer>
        <a href="https://github.com/PsyProtocol/psy-compiler" target="_blank" rel="noreferrer">psy-compiler</a>
        ·
        <a href="https://app-stg.psy-protocol.xyz/wallet" target="_blank" rel="noreferrer">psy-wallet</a>
      </footer>
    </div>
  )
}
