/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of services/api, e.g. http://192.168.1.50:3000/api/v1 — see docs/customer-web.md. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
