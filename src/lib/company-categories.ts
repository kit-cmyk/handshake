// Starter vocabulary for a company's `category` — the local-business type a
// Places search returns (the local persona), as opposed to `industry` (B2B
// firmographics). These are only defaults: the category combobox unions them
// with whatever an org has actually typed, and anything new can be created
// inline. Nothing here is enforced by the database.

export const DEFAULT_COMPANY_CATEGORIES: string[] = [
  "Accountant",
  "Advertising agency",
  "Architect",
  "Auto body shop",
  "Auto dealership",
  "Auto repair",
  "Bakery",
  "Bar",
  "Barber shop",
  "Beauty salon",
  "Bookkeeper",
  "Cafe",
  "Car wash",
  "Caterer",
  "Chiropractor",
  "Cleaning service",
  "Construction",
  "Consultant",
  "Dance studio",
  "Day care",
  "Dentist",
  "Dermatologist",
  "Electrician",
  "Event planner",
  "Financial advisor",
  "Fitness studio",
  "Florist",
  "Funeral home",
  "Furniture store",
  "Garden center",
  "General contractor",
  "Grocery store",
  "Gym",
  "Hair salon",
  "Handyman",
  "Hardware store",
  "HVAC",
  "Insurance agency",
  "Interior designer",
  "IT services",
  "Jeweler",
  "Landscaping",
  "Law firm",
  "Locksmith",
  "Marketing agency",
  "Massage therapy",
  "Med spa",
  "Medical clinic",
  "Mortgage broker",
  "Moving company",
  "Nail salon",
  "Optometrist",
  "Painter",
  "Pest control",
  "Pet grooming",
  "Pharmacy",
  "Photographer",
  "Physical therapy",
  "Plumber",
  "Print shop",
  "Property management",
  "Real estate agency",
  "Restaurant",
  "Roofing",
  "Security services",
  "Solar installer",
  "Spa",
  "Staffing agency",
  "Storage facility",
  "Tattoo studio",
  "Tax preparation",
  "Towing service",
  "Travel agency",
  "Tree service",
  "Veterinarian",
  "Web design",
  "Wedding venue",
];

/**
 * The option list for the category combobox: the defaults above unioned with
 * the categories an org has actually saved. Deduped case-insensitively so a
 * company stored as "dentist" doesn't sit next to the built-in "Dentist" —
 * whichever spelling is seen first wins, and defaults are seen first, so the
 * canonical casing is the one that survives.
 */
export function mergeCompanyCategories(inUse: string[]): string[] {
  const bySlug = new Map<string, string>();
  for (const c of [...DEFAULT_COMPANY_CATEGORIES, ...inUse]) {
    const label = c.trim();
    if (!label) continue;
    const slug = label.toLowerCase();
    if (!bySlug.has(slug)) bySlug.set(slug, label);
  }
  return [...bySlug.values()].sort((a, b) => a.localeCompare(b));
}
