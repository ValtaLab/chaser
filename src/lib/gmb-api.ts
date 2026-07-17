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
    if (!n || !tc) return false;
    // Prefer meaningful overlap (≥2 chars) — avoid over-match on single chars
    const key = n.slice(0, Math.min(6, n.length));
    if (key.length >= 2 && (tc.includes(key) || n.includes(tc.slice(0, Math.min(6, tc.length))))) {
      return true;
    }
  }
  return false;
}

function findGMBStopIndex(
  stops: GMBStop[],
  stopId: string,
  nameHint: string | undefined,
  startFrom: number,
): number {
  // 1) Exact id after startFrom (circular: scan with wrap once)
  const id = String(stopId).trim();
  if (id) {
    for (let i = startFrom; i < stops.length; i++) {
      if (String(stops[i].stop_id) === id) return i;
    }
    if (startFrom > 0) {
      for (let i = 0; i < startFrom; i++) {
        if (String(stops[i].stop_id) === id) return i;
      }
    }
  }
  // 2) Name after startFrom
  if (nameHint) {
    for (let i = startFrom; i < stops.length; i++) {
      if (matchGMBStopId(stops[i], '', nameHint)) return i;
    }
    if (startFrom > 0) {
      for (let i = 0; i < startFrom; i++) {
        if (matchGMBStopId(stops[i], '', nameHint)) return i;
      }
    }
  }
  // 3) Full scan id/name from 0
  const full = stops.findIndex(s => matchGMBStopId(s, stopId, nameHint));
  return full;
}

/**
 * Build boarding→alighting stop coordinate path for a GMB route.
 * Uses official stop sequence coords only — do NOT OSRM-snap (hilly HK + sparse
 * waypoints produces wild loops on circular routes e.g. HKI 23).
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

  // Prefer HKI → KLN → NT so "23" maps to Kennedy Town not Kwun Tong first
  const regionRank = (r: string) => (r === 'HKI' ? 0 : r === 'KLN' ? 1 : 2);
  const ordered = [...variants].sort(
    (a, b) => regionRank(a.region) - regionRank(b.region),
  );

  for (const route of ordered) {
    const seqs =
      route.directions?.length > 0
        ? route.directions.map(d => d.route_seq)
        : [1, 2];

    for (const seq of seqs) {
      try {
        const stops = await getGMBRouteStops(route.route_id, seq);
        if (stops.length < 2) continue;

        // Circular routes often repeat terminus as last stop — keep for wrap math
        const fromIdx = findGMBStopIndex(stops, fromStopId, fromName, 0);
        if (fromIdx < 0) continue;
        let toIdx = findGMBStopIndex(stops, toStopId, toName, fromIdx + 1);
        if (toIdx < 0) {
          toIdx = findGMBStopIndex(stops, toStopId, toName, 0);
        }
        if (toIdx < 0 || toIdx === fromIdx) continue;

        // Linear slice or wrap for circular (e.g. board late, alight past terminus)
        let slice: GMBStop[];
        if (fromIdx < toIdx) {
          slice = stops.slice(fromIdx, toIdx + 1);
        } else {
          // wrap: fromIdx → end + start → toIdx
          slice = [...stops.slice(fromIdx), ...stops.slice(0, toIdx + 1)];
        }
        // Drop consecutive duplicate stop_ids (circular list head=tail)
        const deduped: GMBStop[] = [];
        for (const s of slice) {
          if (deduped.length && deduped[deduped.length - 1].stop_id === s.stop_id) continue;
          deduped.push(s);
        }
        if (deduped.length < 2) continue;

        // Fetch ALL intermediate stop coords (not sparse) — denser polyline, no OSRM
        const coords = await Promise.all(
          deduped.map(async (s) => {
            const c = await getGMBStopCoords(s.stop_id);
            if (!c) return null;
            return { lat: c.latitude, lng: c.longitude };
          }),
        );
        const valid: Array<{ lat: number; lng: number }> = [];
        for (const c of coords) {
          if (!c) continue;
          // Drop near-duplicate consecutive points (<15m)
          if (valid.length) {
            const p = valid[valid.length - 1];
            const dlat = (c.lat - p.lat) * 111000;
            const dlng = (c.lng - p.lng) * 111000 * Math.cos((c.lat * Math.PI) / 180);
            if (dlat * dlat + dlng * dlng < 15 * 15) continue;
          }
          valid.push(c);
        }
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
