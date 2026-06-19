'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/appStore';

export default function LocationTracker() {
  const { currentLocation, updateLocation, isTracking } = useAppStore();
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionState>('prompt');

  useEffect(() => {
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
      // First: getCurrentPosition to trigger permission dialog (iOS PWA needs this)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          updateLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
          setError(null);
        },
        (err) => {
          console.error('Geolocation getCurrentPosition error:', err);
          if (err.code === 1) { // PERMISSION_DENIED
            setError('位置權限被拒絕，請在 Safari 設定中允許');
            return;
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );

      // Then: continuous tracking
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
      <div className="bg-white border border-red-200 rounded-xl p-3 shadow-sm animate-scale-in">
        <div className="flex items-center gap-2">
          <span className="text-sm">📍</span>
          <div>
            <p className="text-xs font-medium text-red-600">定位權限被拒絕</p>
            <p className="text-[10px] text-gray-400 mt-0.5">請在瀏覽器設定中允許</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-yellow-200 rounded-xl p-3 shadow-sm animate-scale-in">
        <div className="flex items-center gap-2">
          <span className="text-sm">⚠️</span>
          <div>
            <p className="text-xs font-medium text-yellow-600">定位錯誤</p>
            <p className="text-[10px] text-gray-400 mt-0.5 truncate">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isTracking) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-1">
      <div className="relative">
        <div className="w-2 h-2 bg-green-500 rounded-full" />
        <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping" />
      </div>
      <span className="text-[11px] text-green-600 font-medium">GPS 追蹤中</span>
    </div>
  );
}
