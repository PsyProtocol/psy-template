/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PSY_CONTRACT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
