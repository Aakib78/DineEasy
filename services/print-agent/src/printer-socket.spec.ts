import { createServer, Server, AddressInfo } from 'net';
import { sendToPrinter } from './printer-socket';

/**
 * These tests stand in for real hardware with a real (local, loopback-only) TCP server — the
 * bytes-on-the-wire behavior is genuinely exercised, not mocked, which is the whole point:
 * `sendToPrinter` is exactly as "connected to a printer" as it'll ever be verified in this
 * sandbox (no physical ESC/POS printer to talk to — see docs/printing.md). What's intentionally
 * NOT covered here is the timeout path: reliably forcing a hung TCP handshake (as opposed to
 * an immediate refuse/accept, both of which the OS resolves near-instantly on loopback) needs
 * a network condition this sandboxed environment can't manufacture deterministically, so
 * `socket.setTimeout` — a well-established, independently-tested piece of Node's own `net`
 * module — is relied on rather than re-proven here.
 */
describe('sendToPrinter', () => {
  let server: Server;
  let port: number;
  let received: Buffer[];

  beforeEach((done) => {
    received = [];
    server = createServer((socket) => {
      socket.on('data', (chunk) => received.push(chunk));
    });
    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as AddressInfo).port;
      done();
    });
  });

  afterEach((done) => {
    server.close(() => done());
  });

  it('delivers the exact ticket bytes to a listening printer', async () => {
    const ticket = Buffer.from([0x1b, 0x40, 0x48, 0x69]); // ESC @ + "Hi"
    await sendToPrinter(ticket, { host: '127.0.0.1', port });
    // Give the server's 'data' handler a tick to run after the client-side write resolved.
    await new Promise((r) => setTimeout(r, 50));
    expect(Buffer.concat(received)).toEqual(ticket);
  });

  it('delivers a realistic multi-hundred-byte ticket intact, in one piece or reassembled', async () => {
    const ticket = Buffer.from('X'.repeat(600), 'ascii');
    await sendToPrinter(ticket, { host: '127.0.0.1', port });
    await new Promise((r) => setTimeout(r, 50));
    expect(Buffer.concat(received)).toEqual(ticket);
  });

  it('rejects when nothing is listening on the target port', async () => {
    // Port 1 is privileged and unbound in this sandbox; connecting to it on loopback gets an
    // immediate, deterministic ECONNREFUSED rather than a hang.
    await expect(sendToPrinter(Buffer.from('x'), { host: '127.0.0.1', port: 1 })).rejects.toThrow();
  });
});
