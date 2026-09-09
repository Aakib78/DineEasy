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
/// tracking) and is also force-refetched by `KdsScreen`, two ways layered together: a
/// `Timer.periodic` poll (unconditional backstop) plus a near-instant nudge from
/// `RealtimeGateway`'s `kitchen.queue_updated`/`order.updated` events via
/// `core/realtime/realtime_service.dart` — the same "hint on top of a working poll, never a
/// replacement for one" shape as the customer PWA's `useOrderUpdates.ts`. See `KdsScreen`'s
/// `initState` for exactly which events it subscribes to and why both.
final kdsQueueProvider = FutureProvider.autoDispose<List<KdsTicket>>((ref) {
  final stationId = ref.watch(selectedKitchenStationIdProvider);
  return ref.watch(kitchenRepositoryProvider).listQueue(stationId: stationId);
});
