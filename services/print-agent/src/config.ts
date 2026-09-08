import { hostname } from 'os';

/**
 * Environment-variable config for the agent process. Pure and side-effect-free (takes `env`
 * as a parameter rather than reading `process.env` directly) specifically so it's testable
 * without mutating real process state — see `config.spec.ts`.
 */
export interface PrintAgentConfig {
  apiBaseUrl: string;
  email: string;
  password: string;
  deviceInfo?: string;
  pollIntervalMs: number;
  jobTimeoutMs: number;
}

export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PrintAgentConfig {
  const apiBaseUrl = requireEnv(env, 'PRINT_AGENT_API_BASE_URL').replace(/\/+$/, '');
  const email = requireEnv(env, 'PRINT_AGENT_EMAIL');
  const password = requireEnv(env, 'PRINT_AGENT_PASSWORD');

  const pollIntervalMs = parsePositiveInt(env, 'PRINT_AGENT_POLL_INTERVAL_MS', 5000);
  const jobTimeoutMs = parsePositiveInt(env, 'PRINT_AGENT_JOB_TIMEOUT_MS', 5000);

  return {
    apiBaseUrl,
    email,
    password,
    deviceInfo: env.PRINT_AGENT_DEVICE_INFO || `print-agent@${hostname()}`,
    pollIntervalMs,
    jobTimeoutMs,
  };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key} — see services/print-agent/.env.example`,
    );
  }
  return value;
}

function parsePositiveInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive number of milliseconds, got "${raw}"`);
  }
  return parsed;
}
