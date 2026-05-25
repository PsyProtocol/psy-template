import { useCallback, useEffect, useState } from 'react'
import { connect, waitForPsy, PsyWalletNotInstalledError } from '../lib/psy'

export type PsyStatus = 'detecting' | 'available' | 'missing'

export function usePsy() {
  const [status, setStatus] = useState<PsyStatus>('detecting')
  const [account, setAccount] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    let cancelled = false
    waitForPsy(3000)
      .then((p) => {
        if (cancelled) return
        setStatus('available')
        p.on('accountsChanged', (accounts) => {
          const list = Array.isArray(accounts)
            ? accounts
            : ((accounts as { accounts?: string[] })?.accounts ?? [])
          setAccount(list[0] ?? null)
        })
      })
      .catch((e) => {
        if (cancelled) return
        if (e instanceof PsyWalletNotInstalledError) {
          setStatus('missing')
        } else {
          setError(String(e))
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const doConnect = useCallback(async () => {
    if (connecting) return
    setConnecting(true)
    setError(null)
    try {
      const accounts = await connect()
      setAccount(accounts[0] ?? null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setConnecting(false)
    }
  }, [connecting])

  return { status, account, error, connecting, connect: doConnect }
}
