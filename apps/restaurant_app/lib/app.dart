import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show SystemUiOverlayStyle;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/routing/app_router.dart';

/// This app's brand seed color. Used to derive `ColorScheme`s for both light and dark themes —
/// every other color on this page comes from `_buildTheme` seeding off this value below.
///
/// **Diverges from the web apps on purpose**: `pos_web`/`customer_web`'s accent (`--accent` in
/// `packages/shared_types/src/theme.ts`) is `#E85D2C` (orange) — this used to be kept in sync by
/// hand with that value (Dart can't import the TypeScript file, see that package's doc comment),
/// but this app's seed was deliberately changed to a near-white pink instead. If a shared brand
/// color is wanted again later, update both this constant and `theme.ts`'s `--accent` together;
/// until then, don't assume they match.
const _brandSeed = Color(0xFFfdf2f8);

class DineEasyApp extends ConsumerWidget {
  const DineEasyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);

    return MaterialApp.router(
      title: 'DineEasy',
      debugShowCheckedModeBanner: false,
      theme: _buildTheme(Brightness.light),
      darkTheme: _buildTheme(Brightness.dark),
      routerConfig: router,
    );
  }
}

/// Builds the app's `ThemeData` for a given brightness. Both `theme` and `darkTheme` above go
/// through this so the two stay in lockstep — light/dark drift is how theme bugs like "the app
/// bar is unreadable in dark mode" creep in.
///
/// This used to be a bare `ThemeData(colorSchemeSeed: _brandSeed, useMaterial3: true)`. M3's
/// default seed algorithm (`DynamicSchemeVariant.tonalSpot`) intentionally produces fairly
/// muted, low-chroma tonal palettes — good for a calm, content-forward app, but it read as flat
/// for a fast-moving restaurant floor tool where staff are scanning table/order state at a
/// glance. `DynamicSchemeVariant.vibrant` keeps every other M3 contrast/accessibility guarantee
/// (this is still a real, validated color scheme, not hand-picked hex values fighting each
/// other) but raises the chroma considerably — that's the actual "punchy" switch. Everything
/// below it is turning that scheme into visibly bolder components, not just a bolder palette.
ThemeData _buildTheme(Brightness brightness) {
  // `.fromSeed` derives every role (tertiary included) from one seed with matched contrast
  // guarantees between each color and its `on*` counterpart — hand-overriding individual roles
  // (e.g. forcing a different tertiary hue) would break that pairing without re-deriving the
  // `onTertiary`/container tones to match, so the "punchy" lever here is `dynamicSchemeVariant`
  // rather than touching individual roles after the fact.
  final colorScheme = ColorScheme.fromSeed(
    seedColor: _brandSeed,
    brightness: brightness,
    dynamicSchemeVariant: DynamicSchemeVariant.vibrant,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: colorScheme.surface,
    visualDensity: VisualDensity.standard,

    // A colored app bar (rather than M3's default muted-surface one) is the single biggest
    // driver of "punchy" — it's on every screen in the shell (see home_shell.dart) and reads
    // instantly as branded rather than generic Material.
    appBarTheme: AppBarThemeData(
      backgroundColor: colorScheme.primary,
      foregroundColor: colorScheme.onPrimary,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: colorScheme.onPrimary,
        fontSize: 20,
        fontWeight: FontWeight.w700,
      ),
      iconTheme: IconThemeData(color: colorScheme.onPrimary),
      actionsIconTheme: IconThemeData(color: colorScheme.onPrimary),
      // The app bar is filled with the (dark-in-both-themes) primary orange, so the status bar
      // icons drawn over it should always be light — independent of whether the rest of the
      // app is in light or dark mode.
      systemOverlayStyle: SystemUiOverlayStyle.light,
    ),

    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: colorScheme.primary,
        foregroundColor: colorScheme.onPrimary,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        elevation: 2,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        side: BorderSide(color: colorScheme.primary, width: 1.5),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),

    cardTheme: CardThemeData(
      elevation: 0,
      color: colorScheme.surfaceContainerHigh,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      margin: EdgeInsets.zero,
    ),

    inputDecorationTheme: InputDecorationThemeData(
      filled: true,
      fillColor: colorScheme.surfaceContainerHighest,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: colorScheme.primary, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: colorScheme.error, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),

    // Selected destination gets a filled pill in the brand color rather than M3's default
    // pale tonal chip — this is the shell's primary navigation (home_shell.dart), so it's
    // worth the extra visual weight.
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: colorScheme.surfaceContainer,
      indicatorColor: colorScheme.primary,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontSize: 12,
          fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
          color: states.contains(WidgetState.selected) ? colorScheme.primary : colorScheme.onSurfaceVariant,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          color: states.contains(WidgetState.selected) ? colorScheme.onPrimary : colorScheme.onSurfaceVariant,
        ),
      ),
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: colorScheme.surfaceContainer,
      indicatorColor: colorScheme.primary,
      selectedIconTheme: IconThemeData(color: colorScheme.onPrimary),
      unselectedIconTheme: IconThemeData(color: colorScheme.onSurfaceVariant),
      selectedLabelTextStyle: TextStyle(color: colorScheme.primary, fontWeight: FontWeight.w700),
      unselectedLabelTextStyle: TextStyle(color: colorScheme.onSurfaceVariant),
    ),

    chipTheme: ChipThemeData(
      backgroundColor: colorScheme.surfaceContainerHighest,
      selectedColor: colorScheme.primary,
      labelStyle: TextStyle(color: colorScheme.onSurfaceVariant, fontWeight: FontWeight.w600),
      side: BorderSide.none,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),

    tabBarTheme: TabBarThemeData(
      labelColor: colorScheme.primary,
      unselectedLabelColor: colorScheme.onSurfaceVariant,
      indicatorColor: colorScheme.primary,
      indicatorSize: TabBarIndicatorSize.label,
      labelStyle: const TextStyle(fontWeight: FontWeight.w700),
    ),

    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: colorScheme.primary,
      foregroundColor: colorScheme.onPrimary,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),

    badgeTheme: BadgeThemeData(
      backgroundColor: colorScheme.error,
      textColor: colorScheme.onError,
    ),

    dividerTheme: DividerThemeData(color: colorScheme.outlineVariant, space: 1),

    snackBarTheme: SnackBarThemeData(
      backgroundColor: colorScheme.inverseSurface,
      contentTextStyle: TextStyle(color: colorScheme.onInverseSurface),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  );
}
