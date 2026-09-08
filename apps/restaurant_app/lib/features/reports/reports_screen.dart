import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/money/money.dart';
import 'data/reports_models.dart';
import 'state/reports_providers.dart';

/// Read-only sales reporting for the outlet — no mutating actions anywhere on this screen, so
/// (unlike POS/Tables/Kitchen/Billing) there's no per-control RBAC gating to apply here: the
/// nav shell (`home_shell.dart`) already hides the whole "Reports" destination from anyone
/// without `reports.view`, and everything below that point is safe for any viewer to see.
class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preset = ref.watch(selectedReportRangePresetProvider);

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          // Invalidating the range first is what actually matters — see
          // `resolvedReportRangeProvider`'s doc comment: without it, "now" would stay frozen at
          // whenever the preset was first selected instead of advancing on every pull-to-refresh.
          // The other three would in fact cascade-invalidate automatically as a result (they all
          // `ref.watch` it), but invalidating them explicitly too keeps this call site honest
          // about exactly what's being refreshed rather than relying on that cascade implicitly.
          ref.invalidate(resolvedReportRangeProvider);
          ref.invalidate(salesSummaryProvider);
          ref.invalidate(topItemsProvider);
          ref.invalidate(paymentBreakdownProvider);
          await Future.wait<void>([
            ref.read(salesSummaryProvider.future).then((_) {}),
            ref.read(topItemsProvider.future).then((_) {}),
            ref.read(paymentBreakdownProvider.future).then((_) {}),
          ]);
        },
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Center(
              child: SegmentedButton<ReportRangePreset>(
                segments: [
                  for (final p in ReportRangePreset.values)
                    ButtonSegment(value: p, label: Text(p.label)),
                ],
                selected: {preset},
                onSelectionChanged: (selection) {
                  ref.read(selectedReportRangePresetProvider.notifier).state = selection.first;
                },
              ),
            ),
            const SizedBox(height: 12),
            const _SalesSummarySection(),
            const SizedBox(height: 12),
            const _TopItemsSection(),
            const SizedBox(height: 12),
            const _PaymentBreakdownSection(),
          ],
        ),
      ),
    );
  }
}

/// Shared shell for each report section: a titled card that renders its own loading/error/data
/// states independently, so a slow or failed `top-items` query never blocks the sales summary
/// (which usually returns first, being a single aggregate row) from showing.
class _ReportCard extends StatelessWidget {
  const _ReportCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }
}

class _AsyncSectionError extends StatelessWidget {
  const _AsyncSectionError({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('$error'),
        const SizedBox(height: 8),
        OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
      ],
    );
  }
}

class _SalesSummarySection extends ConsumerWidget {
  const _SalesSummarySection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summaryAsync = ref.watch(salesSummaryProvider);

    return _ReportCard(
      title: 'Sales summary',
      child: summaryAsync.when(
        loading: () => const Center(child: Padding(
          padding: EdgeInsets.all(16),
          child: CircularProgressIndicator(),
        )),
        error: (error, _) => _AsyncSectionError(
          error: error,
          onRetry: () => ref.invalidate(salesSummaryProvider),
        ),
        data: (summary) => _SalesSummaryBody(summary: summary),
      ),
    );
  }
}

class _SalesSummaryBody extends StatelessWidget {
  const _SalesSummaryBody({required this.summary});

  final SalesSummary summary;

  @override
  Widget build(BuildContext context) {
    final rangeLabel =
        '${DateFormat.yMMMd().add_jm().format(summary.from.toLocal())} '
        '– ${DateFormat.yMMMd().add_jm().format(summary.to.toLocal())}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          rangeLabel,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.outline,
              ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 24,
          runSpacing: 16,
          children: [
            _StatTile(label: 'Revenue', value: Money.parse(summary.revenue).format()),
            _StatTile(label: 'Orders', value: '${summary.orderCount}'),
            _StatTile(
              label: 'Avg. order value',
              value: Money.parse(summary.averageOrderValue).format(),
            ),
            _StatTile(label: 'Dine-in', value: '${summary.dineInCount}'),
            _StatTile(label: 'Takeaway', value: '${summary.takeawayCount}'),
          ],
        ),
        const Divider(height: 32),
        _TotalsLine(label: 'Subtotal', amount: summary.subtotal),
        // Discount/service-charge rows are omitted entirely when zero (e.g. an outlet with no
        // service charge configured, or a range with no discounted orders) rather than shown as
        // a meaningless "₹0.00" line — same convention as billing_detail_screen.dart's
        // `_TotalsRow` list, which this mirrors.
        if (Money.parse(summary.discountTotal) > Money.zero)
          _TotalsLine(label: 'Discounts', amount: '-${summary.discountTotal}'),
        _TotalsLine(label: 'Tax', amount: summary.taxTotal),
        if (Money.parse(summary.serviceChargeTotal) > Money.zero)
          _TotalsLine(label: 'Service charge', amount: summary.serviceChargeTotal),
        const Divider(),
        _TotalsLine(label: 'Revenue', amount: summary.revenue, emphasize: true),
      ],
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.outline,
              ),
        ),
        Text(value, style: Theme.of(context).textTheme.titleLarge),
      ],
    );
  }
}

/// Mirrors `billing_detail_screen.dart`'s `_TotalsRow` exactly: `Money.parse` already handles a
/// leading '-' and `format()` already prepends the sign, so a caller that wants a signed
/// (discount) line just passes an already-'-'-prefixed `amount` string rather than this widget
/// tracking a separate `negative` flag — see this project's docs for why that duplicate
/// sign-handling was removed as dead complexity when it first came up in the Billing slice.
class _TotalsLine extends StatelessWidget {
  const _TotalsLine({required this.label, required this.amount, this.emphasize = false});

  final String label;
  final String amount;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    final style = emphasize
        ? Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)
        : Theme.of(context).textTheme.bodyMedium;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: style),
          Text(Money.parse(amount).format(), style: style),
        ],
      ),
    );
  }
}

class _TopItemsSection extends ConsumerWidget {
  const _TopItemsSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemsAsync = ref.watch(topItemsProvider);

    return _ReportCard(
      title: 'Top items',
      child: itemsAsync.when(
        loading: () => const Center(child: Padding(
          padding: EdgeInsets.all(16),
          child: CircularProgressIndicator(),
        )),
        error: (error, _) => _AsyncSectionError(
          error: error,
          onRetry: () => ref.invalidate(topItemsProvider),
        ),
        data: (items) {
          if (items.isEmpty) {
            return const Text('No items sold in this range.');
          }
          return Column(
            children: [
              for (var i = 0; i < items.length; i++)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 24,
                        child: Text('${i + 1}', style: Theme.of(context).textTheme.bodySmall),
                      ),
                      Expanded(child: Text(items[i].name)),
                      Text(
                        '${items[i].quantitySold} sold',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      const SizedBox(width: 12),
                      SizedBox(
                        width: 90,
                        child: Text(
                          Money.parse(items[i].revenue).format(),
                          textAlign: TextAlign.end,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _PaymentBreakdownSection extends ConsumerWidget {
  const _PaymentBreakdownSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final breakdownAsync = ref.watch(paymentBreakdownProvider);

    return _ReportCard(
      title: 'Payment breakdown',
      child: breakdownAsync.when(
        loading: () => const Center(child: Padding(
          padding: EdgeInsets.all(16),
          child: CircularProgressIndicator(),
        )),
        error: (error, _) => _AsyncSectionError(
          error: error,
          onRetry: () => ref.invalidate(paymentBreakdownProvider),
        ),
        data: (lines) {
          if (lines.isEmpty) {
            return const Text('No payments recorded in this range.');
          }
          return Column(
            children: [
              for (final line in lines)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(_methodLabel(line.method)),
                      Text('${line.count} payments', style: Theme.of(context).textTheme.bodySmall),
                      Text(Money.parse(line.amount).format()),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  /// Title-cases the backend's raw uppercase method string ('CASH' -> 'Cash') for display.
  /// Deliberately not routed through `pos_models.dart`'s `PaymentMethod` enum — an unrecognized
  /// future method value (e.g. a wallet provider added server-side) should still render
  /// gracefully here rather than throwing the `ArgumentError` that enum's `fromJson` would.
  String _methodLabel(String raw) {
    if (raw.isEmpty) return raw;
    return raw[0].toUpperCase() + raw.substring(1).toLowerCase();
  }
}
