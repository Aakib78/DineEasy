import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'realtime_service.dart';

/// One shared [RealtimeService] for the whole app session — created once, then connected on
/// login and disconnected on logout by `HomeShell` (the shell that's only ever mounted while
/// authenticated — see `lib/features/home/home_shell.dart`), rather than each screen that wants
/// a live nudge opening its own socket. Screens that want one just read this provider and
/// subscribe to whichever stream(s) they care about in `initState`/`dispose`, the same way
/// `PosHomeScreen` and `KdsScreen` do.
final realtimeServiceProvider = Provider<RealtimeService>((ref) {
  final service = RealtimeService();
  ref.onDispose(service.dispose);
  return service;
});
