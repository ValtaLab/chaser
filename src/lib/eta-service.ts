// Combined ETA service — merges bus + MTR + GMB + tram data
import { getStopETA, type StopETA } from './bus-api';
import { getMTRETA, type MTRETA, findStation } from './mtr-api';
import { getGMBStopETASummary, type GMBStopETAInfo } from './gmb-api';
import { getEstimatedTramTime } from './tram-api';

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
