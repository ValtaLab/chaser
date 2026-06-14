'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { fetchETA, calculateTotalJourney, type TransportETA } from '@/lib/eta-service';
import {
  findAlternativesForSegment,
  type SegmentAlternatives,
} from '@/lib/alternative-routes';
import {
  findSmartRoute,
  type SmartRouteRecommendation as SmartRouteRec,
} from '@/lib/smart-route';
import {
  getKMBRouteStops, getKMBStopInfo,
  getCitybusRouteStops, getCitybusStopInfo,
} from '@/lib/bus-api';
import { getMTRLineCoords, getLineStations, findStation } from '@/lib/mtr-api';

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
import SmartJourneyTimeline from './SmartJourneyTimeline';
import AlternativeRouteCard from './AlternativeRouteCard';
import SmartRouteCard from './SmartRouteCard';
import type { CommuteRoute, Location, SmartRouteRecommendation } from '@/types';

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
  const [journeyEstimate, setJourneyEstimate] = useState<SmartRouteRecommendation | null>(null);
  const [alternatives, setAlternatives] = useState<SegmentAlternatives[]>([]);
  const [smartRouteRec, setSmartRouteRec] = useState<SmartRouteRec | null>(null);
  const [showTimelineDetail, setShowTimelineDetail] = useState(false);
  const addDebug = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
    const line = `${ts} ${msg}`;
    console.log(line);
    setDebugLogs(prev => [...prev.slice(-30), line]);
  }, []);

  // ── Live location tracking (runs inside tracking view) ───────────
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLiveLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => console.error('Geolocation error:', err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // ── Calculate total journey estimate (debounced) ──────────────────
  useEffect(() => {
    if (!liveLocation) return;

    const timer = setTimeout(() => {
      calculateTotalJourney(route, liveLocation)
        .then(result => setJourneyEstimate(result))
        .catch(err => console.error('Journey estimate error:', err));
    }, 500);

    return () => clearTimeout(timer);
  }, [route, liveLocation]);

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
            // Debug MTR station lookup
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
              label: `${seg.route.name} · ${seg.fromStop.nameZh || seg.fromStop.name}`,
              etas,
            };
          } catch {
            return {
              segmentId: seg.id,
              label: `${seg.route.name} · ${seg.fromStop.nameZh || seg.fromStop.name}`,
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
  }, [route.segments]);

  useEffect(() => {
    fetchAllETAs();
    const interval = setInterval(fetchAllETAs, 30_000);
    return () => clearInterval(interval);
  }, [fetchAllETAs]);

  // ── Find alternative routes when ETAs update ────────────────────────
  useEffect(() => {
    if (segmentETAs.length === 0) return;

    // Debug: log segmentETAs structure
    console.log('[AltRoutes] segmentETAs:', JSON.stringify(segmentETAs.map(s => ({
      segmentId: s.segmentId,
      label: s.label,
      etas: s.etas.map(e => ({ minutesAway: e.minutesAway, destination: e.destination }))
    })), null, 2));

    async function findAlts() {
      console.log('[AltRoutes] Starting search, segments:', segmentETAs.length);
      const altResults: SegmentAlternatives[] = [];
      for (const segETA of segmentETAs) {
        const seg = route.segments.find(s => s.id === segETA.segmentId);
        if (!seg) continue;

        console.log('[AltRoutes] Checking segment:', seg.route.name, 'from', seg.fromStop.nameZh);
        console.log('[AltRoutes] ETAs for this segment:', segETA.etas);
        try {
          const result = await findAlternativesForSegment(seg, segETA.etas);
          console.log('[AltRoutes] Found', result.alternatives.length, 'alternatives for', seg.route.name);
          console.log('[AltRoutes] isLastBusPassed:', result.isLastBusPassed);
          if (result.alternatives.length > 0) {
            altResults.push(result);
          }
        } catch (err) {
          console.error('[AltRoutes] Error for', seg.id, err);
        }
      }
      console.log('[AltRoutes] Total alternatives found:', altResults.length);
      // Only update if we found alternatives, otherwise keep previous state
      if (altResults.length > 0) {
        setAlternatives(altResults);
      }
    }
    findAlts();
  }, [segmentETAs, route.segments]);

  // ── Smart route recommendation (runs once when location available) ──
  useEffect(() => {
    if (!liveLocation || segmentETAs.length === 0) return;

    async function calcSmartRoute() {
      if (!liveLocation) return;  // Double-check (TypeScript narrowing)
      try {
        // Get destination from last segment's toStop
        const lastSeg = route.segments[route.segments.length - 1];
        if (!lastSeg) return;
        const destLocation = lastSeg.toStop.location;
        if (!destLocation || (destLocation.lat === 0 && destLocation.lng === 0)) return;

        // Build configured route info
        const configuredRoute = {
          segments: route.segments.map(seg => ({
            route: { name: seg.route.name, type: seg.route.type, operator: seg.route.operator },
            fromStop: seg.fromStop,
            toStop: seg.toStop,
          })),
          etas: segmentETAs.map(segETA => ({
            route: segETA.label.split(' · ')[0],  // route name from label
            minutesAway: segETA.etas.length > 0 ? segETA.etas[0].minutesAway : 999,
          })),
        };

        console.log('[SmartRoute] Calculating smart route...');
        const rec = await findSmartRoute(liveLocation!, destLocation, configuredRoute);
        console.log('[SmartRoute] Result:', rec.bestAlternative ? `saved ${rec.bestAlternative.savedVsConfigured}min` : 'no better option');
        setSmartRouteRec(rec);
      } catch (err) {
        console.error('[SmartRoute] Error:', err);
      }
    }
    calcSmartRoute();
  }, [liveLocation, segmentETAs, route.segments]);

  // ── Proximity-based arrival notifications ─────────────────────
  const notifiedStations = useRef<Set<string>>(new Set());

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Check proximity to boarding stations and notify if ETA <= 5 min
  useEffect(() => {
    if (!liveLocation || segmentETAs.length === 0) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
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

      try {
        new Notification(title, {
          body,
          icon: '/icon-192x192.png',
          tag: notifyKey, // prevents duplicate notifications
        });
      } catch (err) {
        addDebug(`🔔 notification error: ${err}`);
      }
    }
  }, [liveLocation, segmentETAs, route.segments]);

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
          className="absolute top-3 left-3 w-10 h-10 bg-black/70 backdrop-blur-xl rounded-full border border-white/15 shadow-lg flex items-center justify-center text-white text-lg"
          style={{ zIndex: 1000 }}
        >
          ←
        </button>
      )}

      {/* ── ETA Floating Card (top-right) ────────────────────────── */}
      {showETAPanel && (
        <div
          className="absolute top-3 right-3 w-[200px] bg-black/80 backdrop-blur-xl rounded-xl border border-white/15 shadow-2xl overflow-hidden pointer-events-auto"
          style={{ zIndex: 1000 }}
        >
          {/* ETA header */}
          <div className="flex items-center justify-between px-2.5 pt-2 pb-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-[11px] font-semibold text-white">即時到站</h3>
              {loading && (
                <div className="w-2.5 h-2.5 border-[1.5px] border-blue-400 border-t-transparent rounded-full animate-spin" />
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
          <div className="px-2.5 pb-2 space-y-1.5">
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
                  // e.destination is Chinese name (e.g. "中環"), need to resolve to station code
                  const destSt = findStation(e.destination);
                  const terminalCode = destSt?.stationCode || e.destination;
                  return isSameMTRDirection(segData!.route.name, fromStation.stationCode, toStation.stationCode, terminalCode);
                });
              }
              
              const validEtas = filteredEtas.filter(e => e.minutesAway >= 0);
              const minEta = validEtas.length > 0 ? validEtas[0].minutesAway : null;
              const borderColor =
                minEta !== null && minEta <= 2
                  ? 'border-red-500/50'
                  : minEta !== null && minEta <= 5
                    ? 'border-yellow-500/50'
                    : 'border-white/10';

              return (
                <div key={seg.segmentId} className={`rounded-lg border p-2 bg-white/5 ${borderColor}`}>
                  <p className="text-[10px] font-medium text-white truncate mb-1">
                    {isMTR ? '🚇' : '🚌'} {seg.label}
                  </p>

                  {filteredEtas.length === 0 ? (
                    <p className="text-[10px] text-gray-500">暫無班次</p>
                  ) : (
                    <div className="space-y-0.5">
                      {filteredEtas
                        .filter(eta => eta.minutesAway >= 0 || eta.remark)
                        .slice(0, isMTR ? 2 : 2)
                        .map((eta, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-[10px] text-gray-400 truncate max-w-[55%]">
                            → {eta.destination}
                          </span>
                          {eta.minutesAway >= 0 ? (
                            <span className={`text-[10px] font-bold ${getEtaColor(eta.minutesAway)}`}>
                              {eta.minutesAway === 0 ? '到站' : `${eta.minutesAway}'`}
                            </span>
                          ) : (
                            <span className="text-[9px] text-gray-500 italic">
                              {eta.remark || '—'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {minEta !== null && minEta <= 2 && (
                    <p className="text-[9px] text-red-300 mt-1 font-medium">
                      🏃 趕快！
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ETA toggle button (when panel hidden) ────────────────── */}
      {!showETAPanel && (
        <button
          onClick={() => setShowETAPanel(true)}
          className="absolute top-4 right-4 bg-black/70 backdrop-blur-xl text-white text-sm px-3.5 py-2 rounded-xl border border-white/15 shadow-lg"
          style={{ zIndex: 1000 }}
        >
          🕐 ETA
        </button>
      )}

      {/* ── Debug button + panel ──────────────────────────────────── */}
      <div className="absolute bottom-20 left-3" style={{ zIndex: 1000 }}>
        <button
          onClick={() => setShowDebugPanel(prev => !prev)}
          className="bg-yellow-500/90 text-black text-[10px] font-bold px-2 py-1 rounded-full shadow-lg"
        >
          🐛 Debug ({debugLogs.length})
        </button>
        {showDebugPanel && (
          <div className="absolute bottom-8 left-0 w-[300px] max-h-[250px] bg-black/90 backdrop-blur-xl rounded-xl border border-yellow-500/30 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
              <span className="text-[10px] text-yellow-400 font-medium">Debug Logs</span>
              <button onClick={() => setDebugLogs([])} className="text-[10px] text-gray-500 hover:text-white">Clear</button>
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

      {/* ── Smart Route Recommendation (top priority) ─────────────────── */}
      {smartRouteRec && smartRouteRec.bestAlternative && (
        <div className="absolute top-[220px] right-3 w-[300px] pointer-events-auto" style={{ zIndex: 1002 }}>
          <SmartRouteCard recommendation={smartRouteRec} />
        </div>
      )}

      {/* ── Alternative Route Recommendations (floating, below ETA panel) ── */}
      {alternatives.length > 0 && (
        <div className="absolute top-[330px] right-3 w-[280px] space-y-2 pointer-events-auto" style={{ zIndex: 1001 }}>
          {alternatives.map((seg) => (
            <AlternativeRouteCard
              key={seg.segmentId}
              segment={seg}
            />
          ))}
        </div>
      )}

      {/* ── Smart Journey Timeline ────────────────────────────────────── */}
      {journeyEstimate && (
        <SmartJourneyTimeline
          recommendation={journeyEstimate}
          expanded={showTimelineDetail}
          onToggle={() => setShowTimelineDetail(prev => !prev)}
        />
      )}

      {/* ── Bottom bar ───────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0" style={{ zIndex: 1000 }}>
        <div className="bg-black/80 backdrop-blur-lg border-t border-white/10 px-4 py-3 safe-area-bottom">
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
