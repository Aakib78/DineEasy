/// Mirrors `Organization` (`services/api/prisma/schema.prisma`) as returned by
/// `GET /organizations/me`. `country`/`currency`/`locale`/`timezone` are schema columns with
/// defaults but no field on `UpdateOrganizationDto` — v1 is India-only by design (spec §1), so
/// nothing edits them; they're surfaced here read-only rather than omitted; still useful for a
/// staff member to see confirmed, not just assumed.
class Organization {
  const Organization({
    required this.id,
    required this.name,
    required this.legalName,
    required this.gstin,
    required this.phone,
    required this.email,
    required this.addressLine1,
    required this.addressLine2,
    required this.city,
    required this.state,
    required this.pincode,
    required this.country,
    required this.currency,
    required this.timezone,
  });

  factory Organization.fromJson(Map<String, dynamic> json) => Organization(
    id: json['id'] as String,
    name: json['name'] as String,
    legalName: json['legalName'] as String?,
    gstin: json['gstin'] as String?,
    phone: json['phone'] as String?,
    email: json['email'] as String?,
    addressLine1: json['addressLine1'] as String?,
    addressLine2: json['addressLine2'] as String?,
    city: json['city'] as String?,
    state: json['state'] as String?,
    pincode: json['pincode'] as String?,
    country: json['country'] as String? ?? 'IN',
    currency: json['currency'] as String? ?? 'INR',
    timezone: json['timezone'] as String? ?? 'Asia/Kolkata',
  );

  final String id;
  final String name;
  final String? legalName;

  /// India GST identification number. Note: `Outlet` has its own separate `gstin` column too
  /// (GST registration is state-wise in India, so a multi-outlet business can legitimately have
  /// a different one per outlet) — that outlet-level field is the one
  /// `BillingService.buildReceiptPayload` actually prints on a receipt (see
  /// `docs/architecture.md`'s "Printed receipts now carry the outlet's identity" bullet and
  /// `OutletSettingsScreen`); this organization-level field is not referenced anywhere in
  /// invoice/receipt generation.
  final String? gstin;
  final String? phone;
  final String? email;
  final String? addressLine1;
  final String? addressLine2;
  final String? city;
  final String? state;
  final String? pincode;
  final String country;
  final String currency;
  final String timezone;
}
