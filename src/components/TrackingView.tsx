'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { fetchETA, calculateTotalJourney, type TransportETA } from '@/lib/eta-service';
import { ChevronLeft } from 'lucide-react';
import {
  findAlternativesForSegment,
  type SegmentAlternatives,
} from '@/lib/alternative-routes';
import {
  getKMBRouteStops, getKMBStopInfo,
  getCitybusRouteStops, getCitybusStopInfo,
  findCitybusStopAnyDirection,
  getCitybusRouteInfo,
} from '@/lib/bus-api';
import { getMTRLineCoords, getLineStations, findStation, getMTRLineName } from '@/lib/mtr-api';

// ─── MTR direction filter: is this train going towards our destination? ──
function isSameMTRDirection(lineCode: string, fromStationCode: string, destStationCode: string, trainTerminal: string): boolean {
  const stations = getLineStations(lineCode);
  if (stations.length === 0) return true;
  const fromIdx = stations.findIndex(s => s.stationCode === fromStationCode);
  const destIdx = stations.findIndex(s => s.stationCode === destStationCode);
  const terminalIdx = stations.findIndex(s => s.stationCode === trainTerminal);
  if (fromIdx === -1 || destIdx === -1 || terminalIdx === -1) return true;
  
  // User is going fromIdx → destIdx
  // A correct train has its terminal beyond destIdx in the same direction
  if (destIdx > fromIdx) {
    // Going toward higher index → terminal should be >= destIdx
    return terminalIdx >= destIdx;
  } else {
    // Going toward lower index → terminal should be <= destIdx
    return terminalIdx <= destIdx;
  }
}
import { snapToRoads, haversineMeters } from '@/lib/road-snap';
import { enrichSegmentWithCoords } from '@/lib/stop-coords';
import SmartJourneyTimeline from './SmartJourneyTimeline';
import AlternativeRouteCard from './AlternativeRouteCard';
import type { CommuteRoute, CommuteSegment, Location, SmartSegment, SmartRouteRecommendation } from '@/types';

// ─── Helper: find correct direction and get all stop coordinates ─────
async function findDirectionWithStops(
  routeName: string,
  operator: 'kmb' | 'citybus',
  fromStopId: string,
  toStopId: string,
  addDebug?: (msg: string) => void
): Promise<Location[] | null> {
  addDebug?.(`🔍 ${operator} ${routeName}: from=${fromStopId} to=${toStopId}`);

  if (operator === 'kmb') {
    // KMB: get all route entries (different service types + directions)
    const { getKMBRouteInfo } = await import('@/lib/bus-api');
    const routeInfos = await getKMBRouteInfo(routeName);
    addDebug?.(`  found ${routeInfos.length} route entries (service types × directions)`);

    // Deduplicate by bound+service_type
    const combos = new Map<string, { bound: string; serviceType: string }>();
    for (const r of routeInfos) {
      const key = `${r.bound}-${r.service_type}`;
      combos.set(key, { bound: r.bound, serviceType: r.service_type });
    }

    for (const [key, { bound, serviceType }] of combos) {
      try {
        const dir = bound === 'O' ? 'outbound' : 'inbound';
        const routeStops = await getKMBRouteStops(routeName, bound as 'I' | 'O', serviceType);
        addDebug?.(`  ${dir} st=${serviceType}: ${routeStops.length} stops`);

        const fromIdx = routeStops.findIndex(s => s.stop === fromStopId);
        const toIdx = routeStops.findIndex(s => s.stop === toStopId);
        addDebug?.(`    fromIdx=${fromIdx} toIdx=${toIdx}`);

        if (fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx) {
          const relevantStops = routeStops.slice(fromIdx, toIdx + 1);
          addDebug?.(`    ✅ found ${relevantStops.length} stops in range`);

          const coords = await Promise.all(
            relevantStops.map(async (s) => {
              const info = await getKMBStopInfo(s.stop);
              if (info) return { lat: info.lat, lng: info.long };
              return null;
            })
          );

          const validCoords = coords.filter((c): c is Location => c !== null);
          addDebug?.(`    📍 got ${validCoords.length} coords`);
          if (validCoords.length >= 2) return validCoords;
        }
      } catch (err) {
        addDebug?.(`    ❌ ${key} error: ${err}`);
      }
    }
  } else {
    // Citybus: try both directions
    const directions: ('I' | 'O')[] = ['O', 'I'];
    for (const dir of directions) {
      try {
        const routeStops = await getCitybusRouteStops(routeName, dir);
        addDebug?.(`  dir=${dir}: ${routeStops.length} stops`);

        const fromIdx = routeStops.findIndex(s => s.stop === fromStopId);
        const toIdx = routeStops.findIndex(s => s.stop === toStopId);
        addDebug?.(`    fromIdx=${fromIdx} toIdx=${toIdx}`);

        if (fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx) {
          const relevantStops = routeStops.slice(fromIdx, toIdx + 1);
          const coords = await Promise.all(
            relevantStops.map(async (s) => {
              const info = await getCitybusStopInfo(s.stop);
              if (info) return { lat: info.lat, lng: info.long };
              return null;
            })
          );
          const validCoords = coords.filter((c): c is Location => c !== null);
          if (validCoords.length >= 2) return validCoords;
        }
      } catch (err) {
        addDebug?.(`  ❌ dir=${dir} error: ${err}`);
      }
    }
  }

  addDebug?.(`  ⚠️ no valid direction found, fallback to straight line`);
  return null;
}

// ─── Cross-platform notification helper ──────────────────────────────
// iOS PWA doesn't support `new Notification()` constructor.
// Use ServiceWorkerRegistration.showNotification() instead.
function sendNotification(title: string, options: { body: string; tag: string; silent?: boolean }) {
  try {
    if (!('Notification' in window)) return;

    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isStandalone && isIOS) {
      // iOS PWA: use Service Worker showNotification — no Notification.permission needed
      navigator.serviceWorker?.getRegistration()?.then(reg => {
        reg?.showNotification(title, {
          body: options.body,
          tag: options.tag,
          icon: '/icon-192-v2.png',
          badge: '/icon-192-v2.png',
        }).catch(() => {/* silent fail */});
      });
    } else {
      // Desktop Safari / Chrome: use Notification constructor
      if (Notification.permission !== 'granted') return;
      try {
        new Notification(title, {
          body: options.body,
          tag: options.tag,
          icon: '/icon-192-v2.png',
          badge: '/icon-192-v2.png',
        });
      } catch {/* silent fail */}
    }
  } catch {/* silent fail */}
}

// ─── Dynamically import entire map (avoids SSR + leaflet CSS issues) ──
const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-800">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-sm mt-3">載入地圖中...</p>
      </div>
    </div>
  ),
});

// ─── Props ───────────────────────────────────────────────────────────
interface TrackingViewProps {
  route: CommuteRoute;
  currentLocation: Location | null;
  onEndJourney: () => void;
  onBack?: () => void;
}

// ─── Segment ETA state ───────────────────────────────────────────────
interface SegmentETAData {
  segmentId: string;
  label: string;
  etas: TransportETA[];
}

// ─── Main Component ──────────────────────────────────────────────────
export default function TrackingView({
  route,
  currentLocation,
  onEndJourney,
  onBack,
}: TrackingViewProps) {
  const [segmentETAs, setSegmentETAs] = useState<SegmentETAData[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [liveLocation, setLiveLocation] = useState<Location | null>(currentLocation);
  const [showETAPanel, setShowETAPanel] = useState(true);
  const [routePolylines, setRoutePolylines] = useState<Location[][]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [alternatives, setAlternatives] = useState<SegmentAlternatives[]>([]);
  const [showTimelineDetail, setShowTimelineDetail] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'waiting' | 'active' | 'error' | 'none'>('none');
  const enrichedRouteRef = useRef<{ origin: Location; destination: Location } | null>(null);
  const enrichedSegmentsRef = useRef<CommuteSegment[] | null>(null);
  // Cache: Set of route names that Citybus also serves (joint-operated routes like 307P)
  const citybusRouteCacheRef = useRef<Set<string>>(new Set());
  const [enrichmentDone, setEnrichmentDone] = useState(false);
  const addDebug = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
    const line = `${ts} ${msg}`;
    console.log(line);
    setDebugLogs(prev => [...prev.slice(-30), line]);
  }, []);

  // ── Enrich segments with coordinates (fix zero-coord routes) ───────
  useEffect(() => {
    // Fire-and-forget: enrich coordinates in background, don't block UI
    (async () => {
      try {
        const segments = await Promise.all(
          route.segments.map(seg => enrichSegmentWithCoords(seg))
        );
        enrichedSegmentsRef.current = segments;
        const origin = segments[0]?.fromStop.location;
        const dest = segments[segments.length - 1]?.toStop.location;
        if (origin && dest &&
            typeof origin.lat === 'number' && typeof origin.lng === 'number' &&
            typeof dest.lat === 'number' && typeof dest.lng === 'number' &&
            (origin.lat !== 0 || dest.lat !== 0)) {
          enrichedRouteRef.current = { origin, destination: dest };
          addDebug(`🗺️ enriched coords: origin=(${origin.lat.toFixed(4)},${origin.lng.toFixed(4)})`);
        }
      } catch {
        // Silent fail — progress notification just won't work for old routes
      }
      setEnrichmentDone(true);
    })();
  }, [route.segments]);

  // ── Request notification permission on journey start ─────────────
  useEffect(() => {
    try {
      // Skip on iOS PWA — Notification constructor not supported
      const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (isStandalone && isIOS) {
        addDebug('🔔 iOS PWA: skip Notification (use showNotification instead)');
        return;
      }
      if ('Notification' in window && Notification.permission === 'default') {
        addDebug('🔔 requesting notification permission...');
        Notification.requestPermission()
          .then(result => addDebug(`🔔 permission: ${result}`))
          .catch(err => addDebug(`🔔 permission error: ${err}`));
      }
    } catch (err) {
      addDebug(`🔔 notification setup error: ${err}`);
    }
  }, []);

  // ── Sync liveLocation from currentLocation prop ─────────────────
  // useState(currentLocation) only uses the INITIAL value — this keeps it in sync
  useEffect(() => {
    if (currentLocation) {
      setLiveLocation(currentLocation);
      setGpsStatus('active');
    }
  }, [currentLocation]);

  // ── Live location tracking (runs inside tracking view) ───────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus('none');
      addDebug('📍 GPS: 瀏覽器唔支援 geolocation API');
      return;
    }

    // Check permission state if available
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((status) => {
        addDebug(`📍 位置權限狀態: ${status.state}`);
        if (status.state === 'denied') {
          setGpsStatus('error');
          addDebug('⚠️ 位置權限已拒絕！請去 iOS 設定 → Safari → 位置 → 改為「使用期間」');
        }
        status.onchange = () => addDebug(`📍 權限變更: ${status.state}`);
      }).catch((e) => addDebug(`📍 permission.query error: ${e}`));
    } else {
      addDebug('📍 navigator.permissions 唔可用');
    }

    addDebug('📍 請求 GPS 位置權限...');
    setGpsStatus('waiting');

    // iOS PWA: watchPosition often fails silently without getCurrentPosition first
    // Call getCurrentPosition to trigger the permission dialog, THEN watchPosition
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        addDebug(`📍 GPS 權限已授予 (${pos.coords.accuracy.toFixed(0)}m 精度)`);
        setLiveLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus('active');
      },
      (err) => {
        addDebug(`📍 ${err.code === 1 ? '❌ 權限被拒絕 (code 1)' : `GPS error ${err.code}`}: ${err.message}`);
        if (err.code === 1) { // PERMISSION_DENIED
          setGpsStatus('error');
          addDebug('👉 解決: iOS 設定 → Safari → 位置 → 揀「使用期間」');
          return;
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );

    // Continuous tracking after permission (or in case getCurrentPosition times out)
    let watchId: number;
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setLiveLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setGpsStatus('active');
        },
        (err) => {
          console.error('GPS watch error:', err);
          addDebug(`📍 GPS watch error: ${err.code} ${err.message}`);
          setGpsStatus('error');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
    } catch (e) {
      addDebug(`📍 GPS watch setup failed: ${e}`);
      setGpsStatus('error');
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // ── Calculate total journey estimate (debounced) ──────────────────
  // Basic estimate from route data — set synchronously so timeline always shows
  const basicEstimate = useMemo<SmartRouteRecommendation | null>(() => {
    if (!route?.segments?.length) return null;
    const now = new Date();
    const dumbSegments: SmartSegment[] = [];
    let totalMin = 0;
    for (let i = 0; i < route.segments.length; i++) {
      const seg = route.segments[i];
      if (i === 0) {
        dumbSegments.push({
          type: 'walk', minutes: 5,
          description: `步行至 ${seg.fromStop.nameZh || seg.fromStop.name}`,
          fromLocation: undefined, toLocation: seg.fromStop.location,
        });
        totalMin += 5;
      } else if (i > 0) {
        dumbSegments.push({
          type: 'walk', minutes: 3,
          description: `步行至 ${seg.fromStop.nameZh || seg.fromStop.name}`,
          fromLocation: route.segments[i-1].toStop.location,
          toLocation: seg.fromStop.location,
        });
        totalMin += 3;
      }
      dumbSegments.push({
        type: 'ride', minutes: 20,
        description: `乘搭 ${seg.route.name}`,
      });
      totalMin += 20;
    }
    return {
      routeId: route.id, routeName: route.name,
      direction: route.direction,
      totalMinutes: totalMin, segments: dumbSegments,
      departureTime: now, arrivalTime: new Date(now.getTime() + totalMin * 60000),
      canMakeIt: true, confidence: 'low' as const,
    };
  }, [route.id, route.name, route.direction, route.segments]);

  // Initialize journeyEstimate with basic estimate
  const [journeyEstimate, setJourneyEstimate] = useState<SmartRouteRecommendation | null>(basicEstimate);

  // Then: refine with GPS and real walk/ride calculations
  useEffect(() => {
    const timer = setTimeout(async () => {
      const defaultLoc = { lat: 22.3193, lng: 114.1694 };
      const loc = liveLocation
        || enrichedSegmentsRef.current?.[0]?.fromStop.location
        || defaultLoc;
      try {
        addDebug(`📍 ${liveLocation ? 'GPS' : (enrichedSegmentsRef.current?.[0]?.fromStop.location ? '車站' : '預設')}: (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})`);
        const result = await calculateTotalJourney(route, loc);
        setJourneyEstimate(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('Journey estimate error:', err);
        addDebug(`⚠️ 詳細估算失敗: ${msg}`);
        // Keep the basic estimate, just log the error
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [route, liveLocation, enrichmentDone]);

  // ── Fetch full route stop sequences for all segments ─────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchRoutePaths() {
      const polylines: Location[][] = [];
      addDebug(`🗺️ fetching route paths for ${route.segments.length} segments`);

      for (const seg of route.segments) {
        try {
          let stops: Location[] = [];
          addDebug(`  segment: ${seg.route.type} ${seg.route.name} (${seg.route.operator || 'unknown'})`);

          if (seg.route.type === 'mtr') {
            // MTR: use station code lookup, draw line between stations
            const stations = getLineStations(seg.route.name);
            addDebug(`  MTR ${seg.route.name}: ${stations.length} stations`);
            if (stations.length > 0) {
              const fromStation = findStation(seg.fromStop.id) || findStation(seg.fromStop.nameZh || seg.fromStop.name);
              const toStation = findStation(seg.toStop.id) || findStation(seg.toStop.nameZh || seg.toStop.name);
              addDebug(`  from=${fromStation?.stationCode || '??'} to=${toStation?.stationCode || '??'}`);
              
              if (fromStation && toStation) {
                const fromIdx = stations.findIndex(s => s.stationCode === fromStation.stationCode);
                const toIdx = stations.findIndex(s => s.stationCode === toStation.stationCode);
                addDebug(`  fromIdx=${fromIdx} toIdx=${toIdx}`);
                
                if (fromIdx !== -1 && toIdx !== -1) {
                  const start = Math.min(fromIdx, toIdx);
                  const end = Math.max(fromIdx, toIdx);
                  const sliced = stations.slice(start, end + 1);
                  stops = sliced.map(s => ({ lat: s.lat, lng: s.lng }));
                  if (fromIdx > toIdx) stops.reverse();
                  addDebug(`  ✅ MTR: ${stops.length} station points`);
                } else {
                  stops = [seg.fromStop.location, seg.toStop.location];
                }
              } else {
                stops = [seg.fromStop.location, seg.toStop.location];
              }
            } else {
              stops = [seg.fromStop.location, seg.toStop.location];
            }
          } else if (seg.route.operator === 'kmb') {
            // KMB: try both directions to find the one containing both stops
            const kmbStops = await findDirectionWithStops(
              seg.route.name, 'kmb', seg.fromStop.id, seg.toStop.id, addDebug
            );
            if (kmbStops) {
              stops = kmbStops;
            } else {
              stops = [seg.fromStop.location, seg.toStop.location];
            }
          } else if (seg.route.operator === 'citybus') {
            // Citybus: try both directions
            const ctbStops = await findDirectionWithStops(
              seg.route.name, 'citybus', seg.fromStop.id, seg.toStop.id, addDebug
            );
            if (ctbStops) {
              stops = ctbStops;
            } else {
              stops = [seg.fromStop.location, seg.toStop.location];
            }
          } else {
            // Fallback for other transport types
            stops = [seg.fromStop.location, seg.toStop.location];
          }

          polylines.push(stops);
        } catch (err) {
          console.error(`Failed to fetch route path for segment ${seg.id}:`, err);
          // Fallback: straight line
          polylines.push([seg.fromStop.location, seg.toStop.location]);
        }
      }

      if (!cancelled) {
        addDebug(`🗺️ snapping ${polylines.length} polylines to roads...`);
        
        // Snap each segment to roads (skip MTR which already has accurate coords)
        const snappedPolylines: Location[][] = [];
        for (let i = 0; i < polylines.length; i++) {
          const segType = route.segments[i]?.route.type;
          const poly = polylines[i];
          
          if (segType === 'mtr' || poly.length < 2) {
            snappedPolylines.push(poly);
          } else {
            try {
              const snapped = await snapToRoads(poly);
              addDebug(`  seg ${i}: ${poly.length}→${snapped.length} points`);
              snappedPolylines.push(snapped.length >= 2 ? snapped : poly);
            } catch (err) {
              addDebug(`  seg ${i}: snap failed, using raw`);
              snappedPolylines.push(poly);
            }
          }
        }
        
        setRoutePolylines(snappedPolylines);
      }
    }

    fetchRoutePaths();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.segments]);

  // ── Collect all valid polyline points from segments ──────────────
  const polylinePoints = useMemo(() => {
    const points: Location[] = [];
    for (const seg of route.segments) {
      const from = seg.fromStop?.location;
      const to = seg.toStop?.location;
      if (from && (from.lat !== 0 || from.lng !== 0)) {
        if (
          points.length === 0 ||
          points[points.length - 1].lat !== from.lat ||
          points[points.length - 1].lng !== from.lng
        ) {
          points.push(from);
        }
      }
      if (to && (to.lat !== 0 || to.lng !== 0)) {
        if (
          points.length === 0 ||
          points[points.length - 1].lat !== to.lat ||
          points[points.length - 1].lng !== to.lng
        ) {
          points.push(to);
        }
      }
    }
    return points;
  }, [route.segments]);

  // ── Map center: user location or middle of route ────────────────
  const mapCenter = useMemo<Location>(() => {
    if (liveLocation) return liveLocation;
    if (polylinePoints.length > 0) {
      const mid = Math.floor(polylinePoints.length / 2);
      return polylinePoints[mid];
    }
    return { lat: 22.3193, lng: 114.1694 };
  }, [liveLocation, polylinePoints]);

  // ── Fetch Citybus ETAs (non-blocking, runs after primary ETA display) ──
  const fetchCitybusETAs = useCallback(async () => {
    console.log('[CTB] fetchCitybusETAs called, segments:', route.segments.length);
    for (const seg of route.segments) {
      if (seg.route.type !== 'bus') continue;
      if (seg.route.operator === 'citybus') continue;

      try {
        console.log('[CTB] processing segment:', seg.route.name, seg.fromStop.nameZh);
        if (!citybusRouteCacheRef.current.has(seg.route.name)) {
          const ctbRoutes = await getCitybusRouteInfo(seg.route.name);
          console.log('[CTB] route check:', seg.route.name, 'found:', ctbRoutes.length);
          if (ctbRoutes.length === 0) continue;
          citybusRouteCacheRef.current.add(seg.route.name);
        }

        // 1. Get KMB stop coordinates for coordinate-based matching
        let kmbCoords: { lat: number; lng: number } | undefined;
        if (seg.fromStop.location?.lat && seg.fromStop.location?.lng) {
          kmbCoords = seg.fromStop.location;
        } else {
          // Fetch KMB stop info to get coordinates
          try {
            const info = await getKMBStopInfo(seg.fromStop.id);
            if (info?.lat && info?.long) {
              kmbCoords = { lat: info.lat, lng: info.long };
            }
          } catch (_e) {}
        }

        // 2. Try name-based matching first, then coordinate-based
        let ctbStopId = await findCitybusStopAnyDirection(
          seg.route.name,
          seg.fromStop.nameZh || seg.fromStop.name,
          kmbCoords
        );

        // 3. If still no match, brute-force: fetch all Citybus stops with info, find nearest by coords
        if (!ctbStopId && kmbCoords) {
          console.log('[CTB] trying brute-force stop matching');
          for (const dir of ['O', 'I'] as const) {
            const stops = await getCitybusRouteStops(seg.route.name, dir);
            let nearest: { id: string; dist: number } | null = null;
            for (const s of stops) {
              try {
                const info = await getCitybusStopInfo(s.stop);
                if (info?.lat && info?.long) {
                  const d = Math.sqrt(
                    Math.pow(info.lat - kmbCoords.lat, 2) +
                    Math.pow(info.long - kmbCoords.lng, 2)
                  );
                  if (!nearest || d < nearest.dist) nearest = { id: s.stop, dist: d };
                }
              } catch (_e) {}
            }
            if (nearest && nearest.dist < 0.02) { // ~2km threshold
              ctbStopId = nearest.id;
              break;
            }
          }
        }

        if (!ctbStopId) {
          console.log('[CTB] no matching Citybus stop found, skipping');
          continue;
        }
        console.log('[CTB] matched stop ID:', ctbStopId);

        const citybusETAs = await fetchETA(ctbStopId, 'bus', 'CTB', seg.route.name);
        console.log('[CTB] ETA fetch result:', citybusETAs.length, 'ETAs');
        if (citybusETAs.length === 0) continue;

        addDebug(`🚌 CTB ${seg.route.name}: +${citybusETAs.length} extra ETAs (stop ${ctbStopId})`);

        setSegmentETAs(prev => prev.map(s => {
          if (s.segmentId !== seg.id) return s;
          const merged = [...s.etas];
          for (const cb of citybusETAs) {
            const isDup = merged.some(e => e.minutesAway === cb.minutesAway && e.destination === cb.destination);
            if (!isDup) merged.push(cb);
          }
          merged.sort((a, b) => a.minutesAway - b.minutesAway);
          return { ...s, etas: merged };
        }));
      } catch (err) {
        addDebug(`⚠️ Citybus lookup failed for ${seg.route.name}: ${err instanceof Error ? err.message : String(err)}`);
        console.error('Citybus ETA error:', err);
      }
    }
  }, [route.segments]);

  // ── Fetch ETAs for all segments ─────────────────────────────────
  const fetchAllETAs = useCallback(async () => {
    setLoading(true);
    try {
      const results: SegmentETAData[] = await Promise.all(
        route.segments.map(async (seg) => {
          const routeType = seg.route.type as 'bus' | 'mtr' | 'gmb' | 'tram';
          const company =
            seg.route.operator === 'citybus' ? 'CTB' : 'KMB';

          const stopId = seg.fromStop.id;
          let lineCode: string | undefined;

          if (routeType === 'mtr') {
            lineCode = seg.route.name;
            const fromSt = findStation(seg.fromStop.id) || findStation(seg.fromStop.nameZh || seg.fromStop.name);
            const toSt = findStation(seg.toStop.id) || findStation(seg.toStop.nameZh || seg.toStop.name);
            addDebug(`🚇 MTR ${lineCode}: from=${seg.fromStop.id}→${fromSt?.stationCode||'??'} to=${seg.toStop.id}→${toSt?.stationCode||'??'}`);
          }

          try {
            const etas = await fetchETA(
              stopId,
              routeType,
              company as 'KMB' | 'CTB',
              seg.route.name,
              lineCode
            );

            return {
              segmentId: seg.id,
              label: `${seg.route.type === 'mtr' ? getMTRLineName(seg.route.name) : seg.route.name} · ${seg.fromStop.nameZh || seg.fromStop.name}`,
              etas,
            };
          } catch {
            return {
              segmentId: seg.id,
              label: `${seg.route.type === 'mtr' ? getMTRLineName(seg.route.name) : seg.route.name} · ${seg.fromStop.nameZh || seg.fromStop.name}`,
              etas: [],
            };
          }
        })
      );
      setSegmentETAs(results);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('ETA fetch error:', err);
    }
    setLoading(false);
    // Non-blocking: fetch Citybus ETAs after primary ETA is displayed
    fetchCitybusETAs();
  }, [route.segments, fetchCitybusETAs]);

  useEffect(() => {
    fetchAllETAs();
    const interval = setInterval(fetchAllETAs, 30_000);
    return () => clearInterval(interval);
  }, [fetchAllETAs]);

  // ── Find alternative routes when ETAs update ────────────────────────
  useEffect(() => {
    if (segmentETAs.length === 0) return;

    // Debug: log segmentETAs structure (visible in app debug panel)
    addDebug(`[AltRoutes] segmentETAs: ${JSON.stringify(segmentETAs.map(s => ({
      segmentId: s.segmentId,
      label: s.label,
      etas: s.etas.map(e => ({ min: e.minutesAway, dest: e.destination }))
    })))}`);

    async function findAlts() {
      addDebug(`[AltRoutes] Starting search, ${segmentETAs.length} segments`);
      const altResults: SegmentAlternatives[] = [];
      for (const segETA of segmentETAs) {
        const seg = route.segments.find(s => s.id === segETA.segmentId);
        if (!seg) continue;

        addDebug(`[AltRoutes] Checking ${seg.route.name} from ${seg.fromStop.nameZh}`);
        addDebug(`[AltRoutes] ETAs: ${JSON.stringify(segETA.etas.map(e => ({ min: e.minutesAway, dest: e.destination })))}`);
        try {
          const result = await findAlternativesForSegment(seg, segETA.etas);
          addDebug(`[AltRoutes] Found ${result.alternatives.length} alts, isLastBusPassed=${result.isLastBusPassed}`);
          if (result.alternatives.length > 0 || result.isLastBusPassed) {
            altResults.push(result);
          }
        } catch (err) {
          addDebug(`[AltRoutes] Error: ${err}`);
        }
      }
      addDebug(`[AltRoutes] Total: ${altResults.length} alternatives`);
      // Only update if we found alternatives, otherwise keep previous state
      if (altResults.length > 0) {
        setAlternatives(altResults);
      }
    }
    findAlts();
  }, [segmentETAs, route.segments, addDebug]);

  // ── Proximity-based arrival notifications ─────────────────────
  const notifiedStations = useRef<Set<string>>(new Set());

  // ── Transfer proximity notifications (deduplicate) ───────────
  const notifiedTransfers = useRef<Set<string>>(new Set());

  // Check proximity to boarding stations and notify if ETA <= 5 min
  useEffect(() => {
    try {
      if (!liveLocation || segmentETAs.length === 0) return;
      if (!('Notification' in window)) return;
      // iOS PWA uses Service Worker showNotification, no permission needed
      const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isIOSPWA = isStandalone && isIOS;
      if (!isIOSPWA && Notification.permission !== 'granted') return;
      // Respect user preference in settings
      if (localStorage.getItem('chaser-notifications-enabled') === 'false') return;

      for (const segETA of segmentETAs) {
        const segData = route.segments.find(s => s.id === segETA.segmentId);
        if (!segData) continue;

        const stopLoc = segData.fromStop.location;
        if (!stopLoc || (stopLoc.lat === 0 && stopLoc.lng === 0)) continue;

        const distance = haversineMeters(liveLocation, stopLoc);
        if (distance > 500) continue;

        // Find the soonest valid ETA for this segment
        const validEtas = segETA.etas.filter(e => e.minutesAway >= 0);
        if (validEtas.length === 0) continue;
        const minEta = validEtas[0].minutesAway;
        if (minEta > 5) continue;

        // Deduplicate: each station notifies only once per journey
        const notifyKey = `${segETA.segmentId}-${segData.fromStop.id}`;
        if (notifiedStations.current.has(notifyKey)) continue;
        notifiedStations.current.add(notifyKey);

        const emoji = segData.route.type === 'mtr' ? '🚇' : '🚌';
        const stopName = segData.fromStop.nameZh || segData.fromStop.name;
        const title = `${emoji} ${segData.route.name} 即將到站`;
        const body = `${stopName} — ${minEta === 0 ? '到站中' : `${minEta} 分鐘後到站`}，距離你 ${Math.round(distance)} 米`;

        addDebug(`🔔 notify: ${notifyKey} dist=${Math.round(distance)}m eta=${minEta}min`);

        sendNotification(title, { body, tag: notifyKey });
      }
    } catch (err) {
      addDebug(`🔔 notification error: ${err}`);
    }
  }, [liveLocation, segmentETAs, route.segments]);

  // ── Transfer proximity: approaching alighting stop → next segment ETAs ──
  useEffect(() => {
    try {
      if (!liveLocation || route.segments.length < 2) return;
      if (!('Notification' in window)) return;
      // iOS PWA uses Service Worker showNotification, no permission needed
      const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isIOSPWA = isStandalone && isIOS;
      if (!isIOSPWA && Notification.permission !== 'granted') return;
      if (localStorage.getItem('chaser-notifications-enabled') !== 'true') return;

      for (let i = 0; i < route.segments.length - 1; i++) {
        const currentSeg = route.segments[i];
        const nextSeg = route.segments[i + 1];

        // Check proximity to alighting stop of current segment
        const alightLoc = currentSeg.toStop.location;
        if (!alightLoc || typeof alightLoc.lat !== 'number' || alightLoc.lat === 0) continue;

        const distance = haversineMeters(liveLocation, alightLoc);
        if (distance > 500) continue;

        // Deduplicate: each transfer notifies only once per journey
        const transferKey = `transfer-${currentSeg.id}`;
        if (notifiedTransfers.current.has(transferKey)) continue;
        notifiedTransfers.current.add(transferKey);

        addDebug(`🔀 transfer proximity: ${currentSeg.toStop.nameZh} dist=${Math.round(distance)}m`);

        // Fetch ETA for next segment's boarding stop
        const nextRouteType = nextSeg.route.type as 'bus' | 'mtr' | 'gmb' | 'tram';
        const nextCompany = nextSeg.route.operator === 'citybus' ? 'CTB' : 'KMB';
        const nextLineCode = nextRouteType === 'mtr' ? nextSeg.route.name : undefined;

        fetchETA(
          nextSeg.fromStop.id,
          nextRouteType,
          nextCompany,
          nextSeg.route.name,
          nextLineCode,
        ).then(etas => {
          const validEtas = etas.filter(e => e.minutesAway >= 0).slice(0, 3);
          const alightName = currentSeg.toStop.nameZh || currentSeg.toStop.name;
          const nextRouteName = nextSeg.route.type === 'mtr'
            ? getMTRLineName(nextSeg.route.name)
            : nextSeg.route.name;
          const nextStopName = nextSeg.fromStop.nameZh || nextSeg.fromStop.name;

          let etaLines: string;
          if (validEtas.length === 0) {
            etaLines = '暫無班次資料';
          } else {
            etaLines = validEtas.map((e, idx) => {
              const label = ['①', '②', '③'][idx] || `${idx + 1}.`;
              const time = e.minutesAway === 0 ? '到站' : `${e.minutesAway}分鐘`;
              const platform = e.platform ? ` (${e.platform}月台)` : '';
              return `${label} ${time}${platform}`;
            }).join('\n');
          }

          const title = `🔀 轉乘 ${nextRouteName}`;
          const body = `${alightName} 落車 → ${nextStopName}\n${etaLines}`;

          addDebug(`🔀 transfer notify: ${transferKey} → ${title}`);
          sendNotification(title, { body, tag: transferKey });
        }).catch(err => {
          addDebug(`🔀 transfer eta error: ${transferKey} ${err}`);
        });
      }
    } catch (err) {
      addDebug(`🔀 transfer notification error: ${err}`);
    }
  }, [liveLocation, route.segments, enrichmentDone]);

  // ── Journey progress notification (persistent) — DISABLED by user request ──
  // useEffect(() => {
  //   ... (disabled) the feature was firing repeated progress notifications on iOS
  //     causing lock screen spam. See commit for full original code.
  // }, [liveLocation, route.segments, enrichmentDone]);

  // ── Push notification network: journey start + end ──
  const WORKER_URL = 'https://chaser-auth.isearover.workers.dev';

  // Journey start: POST route segments + push sub + auth to worker → activates DO
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Get push subscription from SW
      let pushSub: PushSubscriptionJSON | null = null;
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) pushSub = sub.toJSON();
        }
      } catch {}

      // Get JWT token
      let token: string | null = null;
      try {
        const stored = localStorage.getItem('chaser_auth');
        if (stored) token = JSON.parse(stored).token;
      } catch {}

      const segs = route.segments.map(s => ({
        id: s.id,
        type: s.route.type,
        name: s.route.name,
        fromStop: { id: s.fromStop.id, nameZh: s.fromStop.nameZh, location: s.fromStop.location },
        toStop: { id: s.toStop.id, nameZh: s.toStop.nameZh, location: s.toStop.location },
      }));

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      fetch(`${WORKER_URL}/journey/start`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          segments: segs,
          ...(pushSub ? { pushSub } : {}),
        }),
      }).catch(() => {});
    })();

    return () => {
      cancelled = true;
      // Journey end: cleanup on unmount
      const endHeaders: Record<string, string> = {};
      try {
        const stored = localStorage.getItem('chaser_auth');
        if (stored) endHeaders['Authorization'] = `Bearer ${JSON.parse(stored).token}`;
      } catch {}
      fetch(`${WORKER_URL}/journey/end`, { method: 'POST', headers: endHeaders }).catch(() => {});
    };
  }, [route.segments]);

  // ── ETA urgency helpers ─────────────────────────────────────────
  const getEtaColor = (min: number) => {
    if (min <= 2) return 'text-red-400';
    if (min <= 5) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getTransportEmoji = (type: string) => {
    switch (type) {
      case 'bus': return '🚌';
      case 'mtr': return '🚇';
      case 'minibus': return '🚐';
      case 'tram': return '🚊';
      default: return '🚍';
    }
  };

  // ── Route summary text ──────────────────────────────────────────
  const routeSummary = useMemo(() => {
    const firstSeg = route.segments[0];
    const lastSeg = route.segments[route.segments.length - 1];
    if (!firstSeg || !lastSeg) return route.name;
    const origin = firstSeg.fromStop.nameZh || firstSeg.fromStop.name;
    const dest = lastSeg.toStop.nameZh || lastSeg.toStop.name;
    return `${origin} → ${dest}`;
  }, [route]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900">
      {/* ── Full-screen Map ──────────────────────────────────────── */}
      <div className="absolute inset-0 w-full h-full">
        <MapView
          center={mapCenter}
          polylinePoints={polylinePoints}
          segments={route.segments}
          currentLocation={liveLocation}
          routePolylines={routePolylines.length > 0 ? routePolylines : undefined}
          segmentTypes={route.segments.map(seg => ({ type: seg.route.type, name: seg.route.name }))}
        />
      </div>

      {/* ── Back button (top-left) ──────────────────────────────── */}
      {onBack && (
        <button
          onClick={onBack}
          className="absolute top-4 left-4 flex items-center gap-1.5 bg-black/60 backdrop-blur-xl rounded-xl border border-white/20 shadow-lg px-3 py-2 text-white text-xs font-medium hover:bg-black/70 active:scale-95 transition-all"
          style={{ zIndex: 1000 }}
        >
          <ChevronLeft size={16} strokeWidth={2.5} />
          返回
        </button>
      )}

      {/* ── ETA Floating Card (top-right) ───────────────────── */}
      {showETAPanel && (
        <div
          className="absolute top-4 right-3 bg-slate-800/80 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
          style={{ zIndex: 1000, maxWidth: 340, minWidth: 240 }}
        >
        {/* ETA header */}
        <div className="flex items-center justify-between px-2.5 pt-2 pb-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[10px] font-semibold text-gray-200">即時到站</h3>
            {loading && (
              <div className="w-2 h-2 border-[1.5px] border-blue-400 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <button
            onClick={() => setShowETAPanel(false)}
            className="text-gray-500 hover:text-white text-[10px] p-0.5"
          >
            ✕
          </button>
        </div>

        {/* ETA cards per segment */}
        <div className="px-2 pb-2 space-y-1">
          {segmentETAs.map((seg) => {
            const segData = route.segments.find(s => s.id === seg.segmentId);
            const isMTR = segData?.route.type === 'mtr';
            const destStationCode = isMTR ? segData?.toStop.id : null;
            
            // For MTR: only show ETAs going towards our destination direction
            const fromStation = isMTR ? findStation(segData?.fromStop.id || '') || findStation(segData?.fromStop.nameZh || '') : null;
            const toStation = isMTR ? findStation(segData?.toStop.id || '') || findStation(segData?.toStop.nameZh || '') : null;
            
            let filteredEtas = seg.etas;
            if (isMTR && fromStation && toStation) {
              filteredEtas = seg.etas.filter(e => {
                if (e.minutesAway < 0 && e.remark) return true;
                const destSt = findStation(e.destination);
                const terminalCode = destSt?.stationCode || e.destination;
                return isSameMTRDirection(segData!.route.name, fromStation.stationCode, toStation.stationCode, terminalCode);
              });
            }
            
            const validEtas = filteredEtas.filter(e => e.minutesAway >= 0);
            const minEta = validEtas.length > 0 ? validEtas[0].minutesAway : null;
            // Show the 2 soonest arrivals (pure time-based)
            const topEtas = validEtas.slice(0, 2);
            const remarkEta = topEtas.length === 0 ? filteredEtas.find(e => e.remark) : null;
            const borderColor =
              minEta !== null && minEta <= 2
                ? 'border-red-500/50'
                : minEta !== null && minEta <= 5
                  ? 'border-yellow-500/50'
                  : 'border-slate-600/40';

            return (
              <div key={seg.segmentId} className={`rounded-xl border px-2 py-1.5 bg-slate-700/40 ${borderColor}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-medium text-gray-200 truncate">
                    {isMTR ? '🚇' : '🚌'} {seg.label}
                  </span>
                  {topEtas.length > 0 ? (
                    <div className="flex items-center gap-1.5">
                      {topEtas.map((eta, i) => (
                        <span key={i} className="flex items-center gap-0.5">
                          <span className={`text-[7px] font-bold ${
                            eta.company === 'CTB' ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {eta.company === 'CTB' ? 'C' : 'K'}
                          </span>
                          <span className={`text-[10px] font-bold ${getEtaColor(eta.minutesAway)}`}>
                            {eta.minutesAway === 0 ? '到站' : `${eta.minutesAway}'`}
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : remarkEta ? (
                    <span className="text-[8px] text-gray-500 italic">
                      {remarkEta.remark || '—'}
                    </span>
                  ) : (
                    <span className="text-[8px] text-gray-500">無</span>
                  )}
                </div>
                {minEta !== null && minEta <= 2 && (
                  <p className="text-[8px] text-red-300 mt-0.5 font-medium">
                    🏃 趕快！
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* ── ETA toggle button (when left column hidden) ── */}
      {!showETAPanel && (
        <button
          onClick={() => setShowETAPanel(true)}
          className="absolute top-4 right-4 bg-slate-800/80 border border-slate-700/60 text-gray-200 text-sm px-3.5 py-2 rounded-2xl shadow-lg"
          style={{ zIndex: 1000 }}
        >
          🕐 ETA
        </button>
      )}

      {/* ── Debug button + panel ──────────────────────────────────── */}
      <div className="absolute bottom-32 left-3" style={{ zIndex: 1000 }}>
        <button
          onClick={() => setShowDebugPanel(prev => !prev)}
          className="bg-yellow-500/90 text-black text-[10px] font-bold px-2 py-1 rounded-full shadow-lg"
        >
          🐛 Debug ({debugLogs.length})
        </button>
        {showDebugPanel && (
          <div className="absolute bottom-20 left-0 w-[300px] max-h-[250px] bg-black/90 backdrop-blur-xl rounded-xl border border-yellow-500/30 overflow-hidden" style={{ zIndex: 1003 }}>
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
              <span className="text-[10px] text-yellow-400 font-medium">Debug Logs</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const text = debugLogs.join('\n');
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(text).catch(() => {});
                    } else {
                      // Fallback for older browsers / iOS PWA
                      const ta = document.createElement('textarea');
                      ta.value = text;
                      ta.style.position = 'fixed';
                      ta.style.opacity = '0';
                      document.body.appendChild(ta);
                      ta.select();
                      document.execCommand('copy');
                      document.body.removeChild(ta);
                    }
                  }}
                  className="text-[10px] text-gray-500 hover:text-white"
                >
                  複製
                </button>
                <button onClick={() => setDebugLogs([])} className="text-[10px] text-gray-500 hover:text-white">Clear</button>
              </div>
            </div>
            <div className="overflow-y-auto max-h-[220px] p-2 space-y-0.5">
              {debugLogs.length === 0 ? (
                <p className="text-[10px] text-gray-600">No logs yet</p>
              ) : (
                debugLogs.map((log, i) => (
                  <p key={i} className="text-[9px] text-gray-300 font-mono leading-tight break-all">{log}</p>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom container: Timeline + Alt Cards + Bottom Bar ── */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col" style={{ zIndex: 1000 }}>
        {/* Timeline + Alt Cards (above bottom bar) */}
        {(journeyEstimate || alternatives.length > 0) && (
          <div className="flex flex-col gap-2 mb-1 px-3" style={{ zIndex: 1002 }}>
            {/* Alternative Route Cards — right-aligned, above timeline */}
            {alternatives.length > 0 && (
              <div className="self-end flex flex-col gap-2 pointer-events-auto" style={{ maxWidth: 280 }}>
                {/* Consolidated "last bus passed" warning — show once, not per segment */}
                {alternatives.some(s => s.isLastBusPassed) && (
                  <div className="bg-slate-800/80 border border-amber-500/30 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 text-sm">⚠️</span>
                      <span className="text-xs font-medium text-amber-300">所選路線尾班車已過</span>
                    </div>
                  </div>
                )}
                {/* Individual alternative cards */}
                {alternatives.filter(s => s.alternatives.length > 0).map((seg) => (
                  <AlternativeRouteCard
                    key={seg.segmentId}
                    segment={seg}
                  />
                ))}
              </div>
            )}
            {/* Smart Journey Timeline — below alt cards */}
            {journeyEstimate && (
              <SmartJourneyTimeline
                recommendation={journeyEstimate}
                expanded={showTimelineDetail}
                onToggle={() => setShowTimelineDetail(prev => !prev)}
              />
            )}
            {/* GPS Status Indicator */}
            {gpsStatus !== 'active' && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/60 rounded-xl border border-slate-700/40">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  gpsStatus === 'waiting' ? 'bg-yellow-400 animate-pulse' :
                  gpsStatus === 'error' ? 'bg-red-500' : 'bg-gray-500'
                }`} />
                <span className="text-[9px] text-gray-400">
                  {gpsStatus === 'waiting' ? '正在獲取GPS位置...' :
                   gpsStatus === 'error' ? '⚠️ GPS 無法定位，步行時間由上車站估算' :
                   '⚠️ GPS 不可用，步行時間由上車站估算'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Bottom bar */}
        <div className="bg-slate-800/90 border-t border-slate-700/60 px-4 py-3 safe-area-bottom">
          <div className="flex items-center justify-between max-w-md mx-auto">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400">
                {route.direction === 'to_work' ? '🏢 返工' : '🏠 放工'} · {route.segments.length} 段
              </p>
              <p className="text-sm text-white truncate">{routeSummary}</p>
            </div>
            <button
              onClick={onEndJourney}
              className="shrink-0 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-medium text-sm px-5 py-2.5 rounded-lg transition-colors shadow-lg shadow-red-600/30"
            >
              結束旅程
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
