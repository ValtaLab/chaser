// Green Minibus (GMB) API client
// https://data.etagmb.gov.hk

const GMB_BASE = 'https://data.etagmb.gov.hk';

export interface GMBRoute {
  route_id: number;
  region: 'HKI' | 'KLN' | 'NT';
  route_code: string;
  description_tc: string;
  description_en: string;
  directions: GMBDirection[];
}

export interface GMBDirection {
  route_seq: number;
  orig_tc: string;
  orig_en: string;
  dest_tc: string;
  dest_en: string;
}

export interface GMBStop {
  stop_seq: number;
  stop_id: number;
  name_tc: string;
  name_sc: string;
  name_en: string;
}

export interface GMBStopCoords {
  latitude: number;
  longitude: number;
}

export interface GMBETA {
  route_id: number;
  route_seq: number;
  stop_seq: number;
  enabled: boolean;
  eta: Array<{
    eta_seq: number;
    diff: number; // minutes
    timestamp: string;
    remarks_tc: string;
    remarks_en: string;
  }>;
}

// ============ Route Info ============

export async function getGMBRoutes(): Promise<{ HKI: string[]; KLN: string[]; NT: string[] }> {
  const res = await fetch(`${GMB_BASE}/route`);
  const data = await res.json();
  return data.data.routes;
}

export async function getGMBRouteInfo(region: string, routeCode: string): Promise<GMBRoute[]> {
  const res = await fetch(`${GMB_BASE}/route/${region}/${routeCode}`);
  const data = await res.json();
  return data.data || [];
}

// ============ Stops ============

export async function getGMBRouteStops(
  routeId: number,
  routeSeq: number
): Promise<GMBStop[]> {
  const res = await fetch(`${GMB_BASE}/route-stop/${routeId}/${routeSeq}`);
  const data = await res.json();
  return data.data?.route_stops || [];
}

export async function getGMBStopCoords(stopId: number): Promise<GMBStopCoords | null> {
  const res = await fetch(`${GMB_BASE}/stop/${stopId}`);
  const data = await res.json();
  return data.data?.coordinates?.wgs84 || null;
}

// ============ ETA ============

export async function getGMBStopETA(stopId: number): Promise<GMBETA[]> {
  const res = await fetch(`${GMB_BASE}/eta/stop/${stopId}`);
  const data = await res.json();
  return data.data || [];
}

// ============ Combined ETA ============

export interface GMBStopETAInfo {
  route: string;
  destination: string;
  minutesAway: number;
  remark: string;
}

export async function getGMBStopETASummary(
  stopId: number,
  routeCode?: string
): Promise<GMBStopETAInfo[]> {
  const etas = await getGMBStopETA(stopId);
  // ETA payload uses route_id; a route code can map to multiple variants
  const filterRouteIds = new Set<number>();
  if (routeCode) {
    for (const region of ['HKI', 'KLN', 'NT'] as const) {
      try {
        const routes = await getGMBRouteInfo(region, routeCode);
        for (const r of routes) {
          if (r?.route_id) filterRouteIds.add(r.route_id);
        }
      } catch { /* try next region */ }
    }
  }

  const results: GMBStopETAInfo[] = [];

  for (const entry of etas) {
    if (!entry.enabled || !entry.eta?.length) continue;
    if (filterRouteIds.size > 0 && !filterRouteIds.has(entry.route_id)) continue;

    for (const eta of entry.eta) {
      if (eta.diff == null || Number.isNaN(eta.diff)) continue;
      results.push({
        route: routeCode || `Route ${entry.route_id}`,
        destination: '',
        minutesAway: Math.max(0, eta.diff),
        remark: eta.remarks_tc || '',
      });
    }
  }

  return results.sort((a, b) => a.minutesAway - b.minutesAway);
}

// ============ Route Search ============

export async function searchGMBStops(
  region: string,
  routeCode: string,
  direction: number = 1
): Promise<Array<{ stopId: number; name: string; seq: number }>> {
  const routes = await getGMBRouteInfo(region, routeCode);
  if (!routes.length) return [];

  const route = routes[0];
  const stops = await getGMBRouteStops(route.route_id, direction);

  return stops.map(s => ({
    stopId: s.stop_id,
    name: s.name_tc,
    seq: s.stop_seq,
  }));
}

/** Resolve all GMB route variants for a route code across HKI/KLN/NT. */
export async function resolveGMBRoutes(routeCode: string): Promise<GMBRoute[]> {
  const out: GMBRoute[] = [];
  for (const region of ['HKI', 'KLN', 'NT'] as const) {
    try {
      const routes = await getGMBRouteInfo(region, routeCode);
      out.push(...routes);
    } catch { /* next */ }
  }
  return out;
}

function matchGMBStopId(stop: GMBStop, stopId: string, nameHint?: string): boolean {
  const id = String(stopId).trim();
  if (id && String(stop.stop_id) === id) return true;
  // name fallback (saved routes sometimes have wrong/stale ids)
  if (nameHint) {
    const n = nameHint.replace(/\s+/g, '');
    const tc = (stop.name_tc || '').replace(/\s+/g, '');
    if (n && tc && (tc.includes(n.slice(0, 4)) || n.includes(tc.slice(0, 4)))) return true;
  }
  return false;
}

/**
 * Build boarding→alighting stop coordinate path for a GMB route.
 * Tries all regions / route_id variants / directions.
 */
export async function findGMBPathBetweenStops(
  routeCode: string,
  fromStopId: string,
  toStopId: string,
  fromName?: string,
  toName?: string,
): Promise<Array<{ lat: number; lng: number }> | null> {
  const variants = await resolveGMBRoutes(routeCode);
  if (!variants.length) return null;

  for (const route of variants) {
    const seqs =
      route.directions?.length > 0
        ? route.directions.map(d => d.route_seq)
        : [1, 2];

    for (const seq of seqs) {
      try {
        const stops = await getGMBRouteStops(route.route_id, seq);
        if (!stops.length) continue;

        let fromIdx = stops.findIndex(s => matchGMBStopId(s, fromStopId, fromName));
        let toIdx = stops.findIndex(s => matchGMBStopId(s, toStopId, toName));
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) continue;

        // Allow reverse order on same list only if seq is wrong direction — skip unless from < to
        if (fromIdx > toIdx) continue;

        const slice = stops.slice(fromIdx, toIdx + 1);
        // Cap coordinate fetches — dense GMB routes can be 40+ stops
        const step = slice.length > 24 ? Math.ceil(slice.length / 20) : 1;
        const sampled: GMBStop[] = [];
        for (let i = 0; i < slice.length; i++) {
          if (i === 0 || i === slice.length - 1 || i % step === 0) sampled.push(slice[i]);
        }

        const coords = await Promise.all(
          sampled.map(async (s) => {
            const c = await getGMBStopCoords(s.stop_id);
            if (!c) return null;
            return { lat: c.latitude, lng: c.longitude };
          }),
        );
        const valid = coords.filter((c): c is { lat: number; lng: number } => c != null);
        if (valid.length >= 2) return valid;
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

// ============ Popular Routes ============

export const POPULAR_GMB_ROUTES: Array<{
  region: string;
  code: string;
  name_tc: string;
  name_en: string;
}> = [
  { region: 'HKI', code: '1', name_tc: '中環—山頂', name_en: 'Central - The Peak' },
  { region: 'HKI', code: '1A', name_tc: '中環—銅鑼灣', name_en: 'Central - Causeway Bay' },
  { region: 'KLN', code: '12', name_tc: '尖沙咀—奧運站', name_en: 'TST - Olympic' },
  { region: 'KLN', code: '46', name_tc: '九龍城—尖沙咀', name_en: 'Kowloon City - TST' },
  { region: 'NT', code: '101M', name_tc: '西灣河—將軍澳', name_en: 'Sai Wan Ho - Tseung Kwan O' },
  { region: 'NT', code: '481', name_tc: '火炭—沙田', name_en: 'Fo Tan - Sha Tin' },
];
