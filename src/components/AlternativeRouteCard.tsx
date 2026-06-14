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
function AlternativeRow({ alt, onSelect }: { alt: AlternativeRoute; onSelect?: (alt: AlternativeRoute) => void }) {
  const style = confidenceDot(alt.confidence);

  return (
    <button
      onClick={() => onSelect?.(alt)}
      className="w-full text-left bg-slate-800/60 hover:bg-slate-700/60 rounded-xl p-3 transition-colors"
    >
      <div className="flex items-center gap-2.5">
        {/* Confidence dot */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />

        {/* Route badge */}
        <span className="text-lg font-bold text-white flex-shrink-0">
          {routeTypeEmoji(alt.routeType)} {alt.routeName}
        </span>

        {/* Time saved badge */}
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${style.badge}`}>
          快 {alt.savedMinutes} 分鐘
        </span>

        {/* Spacer */}
        <span className="flex-1" />

        {/* Next arrival */}
        <span className={`text-sm font-medium flex-shrink-0 ${style.text}`}>
          {alt.minutesAway <= 0 ? '到站中' : `${alt.minutesAway} 分鐘後到站`}
        </span>
      </div>

      {/* Destination / direction */}
      <p className="text-sm text-gray-400 mt-1.5 pl-4.5 truncate">
        {alt.direction}
      </p>
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
  const bestStyle = confidenceDot(best.confidence);

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
          className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-700/40 transition-colors"
        >
          {/* Section label */}
          <span className="text-sm font-semibold text-gray-300 flex-shrink-0">
            {segment.isLastBusPassed ? '🚨 尾班車已過' : '更快路線'}
          </span>

          {/* Best alternative summary */}
          <span className="flex items-center gap-1.5 min-w-0">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${bestStyle.dot}`} />
            <span className="text-white font-bold">{best.routeName}</span>
          </span>

          {/* Time saved badge for best */}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${bestStyle.badge}`}>
            {segment.isLastBusPassed ? `${best.minutesAway} 分鐘` : `快 ${best.savedMinutes} 分鐘`}
          </span>

          {/* Spacer */}
          <span className="flex-1" />

          {/* Currently configured route context */}
          {!segment.isLastBusPassed && (
            <span className="text-xs text-gray-500 flex-shrink-0">
              原路線: {segment.configuredRoute}
            </span>
          )}

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
              <AlternativeRow key={`${alt.routeName}-${alt.company}`} alt={alt} onSelect={onSelect} />
            ))}

            {/* Context line */}
            {!segment.isLastBusPassed && (
              <p className="text-xs text-gray-500 text-center pt-1">
                你目前嘅路線 {segment.configuredRoute} 需等約 {segment.configuredWaitMinutes} 分鐘
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}