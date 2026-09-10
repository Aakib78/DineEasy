/// Mirrors `Outlet` (`services/api/prisma/schema.prisma`) as returned by `GET /outlets/:id`
/// (and `GET /outlets`, though the list endpoint's only current consumer,
/// `features/staff/data/outlets_repository.dart`'s `StaffOutlet`, only needs `id`/`name` for a
/// dropdown — this is the fuller shape `OutletSettingsScreen` edits). `code`/`timezone` have no
/// field on `UpdateOutletDto` — `code` is immutable after creation and v1 is India-only by
/// design (spec §1), so neither is editable; both are surfaced here read-only rather than
/// omitted, same reasoning `Organization`'s `country`/`currency`/`timezone` fields use.
class Outlet {
  const Outlet({
    required this.id,
    required this.name,
    required this.code,
    required this.phone,
    required this.addressLine1,
    required this.addressLine2,
    required this.city,
    required this.state,
    required this.pincode,
    required this.gstin,
    required this.fssaiLicense,
    required this.timezone,
    required this.serviceChargePercent,
    required this.roundOffEnabled,
    required this.isActive,
  });

  factory Outlet.fromJson(Map<String, dynamic> json) => Outlet(
    id: json['id'] as String,
    name: json['name'] as String,
    code: json['code'] as String,
    phone: json['phone'] as String?,
    addressLine1: json['addressLine1'] as String?,
    addressLine2: json['addressLine2'] as String?,
    city: json['city'] as String?,
    state: json['state'] as String?,
    pincode: json['pincode'] as String?,
    gstin: json['gstin'] as String?,
    fssaiLicense: json['fssaiLicense'] as String?,
    timezone: json['timezone'] as String? ?? 'Asia/Kolkata',
    serviceChargePercent: json['serviceChargePercent']?.toString() ?? '0',
    roundOffEnabled: json['roundOffEnabled'] as bool? ?? true,
    isActive: json['isActive'] as bool? ?? true,
  );

  final String id;
  final String name;
  final String code;
  final String? phone;
  final String? addressLine1;
  final String? addressLine2;
  final String? city;
  final String? state;
  final String? pincode;

  /// This outlet's own GSTIN — separate from `Organization.gstin` (GST registration is
  /// state-wise in India, so a multi-outlet business can legitimately have a different one per
  /// outlet). This is the one `BillingService.buildReceiptPayload` actually prints on a receipt
  /// (see `docs/architecture.md`'s "Printed receipts now carry the outlet's identity" bullet) —
  /// the organization-level field is not referenced anywhere.
  final String? gstin;

  /// India's Food Safety and Standards Authority license number — also now printed on receipts
  /// alongside the GSTIN.
  final String? fssaiLicense;
  final String timezone;

  /// Decimal string (e.g. `"5.00"`), same "keep it a string, never a double, until a form needs
  /// to edit it" convention `MenuItem.basePrice` and friends use elsewhere in this app — feeds
  /// directly into `OrdersService`'s total computation on the backend (see
  /// `order-pricing.util.ts`), so this isn't cosmetic: it's live on every order at this outlet.
  final String serviceChargePercent;
  final bool roundOffEnabled;
  final bool isActive;
}
