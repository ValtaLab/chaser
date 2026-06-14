'use client';

import { useEffect, useRef, useState } from 'react';
import type { Location } from '@/types';

interface MapProps {
  center?: Location;
  zoom?: number;
  userLocation?: Location | null;
  markers?: Array<{
    location: Location;
    label: string;
    type?: 'stop' | 'station' | 'user';
  }>;
  onMapClick?: (location: Location) => void;
  className?: string;
}

export default function Map({
  center = { lat: 22.3193, lng: 114.1694 },
  zoom = 12,
  userLocation,
  markers = [],
  onMapClick,
  className = '',
}: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersLayerRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      if (mapInstanceRef.current) return;

      const map = L.map(mapRef.current!).setView(
        [center.lat, center.lng],
        zoom
      );

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      }).addTo(map);

      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;

      if (onMapClick) {
        map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
          onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
        });
      }

      mapInstanceRef.current = map;
      setLoaded(true);
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!loaded || !markersLayerRef.current) return;

    const updateMarkers = async () => {
      const L = (await import('leaflet')).default;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layer: any = markersLayerRef.current;
      layer.clearLayers();

      if (userLocation) {
        const userIcon = L.divIcon({
          className: 'user-location-marker',
          html: '<div style="width:16px;height:16px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 10px rgba(59,130,246,0.5);"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
          .addTo(layer);
      }

      for (const marker of markers) {
        const iconHtml = marker.type === 'station' 
          ? '<div style="width:12px;height:12px;background:#ef4444;border:2px solid white;border-radius:50%;"></div>'
          : marker.type === 'stop'
          ? '<div style="width:12px;height:12px;background:#22c55e;border:2px solid white;border-radius:50%;"></div>'
          : '<div style="width:12px;height:12px;background:#f59e0b;border:2px solid white;border-radius:50%;"></div>';

        const icon = L.divIcon({
          className: 'custom-marker',
          html: iconHtml,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        L.marker([marker.location.lat, marker.location.lng], { icon })
          .bindPopup(marker.label)
          .addTo(layer);
      }
    };

    updateMarkers();
  }, [loaded, markers, userLocation]);

  useEffect(() => {
    if (!userLocation || !mapInstanceRef.current) return;
    mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 15);
  }, [userLocation]);

  return (
    <div 
      ref={mapRef} 
      className={`w-full h-full rounded-lg ${className}`}
      style={{ minHeight: '200px' }}
    />
  );
}
