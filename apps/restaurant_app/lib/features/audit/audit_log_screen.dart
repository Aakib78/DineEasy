import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'data/audit_models.dart';
import 'state/audit_providers.dart';

const _jsonEncoder = JsonEncoder.withIndent('  ');

String _relativeTime(DateTime time) {
  final elapsed = DateTime.now().difference(time);
  if (elapsed.inMinutes < 1) return 'just now';
  if (elapsed.inMinutes < 60) return '${elapsed.inMinutes}m ago';
  if (elapsed.inHours < 24) return '${elapsed.inHours}h ago';
  return '${elapsed.inDays}d ago';
}

/// `AuditLogService` (`services/api`) has been recording every sensitive mutation this whole
/// project — menu/price changes, discounts, refunds, staff role changes, tax config, org
/// settings — since early on (spec §23), but `GET /audit-logs` had no UI consumer anywhere until
/// now. `audit.view`-gated (Owner/Manager only — see `permissions.catalog.ts`'s role table),
/// reached from `SettingsScreen`. Read-only, newest first, no filter/search in v1 — see
/// `AuditRepository.list`'s doc comment for why this is org-wide rather than per-outlet.
class AuditLogScreen extends ConsumerWidget {
  const AuditLogScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final logsAsync = ref.watch(auditLogProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Audit log')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(auditLogProvider);
          await ref.read(auditLogProvider.future);
        },
        child: logsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => _ErrorState(
            message: '$error',
            onRetry: () => ref.invalidate(auditLogProvider),
          ),
          data: (logs) => ListView(
            padding: const EdgeInsets.all(12),
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                child: Text(
                  'A record of sensitive changes across every outlet — menu/price edits, '
                  'discounts, refunds, staff and tax changes. Read-only, newest ${logs.length} '
                  'entries.',
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.outline),
                ),
              ),
              if (logs.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 48),
                  child: Center(child: Text('Nothing recorded yet.')),
                )
              else
                for (final entry in logs) _AuditEntryTile(entry: entry),
            ],
          ),
        ),
      ),
    );
  }
}

class _AuditEntryTile extends StatelessWidget {
  const _AuditEntryTile({required this.entry});

  final AuditLogEntry entry;

  @override
  Widget build(BuildContext context) {
    final hasDetail = entry.previousState != null || entry.newState != null;
    return Card(
      child: ListTile(
        title: Text(humanizeAuditAction(entry.action)),
        subtitle: Text(
          '${entry.entityType} · ${entry.actorName ?? 'System'} · ${_relativeTime(entry.createdAt)}',
        ),
        trailing: hasDetail ? const Icon(Icons.chevron_right) : null,
        onTap: hasDetail ? () => _showDetail(context) : null,
      ),
    );
  }

  void _showDetail(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        builder: (context, scrollController) => Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(humanizeAuditAction(entry.action), style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(
                '${entry.entityType} · ${entry.entityId}',
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.outline),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: ListView(
                  controller: scrollController,
                  children: [
                    if (entry.previousState != null) ...[
                      Text('Before', style: Theme.of(context).textTheme.titleSmall),
                      const SizedBox(height: 4),
                      _JsonBlock(value: entry.previousState!),
                      const SizedBox(height: 16),
                    ],
                    if (entry.newState != null) ...[
                      Text('After', style: Theme.of(context).textTheme.titleSmall),
                      const SizedBox(height: 4),
                      _JsonBlock(value: entry.newState!),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _JsonBlock extends StatelessWidget {
  const _JsonBlock({required this.value});

  final Map<String, dynamic> value;

  @override
  Widget build(BuildContext context) {
    String text;
    try {
      text = _jsonEncoder.convert(value);
    } catch (_) {
      // Shouldn't happen (this came from decoded JSON in the first place), but a raw log
      // screen is the last place that should ever crash on unexpected data.
      text = '$value';
    }
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: SelectableText(text, style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 40, color: Theme.of(context).colorScheme.error),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
