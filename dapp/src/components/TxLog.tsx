export type LogEntry = { ts: number; kind: 'ok' | 'err'; text: string }

interface Props {
  entries: LogEntry[]
}

export function TxLog({ entries }: Props) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Activity</h2>
        <span className="panel-sub">{entries.length} entries</span>
      </div>
      {entries.length === 0 ? (
        <div className="log-empty">No transactions yet. Submit one above.</div>
      ) : (
        <ul className="log">
          {entries.map((e, i) => (
            <li key={i} className={e.kind === 'ok' ? 'log-ok' : 'log-err'}>
              <span className="log-time">{new Date(e.ts).toLocaleTimeString()}</span>
              <span className="log-text">{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
