'use client';

import { useAppStore } from '@/stores/appStore';

export default function ETADisplay() {
  const { etas, currentJourney } = useAppStore();

  if (!currentJourney || etas.length === 0) {
    return null;
  }

  const getRouteTypeIcon = (type: string) => {
    switch (type) {
      case 'bus': return '🚌';
      case 'mtr': return '🚇';
      case 'minibus': return '🚐';
      case 'tram': return '🚊';
      case 'ferry': return '⛴️';
      default: return '🚍';
    }
  };

  const getUrgencyStyle = (minutes: number) => {
    if (minutes <= 2) return { color: 'text-red-600', bg: 'bg-red-50 border-red-200', glow: 'shadow-red-100' };
    if (minutes <= 5) return { color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', glow: 'shadow-amber-100' };
    return { color: 'text-green-600', bg: 'bg-green-50 border-green-200', glow: 'shadow-green-100' };
  };

  return (
    <div className="space-y-2.5">
      className="text-xs font-bold text-gray-500 uppercase tracking-wider"
      <div className="space-y-2">
        {etas.map((eta) => {
          const style = getUrgencyStyle(eta.minutesAway);
          return (
            <div
              key={`${eta.routeId}-${eta.stopId}`}
              className={`bg-white border ${style.bg} rounded-xl p-3 shadow-sm ${style.glow} animate-slide-up`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{getRouteTypeIcon('bus')}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{eta.routeId}</p>
                    <p className="text-[10px] text-gray-500">往 {eta.destination}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-bold ${style.color}`}>
                    {eta.minutesAway}
                  </p>
                  <p className="text-[10px] text-gray-400">分鐘</p>
                </div>
              </div>
              
              {eta.minutesAway <= 2 && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <p className="text-[11px] text-red-500 font-medium">
                    🏃 趕快！有機會趕上
                  </p>
                </div>
              )}
              
              {eta.minutesAway > 5 && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <p className="text-[11px] text-gray-400">
                    ⏰ 建議等下一班車
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
