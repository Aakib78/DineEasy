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
