// Pluggable lead sourcing. Dev/default = MockProvider (deterministic sample
// businesses, with plausible coordinates so the map + radius work offline). If
// GOOGLE_PLACES_API_KEY is set, the real Google Places API (Text Search v1) is
// used. Google Places does NOT return emails — enrichment
// (src/lib/places/enrich.ts) fills those best-effort.

export type LatLng = { lat: number; lng: number };

export type PlaceResult = {
  placeId: string;
  name: string;
  category: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  rating: number | null;
  latitude: number | null;
  longitude: number | null;
};

export type SearchQuery = {
  category: string;
  location: string;
  limit: number;
  /** When set, bias/scope the search to this radius (meters) around the location. */
  radiusMeters?: number;
  /** Only businesses currently open (Google only; ignored by mock). */
  openNow?: boolean;
};

export type SearchResult = {
  /** Center the search resolved to (for drawing the radius on a map). */
  center: LatLng | null;
  results: PlaceResult[];
};

export interface PlacesProvider {
  readonly name: string;
  search(q: SearchQuery): Promise<SearchResult>;
}

// ---- Geo helpers ------------------------------------------------------------

const EARTH_M_PER_DEG_LAT = 111_320;

/** Stable 32-bit hash of a string (FNV-1a). */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Offset a center point by a distance (m) and bearing (rad). */
function offset(center: LatLng, meters: number, bearing: number): LatLng {
  const dLat = (meters * Math.cos(bearing)) / EARTH_M_PER_DEG_LAT;
  const dLng =
    (meters * Math.sin(bearing)) /
    (EARTH_M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180));
  return { lat: center.lat + dLat, lng: center.lng + dLng };
}

/** Mean of a set of points; null if empty. */
export function centroid(points: LatLng[]): LatLng | null {
  if (!points.length) return null;
  const sum = points.reduce(
    (a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }),
    { lat: 0, lng: 0 }
  );
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

// ---- Mock -------------------------------------------------------------------

const SAMPLE_STREETS = ["Main St", "Oak Ave", "2nd St", "Elm Rd", "Park Blvd"];

class MockPlacesProvider implements PlacesProvider {
  readonly name = "mock";
  async search(q: SearchQuery): Promise<SearchResult> {
    const n = Math.min(Math.max(q.limit, 1), 60);
    const cityGuess = q.location.split(",")[0]?.trim() || q.location;
    const cap =
      q.category.charAt(0).toUpperCase() + q.category.slice(1).toLowerCase();

    // Deterministic, plausible center (continental US-ish) from the location.
    const h = hashStr(q.location.toLowerCase());
    const center: LatLng = {
      lat: 25 + (h % 2400) / 100, // 25.00 – 49.00
      lng: -124 + ((h >> 8) % 5700) / 100, // -124.00 – -67.00
    };
    const radius = q.radiusMeters ?? 5000;

    const results: PlaceResult[] = [];
    for (let i = 1; i <= n; i++) {
      const slug = `${q.category}-${cityGuess}-${i}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");
      const seed = hashStr(slug);
      // Scatter deterministically within the radius.
      const dist = radius * (0.1 + 0.85 * ((seed % 1000) / 1000));
      const bearing = ((seed >> 10) % 360) * (Math.PI / 180);
      const { lat, lng } = offset(center, dist, bearing);
      results.push({
        placeId: `mock_${slug}`,
        name: `${cap} #${i} of ${cityGuess}`,
        category: q.category,
        phone: `+1 555 01${String(i).padStart(2, "0")}`,
        website: `https://${slug}.example.com`,
        address: `${100 + i} ${SAMPLE_STREETS[i % SAMPLE_STREETS.length]}`,
        city: cityGuess,
        region: q.location.split(",")[1]?.trim() ?? null,
        postalCode: null,
        rating: Math.round((3 + (i % 20) / 10) * 10) / 10,
        latitude: lat,
        longitude: lng,
      });
    }
    return { center, results };
  }
}

// ---- Google Places (Text Search v1) ----------------------------------------

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  primaryType?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: { types?: string[]; longText: string; shortText: string }[];
};

function componentBy(
  place: GooglePlace,
  type: string,
  short = false
): string | null {
  const c = place.addressComponents?.find((a) => a.types?.includes(type));
  return c ? (short ? c.shortText : c.longText) : null;
}

class GooglePlacesProvider implements PlacesProvider {
  readonly name = "google";
  constructor(private apiKey: string) {}

  /** Geocode a free-text location to a center point (best-effort). */
  private async geocode(location: string): Promise<LatLng | null> {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          location
        )}&key=${this.apiKey}`
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        results?: { geometry?: { location?: { lat: number; lng: number } } }[];
      };
      const loc = data.results?.[0]?.geometry?.location;
      return loc ? { lat: loc.lat, lng: loc.lng } : null;
    } catch {
      return null;
    }
  }

  async search(q: SearchQuery): Promise<SearchResult> {
    const target = Math.min(Math.max(q.limit, 1), 60);
    const center =
      q.radiusMeters && q.radiusMeters > 0
        ? await this.geocode(q.location)
        : null;

    const results: PlaceResult[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < 3 && results.length < target; page++) {
      const res = await fetch(
        "https://places.googleapis.com/v1/places:searchText",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.apiKey,
            "X-Goog-FieldMask":
              "places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri,places.rating,places.primaryType,places.location,places.addressComponents,nextPageToken",
          },
          body: JSON.stringify({
            textQuery: `${q.category} in ${q.location}`,
            pageSize: 20,
            ...(q.openNow ? { openNow: true } : {}),
            ...(center && q.radiusMeters
              ? {
                  locationBias: {
                    circle: {
                      center: {
                        latitude: center.lat,
                        longitude: center.lng,
                      },
                      radius: q.radiusMeters,
                    },
                  },
                }
              : {}),
            ...(pageToken ? { pageToken } : {}),
          }),
        }
      );
      if (!res.ok) {
        throw new Error(`Places API ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as {
        places?: GooglePlace[];
        nextPageToken?: string;
      };
      for (const p of data.places ?? []) {
        results.push({
          placeId: p.id,
          name: p.displayName?.text ?? "Unnamed",
          category: p.primaryType ?? q.category,
          phone: p.internationalPhoneNumber ?? null,
          website: p.websiteUri ?? null,
          address: p.formattedAddress ?? null,
          city: componentBy(p, "locality"),
          region: componentBy(p, "administrative_area_level_1", true),
          postalCode: componentBy(p, "postal_code"),
          rating: p.rating ?? null,
          latitude: p.location?.latitude ?? null,
          longitude: p.location?.longitude ?? null,
        });
      }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    const trimmed = results.slice(0, target);
    // Fall back to the centroid of results when geocoding produced no center.
    const resolvedCenter =
      center ??
      centroid(
        trimmed
          .filter((r) => r.latitude != null && r.longitude != null)
          .map((r) => ({ lat: r.latitude as number, lng: r.longitude as number }))
      );
    return { center: resolvedCenter, results: trimmed };
  }
}

/** True when a real Places provider is configured (a Google API key is set). */
export function isPlacesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

export function getPlacesProvider(): PlacesProvider {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  return key ? new GooglePlacesProvider(key) : new MockPlacesProvider();
}

// ---- Pure helpers (tested) --------------------------------------------------

/** Split provider results into fresh vs. already-known (by placeId). */
export function partitionResults(
  results: PlaceResult[],
  existingPlaceIds: Iterable<string>
): { fresh: PlaceResult[]; duplicates: number } {
  const seen = new Set(existingPlaceIds);
  const fresh: PlaceResult[] = [];
  let duplicates = 0;
  for (const r of results) {
    if (!r.placeId || seen.has(r.placeId)) {
      duplicates++;
      continue;
    }
    seen.add(r.placeId);
    fresh.push(r);
  }
  return { fresh, duplicates };
}

export type ProspectFilters = {
  minRating?: number;
  hasWebsite?: boolean;
  hasPhone?: boolean;
};

/** Apply condition filters that the provider can't express natively. */
export function applyFilters(
  results: PlaceResult[],
  f: ProspectFilters
): PlaceResult[] {
  return results.filter((r) => {
    if (f.minRating != null && (r.rating ?? 0) < f.minRating) return false;
    if (f.hasWebsite && !r.website) return false;
    if (f.hasPhone && !r.phone) return false;
    return true;
  });
}

/** Map a place result to a companies-table insert payload. */
export function companyPayload(r: PlaceResult, orgId: string) {
  return {
    org_id: orgId,
    name: r.name,
    category: r.category,
    phone: r.phone,
    website: r.website,
    address: r.address,
    city: r.city,
    region: r.region,
    postal_code: r.postalCode,
    google_place_id: r.placeId,
    rating: r.rating,
    latitude: r.latitude,
    longitude: r.longitude,
    source: "google_places",
  };
}
