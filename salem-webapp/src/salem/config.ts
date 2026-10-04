/**
 * Salem runtime configuration.
 *
 * Every value comes from Vite env vars (`.env`, see `.env.example`).
 * AppName/AppVersion are sent to the server on connect; the API key proves
 * this client is permitted to talk to the server.
 */

function required(name: string, fallback?: string): string {
  const value = import.meta.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required config: ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

export interface SalemConfig {
  /** WebSocket endpoint of the Salem server. */
  host: string;
  appName: string;
  appVersion: string;
  apiKey: string;
  /** Persist the message cache in IndexedDB. */
  persist: boolean;
}

export function loadConfig(): SalemConfig {
  return {
    host: required('VITE_SALEM_HOST', 'ws://localhost:6060'),
    appName: required('VITE_SALEM_APP_NAME', 'Salem'),
    appVersion: required('VITE_SALEM_APP_VERSION', '0.1.0'),
    apiKey: required(
      'VITE_SALEM_API_KEY',
      'AQEAAAABAAD_rAp4DJh05a1HAwFT3A6K',
    ),
    persist: import.meta.env.VITE_SALEM_PERSIST !== 'false',
  };
}