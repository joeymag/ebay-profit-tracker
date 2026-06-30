import type { StoredShippingAddress } from "@/lib/orders/types";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  region: string | null;
};

const NOMINATIM_USER_AGENT = "StoreProfitTracker/1.0 (order geocoding)";
const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

const CITY_ALIASES: Record<string, string> = {
  norhampton: "Northampton",
  melton: "Melton Mowbray",
};

/** Fallback coords when APIs have no match (NI, Crown dependencies, etc.). */
const MANUAL_LOCATIONS: Record<string, GeocodeResult> = {
  downpatrick: { latitude: 54.328, longitude: -5.714, region: "Downpatrick" },
  armagh: { latitude: 54.3503, longitude: -6.6528, region: "Armagh" },
  londonderry: { latitude: 54.9966, longitude: -7.3086, region: "Londonderry" },
  clynderwen: { latitude: 51.816, longitude: -4.738, region: "Clynderwen" },
  andreas: { latitude: 54.3667, longitude: -4.4394, region: "Andreas, Isle of Man" },
  im91tb: { latitude: 54.074, longitude: -4.653, region: "Castletown, Isle of Man" },
  gy80nl: { latitude: 49.424, longitude: -2.607, region: "Torteval, Guernsey" },
};

type UkPlaceResult = {
  name_1: string;
  latitude: number;
  longitude: number;
  region: string | null;
  country: string | null;
  district_borough: string | null;
};

function normalizeUkPostcode(postcode: string): string {
  const compact = postcode.replace(/\s+/g, "").toUpperCase();
  if (compact.length <= 3) {
    return compact;
  }
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

function isUkAddress(address: StoredShippingAddress): boolean {
  const code = address.countryCode?.toUpperCase();
  if (code === "GB" || code === "UK") {
    return true;
  }
  if (address.zip && UK_POSTCODE.test(address.zip.trim())) {
    return true;
  }
  return address.country?.toLowerCase().includes("united kingdom") ?? false;
}

function buildNominatimQuery(address: StoredShippingAddress): string {
  return [
    address.address1,
    address.city,
    address.province,
    address.zip,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
}

function manualLocationKey(address: StoredShippingAddress): string | null {
  if (address.zip?.trim()) {
    return address.zip.replace(/\s+/g, "").toLowerCase();
  }

  const cityQueries = cityLookupQueries(address.city, address.province);
  for (const query of cityQueries) {
    const key = query.toLowerCase().replace(/\s+/g, "");
    if (MANUAL_LOCATIONS[key]) {
      return key;
    }
  }

  return null;
}

function cityLookupQueries(
  city: string | null | undefined,
  province: string | null | undefined,
): string[] {
  if (!city?.trim()) {
    return [];
  }

  const noise = new Set([
    "isle of man",
    "england",
    "wales",
    "scotland",
    "northern ireland",
    "channel islands",
  ]);

  const parts = city
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !noise.has(part.toLowerCase()));

  const queries = (parts.length ? parts : [city.trim()]).map((part) => {
    const alias = CITY_ALIASES[part.toLowerCase()];
    return alias ?? part;
  });

  return [...new Set(queries)];
}

function pickBestPlaceResult(
  results: UkPlaceResult[],
  province: string | null | undefined,
  query?: string,
): UkPlaceResult | null {
  if (!results.length) {
    return null;
  }

  const normalizedQuery = query?.trim().toLowerCase();
  const normalizedProvince = province?.toLowerCase() ?? "";

  if (normalizedQuery) {
    const districtMatch = results.find(
      (result) =>
        result.district_borough?.trim().toLowerCase() === normalizedQuery,
    );
    if (districtMatch) {
      return districtMatch;
    }
  }

  if (results.length === 1) {
    return results[0];
  }

  if (normalizedProvince.includes("wales")) {
    const match = results.find((result) => result.country === "Wales");
    if (match) {
      return match;
    }
  }

  if (normalizedProvince.includes("scotland")) {
    const match = results.find((result) => result.region === "Scotland");
    if (match) {
      return match;
    }
  }

  if (normalizedProvince.includes("england")) {
    const english = results.filter((result) => result.country === "England");
    if (english.length === 1) {
      return english[0];
    }
    if (english.length > 1 && normalizedQuery) {
      const nameMatch = english.find(
        (result) => result.name_1.trim().toLowerCase() === normalizedQuery,
      );
      if (nameMatch) {
        return nameMatch;
      }
    }
    if (english.length > 0) {
      return english[0];
    }
  }

  if (normalizedProvince.includes("northern ireland")) {
    const match = results.find((result) =>
      result.region?.toLowerCase().includes("northern ireland"),
    );
    if (match) {
      return match;
    }
  }

  return results[0];
}

async function lookupUkPlace(
  query: string,
  province: string | null | undefined,
): Promise<GeocodeResult | null> {
  const response = await fetch(
    `https://api.postcodes.io/places?q=${encodeURIComponent(query)}&limit=10`,
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { result?: UkPlaceResult[] };
  const best = pickBestPlaceResult(payload.result ?? [], province, query);
  if (!best) {
    return null;
  }

  return {
    latitude: best.latitude,
    longitude: best.longitude,
    region: best.district_borough ?? best.name_1 ?? best.region,
  };
}

async function lookupUkPlaceForAddress(
  address: StoredShippingAddress,
): Promise<GeocodeResult | null> {
  const queries = cityLookupQueries(address.city, address.province);

  for (const query of queries) {
    const manualKey = query.toLowerCase().replace(/\s+/g, "");
    if (MANUAL_LOCATIONS[manualKey]) {
      return MANUAL_LOCATIONS[manualKey];
    }

    const result = await lookupUkPlace(query, address.province);
    if (result) {
      return result;
    }
  }

  return null;
}

async function lookupUkPostcodesBatch(
  postcodes: string[],
): Promise<Map<string, GeocodeResult>> {
  const results = new Map<string, GeocodeResult>();
  if (!postcodes.length) {
    return results;
  }

  const response = await fetch("https://api.postcodes.io/postcodes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postcodes }),
  });

  if (!response.ok) {
    return results;
  }

  const payload = (await response.json()) as {
    result?: Array<{
      query: string;
      result: {
        latitude: number;
        longitude: number;
        admin_district?: string | null;
        admin_county?: string | null;
        region?: string | null;
        parish?: string | null;
      } | null;
    }>;
  };

  for (const entry of payload.result ?? []) {
    if (!entry.result) {
      continue;
    }

    const region =
      entry.result.admin_district?.trim() ||
      entry.result.admin_county?.trim() ||
      entry.result.region?.trim() ||
      entry.result.parish?.trim() ||
      null;

    results.set(normalizeUkPostcode(entry.query), {
      latitude: entry.result.latitude,
      longitude: entry.result.longitude,
      region,
    });
  }

  return results;
}

async function geocodeWithNominatim(
  address: StoredShippingAddress,
): Promise<GeocodeResult | null> {
  const query = buildNominatimQuery(address);
  if (!query.trim()) {
    return null;
  }

  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "1",
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: {
        "User-Agent": NOMINATIM_USER_AGENT,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    return null;
  }

  const matches = (await response.json()) as Array<{
    lat: string;
    lon: string;
    display_name?: string;
  }>;

  const match = matches[0];
  if (!match) {
    return null;
  }

  const latitude = Number.parseFloat(match.lat);
  const longitude = Number.parseFloat(match.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const region =
    address.city?.trim() ||
    address.province?.trim() ||
    match.display_name?.split(",")[0]?.trim() ||
    null;

  return { latitude, longitude, region };
}

export async function geocodeShippingAddress(
  address: StoredShippingAddress,
  ukLookup?: Map<string, GeocodeResult>,
): Promise<GeocodeResult | null> {
  const manualKey = manualLocationKey(address);
  if (manualKey && MANUAL_LOCATIONS[manualKey]) {
    return MANUAL_LOCATIONS[manualKey];
  }

  if (isUkAddress(address) && address.zip?.trim()) {
    const normalized = normalizeUkPostcode(address.zip);
    const cached = ukLookup?.get(normalized);
    if (cached) {
      return cached;
    }

    const batch = await lookupUkPostcodesBatch([normalized]);
    const result = batch.get(normalized);
    if (result) {
      return result;
    }
  }

  if (isUkAddress(address) && address.city?.trim()) {
    const placeResult = await lookupUkPlaceForAddress(address);
    if (placeResult) {
      return placeResult;
    }
  }

  return geocodeWithNominatim(address);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type PendingGeocodeRow = {
  shopify_id: number;
  shipping_address1: string | null;
  shipping_address2: string | null;
  shipping_city: string | null;
  shipping_province: string | null;
  shipping_zip: string | null;
  shipping_country: string | null;
  shipping_country_code: string | null;
};

function rowToAddress(row: PendingGeocodeRow): StoredShippingAddress | null {
  const address: StoredShippingAddress = {
    address1: row.shipping_address1,
    address2: row.shipping_address2,
    city: row.shipping_city,
    province: row.shipping_province,
    zip: row.shipping_zip,
    country: row.shipping_country,
    countryCode: row.shipping_country_code,
    phone: null,
  };

  const hasContent = [
    address.address1,
    address.city,
    address.province,
    address.zip,
  ].some(Boolean);

  return hasContent ? address : null;
}

export async function geocodePendingOrders(options?: {
  limit?: number;
}): Promise<{ geocoded: number; failed: number; skipped: number }> {
  if (!isSupabaseConfigured()) {
    return { geocoded: 0, failed: 0, skipped: 0 };
  }

  const supabase = createSupabaseAdmin();
  const { data: rows, error } = await supabase
    .from("orders")
    .select(
      "shopify_id, shipping_address1, shipping_address2, shipping_city, shipping_province, shipping_zip, shipping_country, shipping_country_code",
    )
    .is("latitude", null)
    .or(
      "shipping_zip.not.is.null,shipping_city.not.is.null,shipping_address1.not.is.null",
    )
    .limit(options?.limit ?? 1000);

  if (error) {
    throw new Error(error.message);
  }

  if (!rows?.length) {
    return { geocoded: 0, failed: 0, skipped: 0 };
  }

  const pending = rows
    .map((row) => ({
      row,
      address: rowToAddress(row as PendingGeocodeRow),
    }))
    .filter((entry) => entry.address != null) as Array<{
    row: PendingGeocodeRow;
    address: StoredShippingAddress;
  }>;

  if (!pending.length) {
    return { geocoded: 0, failed: 0, skipped: rows.length };
  }

  const ukPostcodes = [
    ...new Set(
      pending
        .filter(({ address }) => isUkAddress(address) && address.zip?.trim())
        .map(({ address }) => normalizeUkPostcode(address.zip!.trim())),
    ),
  ];

  const ukLookup = new Map<string, GeocodeResult>();
  for (let i = 0; i < ukPostcodes.length; i += 100) {
    const batch = ukPostcodes.slice(i, i + 100);
    const batchResults = await lookupUkPostcodesBatch(batch);
    for (const [postcode, result] of batchResults) {
      ukLookup.set(postcode, result);
    }
  }

  let geocoded = 0;
  let failed = 0;
  let nominatimUsed = 0;

  for (const { row, address } of pending) {
    const manualKey = manualLocationKey(address);
    const isUk = isUkAddress(address);
    let result: GeocodeResult | null =
      manualKey && MANUAL_LOCATIONS[manualKey]
        ? MANUAL_LOCATIONS[manualKey]
        : null;

    if (!result && isUk && address.zip?.trim()) {
      result =
        ukLookup.get(normalizeUkPostcode(address.zip.trim())) ??
        (await geocodeShippingAddress(address, ukLookup));
    } else if (!result && isUk && address.city?.trim()) {
      result = await geocodeShippingAddress(address, ukLookup);
    } else if (!result) {
      if (nominatimUsed > 0) {
        await sleep(1100);
      }
      nominatimUsed += 1;
      result = await geocodeShippingAddress(address, ukLookup);
    }

    if (!result) {
      failed += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        latitude: result.latitude,
        longitude: result.longitude,
        geocode_region: result.region,
        geocoded_at: new Date().toISOString(),
      })
      .eq("shopify_id", row.shopify_id);

    if (updateError) {
      failed += 1;
    } else {
      geocoded += 1;
    }
  }

  return {
    geocoded,
    failed,
    skipped: rows.length - pending.length,
  };
}
