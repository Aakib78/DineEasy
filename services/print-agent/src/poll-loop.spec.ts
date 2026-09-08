import {
  pollOnce,
  startPollLoop,
  isPollable,
  PollLoopClient,
  SendFn,
  AgentLogger,
} from './poll-loop';
import { PrinterJob, PrinterRecord } from './api-client';

function printer(overrides: Partial<PrinterRecord> = {}): PrinterRecord {
  return {
    id: 'printer-1',
    name: 'Kitchen 1',
    type: 'KITCHEN',
    connectionType: 'NETWORK',
    ipAddress: '192.168.1.50',
    port: 9100,
    isActive: true,
    ...overrides,
  };
}

function kotJob(overrides: Partial<PrinterJob> = {}): PrinterJob {
  return {
    id: 'job-1',
    printerId: 'printer-1',
    status: 'QUEUED',
    attempts: 0,
    payload: { kotNumber: 'K-1', orderNumber: 'O-1', isModification: false, items: [] },
    ...overrides,
  };
}

function silentLogger(): AgentLogger {
  return { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('isPollable', () => {
  it('accepts an active, fully-addressed NETWORK printer', () => {
    expect(isPollable(printer())).toBe(true);
  });

  it('rejects an inactive printer', () => {
    expect(isPollable(printer({ isActive: false }))).toBe(false);
  });

  it('rejects a USB printer — no driver planned for v1', () => {
    expect(isPollable(printer({ connectionType: 'USB' }))).toBe(false);
  });

  it('rejects a NETWORK printer missing an IP or port', () => {
    expect(isPollable(printer({ ipAddress: null }))).toBe(false);
    expect(isPollable(printer({ port: null }))).toBe(false);
  });
});

describe('pollOnce', () => {
  it('sends a rendered ticket and reports SENT when a job is queued', async () => {
    const sent: { ticket: Buffer; printer: PrinterRecord }[] = [];
    const statusUpdates: { jobId: string; status: string; error?: string }[] = [];

    const client: PollLoopClient = {
      listPrinters: async () => [printer()],
      nextQueuedJob: async () => kotJob(),
      updateJobStatus: async (jobId, status, error) => {
        statusUpdates.push({ jobId, status, error });
      },
    };
    const send: SendFn = async (ticket, p) => {
      sent.push({ ticket, printer: p });
    };

    await pollOnce({ client, send, logger: silentLogger() });

    expect(sent).toHaveLength(1);
    expect(sent[0].printer.id).toBe('printer-1');
    expect(sent[0].ticket.length).toBeGreaterThan(0);
    expect(statusUpdates).toEqual([{ jobId: 'job-1', status: 'SENT', error: undefined }]);
  });

  it('does nothing for a printer with no queued job', async () => {
    const send = jest.fn<ReturnType<SendFn>, Parameters<SendFn>>();
    const updateJobStatus = jest.fn();
    const client: PollLoopClient = {
      listPrinters: async () => [printer()],
      nextQueuedJob: async () => null,
      updateJobStatus,
    };

    await pollOnce({ client, send, logger: silentLogger() });

    expect(send).not.toHaveBeenCalled();
    expect(updateJobStatus).not.toHaveBeenCalled();
  });

  it('skips printers that are not pollable without ever calling nextQueuedJob for them', async () => {
    const nextQueuedJob = jest.fn(async () => null);
    const client: PollLoopClient = {
      listPrinters: async () => [
        printer({ isActive: false }),
        printer({ id: 'p2', connectionType: 'USB' }),
      ],
      nextQueuedJob,
      updateJobStatus: jest.fn(),
    };

    await pollOnce({ client, send: jest.fn(), logger: silentLogger() });

    expect(nextQueuedJob).not.toHaveBeenCalled();
  });

  it('reports FAILED with a clear reason when the payload cannot be rendered, and never calls send', async () => {
    const send = jest.fn<ReturnType<SendFn>, Parameters<SendFn>>();
    const statusUpdates: { jobId: string; status: string; error?: string }[] = [];
    const client: PollLoopClient = {
      listPrinters: async () => [printer()],
      nextQueuedJob: async () => kotJob({ payload: { nonsense: true } }),
      updateJobStatus: async (jobId, status, error) => {
        statusUpdates.push({ jobId, status, error });
      },
    };

    await pollOnce({ client, send, logger: silentLogger() });

    expect(send).not.toHaveBeenCalled();
    expect(statusUpdates).toHaveLength(1);
    expect(statusUpdates[0].status).toBe('FAILED');
    expect(statusUpdates[0].error).toMatch(/Unrenderable payload/);
  });

  it('reports FAILED with the send error when the printer is unreachable', async () => {
    const statusUpdates: { jobId: string; status: string; error?: string }[] = [];
    const client: PollLoopClient = {
      listPrinters: async () => [printer()],
      nextQueuedJob: async () => kotJob(),
      updateJobStatus: async (jobId, status, error) => {
        statusUpdates.push({ jobId, status, error });
      },
    };
    const send: SendFn = async () => {
      throw new Error('ECONNREFUSED 192.168.1.50:9100');
    };

    await pollOnce({ client, send, logger: silentLogger() });

    expect(statusUpdates).toEqual([
      { jobId: 'job-1', status: 'FAILED', error: 'ECONNREFUSED 192.168.1.50:9100' },
    ]);
  });

  it('keeps polling remaining printers even if one printer poll throws', async () => {
    const polled: string[] = [];
    const client: PollLoopClient = {
      listPrinters: async () => [printer({ id: 'p1' }), printer({ id: 'p2' })],
      nextQueuedJob: async (printerId) => {
        polled.push(printerId);
        if (printerId === 'p1') throw new Error('network blip');
        return null;
      },
      updateJobStatus: jest.fn(),
    };

    await pollOnce({ client, send: jest.fn(), logger: silentLogger() });

    expect(polled).toEqual(['p1', 'p2']);
  });

  it('does not throw if listPrinters itself fails — logs and returns instead', async () => {
    const client: PollLoopClient = {
      listPrinters: async () => {
        throw new Error('API unreachable');
      },
      nextQueuedJob: jest.fn(),
      updateJobStatus: jest.fn(),
    };

    await expect(
      pollOnce({ client, send: jest.fn(), logger: silentLogger() }),
    ).resolves.toBeUndefined();
  });

  it('swallows an error reporting status back — a print that succeeded is not lost either way', async () => {
    const send: SendFn = async () => {};
    const client: PollLoopClient = {
      listPrinters: async () => [printer()],
      nextQueuedJob: async () => kotJob(),
      updateJobStatus: async () => {
        throw new Error('API briefly unreachable');
      },
    };

    await expect(pollOnce({ client, send, logger: silentLogger() })).resolves.toBeUndefined();
  });
});

describe('startPollLoop', () => {
  it('polls repeatedly on the given interval until stopped', async () => {
    let callCount = 0;
    const client: PollLoopClient = {
      listPrinters: async () => {
        callCount++;
        return [];
      },
      nextQueuedJob: jest.fn(),
      updateJobStatus: jest.fn(),
    };

    const stop = startPollLoop({ client, send: jest.fn(), logger: silentLogger() }, 15);

    await new Promise((r) => setTimeout(r, 70));
    stop();
    const countAtStop = callCount;
    expect(countAtStop).toBeGreaterThanOrEqual(2);

    await new Promise((r) => setTimeout(r, 60));
    expect(callCount).toBe(countAtStop);
  });
});
