// Smart route recommendation — find the fastest complete route
import { getStopETA, type StopETA } from './bus-api';
import { getMTRETA, getLineStations, MTR_STATIONS } from './mtr-api';
import { haversineMeters } from './road-snap';
import type { Location } from '../types';

// ─── Types ────────────────────────────────────────────────────────────

export interface SmartRouteOption {
  id: string;
  type: 'bus' | 'mtr' | 'bus+mtr';
  name: string;           // e.g. "72X 直達" or "EAL 線 + 步行"
  description: string;    // e.g. "搭 72X 直達旺角"
  totalMinutes: number;   // total journey time
  walkMinutes: number;    // total walking
  waitMinutes: number;    // total waiting
  rideMinutes: number;    // total riding
  segments: SmartRouteSegment[];
  savedVsConfigured: number;  // minutes saved vs user's configured route
  confidence: 'high' | 'medium' | 'low';
}

export interface SmartRouteSegment {
  type: 'walk' | 'wait' | 'ride';
  label: string;          // e.g. "步行去富蝶總站", "等 72X", "搭 72X 去旺角"
  minutes: number;
  details?: string;       // e.g. "200m", "ETA 5 min"
}

export interface SmartRouteRecommendation {
  currentRouteMinutes: number;   // user's configured route total time
  bestAlternative: SmartRouteOption | null;
  allOptions: SmartRouteOption[];
}

// ─── Main function ───────────────────────────────────────────────────

/**
 * Find the smartest route from current location to destination.
 * Runs immediately when tracking starts.
 */
export async function findSmartRoute(
  currentLocation: Location,
  destinationLocation: Location,
  configuredRoute: {
    segments: Array<{
      route: { name: string; type: string; operator: string };
      fromStop: { id: string; name: string; nameZh: string; location: Location };
      toStop: { id: string; name: string; nameZh: string; location: Location };
    }>;
    etas: Array<{ route: string; minutesAway: number }>;
  },
): Promise<SmartRouteRecommendation> {
  console.log('[SmartRoute] Starting smart route search');
  console.log('[SmartRoute] From:', currentLocation.lat, currentLocation.lng);
  console.log('[SmartRoute] To:', destinationLocation.lat, destinationLocation.lng);

  const options: SmartRouteOption[] = [];

  // 1. Calculate user's configured route total time
  const configuredTime = await calculateConfiguredRouteTime(configuredRoute);
  console.log('[SmartRoute] Configured route time:', configuredTime, 'min');

  // 2. Find MTR-only option
  const mtrOption = await findMTROnlyOption(currentLocation, destinationLocation, configuredTime);
  if (mtrOption) {
    options.push(mtrOption);
    console.log('[SmartRoute] MTR option:', mtrOption.totalMinutes, 'min, saved', mtrOption.savedVsConfigured);
  }

  // 3. Find nearby bus options (at current location)
  const busOptions = await findNearbyBusOptions(currentLocation, destinationLocation, configuredTime);
  options.push(...busOptions);
  console.log('[SmartRoute] Bus options found:', busOptions.length);

  // 4. Find bus + MTR combo options
  const comboOptions = await findBusMTRComboOptions(currentLocation, destinationLocation, configuredTime);
  options.push(...comboOptions);
  console.log('[SmartRoute] Combo options found:', comboOptions.length);

  // Sort by total time
  options.sort((a, b) => a.totalMinutes - b.totalMinutes);

  // Filter to only options that save time
  const betterOptions = options.filter(o => o.savedVsConfigured > 0);

  console.log('[SmartRoute] Total options:', options.length, 'Better options:', betterOptions.length);

  return {
    currentRouteMinutes: configuredTime,
    bestAlternative: betterOptions.length > 0 ? betterOptions[0] : null,
    allOptions: betterOptions.slice(0, 3),  // Top 3
  };
}

// ─── Calculate configured route time ──────────────────────────────────

async function calculateConfiguredRouteTime(configuredRoute: {
  segments: Array<{
    route: { name: string; type: string };
    fromStop: { location: Location };
    toStop: { location: Location };
  }>;
  etas: Array<{ route: string; minutesAway: number }>;
}): Promise<number> {
  let totalTime = 0;
  const isZero = (loc: Location) => loc.lat === 0 && loc.lng === 0;

  for (let i = 0; i < configuredRoute.segments.length; i++) {
    const seg = configuredRoute.segments[i];
    const eta = configuredRoute.etas[i];

    // Walk time (from previous location or current location)
    let walkTime = 0;
    if (i > 0) {
      const prevLoc = configuredRoute.segments[i - 1].toStop.location;
      const currLoc = seg.fromStop.location;
      if (!isZero(prevLoc) && !isZero(currLoc)) {
        walkTime = Math.ceil(haversineMeters(prevLoc, currLoc) / 80);
      } else {
        walkTime = 2;  // Default walk time
      }
    }

    // Wait time
    const waitTime = eta?.minutesAway || 5;

    // Ride time
    const rideTime = estimateRideTime(seg);

    totalTime += walkTime + waitTime + rideTime;
  }

  return totalTime;
}

// ─── Find MTR-only option ─────────────────────────────────────────────

async function findMTROnlyOption(
  from: Location,
  to: Location,
  baselineTime: number,
): Promise<SmartRouteOption | null> {
  // Find nearby MTR stations
  const fromStations = MTR_STATIONS.filter(s =>
    haversineMeters(from, { lat: s.lat, lng: s.lng }) < 1000
  );
  const toStations = MTR_STATIONS.filter(s =>
    haversineMeters(to, { lat: s.lat, lng: s.lng }) < 1000
  );

  if (fromStations.length === 0 || toStations.length === 0) return null;

  let bestOption: SmartRouteOption | null = null;

  for (const fromStation of fromStations) {
    for (const toStation of toStations) {
      if (fromStation.stationCode === toStation.stationCode) continue;

      // Find connecting lines
      const lines = findConnectingLines(fromStation.stationCode, toStation.stationCode);

      for (const lineCode of lines) {
        try {
          const etas = await getMTRETA(lineCode, fromStation.stationCode);

          // Filter ETAs going in the right direction
          const validEtas = etas.filter(t => {
            if (!t.ttnt || t.ttnt === '-' || t.ttnt === '') return false;
            const stations = getLineStations(lineCode);
            const fromIdx = stations.findIndex(s => s.stationCode === fromStation.stationCode);
            const toIdx = stations.findIndex(s => s.stationCode === toStation.stationCode);
            const destIdx = stations.findIndex(s => s.stationCode === t.destination);
            if (fromIdx === -1 || toIdx === -1 || destIdx === -1) return false;
            if (toIdx > fromIdx) return destIdx >= toIdx;
            return destIdx <= toIdx;
          });

          if (validEtas.length === 0) continue;

          const waitMinutes = parseInt(validEtas[0].ttnt) || 5;

          // Calculate times
          const walkToMTR = Math.ceil(haversineMeters(from, { lat: fromStation.lat, lng: fromStation.lng }) / 80);
          const walkFromMTR = Math.ceil(haversineMeters(to, { lat: toStation.lat, lng: toStation.lng }) / 80);

          const stations = getLineStations(lineCode);
          const fromIdx = stations.findIndex(s => s.stationCode === fromStation.stationCode);
          const toIdx = stations.findIndex(s => s.stationCode === toStation.stationCode);
          const stationCount = Math.abs(toIdx - fromIdx);
          const rideMinutes = Math.max(3, Math.ceil(stationCount * 2.5));

          const totalMinutes = walkToMTR + waitMinutes + rideMinutes + walkFromMTR;
          const saved = baselineTime - totalMinutes;

          if (saved > 0) {
            const option: SmartRouteOption = {
              id: `mtr-${lineCode}-${fromStation.stationCode}-${toStation.stationCode}`,
              type: 'mtr',
              name: `${lineCode} 線`,
              description: `🚇 步行 ${walkToMTR}min → ${lineCode} ${fromStation.name_tc}→${toStation.name_tc} (${rideMinutes}min) → 步行 ${walkFromMTR}min`,
              totalMinutes,
              walkMinutes: walkToMTR + walkFromMTR,
              waitMinutes,
              rideMinutes,
              segments: [
                { type: 'walk', label: `步行去 ${fromStation.name_tc} 站`, minutes: walkToMTR, details: `${Math.round(haversineMeters(from, { lat: fromStation.lat, lng: fromStation.lng }))}m` },
                { type: 'wait', label: `等 ${lineCode}`, minutes: waitMinutes, details: `ETA ${validEtas[0].ttnt} min` },
                { type: 'ride', label: `${lineCode} ${fromStation.name_tc}→${toStation.name_tc}`, minutes: rideMinutes, details: `${stationCount} 站` },
                { type: 'walk', label: `步行去目的地`, minutes: walkFromMTR, details: `${Math.round(haversineMeters(to, { lat: toStation.lat, lng: toStation.lng }))}m` },
              ],
              savedVsConfigured: saved,
              confidence: waitMinutes <= 5 ? 'high' : waitMinutes <= 10 ? 'medium' : 'low',
            };

            if (!bestOption || option.totalMinutes < bestOption.totalMinutes) {
              bestOption = option;
            }
          }
        } catch (err) {
          console.error('[SmartRoute:MTR] Error:', lineCode, err);
        }
      }
    }
  }

  return bestOption;
}

// ─── Find nearby bus options ──────────────────────────────────────────

async function findNearbyBusOptions(
  from: Location,
  to: Location,
  baselineTime: number,
): Promise<SmartRouteOption[]> {
  const options: SmartRouteOption[] = [];

  // Find nearby KMB/Citybus stops (within 500m)
  // We can't easily find all stops without a database, so we'll use the
  // configured route's stops as a reference and check for alternatives there

  // For now, return empty - this would require a stop database
  return options;
}

// ─── Find bus + MTR combo options ─────────────────────────────────────

async function findBusMTRComboOptions(
  from: Location,
  to: Location,
  baselineTime: number,
): Promise<SmartRouteOption[]> {
  // This would require complex route planning
  // For now, return empty
  return [];
}

// ─── Helpers ──────────────────────────────────────────────────────────

function estimateRideTime(segment: { route: { type: string }; fromStop: { location: Location }; toStop: { location: Location } }): number {
  if (segment.route.type === 'mtr') {
    return 10;  // Default MTR ride time
  }
  // Guard against zero coordinates
  const isZero = (loc: Location) => loc.lat === 0 && loc.lng === 0;
  if (isZero(segment.fromStop.location) || isZero(segment.toStop.location)) {
    return 30;  // Default bus ride time
  }
  // Bus: estimate from distance
  const distKm = haversineMeters(segment.fromStop.location, segment.toStop.location) / 1000;
  return Math.max(5, Math.ceil(distKm / 0.3));
}

function findConnectingLines(fromStationCode: string, toStationCode: string): string[] {
  const lines: string[] = [];
  const allLines = ['TWL', 'KTL', 'ISL', 'TKL', 'EAL', 'SCL', 'TCL', 'AEL'];

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