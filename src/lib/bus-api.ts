// Data.gov.hk API client for KMB and Citybus
// https://data.gov.hk/en-data/dataset/hk-td-tis_21-etasdc

const KMB_ETA_BASE = 'https://data.etabus.gov.hk/v1/transport/kmb';
const CITYBUS_ETA_BASE = 'https://rt.data.gov.hk/v2/transport/citybus';

export interface BusRoute {
  route: string;
  bound: 'I' | 'O';  // Inbound / Outbound
  service_type: string;
  orig_en: string;
  orig_tc: string;
  dest_en: string;
  dest_tc: string;
}

export interface BusStop {
  stop: string;
  name_en: string;
  name_tc: string;
  name_sc: string;
  lat: number;
  long: number;
}

export interface BusETA {
  co: string;          // Company: KMB or CTB
  route: string;
  dir: string;
  service_type: string;
  seq: string;
  stop: string;
  dest_tc: string;
  dest_en: string;
  eta_seq: number;
  eta: string;         // ISO datetime
  rmk_tc: string;
  rmk_en: string;
  data_timestamp: string;
}

// ============ Route Info ============

export async function getKMBRouteInfo(route: string): Promise<BusRoute[]> {
  // /route/{route} endpoint is broken for some routes, use route list instead
  const res = await fetch(`${KMB_ETA_BASE}/route/`);
  const data = await res.json();
  const allRoutes: BusRoute[] = data.data || [];
  return allRoutes.filter(r => r.route.toUpperCase() === route.toUpperCase());
}

export async function getCitybusRouteInfo(route: string): Promise<BusRoute[]> {
  const res = await fetch(`${CITYBUS_ETA_BASE}/route/CTB/${route.toUpperCase()}`);
  const data = await res.json();
  // Citybus returns empty object {} when no route found
  const result = data.data;
  if (!result || typeof result !== 'object' || Object.keys(result).length === 0) return [];
  return Array.isArray(result) ? result : [result];
}

// ============ Stops ============

export async function getKMBRouteStops(
  route: string,
  bound: 'I' | 'O',
  serviceType: string = '1'
): Promise<{ stop: string; seq: number }[]> {
  const direction = bound === 'O' ? 'outbound' : 'inbound';
  const res = await fetch(
    `${KMB_ETA_BASE}/route-stop/${route}/${direction}/${serviceType}`
  );
  const data = await res.json();
  return (data.data || []).map((s: { stop: string; seq: string }) => ({
    stop: s.stop,
    seq: parseInt(s.seq),
  }));
}

export async function getKMBStopInfo(stopId: string): Promise<BusStop | null> {
  const res = await fetch(`${KMB_ETA_BASE}/stop/${stopId}`);
  const data = await res.json();
  return data.data || null;
}

export async function getCitybusStopInfo(stopId: string): Promise<BusStop | null> {
  const res = await fetch(`${CITYBUS_ETA_BASE}/stop/${stopId}`);
  const data = await res.json();
  return data.data || null;
}

export async function getCitybusRouteStops(
  route: string,
  direction: 'I' | 'O'
): Promise<{ stop: string; seq: number }[]> {
  const dir = direction === 'O' ? 'outbound' : 'inbound';
  const res = await fetch(
    `${CITYBUS_ETA_BASE}/route-stop/CTB/${route.toUpperCase()}/${dir}`
  );
  const data = await res.json();
  return (data.data || []).map((s: { stop: string; seq: string }) => ({
    stop: s.stop,
    seq: parseInt(s.seq),
  }));
}

// ============ ETA ============

export async function getKMBStopETA(
  stopId: string,
  route?: string
): Promise<BusETA[]> {
  // KMB ETA API route filter is broken — always fetch all, filter client-side
  const url = `${KMB_ETA_BASE}/stop-eta/${stopId}`;
  
  const res = await fetch(url);
  const data = await res.json();
  const etas: BusETA[] = data.data || [];
  
  // Filter by route client-side if specified
  if (route) {
    return etas.filter(e => e.route.toUpperCase() === route.toUpperCase());
  }
  return etas;
}

export async function getCitybusStopETA(
  stopId: string,
  route?: string
): Promise<BusETA[]> {
  let url = `${CITYBUS_ETA_BASE}/eta/CTB/${stopId}`;
  if (route) url += `/${route}`;
  
  const res = await fetch(url);
  const data = await res.json();
  return data.data || [];
}

// ============ Combined ETA ============

export interface StopETA {
  company: 'KMB' | 'CTB';
  route: string;
  destination: string;
  minutesAway: number;
  etaTime: Date | null;
  remark: string;
}

export async function getStopETA(
  stopId: string,
  company: 'KMB' | 'CTB',
  route?: string
): Promise<StopETA[]> {
  const rawETAs = company === 'KMB'
    ? await getKMBStopETA(stopId, route)
    : await getCitybusStopETA(stopId, route);

  const now = new Date();

  return rawETAs
    .map(eta => {
      const etaTime = eta.eta ? new Date(eta.eta) : null;
      const minutesAway = etaTime
        ? Math.max(0, Math.round((etaTime.getTime() - now.getTime()) / 60000))
        : -1;  // -1 = no valid time (e.g. "最後班次已過")
      return {
        company: company,
        route: eta.route,
        destination: eta.dest_tc,
        minutesAway,
        etaTime,
        remark: eta.rmk_tc,
      };
    })
    .sort((a, b) => a.minutesAway - b.minutesAway);
}

// ============ Citybus Stop ID Lookup (for joint-operated routes) ============

// Module-level cache: key=`${route}_${direction}`, value=Map<stopNameZh, stopId>
const citybusStopNameCache = new Map<string, Map<string, string>>();

/**
 * Find a Citybus stop ID for a given route, direction, and Chinese stop name.
 * Used for joint-operated routes (聯營線) like 307P where both KMB and Citybus serve the same route.
 * Results are cached to avoid repeated API calls.
 */
export async function findCitybusStopIdByRouteAndName(
  route: string,
  stopNameZh: string,
  direction: 'I' | 'O'
): Promise<string | null> {
  const cacheKey = `${route.toUpperCase()}_${direction}`;

  // Build cache if not exists
  if (!citybusStopNameCache.has(cacheKey)) {
    const stops = await getCitybusRouteStops(route, direction);
    const nameMap = new Map<string, string>();

    for (const s of stops) {
      try {
        const info = await getCitybusStopInfo(s.stop);
        if (info?.name_tc) {
          nameMap.set(info.name_tc, s.stop);
          // Also store without parenthetical suffix like "(TP930)"
          const baseName = info.name_tc.replace(/\s*\(.*?\)\s*$/, '').trim();
          if (baseName !== info.name_tc) {
            nameMap.set(baseName, s.stop);
          }
          // Also store without comma suffix like "港運城, 英皇道" → "港運城"
          const commaName = info.name_tc.replace(/\s*,\s*.*$/, '').trim();
          if (commaName !== info.name_tc && commaName !== baseName && !nameMap.has(commaName)) {
            nameMap.set(commaName, s.stop);
          }
        }
      } catch {
        // skip stops that fail to load
      }
    }
    citybusStopNameCache.set(cacheKey, nameMap);
  }

  const nameMap = citybusStopNameCache.get(cacheKey)!;

  // Helper: strip trailing parenthetical suffixes like "(TP340)", "(LT410)"
  const stripSuffix = (s: string) => s.replace(/\s*\(.*?\)\s*$/, '').trim();

  // Exact match first
  if (nameMap.has(stopNameZh)) return nameMap.get(stopNameZh)!;

  // Try base name (KMB often appends (TPxxx) suffixes to Tai Po stops)
  const baseStopName = stripSuffix(stopNameZh);
  if (baseStopName !== stopNameZh && nameMap.has(baseStopName)) {
    return nameMap.get(baseStopName)!;
  }

  // Then try startsWith/contains matching
  // KMB sometimes returns names without suffixes while Citybus has them
  for (const [name, id] of nameMap) {
    if (name.startsWith(stopNameZh) || stopNameZh.startsWith(name)) return id;
    if (name.includes(stopNameZh) || stopNameZh.includes(name)) return id;
  }

  // Retry with base name if original had a suffix (catches "(TPxxx)" → ", Area" cases)
  if (baseStopName !== stopNameZh) {
    for (const [name, id] of nameMap) {
      if (name.startsWith(baseStopName) || baseStopName.startsWith(name)) return id;
      if (name.includes(baseStopName) || baseStopName.includes(name)) return id;
    }
  }

  return null;
}

// ============ Route Search ============

export async function searchKMBStops(
  route: string,
  direction: 'outbound' | 'inbound'
): Promise<Array<{ stopId: string; name: string; seq: number }>> {
  const bound = direction === 'outbound' ? 'O' : 'I';
  const stops = await getKMBRouteStops(route, bound);
  
  const results = await Promise.all(
    stops.map(async (s) => {
      const info = await getKMBStopInfo(s.stop);
      return {
        stopId: s.stop,
        name: info?.name_tc || s.stop,
        seq: s.seq,
      };
    })
  );
  
  return results;
}

// ============ Nearby Stops ============

export async function findNearbyStops(
  lat: number,
  lng: number,
  radiusMeters: number = 500
): Promise<Array<{ stop: BusStop; distance: number; company: 'KMB' | 'CTB' }>> {
  // KMB doesn't have a direct nearby endpoint, so we'd need to cache stops
  // For now, return empty - we'll implement with cached stop data
  return [];
}

// Helper: haversine distance in meters
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
