/// Runtime configuration for talking to `services/api`.
///
/// DineEasy is LAN-first (docs/architecture.md §1): the API server is a machine on the
/// restaurant's own network, not a cloud endpoint, so there is no single "production" base
/// URL to bake in at build time. v1 ships this as a compile-time default plus a `--dart-define`
/// override; a proper in-app "find/set the server on this network" flow (mDNS discovery or a
/// manual IP+port entry screen) is tracked as a follow-up once the LAN/offline slice lands —
/// see docs/offline-mode.md.
class AppConfig {
  const AppConfig._();

  /// Override at build/run time, e.g.:
  ///   flutter run --dart-define=API_BASE_URL=http://192.168.1.50:3000/api/v1
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000/api/v1',
  );

  /// Requests on a restaurant LAN should be near-instant; a short timeout lets the app detect
  /// "server unreachable" quickly rather than hanging the UI (spec §14 LAN-first requirement).
  static const Duration requestTimeout = Duration(seconds: 8);
}
