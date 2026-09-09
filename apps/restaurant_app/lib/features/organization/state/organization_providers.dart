import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_session.dart';
import '../data/organization_models.dart';
import '../data/organization_repository.dart';

final organizationRepositoryProvider = Provider<OrganizationRepository>(
  (ref) => OrganizationRepository(ref.watch(apiClientProvider)),
);

final organizationProvider = FutureProvider.autoDispose<Organization>((ref) {
  return ref.watch(organizationRepositoryProvider).getMine();
});
