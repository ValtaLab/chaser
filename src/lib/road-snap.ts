// Snap coordinates to actual roads using OSRM (free demo server)
import type { Location } from '@/types';

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';
const OSRM_WALK_BASE = 'https://router.project-osrm.org/route/v1/walking';

/**
 * Takes an array of coordinates and returns a road-following polyline.
 * Uses OSRM route service with fixed waypoint order.
 * Max 100 waypoints per request (OSRM limit).
 * Removes waypoints that are too close (<100m) to avoid snapping to flyovers.
 */
export async function snapToRoads(points: Location[]): Promise<Location[]> {
  if (points.length < 2) return points;
  
  // Remove waypoints that are too close together (<500m for bus routes)
  // Using sparser waypoints gives OSRM more freedom to find the best road path
  // and avoids snapping to flyovers when stops are near them
  const filtered = filterClosePoints(points, 500);
  
  if (filtered.length < 2) return points;
  if (filtered.length === 2) return await snapTwoPoints(filtered[0], filtered[1]);

  // OSRM route service: fixed waypoint order, max 100 points
  const MAX_WAYPOINTS = 100;
  const allCoords: [number, number][] = [];

  for (let i = 0; i < filtered.length; i += MAX_WAYPOINTS - 1) {
    const chunk = filtered.slice(i, i + MAX_WAYPOINTS);
    // Overlap by 1 point between chunks to avoid gaps
    if (i > 0 && allCoords.length > 0) {
      chunk.unshift(filtered[i]);
    }
    
    const coords = await fetchOSRMRoute(chunk);
    if (coords) {
      const skipFirst = i > 0 && allCoords.length > 0 ? 1 : 0;
      allCoords.push(...coords.slice(skipFirst));
    } else {
      return points; // fallback to straight lines
    }
  }

  return allCoords.map(([lng, lat]) => ({ lat, lng }));
}

/** Remove points that are within minDistM meters of the previous kept point */
function filterClosePoints(points: Location[], minDistM: number): Location[] {
  if (points.length <= 2) return points;
  const result: Location[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const dist = haversineMeters(prev, points[i]);
    if (dist >= minDistM || i === points.length - 1) {
      // Always keep the last point
      result.push(points[i]);
    }
  }
  return result;
}

export function haversineMeters(a: Location, b: Location): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Calculate walking time (in minutes) between two points using OSRM walking profile.
 * Falls back to haversine distance / 80m/min (average 5 km/h walking speed) × 1.3 detour if OSRM fails.
 */
export async function walkTimeBetween(from: Location, to: Location): Promise<number> {
  try {
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const url = `${OSRM_WALK_BASE}/${coords}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`[WalkTime] OSRM ${res.status}, fallback`);
      return fallbackWalkTime(from, to);
    }
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) {
      console.log(`[WalkTime] OSRM no route, fallback`);
      return fallbackWalkTime(from, to);
    }
    // NOTE: OSRM demo server's walking profile returns car-like speeds.
    // We use OSRM's road DISTANCE (accurate) but calculate time
    // at 80m/min (5 km/h average walking speed).
    const roadMeters = data.routes[0].distance;
    const walkingMinutes = roadMeters / 80;
    const result = Math.max(1, Math.ceil(walkingMinutes) + 1);
    console.log(`[WalkTime] OSRM road=${roadMeters}m → ${result}min (OSRM raw duration would be ${(data.routes[0].duration/60).toFixed(1)}min — unreliable)`);
    return result;
  } catch (err) {
    console.log(`[WalkTime] OSRM err: ${err}, fallback`);
    return fallbackWalkTime(from, to);
  }
}

function fallbackWalkTime(from: Location, to: Location): number {
  // Straight-line distance / 80m per minute (5 km/h walking speed) × 1.3 detour factor
  const dist = haversineMeters(from, to);
  return Math.max(1, Math.ceil((dist * 1.3) / 80));
}

/**
 * Calculate walking distance (in meters) between two points using OSRM walking profile.
 * Falls back to haversine distance × 1.3 if OSRM fails.
 */
export async function walkDistanceBetween(from: Location, to: Location): Promise<number> {
  try {
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const url = `${OSRM_WALK_BASE}/${coords}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) return haversineMeters(from, to) * 1.3;
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) return haversineMeters(from, to) * 1.3;
    return data.routes[0].distance;
  } catch {
    return haversineMeters(from, to) * 1.3;
  }
}

async function snapTwoPoints(from: Location, to: Location): Promise<Location[]> {
  const coords = await fetchOSRMRoute([from, to]);
  if (coords) {
    return coords.map(([lng, lat]) => ({ lat, lng }));
  }
  return [from, to]; // fallback
}

async function fetchOSRMRoute(points: Location[]): Promise<[number, number][] | null> {
  try {
    // OSRM expects lng,lat format
    const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`;
    
    const res = await fetch(url);
    if (!res.ok) return null;
    
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) return null;
    
    return data.routes[0].geometry.coordinates;
  } catch (err) {
    console.error('OSRM snap error:', err);
    return null;
  }
}