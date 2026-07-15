// Detect whether user is already mid-route (on vehicle) when starting tracking.
// Pure geometry on GPS + per-segment polylines — no network.

import type { Location } from '@/types';
import { haversineMeters } from './road-snap';

export interface SegmentProgress {
  segmentIndex: number;
  /** 0 = at fromStop end of poly, 1 = at toStop end */
  fraction: number;
  distToPolylineM: number;
  distFromStartM: number;
  distToEndM: number;
  alongRouteM: number;
  totalRouteM: number;
}

export interface MidJourneyState {
  /** True when GPS is on-route past boarding — skip wait/board for this segment */
  alreadyOnBoard: boolean;
  segmentIndex: number;
  fraction: number;
  remainingFraction: number;
  distToPolylineM: number;
  /** Segment indices fully behind the user (skip entirely) */
  completedBefore: number[];
}

const DEFAULTS = {
  /** Max distance from polyline to count as "on route" */
  maxOffRouteM: 150,
  /** Must be this far from boarding end of poly to count as left the stop */
  minFromStartM: 400,
  /** Or at least this fraction along the segment */
  minFraction: 0.08,
  /** Absolute along-route distance also qualifies */
  minAlongM: 600,
};

function projectPointToSegment(
  p: Location,
  a: Location,
  b: Location,
): { point: Location; t: number; distM: number } {
  const lat0 = ((a.lat + b.lat) / 2) * Math.PI / 180;
  const x = (lng: number) => (lng * Math.PI / 180) * Math.cos(lat0) * 6371000;
  const y = (lat: number) => (lat * Math.PI / 180) * 6371000;

  const ax = x(a.lng); const ay = y(a.lat);
  const bx = x(b.lng); const by = y(b.lat);
  const px = x(p.lng); const py = y(p.lat);

  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 1) {
    t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
  }
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  // Approximate inverse
  const qLat = qy / 6371000 * 180 / Math.PI;
  const qLng = qx / (6371000 * Math.cos(lat0)) * 180 / Math.PI;
  const point = { lat: qLat, lng: qLng };
  return { point, t, distM: haversineMeters(p, point) };
}

/** Progress of user along one segment polyline. */
export function progressOnPolyline(
  user: Location,
  poly: Location[],
): SegmentProgress | null {
  if (!poly || poly.length < 2) return null;
  if (!Number.isFinite(user.lat) || !Number.isFinite(user.lng)) return null;

  // Cumulative lengths
  const edgeLens: number[] = [];
  let total = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const d = haversineMeters(poly[i], poly[i + 1]);
    edgeLens.push(d);
    total += d;
  }
  if (total < 1) return null;

  let bestDist = Infinity;
  let bestAlong = 0;
  let cum = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const { t, distM } = projectPointToSegment(user, poly[i], poly[i + 1]);
    if (distM < bestDist) {
      bestDist = distM;
      bestAlong = cum + t * edgeLens[i];
    }
    cum += edgeLens[i];
  }

  const fraction = Math.max(0, Math.min(1, bestAlong / total));
  return {
    segmentIndex: -1,
    fraction,
    distToPolylineM: bestDist,
    distFromStartM: bestAlong,
    distToEndM: total - bestAlong,
    alongRouteM: bestAlong,
    totalRouteM: total,
  };
}

/**
 * Find best-matching segment and decide if user is already mid-journey.
 */
export function detectMidJourney(
  user: Location | null | undefined,
  polylines: Location[][],
  opts: Partial<typeof DEFAULTS> = {},
): MidJourneyState | null {
  if (!user || !polylines?.length) return null;
  const cfg = { ...DEFAULTS, ...opts };

  let best: SegmentProgress | null = null;
  let bestIdx = -1;

  for (let i = 0; i < polylines.length; i++) {
    const p = progressOnPolyline(user, polylines[i]);
    if (!p) continue;
    p.segmentIndex = i;
    if (!best || p.distToPolylineM < best.distToPolylineM) {
      best = p;
      bestIdx = i;
    }
  }

  if (!best || bestIdx < 0) return null;
  if (best.distToPolylineM > cfg.maxOffRouteM) return null;

  const pastBoard =
    best.distFromStartM >= cfg.minFromStartM ||
    best.fraction >= cfg.minFraction ||
    best.alongRouteM >= cfg.minAlongM;

  // Near start of route on poly but still close to fromStop end → waiting, not onboard
  if (!pastBoard) {
    return {
      alreadyOnBoard: false,
      segmentIndex: bestIdx,
      fraction: best.fraction,
      remainingFraction: 1 - best.fraction,
      distToPolylineM: best.distToPolylineM,
      completedBefore: bestIdx > 0 ? Array.from({ length: bestIdx }, (_, k) => k) : [],
    };
  }

  return {
    alreadyOnBoard: true,
    segmentIndex: bestIdx,
    fraction: best.fraction,
    remainingFraction: Math.max(0.05, 1 - best.fraction), // keep at least 5% for transfer timing
    distToPolylineM: best.distToPolylineM,
    completedBefore: Array.from({ length: bestIdx }, (_, k) => k),
  };
}
