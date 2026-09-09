import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Decimal from 'decimal.js';
import type { Order, Invoice, PaymentMethod } from '@dineeasy/shared-types';
import { PERMISSIONS } from '@dineeasy/shared-types';
import { billingApi, ordersApi } from '../../lib/api/pos';
import { ApiError } from '../../lib/api/client';
import { formatMoney } from '../../lib/cart/price';
import { useAuth } from '../../lib/auth/AuthContext';

const STATUS_LABELS: Record<Order['status'], string> = {
  DRAFT: 'Draft',
  PLACED: 'Placed',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  SERVED: 'Served — ready to bill',
  BILLED: 'Billed',
  PAID: 'Paid',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  OTHER: 'Other',
};

/**
 * One order's billing flow: SERVED → generate an invoice (`POST /orders/:id/invoice`) →
 * BILLED → record payment(s) (`POST /orders/:id/payments`, split payments allowed) → the
 * backend auto-advances to PAID then COMPLETED once the running total covers the order's
 * `total`. This screen never sets order/payment status directly — every action here is a
 * request the backend validates and drives the state machine from; it just reflects whatever
 * comes back. Mirrors `apps/restaurant_app/lib/features/billing/billing_detail_screen.dart`.
 */
export function BillingDetailScreen() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printed, setPrinted] = useState(false);

  const canBill = hasPermission(PERMISSIONS.BILLING_CREATE);
  const canTakePayment = hasPermission(PERMISSIONS.PAYMENTS_TAKE);
  const canView = hasPermission(PERMISSIONS.BILLING_VIEW);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const fetched = await ordersApi.getById(orderId);
      setOrder(fetched);
      if (fetched.status !== 'SERVED') {
        try {
          setInvoice(await billingApi.getInvoiceByOrder(orderId));
        } catch {
          setInvoice(null);
        }
      }
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load this order.');
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleGenerate() {
    setGenerating(true);
    setActionError(null);
    try {
      // Generating already queues a print job on the backend (BillingService.generateInvoice)
      // the moment it creates the invoice — this call doesn't print anything a second time,
      // it just also shows the invoice on screen.
      setInvoice(await billingApi.generateInvoice(orderId));
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not generate the bill.');
    } finally {
      setGenerating(false);
    }
  }

  // Separate from `handleGenerate` — generating an invoice only ever prints once, automatically,
  // the moment it's first created (see that handler's comment above). This is the explicit
  // re-print: for a printer that was off/out of paper the first time, or a second copy for the
  // customer. Safe to press more than once; each press queues one more ticket.
  async function handlePrint() {
    if (!invoice) return;
    setPrinting(true);
    setActionError(null);
    setPrinted(false);
    try {
      await billingApi.printInvoice(invoice.id);
      setPrinted(true);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not send the bill to the printer.');
    } finally {
      setPrinting(false);
    }
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

  if (!order) return <p className="loading-text">Loading…</p>;

  const activeItems = order.items.filter((i) => !i.isCancelled);
  const paidSoFar = (order.payments ?? [])
    .filter((p) => p.status === 'SUCCEEDED')
    .reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
  const total = new Decimal(order.total);
  const remaining = total.minus(paidSoFar);

  return (
    <div className="billing-detail">
      <button className="text-button" onClick={() => navigate('/billing')}>
        ← Back to Billing
      </button>

      <h1>{order.table ? `${order.table.name} · ${order.orderNumber}` : `Takeaway · ${order.orderNumber}`}</h1>
      <p className="billing-detail__status">Status: {STATUS_LABELS[order.status]}</p>

      {actionError && <p className="error-banner">{actionError}</p>}

      <section className="billing-card">
        <h2>Items</h2>
        <div className="billing-card__divider" />
        {activeItems.map((item) => (
          <div className="totals-row" key={item.id}>
            <span>
              {item.quantity}× {item.nameSnapshot}
              {item.variantNameSnapshot ? ` (${item.variantNameSnapshot})` : ''}
            </span>
            <span>{formatMoney(item.total)}</span>
          </div>
        ))}
        <div className="billing-card__divider" />
        <div className="totals-row">
          <span>Subtotal</span>
          <span>{formatMoney(order.subtotal)}</span>
        </div>
        {new Decimal(order.discountTotal).greaterThan(0) && (
          <div className="totals-row">
            <span>Discount</span>
            <span>-{formatMoney(order.discountTotal)}</span>
          </div>
        )}
        <div className="totals-row">
          <span>Tax</span>
          <span>{formatMoney(order.taxTotal)}</span>
        </div>
        {new Decimal(order.serviceChargeTotal).greaterThan(0) && (
          <div className="totals-row">
            <span>Service charge</span>
            <span>{formatMoney(order.serviceChargeTotal)}</span>
          </div>
        )}
        <div className="totals-row totals-row--emphasize">
          <span>Total</span>
          <span>{formatMoney(order.total)}</span>
        </div>
      </section>

      {order.status === 'SERVED' ? (
        <section className="billing-card">
          <p>
            {canBill
              ? 'This order has been served and is ready to bill.'
              : "This order is ready to bill — ask someone with billing permission to generate it."}
          </p>
          {canBill && (
            <button className="primary-button" onClick={() => void handleGenerate()} disabled={generating}>
              {generating ? 'Generating…' : 'Generate bill'}
            </button>
          )}
        </section>
      ) : (
        invoice && (
          <section className="billing-card">
            <div className="totals-row totals-row--emphasize">
              <span>Invoice {invoice.invoiceNumber}</span>
              <span>{formatMoney(invoice.total)}</span>
            </div>
            {invoice.taxes.length > 0 && (
              <>
                <div className="billing-card__divider" />
                {invoice.taxes.map((tax, i) => (
                  <div className="totals-row" key={i}>
                    <span>
                      {tax.taxType} ({tax.ratePercent}%)
                    </span>
                    <span>{formatMoney(tax.taxAmount)}</span>
                  </div>
                ))}
              </>
            )}
            {canView && (
              <>
                <div className="billing-card__divider" />
                <button className="secondary-button" onClick={() => void handlePrint()} disabled={printing}>
                  {printing ? 'Sending to printer…' : 'Print bill'}
                </button>
                {printed && <p className="billing-detail__print-hint">Sent to the receipt printer.</p>}
              </>
            )}
          </section>
        )
      )}

      {(order.payments?.length ?? 0) > 0 && (
        <section className="billing-card">
          <h2>Payments</h2>
          <div className="billing-card__divider" />
          {order.payments!.map((payment) => (
            <div className="totals-row" key={payment.id}>
              <span>
                {METHOD_LABELS[payment.method]} · {payment.status}
              </span>
              <span>{formatMoney(payment.amount)}</span>
            </div>
          ))}
          <div className="billing-card__divider" />
          <div className="totals-row totals-row--emphasize">
            <span>Paid so far</span>
            <span>{formatMoney(paidSoFar)}</span>
          </div>
        </section>
      )}

      {order.status === 'BILLED' && remaining.greaterThan(0) && (
        <RecordPaymentCard
          orderId={order.id}
          remaining={remaining}
          canTakePayment={canTakePayment}
          onRecorded={() => void load()}
        />
      )}

      {(order.status === 'PAID' || (remaining.lessThanOrEqualTo(0) && (order.payments?.length ?? 0) > 0)) && (
        <section className="billing-card billing-card--success">
          <span>✓ Fully paid.</span>
        </section>
      )}
    </div>
  );
}

function RecordPaymentCard({
  orderId,
  remaining,
  canTakePayment,
  onRecorded,
}: {
  orderId: string;
  remaining: Decimal;
  canTakePayment: boolean;
  onRecorded: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-syncs the prefilled amount after a split payment lowers `remaining` — only when it
  // actually moved, so it doesn't fight someone actively editing the field.
  const [lastRemaining, setLastRemaining] = useState(remaining);
  if (!remaining.equals(lastRemaining)) {
    setLastRemaining(remaining);
    setAmount(remaining.toFixed(2));
  }

  if (!canTakePayment) {
    return (
      <section className="billing-card">
        <p>Remaining balance: {formatMoney(remaining)} — ask someone with payment permission to collect it.</p>
      </section>
    );
  }

  async function handleSubmit() {
    const trimmed = amount.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      setError('Enter a valid amount.');
      return;
    }
    const parsed = new Decimal(trimmed);
    if (parsed.lessThanOrEqualTo(0)) {
      setError('Enter a valid amount.');
      return;
    }
    if (parsed.greaterThan(remaining)) {
      setError(`Amount exceeds the remaining balance of ${formatMoney(remaining)}.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await billingApi.recordPayment(orderId, method, parsed.toFixed(2));
      onRecorded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record this payment.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="billing-card">
      <h2>Record payment</h2>
      <p>Remaining: {formatMoney(remaining)}</p>

      <div className="payment-method-row">
        {(['CASH', 'UPI', 'CARD', 'OTHER'] as PaymentMethod[]).map((m) => (
          <button
            key={m}
            className={`method-chip${method === m ? ' method-chip--active' : ''}`}
            onClick={() => setMethod(m)}
          >
            {METHOD_LABELS[m]}
          </button>
        ))}
      </div>

      <label className="field">
        Amount
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setAmount(v);
          }}
        />
      </label>

      {error && <p className="error-banner">{error}</p>}

      <button className="primary-button" onClick={() => void handleSubmit()} disabled={submitting}>
        {submitting ? 'Recording…' : 'Record payment'}
      </button>
    </section>
  );
}
