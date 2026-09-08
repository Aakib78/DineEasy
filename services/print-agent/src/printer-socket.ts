import { Socket } from 'net';

export interface SendToPrinterOptions {
  host: string;
  port: number;
  /** Default 5s — covers a normal LAN round-trip many times over without hanging the poll
   * loop on a printer that's powered off or unplugged for an unbounded time. */
  timeoutMs?: number;
}

/**
 * Opens a raw TCP connection to a network ESC/POS printer — port 9100 is the near-universal
 * "raw 9100" convention this targets, per docs/printing.md's target design — writes the
 * rendered ticket bytes, and resolves once the printer has accepted them at the socket layer
 * (the write callback firing, not any application-level acknowledgment: most budget ESC/POS
 * printers never send one back over this port, which is exactly why docs/printing.md notes
 * ACKED may be unreachable for this transport and SENT is the practical terminal state).
 * Rejects on a connection error or on exceeding `timeoutMs` — either way the caller reports
 * the job FAILED and the backend's own retry-with-backoff (up to 3 attempts — see
 * `PrintersService.updateJobStatus`) takes it from there; this function itself never retries,
 * to keep retry policy in exactly one place.
 */
export function sendToPrinter(ticket: Buffer, options: SendToPrinterOptions): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () =>
      finish(new Error(`Timed out connecting/writing to ${options.host}:${options.port}`)),
    );
    socket.once('error', (err) => finish(err));

    socket.connect(options.port, options.host, () => {
      socket.write(ticket, (err) => {
        if (err) finish(err instanceof Error ? err : new Error(String(err)));
        else finish();
      });
    });
  });
}
