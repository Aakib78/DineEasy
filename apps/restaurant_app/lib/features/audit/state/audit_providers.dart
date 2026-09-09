import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_session.dart';
import '../data/audit_models.dart';
import '../data/audit_repository.dart';

final auditRepositoryProvider = Provider<AuditRepository>(
  (ref) => AuditRepository(ref.watch(apiClientProvider)),
);

final auditLogProvider = FutureProvider.autoDispose<List<AuditLogEntry>>((ref) {
  return ref.watch(auditRepositoryProvider).list(limit: 200);
});
