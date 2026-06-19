'use client';

import { useState, useEffect } from 'react';
import type { AlternativeRoute, SegmentAlternatives } from '../lib/alternative-routes';

// ─── Props ────────────────────────────────────────────────────────────
interface AlternativeRouteCardProps {
  segment: SegmentAlternatives;
  onSelect?: (alt: AlternativeRoute) => void;
}

// ─── Confidence styling ──────────────────────────────────────────────
function confidenceDot(confidence: AlternativeRoute['confidence']) {
  switch (confidence) {
    case 'high':
      return { dot: 'bg-emerald-400', badge: 'bg-emerald-500/15 text-emerald-300', text: 'text-emerald-400' };
    case 'medium':
      return { dot: 'bg-yellow-400', badge: 'bg-yellow-500/15 text-yellow-300', text: 'text-yellow-400' };
    case 'low':
      return { dot: 'bg-red-400', badge: 'bg-red-500/15 text-red-300', text: 'text-red-400' };
  }
}

function routeTypeEmoji(type: AlternativeRoute['routeType']) {
  switch (type) {
    case 'bus': return '🚌';
    case 'mtr': return '🚇';
    case 'gmb': return '🚐';
    case 'tram': return '🚊';
    default: return '🚍';
  }
}

// ─── Last Bus Passed Warning ─────────────────────────────────────────
function LastBusPassedWarning() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
      <span className="text-amber-400 text-sm">⚠️</span>
      <span className="text-xs font-medium text-amber-300">
        尾班車已過，建議改乘以下路線
      </span>
    </div>
  );
}

// ─── Single Alternative Row ──────────────────────────────────────────
function AlternativeRow({ alt, onSelect, segmentLabel }: { alt: AlternativeRoute; onSelect?: (alt: AlternativeRoute) => void; segmentLabel: string }) {
  const style = confidenceDot(alt.confidence);

  return (
    <button
      onClick={() => onSelect?.(alt)}
      className="w-full text-left bg-slate-800/60 hover:bg-slate-700/60 rounded-xl p-3 transition-colors"
    >
      {/* Route name + company + time saved */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-base font-bold text-white">
          {routeTypeEmoji(alt.routeType)} {alt.routeName}
        </span>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
          alt.company === 'CTB' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {alt.company === 'CTB' ? 'C' : alt.company === 'MTR' ? 'M' : 'K'}
        </span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>
          快 {alt.savedMinutes} 分
        </span>
        <span className="flex-1" />
        <span className={`text-sm font-semibold ${style.text}`}>
          {alt.minutesAway <= 0 ? '🚏 到站中' : `${alt.minutesAway} 分鐘後到`}
        </span>
      </div>

      {/* Boarding + alighting info */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span className="bg-slate-700/50 px-1.5 py-0.5 rounded text-gray-300 truncate max-w-[140px]">
          🚏 {segmentLabel}
        </span>
        <span className="text-gray-600">↓</span>
        <span className="truncate">
          {alt.direction}
        </span>
        {alt.estimatedRideMinutes > 0 && (
          <span className="text-gray-500 flex-shrink-0 ml-auto">
            🕐 ~{alt.totalMinutes} 分鐘
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export default function AlternativeRouteCard({ segment, onSelect }: AlternativeRouteCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Slide-down animation on mount
  useEffect(() => {
    const timer = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  if (segment.alternatives.length === 0) return null;

  const best = segment.alternatives[0];
  const bestStyle = best ? confidenceDot(best.confidence) : { dot: 'bg-gray-500', badge: '', text: 'text-gray-400' };

  return (
    <div
      className={`
        transition-all duration-300 ease-out overflow-hidden
        ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'}
      `}
    >
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl overflow-hidden">
        {/* ── Header (always visible) ────────────────────────────── */}
        <button
          onClick={() => setExpanded(prev => !prev)}
          className="w-full text-left px-4 py-3 flex items-center gap-2 hover:bg-slate-700/40 transition-colors"
        >
          {/* Section label */}
          <span className="text-sm font-semibold text-gray-300 flex-shrink-0">
            {segment.isLastBusPassed ? '🚨 尾班車已過' : '更快路線'}
          </span>

          {/* Best alternative summary (only if alternatives exist) */}
          {best && (
            <>
              <span className="flex items-center gap-1 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${bestStyle.dot}`} />
                <span className="text-white font-bold truncate">{best.routeName}</span>
              </span>

              {/* Time saved badge for best */}
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${bestStyle.badge}`}>
                {segment.isLastBusPassed ? `${best.minutesAway} 分鐘` : `快 ${best.savedMinutes} 分`}
              </span>
            </>
          )}

          {/* Spacer */}
          <span className="flex-1" />

          {/* Expand/collapse chevron */}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* ── Expanded details ───────────────────────────────────── */}
        <div
          className={`
            transition-all duration-300 ease-out
            ${expanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}
            overflow-hidden
          `}
        >
          <div className="px-3 pb-3 space-y-2">
            {/* Last bus passed warning */}
            {segment.isLastBusPassed && (
              <LastBusPassedWarning />
            )}

            {segment.alternatives.slice(0, 3).map((alt) => (
              <AlternativeRow key={`${alt.routeName}-${alt.company}`} alt={alt} segmentLabel={segment.segmentLabel} onSelect={onSelect} />
            ))}

            {/* Context line */}
            {!segment.isLastBusPassed && (
              <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                <span>原路線: {segment.configuredRoute}</span>
                {segment.configuredWaitMinutes > 0 && (
                  <span>等候約 {segment.configuredWaitMinutes} 分鐘</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}