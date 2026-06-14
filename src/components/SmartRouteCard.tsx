'use client';

import { useState, useEffect } from 'react';
import type { SmartRouteRecommendation, SmartRouteOption } from '../lib/smart-route';

// ─── Props ────────────────────────────────────────────────────────────
interface SmartRouteCardProps {
  recommendation: SmartRouteRecommendation;
  onSelect?: (option: SmartRouteOption) => void;
}

// ─── Confidence styling ──────────────────────────────────────────────
function confidenceDot(confidence: SmartRouteOption['confidence']) {
  switch (confidence) {
    case 'high':
      return { dot: 'bg-emerald-400', badge: 'bg-emerald-500/15 text-emerald-300', text: 'text-emerald-400' };
    case 'medium':
      return { dot: 'bg-yellow-400', badge: 'bg-yellow-500/15 text-yellow-300', text: 'text-yellow-400' };
    case 'low':
      return { dot: 'bg-red-400', badge: 'bg-red-500/15 text-red-300', text: 'text-red-400' };
  }
}

function typeEmoji(type: SmartRouteOption['type']) {
  switch (type) {
    case 'bus': return '🚌';
    case 'mtr': return '🚇';
    case 'bus+mtr': return '🚌+🚇';
  }
}

// ─── Single Option Row ──────────────────────────────────────────────
function OptionRow({ option, isBest, onSelect }: { option: SmartRouteOption; isBest: boolean; onSelect?: (option: SmartRouteOption) => void }) {
  const style = confidenceDot(option.confidence);

  return (
    <button
      onClick={() => onSelect?.(option)}
      className={`w-full text-left rounded-xl p-3 transition-colors ${
        isBest
          ? 'bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20'
          : 'bg-slate-800/60 hover:bg-slate-700/60'
      }`}
    >
      <div className="flex items-center gap-2.5">
        {/* Confidence dot */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />

        {/* Type + Name */}
        <span className="text-lg font-bold text-white flex-shrink-0">
          {typeEmoji(option.type)} {option.name}
        </span>

        {/* Time saved badge */}
        {option.savedVsConfigured > 0 && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${style.badge}`}>
            快 {option.savedVsConfigured} 分鐘
          </span>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* Total time */}
        <span className={`text-sm font-medium flex-shrink-0 ${style.text}`}>
          {option.totalMinutes} 分鐘
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-400 mt-1.5 truncate">
        {option.description}
      </p>

      {/* Segment breakdown */}
      {isBest && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {option.segments.map((seg, i) => (
            <span key={i} className="text-xs bg-slate-700/50 text-gray-300 px-2 py-0.5 rounded-full">
              {seg.type === 'walk' ? '🚶' : seg.type === 'wait' ? '🕐' : '🚌'}
              {seg.minutes}min
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export default function SmartRouteCard({ recommendation, onSelect }: SmartRouteCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Slide-down animation on mount
  useEffect(() => {
    const timer = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  // Don't show if no better alternative
  if (!recommendation.bestAlternative) return null;

  const best = recommendation.bestAlternative;

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
          <span className="text-sm font-semibold text-emerald-400 flex-shrink-0">
            🚀 智能推薦
          </span>

          {/* Best alternative summary */}
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-white font-bold">{best.name}</span>
          </span>

          {/* Time saved badge */}
          {best.savedVsConfigured > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 flex-shrink-0">
              快 {best.savedVsConfigured} 分鐘
            </span>
          )}

          {/* Spacer */}
          <span className="flex-1" />

          {/* Current route comparison */}
          <span className="text-xs text-gray-500 flex-shrink-0">
            你嘅路線: {recommendation.currentRouteMinutes}min
          </span>

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
            {recommendation.allOptions.map((opt) => (
              <OptionRow
                key={opt.id}
                option={opt}
                isBest={opt.id === best.id}
                onSelect={onSelect}
              />
            ))}

            {/* Context line */}
            <p className="text-xs text-gray-500 text-center pt-1">
              你配置嘅路線需 {recommendation.currentRouteMinutes} 分鐘
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}