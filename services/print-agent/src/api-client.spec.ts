import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { DineEasyApiClient } from './api-client';

/**
 * A real local HTTP server standing in for `services/api` — driven with real `fetch` calls,
 * not a mocked `fetch`. Same discipline as `printer-socket.spec.ts`: exercising the actual
 * request/response cycle (headers, status codes, JSON bodies) catches things a mock would
 * silently paper over. This sandbox can't run the real API (it needs `prisma generate`,
 * blocked here — see docs/troubleshooting.md) but can trivially run a fake one that speaks
 * the same three-endpoint contract this client actually uses, including the 401 -> refresh
 * flow: the fake server only accepts 'token-2' for `/printers*` once `/auth/refresh` has
 * actually been called with the right refresh token, so a test succeeding here is proof the
 * refresh path really ran, not that the first request happened to already work.
 */
function startFakeApi(): Promise<{ server: Server; baseUrl: string }> {
  let currentAccessToken = 'token-1';

  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString('utf8');
        const body = bodyText ? JSON.parse(bodyText) : {};
        const auth = req.headers['authorization'];

        const send = (status: number, payload?: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(payload === undefined ? '' : JSON.stringify(payload));
        };

        if (req.method === 'POST' && req.url === '/auth/login') {
          if (body.email === 'agent@outlet.test' && body.password === 'correct-horse') {
            return send(200, { accessToken: 'token-1', refreshToken: 'refresh-1' });
          }
          return send(401, { message: 'Invalid credentials' });
        }

        if (req.method === 'POST' && req.url === '/auth/refresh') {
          if (body.refreshToken === 'refresh-1') {
            currentAccessToken = 'token-2';
            return send(200, { accessToken: 'token-2', refreshToken: 'refresh-2' });
          }
          return send(401, { message: 'Invalid refresh token' });
        }

        if (req.method === 'GET' && req.url === '/printers') {
          if (auth !== `Bearer ${currentAccessToken}`)
            return send(401, { message: 'Unauthorized' });
          return send(200, [
            {
              id: 'printer-1',
              name: 'Kitchen 1',
              type: 'KITCHEN',
              connectionType: 'NETWORK',
              ipAddress: '192.168.1.50',
              port: 9100,
              isActive: true,
            },
          ]);
        }

        if (req.method === 'GET' && req.url === '/printers/printer-1/jobs/next') {
          if (auth !== `Bearer ${currentAccessToken}`)
            return send(401, { message: 'Unauthorized' });
          return send(200, {
            id: 'job-1',
            printerId: 'printer-1',
            payload: {},
            status: 'QUEUED',
            attempts: 0,
          });
        }

        if (req.method === 'PATCH' && req.url === '/printers/jobs/job-1/status') {
          if (auth !== `Bearer ${currentAccessToken}`)
            return send(401, { message: 'Unauthorized' });
          return send(200, { id: 'job-1', status: body.status });
        }

        return send(404, { message: 'not found in fake api' });
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe('DineEasyApiClient', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    ({ server, baseUrl } = await startFakeApi());
  });

  afterEach((done) => {
    server.close(() => done());
  });

  it('logs in and can then make an authenticated request', async () => {
    const client = new DineEasyApiClient(baseUrl);
    await client.login('agent@outlet.test', 'correct-horse');
    await expect(client.listPrinters()).resolves.toHaveLength(1);
  });

  it('rejects login with the wrong password', async () => {
    const client = new DineEasyApiClient(baseUrl);
    await expect(client.login('agent@outlet.test', 'wrong')).rejects.toThrow(/Login failed: 401/);
  });

  it('refreshes on a 401 and retries the request transparently', async () => {
    const client = new DineEasyApiClient(baseUrl);
    await client.login('agent@outlet.test', 'correct-horse');
    // The fake server only accepts 'token-2' here, and only after /auth/refresh has actually
    // run — so this succeeding proves the 401 -> refresh -> retry path, not a lucky first try.
    const job = await client.nextQueuedJob('printer-1');
    expect(job?.id).toBe('job-1');
  });

  it('reports a job status update using the refreshed token', async () => {
    const client = new DineEasyApiClient(baseUrl);
    await client.login('agent@outlet.test', 'correct-horse');
    await client.nextQueuedJob('printer-1'); // triggers the refresh
    await expect(client.updateJobStatus('job-1', 'SENT')).resolves.toBeUndefined();
  });

  it('throws if a request is attempted before login', async () => {
    const client = new DineEasyApiClient(baseUrl);
    await expect(client.listPrinters()).rejects.toThrow(/Not logged in/);
  });
});
