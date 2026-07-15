// Detect whether user is already mid-route (on vehicle) when starting / during tracking.
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
  distToEndM: number;
  /** Segment indices fully behind the user (skip entirely) */
  completedBefore: number[];
  /**
   * Which segment's boarding-stop ETA to show in the floating card.
   * null = none (riding mid-segment, not yet near alight / next board).
   */
  etaSegmentIndex: number | null;
  /** Near alight stop of current ride — ready to transfer / end */
  nearAlight: boolean;
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
  /** Near end of ride — treat as at transfer / alight */
  nearAlightFraction: 0.88,
  nearAlightDistM: 450,
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
 * Find best-matching segment and decide journey phase (mid-route / transfer / waiting).
 * Continuously usable while tracking — not only at start.
 */
export function detectMidJourney(
  user: Location | null | undefined,
  polylines: Location[][],
  opts: Partial<typeof DEFAULTS> = {},
): MidJourneyState | null {
  if (!user || !polylines?.length) return null;
  const cfg = { ...DEFAULTS, ...opts };

  // Score every segment — prefer later segments when distances are similar (transfer point)
  type Scored = SegmentProgress & { score: number };
  const scored: Scored[] = [];
  for (let i = 0; i < polylines.length; i++) {
    const p = progressOnPolyline(user, polylines[i]);
    if (!p) continue;
    p.segmentIndex = i;
    // Prefer closer poly; slight bias to later segments so transfer stop picks next ride
    const score = p.distToPolylineM - i * 15;
    scored.push({ ...p, score });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => a.score - b.score);
  const best = scored[0];
  if (best.distToPolylineM > cfg.maxOffRouteM) return null;

  const pastBoard =
    best.distFromStartM >= cfg.minFromStartM ||
    best.fraction >= cfg.minFraction ||
    best.alongRouteM >= cfg.minAlongM;

  const nearAlight =
    best.fraction >= cfg.nearAlightFraction ||
    best.distToEndM <= cfg.nearAlightDistM;

  // ── Waiting near boarding of this segment (not yet left stop) ──
  if (!pastBoard) {
    return {
      alreadyOnBoard: false,
      segmentIndex: best.segmentIndex,
      fraction: best.fraction,
      remainingFraction: 1 - best.fraction,
      distToPolylineM: best.distToPolylineM,
      distToEndM: best.distToEndM,
      completedBefore: best.segmentIndex > 0
        ? Array.from({ length: best.segmentIndex }, (_, k) => k)
        : [],
      etaSegmentIndex: best.segmentIndex,
      nearAlight: false,
    };
  }

  // ── On board, near alight → promote to next segment (transfer) ──
  if (nearAlight && best.segmentIndex + 1 < polylines.length) {
    const next = best.segmentIndex + 1;
    return {
      alreadyOnBoard: false,
      segmentIndex: next,
      fraction: 0,
      remainingFraction: 1,
      distToPolylineM: best.distToPolylineM,
      distToEndM: best.distToEndM,
      completedBefore: Array.from({ length: next }, (_, k) => k),
      etaSegmentIndex: next,
      nearAlight: true,
    };
  }

  // ── On board mid-ride ──
  return {
    alreadyOnBoard: true,
    segmentIndex: best.segmentIndex,
    fraction: best.fraction,
    remainingFraction: Math.max(0.05, 1 - best.fraction),
    distToPolylineM: best.distToPolylineM,
    distToEndM: best.distToEndM,
    completedBefore: Array.from({ length: best.segmentIndex }, (_, k) => k),
    // No boarding ETA while mid-ride; next appears when nearAlight
    etaSegmentIndex: null,
    nearAlight,
  };
}

/** Fingerprint for DO resync — changes when phase meaningfully shifts */
export function midJourneyKey(m: MidJourneyState | null): string {
  if (!m) return 'none';
  return `${m.segmentIndex}:${m.alreadyOnBoard ? 'ride' : 'wait'}:${m.etaSegmentIndex ?? 'x'}:${Math.floor(m.fraction * 10)}`;
}
