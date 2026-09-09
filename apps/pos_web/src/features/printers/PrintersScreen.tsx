import { useCallback, useEffect, useState } from 'react';
import type { Printer, PrinterType, PrinterConnectionType } from '@dineeasy/shared-types';
import { PERMISSIONS } from '@dineeasy/shared-types';
import { printersApi } from '../../lib/api/pos';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/AuthContext';

/**
 * Registering a `Printer` row here is what makes `services/print-agent` see it and start
 * draining jobs for it — nothing prints without one existing. This screen was the missing
 * piece: `services/print-agent/README.md` always said "create a printer (Settings → Printers,
 * or `POST /printers`)" but no app actually had that screen, so setting one up meant a raw curl
 * call. `printers.manage` (Owner/Manager only) gates the whole thing — see `PrintersController`.
 *
 * Both `NETWORK` (IP/port) and `USB` are real, working connection types as of
 * `services/print-agent`'s USB support (`src/printer-usb.ts`, using the standard USB Printer
 * class — vendor-independent, no Epson-specific driver needed). Either way, this screen only
 * ever registers a `Printer` row — it never talks to hardware itself, staff apps never do; see
 * `docs/printing.md`. A `USB` printer must be plugged into whatever machine runs
 * `services/print-agent` (not a phone — a client app can't drive USB hardware on its own, this
 * process on a LAN computer is what does).
 */
export function PrintersScreen() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.PRINTERS_MANAGE);

  const [printers, setPrinters] = useState<Printer[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setPrinters(await printersApi.list());
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load printers.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canManage) {
    return (
      <div className="empty-state">
        <p>Ask an Owner or Manager to configure printers.</p>
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

  if (!printers) return <p className="loading-text">Loading…</p>;

  return (
    <div className="printers-screen">
      <h1>Printers</h1>
      <p className="printers-screen__hint">
        A printer registered here is what <code>services/print-agent</code> polls for jobs — it
        doesn't print anything by itself. The agent needs to be running on a computer with
        network access to the printer's IP address; see <code>services/print-agent/README.md</code>.
      </p>

      {printers.length === 0 ? (
        <p className="empty-state__hint">No printers configured for this outlet yet.</p>
      ) : (
        <section className="billing-card">
          {printers.map((printer, i) => (
            <div key={printer.id}>
              {i > 0 && <div className="billing-card__divider" />}
              <div className="totals-row">
                <span>
                  {printer.name} · {printer.type === 'KITCHEN' ? 'Kitchen' : 'Receipt'}
                  {!printer.isActive ? ' (inactive)' : ''}
                </span>
                <span>
                  {printer.connectionType === 'NETWORK'
                    ? `${printer.ipAddress ?? '?'}:${printer.port ?? 9100}`
                    : 'USB'}
                </span>
              </div>
            </div>
          ))}
        </section>
      )}

      <AddPrinterCard onCreated={() => void load()} />
    </div>
  );
}

function AddPrinterCard({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<PrinterType>('RECEIPT');
  const [connectionType, setConnectionType] = useState<PrinterConnectionType>('NETWORK');
  const [ipAddress, setIpAddress] = useState('');
  const [port, setPort] = useState('9100');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Enter a name for this printer.');
      return;
    }
    if (connectionType === 'NETWORK' && !ipAddress.trim()) {
      setError('Enter the printer’s IP address — find it from the printer’s self-test/status page.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await printersApi.create({
        name: trimmedName,
        type,
        connectionType,
        ...(connectionType === 'NETWORK' ? { ipAddress: ipAddress.trim(), port: Number(port) || 9100 } : {}),
      });
      setName('');
      setIpAddress('');
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add this printer.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="billing-card">
      <h2>Add a printer</h2>

      <label className="field">
        Name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Counter receipt printer"
        />
      </label>

      <div className="payment-method-row">
        <button
          className={`method-chip${type === 'RECEIPT' ? ' method-chip--active' : ''}`}
          onClick={() => setType('RECEIPT')}
        >
          Receipt
        </button>
        <button
          className={`method-chip${type === 'KITCHEN' ? ' method-chip--active' : ''}`}
          onClick={() => setType('KITCHEN')}
        >
          Kitchen
        </button>
      </div>

      <div className="payment-method-row">
        <button
          className={`method-chip${connectionType === 'NETWORK' ? ' method-chip--active' : ''}`}
          onClick={() => setConnectionType('NETWORK')}
        >
          Network (Wi-Fi/Ethernet)
        </button>
        <button
          className={`method-chip${connectionType === 'USB' ? ' method-chip--active' : ''}`}
          onClick={() => setConnectionType('USB')}
        >
          USB
        </button>
      </div>

      {connectionType === 'NETWORK' ? (
        <div className="printers-screen__network-fields">
          <label className="field">
            IP address
            <input
              type="text"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              placeholder="192.168.1.60"
              inputMode="decimal"
            />
          </label>
          <label className="field">
            Port
            <input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              inputMode="numeric"
            />
          </label>
        </div>
      ) : (
        <p className="printers-screen__hint">
          The printer must be plugged into whichever computer runs <code>services/print-agent</code>{' '}
          — not a phone or tablet. No specific device needs to be picked here: the agent finds the
          first connected USB printer automatically. See its README's "Setting it up (USB)" section.
        </p>
      )}

      {error && <p className="error-banner">{error}</p>}

      <button className="primary-button" onClick={() => void handleSubmit()} disabled={submitting}>
        {submitting ? 'Adding…' : 'Add printer'}
      </button>
    </section>
  );
}
