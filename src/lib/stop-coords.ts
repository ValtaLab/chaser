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
 * @returns Coordinates {lat, lng} + name or null if not found
 */
export async function getStopCoordinates(
  stopId: string,
  company: 'KMB' | 'CTB'
): Promise<{ lat: number; lng: number; nameZh?: string } | null> {
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
      nameZh: data.name_tc,
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

  // Handle MTR segments — always refresh from calibrated table (stale/wrong coords common)
  if (segment.route.type === 'mtr') {
    const line = segment.route.name;
    const resolve = (id: string, nameZh: string, name: string) => {
      const code = (id || '').toUpperCase();
      const byLine = MTR_STATIONS.find(
        s => s.line === line && (s.stationCode === code || s.name_tc === nameZh || s.name_tc === name || s.name_en === name)
      );
      if (byLine) return { lat: byLine.lat, lng: byLine.lng };
      const byName = MTR_STATIONS.find(s => s.name_tc === nameZh || s.name_tc === name);
      if (byName) return { lat: byName.lat, lng: byName.lng };
      const byCode = getMTRStationCoords(id);
      return byCode;
    };
    const from = resolve(segment.fromStop.id, segment.fromStop.nameZh, segment.fromStop.name);
    if (from) enriched.fromStop = { ...enriched.fromStop, location: from };
    const to = resolve(segment.toStop.id, segment.toStop.nameZh, segment.toStop.name);
    if (to) enriched.toStop = { ...enriched.toStop, location: to };
    return enriched;
  }

  // Handle bus/minibus segments with API fetch
  // ALWAYS refetch coordinates — stored coords may be stale/wrong
  const company = getSegmentCompany(segment);

  if (company) {
    // Always refetch fromStop coordinates + name
    const origCoords = segment.fromStop.location;
    console.log(`[Coords] fromStop "${segment.fromStop.nameZh}" id=${segment.fromStop.id} company=${company} orig=(${origCoords?.lat},${origCoords?.lng})`);
    let coords = await getStopCoordinates(segment.fromStop.id, company);
    console.log(`[Coords] KMB result:`, coords);
    
    // If KMB returns a stop with wrong name, try Citybus API + name search
    if (coords && coords.nameZh && segment.fromStop.nameZh &&
        !coords.nameZh.includes(segment.fromStop.nameZh.replace(/[()（）]/g,'').slice(0,3)) &&
        !segment.fromStop.nameZh.includes(coords.nameZh.replace(/[()（）]/g,'').slice(0,3))) {
      console.log(`[Coords] Name mismatch! KMB="${coords.nameZh}" stored="${segment.fromStop.nameZh}"`);
      // Try CTB API with same ID (might be joint-operated)
      const ctbCoords = await getStopCoordinates(segment.fromStop.id, 'CTB');
      console.log(`[Coords] CTB direct:`, ctbCoords);
      if (ctbCoords) {
        coords = ctbCoords;
      } else {
        // CTB failed too — search by name in Citybus route stops
        console.log(`[Coords] Searching Citybus route ${segment.route.name} for "${segment.fromStop.nameZh}"...`);
        coords = await findBusStopCoordsByName(
          {...segment, route: {...segment.route, operator: 'citybus'}} as any, 'CTB', 'from'
        );
        console.log(`[Coords] Name search result:`, coords);
      }
    }
    
    if (!coords) {
      coords = await findBusStopCoordsByName(segment, company, 'from');
    }
    if (coords) {
      enriched.fromStop = { ...enriched.fromStop, location: { lat: coords.lat, lng: coords.lng } };
      if (coords.nameZh) {
        enriched.fromStop = { ...enriched.fromStop, nameZh: coords.nameZh, name: coords.nameZh };
      }
      console.log(`[Coords] FINAL fromStop: (${coords.lat},${coords.lng}) name="${coords.nameZh}"`);
    } else {
      console.log(`[Coords] FAILED to resolve fromStop coordinates`);
    }

    // Always refetch toStop coordinates + name
    coords = await getStopCoordinates(segment.toStop.id, company);
    
    if (coords && coords.nameZh && segment.toStop.nameZh &&
        !coords.nameZh.includes(segment.toStop.nameZh.replace(/[()（）]/g,'').slice(0,3)) &&
        !segment.toStop.nameZh.includes(coords.nameZh.replace(/[()（）]/g,'').slice(0,3))) {
      const ctbCoords = await getStopCoordinates(segment.toStop.id, 'CTB');
      if (ctbCoords) {
        coords = ctbCoords;
      } else {
        coords = await findBusStopCoordsByName(
          {...segment, route: {...segment.route, operator: 'citybus'}} as any, 'CTB', 'to'
        );
      }
    }
    
    if (!coords) {
      coords = await findBusStopCoordsByName(segment, company, 'to');
    }
    if (coords) {
      enriched.toStop = { ...enriched.toStop, location: { lat: coords.lat, lng: coords.lng } };
      if (coords.nameZh) {
        enriched.toStop = { ...enriched.toStop, nameZh: coords.nameZh, name: coords.nameZh };
      }
    }
  }

  return enriched;
}

// Fallback: fetch bus stop coords by searching the route's stop list for matching Chinese name
async function findBusStopCoordsByName(
  segment: CommuteSegment,
  company: 'KMB' | 'CTB',
  which: 'from' | 'to'
): Promise<{ lat: number; lng: number; nameZh?: string } | null> {
  try {
    const stopName = which === 'from'
      ? (segment.fromStop.nameZh || segment.fromStop.name)
      : (segment.toStop.nameZh || segment.toStop.name);
    const routeName = segment.route.name;
    
    // Try both directions
    for (const dir of ['outbound', 'inbound']) {
      let url: string;
      if (company === 'CTB') {
        url = `https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/${routeName.toUpperCase()}/${dir}`;
      } else {
        url = `https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${routeName}/${dir}/1`;
      }
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const stops: { stop: string; seq: number }[] = (data.data || []);
      for (const s of stops) {
        let infoUrl: string;
        if (company === 'CTB') {
          infoUrl = `https://rt.data.gov.hk/v2/transport/citybus/stop/${s.stop}`;
        } else {
          infoUrl = `https://data.etabus.gov.hk/v1/transport/kmb/stop/${s.stop}`;
        }
        const infoRes = await fetch(infoUrl);
        if (!infoRes.ok) continue;
        const info = await infoRes.json();
        const infoData = info.data;
        if (infoData && (infoData.name_tc === stopName || infoData.name_en === stopName ||
            infoData.name_tc?.startsWith(stopName) || infoData.name_en?.startsWith(stopName) ||
            infoData.name_tc?.includes(stopName) || infoData.name_en?.includes(stopName) ||
            stopName.includes(infoData.name_tc?.replace(/[,，].*/,'')?.trim() || '') ||
            infoData.name_tc?.split(/[,，]/).some((part: string) => stopName.includes(part.trim())))) {
          return { lat: infoData.lat, lng: infoData.long || infoData.lng, nameZh: infoData.name_tc };
        }
      }
    }
  } catch { /* silent */ }
  return null;
}
