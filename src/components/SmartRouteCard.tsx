'use client';

import { useState, useEffect } from 'react';
import type { SmartRouteRecommendation, SmartRouteOption, SmartRouteSegment } from '../lib/smart-route';
import { getMTRLineName } from '@/lib/mtr-api';

// ─── Props ────────────────────────────────────────────────────────────
interface SmartRouteCardProps {
  recommendation: SmartRouteRecommendation;
  onSelect?: (option: SmartRouteOption) => void;
}

// ─── Transport icon helper ────────────────────────────────────────────
function rideIcon(label: string): string {
  if (label.includes('綫') || /^[A-Z]{2,3}\b/.test(label)) return '🚇';
  return '🚌';
}

// ─── Convert name like "EAL 線" → "東鐵綫", "72X" → "72X" ───────────
function displayName(name: string): string {
  // Match "XXX 線" pattern where XXX is an MTR line code
  const m = name.match(/^([A-Z]{2,3})\s*線/);
  if (m) return getMTRLineName(m[1]);
  return name;
}

// ─── Route directions: explicit step-by-step ──────────────────────────
function RouteDirections({ option }: { option: SmartRouteOption }) {
  const segments = option.segments;

  // Build steps: show ONLY ride + walk (skip wait)
  const steps = segments.filter(s => s.type !== 'wait');
  if (steps.length === 0) return null;

  return (
    <div className="mt-2 space-y-0">
      {steps.map((step, i) => {
        if (step.type === 'walk') {
          // Extract destination from label: "步行去旺角東站" or "步行去目的地"
          const dest = step.label.replace(/^步行去?\s*/, '');
          return (
            <div key={i} className="flex items-start gap-2 py-0.5 pl-4">
              <span className="text-[10px] leading-none shrink-0">🚶</span>
              <div className="flex-1 min-w-0">
                <span className="text-[9px] text-blue-300">
                  步行去{dest}
                </span>
                <span className="text-[8px] text-gray-500 ml-1">
                  {step.details || `${step.minutes}'`}
                </span>
              </div>
              <span className="text-[8px] text-gray-500">{step.minutes}'</span>
            </div>
          );
        }

        // Parse ride label: "EAL 旺角東→金鐘"
        const arrowIdx = step.label.indexOf('→');
        const spaceIdx = step.label.indexOf(' ');
        let line = step.label;
        let fromStop = '';
        let toStop = '';
        if (spaceIdx !== -1 && arrowIdx !== -1 && spaceIdx < arrowIdx) {
          line = step.label.substring(0, spaceIdx);
          fromStop = step.label.substring(spaceIdx + 1, arrowIdx).trim();
          toStop = step.label.substring(arrowIdx + 1).trim();
        } else if (arrowIdx !== -1) {
          fromStop = step.label.substring(0, arrowIdx).trim();
          toStop = step.label.substring(arrowIdx + 1).trim();
        }

        const isMTR = rideIcon(step.label) === '🚇';

        return (
          <div key={i} className="relative">
            {/* Vertical line connector */}
            {i > 0 && <div className="absolute left-[7px] top-0 bottom-0 w-0.5 bg-white/10" />}

            <div className="flex items-start gap-2 pb-2">
              {/* Dot */}
              <div className={`w-[15px] h-[15px] rounded-full flex items-center justify-center shrink-0 mt-1.5 ${
                isMTR ? 'bg-emerald-500/30' : 'bg-blue-500/30'
              }`}>
                <div className={`w-[7px] h-[7px] rounded-full ${
                  isMTR ? 'bg-emerald-400' : 'bg-blue-400'
                }`} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 bg-white/5 rounded-lg px-2.5 py-2 border border-white/10">
                {/* Transport header */}
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[11px]">{rideIcon(step.label)}</span>
                  <span className={`text-[11px] font-bold ${isMTR ? 'text-emerald-300' : 'text-blue-300'}`}>
                    {isMTR ? getMTRLineName(line) : line}
                  </span>
                  <span className="text-[9px] text-gray-500 ml-auto">{step.minutes}'</span>
                </div>

                {/* Boarding stop */}
                {fromStop && (
                  <div className="flex items-center gap-1 text-[10px]">
                    <span className="text-gray-500 w-4 shrink-0">📍</span>
                    <span className="text-gray-400 text-[8px]">上車</span>
                    <span className="text-white font-medium ml-auto">{fromStop}</span>
                  </div>
                )}

                {/* Alighting stop */}
                {toStop && (
                  <div className="flex items-center gap-1 text-[10px] mt-0.5">
                    <span className="text-gray-500 w-4 shrink-0">🏁</span>
                    <span className="text-gray-400 text-[8px]">
                      {i < steps.length - 1 && steps[i+1]?.type === 'ride' ? '轉車' : '落車'}
                    </span>
                    <span className="text-white font-medium ml-auto">{toStop}</span>
                  </div>
                )}

                {/* Detail */}
                {step.details && (
                  <p className="text-[8px] text-gray-500 mt-0.5 pl-5">{step.details}</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Option row ──────────────────────────────────────────────────────
function OptionRow({ option, isBest, onSelect }: { option: SmartRouteOption; isBest: boolean; onSelect?: (option: SmartRouteOption) => void }) {
  return (
    <button
      onClick={() => onSelect?.(option)}
      className={`w-full text-left rounded-xl p-3 transition-colors ${
        isBest
          ? 'bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20'
          : 'bg-slate-800/60 hover:bg-slate-700/60'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[11px] font-bold text-white">
          {option.type === 'mtr' ? '🚇' : option.type === 'bus+mtr' ? '🚌+🚇' : '🚌'} {displayName(option.name)}
        </span>
        {option.savedVsConfigured > 0 && (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
            快 {option.savedVsConfigured} 分鐘
          </span>
        )}
        <span className="text-[9px] text-gray-500 ml-auto">{option.totalMinutes} 分鐘</span>
      </div>

      {/* Route directions */}
      <RouteDirections option={option} />

      {/* Summary */}
      <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-white/5 text-[8px]">
        {option.walkMinutes > 0 && <span className="text-blue-300">🚶 {option.walkMinutes}min</span>}
        {option.waitMinutes > 0 && <span className="text-yellow-300">🕐 等{option.waitMinutes}min</span>}
        <span className="flex-1" />
        <span className={`font-medium ${
          option.confidence === 'high' ? 'text-emerald-400' :
          option.confidence === 'medium' ? 'text-yellow-400' : 'text-red-400'
        }`}>
          {option.confidence === 'high' ? '可靠' : option.confidence === 'medium' ? '一般' : '注意'}
        </span>
      </div>
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export default function SmartRouteCard({ recommendation, onSelect }: SmartRouteCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  if (!recommendation.bestAlternative) return null;

  const best = recommendation.bestAlternative;

  // Parse the best option for header summary
  const rideSegs = best.segments.filter(s => s.type === 'ride');

  return (
    <div
      className={`
        transition-all duration-300 ease-out
        ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'}
      `}
    >
      <div className="bg-slate-800/90 backdrop-blur-xl border border-slate-700/60 rounded-2xl overflow-hidden shadow-2xl">
        {/* ── Header ────────────────────────────────────────────── */}
        <button
          onClick={() => setExpanded(prev => !prev)}
          className="w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-slate-700/40 transition-colors"
        >
          <span className="text-sm leading-none mt-0.5">🚀</span>
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white truncate">{displayName(best.name)}</span>
              {best.savedVsConfigured > 0 && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 shrink-0">
                  快{best.savedVsConfigured}分
                </span>
              )}
            </div>
            {/* Route summary (collapsed) */}
            {!expanded && rideSegs.map((seg, i) => {
              const arrowIdx = seg.label.indexOf('→');
              const spaceIdx = seg.label.indexOf(' ');
              let line = seg.label;
              let fromStop = '', toStop = '';
              if (spaceIdx !== -1 && arrowIdx !== -1 && spaceIdx < arrowIdx) {
                line = seg.label.substring(0, spaceIdx);
                fromStop = seg.label.substring(spaceIdx + 1, arrowIdx).trim();
                toStop = seg.label.substring(arrowIdx + 1).trim();
              } else if (arrowIdx !== -1) {
                fromStop = seg.label.substring(0, arrowIdx).trim();
                toStop = seg.label.substring(arrowIdx + 1).trim();
              }
              const isMTR = /^[A-Z]{2,3}$/.test(line) || rideIcon(seg.label) === '🚇';
              return (
                <div key={i} className="flex items-center gap-1 text-[9px] text-gray-300 mt-0.5">
                  <span>{rideIcon(seg.label)}</span>
                  <span className={isMTR ? 'text-emerald-300' : 'text-blue-300'}>
                    {isMTR ? getMTRLineName(line) : line}
                  </span>
                  {fromStop && <span className="text-gray-400">{fromStop}</span>}
                  {toStop && <><span className="text-gray-600">→</span><span className="text-gray-400">{toStop}</span></>}
                  <span className="text-gray-500">{seg.minutes}'</span>
                </div>
              );
            })}
          </div>
          <svg
            className={`w-3 h-3 text-gray-400 transition-transform duration-200 shrink-0 mt-1 ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* ── Expanded: all options ──────────────────────────────── */}
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
            <p className="text-[9px] text-gray-500 text-center pt-1">
              你嘅路線: {recommendation.currentRouteMinutes} 分鐘
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
