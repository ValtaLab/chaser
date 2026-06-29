'use client';

import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/stores/appStore';

export default function LocationTracker() {
  const { currentLocation, updateLocation } = useAppStore();
  const [error, setError] = useState<string | null>(null);
  const [hasFix, setHasFix] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const isTracking = useRef(false);

  // ── Location tracking (always on when this component mounts) ──────
  useEffect(() => {
    if (isTracking.current) return;
    isTracking.current = true;

    let watchId: number;

    const onPosition = (pos: GeolocationPosition) => {
      updateLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setHasFix(true);
      setError(null);
    };

    const onError = (err: GeolocationPositionError) => {
      if (err.code === 1) {
        setError('位置權限被拒絕');
      } else if (!hasFix) {
        setError(err.message);
      }
      // Silently ignore errors after we already have a fix
    };

    // getCurrentPosition first (iOS PWA needs this to trigger permission dialog)
    navigator.geolocation.getCurrentPosition(onPosition, onError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    });

    // Continuous tracking
    watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      isTracking.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Init Leaflet map ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      const map = L.map(mapRef.current!, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        touchZoom: false,
        doubleClickZoom: false,
        keyboard: false,
      }).setView([22.3193, 114.1694], 12);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {}).addTo(map);

      mapInstanceRef.current = map;
      setMapReady(true);
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  // ── Zoom / Fullscreen controls ────────────────────────────────────
  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };
  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleToggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      await containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    }
  };

  // ── Update marker when location changes ───────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !currentLocation) return;

    const updateMarker = async () => {
      const L = (await import('leaflet')).default;
      const map = mapInstanceRef.current;

      if (markerRef.current) {
        markerRef.current.setLatLng([currentLocation.lat, currentLocation.lng]);
      } else {
        // User requested red dot for location
        const icon = L.divIcon({
          className: '',
          html: '<div style="width:22px;height:22px;background:#ef4444;border:3.5px solid white;border-radius:50%;box-shadow:0 0 16px rgba(239,68,68,0.6);"></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        markerRef.current = L.marker([currentLocation.lat, currentLocation.lng], { icon }).addTo(map);
      }

      map.setView([currentLocation.lat, currentLocation.lng], 15);
    };

    updateMarker();
  }, [currentLocation, mapReady]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
      <div ref={containerRef} className="relative h-40 bg-gray-100">
        {/* Map */}
        <div ref={mapRef} className="w-full h-full" />

        {/* Bottom gradient for text readability */}
        <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />

        {/* Zoom / Fullscreen controls */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5">
          <button
            onClick={handleZoomIn}
            className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm flex items-center justify-center hover:bg-white transition-colors active:scale-90"
            aria-label="放大"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button
            onClick={handleZoomOut}
            className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm flex items-center justify-center hover:bg-white transition-colors active:scale-90"
            aria-label="縮小"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button
            onClick={handleToggleFullscreen}
            className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm flex items-center justify-center hover:bg-white transition-colors active:scale-90"
            aria-label="全螢幕"
          >
            {isFullscreen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            )}
          </button>
        </div>

        {/* Status badge */}
        <div className="absolute top-3 left-3">
          <div className="bg-white/90 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-sm">
            <div className="flex items-center gap-1.5">
              {hasFix ? (
                <>
                  <div className="relative w-2 h-2">
                    <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping opacity-75" />
                    <div className="w-2 h-2 bg-green-500 rounded-full relative" />
                  </div>
                  <span className="text-[11px] font-medium text-gray-700">已定位</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                  <span className="text-[11px] font-medium text-gray-500">定位中...</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Coordinates hint */}
        {hasFix && currentLocation && (
          <div className="absolute bottom-3 left-3">
            <p className="text-xs text-white/90 font-medium drop-shadow-md">
              {currentLocation.lat.toFixed(5)}, {currentLocation.lng.toFixed(5)}
            </p>
          </div>
        )}

        {/* Permission denied / error overlay */}
        {error && !hasFix && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="text-center">
              <span className="text-2xl">📍</span>
              <p className="text-sm font-medium text-gray-600 mt-1">{error}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">請檢查位置權限設定</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
