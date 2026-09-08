/**
 * Thin HTTP client for the subset of `services/api` this agent needs: logging in as a staff
 * account, discovering printers, polling each one's next queued job, and reporting a job's
 * outcome back. Uses the global `fetch` (Node >=18) rather than adding an HTTP dependency —
 * this package has none, deliberately, to stay a small single-purpose daemon.
 *
 * Auth model: the agent logs in once with a normal staff account's email/password (see
 * README.md for why that account should be scoped to exactly one outlet and hold only
 * `printers.manage`) and gets a short-lived access token (15m by default — see
 * `services/api/src/common/config/configuration.ts`) plus a long-lived refresh token. Rather
 * than pre-emptively refreshing on a timer, `authedRequest` refreshes reactively on the first
 * 401 it sees and retries the one request that triggered it — simpler than tracking expiry
 * skew, and correct either way since a 401 is the authoritative signal the access token is no
 * longer good.
 */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export type PrinterJobStatus = 'QUEUED' | 'SENT' | 'FAILED' | 'ACKED';

export interface PrinterJob {
  id: string;
  printerId: string;
  payload: unknown;
  status: PrinterJobStatus;
  attempts: number;
}

export interface PrinterRecord {
  id: string;
  name: string;
  type: 'KITCHEN' | 'RECEIPT';
  connectionType: 'NETWORK' | 'USB';
  ipAddress: string | null;
  port: number | null;
  isActive: boolean;
}

export class DineEasyApiClient {
  private tokens: TokenPair | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async login(email: string, password: string, deviceInfo?: string): Promise<void> {
    const res = await this.fetchImpl(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, deviceInfo }),
    });
    if (!res.ok) throw new Error(`Login failed: ${res.status} ${await safeText(res)}`);
    this.tokens = (await res.json()) as TokenPair;
  }

  async listPrinters(): Promise<PrinterRecord[]> {
    return this.authedRequest<PrinterRecord[]>('/printers', { method: 'GET' });
  }

  async nextQueuedJob(printerId: string): Promise<PrinterJob | null> {
    return this.authedRequest<PrinterJob | null>(`/printers/${printerId}/jobs/next`, {
      method: 'GET',
    });
  }

  async updateJobStatus(
    jobId: string,
    status: Extract<PrinterJobStatus, 'SENT' | 'FAILED'>,
    error?: string,
  ): Promise<void> {
    await this.authedRequest(`/printers/jobs/${jobId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, error }),
    });
  }

  private async authedRequest<T>(path: string, init: RequestInit, isRetry = false): Promise<T> {
    if (!this.tokens) throw new Error('Not logged in — call login() first');

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.tokens.accessToken}`,
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    if (res.status === 401 && !isRetry) {
      await this.refresh();
      return this.authedRequest<T>(path, init, true);
    }
    if (!res.ok) {
      throw new Error(
        `${init.method ?? 'GET'} ${path} failed: ${res.status} ${await safeText(res)}`,
      );
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async refresh(): Promise<void> {
    if (!this.tokens) throw new Error('Cannot refresh: not logged in');
    const res = await this.fetchImpl(`${this.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.tokens.refreshToken }),
    });
    if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await safeText(res)}`);
    this.tokens = (await res.json()) as TokenPair;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
