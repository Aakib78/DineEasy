import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import 'data/printers_models.dart';
import 'state/printers_providers.dart';

// A QUEUED job normally clears within a poll cycle or two — services/print-agent's default poll
// interval is 5s (PRINT_AGENT_POLL_INTERVAL_MS). One still QUEUED after this long almost always
// means the agent isn't running or can't reach this printer, not that it's mid-print — that
// never produces a FAILED row (see PrinterJob's doc comment), so this is the only signal for it.
const _staleQueuedThreshold = Duration(seconds: 60);

String _statusLabel(PrinterJobStatus status) => switch (status) {
  PrinterJobStatus.queued => 'Queued',
  PrinterJobStatus.sent => 'Sent',
  PrinterJobStatus.failed => 'Failed',
  PrinterJobStatus.acked => 'Acked',
};

Color _statusColor(BuildContext context, PrinterJobStatus status) => switch (status) {
  PrinterJobStatus.queued => Colors.blue.shade700,
  PrinterJobStatus.sent || PrinterJobStatus.acked => Colors.green.shade700,
  PrinterJobStatus.failed => Theme.of(context).colorScheme.error,
};

/// What was this job printing? `payload` is untyped on the backend — this reads it defensively,
/// degrading to a generic label rather than throwing if a field is missing/differently shaped.
/// See `PrinterJob`'s doc comment in `data/printers_models.dart`.
String _describeJob(Map<String, dynamic> payload) {
  final orderNumber = payload['orderNumber'] as String?;
  final kotNumber = payload['kotNumber'] as String?;
  final invoiceNumber = payload['invoiceNumber'] as String?;

  if (kotNumber != null) return 'KOT $kotNumber${orderNumber != null ? ' · Order $orderNumber' : ''}';
  if (invoiceNumber != null) {
    return 'Receipt $invoiceNumber${orderNumber != null ? ' · Order $orderNumber' : ''}';
  }
  if (orderNumber != null) return 'Order $orderNumber';
  return 'Print job';
}

String _relativeTime(DateTime time) {
  final elapsed = DateTime.now().difference(time);
  if (elapsed.inMinutes < 1) return 'just now';
  if (elapsed.inMinutes < 60) return '${elapsed.inMinutes}m ago';
  if (elapsed.inHours < 24) return '${elapsed.inHours}h ago';
  return '${elapsed.inDays}d ago';
}

/// Per-printer job history/health — the read side of `PrintersController`'s `GET /:id/jobs`
/// (`PrintersService.listJobs`), which existed with no UI consumer until now (see
/// `docs/printing.md`'s "Operator visibility" section). Reached by tapping a printer row in
/// `PrintersScreen`. Last 50 jobs, newest first, no pagination/filter on the endpoint — this
/// screen computes queue depth / recent-failure counts client-side over that fixed window.
/// Mirrors `apps/pos_web/src/features/printers/PrinterJobsScreen.tsx`.
///
/// `printers.manage`-gated the same way `PrintersScreen` is (the whole `/printers` controller
/// requires it server-side) — reached only from there, so no separate permission check here.
class PrinterJobsScreen extends ConsumerWidget {
  const PrinterJobsScreen({super.key, required this.printerId, required this.printerName});

  final String printerId;
  final String printerName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final jobsAsync = ref.watch(printerJobsProvider(printerId));

    return Scaffold(
      appBar: AppBar(title: Text('$printerName — jobs')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(printerJobsProvider(printerId));
          await ref.read(printerJobsProvider(printerId).future);
        },
        child: jobsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => ListView(
            children: [
              Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('$error', textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: () => ref.invalidate(printerJobsProvider(printerId)),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            ],
          ),
          data: (jobs) => _JobsList(jobs: jobs, printerId: printerId),
        ),
      ),
    );
  }
}

class _JobsList extends StatelessWidget {
  const _JobsList({required this.jobs, required this.printerId});

  final List<PrinterJob> jobs;
  final String printerId;

  @override
  Widget build(BuildContext context) {
    final queued = jobs.where((j) => j.status == PrinterJobStatus.queued).toList();
    final failed = jobs.where((j) => j.status == PrinterJobStatus.failed).toList();
    final now = DateTime.now();
    final staleQueue = queued.any((j) => now.difference(j.createdAt) >= _staleQueuedThreshold);

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        Text(
          'The last ${jobs.length} job${jobs.length == 1 ? '' : 's'} sent to this printer, newest '
          'first. This is a view of what services/print-agent has attempted — a Failed job can '
          "be retried from here; there's still no way to cancel a queued one.",
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: Theme.of(context).colorScheme.outline,
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _StatCard(label: 'Queued', value: queued.length)),
            const SizedBox(width: 12),
            Expanded(child: _StatCard(label: 'Failed', value: failed.length)),
          ],
        ),
        if (staleQueue) ...[
          const SizedBox(height: 12),
          Card(
            color: Theme.of(context).colorScheme.errorContainer,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Icon(Icons.warning_amber_outlined, color: Theme.of(context).colorScheme.onErrorContainer),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'A job has been queued for a while with nothing sending it — the print '
                      "agent for this printer may not be running, or can't reach it.",
                      style: TextStyle(color: Theme.of(context).colorScheme.onErrorContainer),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 12),
        if (jobs.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 48),
            child: Center(child: Text('No jobs have been sent to this printer yet.')),
          )
        else
          for (final job in jobs) _JobTile(job: job, printerId: printerId),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Column(
          children: [
            Text('$value', style: Theme.of(context).textTheme.headlineSmall),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}

class _JobTile extends ConsumerStatefulWidget {
  const _JobTile({required this.job, required this.printerId});

  final PrinterJob job;
  final String printerId;

  @override
  ConsumerState<_JobTile> createState() => _JobTileState();
}

class _JobTileState extends ConsumerState<_JobTile> {
  bool _retrying = false;
  String? _retryError;

  Future<void> _retry() async {
    setState(() {
      _retrying = true;
      _retryError = null;
    });

    try {
      await ref.read(printersRepositoryProvider).retryJob(widget.job.id);
      ref.invalidate(printerJobsProvider(widget.printerId));
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Job re-queued — the print agent will pick it up shortly.')));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _retryError = e.message);
    } finally {
      if (mounted) setState(() => _retrying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final job = widget.job;
    final isStaleQueued =
        job.status == PrinterJobStatus.queued &&
        DateTime.now().difference(job.createdAt) >= _staleQueuedThreshold;

    return Card(
      child: ListTile(
        title: Text(_describeJob(job.payload)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${_relativeTime(job.createdAt)}'
              '${job.attempts > 0 ? ' · ${job.attempts} attempt${job.attempts == 1 ? '' : 's'}' : ''}',
            ),
            if (job.lastError != null)
              Text(
                job.lastError!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            if (isStaleQueued)
              Text(
                'Stuck — no response from the agent yet',
                style: TextStyle(color: Colors.orange.shade800),
              ),
            if (_retryError != null)
              Text(
                _retryError!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
          ],
        ),
        isThreeLine: job.lastError != null || isStaleQueued || _retryError != null,
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: _statusColor(context, job.status).withOpacity(0.12),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                _statusLabel(job.status),
                style: TextStyle(color: _statusColor(context, job.status), fontWeight: FontWeight.w600, fontSize: 12),
              ),
            ),
            if (job.status == PrinterJobStatus.failed) ...[
              const SizedBox(height: 6),
              SizedBox(
                height: 28,
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 10)),
                  onPressed: _retrying ? null : _retry,
                  child: Text(_retrying ? 'Retrying…' : 'Retry', style: const TextStyle(fontSize: 12)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
