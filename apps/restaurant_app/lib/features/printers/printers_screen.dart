import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import 'data/printers_models.dart';
import 'printer_jobs_screen.dart';
import 'state/printers_providers.dart';

/// The Flutter port of `apps/pos_web/src/features/printers/PrintersScreen.tsx` — see that
/// file's doc comment for the full "why this screen exists" background. Registering a `Printer`
/// row here is what makes `services/print-agent` see it and start draining jobs for it; this
/// screen never talks to hardware itself, staff apps never do (see `docs/printing.md`). Reached
/// from Settings (`features/settings/settings_screen.dart`), gated the same way pos_web's nav
/// tab is: `printers.manage` — and note the whole `/printers` controller requires it
/// server-side, including listing, so there's no view-only variant of this screen to build.
class PrintersScreen extends ConsumerWidget {
  const PrintersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final printersAsync = ref.watch(printersListProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Printers')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAddPrinterSheet(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('Add printer'),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(printersListProvider);
          await ref.read(printersListProvider.future);
        },
        child: printersAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => _ErrorState(
            message: '$error',
            onRetry: () => ref.invalidate(printersListProvider),
          ),
          data: (printers) => ListView(
            padding: const EdgeInsets.all(12),
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                child: Text(
                  'A printer registered here is what services/print-agent polls for jobs — it '
                  "doesn't print anything by itself. The agent needs to be running on a computer "
                  "with network access (or a USB connection) to the printer.",
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                ),
              ),
              const SizedBox(height: 4),
              if (printers.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 48),
                  child: Center(child: Text('No printers configured for this outlet yet.')),
                )
              else
                for (final printer in printers) _PrinterTile(printer: printer),
              const SizedBox(height: 72), // clears the FAB
            ],
          ),
        ),
      ),
    );
  }

  void _showAddPrinterSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _AddPrinterSheet(),
    );
  }
}

class _PrinterTile extends StatelessWidget {
  const _PrinterTile({required this.printer});

  final Printer printer;

  @override
  Widget build(BuildContext context) {
    final typeLabel = printer.type == PrinterType.kitchen ? 'Kitchen' : 'Receipt';
    final connectionLabel = printer.connectionType == PrinterConnectionType.network
        ? '${printer.ipAddress ?? '?'}:${printer.port ?? 9100}'
        : 'USB';

    return Card(
      child: ListTile(
        leading: Icon(
          printer.connectionType == PrinterConnectionType.network ? Icons.lan : Icons.usb,
        ),
        title: Text(printer.name),
        subtitle: Text('$typeLabel${printer.isActive ? '' : ' · inactive'}'),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(connectionLabel, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(width: 4),
            const Icon(Icons.chevron_right),
          ],
        ),
        // Job history/health — the read side of `GET /printers/:id/jobs`, previously reachable
        // only by a raw API call (see docs/printing.md's "Operator visibility" section).
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => PrinterJobsScreen(printerId: printer.id, printerName: printer.name),
          ),
        ),
      ),
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

class _AddPrinterSheet extends ConsumerStatefulWidget {
  const _AddPrinterSheet();

  @override
  ConsumerState<_AddPrinterSheet> createState() => _AddPrinterSheetState();
}

class _AddPrinterSheetState extends ConsumerState<_AddPrinterSheet> {
  final _nameController = TextEditingController();
  final _ipController = TextEditingController();
  final _portController = TextEditingController(text: '9100');
  PrinterType _type = PrinterType.receipt;
  PrinterConnectionType _connectionType = PrinterConnectionType.network;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _ipController.dispose();
    _portController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Add a printer', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 16),
            TextField(
              controller: _nameController,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Name',
                hintText: 'e.g. Counter receipt printer',
                border: OutlineInputBorder(),
              ),
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 16),
            SegmentedButton<PrinterType>(
              segments: const [
                ButtonSegment(value: PrinterType.receipt, label: Text('Receipt')),
                ButtonSegment(value: PrinterType.kitchen, label: Text('Kitchen')),
              ],
              selected: {_type},
              onSelectionChanged: (s) => setState(() => _type = s.first),
            ),
            const SizedBox(height: 12),
            SegmentedButton<PrinterConnectionType>(
              segments: const [
                ButtonSegment(
                  value: PrinterConnectionType.network,
                  label: Text('Network'),
                  icon: Icon(Icons.lan),
                ),
                ButtonSegment(
                  value: PrinterConnectionType.usb,
                  label: Text('USB'),
                  icon: Icon(Icons.usb),
                ),
              ],
              selected: {_connectionType},
              onSelectionChanged: (s) => setState(() => _connectionType = s.first),
            ),
            const SizedBox(height: 12),
            if (_connectionType == PrinterConnectionType.network) ...[
              TextField(
                controller: _ipController,
                decoration: const InputDecoration(
                  labelText: 'IP address',
                  hintText: '192.168.1.60',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _portController,
                decoration: const InputDecoration(labelText: 'Port', border: OutlineInputBorder()),
                keyboardType: TextInputType.number,
              ),
            ] else
              Text(
                'The printer must be plugged into whichever computer runs '
                'services/print-agent — not this phone or tablet. No specific device needs to '
                'be picked here: the agent finds the first connected USB printer automatically.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.outline,
                    ),
              ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: Text(_submitting ? 'Adding…' : 'Add printer'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Enter a name for this printer.');
      return;
    }
    final ip = _ipController.text.trim();
    if (_connectionType == PrinterConnectionType.network && ip.isEmpty) {
      setState(
        () => _error = "Enter the printer's IP address — find it from its self-test/status page.",
      );
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref.read(printersRepositoryProvider).createPrinter(
            name: name,
            type: _type,
            connectionType: _connectionType,
            ipAddress: _connectionType == PrinterConnectionType.network ? ip : null,
            port: _connectionType == PrinterConnectionType.network
                ? int.tryParse(_portController.text.trim()) ?? 9100
                : null,
          );
      ref.invalidate(printersListProvider);
      if (!mounted) return;
      Navigator.pop(context);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}
