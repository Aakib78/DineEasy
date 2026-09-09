import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_session.dart';
import '../data/printers_models.dart';
import '../data/printers_repository.dart';

final printersRepositoryProvider = Provider<PrintersRepository>(
  (ref) => PrintersRepository(ref.watch(apiClientProvider)),
);

final printersListProvider = FutureProvider.autoDispose<List<Printer>>((ref) {
  return ref.watch(printersRepositoryProvider).listPrinters();
});

/// Job history for one printer — see `PrintersRepository.listJobs`'s doc comment. Backs
/// `PrinterJobsScreen`, reached by tapping a printer row in `PrintersScreen`.
final printerJobsProvider = FutureProvider.autoDispose.family<List<PrinterJob>, String>((
  ref,
  printerId,
) {
  return ref.watch(printersRepositoryProvider).listJobs(printerId);
});
