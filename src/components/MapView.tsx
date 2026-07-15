'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { CommuteRoute, Location } from '@/types';
import { getMTRLineName } from '@/lib/mtr-api';

// ─── FitBounds: auto-zoom to show all route polylines ───────────────
function FitBounds({ points }: { points: Location[] }) {
  const map = useMap();
  const prevBoundsRef = useRef<string>('');
  useEffect(() => {
    if (points.length < 2) return;
    const lats = points.map(p => p.lat);
    const lngs = points.map(p => p.lng);
    const latSpread = Math.max(...lats) - Math.min(...lats);
    const lngSpread = Math.max(...lngs) - Math.min(...lngs);
    if (latSpread < 0.001 && lngSpread < 0.001) return;
    // Only re-fit if bounds changed significantly
    const boundsKey = `${Math.min(...lats).toFixed(3)},${Math.min(...lngs).toFixed(3)},${Math.max(...lats).toFixed(3)},${Math.max(...lngs).toFixed(3)}`;
    if (boundsKey === prevBoundsRef.current) return;
    prevBoundsRef.current = boundsKey;
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [points, map]);
  return null;
}

// ─── MapLabels: side-offset bubble labels (don't cover the route) ───
interface MapLabelsProps {
  segments: CommuteRoute['segments'];
  transferMarkers: Array<{ location: Location; label: string }>;
}

/** Strip codes / tail clauses; keep ≤7 chars for map bubbles. */
function shortStopLabel(raw: string | undefined | null): string {
  if (!raw) return '';
  let s = String(raw)
    .replace(/\s*[（(][^）)]*[）)]\s*/g, '') // (TP930) / （北）
    .replace(/[,，].*$/, '')                 // "富蝶邨, 近X" → "富蝶邨"
    .replace(/\s+/g, '')
    .trim();
  // Drop trailing 站 if already long enough without it
  if (s.length > 7 && s.endsWith('站') && !s.endsWith('總站')) s = s.slice(0, -1);
  if (s.length > 7) s = s.slice(0, 7);
  return s;
}

function MapLabels({ segments }: MapLabelsProps) {
  const map = useMap();
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!map) return;

    // Kill Leaflet's default white square on divIcon
    if (typeof document !== 'undefined' && !document.getElementById('chaser-map-label-style')) {
      const style = document.createElement('style');
      style.id = 'chaser-map-label-style';
      style.textContent =
        '.chaser-map-label{background:transparent!important;border:none!important;}';
      document.head.appendChild(style);
    }

    const init = () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      const newMarkers: L.Marker[] = [];
      const seen = new Set<string>();
      const coordKey = (lat: number, lng: number) =>
        `${lat.toFixed(5)},${lng.toFixed(5)}`;

      type Side = 'left' | 'right';
      const labels: Array<{ lat: number; lng: number; text: string; side: Side }> = [];

      const tryPush = (loc: Location | undefined | null, text: string) => {
        if (!loc || (loc.lat === 0 && loc.lng === 0)) return;
        const t = shortStopLabel(text);
        if (!t) return;
        const k = coordKey(loc.lat, loc.lng);
        if (seen.has(k)) return;
        seen.add(k);
        // Alternate sides so neighbouring stops don't stack on the route
        const side: Side = labels.length % 2 === 0 ? 'right' : 'left';
        labels.push({ lat: loc.lat, lng: loc.lng, text: t, side });
      };

      // Journey order: start → intermediates → end (one bubble per unique point)
      if (segments.length > 0) {
        const first = segments[0];
        tryPush(first.fromStop?.location, first.fromStop?.nameZh || first.fromStop?.name);

        for (let i = 0; i < segments.length - 1; i++) {
          const loc =
            segments[i].transferTo?.location || segments[i].toStop?.location;
          tryPush(loc, segments[i].toStop?.nameZh || segments[i].toStop?.name);
        }

        const last = segments[segments.length - 1];
        tryPush(last.toStop?.location, last.toStop?.nameZh || last.toStop?.name);
      }

      const bubbleCss =
        'background:rgba(255,255,255,0.95);backdrop-filter:blur(4px);border-radius:6px;' +
        'padding:2px 6px;font-size:11px;font-weight:700;line-height:1.2;' +
        'box-shadow:0 1px 6px rgba(0,0,0,0.22);white-space:nowrap;color:#1f2937;' +
        'border:1px solid rgba(255,255,255,0.9);';

      for (const { lat, lng, text, side } of labels) {
        // Anchor at stop; bubble sits beside the route with a small caret
        const html =
          side === 'right'
            ? `<div style="position:relative;width:0;height:0;overflow:visible;">
                <div style="position:absolute;left:10px;top:0;transform:translateY(-50%);display:flex;align-items:center;">
                  <div style="width:0;height:0;border-top:4px solid transparent;border-bottom:4px solid transparent;border-right:5px solid rgba(255,255,255,0.95);"></div>
                  <div style="${bubbleCss}">${text}</div>
                </div>
              </div>`
            : `<div style="position:relative;width:0;height:0;overflow:visible;">
                <div style="position:absolute;right:10px;top:0;transform:translateY(-50%);display:flex;align-items:center;flex-direction:row-reverse;">
                  <div style="width:0;height:0;border-top:4px solid transparent;border-bottom:4px solid transparent;border-left:5px solid rgba(255,255,255,0.95);"></div>
                  <div style="${bubbleCss}">${text}</div>
                </div>
              </div>`;

        const icon = L.divIcon({
          className: 'chaser-map-label',
          html,
          iconSize: [1, 1],
          iconAnchor: [0, 0],
        });
        const m = L.marker([lat, lng], {
          icon,
          interactive: false,
          keyboard: false,
          zIndexOffset: 1000,
        }).addTo(map);
        newMarkers.push(m);
      }

      markersRef.current = newMarkers;
    };

    map.whenReady(init);

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
    };
  }, [segments, map]);

  return null;
}

// ─── Props ───────────────────────────────────────────────────────────
interface MapViewProps {
  center: Location;
  polylinePoints: Location[];
  segments: CommuteRoute['segments'];
  currentLocation: Location | null;
  routePolylines?: Location[][];  // Full route path per segment
  segmentTypes?: Array<{ type: string; name: string }>;  // Route type + name per segment
}

// ─── Segment colors ─────────────────────────────────────────────────
const SEGMENT_COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981'];

// ─── MTR official line colors ───────────────────────────────────────
const MTR_LINE_COLORS: Record<string, string> = {
  TWL: '#E60012',  // 荃灣綫 Red
  ISL: '#0072CE',  // 港島綫 Blue
  KTL: '#00A040',  // 觀塘綫 Green
  TKL: '#7B2D8B',  // 將軍澳綫 Purple
  TML: '#9B7653',  // 屯馬綫 Brown
  EAL: '#5BC2E7',  // 東鐵綫 Light Blue
  SIL: '#C5A956',  // 南港島綫 Champagne Gold
  DRL: '#E868A0',  // 迪士尼綫 Pink
  AEL: '#008B8B',  // 機場快綫 Teal
};

// ─── MapView Component ───────────────────────────────────────────────
export default function MapView({
  center,
  polylinePoints,
  segments,
  currentLocation,
  routePolylines,
  segmentTypes,
}: MapViewProps) {
  // ── All points for fitBounds (route polylines + markers, NOT current location) ──
  const allPoints = useMemo(() => {
    const pts: Location[] = [];
    if (routePolylines) {
      for (const poly of routePolylines) {
        for (const p of poly) {
          if (p.lat !== 0 || p.lng !== 0) pts.push(p);
        }
      }
    }
    for (const p of polylinePoints) {
      if (p.lat !== 0 || p.lng !== 0) pts.push(p);
    }
    return pts;
  }, [routePolylines, polylinePoints]);

  // ── Build transfer markers between segments ─────────────────────
  const transferMarkers = useMemo(() => {
    const markers: { location: Location; label: string }[] = [];
    for (let i = 0; i < segments.length - 1; i++) {
      const current = segments[i];
      const next = segments[i + 1];
      const transferLoc = current.transferTo?.location
        || current.toStop?.location;
      if (transferLoc && (transferLoc.lat !== 0 || transferLoc.lng !== 0)) {
        const stop = shortStopLabel(current.toStop.nameZh || current.toStop.name);
        const route =
          next.route.type === 'mtr'
            ? getMTRLineName(next.route.name)
            : next.route.name;
        markers.push({
          location: transferLoc,
          label: `轉 ${stop} → ${route}`,
        });
      }
    }
    return markers;
  }, [segments]);

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={14}
      className="w-full h-full"
      style={{ width: '100%', height: '100%', minHeight: '100vh' }}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
      <FitBounds points={allPoints} />
      <MapLabels segments={segments} transferMarkers={transferMarkers} />

      {/* Full route polylines per segment (colored) */}
      {routePolylines && routePolylines.map((poly, i) => {
        if (poly.length < 2) return null;
        const segType = segmentTypes?.[i];
        const color = segType?.type === 'mtr'
          ? (MTR_LINE_COLORS[segType.name] || SEGMENT_COLORS[i % SEGMENT_COLORS.length])
          : SEGMENT_COLORS[i % SEGMENT_COLORS.length];
        const weight = segType?.type === 'mtr' ? 8 : 5;
        return (
          <Polyline
            key={`route-poly-${i}`}
            positions={poly.map(p => [p.lat, p.lng])}
            pathOptions={{
              color,
              weight,
              opacity: 0.8,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        );
      })}

      {/* Fallback: simple straight-line polyline (only if no route polylines) */}
      {!routePolylines && polylinePoints.length >= 2 && (
        <Polyline
          positions={polylinePoints.map(p => [p.lat, p.lng])}
          pathOptions={{
            color: '#ef4444',
            weight: 6,
            opacity: 0.85,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      )}

      {/* Boarding stop markers (green) */}
      {segments.map((seg, i) => {
        const loc = seg.fromStop?.location;
        if (!loc || (loc.lat === 0 && loc.lng === 0)) return null;
        const segColor = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
        return (
          <CircleMarker
            key={`from-${seg.id}`}
            center={[loc.lat, loc.lng]}
            radius={8}
            pathOptions={{
              color: '#ffffff',
              fillColor: segColor,
              fillOpacity: 1,
              weight: 3,
            }}
          >
            <Popup>
              <span className="font-medium">🟢 上車: {seg.fromStop.nameZh || seg.fromStop.name}</span>
              <br />
              <span className="text-xs text-gray-500">{seg.route.type === 'mtr' ? getMTRLineName(seg.route.name) : seg.route.name}</span>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* Alighting stop marker — each segment's destination */}
      {segments.map((seg, i) => {
        const loc = seg.toStop?.location;
        if (!loc || (loc.lat === 0 && loc.lng === 0)) return null;
        const segColor = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
        return (
          <CircleMarker
            key={`to-${seg.id}`}
            center={[loc.lat, loc.lng]}
            radius={8}
            pathOptions={{
              color: '#ffffff',
              fillColor: segColor,
              fillOpacity: 0.7,
              weight: 3,
            }}
          >
            <Popup>
              <span className="font-medium">🔴 落車: {seg.toStop.nameZh || seg.toStop.name}</span>
              <br />
              <span className="text-xs text-gray-500">{seg.route.type === 'mtr' ? getMTRLineName(seg.route.name) : seg.route.name}</span>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* Transfer markers (amber) */}
      {transferMarkers.map((tm, i) => (
        <CircleMarker
          key={`transfer-${i}`}
          center={[tm.location.lat, tm.location.lng]}
          radius={10}
          pathOptions={{
            color: '#ffffff',
            fillColor: '#f59e0b',
            fillOpacity: 1,
            weight: 3,
          }}
        >
          <Popup>
            <span className="text-sm font-medium">{tm.label}</span>
          </Popup>
        </CircleMarker>
      ))}

      {/* User location (blue pulse) */}
      {currentLocation && (
        <>
          <CircleMarker
            center={[currentLocation.lat, currentLocation.lng]}
            radius={20}
            pathOptions={{
              color: '#3b82f6',
              fillColor: '#3b82f6',
              fillOpacity: 0.15,
              weight: 2,
              opacity: 0.4,
            }}
          />
          <CircleMarker
            center={[currentLocation.lat, currentLocation.lng]}
            radius={8}
            pathOptions={{
              color: '#ffffff',
              fillColor: '#3b82f6',
              fillOpacity: 1,
              weight: 3,
            }}
          >
            <Popup>
              <span className="font-medium">📍 你的位置</span>
            </Popup>
          </CircleMarker>
        </>
      )}
    </MapContainer>
  );
}
