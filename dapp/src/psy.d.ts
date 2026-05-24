// Type declarations for the window.psy provider injected by the
// psy-wallet browser extension. See psy-wallet/src/content/webHook.js.

import type { ContractCallArgs } from '@psy-protocol/psy-sdk'

export type PsyAccount = string

export interface PsyProvider {
  request<T = unknown>(args: { method: string; params?: unknown }): Promise<T>
  requestAccounts(): Promise<PsyAccount[]>
  sendTransaction(
    accountAddress: PsyAccount,
    callArgs: ContractCallArgs | ContractCallArgs[],
  ): Promise<string>
  on(event: 'accountsChanged', listener: (accounts: PsyAccount[]) => void): void
  on(event: string, listener: (...args: unknown[]) => void): void
  removeListener(event: string, listener: (...args: unknown[]) => void): void
}

declare global {
  interface Window {
    psy?: PsyProvider
  }
}

export {}
