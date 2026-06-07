'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchETA, getTransferAdvice, type TransportETA, type TransferAdvice } from '@/lib/eta-service';

interface LiveETAPanelProps {
  segments: Array<{
    label: string;
    stopId: string;
    type: 'bus' | 'mtr' | 'gmb' | 'tram';
    company?: 'KMB' | 'CTB';
    route?: string;
    lineCode?: string;
    walkingMinutes?: number;
  }>;
  autoRefresh?: boolean;
}

export default function LiveETAPanel({ segments, autoRefresh = true }: LiveETAPanelProps) {
  const [etas, setEtas] = useState<Map<string, TransportETA[]>>(new Map());
  const [advice, setAdvice] = useState<Map<string, TransferAdvice>>(new Map());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAllETAs = useCallback(async () => {
    setLoading(true);
    try {
      const newEtas = new Map<string, TransportETA[]>();

      await Promise.all(
        segments.map(async (seg) => {
          const result = await fetchETA(
            seg.stopId,
            seg.type,
            seg.company,
            seg.route,
            seg.lineCode
          );
          newEtas.set(seg.label, result);
        })
      );

      setEtas(newEtas);
      setLastUpdated(new Date());

      // Calculate transfer advice
      const newAdvice = new Map<string, TransferAdvice>();
      for (let i = 0; i < segments.length - 1; i++) {
        const current = segments[i];
        const next = segments[i + 1];
        const currentETAs = newEtas.get(current.label) || [];
        const nextETAs = newEtas.get(next.label) || [];

        if (currentETAs.length > 0 && nextETAs.length > 0 && next.walkingMinutes) {
          const advice = getTransferAdvice(
            next.walkingMinutes,
            nextETAs[0].minutesAway
          );
          newAdvice.set(`${current.label}→${next.label}`, advice);
        }
      }
      setAdvice(newAdvice);
    } catch (err) {
      console.error('ETA fetch error:', err);
    }
    setLoading(false);
  }, [segments]);

  useEffect(() => {
    fetchAllETAs();

    if (autoRefresh) {
      const interval = setInterval(fetchAllETAs, 30000); // Refresh every 30s
      return () => clearInterval(interval);
    }
  }, [fetchAllETAs, autoRefresh]);

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

  const getTransportIcon = (type: 'bus' | 'mtr' | 'gmb' | 'tram') => {
    switch (type) {
      case 'bus': return '🚌';
      case 'mtr': return '🚇';
      case 'gmb': return '🚐';
      case 'tram': return '🚊';
      default: return '🚍';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">即時到站</h3>
        <div className="flex items-center gap-2">
          {loading && (
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
          <button
            onClick={fetchAllETAs}
            className="text-gray-400 hover:text-white text-sm"
          >
            🔄 刷新
          </button>
        </div>
      </div>

      {lastUpdated && (
        <p className="text-xs text-gray-500">
          更新時間: {lastUpdated.toLocaleTimeString('zh-HK')}
        </p>
      )}

      <div className="space-y-3">
        {segments.map((seg, index) => {
          const segETAs = etas.get(seg.label) || [];
          const transferKey = index < segments.length - 1
            ? `${seg.label}→${segments[index + 1].label}`
            : null;
          const transfer = transferKey ? advice.get(transferKey) : null;

          return (
            <div key={seg.label}>
              {/* Station/Stop */}
              <div className={`border rounded-lg p-4 ${
                segETAs.length > 0 ? getUrgencyBg(segETAs[0].minutesAway) : 'bg-white/5 border-white/10'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{getTransportIcon(seg.type)}</span>
                    <div>
                      <p className="font-medium text-white text-sm">{seg.label}</p>
                      {seg.route && (
                        <p className="text-xs text-gray-400">路線 {seg.route}</p>
                      )}
                      {seg.lineCode && (
                        <p className="text-xs text-gray-400">{seg.lineCode}</p>
                      )}
                    </div>
                  </div>
                </div>

                {segETAs.length === 0 ? (
                  <p className="text-gray-400 text-sm">暫無班次資料</p>
                ) : (
                  <div className="space-y-2">
                    {segETAs.slice(0, 3).map((eta, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-gray-300 text-sm">
                          → {eta.destination}
                        </span>
                        <span className={`font-bold ${getUrgencyColor(eta.minutesAway)}`}>
                          {eta.minutesAway === 0 ? '即將到達' : `${eta.minutesAway}分鐘`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {segETAs.length > 0 && segETAs[0].minutesAway <= 2 && (
                  <div className="mt-2 pt-2 border-t border-white/10">
                    <p className="text-sm text-red-300 font-medium">
                      🏃 趕快！有機會趕上
                    </p>
                  </div>
                )}
              </div>

              {/* Transfer advice */}
              {transfer && (
                <div className="flex items-center gap-2 py-2 px-4">
                  <div className="flex-1 border-l-2 border-dashed border-gray-600 h-8 ml-6" />
                  <div className={`text-xs px-2 py-1 rounded ${
                    transfer.urgency === 'rush' ? 'bg-red-500/30 text-red-300' :
                    transfer.urgency === 'normal' ? 'bg-green-500/30 text-green-300' :
                    'bg-gray-500/30 text-gray-300'
                  }`}>
                    🚶 {transfer.walkingMinutes}分鐘轉乘 · {transfer.message}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
