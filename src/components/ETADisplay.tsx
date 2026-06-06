'use client';

import { useAppStore } from '@/stores/appStore';
import type { ETA } from '@/types';

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

  const getUrgencyColor = (minutes: number) => {
    if (minutes <= 2) return 'text-red-400';
    if (minutes <= 5) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getUrgencyBg = (minutes: number) => {
    if (minutes <= 2) return 'bg-red-500/20 border-red-500/50';
    if (minutes <= 5) return 'bg-yellow-500/20 border-yellow-500/50';
    return 'bg-green-500/20 border-green-500/50';
  };

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-white">即時到站時間</h3>
      <div className="space-y-2">
        {etas.map((eta) => (
          <div
            key={`${eta.routeId}-${eta.stopId}`}
            className={`border rounded-lg p-4 ${getUrgencyBg(eta.minutesAway)}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{getRouteTypeIcon('bus')}</span>
                <div>
                  <p className="font-medium text-white">{eta.routeId}</p>
                  <p className="text-sm text-gray-300">往 {eta.destination}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-bold ${getUrgencyColor(eta.minutesAway)}`}>
                  {eta.minutesAway}
                </p>
                <p className="text-sm text-gray-300">分鐘</p>
              </div>
            </div>
            
            {eta.minutesAway <= 2 && (
              <div className="mt-2 pt-2 border-t border-white/10">
                <p className="text-sm text-red-300 font-medium">
                  🏃 趕快！有機會趕上此班車
                </p>
              </div>
            )}
            
            {eta.minutesAway > 5 && (
              <div className="mt-2 pt-2 border-t border-white/10">
                <p className="text-sm text-green-300">
                  ⏰ 建議等下一班車
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
