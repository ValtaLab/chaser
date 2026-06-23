'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, Marker, useMap } from 'react-leaflet';
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
        markers.push({
          location: transferLoc,
          label: `🔄 轉車: ${current.toStop.nameZh || current.toStop.name} → ${next.route.type === 'mtr' ? getMTRLineName(next.route.name) : next.route.name}`,
        });
      }
    }
    return markers;
  }, [segments]);

  // ── Inject bubble label styles ───────────────────────────────────
  useEffect(() => {
    const id = 'chaser-map-label-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .map-label-bubble {
        background: rgba(255,255,255,0.92) !important;
        border: none !important;
        border-radius: 8px !important;
        padding: 3px 9px !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.18) !important;
        white-space: nowrap !important;
        color: #1f2937 !important;
        backdrop-filter: blur(4px) !important;
      }
  `;
    document.head.appendChild(style);
    return () => { const el = document.getElementById(id); if (el) el.remove(); };
  }, []);

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

      {/* Boarding stop markers (green) + label */}
      {segments.map((seg, i) => {
        const loc = seg.fromStop?.location;
        if (!loc || (loc.lat === 0 && loc.lng === 0)) return null;
        const segColor = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
        const stopName = seg.fromStop.nameZh || seg.fromStop.name;
        const labelIcon = L.divIcon({
          className: '',
          html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;position:relative;left:-4px;">
            <div style="background:rgba(255,255,255,0.92);backdrop-filter:blur(4px);border-radius:8px;padding:2px 8px;font-size:11px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.18);white-space:nowrap;color:#1f2937;">
              ${stopName}
            </div>
            <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:4px solid rgba(255,255,255,0.92);"></div>
          </div>`,
          iconSize: [0, 0],
        });
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
            <Marker position={[loc.lat, loc.lng]} icon={labelIcon} />
          </CircleMarker>
        );
      })}

      {/* Alighting stop marker — each segment's destination + label */}
      {segments.map((seg, i) => {
        const loc = seg.toStop?.location;
        if (!loc || (loc.lat === 0 && loc.lng === 0)) return null;
        const segColor = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
        const stopName = seg.toStop.nameZh || seg.toStop.name;
        const labelIcon = L.divIcon({
          className: '',
          html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;position:relative;left:4px;">
            <div style="background:rgba(255,255,255,0.92);backdrop-filter:blur(4px);border-radius:8px;padding:2px 8px;font-size:11px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.18);white-space:nowrap;color:#1f2937;">
              ${stopName}
            </div>
            <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:4px solid rgba(255,255,255,0.92);"></div>
          </div>`,
          iconSize: [0, 0],
        });
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
            <Marker position={[loc.lat, loc.lng]} icon={labelIcon} />
          </CircleMarker>
        );
      })}

      {/* Transfer markers (amber) + label */}
      {transferMarkers.map((tm, i) => {
        const labelIcon = L.divIcon({
          className: '',
          html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;position:relative;left:0px;">
            <div style="background:rgba(255,255,255,0.92);backdrop-filter:blur(4px);border-radius:8px;padding:2px 8px;font-size:11px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.18);white-space:nowrap;color:#1f2937;">
              🔄 ${tm.label.replace(/^🔄\s*/, '')}
            </div>
            <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:4px solid rgba(255,255,255,0.92);"></div>
          </div>`,
          iconSize: [0, 0],
        });
        return (
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
            <Marker position={[tm.location.lat, tm.location.lng]} icon={labelIcon} />
          </CircleMarker>
        );
      })}

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
