// Alternative route discovery — find faster routes at the same stop
import { getStopETA, type StopETA } from './bus-api';
import { getMTRETA, findStation, getLineStations, MTR_STATIONS } from './mtr-api';
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
    segmentLabel: `${segment.route.name} · ${segment.fromStop.nameZh || segment.fromStop.name}`,
    configuredRoute: segment.route.name,
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

        // Check if this route goes toward the user's destination
        const goesTowardDestination = isGoingToward(
          eta.destination,
          userDestination,
          userDestinationEn,
        );

        console.log('[AltRoutes:Bus]', eta.route, '→', eta.destination, '| match:', goesTowardDestination);

        if (!goesTowardDestination) continue;

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
            routeName: lineCode,
            routeType: 'mtr',
            destination: destStationName,
            minutesAway: waitMinutes,
            estimatedRideMinutes: rideMinutes,
            totalMinutes,
            savedMinutes,
            company: 'MTR',
            direction: `🚇 ${lineCode}線 → ${destStationName}`,
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
  
  // Find nearby MTR stations (within 800m)
  const nearbyFromStations = MTR_STATIONS.filter(s => {
    const dist = haversineMeters(fromLocation, { lat: s.lat, lng: s.lng });
    return dist < 800;
  });
  
  const nearbyToStations = MTR_STATIONS.filter(s => {
    const dist = haversineMeters(toLocation, { lat: s.lat, lng: s.lng });
    return dist < 1000;
  });
  
  console.log('[AltRoutes:MTR] Nearby from stations:', nearbyFromStations.length);
  console.log('[AltRoutes:MTR] Nearby to stations:', nearbyToStations.length);
  
  if (nearbyFromStations.length === 0 || nearbyToStations.length === 0) {
    return alternatives;
  }
  
  // For each pair, find direct MTR routes
  for (const fromStation of nearbyFromStations) {
    for (const toStation of nearbyToStations) {
      if (fromStation.stationCode === toStation.stationCode) continue;
      
      // Find lines that connect these two stations
      const connectingLines = findConnectingLines(fromStation.stationCode, toStation.stationCode);
      
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
          const walkToMTR = Math.ceil(haversineMeters(fromLocation, { lat: fromStation.lat, lng: fromStation.lng }) / 80);
          const walkFromMTR = Math.ceil(haversineMeters(toLocation, { lat: toStation.lat, lng: toStation.lng }) / 80);
          
          const totalMinutes = walkToMTR + waitMinutes + rideMinutes + walkFromMTR;
          const busTotalMinutes = busWaitMinutes + estimateBusRideMinutes(fromLocation, toLocation);
          const savedMinutes = busTotalMinutes - totalMinutes;
          
          console.log('[AltRoutes:MTR]', lineCode, fromStation.name_tc, '→', toStation.name_tc);
          console.log('  Walk:', walkToMTR, '+', walkFromMTR, 'min | Wait:', waitMinutes, 'min | Ride:', rideMinutes, 'min');
          console.log('  Total:', totalMinutes, 'min | Bus total:', busTotalMinutes, 'min | Saved:', savedMinutes, 'min');
          
          if (savedMinutes >= 3) {
            alternatives.push({
              routeName: lineCode,
              routeType: 'mtr',
              destination: toStation.name_tc,
              minutesAway: waitMinutes,
              estimatedRideMinutes: rideMinutes,
              totalMinutes,
              savedMinutes,
              company: 'MTR',
              direction: `🚇 ${lineCode}線 ${fromStation.name_tc}→${toStation.name_tc}`,
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
  const allLines = ['TWL', 'KTL', 'ISL', 'TKL', 'SCL', 'TCL', 'AEL'];
  
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