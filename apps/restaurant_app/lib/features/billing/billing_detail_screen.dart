import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_session.dart';
import '../../core/money/money.dart';
import '../../core/network/api_exception.dart';
import '../../core/rbac/permissions.dart';
import '../pos/data/pos_models.dart';
import '../pos/state/pos_providers.dart';
import 'state/billing_providers.dart';
import 'state/payments_providers.dart';

// Discount can only be applied before money has moved — matches
// OrdersService.applyDiscount's `isOrderFinanciallySettled` guard on the backend.
const _financiallySettledStatuses = {
  OrderStatus.paid,
  OrderStatus.completed,
  OrderStatus.cancelled,
  OrderStatus.refunded,
};

// A payment can only be refunded once it has actually succeeded (or was already partially
// refunded) — matches PaymentsService.initiateRefund's status guard on the backend.
const _refundablePaymentStatuses = {'SUCCEEDED', 'PARTIALLY_REFUNDED'};

/// One order's billing flow: SERVED → generate an invoice (`POST /orders/:id/invoice`) →
/// BILLED → record payment(s) (`POST /orders/:id/payments`, one or more, split payments
/// allowed) → the backend auto-advances to PAID then COMPLETED once the running total covers
/// the order's `total`. This screen never sets order/payment status directly — every action
/// here is a request the backend validates and drives the state machine from; this screen just
/// reflects whatever comes back (`orderByIdProvider`, re-fetched after every action).
class BillingDetailScreen extends ConsumerWidget {
  const BillingDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orderAsync = ref.watch(orderByIdProvider(orderId));

    return Scaffold(
      appBar: AppBar(title: const Text('Billing')),
      body: orderAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('$error', textAlign: TextAlign.center),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: () => ref.invalidate(orderByIdProvider(orderId)),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (order) => _BillingDetailBody(order: order),
      ),
    );
  }
}

class _BillingDetailBody extends ConsumerWidget {
  const _BillingDetailBody({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canBill = ref.watch(currentUserProvider)?.hasPermission(Permissions.billingCreate) ?? false;
    final canTakePayment =
        ref.watch(currentUserProvider)?.hasPermission(Permissions.paymentsTake) ?? false;
    final canDiscount = ref.watch(currentUserProvider)?.hasPermission(Permissions.ordersDiscount) ?? false;
    final canRefund = ref.watch(currentUserProvider)?.hasPermission(Permissions.paymentsRefund) ?? false;

    // `paymentsForOrderProvider` is the only source that carries each payment's `refunds` — see
    // its doc comment. While it's still loading (or if it errors — non-fatal, matches the
    // invoice-fetch fallback pattern above), fall back to `order.payments` so the existing
    // payments/paid-so-far display doesn't regress or flash empty; it just won't have refund
    // history until the richer fetch completes.
    final paymentsAsync = ref.watch(paymentsForOrderProvider(order.id));
    final payments = paymentsAsync.maybeWhen(data: (p) => p, orElse: () => order.payments);

    final paidSoFar = payments
        .where((p) => p.isSucceeded)
        .fold(Money.zero, (sum, p) => sum + Money.parse(p.amount));
    final total = Money.parse(order.total);
    final remaining = total - paidSoFar;

    final hasDiscount = order.discounts.isNotEmpty;
    final showDiscountCard = hasDiscount || !_financiallySettledStatuses.contains(order.status);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          order.tableName != null ? '${order.tableName} · ${order.orderNumber}' : 'Takeaway · ${order.orderNumber}',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 4),
        Text('Status: ${_statusLabel(order.status)}', style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 16),
        _OrderItemsCard(order: order),
        if (showDiscountCard) ...[
          const SizedBox(height: 16),
          _DiscountCard(
            orderId: order.id,
            discount: order.discounts.isNotEmpty ? order.discounts.first : null,
            canDiscount: canDiscount,
          ),
        ],
        const SizedBox(height: 16),
        if (order.status == OrderStatus.served)
          _GenerateBillCard(order: order, canBill: canBill)
        else
          _InvoiceCard(orderId: order.id),
        const SizedBox(height: 16),
        if (payments.isNotEmpty) _PaymentsCard(payments: payments, paidSoFar: paidSoFar),
        if (order.status == OrderStatus.billed && remaining > Money.zero) ...[
          const SizedBox(height: 16),
          _RecordPaymentCard(order: order, remaining: remaining, canTakePayment: canTakePayment),
        ],
        if (order.status == OrderStatus.paid || remaining <= Money.zero && payments.isNotEmpty) ...[
          const SizedBox(height: 16),
          Card(
            color: Theme.of(context).colorScheme.secondaryContainer,
            child: const Padding(
              padding: EdgeInsets.all(16),
              child: Row(
                children: [
                  Icon(Icons.check_circle_outline),
                  SizedBox(width: 12),
                  Expanded(child: Text('Fully paid.')),
                ],
              ),
            ),
          ),
        ],
        for (final payment in payments)
          if (_refundablePaymentStatuses.contains(payment.status) || payment.refunds.isNotEmpty) ...[
            const SizedBox(height: 16),
            _RefundCard(orderId: order.id, payment: payment, canRefund: canRefund),
          ],
      ],
    );
  }

  String _statusLabel(OrderStatus status) => switch (status) {
    OrderStatus.draft => 'Draft',
    OrderStatus.placed => 'Placed',
    OrderStatus.accepted => 'Accepted',
    OrderStatus.preparing => 'Preparing',
    OrderStatus.ready => 'Ready',
    OrderStatus.served => 'Served — ready to bill',
    OrderStatus.billed => 'Billed',
    OrderStatus.paid => 'Paid',
    OrderStatus.completed => 'Completed',
    OrderStatus.cancelled => 'Cancelled',
    OrderStatus.refunded => 'Refunded',
  };
}

class _OrderItemsCard extends StatelessWidget {
  const _OrderItemsCard({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final activeItems = order.items.where((i) => !i.isCancelled).toList();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Items', style: Theme.of(context).textTheme.titleMedium),
            const Divider(),
            for (final item in activeItems)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${item.quantity}× ${item.nameSnapshot}'
                        '${item.variantNameSnapshot != null ? ' (${item.variantNameSnapshot})' : ''}',
                      ),
                    ),
                    Text(Money.parse(item.total).format()),
                  ],
                ),
              ),
            const Divider(),
            _TotalsRow(label: 'Subtotal', amount: order.subtotal),
            if (Money.parse(order.discountTotal) > Money.zero)
              _TotalsRow(label: 'Discount', amount: '-${order.discountTotal}'),
            _TotalsRow(label: 'Tax', amount: order.taxTotal),
            if (Money.parse(order.serviceChargeTotal) > Money.zero)
              _TotalsRow(label: 'Service charge', amount: order.serviceChargeTotal),
            _TotalsRow(label: 'Total', amount: order.total, emphasize: true),
          ],
        ),
      ),
    );
  }
}

class _TotalsRow extends StatelessWidget {
  const _TotalsRow({required this.label, required this.amount, this.emphasize = false});

  final String label;
  final String amount;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    final style = emphasize
        ? Theme.of(context).textTheme.titleMedium
        : Theme.of(context).textTheme.bodyMedium;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: style),
          // `Money.parse` already handles a leading '-' (see its doc comment) and `format()`
          // already prepends the sign before the ₹, so a plain amount and a
          // caller-prefixed-with-'-' discount amount both format correctly here unchanged.
          Text(Money.parse(amount).format(), style: style),
        ],
      ),
    );
  }
}

class _GenerateBillCard extends ConsumerStatefulWidget {
  const _GenerateBillCard({required this.order, required this.canBill});

  final Order order;
  final bool canBill;

  @override
  ConsumerState<_GenerateBillCard> createState() => _GenerateBillCardState();
}

class _GenerateBillCardState extends ConsumerState<_GenerateBillCard> {
  bool _submitting = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.canBill
                  ? 'This order has been served and is ready to bill.'
                  : "This order is ready to bill — ask someone with billing permission to generate it.",
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            if (widget.canBill) ...[
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _submitting ? null : _generate,
                child: Text(_submitting ? 'Generating…' : 'Generate bill'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _generate() async {
    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref.read(billingRepositoryProvider).generateInvoice(widget.order.id);
      ref.invalidate(orderByIdProvider(widget.order.id));
      ref.invalidate(activeOrdersProvider);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class _InvoiceCard extends ConsumerWidget {
  const _InvoiceCard({required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invoiceAsync = ref.watch(invoiceForOrderProvider(orderId));
    final canView = ref.watch(currentUserProvider)?.hasPermission(Permissions.billingView) ?? false;

    return invoiceAsync.when(
      loading: () => const Card(
        child: Padding(padding: EdgeInsets.all(16), child: LinearProgressIndicator()),
      ),
      error: (error, _) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('$error'),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: () => ref.invalidate(invoiceForOrderProvider(orderId)),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
      data: (invoice) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Invoice ${invoice.invoiceNumber}', style: Theme.of(context).textTheme.titleMedium),
                  Text(Money.parse(invoice.total).format(), style: Theme.of(context).textTheme.titleMedium),
                ],
              ),
              if (invoice.taxes.isNotEmpty) ...[
                const Divider(),
                for (final tax in invoice.taxes)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('${tax.taxType} (${tax.ratePercent}%)'),
                        Text(Money.parse(tax.taxAmount).format()),
                      ],
                    ),
                  ),
              ],
              if (canView) ...[
                const Divider(),
                _PrintBillButton(invoiceId: invoice.id),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Re-sends the same receipt ticket that was already queued automatically the moment this
/// invoice was first generated (`BillingService.generateInvoice`) — for a printer that was
/// off/out of paper at that moment, or a second copy for the customer. Its own small widget
/// (rather than folded into `_InvoiceCard`) purely so its submitting/success state doesn't force
/// the whole invoice card — and the `invoiceForOrderProvider` watch driving it — to rebuild.
class _PrintBillButton extends ConsumerStatefulWidget {
  const _PrintBillButton({required this.invoiceId});

  final String invoiceId;

  @override
  ConsumerState<_PrintBillButton> createState() => _PrintBillButtonState();
}

class _PrintBillButtonState extends ConsumerState<_PrintBillButton> {
  bool _submitting = false;
  bool _printed = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_error != null) ...[
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ),
        ],
        OutlinedButton.icon(
          onPressed: _submitting ? null : _print,
          icon: const Icon(Icons.print_outlined),
          label: Text(_submitting ? 'Sending to printer…' : 'Print bill'),
        ),
        if (_printed) ...[
          const SizedBox(height: 4),
          Text(
            'Sent to the receipt printer.',
            style: TextStyle(color: Theme.of(context).colorScheme.tertiary, fontSize: 13),
          ),
        ],
      ],
    );
  }

  Future<void> _print() async {
    setState(() {
      _submitting = true;
      _error = null;
      _printed = false;
    });

    try {
      await ref.read(billingRepositoryProvider).printInvoice(widget.invoiceId);
      if (mounted) setState(() => _printed = true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class _PaymentsCard extends StatelessWidget {
  const _PaymentsCard({required this.payments, required this.paidSoFar});

  final List<PaymentSummary> payments;
  final Money paidSoFar;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Payments', style: Theme.of(context).textTheme.titleMedium),
            const Divider(),
            for (final payment in payments)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('${_methodLabel(payment.method)} · ${_paymentStatusLabel(payment.status)}'),
                    Text(Money.parse(payment.amount).format()),
                  ],
                ),
              ),
            const Divider(),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Paid so far', style: Theme.of(context).textTheme.titleSmall),
                Text(paidSoFar.format(), style: Theme.of(context).textTheme.titleSmall),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _methodLabel(PaymentMethod method) => switch (method) {
    PaymentMethod.cash => 'Cash',
    PaymentMethod.upi => 'UPI',
    PaymentMethod.card => 'Card',
    PaymentMethod.other => 'Other',
  };
}

String _paymentStatusLabel(String status) => switch (status) {
  'PENDING' => 'Pending',
  'PROCESSING' => 'Processing',
  'SUCCEEDED' => 'Succeeded',
  'FAILED' => 'Failed',
  'REFUNDED' => 'Refunded',
  'PARTIALLY_REFUNDED' => 'Partially refunded',
  _ => status,
};

class _RecordPaymentCard extends ConsumerStatefulWidget {
  const _RecordPaymentCard({required this.order, required this.remaining, required this.canTakePayment});

  final Order order;
  final Money remaining;
  final bool canTakePayment;

  @override
  ConsumerState<_RecordPaymentCard> createState() => _RecordPaymentCardState();
}

class _RecordPaymentCardState extends ConsumerState<_RecordPaymentCard> {
  PaymentMethod _method = PaymentMethod.cash;
  late final _amountController = TextEditingController(text: widget.remaining.toPlainString());
  bool _submitting = false;
  String? _error;

  @override
  void didUpdateWidget(covariant _RecordPaymentCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    // `_amountController`'s `late final` initializer only ever runs once, so without this the
    // prefilled amount would go stale after a split/partial payment — this widget is rebuilt
    // with a new (lower) `widget.remaining` from the parent, but the text field would still show
    // the balance from *before* that payment. Re-syncing here keeps "the whole remaining
    // balance" as the default for the next payment in a split, which is the common case this
    // field is meant to make frictionless. Only overwrites when `remaining` actually moved (a
    // real state change), not on every rebuild, so it doesn't fight a user actively editing it.
    if (oldWidget.remaining != widget.remaining) {
      _amountController.text = widget.remaining.toPlainString();
    }
  }

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.canTakePayment) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text(
            'Remaining balance: ${widget.remaining.format()} — ask someone with payment permission to collect it.',
          ),
        ),
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Record payment', style: Theme.of(context).textTheme.titleMedium),
            Text('Remaining: ${widget.remaining.format()}'),
            const SizedBox(height: 12),
            SegmentedButton<PaymentMethod>(
              segments: const [
                ButtonSegment(value: PaymentMethod.cash, label: Text('Cash')),
                ButtonSegment(value: PaymentMethod.upi, label: Text('UPI')),
                ButtonSegment(value: PaymentMethod.card, label: Text('Card')),
                ButtonSegment(value: PaymentMethod.other, label: Text('Other')),
              ],
              selected: {_method},
              onSelectionChanged: (selection) => setState(() => _method = selection.first),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _amountController,
              decoration: const InputDecoration(labelText: 'Amount', border: OutlineInputBorder()),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              // Not `FilteringTextInputFormatter.allow` with this anchored whole-string pattern
              // — `allow` keeps only the substrings that *match* the pattern, and since `^...$`
              // can only match the entire string or nothing, one keystroke past 2 decimal
              // places (no match at all) would wipe the whole field instead of rejecting just
              // that keystroke. `withFunction` reverting to `oldValue` on a non-match is the
              // correct "stop the invalid edit" behavior for a whole-string-shaped pattern.
              inputFormatters: [
                TextInputFormatter.withFunction((oldValue, newValue) {
                  if (newValue.text.isEmpty) return newValue;
                  return RegExp(r'^\d*\.?\d{0,2}$').hasMatch(newValue.text) ? newValue : oldValue;
                }),
              ],
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: Text(_submitting ? 'Recording…' : 'Record payment'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    final raw = _amountController.text.trim();
    final parsed = double.tryParse(raw);
    if (parsed == null || parsed <= 0) {
      setState(() => _error = 'Enter a valid amount.');
      return;
    }
    // Normalized through Money rather than sending `raw` straight to the repository — `raw`
    // can be a shape like "10." that the input formatter above allows mid-edit (it only
    // rejects a *third* decimal digit, not an incomplete-but-not-invalid string like this) but
    // that's a needless edge case to hand to `double.parse` on the way to the wire.
    final amount = Money.parse(raw);
    if (amount > widget.remaining) {
      setState(() => _error = 'Amount exceeds the remaining balance of ${widget.remaining.format()}.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref
          .read(billingRepositoryProvider)
          .recordPayment(widget.order.id, method: _method, amount: amount.toPlainString());
      ref.invalidate(orderByIdProvider(widget.order.id));
      ref.invalidate(activeOrdersProvider);
      ref.invalidate(paymentsForOrderProvider(widget.order.id));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

/// Shows the order's (at most one, in v1) applied discount, or lets a manager apply one.
/// `discount` is `null` until `OrdersRepository.applyDiscount` has been called — there is no
/// "remove/replace" endpoint, so once applied this card becomes permanently read-only for that
/// order (the apply form only ever renders when `discount` is still `null`). Mirrors
/// `apps/pos_web/src/features/billing/BillingDetailScreen.tsx`'s `DiscountCard`.
class _DiscountCard extends ConsumerStatefulWidget {
  const _DiscountCard({required this.orderId, required this.discount, required this.canDiscount});

  final String orderId;
  final DiscountApplication? discount;
  final bool canDiscount;

  @override
  ConsumerState<_DiscountCard> createState() => _DiscountCardState();
}

class _DiscountCardState extends ConsumerState<_DiscountCard> {
  String _type = 'PERCENTAGE';
  final _valueController = TextEditingController();
  final _reasonController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _valueController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final discount = widget.discount;
    if (discount != null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Discount', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(
                discount.type == 'PERCENTAGE'
                    ? '${discount.value}% off — ${Money.parse(discount.amount).format()} applied'
                    : '${Money.parse(discount.value).format()} off — ${Money.parse(discount.amount).format()} applied',
              ),
              if (discount.reason != null && discount.reason!.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  'Reason: ${discount.reason}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ],
          ),
        ),
      );
    }

    if (!widget.canDiscount) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text('No discount applied — ask someone with discount permission if one is needed.'),
        ),
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Discount', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'PERCENTAGE', label: Text('Percentage')),
                ButtonSegment(value: 'FIXED', label: Text('Fixed amount')),
              ],
              selected: {_type},
              onSelectionChanged: (selection) => setState(() => _type = selection.first),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _valueController,
              decoration: InputDecoration(
                labelText: _type == 'PERCENTAGE' ? 'Percent off' : 'Amount off',
                border: const OutlineInputBorder(),
              ),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [
                TextInputFormatter.withFunction((oldValue, newValue) {
                  if (newValue.text.isEmpty) return newValue;
                  return RegExp(r'^\d*\.?\d{0,2}$').hasMatch(newValue.text) ? newValue : oldValue;
                }),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _reasonController,
              decoration: const InputDecoration(labelText: 'Reason (optional)', border: OutlineInputBorder()),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: Text(_submitting ? 'Applying…' : 'Apply discount'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    final raw = _valueController.text.trim();
    final parsed = double.tryParse(raw);
    if (parsed == null || parsed <= 0) {
      setState(() => _error = 'Enter a valid amount.');
      return;
    }
    if (_type == 'PERCENTAGE' && parsed > 100) {
      setState(() => _error = 'A percentage discount cannot exceed 100%.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref
          .read(ordersRepositoryProvider)
          .applyDiscount(widget.orderId, type: _type, value: parsed, reason: _reasonController.text.trim());
      ref.invalidate(orderByIdProvider(widget.orderId));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

/// One card per refundable (or already-refunded) payment. A refund is two backend calls made
/// back-to-back here — `initiateRefund` then `approveRefund` — since v1 requires the same
/// `payments.refund` permission for both and has no separate approver role to hand off to (see
/// `PaymentsRepository`'s doc comment). **Approving any refund on a PAID/COMPLETED order's
/// payment flips the whole order to REFUNDED, even for a small partial amount** — this card says
/// so up front rather than letting that surprise someone after the fact. Mirrors
/// `apps/pos_web/src/features/billing/BillingDetailScreen.tsx`'s `RefundCard`.
class _RefundCard extends ConsumerStatefulWidget {
  const _RefundCard({required this.orderId, required this.payment, required this.canRefund});

  final String orderId;
  final PaymentSummary payment;
  final bool canRefund;

  @override
  ConsumerState<_RefundCard> createState() => _RefundCardState();
}

class _RefundCardState extends ConsumerState<_RefundCard> {
  final _amountController = TextEditingController();
  final _reasonController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _amountController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final payment = widget.payment;
    final refundedSoFar = payment.refunds
        .where((r) => r.isProcessed)
        .fold(Money.zero, (sum, r) => sum + Money.parse(r.amount));
    final refundable = Money.parse(payment.amount) - refundedSoFar;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Refund — ${_methodLabel(payment.method)} ${Money.parse(payment.amount).format()}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (payment.refunds.isNotEmpty) ...[
              const Divider(),
              for (final r in payment.refunds)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          '${r.isProcessed ? 'Refunded' : r.status == 'PENDING' ? 'Refund pending' : r.status}'
                          '${r.reason != null && r.reason!.isNotEmpty ? ' — ${r.reason}' : ''}',
                        ),
                      ),
                      Text(Money.parse(r.amount).format()),
                    ],
                  ),
                ),
              const Divider(),
            ],
            if (refundable <= Money.zero)
              const Text('Fully refunded.')
            else if (!widget.canRefund)
              Text('Refundable balance: ${refundable.format()} — ask someone with refund permission to process it.')
            else ...[
              Text(
                'Refundable balance: ${refundable.format()}. Processing a refund — even a partial one — marks '
                "this order's payment as refunded and, once the order is paid/completed, moves the whole order "
                "to Refunded. This can't be undone.",
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _amountController,
                decoration: const InputDecoration(labelText: 'Amount', border: OutlineInputBorder()),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  TextInputFormatter.withFunction((oldValue, newValue) {
                    if (newValue.text.isEmpty) return newValue;
                    return RegExp(r'^\d*\.?\d{0,2}$').hasMatch(newValue.text) ? newValue : oldValue;
                  }),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _reasonController,
                decoration: const InputDecoration(labelText: 'Reason (optional)', border: OutlineInputBorder()),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _submitting ? null : () => _submit(refundable),
                child: Text(_submitting ? 'Processing…' : 'Process refund'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _methodLabel(PaymentMethod method) => switch (method) {
    PaymentMethod.cash => 'Cash',
    PaymentMethod.upi => 'UPI',
    PaymentMethod.card => 'Card',
    PaymentMethod.other => 'Other',
  };

  Future<void> _submit(Money refundable) async {
    final raw = _amountController.text.trim();
    final parsed = double.tryParse(raw);
    if (parsed == null || parsed <= 0) {
      setState(() => _error = 'Enter a valid amount.');
      return;
    }
    final amount = Money.parse(raw);
    if (amount > refundable) {
      setState(() => _error = 'Amount exceeds the refundable balance of ${refundable.format()}.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final repo = ref.read(paymentsRepositoryProvider);
      final refund = await repo.initiateRefund(
        widget.payment.id,
        amount: amount.toPlainString(),
        reason: _reasonController.text.trim(),
      );
      await repo.approveRefund(refund.id);
      ref.invalidate(orderByIdProvider(widget.orderId));
      ref.invalidate(activeOrdersProvider);
      ref.invalidate(paymentsForOrderProvider(widget.orderId));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}
