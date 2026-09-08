import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_session.dart';
import '../data/kds_models.dart';
import '../data/kitchen_repository.dart';

final kitchenRepositoryProvider = Provider<KitchenRepository>(
  (ref) => KitchenRepository(ref.watch(apiClientProvider)),
);

final kitchenStationsProvider = FutureProvider.autoDispose<List<KitchenStation>>((ref) {
  return ref.watch(kitchenRepositoryProvider).listStations();
});

/// `null` means "all stations" — the KDS board's default view. Plain mutable state rather than
/// persisted anywhere: which station a given kitchen terminal is filtered to is a per-device,
/// per-session choice (a terminal physically mounted at the grill station stays on "Grill" for
/// its whole shift), not something worth round-tripping through the server.
final selectedKitchenStationIdProvider = StateProvider.autoDispose<String?>((ref) => null);

/// Re-evaluates whenever the station filter changes (Riverpod's normal `ref.watch` dependency
/// tracking) *and* is force-refetched on a fixed interval by `KdsScreen` (`ref.invalidate`,
/// driven by a `Timer.periodic`) — this project has no WebSocket wiring on the Flutter side yet
/// (unlike the customer PWA's `useOrderUpdates.ts`), so short-interval polling is the interim
/// mechanism for keeping a live kitchen board current. See docs/flutter-app.md for why that
/// gap is being accepted for now rather than adding `socket_io_client` in this same slice.
final kdsQueueProvider = FutureProvider.autoDispose<List<KdsTicket>>((ref) {
  final stationId = ref.watch(selectedKitchenStationIdProvider);
  return ref.watch(kitchenRepositoryProvider).listQueue(stationId: stationId);
});
