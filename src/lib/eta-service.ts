// Combined ETA service — merges bus + MTR + GMB + tram data
import { getStopETA, getKMBStopInfo, getCitybusStopInfo, getKMBRouteStops, getCitybusRouteStops, type StopETA } from './bus-api';
import { getMTRETA, type MTRETA, findStation, getMTRLineName } from './mtr-api';
import { getGMBStopETASummary, type GMBStopETAInfo } from './gmb-api';
import { getEstimatedTramTime } from './tram-api';
import { walkTimeBetween, haversineMeters } from './road-snap';
import { enrichSegmentWithCoords } from './stop-coords';
import type { CommuteRoute, CommuteSegment, Location, SmartRouteRecommendation, SmartSegment } from '@/types';

// ── Bus ride time ────────────────────────────────────────────────────
// Method: sum per-stop hop times (same structure as USHB 站與站行車時間加總).
// Hop formula calibrated to USHB 307P 富蝶→天后 = 72′ schedule.
// Mild ×1.15 buffer for real traffic (schedule 72′ → ~83′; user peak ~90′).
// Old end-to-end 11 km/h (×1.7/0.18) blew long routes to ~190′ — wrong.

const STOP_COORD_CACHE = new Map<string, Location>();
/** Schedule→real buffer (congestion / dwell variance). */
const SCHEDULE_TO_REAL = 1.15;

/**
 * Schedule-like minutes for ONE stop→next hop from straight-line distance.
 * Calibrated so 307P 富蝶→天后 hop-sum ≈ 71–72′ (USHB total 72′).
 */
export function hopMinutesFromDistKm(distKm: number): number {
  if (!Number.isFinite(distKm) || distKm <= 0) return 1;
  if (distKm <= 0.2) return 1;
  if (distKm <= 0.55) return 2;
  if (distKm <= 0.9) return 3;
  if (distKm <= 1.5) return 4;
  if (distKm <= 3.0) return Math.max(5, Math.round(distKm * 3.0 + 1.5));
  // Long tunnel/highway hop ≈ 47 km/h schedule (USHB 大老山/東隧 ~11′)
  return Math.max(8, Math.round(distKm / 0.78));
}

/** End-to-end fallback when intermediate stops unavailable (~18 km/h road). */
function endToEndBusMinutes(distKm: number): number {
  if (!Number.isFinite(distKm) || distKm <= 0) return 12;
  return Math.max(8, Math.ceil((distKm * 1.35) / 0.3));
}

function matchStopId(
  stops: { stop: string; seq: number }[],
  id: string,
): { stop: string; seq: number } | undefined {
  if (!id) return undefined;
  const up = id.toUpperCase();
  return stops.find(s => s.stop === id || s.stop.toUpperCase() === up);
}

/** Find route-stop list containing both from and to (try KMB service types 1–3 + CTB). */
async function resolveRouteStopList(
  routeName: string,
  operator: string | undefined,
  fromId: string,
  toId: string,
): Promise<{ stop: string; seq: number }[] | null> {
  const isCtb = operator === 'citybus';
  const tryLists: Array<() => Promise<{ stop: string; seq: number }[]>> = [];

  for (const dir of ['O', 'I'] as const) {
    if (isCtb) {
      tryLists.push(() => getCitybusRouteStops(routeName, dir));
      for (const st of ['1', '2', '3']) {
        tryLists.push(() => getKMBRouteStops(routeName, dir, st));
      }
    } else {
      for (const st of ['1', '2', '3']) {
        tryLists.push(() => getKMBRouteStops(routeName, dir, st));
      }
      tryLists.push(() => getCitybusRouteStops(routeName, dir));
    }
  }

  for (const load of tryLists) {
    try {
      const list = await load();
      if (!list.length) continue;
      if (matchStopId(list, fromId) && matchStopId(list, toId)) return list;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function fetchStopLocation(
  stopId: string,
  preferCtb: boolean,
): Promise<Location | null> {
  if (!stopId) return null;
  const cached = STOP_COORD_CACHE.get(stopId);
  if (cached) return cached;

  const loaders = preferCtb
    ? [getCitybusStopInfo, getKMBStopInfo]
    : [getKMBStopInfo, getCitybusStopInfo];

  for (const load of loaders) {
    try {
      const info = await load(stopId);
      if (info && Number.isFinite(info.lat) && Number.isFinite(info.long)) {
        const loc = { lat: info.lat, lng: info.long };
        if (loc.lat !== 0 || loc.lng !== 0) {
          STOP_COORD_CACHE.set(stopId, loc);
          return loc;
        }
      }
    } catch {
      /* try other operator */
    }
  }
  return null;
}

/**
 * Estimate bus ride minutes between two stops.
 * Primary: sum per-hop schedule times along route-stop sequence (USHB-style).
 * Fallback: end-to-end distance at ~18 km/h road speed.
 */
export async function estimateBusRideMinutes(seg: {
  route: { name: string; operator?: string; stops?: { id: string }[] };
  fromStop: { id: string; location: Location };
  toStop: { id: string; location: Location };
}): Promise<number> {
  const preferCtb = seg.route.operator === 'citybus';
  let hopSum: number | null = null;
  let hopCount = 0;
  let method = 'fallback';

  try {
    // 1) Saved route.stops with ids
    let orderedIds: string[] | null = null;
    const saved = seg.route.stops;
    if (saved?.length) {
      const fi = saved.findIndex(s => s.id === seg.fromStop.id);
      const ti = saved.findIndex(s => s.id === seg.toStop.id);
      if (fi >= 0 && ti >= 0 && fi !== ti) {
        const [a, b] = fi < ti ? [fi, ti] : [ti, fi];
        orderedIds = saved.slice(a, b + 1).map(s => s.id);
      }
    }

    // 2) Live route-stop list (KMB service_type 1/2/3 — e.g. 307P 富蝶 = type 2)
    if (!orderedIds) {
      const list = await resolveRouteStopList(
        seg.route.name,
        seg.route.operator,
        seg.fromStop.id,
        seg.toStop.id,
      );
      if (list) {
        const from = matchStopId(list, seg.fromStop.id)!;
        const to = matchStopId(list, seg.toStop.id)!;
        const lo = Math.min(from.seq, to.seq);
        const hi = Math.max(from.seq, to.seq);
        orderedIds = list
          .filter(s => s.seq >= lo && s.seq <= hi)
          .sort((x, y) => x.seq - y.seq)
          .map(s => s.stop);
      }
    }

    if (orderedIds && orderedIds.length >= 2) {
      // Resolve coords: prefer known endpoints, fetch middles in parallel
      const locs: (Location | null)[] = await Promise.all(
        orderedIds.map(async (id, i) => {
          if (i === 0 && !isZeroLocation(seg.fromStop.location) && id === seg.fromStop.id) {
            return seg.fromStop.location;
          }
          if (
            i === orderedIds!.length - 1 &&
            !isZeroLocation(seg.toStop.location) &&
            id === seg.toStop.id
          ) {
            return seg.toStop.location;
          }
          // endpoints may still need fetch if ids differ after reverse slice
          if (id === seg.fromStop.id && !isZeroLocation(seg.fromStop.location)) {
            return seg.fromStop.location;
          }
          if (id === seg.toStop.id && !isZeroLocation(seg.toStop.location)) {
            return seg.toStop.location;
          }
          return fetchStopLocation(id, preferCtb);
        }),
      );

      let sum = 0;
      let hops = 0;
      for (let i = 0; i < locs.length - 1; i++) {
        const a = locs[i];
        const b = locs[i + 1];
        if (!a || !b || isZeroLocation(a) || isZeroLocation(b)) continue;
        const dKm = haversineMeters(a, b) / 1000;
        sum += hopMinutesFromDistKm(dKm);
        hops++;
      }
      if (hops > 0) {
        hopSum = sum;
        hopCount = hops;
        method = 'hop-sum';
      }
    }
  } catch (e) {
    console.warn('[Journey] hop-sum failed', e);
  }

  let ride: number;
  if (hopSum != null) {
    // Schedule hop-sum × mild real-world buffer
    ride = Math.max(8, Math.ceil(hopSum * SCHEDULE_TO_REAL));
  } else if (!isZeroLocation(seg.fromStop.location) && !isZeroLocation(seg.toStop.location)) {
    const distKm = haversineMeters(seg.fromStop.location, seg.toStop.location) / 1000;
    ride = endToEndBusMinutes(distKm);
    method = 'end-to-end';
  } else {
    ride = 25;
    method = 'default';
  }

  console.log(
    `[Journey] Bus ride ${seg.route.name}: method=${method} hops=${hopCount || '—'} ` +
      `hopSum=${hopSum ?? '—'} → ${ride}min`,
  );
  return ride;
}

function isZeroLocation(loc: Location): boolean {
  return !loc || (loc.lat === 0 && loc.lng === 0);
}

export interface TransportETA {
  type: 'bus' | 'mtr' | 'gmb' | 'tram';
  route: string;
  destination: string;
  minutesAway: number;
  platform?: string;
  remark?: string;
  company?: 'KMB' | 'CTB';
}

/** App stores `minibus`; ETA layer uses `gmb`. */
export function normalizeTransportType(
  t: string | undefined | null,
): 'bus' | 'mtr' | 'gmb' | 'tram' {
  if (t === 'mtr') return 'mtr';
  if (t === 'tram') return 'tram';
  if (t === 'gmb' || t === 'minibus') return 'gmb';
  return 'bus';
}

// Single stop ETA fetch (auto-detects transport type)
export async function fetchETA(
  stopId: string,
  transportType: 'bus' | 'mtr' | 'gmb' | 'tram' | 'minibus',
  company: 'KMB' | 'CTB' = 'KMB',
  route?: string,
  lineCode?: string
): Promise<TransportETA[]> {
  const kind = normalizeTransportType(transportType);

  // MTR
  if (kind === 'mtr' && lineCode) {
    const mtrETAs = await getMTRETA(lineCode, stopId);
    return mtrETAs
      .filter(t => t.ttnt && t.ttnt !== '-' && t.ttnt !== '')
      .map(t => ({
        type: 'mtr' as const,
        route: lineCode,
        destination: getStationName(t.destination),
        minutesAway: parseInt(t.ttnt) || 0,
        platform: t.platform,
      }))
      .sort((a, b) => a.minutesAway - b.minutesAway);
  }

  // GMB (Green Minibus) — route.type is often `minibus`
  if (kind === 'gmb') {
    const sid = parseInt(String(stopId), 10);
    if (!Number.isFinite(sid)) return [];
    const gmbETAs = await getGMBStopETASummary(sid, route);
    return gmbETAs.map(eta => ({
      type: 'gmb' as const,
      route: eta.route,
      destination: eta.destination || route || '小巴',
      minutesAway: eta.minutesAway,
      remark: eta.remark,
    }));
  }

  // Tram (static schedule)
  if (kind === 'tram') {
    const tramETAs = getEstimatedTramTime();
    return tramETAs
      .filter(t => t.minutesAway >= 0)
      .map(t => ({
        type: 'tram' as const,
        route: '電車',
        destination: '電車服務',
        minutesAway: t.minutesAway,
        remark: t.remark,
      }));
  }

  // Bus ETA (KMB/Citybus)
  const busETAs = await getStopETA(stopId, company, route);
  return busETAs.map(eta => ({
    type: 'bus' as const,
    route: eta.route,
    destination: eta.destination,
    minutesAway: eta.minutesAway,
    remark: eta.remark || undefined,
    company: eta.company,
  }));
}

// Fetch ETA for multiple stops at once
export async function fetchMultipleETAs(
  stops: Array<{
    stopId: string;
    type: 'bus' | 'mtr' | 'gmb' | 'tram';
    company?: 'KMB' | 'CTB';
    route?: string;
    lineCode?: string;
    label: string;
  }>
): Promise<Map<string, TransportETA[]>> {
  const results = new Map<string, TransportETA[]>();

  const promises = stops.map(async (stop) => {
    const etas = await fetchETA(
      stop.stopId,
      stop.type,
      stop.company,
      stop.route,
      stop.lineCode
    );
    results.set(stop.label, etas);
  });

  await Promise.all(promises);
  return results;
}

// Transfer logic: should user rush or wait?
export interface TransferAdvice {
  canMakeIt: boolean;
  message: string;
  urgency: 'rush' | 'normal' | 'relax';
  walkingMinutes: number;
  nextTransportMinutes: number;
}

export function getTransferAdvice(
  walkingMinutes: number,
  nextTransportMinutes: number,
  bufferMinutes: number = 2
): TransferAdvice {
  const timeDiff = nextTransportMinutes - walkingMinutes - bufferMinutes;

  if (timeDiff < 0) {
    return {
      canMakeIt: false,
      message: '趕唔切，建議等下一班',
      urgency: 'relax',
      walkingMinutes,
      nextTransportMinutes,
    };
  }

  if (timeDiff <= 2) {
    return {
      canMakeIt: true,
      message: '趕快！有機會趕上',
      urgency: 'rush',
      walkingMinutes,
      nextTransportMinutes,
    };
  }

  return {
    canMakeIt: true,
    message: '時間充裕，慢慢行',
    urgency: 'normal',
    walkingMinutes,
    nextTransportMinutes,
  };
}

function getStationName(code: string): string {
  const station = findStation(code);
  return station?.name_tc || code;
}

// Helper: haversine distance in km for ride time estimation
function haversineKmBetween(a: Location, b: Location): number {
  return haversineMeters(a, b) / 1000;
}

// Smart journey time estimation
// Calculates total journey time = walk + wait + ride for each segment
export async function calculateTotalJourney(
  route: CommuteRoute,
  currentLocation: Location,
  mid?: {
    /** First segment index still active (skip earlier) */
    segmentIndex: number;
    /** 0–1 remaining of current ride (1 = full) */
    remainingFraction: number;
    /** User already on vehicle for segmentIndex — skip walk-to-board */
    alreadyOnBoard: boolean;
  } | null,
): Promise<SmartRouteRecommendation> {
  // Enrich all segments with real stop coordinates before calculating times
  // This fixes the case where bus stops were saved with {lat: 0, lng: 0}
  const enrichedSegments = await Promise.all(
    route.segments.map(seg => enrichSegmentWithCoords(seg))
  );

  const segments: SmartSegment[] = [];
  let totalMinutes = 0;
  const now = new Date();
  let canMakeIt = true;
  let minConfidence: 'high' | 'medium' | 'low' = 'high';

  const startIdx = mid?.segmentIndex ?? 0;
  const remainingFrac = mid?.remainingFraction ?? 1;
  const skipWalkBoard = !!mid?.alreadyOnBoard;

  for (let i = startIdx; i < enrichedSegments.length; i++) {
    const seg = enrichedSegments[i];
    const isFirstActive = i === startIdx;
    const prevSeg = i > 0 ? enrichedSegments[i - 1] : null;

    // 1. Walk to boarding stop (or walk between transfer stops)
    let walkMinutes = 0;

    if (isFirstActive && skipWalkBoard) {
      // Already on vehicle — no walk back to boarding stop
      walkMinutes = 0;
    } else if (isFirstActive) {
      // Walk from current location to first boarding stop
      if (!isZeroLocation(seg.fromStop.location)) {
        const stopLat = Number(seg.fromStop.location.lat).toFixed(5);
        const stopLng = Number(seg.fromStop.location.lng).toFixed(5);
        const userLat = Number(currentLocation.lat).toFixed(5);
        const userLng = Number(currentLocation.lng).toFixed(5);
        const dist = haversineMeters(currentLocation, seg.fromStop.location).toFixed(0);
        console.log(`[Journey] Walk calc: user=(${userLat},${userLng}) stop=${seg.fromStop.nameZh} (${stopLat},${stopLng}) dist=${dist}m`);
        walkMinutes = await walkTimeBetween(currentLocation, seg.fromStop.location);
        console.log(`[Journey] Walk result: ${walkMinutes}min`);
      } else {
        // Retry fetching stop coords directly (enrichment may have failed)
        try {
          const company = seg.route.operator === 'citybus' ? 'CTB' : 'KMB';
          const stopInfo = await (company === 'CTB' ? getCitybusStopInfo(seg.fromStop.id) : getKMBStopInfo(seg.fromStop.id));
          if (stopInfo && typeof stopInfo.lat === 'number' && typeof stopInfo.long === 'number') {
            seg.fromStop.location = { lat: stopInfo.lat, lng: stopInfo.long };
            walkMinutes = await walkTimeBetween(currentLocation, seg.fromStop.location);
            console.log(`[Journey] Retry resolved stop coords: ${seg.fromStop.nameZh} (${stopInfo.lat}, ${stopInfo.long})`);
          }
        } catch (e) {
          console.log(`[Journey] Stop coord retry failed for ${seg.fromStop.nameZh}:`, e);
        }
        if (walkMinutes === 0) {
          walkMinutes = 5; // reasonable default for HK bus stop walking distance
          minConfidence = 'low';
        }
      }
      if (walkMinutes > 0) {
        segments.push({
          type: 'walk',
          minutes: walkMinutes,
          description: `步行至 ${seg.fromStop.nameZh} (${Number(seg.fromStop.location.lat).toFixed(4)},${Number(seg.fromStop.location.lng).toFixed(4)})`,
          fromLocation: currentLocation,
          toLocation: seg.fromStop.location,
        });
      }
    } else if (prevSeg) {
      // Walk from previous alighting stop to this boarding stop (transfer)
      if (!isZeroLocation(prevSeg.toStop.location) && !isZeroLocation(seg.fromStop.location)) {
        walkMinutes = await walkTimeBetween(prevSeg.toStop.location, seg.fromStop.location);
      } else {
        walkMinutes = 5; // default transfer walk
        minConfidence = 'low';
      }
      segments.push({
        type: 'walk',
        minutes: walkMinutes,
        description: `步行至 ${seg.fromStop.nameZh}`,
        fromLocation: prevSeg.toStop.location,
        toLocation: seg.fromStop.location,
      });
    }

    totalMinutes += walkMinutes;

    // 2. Ride time — estimate based on transport type
    let rideMinutes: number;
    if (seg.route.type === 'mtr') {
      // MTR: count actual stops between from and to, avg 2.5 min per stop
      // Fall back to haversine distance / 0.5 km/min if stops data unavailable
      const routeStops = seg.route.stops;
      const fromIdx = routeStops?.findIndex(s => s.id === seg.fromStop.id);
      const toIdx = routeStops?.findIndex(s => s.id === seg.toStop.id);

      if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== undefined && toIdx !== undefined) {
        const stationCount = Math.abs(toIdx - fromIdx);
        rideMinutes = Math.max(3, Math.ceil(stationCount * 2.5));
      } else {
        // Fallback: haversine distance / 0.5 km/min average MTR speed
        if (isZeroLocation(seg.fromStop.location) || isZeroLocation(seg.toStop.location)) {
          rideMinutes = 15; // default MTR estimate
          minConfidence = 'low';
        } else {
          const distKm = haversineKmBetween(seg.fromStop.location, seg.toStop.location);
          rideMinutes = Math.max(3, Math.ceil(distKm / 0.5));
        }
      }
    } else if (seg.route.type === 'bus' || seg.route.operator === 'kmb' || seg.route.operator === 'citybus') {
      // Bus: stop-count + road-adjusted distance (see estimateBusRideMinutes)
      rideMinutes = await estimateBusRideMinutes(seg);
      if (isZeroLocation(seg.fromStop.location) || isZeroLocation(seg.toStop.location)) {
        minConfidence = 'low';
      }
    } else {
      // Minibus/tram/etc: default 8 min
      rideMinutes = 8;
    }

    // Mid-journey: only remaining portion of current segment
    if (isFirstActive && skipWalkBoard && remainingFrac < 1) {
      rideMinutes = Math.max(3, Math.ceil(rideMinutes * remainingFrac));
    }

    const rideLabel = isFirstActive && skipWalkBoard
      ? `乘搭 ${seg.route.type === 'mtr' ? getMTRLineName(seg.route.name) : seg.route.name}（途中）`
      : `乘搭 ${seg.route.type === 'mtr' ? getMTRLineName(seg.route.name) : seg.route.name}`;

    segments.push({
      type: 'ride',
      minutes: rideMinutes,
      description: rideLabel,
    });
    totalMinutes += rideMinutes;
  }

  const departureTime = new Date(now.getTime());
  const arrivalTime = new Date(now.getTime() + totalMinutes * 60000);

  return {
    routeId: route.id,
    routeName: route.name,
    direction: route.direction,
    totalMinutes,
    segments,
    departureTime,
    arrivalTime,
    canMakeIt,
    confidence: minConfidence,
  };
}
