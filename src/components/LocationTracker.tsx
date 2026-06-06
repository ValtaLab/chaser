'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/appStore';

export default function LocationTracker() {
  const { currentLocation, updateLocation, isTracking } = useAppStore();
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionState>('prompt');

  useEffect(() => {
    // Check permission status
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        setPermission(result.state);
        result.onchange = () => setPermission(result.state);
      });
    }
  }, []);

  useEffect(() => {
    if (!isTracking) return;

    let watchId: number;

    const startTracking = () => {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          updateLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setError(null);
        },
        (err) => {
          setError(err.message);
          console.error('Geolocation error:', err);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    };

    startTracking();

    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [isTracking, updateLocation]);

  if (permission === 'denied') {
    return (
      <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-200">
        <p className="font-medium">定位權限被拒絕</p>
        <p className="text-sm mt-1">請在瀏覽器設定中允許定位權限</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4 text-yellow-200">
        <p className="font-medium">定位錯誤</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!isTracking) {
    return null;
  }

  return (
    <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 text-green-200">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        <p className="font-medium">正在追蹤位置</p>
      </div>
      {currentLocation && (
        <p className="text-sm mt-1 text-green-300">
          {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}
        </p>
      )}
    </div>
  );
}
