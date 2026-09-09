/**
 * Decorative emoji for a menu item that has no photograph of its own — `MenuItem.imageUrl` is
 * null for every seeded demo item today, and realistically stays null for a while after a real
 * restaurant onboards too (professional food photography is rarely day-one-ready). Rather than
 * ship every item card with an empty gap where a photo would go, this picks a reasonable emoji
 * by simple keyword matching against the item's own name, falling back to a per-category default
 * and then a generic plate.
 *
 * Deliberately not an external image lookup (an API, a stock-photo CDN, anything requiring
 * internet access) — DineEasy is LAN-first by design (docs/architecture.md §1, "the restaurant's
 * own network, not a cloud endpoint"), and this app is meant to keep working even when the
 * restaurant's internet is down, just not its LAN. An emoji is just a character in the font
 * already on the device; it costs nothing and never fails to load.
 *
 * Purely cosmetic, never trusted as real dietary/allergen information — `isVegetarian` (an
 * actual server-set field) remains the only thing the veg/non-veg dot is based on.
 */
const KEYWORD_ICONS: [RegExp, string][] = [
  [/chicken|tandoori/, '🍗'],
  [/mutton|rogan josh|seekh/, '🍖'],
  [/\begg\b/, '🥚'],
  [/fish|prawn/, '🐟'],
  [/pizza/, '🍕'],
  [/biryani/, '🍚'],
  [/spring roll/, '🥟'],
  [/kebab|roll/, '🥙'],
  [/paneer/, '🧀'],
  [/dal|lentil/, '🍲'],
  [/palak|spinach/, '🥬'],
  [/corn/, '🌽'],
  [/chai|\btea\b/, '☕'],
  [/coffee/, '☕'],
  [/soda|lime/, '🥤'],
  [/lassi/, '🥛'],
  [/gulab jamun|brownie|chocolate|dessert/, '🍮'],
];

const CATEGORY_FALLBACK_ICONS: Record<string, string> = {
  Starters: '🍢',
  'Main Course': '🍛',
  'Beverages & Desserts': '🥤',
};

export function foodIcon(itemName: string, categoryName: string): string {
  const name = itemName.toLowerCase();
  for (const [pattern, icon] of KEYWORD_ICONS) {
    if (pattern.test(name)) return icon;
  }
  return CATEGORY_FALLBACK_ICONS[categoryName] ?? '🍽️';
}

/** Same idea, one level up — shown next to each category's own heading. */
export function categoryIcon(categoryName: string): string {
  return CATEGORY_FALLBACK_ICONS[categoryName] ?? '📋';
}
