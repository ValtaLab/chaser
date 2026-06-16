// Combined ETA service — merges bus + MTR + GMB + tram data
import { getStopETA, type StopETA } from './bus-api';
import { getMTRETA, type MTRETA, findStation, getMTRLineName } from './mtr-api';
import { getGMBStopETASummary, type GMBStopETAInfo } from './gmb-api';
import { getEstimatedTramTime } from './tram-api';
import { walkTimeBetween, haversineMeters } from './road-snap';
import { enrichSegmentWithCoords } from './stop-coords';
import type { CommuteRoute, CommuteSegment, Location, SmartRouteRecommendation, SmartSegment } from '@/types';

export interface TransportETA {
  type: 'bus' | 'mtr' | 'gmb' | 'tram';
  route: string;
  destination: string;
  minutesAway: number;
  platform?: string;
  remark?: string;
}

// Single stop ETA fetch (auto-detects transport type)
export async function fetchETA(
  stopId: string,
  transportType: 'bus' | 'mtr' | 'gmb' | 'tram',
  company: 'KMB' | 'CTB' = 'KMB',
  route?: string,
  lineCode?: string
): Promise<TransportETA[]> {
  // MTR
  if (transportType === 'mtr' && lineCode) {
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

  // GMB (Green Minibus)
  if (transportType === 'gmb') {
    const gmbETAs = await getGMBStopETASummary(parseInt(stopId), route);
    return gmbETAs.map(eta => ({
      type: 'gmb' as const,
      route: eta.route,
      destination: eta.destination,
      minutesAway: eta.minutesAway,
      remark: eta.remark,
    }));
  }

  // Tram (static schedule)
  if (transportType === 'tram') {
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

// Helper: check if a location is invalid (default zero coordinates)
const isZeroLocation = (loc: Location): boolean =>
  loc.lat === 0 && loc.lng === 0;

// Smart journey time estimation
// Calculates total journey time = walk + wait + ride for each segment
export async function calculateTotalJourney(
  route: CommuteRoute,
  currentLocation: Location,
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

  for (let i = 0; i < enrichedSegments.length; i++) {
    const seg = enrichedSegments[i];
    const isFirst = i === 0;
    const prevSeg = i > 0 ? enrichedSegments[i - 1] : null;

    // 1. Walk to boarding stop (or walk between transfer stops)
    let walkMinutes = 0;

    if (isFirst) {
      // Walk from current location to first boarding stop
      // Guard: if stop location is still (0,0) after enrichment, skip walk calc
      if (!isZeroLocation(seg.fromStop.location)) {
        walkMinutes = await walkTimeBetween(currentLocation, seg.fromStop.location);
      } else {
        walkMinutes = 2; // default: assume user is near the stop
        minConfidence = 'low';
      }
      segments.push({
        type: 'walk',
        minutes: walkMinutes,
        description: `步行至 ${seg.fromStop.nameZh}`,
        fromLocation: currentLocation,
        toLocation: seg.fromStop.location,
      });
    } else if (prevSeg) {
      // Walk from previous alighting stop to this boarding stop (transfer)
      if (!isZeroLocation(prevSeg.toStop.location) && !isZeroLocation(seg.fromStop.location)) {
        walkMinutes = await walkTimeBetween(prevSeg.toStop.location, seg.fromStop.location);
      } else {
        walkMinutes = 2; // default transfer walk
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

    // 2. Wait for next vehicle at boarding stop
    let waitMinutes = 3; // default wait
    const arrivalAtStop = new Date(now.getTime() + totalMinutes * 60000);

    try {
      const etas = await fetchETA(
        seg.fromStop.id,
        seg.route.type as 'bus' | 'mtr' | 'gmb' | 'tram',
        seg.route.operator === 'citybus' ? 'CTB' : 'KMB',
        seg.route.name,
        seg.route.type === 'mtr' ? seg.route.name : undefined,
      );

      if (etas.length > 0) {
        const firstETA = etas[0];
        const etaTime = new Date(now.getTime() + firstETA.minutesAway * 60000);
        waitMinutes = Math.max(0, Math.ceil((etaTime.getTime() - arrivalAtStop.getTime()) / 60000));

        // Confidence based on ETA freshness
        if (firstETA.minutesAway > 30) minConfidence = 'low';
        else if (firstETA.minutesAway > 15) minConfidence = 'medium';
      }

      if (waitMinutes > 15) {
        canMakeIt = false;
      }
    } catch {
      minConfidence = 'low';
      waitMinutes = 5; // fallback
    }

    segments.push({
      type: 'wait',
      minutes: waitMinutes,
      description: `等 ${seg.route.type === 'mtr' ? getMTRLineName(seg.route.name) : seg.route.name}`,
    });
    totalMinutes += waitMinutes;

    // 3. Ride time — estimate based on transport type
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
      // Bus: estimate from haversine distance, avg 18 km/h (0.3 km/min)
      // Guard: if either stop has (0,0) coords, use a reasonable default
      if (isZeroLocation(seg.fromStop.location) || isZeroLocation(seg.toStop.location)) {
        rideMinutes = 30; // default bus ride estimate
        minConfidence = 'low';
      } else {
        const distKm = haversineKmBetween(seg.fromStop.location, seg.toStop.location);
        rideMinutes = Math.max(5, Math.ceil(distKm / 0.3));
      }
    } else {
      // Minibus/tram/etc: default 8 min
      rideMinutes = 8;
    }

    segments.push({
      type: 'ride',
      minutes: rideMinutes,
      description: `乘搭 ${seg.route.type === 'mtr' ? getMTRLineName(seg.route.name) : seg.route.name}`,
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
