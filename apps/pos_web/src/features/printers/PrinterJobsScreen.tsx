import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Printer, PrinterJob, PrinterJobStatus } from '@dineeasy/shared-types';
import { PERMISSIONS } from '@dineeasy/shared-types';
import { printersApi } from '../../lib/api/pos';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/AuthContext';

const STATUS_LABELS: Record<PrinterJobStatus, string> = {
  QUEUED: 'Queued',
  SENT: 'Sent',
  FAILED: 'Failed',
  ACKED: 'Acked',
};

// A QUEUED job normally clears within a poll cycle or two — services/print-agent's default poll
// interval is 5s (PRINT_AGENT_POLL_INTERVAL_MS). One still QUEUED after this long almost always
// means the agent isn't running or can't reach this printer, not that it's mid-print — that
// never produces a FAILED row (see PrinterJob's doc comment), so this is the only signal for it.
const STALE_QUEUED_MS = 60_000;

function relativeTime(iso: string): string {
  const elapsedMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** What was this job printing? `payload` is untyped on the backend (see `PrinterJob`'s doc
 * comment in `@dineeasy/shared-types`) — this reads it defensively, degrading to a generic label
 * rather than throwing if a field is missing or shaped unexpectedly. */
function describeJob(payload: Record<string, unknown>): string {
  const orderNumber = typeof payload.orderNumber === 'string' ? payload.orderNumber : null;
  const kotNumber = typeof payload.kotNumber === 'string' ? payload.kotNumber : null;
  const invoiceNumber = typeof payload.invoiceNumber === 'string' ? payload.invoiceNumber : null;

  if (kotNumber) return `KOT ${kotNumber}${orderNumber ? ` · Order ${orderNumber}` : ''}`;
  if (invoiceNumber) return `Receipt ${invoiceNumber}${orderNumber ? ` · Order ${orderNumber}` : ''}`;
  if (orderNumber) return `Order ${orderNumber}`;
  return 'Print job';
}

/**
 * Per-printer job history/health — the read side of `PrintersController`'s `GET /:id/jobs`
 * (`PrintersService.listJobs`), which existed with no UI consumer until now (see
 * `docs/printing.md`'s "Operator visibility" section). Reached from `PrintersScreen` by tapping
 * a printer row. Last 50 jobs, newest first, no pagination/filter on the endpoint — this screen
 * computes queue depth / recent-failure counts client-side over that fixed window.
 *
 * `printers.manage`-gated, same as printer registration — there's no separate view-only
 * permission for this in v1.
 */
export function PrinterJobsScreen() {
  const { printerId = '' } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.PRINTERS_MANAGE);

  const [printer, setPrinter] = useState<Printer | null>(null);
  const [jobs, setJobs] = useState<PrinterJob[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      // No GET /printers/:id — list is the only read for a single printer's own fields, so this
      // finds it by id from the outlet's full list rather than adding a new backend endpoint for
      // a name/type header this screen doesn't strictly need to function.
      const [printers, printerJobs] = await Promise.all([
        printersApi.list(),
        printersApi.jobs(printerId),
      ]);
      setPrinter(printers.find((p) => p.id === printerId) ?? null);
      setJobs(printerJobs);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load this printer’s jobs.');
    }
  }, [printerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canManage) {
    return (
      <div className="empty-state">
        <p>Ask an Owner or Manager to view printer job history.</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="empty-state">
        <p>{loadError}</p>
        <button className="secondary-button" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  if (!jobs) return <p className="loading-text">Loading…</p>;

  const queued = jobs.filter((j) => j.status === 'QUEUED');
  const failed = jobs.filter((j) => j.status === 'FAILED');
  const oldestQueuedMs = queued.length
    ? Math.min(...queued.map((j) => Date.now() - new Date(j.createdAt).getTime()))
    : 0;
  const staleQueue = oldestQueuedMs >= STALE_QUEUED_MS;

  return (
    <div className="printers-screen">
      <button className="text-button" onClick={() => navigate('/printers')}>
        ← Back to Printers
      </button>

      <h1>{printer ? printer.name : 'Printer'} — job history</h1>
      <p className="printers-screen__hint">
        The last {jobs.length} job{jobs.length === 1 ? '' : 's'} sent to this printer, newest first.
        This is a read-only view of what <code>services/print-agent</code> has attempted — it
        doesn't retry or cancel anything from here.
      </p>

      <div className="printer-jobs-screen__summary">
        <div className="printer-jobs-screen__stat">
          <div className="printer-jobs-screen__stat-value">{queued.length}</div>
          <div className="printer-jobs-screen__stat-label">Queued</div>
        </div>
        <div className="printer-jobs-screen__stat">
          <div className="printer-jobs-screen__stat-value">{failed.length}</div>
          <div className="printer-jobs-screen__stat-label">Failed</div>
        </div>
      </div>

      {staleQueue && (
        <p className="error-banner">
          A job has been queued for a while with nothing sending it — the print agent for this
          printer may not be running, or can’t reach it. Check <code>services/print-agent</code>
          on the machine it’s configured on.
        </p>
      )}

      {jobs.length === 0 ? (
        <p className="empty-state__hint">No jobs have been sent to this printer yet.</p>
      ) : (
        <section className="billing-card">
          {jobs.map((job, i) => {
            const isStaleQueued =
              job.status === 'QUEUED' && Date.now() - new Date(job.createdAt).getTime() >= STALE_QUEUED_MS;
            return (
              <div key={job.id}>
                {i > 0 && <div className="billing-card__divider" />}
                <div className="printer-jobs-screen__job-row">
                  <div>
                    <div>{describeJob(job.payload)}</div>
                    <div className="printer-jobs-screen__job-meta">
                      {relativeTime(job.createdAt)}
                      {job.attempts > 0 ? ` · ${job.attempts} attempt${job.attempts === 1 ? '' : 's'}` : ''}
                    </div>
                    {job.lastError && <div className="printer-jobs-screen__job-error">{job.lastError}</div>}
                    {isStaleQueued && (
                      <div className="printer-jobs-screen__stale-warning">Stuck — no response from the agent yet</div>
                    )}
                  </div>
                  <span className={`printer-job-status printer-job-status--${job.status.toLowerCase()}`}>
                    {STATUS_LABELS[job.status]}
                  </span>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
