import { useState, type ReactNode } from 'react'
import type { ContractCallArgs } from '@psy-protocol/psy-sdk'
import { sendCall } from '../lib/psy'
import { token } from '../lib/token'
import { getContractId, setContractId } from '../config'
import type { LogEntry } from './TxLog'

interface Props {
  account: string
  onLog: (entry: LogEntry) => void
}

export function TokenPanel({ account, onLog }: Props) {
  const [pending, setPending] = useState<string | null>(null)
  const [contractId, setContractIdState] = useState<bigint | null>(getContractId())
  const configured = contractId !== null

  const saveContractId = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      setContractId(null)
      setContractIdState(null)
      return
    }
    try {
      const parsed = BigInt(trimmed)
      setContractId(parsed)
      setContractIdState(parsed)
    } catch {
      onLog({ ts: Date.now(), kind: 'err', text: `Invalid contract id: ${trimmed}` })
    }
  }

  const run = async (label: string, build: () => ContractCallArgs) => {
    if (!configured) {
      onLog({ ts: Date.now(), kind: 'err', text: 'Set a contract id before sending tx.' })
      return
    }
    setPending(label)
    try {
      const result = await sendCall(account, build())
      onLog({ ts: Date.now(), kind: 'ok', text: `${label} → ${result}` })
    } catch (e) {
      onLog({ ts: Date.now(), kind: 'err', text: `${label}: ${(e as Error).message}` })
    } finally {
      setPending(null)
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Actions</h2>
        <ContractIdEditor value={contractId} onSave={saveContractId} />
      </div>

      <div className="action-grid">
        <Mint pending={pending === 'mint'} disabled={!!pending} run={run} />
        <Transfer pending={pending === 'transfer'} disabled={!!pending} run={run} />
        <Claim pending={pending === 'claim'} disabled={!!pending} run={run} />
      </div>
    </section>
  )
}

function parsePositiveInteger(value: string, label: string): bigint {
  const trimmed = value.trim()
  if (!/^[0-9]+$/.test(trimmed)) {
    throw new Error(`${label} must be a whole number.`)
  }
  const parsed = BigInt(trimmed)
  if (parsed <= 0n) {
    throw new Error(`${label} must be greater than 0.`)
  }
  return parsed
}

function parseUserId(value: string, label: string): bigint {
  const trimmed = value.trim()
  if (!/^[0-9]+$/.test(trimmed)) {
    throw new Error(`${label} must be a whole number.`)
  }
  return BigInt(trimmed)
}

function ContractIdEditor({
  value,
  onSave,
}: {
  value: bigint | null
  onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(value === null)
  const [draft, setDraft] = useState(value === null ? '' : value.toString())

  if (editing) {
    return (
      <span className="contract-editor">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          inputMode="numeric"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSave(draft)
              if (draft.trim()) setEditing(false)
            }
            if (e.key === 'Escape') {
              setDraft(value === null ? '' : value.toString())
              if (value !== null) setEditing(false)
            }
          }}
          placeholder="paste contract id"
        />
        <button
          className="ghost"
          onClick={() => {
            onSave(draft)
            if (draft.trim()) setEditing(false)
          }}
        >
          Save
        </button>
      </span>
    )
  }

  return (
    <span className="panel-sub">
      contract: <code>{value!.toString()}</code>
      <button
        className="ghost link"
        onClick={() => {
          setDraft(value!.toString())
          setEditing(true)
        }}
      >
        edit
      </button>
    </span>
  )
}

interface ActionProps {
  pending: boolean
  disabled: boolean
  run: (label: string, build: () => ContractCallArgs) => Promise<void>
}

function Card({
  icon,
  iconKind,
  title,
  desc,
  children,
}: {
  icon: string
  iconKind: 'mint' | 'burn' | 'transfer' | 'claim'
  title: string
  desc: string
  children: ReactNode
}) {
  return (
    <div className="action-card">
      <div className="action-card-header">
        <div className={`action-icon ${iconKind}`}>{icon}</div>
        <div>
          <div className="action-title">{title}</div>
          <div className="action-desc">{desc}</div>
        </div>
      </div>
      {children}
    </div>
  )
}

function Mint({ pending, disabled, run }: ActionProps) {
  const [amount, setAmount] = useState('')
  return (
    <Card icon="+" iconKind="mint" title="Mint" desc="Create new tokens to your balance">
      <div className="field">
        <label className="field-label">Amount</label>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="numeric"
          placeholder="0"
        />
      </div>
      <button
        disabled={disabled || !amount}
        onClick={() => run('mint', () => token.mint(parsePositiveInteger(amount, 'Amount')))}
      >
        {pending ? 'Sending…' : 'Mint'}
      </button>
    </Card>
  )
}

function Transfer({ pending, disabled, run }: ActionProps) {
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  return (
    <Card icon="→" iconKind="transfer" title="Transfer" desc="Send tokens to another user">
      <div className="field">
        <label className="field-label">Recipient user id</label>
        <input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          inputMode="numeric"
          placeholder="e.g. 0"
        />
      </div>
      <div className="field">
        <label className="field-label">Amount</label>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="numeric"
          placeholder="0"
        />
      </div>
      <button
        disabled={disabled || !recipient || !amount}
        onClick={() =>
          run('transfer', () =>
            token.transfer(
              parseUserId(recipient, 'Recipient user id'),
              parsePositiveInteger(amount, 'Amount'),
            ),
          )
        }
      >
        {pending ? 'Sending…' : 'Transfer'}
      </button>
    </Card>
  )
}

function Claim({ pending, disabled, run }: ActionProps) {
  const [sender, setSender] = useState('')
  return (
    <Card icon="↓" iconKind="claim" title="Claim" desc="Claim tokens sent to you">
      <div className="field">
        <label className="field-label">Sender user id</label>
        <input
          value={sender}
          onChange={(e) => setSender(e.target.value)}
          inputMode="numeric"
          placeholder="e.g. 0"
        />
      </div>
      <button
        disabled={disabled || !sender}
        onClick={() => run('claim', () => token.claim(parseUserId(sender, 'Sender user id')))}
      >
        {pending ? 'Sending…' : 'Claim'}
      </button>
    </Card>
  )
}
