import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_session.dart';
import '../data/outlets_repository.dart';
import '../data/roles_repository.dart';
import '../data/staff_models.dart';
import '../data/staff_repository.dart';

final staffRepositoryProvider = Provider<StaffRepository>(
  (ref) => StaffRepository(ref.watch(apiClientProvider)),
);

final rolesRepositoryProvider = Provider<RolesRepository>(
  (ref) => RolesRepository(ref.watch(apiClientProvider)),
);

final outletsRepositoryProvider = Provider<OutletsRepository>(
  (ref) => OutletsRepository(ref.watch(apiClientProvider)),
);

final staffListProvider = FutureProvider.autoDispose<List<StaffMember>>((ref) {
  return ref.watch(staffRepositoryProvider).listStaff();
});

final staffRolesProvider = FutureProvider.autoDispose<List<StaffRole>>((ref) {
  return ref.watch(rolesRepositoryProvider).listRoles();
});

final staffOutletsProvider = FutureProvider.autoDispose<List<StaffOutlet>>((ref) {
  return ref.watch(outletsRepositoryProvider).listOutlets();
});
