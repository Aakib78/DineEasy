import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_session.dart';
import '../data/reports_models.dart';
import '../data/reports_repository.dart';

final reportsRepositoryProvider = Provider<ReportsRepository>(
  (ref) => ReportsRepository(ref.watch(apiClientProvider)),
);

/// A small fixed set of presets rather than a free-form date picker — matches what a busy
/// outlet manager actually asks for at the register ("how did today go", "how was this week")
/// without the extra UI weight of a full calendar range picker in v1. `to` is always "now" for
/// every preset (including [today], so a report pulled mid-shift reflects sales up to this
/// moment, not the whole day) — only how far back `from` reaches changes.
enum ReportRangePreset { today, last7Days, last30Days }

extension ReportRangePresetLabel on ReportRangePreset {
  String get label => switch (this) {
        ReportRangePreset.today => 'Today',
        ReportRangePreset.last7Days => 'Last 7 days',
        ReportRangePreset.last30Days => 'Last 30 days',
      };
}

/// Resolves a preset to a concrete `(from, to)` pair. `to` is captured at call time (`.now()`)
/// rather than memoized anywhere, so each pull-to-refresh naturally advances the window instead
/// of replaying a stale "now" from whenever the preset was first selected.
class ReportRange {
  ReportRange({required this.from, required this.to});

  factory ReportRange.fromPreset(ReportRangePreset preset) {
    final to = DateTime.now();
    final from = switch (preset) {
      // Deliberately not `startOfDay` on the client — the backend already defaults a missing
      // `from` to the start of `to`'s day (`ReportsService.startOfDay`), so "today" is sent as
      // *no* `from` at all rather than this app reimplementing that midnight calculation and
      // risking a timezone mismatch with the server.
      ReportRangePreset.today => null,
      ReportRangePreset.last7Days => to.subtract(const Duration(days: 7)),
      ReportRangePreset.last30Days => to.subtract(const Duration(days: 30)),
    };
    return ReportRange(from: from, to: to);
  }

  final DateTime? from;
  final DateTime to;
}

/// Which preset the report screen is currently showing. Plain in-memory UI state, same as
/// `selectedKitchenStationIdProvider` — nothing here needs to survive an app restart.
final selectedReportRangePresetProvider =
    StateProvider.autoDispose<ReportRangePreset>((ref) => ReportRangePreset.today);

/// Deliberately **not** private: `ReportsScreen`'s pull-to-refresh explicitly invalidates this
/// alongside the three report providers below. Without that, this would stay cached (a plain
/// `Provider` only recomputes when a *watched* dependency changes, and its only dependency is
/// the preset, not the clock) and `ReportRange.fromPreset`'s "`to` is captured at call time"
/// doc comment would be false in practice — pulling to refresh would silently keep re-fetching
/// the exact same frozen `to` timestamp from whenever the preset was first selected, rather
/// than actually advancing the window to "now".
final resolvedReportRangeProvider = Provider.autoDispose<ReportRange>((ref) {
  final preset = ref.watch(selectedReportRangePresetProvider);
  return ReportRange.fromPreset(preset);
});

final salesSummaryProvider = FutureProvider.autoDispose<SalesSummary>((ref) {
  final range = ref.watch(resolvedReportRangeProvider);
  return ref.watch(reportsRepositoryProvider).getSalesSummary(from: range.from, to: range.to);
});

final topItemsProvider = FutureProvider.autoDispose<List<TopItem>>((ref) {
  final range = ref.watch(resolvedReportRangeProvider);
  return ref.watch(reportsRepositoryProvider).getTopItems(from: range.from, to: range.to);
});

final paymentBreakdownProvider = FutureProvider.autoDispose<List<PaymentBreakdownLine>>((ref) {
  final range = ref.watch(resolvedReportRangeProvider);
  return ref.watch(reportsRepositoryProvider).getPaymentBreakdown(from: range.from, to: range.to);
});
