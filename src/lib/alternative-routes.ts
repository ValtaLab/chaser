// Alternative route discovery — find faster routes at the same stop
import { getStopETA, type StopETA } from './bus-api';
import { getMTRETA, findStation, getLineStations, MTR_STATIONS, getMTRLineName } from './mtr-api';
import { haversineMeters } from './road-snap';
import type { CommuteSegment, Location } from '../types';

// ─── Types ────────────────────────────────────────────────────────────

export interface AlternativeRoute {
  routeName: string;          // e.g. "380X"
  routeType: 'bus' | 'mtr' | 'gmb' | 'tram';
  destination: string;        // e.g. "佐敦(經大埔道)"
  minutesAway: number;       // next arrival in minutes
  estimatedRideMinutes: number;  // estimated ride time
  totalMinutes: number;      // wait + ride
  savedMinutes: number;      // time saved vs configured route
  company: 'KMB' | 'CTB' | 'MTR' | 'GMB';
  direction: string;         // direction/useful text for user
  confidence: 'high' | 'medium' | 'low';
}

export interface SegmentAlternatives {
  segmentId: string;
  segmentLabel: string;       // e.g. "72X · 富蝶總站"
  configuredRoute: string;     // user's chosen route
  configuredWaitMinutes: number;  // how long user's route arrives
  isLastBusPassed: boolean;    // true if all configured ETAs are -1 (last bus passed)
  alternatives: AlternativeRoute[];  // sorted by time saved (most saved first)
}

// ─── Main function ───────────────────────────────────────────────────

export async function findAlternativesForSegment(
  segment: CommuteSegment,
  configuredETAs: { minutesAway: number; destination: string }[],
): Promise<SegmentAlternatives> {
  // Detect if last bus has passed (all ETAs are -1)
  const isLastBusPassed = configuredETAs.length === 0 || configuredETAs.every(eta => eta.minutesAway < 0);
  
  const result: SegmentAlternatives = {
    segmentId: segment.id,
    segmentLabel: `${segment.route.type === 'mtr' ? getMTRLineName(segment.route.name) : segment.route.name} · ${segment.fromStop.nameZh || segment.fromStop.name}`,
    configuredRoute: segment.route.type === 'mtr' ? getMTRLineName(segment.route.name) : segment.route.name,
    configuredWaitMinutes: isLastBusPassed ? 999 : configuredETAs[0].minutesAway,
    isLastBusPassed,
    alternatives: [],
  };

  // Get user's next bus arrival time
  const userNextArrival = isLastBusPassed ? 999 : configuredETAs[0].minutesAway;

  // ── Bus alternatives ────────────────────────────────────────────
  if (segment.route.type === 'bus') {
    const company: 'KMB' | 'CTB' = segment.route.operator === 'citybus' ? 'CTB' : 'KMB';
    try {
      console.log('[AltRoutes:Bus] Fetching all ETAs at stop', segment.fromStop.id);
      // Fetch ALL routes at this stop (unfiltered)
      const allETAs = await getStopETA(segment.fromStop.id, company);
      console.log('[AltRoutes:Bus] Got', allETAs.length, 'ETAs');
      
      // Group by route, keep earliest ETA per route
      const routeMap = new Map<string, StopETA>();
      for (const eta of allETAs) {
        if (eta.minutesAway < 0) continue;  // skip invalid
        const key = `${eta.company}-${eta.route}`;
        const existing = routeMap.get(key);
        if (!existing || eta.minutesAway < existing.minutesAway) {
          routeMap.set(key, eta);
        }
      }

      console.log('[AltRoutes:Bus] Grouped into', routeMap.size, 'routes');

      // Filter to alternatives (not user's route, heading similar direction)
      const userDestination = segment.toStop.nameZh || segment.toStop.name;
      const userDestinationEn = segment.toStop.name;

      const routeEntries = Array.from(routeMap.values());
      for (const eta of routeEntries) {
        // Skip user's configured route
        if (eta.route.toUpperCase() === segment.route.name.toUpperCase()) continue;

        // Skip routes that arrive much later than user's (>30 min or very long wait)
        // But if last bus has passed, allow up to 120 minutes
        const maxWaitMinutes = isLastBusPassed ? 120 : 60;
        if (eta.minutesAway > maxWaitMinutes) continue;

        // Check if this route actually goes toward and serves the user's destination
        const goesTowardDestination = isGoingToward(
          eta.destination,
          userDestination,
          userDestinationEn,
        );

        console.log('[AltRoutes:Bus]', eta.route, '→', eta.destination, '| match:', goesTowardDestination);

        if (!goesTowardDestination) continue;

        // ── Pass 2: verify the route actually serves the destination stop ──
        // Direct matches are reliable. For "nearby" (area keyword) matches,
        // we need to verify the route's stop sequence to avoid false positives
        // (e.g. circular routes in the same district that don't serve the stop).
        if (goesTowardDestination === 'nearby' && company === 'KMB') {
          // Fetch route info to get bound + service_type
          let routeVerified = false;
          try {
            const { getKMBRouteInfo } = await import('./bus-api');
            const routeInfos = await getKMBRouteInfo(eta.route);
            for (const ri of routeInfos) {
              const verified = await routeServesKMBStop(
                eta.route,
                ri.bound as 'I' | 'O',
                ri.service_type,
                segment.fromStop.id,
                userDestination,
                segment.toStop.location,
              );
              if (verified) {
                routeVerified = true;
                break;
              }
            }
          } catch (err) {
            console.error('[AltRoutes:Bus] Verification error:', eta.route, err);
          }
          if (!routeVerified) {
            console.log('[AltRoutes:Bus]', eta.route, '→ SKIP (does not serve destination stop)');
            continue;
          }
        }

        // Estimate ride time using haversine distance
        const rideMinutes = estimateBusRideMinutes(
          segment.fromStop.location,
          segment.toStop.location,
        );

        const totalMinutes = eta.minutesAway + rideMinutes;
        const savedMinutes = userNextArrival + rideMinutes - totalMinutes;
        // Only recommend if it saves at least 3 minutes (or any time if last bus passed)
        const minSavedMinutes = isLastBusPassed ? 0 : 3;
        if (savedMinutes <= minSavedMinutes) continue;

        const confidence = eta.minutesAway <= 5 ? 'high' :
          eta.minutesAway <= 15 ? 'medium' : 'low';

        result.alternatives.push({
          routeName: eta.route,
          routeType: 'bus',
          destination: eta.destination,
          minutesAway: eta.minutesAway,
          estimatedRideMinutes: rideMinutes,
          totalMinutes,
          savedMinutes,
          company: eta.company as 'KMB' | 'CTB',
          direction: goesTowardDestination === 'direct' ? `往${eta.destination}` : `經${eta.destination}`,
          confidence,
        });
      }
    } catch (err) {
      console.error('Alternative bus route error:', err);
    }
  }

  // ── MTR alternatives ────────────────────────────────────────────
  if (segment.route.type === 'mtr') {
    try {
      // Find interchange lines at the boarding station
      const fromStation = findStation(segment.fromStop.id) ||
        findStation(segment.fromStop.nameZh || segment.fromStop.name);
      
      if (fromStation) {
        // Check other MTR lines that stop at this station
        // Get ETAs for all lines running through this station
        const userStation = fromStation.stationCode;
        const userLine = segment.route.name;

        // Known MTR interchanges: lines that share stations
        const interchangeLines = findInterchangeLines(userStation, userLine);
        
        for (const lineCode of interchangeLines) {
          const etas = await getMTRETA(lineCode, userStation);
          
          // Direction filter: same as we do for user's route
          const toStation = findStation(segment.toStop.id) ||
            findStation(segment.toStop.nameZh || segment.toStop.name);
          
          if (!toStation) continue;

          // Get the first valid ETA for this line going in the right direction
          const validEtas = etas
            .filter(t => t.ttnt && t.ttnt !== '-' && t.ttnt !== '')
            .filter(t => {
              // Check direction: train terminal should be beyond our destination
              const terminalCode = t.destination;
              const stations = getLineStations(lineCode);
              const destIdx = stations.findIndex(s => s.stationCode === toStation.stationCode);
              const terminalIdx = stations.findIndex(s => s.stationCode === terminalCode);
              const fromIdx = stations.findIndex(s => s.stationCode === userStation);
              if (destIdx === -1) return false;  // this line doesn't go to our destination
              if (fromIdx === -1) return false;
              // Direction check
              if (destIdx > fromIdx) return terminalIdx >= destIdx;
              return terminalIdx <= destIdx;
            });

          if (validEtas.length === 0) continue;

          const firstETA = validEtas[0];
          const waitMinutes = parseInt(firstETA.ttnt) || 5;

          // Skip user's own line
          if (lineCode === userLine) continue;

          // Calculate ride time based on station count
          const stations = getLineStations(lineCode);
          const fromIdx = stations.findIndex(s => s.stationCode === userStation);
          const destIdx = stations.findIndex(s => s.stationCode === toStation.stationCode);
          
          if (fromIdx === -1 || destIdx === -1) continue;
          
          const stationCount = Math.abs(destIdx - fromIdx);
          const rideMinutes = Math.max(3, Math.ceil(stationCount * 2.5));
          
          const totalMinutes = waitMinutes + rideMinutes;
          const savedMinutes = userNextArrival - waitMinutes;  // MTR comparison is wait time only (same destination)
          
          if (savedMinutes <= 3) continue;

          const lineStations = getLineStations(lineCode);
          const destStation = lineStations.find(s => s.stationCode === toStation.stationCode);
          const destStationName = destStation?.name_tc || toStation.stationCode;

          result.alternatives.push({
            routeName: getMTRLineName(lineCode),
            routeType: 'mtr',
            destination: destStationName,
            minutesAway: waitMinutes,
            estimatedRideMinutes: rideMinutes,
            totalMinutes,
            savedMinutes,
            company: 'MTR',
            direction: `🚇 ${getMTRLineName(lineCode)} → ${destStationName}`,
            confidence: waitMinutes <= 5 ? 'high' : waitMinutes <= 10 ? 'medium' : 'low',
          });
        }
      }
    } catch (err) {
      console.error('Alternative MTR route error:', err);
    }
  }

  // ── MTR alternatives (for bus routes) ─────────────────────────────────
  if (segment.route.type === 'bus') {
    try {
      console.log('[AltRoutes:MTR] Checking MTR alternatives for bus route');
      const mtrAlts = await findMTRAlternatives(segment, userNextArrival);
      console.log('[AltRoutes:MTR] Found', mtrAlts.length, 'MTR alternatives');
      result.alternatives.push(...mtrAlts);
    } catch (err) {
      console.error('[AltRoutes:MTR] Error:', err);
    }
  }

  // ── Mixed alternatives (Bus+MTR / GMB+MTR) ───────────────────────
  if (segment.route.type === 'bus') {
    try {
      console.log('[AltRoutes:Mixed] Checking mixed alternatives');
      const mixedAlts = await findMixedAlternatives(segment, userNextArrival);
      console.log('[AltRoutes:Mixed] Found', mixedAlts.length, 'mixed alternatives');
      result.alternatives.push(...mixedAlts);
    } catch (err) {
      console.error('[AltRoutes:Mixed] Error:', err);
    }
  }

  // Sort by time saved (most saved first), limit to top 3
  result.alternatives.sort((a, b) => b.savedMinutes - a.savedMinutes);
  result.alternatives = result.alternatives.slice(0, 3);

  return result;
}

// ─── MTR Alternative Discovery ────────────────────────────────────────

async function findMTRAlternatives(
  segment: CommuteSegment,
  busWaitMinutes: number,
): Promise<AlternativeRoute[]> {
  const alternatives: AlternativeRoute[] = [];
  
  const fromLocation = segment.fromStop.location;
  const toLocation = segment.toStop.location;
  
  // Check if coordinates are valid (not zero)
  const isFromValid = fromLocation && typeof fromLocation.lat === 'number' && fromLocation.lat !== 0;
  const isToValid = toLocation && typeof toLocation.lat === 'number' && toLocation.lat !== 0;
  if (!isFromValid || !isToValid) {
    console.log('[AltRoutes:MTR] Invalid coordinates, skipping MTR search');
    return alternatives;
  }
  
  // Find nearby MTR stations — no hard radius limit, find the nearest
  // Calculate walks for ALL stations that are within practical walking distance (2000m)
  const MAX_WALK_M = 2000;
  const stationsWithDist = MTR_STATIONS
    .map(s => ({
      station: s,
      distFrom: haversineMeters(fromLocation, { lat: s.lat, lng: s.lng }),
      distTo: haversineMeters(toLocation, { lat: s.lat, lng: s.lng }),
    }))
    .filter(s => s.distFrom < MAX_WALK_M || s.distTo < MAX_WALK_M);
  
  const nearbyFromStations = stationsWithDist
    .filter(s => s.distFrom < MAX_WALK_M)
    .map(s => ({ ...s.station, walkMeters: s.distFrom }))
    .sort((a, b) => (a as any).walkMeters - (b as any).walkMeters);
  const nearbyToStations = stationsWithDist
    .filter(s => s.distTo < MAX_WALK_M)
    .map(s => ({ ...s.station, walkMeters: s.distTo }))
    .sort((a, b) => (a as any).walkMeters - (b as any).walkMeters);
  
  console.log('[AltRoutes:MTR] Nearby from stations:', nearbyFromStations.length,
    nearbyFromStations.slice(0, 3).map(s => `${s.name_tc}(${Math.round((s as any).walkMeters)}m)`));
  console.log('[AltRoutes:MTR] Nearby to stations:', nearbyToStations.length,
    nearbyToStations.slice(0, 3).map(s => `${s.name_tc}(${Math.round((s as any).walkMeters)}m)`));
  
  if (nearbyFromStations.length === 0 || nearbyToStations.length === 0) {
    console.log('[AltRoutes:MTR] No stations found within walking distance');
    return alternatives;
  }
  
  // For each pair, find direct MTR routes
  for (const fromStation of nearbyFromStations) {
    for (const toStation of nearbyToStations) {
      if (fromStation.stationCode === toStation.stationCode) continue;
      
      // Find lines that connect these two stations
      const connectingLines = findConnectingLines(fromStation.stationCode, toStation.stationCode);
      
      if (connectingLines.length === 0) continue;
      
      for (const lineCode of connectingLines) {
        try {
          const etas = await getMTRETA(lineCode, fromStation.stationCode);
          
          // Filter ETAs going in the right direction
          const validEtas = etas.filter(t => {
            const stations = getLineStations(lineCode);
            const fromIdx = stations.findIndex(s => s.stationCode === fromStation.stationCode);
            const toIdx = stations.findIndex(s => s.stationCode === toStation.stationCode);
            const destIdx = stations.findIndex(s => s.stationCode === t.destination);
            
            if (fromIdx === -1 || toIdx === -1 || destIdx === -1) return false;
            
            // Check direction: destination should be beyond our target
            if (toIdx > fromIdx) return destIdx >= toIdx;
            return destIdx <= toIdx;
          });
          
          if (validEtas.length === 0) continue;
          
          const firstETA = validEtas[0];
          const waitMinutes = parseInt(firstETA.ttnt) || 5;
          
          // Calculate ride time
          const stations = getLineStations(lineCode);
          const fromIdx = stations.findIndex(s => s.stationCode === fromStation.stationCode);
          const toIdx = stations.findIndex(s => s.stationCode === toStation.stationCode);
          const stationCount = Math.abs(toIdx - fromIdx);
          const rideMinutes = Math.max(3, Math.ceil(stationCount * 2.5));
          
          // Calculate walk times
          const fromDist = haversineMeters(fromLocation, { lat: fromStation.lat, lng: fromStation.lng });
          const toDist = haversineMeters(toLocation, { lat: toStation.lat, lng: toStation.lng });
          const walkToMTR = Math.ceil(fromDist / 80);
          const walkFromMTR = Math.ceil(toDist / 80);
          
          const totalMinutes = walkToMTR + waitMinutes + rideMinutes + walkFromMTR;
          const busRideMinutes = estimateBusRideMinutes(fromLocation, toLocation);
          const busTotalMinutes = busWaitMinutes + busRideMinutes;
          const savedMinutes = busTotalMinutes - totalMinutes;
          
          console.log('[AltRoutes:MTR]', lineCode, fromStation.name_tc, '→', toStation.name_tc);
          console.log('  Walk:', walkToMTR, '+', walkFromMTR, 'min | Wait:', waitMinutes, 'min | Ride:', rideMinutes, 'min');
          console.log('  Total:', totalMinutes, 'min | Bus total:', busTotalMinutes, 'min | Saved:', savedMinutes, 'min');
          
          if (savedMinutes >= 3) {
            alternatives.push({
              routeName: getMTRLineName(lineCode),
              routeType: 'mtr',
              destination: toStation.name_tc,
              minutesAway: waitMinutes,
              estimatedRideMinutes: rideMinutes,
              totalMinutes,
              savedMinutes,
              company: 'MTR',
              direction: `🚇 ${getMTRLineName(lineCode)} ${fromStation.name_tc}→${toStation.name_tc}`,
              confidence: waitMinutes <= 5 ? 'high' : waitMinutes <= 10 ? 'medium' : 'low',
            });
          }
        } catch (err) {
          console.error('[AltRoutes:MTR] Error fetching ETA for', lineCode, err);
        }
      }
    }
  }
  
  return alternatives;
}

function findConnectingLines(fromStationCode: string, toStationCode: string): string[] {
  const lines: string[] = [];
  // All MTR line codes from the data — was missing EAL, TML, SIL, DRL
  const allLines = ['TWL', 'KTL', 'ISL', 'TKL', 'EAL', 'TML', 'SIL', 'DRL', 'AEL'];
  
  for (const lineCode of allLines) {
    const stations = getLineStations(lineCode);
    const fromIdx = stations.findIndex(s => s.stationCode === fromStationCode);
    const toIdx = stations.findIndex(s => s.stationCode === toStationCode);
    
    if (fromIdx !== -1 && toIdx !== -1) {
      lines.push(lineCode);
    }
  }
  
  return lines;
}

// ─── Mixed Alternatives (Bus+MTR / GMB+MTR) ───────────────────────────

// Module-level cache for KMB route list
let kmbRouteListCache: Array<{ route: string; bound: string; service_type: string; orig_tc: string; dest_tc: string }> | null = null;

// Module-level cache for KMB stop info (used during route verification)
const kmbStopInfoCache = new Map<string, { name_tc: string; lat: number; long: number } | null>();

async function getKMBStopInfoCached(stopId: string) {
  if (kmbStopInfoCache.has(stopId)) return kmbStopInfoCache.get(stopId);
  const { getKMBStopInfo } = await import('./bus-api');
  try {
    const info = await getKMBStopInfo(stopId);
    if (info) {
      const data = { name_tc: info.name_tc, lat: info.lat, long: info.long };
      kmbStopInfoCache.set(stopId, data);
      return data;
    }
  } catch { /* ignore */ }
  kmbStopInfoCache.set(stopId, null);
  return null;
}

/**
 * Verify that a KMB route actually serves the user's destination stop.
 * Fetches the route's stop sequence and checks if the destination stop
 * appears AFTER the boarding stop (same direction check).
 */
async function routeServesKMBStop(
  routeName: string,
  bound: 'I' | 'O',
  serviceType: string,
  fromStopId: string,
  toStopNameZh: string,
  toStopLocation?: Location,
): Promise<boolean> {
  try {
    const { getKMBRouteStops } = await import('./bus-api');
    const stops = await getKMBRouteStops(routeName, bound, serviceType);

    // Find boarding stop position
    const fromIdx = stops.findIndex(s => s.stop === fromStopId);
    if (fromIdx === -1) return false;  // route doesn't use this stop

    // Only check stops AFTER boarding (must be in same direction)
    const remaining = stops.slice(fromIdx + 1);
    if (remaining.length === 0) return false;

    const destBase = toStopNameZh.replace(/[\s(（][^)]*[)）]?$/, '').trim();

    for (const s of remaining) {
      const info = await getKMBStopInfoCached(s.stop);
      if (!info) continue;

      // Name match (strip parenthetical suffixes)
      const stopBase = info.name_tc.replace(/[\s(（][^)]*[)）]?$/, '').trim();
      if (stopBase.includes(destBase) || destBase.includes(stopBase)) {
        return true;
      }

      // Coordinate proximity check (within 400m)
      if (toStopLocation && typeof toStopLocation.lat === 'number') {
        const dist = haversineMeters(toStopLocation, { lat: info.lat, lng: info.long });
        if (dist < 400) return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function getKMBRouteList() {
  if (kmbRouteListCache) return kmbRouteListCache;
  const { getKMBRouteInfo } = await import('./bus-api');
  // Fetch all KMB routes via a known route (the API always returns all routes)
  const res = await fetch('https://data.etabus.gov.hk/v1/transport/kmb/route/');
  const data = await res.json();
  kmbRouteListCache = (data.data || []).map((r: any) => ({
    route: r.route,
    bound: r.bound,
    service_type: r.service_type,
    orig_tc: r.orig_tc,
    dest_tc: r.dest_tc,
  }));
  return kmbRouteListCache;
}

/**
 * Extract area keyword from a stop name for route origin matching.
 * e.g. "大埔中心總站 (TP903)" → "大埔"
 */
function getAreaKeyword(nameZh: string): string | null {
  const areas = ['大埔', '富蝶', '旺角', '中環', '銅鑼灣', '灣仔', '尖沙咀',
    '佐敦', '油麻地', '太子', '紅磡', '九龍城', '觀塘', '沙田', '荃灣',
    '屯門', '元朗', '天水圍', '北角', '鰂魚涌', '上環', '金鐘', '天后',
    '將軍澳', '坑口', '寶琳', '調景嶺', '鑽石山', '黃大仙', '樂富',
    '九龍塘', '長沙灣', '荔枝角', '美孚', '葵芳', '葵興'];
  for (const area of areas) {
    if (nameZh.includes(area)) return area;
  }
  return null;
}

/**
 * Find mixed transport alternatives (bus → MTR, minibus → MTR, etc.)
 * that may be faster than the user's current bus route.
 *
 * Strategy:
 * 1. Find all bus routes from the user's area
 * 2. Check if they go to an area with MTR connection toward destination
 * 3. Calculate combined bus+MTR time vs current bus time
 */
async function findMixedAlternatives(
  segment: CommuteSegment,
  busWaitMinutes: number,
): Promise<AlternativeRoute[]> {
  const alternatives: AlternativeRoute[] = [];
  const fromLocation = segment.fromStop.location;
  const toLocation = segment.toStop.location;

  // Validate coordinates
  if (!fromLocation || typeof fromLocation.lat !== 'number' || fromLocation.lat === 0) {
    console.log('[AltRoutes:Mixed] Invalid from coords, skipping');
    return alternatives;
  }

  const isToValid = toLocation && typeof toLocation.lat === 'number' && toLocation.lat !== 0;

  // Get area keyword from user's stop name
  const areaKeyword = getAreaKeyword(segment.fromStop.nameZh || segment.fromStop.name);
  if (!areaKeyword) {
    console.log('[AltRoutes:Mixed] No area keyword found for', segment.fromStop.nameZh);
    return alternatives;
  }

  console.log('[AltRoutes:Mixed] Area keyword:', areaKeyword);

  // Get user's destination area for matching
  const userDestName = segment.toStop.nameZh || segment.toStop.name;

  // Fetch all KMB routes (cached)
  let allKmbRoutes: Array<{ route: string; bound: string; orig_tc: string; dest_tc: string }>;
  try {
    const routes = await getKMBRouteList();
    if (!routes) return alternatives;
    allKmbRoutes = routes.map(r => ({ route: r.route, bound: r.bound, orig_tc: r.orig_tc, dest_tc: r.dest_tc }));
  } catch (err) {
    console.error('[AltRoutes:Mixed] Failed to fetch route list:', err);
    return alternatives;
  }

  // Group routes by route name (keep unique routes)
  const routeMap = new Map<string, { orig_tc: string; dest_tc: string }>();
  for (const r of allKmbRoutes) {
    // Only interested in outbound routes from the user's area
    if (r.bound !== 'O') continue;
    // Check if this route starts from the user's area
    if (!r.orig_tc.includes(areaKeyword)) continue;
    // Skip user's own route
    if (r.route.toUpperCase() === segment.route.name.toUpperCase()) continue;
    // Keep one entry per route (bound O, first service_type)
    if (!routeMap.has(r.route)) {
      routeMap.set(r.route, { orig_tc: r.orig_tc, dest_tc: r.dest_tc });
    }
  }

  console.log('[AltRoutes:Mixed] Candidate routes from', areaKeyword, ':', [...routeMap.keys()].join(', '));

  if (routeMap.size === 0) {
    return alternatives;
  }

  // For each candidate route, check if it goes near a useful MTR station
  // "Useful" = there's an MTR station near the route destination that connects toward user's destination
  const busRideMinutes = estimateBusRideMinutes(fromLocation, toLocation);
  const busTotalMinutes = busWaitMinutes + busRideMinutes;

  for (const [routeNum, routeInfo] of routeMap) {
    try {
      const routeDestTc = routeInfo.dest_tc;

      // Find MTR stations near this route's destination area
      // Check each MTR station: is the station name/area in the route destination?
      let bestMtrStation: typeof MTR_STATIONS[0] | null = null;
      let bestLineCode: string | null = null;
      let bestRideMinutes = 0;

      for (const mtrStation of MTR_STATIONS) {
        const stationName = mtrStation.name_tc;

        // Skip if the station name isn't in the route destination
        if (!routeDestTc.includes(stationName) && !stationName.includes(areaKeyword)) continue;

        // This route goes near this MTR station!
        // Check if this MTR station can connect toward the user's destination
        // by finding lines that connect this station to stations near the destination
        const mtrFromCode = mtrStation.stationCode;

        // For each MTR station near the DESTINATION, check if same line
        for (const destMtrStation of MTR_STATIONS) {
          if (destMtrStation.stationCode === mtrFromCode) continue;

          const distToDestMtr = isToValid
            ? haversineMeters(toLocation, { lat: destMtrStation.lat, lng: destMtrStation.lng })
            : Infinity;

          // Only consider MTR stations within 1km of destination
          if (distToDestMtr > 1000) continue;

          // Check if these two MTR stations are on the same line
          const allLineCodes = ['TWL', 'KTL', 'ISL', 'TKL', 'EAL', 'TML', 'SIL', 'DRL', 'AEL'];
          for (const lineCode of allLineCodes) {
            const stations = getLineStations(lineCode);
            const fromIdx = stations.findIndex(s => s.stationCode === mtrFromCode);
            const toIdx = stations.findIndex(s => s.stationCode === destMtrStation.stationCode);

            if (fromIdx === -1 || toIdx === -1) continue;

            // Found a connecting line!
            const stationCount = Math.abs(toIdx - fromIdx);
            const rideMinutes = Math.max(3, Math.ceil(stationCount * 2.5));

            // Prefer better connection (more stations = longer ride → less likely to be faster)
            if (!bestMtrStation || rideMinutes < bestRideMinutes) {
              bestMtrStation = mtrStation;
              bestLineCode = lineCode;
              bestRideMinutes = rideMinutes;
            }
          }
        }
      }

      if (!bestMtrStation || !bestLineCode) continue;

      // Calculate estimated bus ride time from origin to this MTR station
      const busDistKm = haversineMeters(fromLocation, { lat: bestMtrStation.lat, lng: bestMtrStation.lng }) / 1000;
      const busRideToStation = Math.max(5, Math.ceil(busDistKm / 0.3));

      // Calculate wait time for this bus route
      const busWait = Math.max(3, Math.min(20, Math.ceil(busRideToStation * 0.1))); // rough estimate: wait ~10% of ride

      // Calculate MTR ride from the interchange station to destination MTR station
      const walkToPlatform = 3; // assume ~3 min walk from bus stop to MTR platform
      const mtrWait = 3; // default MTR wait

      // Find destination MTR station
      const destMtrStation = MTR_STATIONS.filter(s => {
        const dist = haversineMeters(toLocation, { lat: s.lat, lng: s.lng });
        return dist < 1000;
      }).sort((a, b) => {
        const da = haversineMeters(toLocation, { lat: a.lat, lng: a.lng });
        const db = haversineMeters(toLocation, { lat: b.lat, lng: b.lng });
        return da - db;
      })[0];

      if (!destMtrStation) continue;

      const walkFromMtr = Math.ceil(haversineMeters(toLocation, { lat: destMtrStation.lat, lng: destMtrStation.lng }) / 80);

      const totalMinutes = busWait + busRideToStation + walkToPlatform + mtrWait + bestRideMinutes + walkFromMtr;
      const savedMinutes = busTotalMinutes - totalMinutes;

      console.log(`[AltRoutes:Mixed] ${routeNum} ${routeInfo.orig_tc}→${routeInfo.dest_tc}: bus=${busWait}+${busRideToStation} → 🚇 ${getMTRLineName(bestLineCode)} ${bestMtrStation.name_tc}→${destMtrStation.name_tc}: wait=${mtrWait}+ride=${bestRideMinutes}+walk=${walkFromMtr} = ${totalMinutes}min (vs bus ${busTotalMinutes}min, save ${savedMinutes}min)`);

      if (savedMinutes >= 3) {
        alternatives.push({
          routeName: routeNum,
          routeType: 'bus',
          destination: routeInfo.dest_tc,
          minutesAway: busWait,
          estimatedRideMinutes: busRideToStation + walkToPlatform + mtrWait + bestRideMinutes + walkFromMtr,
          totalMinutes,
          savedMinutes,
          company: 'KMB',
          direction: `🚌 ${routeNum} ${routeInfo.orig_tc} → 🚇 ${getMTRLineName(bestLineCode)} ${bestMtrStation.name_tc}→${destMtrStation.name_tc}`,
          confidence: busWait <= 5 ? 'high' : busWait <= 15 ? 'medium' : 'low',
        });
      }
    } catch (err) {
      console.error(`[AltRoutes:Mixed] Error checking ${routeNum}:`, err);
    }
  }

  return alternatives;
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Check if a route's destination goes toward the user's destination.
 * Returns 'direct' for exact match, 'nearby' for partial match, or false.
 */
function isGoingToward(
  routeDestination: string,  // e.g. "紅磡站" or "佐敦(經大埔道)"
  userDestinationZh: string,  // e.g. "旺角站"
  userDestinationEn: string,  // e.g. "Mong Kok Station"
): 'direct' | 'nearby' | false {
  // Common Hong Kong destinations mapping
  // A route goes "toward" the user's destination if its terminal
  // is in the same general area or on the way.
  const dest = routeDestination.replace(/[()（）]/g, '');
  const userZh = (userDestinationZh || '').replace(/站$/, '');
  const userEn = (userDestinationEn || '').toLowerCase();

  // Direct name match (most reliable)
  if (dest.includes(userZh) || userZh.includes(dest.replace(/[^a-zA-Z\u4e00-\u9fff]/g, ''))) {
    return 'direct';
  }

  // Area/district matching for common Hong Kong destinations
  const areaKeywords: Record<string, string[]> = {
    '旺角': ['旺角', '太子', '油麻地', '佐敦', '尖沙咀', '紅磡', '長沙灣', '荔枝角', '美孚'],
    '銅鑼灣': ['銅鑼灣', '灣仔', '金鐘', '中環', '天后', '北角', '鰂魚涌'],
    '中環': ['中環', '金鐘', '上環', '灣仔', '銅鑼灣'],
    '紅磡': ['紅磡', '尖沙咀', '佐敦', '旺角', '土瓜灣', '九龍城'],
    '尖沙咀': ['尖沙咀', '佐敦', '紅磡', '旺角', '油麻地'],
    '屯門': ['屯門', '兆康', '天水圍', '元朗'],
    '大埔': ['大埔', '富蝶', '太和', '大埔墟', '富善', '富亨'],
    '沙田': ['沙田', '大圍', '車公廟', '石門', '火炭'],
    '荃灣': ['荃灣', '大窩口', '葵芳', '葵興', '荔景'],
    '北角': ['北角', '鰂魚涌', '太古', '西灣河', '筲箕灣'],
    '九龍城': ['九龍城', '土瓜灣', '紅磡', '旺角', '太子'],
    '觀塘': ['觀塘', '牛頭角', '九龍灣', '彩虹'],
  };

  // Check if user's destination area and route destination overlap
  for (const [area, keywords] of Object.entries(areaKeywords)) {
    const userInArea = keywords.some(k => userZh.includes(k));
    const routeInArea = keywords.some(k => dest.includes(k));
    if (userInArea && routeInArea) {
      return 'nearby';
    }
  }

  // Geographic proximity check using known district keywords
  // If the route goes to a district that's in the same general direction,
  // it might be a useful alternative
  
  return false;
}

/**
 * Estimate bus ride time based on haversine distance.
 * Uses average bus speed of 18 km/h (0.3 km/min) with minimum 5 min.
 */
function estimateBusRideMinutes(from: Location, to: Location): number {
  const distKm = haversineMeters(from, to) / 1000;
  return Math.max(5, Math.ceil(distKm / 0.3));
}

/**
 * Find MTR lines that interchange at a given station (excluding the user's own line).
 * This uses the MTR_STATIONS data to find lines sharing the same station code prefix.
 */
function findInterchangeLines(stationCode: string, currentLine: string): string[] {
  // Known major interchange stations and their lines
  const interchanges: Record<string, string[]> = {
    // Station code prefix → available lines
    'ADM': ['TWL', 'ISL', 'EAL'],    // 金鐘
    'CEN': ['TWL', 'ISL'],            // 中環
    'SYH': ['TWL', 'ISL'],            // 上環
    'HKC': ['ISL', 'EAL'],             // 紅磡
    'MKK': ['TWL', 'KTL'],            // 旺角
    'MOK': ['TWL', 'KTL'],            // 旺角東
    'PRE': ['TWL', 'KTL'],            // 太子
    'YMT': ['TWL', 'KTL'],            // 油麻地
    'JRD': ['TWL', 'KTL'],            // 佐敦
    'TST': ['TWL', 'EAL'],            // 尖沙咀
    'TSHA': ['TWL'],                   // 尖沙咀東
    'EHS': ['TWL', 'KTL', 'TML'],     // 彩虹
    'KSR': ['EAL'],                    // 大學
    'TAP': ['EAL'],                    // 大埔墟
    'TWO': ['EAL'],                    // 太和
    'FTT': ['EAL'],                    // 富蝶
    'SKW': ['ISL'],                    // 西灣河
    'SWH': ['ISL'],                    // 上環
    'NOP': ['ISL', 'TKL'],            // 北角
    'QUB': ['ISL', 'TKL'],            // 鰂魚涌
    'TIK': ['TKL'],                    // 太古
    'CWF': ['KTL', 'TML'],            // 黃大仙
    'DIH': ['KTL', 'TML'],            // 鑽石山
    'LAT': ['KTL', 'TML'],            // 樂富
    'WTS': ['KML'],                    // 黃大仙
  };

  // Find lines at this station
  const lines = interchanges[stationCode];
  if (!lines) return [];
  
  // Return lines other than user's current line
  return lines.filter(l => l !== currentLine);
}