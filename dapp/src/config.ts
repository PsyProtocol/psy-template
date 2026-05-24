// Resolve the deployed PsyTokenContract id.
//
// Priority:
//   1. localStorage (set via the UI)
//   2. VITE_PSY_CONTRACT_ID build-time env var
//   3. null (unconfigured)
//
// null is the sentinel for "no contract set"; 0 is a valid contract id.

const STORAGE_KEY = 'psy.contractId'

const fromEnv = import.meta.env.VITE_PSY_CONTRACT_ID

function tryParse(v: string | null | undefined): bigint | null {
  if (v === null || v === undefined || v === '') return null
  try {
    return BigInt(v)
  } catch {
    return null
  }
}

function readLocal(): bigint | null {
  try {
    return tryParse(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

export function getContractId(): bigint | null {
  const local = readLocal()
  if (local !== null) return local
  return tryParse(fromEnv)
}

export function setContractId(value: string | bigint | null): void {
  try {
    if (value === null || value === '') {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, String(value))
    }
  } catch {
    // ignore quota / disabled-storage errors
  }
}

export const isContractConfigured = (): boolean => getContractId() !== null
