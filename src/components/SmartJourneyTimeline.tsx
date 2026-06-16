'use client';

import { useMemo } from 'react';
import type { SmartRouteRecommendation, SmartSegment } from '@/types';

// ─── Props ───────────────────────────────────────────────────────────
interface SmartJourneyTimelineProps {
  recommendation: SmartRouteRecommendation;
  expanded: boolean;
  onToggle: () => void;
}

// ─── Transport emoji mapping ──────────────────────────────────────────
function getTransportEmoji(description: string): string {
  if (description.includes('🚇') || description.match(/\bMTR\b/i) || description.match(/線$/)) return '🚇';
  if (description.includes('🚐') || description.match(/minibus/i)) return '🚐';
  if (description.includes('🚊') || description.includes('電車')) return '🚊';
  return '🚌';
}

// ─── Pill sub-component ─────────────────────────────────────────────
function SegmentPill({ segment }: { segment: SmartSegment }) {
  if (segment.type === 'walk') {
    return (
      <span className="inline-flex items-center gap-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full px-1 py-0.5 text-[9px] whitespace-nowrap">
        🚶{segment.minutes}'
      </span>
    );
  }

  if (segment.type === 'wait') {
    return (
      <span className="inline-flex items-center gap-0.5 bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 rounded-full px-1 py-0.5 text-[9px] whitespace-nowrap">
        🕐{segment.minutes}'
      </span>
    );
  }

  // ride
  const emoji = getTransportEmoji(segment.description);
  return (
    <span className="inline-flex items-center gap-0.5 bg-green-500/20 text-green-300 border border-green-500/30 rounded-full px-1 py-0.5 text-[9px] whitespace-nowrap">
      {emoji}{segment.minutes}'
    </span>
  );
}

// ─── Confidence dot ──────────────────────────────────────────────────
function ConfidenceDot({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const color =
    confidence === 'high'
      ? 'bg-green-400'
      : confidence === 'medium'
        ? 'bg-yellow-400'
        : 'bg-red-400';

  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />;
}

// ─── Confidence label ────────────────────────────────────────────────
function confidenceLabel(confidence: 'high' | 'medium' | 'low'): string {
  switch (confidence) {
    case 'high': return '可靠';
    case 'medium': return '一般';
    case 'low': return '不確定';
  }
}

// ─── Main Component ──────────────────────────────────────────────────
export default function SmartJourneyTimeline({
  recommendation,
  expanded,
  onToggle,
}: SmartJourneyTimelineProps) {
  const { segments, totalMinutes, canMakeIt, confidence } = recommendation;

  // Find any long waits (>15 min) for warning badge
  const longWait = useMemo(
    () => segments.find(s => s.type === 'wait' && s.minutes > 15),
    [segments],
  );

  return (
    <div
      className="absolute left-3 right-3 bottom-20 z-[1000] max-w-[calc(100%-24px)]"
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
    >
      <div className="bg-black/80 backdrop-blur-xl rounded-xl border border-white/15 p-1.5 cursor-pointer select-none">
        {/* ── Collapsed: horizontal pill timeline ─────────────────── */}
        <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-0.5 shrink-0">
              <SegmentPill segment={seg} />
              {i < segments.length - 1 && (
                <span className="text-gray-500 text-[8px]">→</span>
              )}
            </span>
          ))}

          {/* Total time + confidence */}
          <span className="shrink-0 flex items-center gap-1 ml-1 text-[11px] text-white font-medium">
            ⏱ ~{totalMinutes}分鐘
            <ConfidenceDot confidence={confidence} />
          </span>

          {/* Warning badge if can't make it */}
          {!canMakeIt && (
            <span className="shrink-0 inline-flex items-center gap-0.5 bg-red-500/20 text-red-300 border border-red-500/30 rounded-full px-1.5 py-0.5 text-[10px] whitespace-nowrap">
              ⚠️ 等候超過15分鐘
            </span>
          )}
        </div>

        {/* ── Expanded: detail list ───────────────────────────────── */}
        {expanded && (
          <div className="mt-2 pt-2 border-t border-white/10">
            <div className="space-y-1">
              {segments.map((seg, i) => {
                const icon =
                  seg.type === 'walk'
                    ? '🚶'
                    : seg.type === 'wait'
                      ? '🕐'
                      : getTransportEmoji(seg.description);

                return (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-300 truncate">
                      {icon} {seg.description}
                    </span>
                    <span
                      className={
                        seg.type === 'walk'
                          ? 'text-blue-300 ml-2 shrink-0'
                          : seg.type === 'wait'
                            ? 'text-yellow-300 ml-2 shrink-0'
                            : 'text-green-300 ml-2 shrink-0'
                      }
                    >
                      {seg.minutes}'
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Divider */}
            <div className="my-1.5 border-t border-dashed border-white/10" />

            {/* Total row */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-white font-medium">
                合計約 {totalMinutes} 分鐘
              </span>
              <span className="flex items-center gap-1 text-white">
                <ConfidenceDot confidence={confidence} />
                <span className="text-gray-400">{confidenceLabel(confidence)}</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}