import type { ContractCallArgs } from '@psy-protocol/psy-sdk'
import type { PsyAccount, PsyProvider } from '../psy'

export class PsyWalletNotInstalledError extends Error {
  constructor() {
    super('PSY wallet not detected. Install the psy-wallet extension and reload.')
    this.name = 'PsyWalletNotInstalledError'
  }
}

// Resolve with the provider, or wait up to `timeoutMs` for the extension's
// `psy#initialized` event. The wallet may inject window.psy after the page
// has parsed, so polling/event-listening is required.
export function waitForPsy(timeoutMs = 3000): Promise<PsyProvider> {
  if (window.psy) return Promise.resolve(window.psy)
  return new Promise((resolve, reject) => {
    let done = false
    const onInit = () => {
      if (done) return
      if (window.psy) {
        done = true
        cleanup()
        resolve(window.psy)
      }
    }
    const timer = window.setTimeout(() => {
      if (done) return
      done = true
      cleanup()
      reject(new PsyWalletNotInstalledError())
    }, timeoutMs)
    const cleanup = () => {
      window.removeEventListener('psy#initialized', onInit)
      window.clearTimeout(timer)
    }
    window.addEventListener('psy#initialized', onInit)
    // also poll in case the event already fired before we attached
    const poll = window.setInterval(() => {
      if (window.psy) {
        window.clearInterval(poll)
        onInit()
      }
    }, 100)
    window.setTimeout(() => window.clearInterval(poll), timeoutMs)
  })
}

export async function connect(): Promise<PsyAccount[]> {
  const psy = await waitForPsy()
  return psy.requestAccounts()
}

export async function sendCall(
  account: PsyAccount,
  call: ContractCallArgs | ContractCallArgs[],
): Promise<string> {
  const psy = await waitForPsy()
  return psy.sendTransaction(account, call)
}
