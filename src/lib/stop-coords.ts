// Stop coordinate fetching utility
// Fetches real GPS coordinates for bus stops from KMB/Citybus APIs
// For MTR, uses a built-in station coordinate lookup

import type { CommuteSegment } from '@/types';
import { MTR_STATIONS } from './mtr-api';

// ============ MTR Station Coordinates (derived from MTR_STATIONS) ============

// Single source of truth: all coords come from MTR_STATIONS in mtr-api.ts
const MTR_COORDS: Record<string, { lat: number; lng: number }> = Object.fromEntries(
  MTR_STATIONS.map(s => [s.stationCode, { lat: s.lat, lng: s.lng }])
);

// ============ API Fetchers ============

const KMB_BASE = 'https://data.etabus.gov.hk/v1/transport/kmb';
const CTB_BASE = 'https://rt.data.gov.hk/v2/transport/citybus';

interface StopAPIResponse {
  data: {
    stop: string;
    name_tc: string;
    name_en: string;
    lat: number;
    long: number; // Note: KMB uses 'long' not 'lng'
  };
}

/**
 * Fetch real GPS coordinates for a bus stop from the KMB or Citybus API.
 * @param stopId - The stop ID (e.g. "BFA340" for KMB, "001001" for Citybus)
 * @param company - 'KMB' or 'CTB'
 * @returns Coordinates {lat, lng} or null if not found
 */
export async function getStopCoordinates(
  stopId: string,
  company: 'KMB' | 'CTB'
): Promise<{ lat: number; lng: number } | null> {
  try {
    const baseUrl = company === 'KMB' ? KMB_BASE : CTB_BASE;
    const url = `${baseUrl}/stop/${stopId}`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const json: StopAPIResponse = await res.json();
    const data = json.data;

    if (!data || data.lat === undefined || data.long === undefined) {
      return null;
    }

    return {
      lat: data.lat,
      lng: data.long, // API uses 'long', we normalize to 'lng'
    };
  } catch (err) {
    console.error(`Failed to fetch coordinates for stop ${stopId} (${company}):`, err);
    return null;
  }
}

/**
 * Get MTR station coordinates from the built-in lookup.
 * Matches by station code from the MTR_STATIONS list.
 */
function getMTRStationCoords(stationCode: string): { lat: number; lng: number } | null {
  // Try direct lookup first
  const coords = MTR_COORDS[stationCode];
  if (coords) return coords;

  // Some stations appear on multiple lines with the same code
  // The MTR_COORDS map covers all codes used in MTR_STATIONS
  return null;
}

/**
 * Determine the transport company from a CommuteSegment's route.
 * Returns the company identifier for API calls.
 */
function getSegmentCompany(segment: CommuteSegment): 'KMB' | 'CTB' | null {
  const operator = segment.route.operator;
  if (operator === 'kmb') return 'KMB';
  if (operator === 'citybus') return 'CTB';
  return null; // MTR, NLB, GMB, etc.
}

/**
 * Enrich a CommuteSegment with real GPS coordinates for its stops.
 * Only fetches if current location is {lat:0, lng:0} (unset).
 * For MTR segments, uses the built-in station coordinate lookup.
 * For bus/minibus segments, fetches from KMB or Citybus API.
 *
 * @param segment - The commute segment to enrich
 * @returns The segment with updated stop locations
 */
export async function enrichSegmentWithCoords(segment: CommuteSegment): Promise<CommuteSegment> {
  const isZero = (loc: { lat: number; lng: number }) =>
    !loc || loc.lat == null || loc.lng == null || (loc.lat === 0 && loc.lng === 0);

  const enriched = { ...segment };

  // Handle MTR segments with built-in coordinates
  if (segment.route.type === 'mtr') {
    if (isZero(segment.fromStop.location)) {
      const coords = getMTRStationCoords(segment.fromStop.id);
      if (coords) {
        enriched.fromStop = { ...enriched.fromStop, location: coords };
      } else {
        // Fallback: try matching by Chinese name
        const station = segment.fromStop.nameZh || segment.fromStop.name;
        const found = MTR_STATIONS.find(s => s.name_tc === station || s.stationCode === station);
        if (found) {
          enriched.fromStop = { ...enriched.fromStop, location: { lat: found.lat, lng: found.lng } };
        }
      }
    }
    if (isZero(segment.toStop.location)) {
      const coords = getMTRStationCoords(segment.toStop.id);
      if (coords) {
        enriched.toStop = { ...enriched.toStop, location: coords };
      } else {
        const station = segment.toStop.nameZh || segment.toStop.name;
        const found = MTR_STATIONS.find(s => s.name_tc === station || s.stationCode === station);
        if (found) {
          enriched.toStop = { ...enriched.toStop, location: { lat: found.lat, lng: found.lng } };
        }
      }
    }
    return enriched;
  }

  // Handle bus/minibus segments with API fetch
  const company = getSegmentCompany(segment);

  if (company && isZero(segment.fromStop.location)) {
    let coords = await getStopCoordinates(segment.fromStop.id, company);
    if (!coords) {
      // Fallback: try KMB route-stop list to find by Chinese name
      coords = await findBusStopCoordsByName(segment, company, 'from');
    }
    if (coords) {
      enriched.fromStop = { ...enriched.fromStop, location: coords };
    }
  }

  if (company && isZero(segment.toStop.location)) {
    let coords = await getStopCoordinates(segment.toStop.id, company);
    if (!coords) {
      coords = await findBusStopCoordsByName(segment, company, 'to');
    }
    if (coords) {
      enriched.toStop = { ...enriched.toStop, location: coords };
    }
  }

  return enriched;
}

// Fallback: fetch bus stop coords by searching the route's stop list for matching Chinese name
async function findBusStopCoordsByName(
  segment: CommuteSegment,
  company: 'KMB' | 'CTB',
  which: 'from' | 'to'
): Promise<{ lat: number; lng: number } | null> {
  try {
    const stopName = which === 'from'
      ? (segment.fromStop.nameZh || segment.fromStop.name)
      : (segment.toStop.nameZh || segment.toStop.name);
    const routeName = segment.route.name;
    const bound = segment.route.id; // could have bound info
    const baseUrl = company === 'KMB'
      ? 'https://data.etabus.gov.hk/v1/transport/kmb'
      : 'https://rt.data.gov.hk/v2/transport/citybus';
    
    // Try both directions
    for (const dir of ['outbound', 'inbound']) {
      const res = await fetch(`${baseUrl}/route-stop/${routeName}/${dir}/1`);
      if (!res.ok) continue;
      const data = await res.json();
      const stops: { stop: string; seq: number }[] = (data.data || []);
      for (const s of stops) {
        const infoRes = await fetch(`${baseUrl}/stop/${s.stop}`);
        if (!infoRes.ok) continue;
        const info = await infoRes.json();
        const infoData = info.data;
        if (infoData && (infoData.name_tc === stopName || infoData.name_en === stopName)) {
          return { lat: infoData.lat, lng: infoData.long || infoData.lng };
        }
      }
    }
  } catch { /* silent */ }
  return null;
}
