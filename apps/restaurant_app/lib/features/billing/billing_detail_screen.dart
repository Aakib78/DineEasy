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

    final paidSoFar = order.payments
        .where((p) => p.isSucceeded)
        .fold(Money.zero, (sum, p) => sum + Money.parse(p.amount));
    final total = Money.parse(order.total);
    final remaining = total - paidSoFar;

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
        const SizedBox(height: 16),
        if (order.status == OrderStatus.served)
          _GenerateBillCard(order: order, canBill: canBill)
        else
          _InvoiceCard(orderId: order.id),
        const SizedBox(height: 16),
        if (order.payments.isNotEmpty) _PaymentsCard(order: order, paidSoFar: paidSoFar),
        if (order.status == OrderStatus.billed && remaining > Money.zero) ...[
          const SizedBox(height: 16),
          _RecordPaymentCard(order: order, remaining: remaining, canTakePayment: canTakePayment),
        ],
        if (order.status == OrderStatus.paid || remaining <= Money.zero && order.payments.isNotEmpty) ...[
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
  const _PaymentsCard({required this.order, required this.paidSoFar});

  final Order order;
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
            for (final payment in order.payments)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('${_methodLabel(payment.method)} · ${payment.status}'),
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
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}
