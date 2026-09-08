import { renderJobPayload } from './escpos';
import { PrinterJob, PrinterRecord } from './api-client';

/**
 * The orchestration layer: which printers to poll, what to do with a job once found, and how
 * failures at each stage get reported back — kept deliberately independent of the real HTTP
 * client and real TCP socket (both injected as narrow interfaces below) so this logic is
 * unit-testable with fully in-memory fakes. `api-client.spec.ts` and `printer-socket.spec.ts`
 * already exercise the real network behavior each of those pieces has; this file's tests
 * exercise the decisions — which printer gets skipped, what gets reported as FAILED and why,
 * that one printer's failure doesn't stop the others — at the right layer for each.
 */

export interface PollLoopClient {
  listPrinters(): Promise<PrinterRecord[]>;
  nextQueuedJob(printerId: string): Promise<PrinterJob | null>;
  updateJobStatus(jobId: string, status: 'SENT' | 'FAILED', error?: string): Promise<void>;
}

export type SendFn = (ticket: Buffer, printer: PrinterRecord) => Promise<void>;

export interface AgentLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const consoleLogger: AgentLogger = {
  log: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m) => console.error(m),
};

export interface PollLoopDeps {
  client: PollLoopClient;
  send: SendFn;
  logger?: AgentLogger;
}

/** A printer is only pollable if it's active, on the network transport, and fully addressed
 * — see docs/printing.md: USB is modeled in the schema for forward-compatibility only, no
 * driver is planned for v1, so this agent has nothing to do with a USB-configured printer. */
export function isPollable(printer: PrinterRecord): boolean {
  return (
    printer.isActive &&
    printer.connectionType === 'NETWORK' &&
    !!printer.ipAddress &&
    !!printer.port
  );
}

/** One full sweep: every pollable printer, at most one job each (the next cycle picks up
 * anything left queued — no reason to drain a printer's whole backlog before checking on the
 * others, which would starve them if one printer had a long queue). */
export async function pollOnce(deps: PollLoopDeps): Promise<void> {
  const logger = deps.logger ?? consoleLogger;
  let printers: PrinterRecord[];
  try {
    printers = await deps.client.listPrinters();
  } catch (err) {
    logger.error(`Failed to list printers: ${message(err)}`);
    return;
  }

  for (const printer of printers.filter(isPollable)) {
    await pollPrinter(printer, deps, logger);
  }
}

async function pollPrinter(
  printer: PrinterRecord,
  deps: PollLoopDeps,
  logger: AgentLogger,
): Promise<void> {
  let job: PrinterJob | null;
  try {
    job = await deps.client.nextQueuedJob(printer.id);
  } catch (err) {
    logger.warn(`Failed to poll ${printer.name} (${printer.id}) for jobs: ${message(err)}`);
    return;
  }
  if (!job) return;

  let ticket: Buffer;
  try {
    ({ ticket } = renderJobPayload(job.payload));
  } catch (err) {
    // A malformed payload will never become renderable by retrying it, so this is reported
    // FAILED directly rather than left QUEUED for the backend's retry-with-backoff to churn
    // on 3 times for nothing — see PrintersService.updateJobStatus for that retry policy,
    // which exists for transient printer/network failures, not permanently bad data.
    logger.error(`Job ${job.id} for ${printer.name} has an unrenderable payload: ${message(err)}`);
    await reportStatus(deps, logger, job.id, 'FAILED', `Unrenderable payload: ${message(err)}`);
    return;
  }

  try {
    await deps.send(ticket, printer);
    logger.log(`Sent job ${job.id} to ${printer.name} (${printer.ipAddress}:${printer.port})`);
    await reportStatus(deps, logger, job.id, 'SENT');
  } catch (err) {
    logger.warn(`Failed to send job ${job.id} to ${printer.name}: ${message(err)}`);
    await reportStatus(deps, logger, job.id, 'FAILED', message(err));
  }
}

/** Reporting the outcome back is itself best-effort: if the API is briefly unreachable right
 * after a successful print, the job is stuck QUEUED and gets printed again next cycle — a
 * duplicate ticket, not a lost one, which is the safer failure direction for a kitchen order
 * or a guest's bill (see docs/printing.md's framing: never *lose* a KOT/bill to a hiccup). */
async function reportStatus(
  deps: PollLoopDeps,
  logger: AgentLogger,
  jobId: string,
  status: 'SENT' | 'FAILED',
  error?: string,
): Promise<void> {
  try {
    await deps.client.updateJobStatus(jobId, status, error);
  } catch (err) {
    logger.error(`Failed to report job ${jobId} as ${status} back to the API: ${message(err)}`);
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Runs `pollOnce` every `intervalMs`, back-to-back (the next poll is scheduled only after the
 * current one finishes, so a slow cycle never overlaps itself). Returns a function that stops
 * future polling; a cycle already in flight when it's called is allowed to finish. */
export function startPollLoop(deps: PollLoopDeps, intervalMs: number): () => void {
  const logger = deps.logger ?? consoleLogger;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const tick = async () => {
    if (stopped) return;
    try {
      await pollOnce(deps);
    } catch (err) {
      // pollOnce already catches its own known failure points; this is a last-resort guard so
      // a truly unexpected error can never silently kill the loop.
      logger.error(`Unexpected error during poll cycle: ${message(err)}`);
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };

  void tick();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
