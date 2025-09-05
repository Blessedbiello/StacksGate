/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_WIDGET_URL: string
  readonly VITE_APP_NAME: string
  readonly VITE_STACKS_NETWORK: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}