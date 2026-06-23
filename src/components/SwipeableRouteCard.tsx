'use client';

import { useState, useRef, useCallback } from 'react';
import type { CommuteRoute } from '@/types';
import { Building, Home } from 'lucide-react';
import { getMTRLineName } from '@/lib/mtr-api';

interface SwipeableRouteCardProps {
  route: CommuteRoute;
  onStart: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isActive?: boolean;
  onReturn?: () => void;
  onEnd?: () => void;
}

const DIRECTION_STYLES = {
  to_work: {
    gradient: 'from-blue-50 to-blue-100/50',
    border: 'border-blue-300/70',
    accentGlow: 'shadow-blue-200/50',
    btn: 'from-blue-600 to-blue-500',
    btnHover: 'from-blue-500 to-blue-400',
    badge: 'badge-blue',
    label: '返工',
  },
  to_home: {
    gradient: 'from-amber-50 to-amber-100/50',
    border: 'border-amber-300/70',
    accentGlow: 'shadow-amber-200/50',
    btn: 'from-amber-600 to-amber-500',
    btnHover: 'from-amber-500 to-amber-400',
    badge: 'badge-amber',
    label: '放工',
  },
} as const;

const TRANSPORT_ICONS: Record<string, string> = {
  bus: '🚌',
  mtr: '🚇',
  minibus: '🚐',
  tram: '🚊',
  ferry: '⛴️',
};

export default function SwipeableRouteCard({ route, onStart, onEdit, onDelete, isActive, onReturn, onEnd }: SwipeableRouteCardProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const isDraggingRef = useRef(false);

  const ACTION_WIDTH = 160;
  const THRESHOLD = 80;

  const dir = DIRECTION_STYLES[route.direction] ?? DIRECTION_STYLES.to_work;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = e.touches[0].clientX;
    isDraggingRef.current = true;
    setIsPressed(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    currentXRef.current = e.touches[0].clientX;
    const diff = currentXRef.current - startXRef.current;
    if (diff > 0 && !isRevealed) return;
    const newOffset = isRevealed
      ? Math.min(0, Math.max(-ACTION_WIDTH, -ACTION_WIDTH + diff))
      : Math.min(0, Math.max(-ACTION_WIDTH, diff));
    setOffsetX(newOffset);
  }, [isRevealed]);

  const handleTouchEnd = useCallback(() => {
    isDraggingRef.current = false;
    setIsPressed(false);
    if (offsetX < -THRESHOLD) {
      setOffsetX(-ACTION_WIDTH);
      setIsRevealed(true);
    } else {
      setOffsetX(0);
      setIsRevealed(false);
    }
  }, [offsetX]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    startXRef.current = e.clientX;
    currentXRef.current = e.clientX;
    isDraggingRef.current = true;
    setIsPressed(true);

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      currentXRef.current = ev.clientX;
      const diff = currentXRef.current - startXRef.current;
      if (diff > 0 && !isRevealed) return;
      const newOffset = isRevealed
        ? Math.min(0, Math.max(-ACTION_WIDTH, -ACTION_WIDTH + diff))
        : Math.min(0, Math.max(-ACTION_WIDTH, diff));
      setOffsetX(newOffset);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      setIsPressed(false);
      if (offsetX < -THRESHOLD) {
        setOffsetX(-ACTION_WIDTH);
        setIsRevealed(true);
      } else {
        setOffsetX(0);
        setIsRevealed(false);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [offsetX, isRevealed]);

  const resetSwipe = useCallback(() => {
    setOffsetX(0);
    setIsRevealed(false);
  }, []);

  const handleEdit = useCallback(() => {
    resetSwipe();
    onEdit();
  }, [resetSwipe, onEdit]);

  const handleDelete = useCallback(() => {
    resetSwipe();
    onDelete();
  }, [resetSwipe, onDelete]);

  return (
    <div className="perspective-1000">
      <div className="relative overflow-hidden rounded-2xl">
        {/* Action buttons (behind the card) */}
        <div className="absolute right-0 top-0 bottom-0 flex" style={{ width: ACTION_WIDTH }}>
          <button
            onClick={handleEdit}
            className="flex-1 bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white flex items-center justify-center transition-all active:scale-95"
          >
            <div className="text-center">
              <span className="text-lg">✏️</span>
              <p className="text-[10px] mt-0.5 font-medium opacity-80">編輯</p>
            </div>
          </button>
          <button
            onClick={handleDelete}
            className="flex-1 bg-gradient-to-b from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white flex items-center justify-center transition-all active:scale-95"
          >
            <div className="text-center">
              <span className="text-lg">🗑️</span>
              <p className="text-[10px] mt-0.5 font-medium opacity-80">刪除</p>
            </div>
          </button>
        </div>

        {/* Main card */}
        <div
          className={`relative z-10 overflow-hidden transition-all ${
            isActive
              ? 'bg-white border-2 border-green-400 shadow-md shadow-green-200/50'
              : `bg-white border-2 ${dir.border} shadow-md ${dir.accentGlow}`
          }`}
          style={{
            transform: `translateX(${offsetX}px) ${isPressed ? 'scale(0.98)' : 'scale(1)'}`,
            transition: isDraggingRef.current ? 'transform 50ms ease-out' : 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            borderRadius: '16px',
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
        >
          {/* Shimmer effect on hover */}
          <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none animate-shimmer" />

          <div className="relative p-4">
            {/* Top row: name + action */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {isActive && (
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse flex-shrink-0 shadow-lg shadow-green-400/50" />
                  )}
                  <h3 className="font-semibold text-gray-900 truncate text-[15px] font-semibold">{route.name}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${dir.badge} text-[10px] inline-flex items-center gap-1`}>
                    {route.direction === 'to_work' ? <Building size={11} strokeWidth={2.5} /> : <Home size={11} strokeWidth={2.5} />}
                    {dir.label}
                  </span>
                  <span className="text-[10px] text-gray-300">•</span>
                  <span className="text-[10px] text-gray-400">{route.segments.length} 個路段</span>
                </div>
              </div>

              {/* Action button */}
              <div className="flex-shrink-0">
                {isActive ? (
                  <div className="flex gap-1.5">
                    <button
                      onClick={onReturn}
                      className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-xs font-semibold py-2 px-3.5 rounded-xl transition-all active:scale-90 shadow-lg shadow-blue-500/20"
                    >
                      返回
                    </button>
                    <button
                      onClick={onEnd}
                      className="bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-500 text-xs font-medium py-2 px-3 rounded-xl transition-all active:scale-90 border border-gray-200"
                    >
                      結束
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={onStart}
                    className={`bg-gradient-to-r ${dir.btn} hover:${dir.btnHover} text-white text-xs font-semibold py-2 px-4 rounded-xl transition-all active:scale-90 shadow-lg ${dir.accentGlow}`}
                  >
                    開始
                  </button>
                )}
              </div>
            </div>

            {/* Segment badges */}
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex items-center gap-1.5 flex-wrap">
                {route.segments.map((seg, index) => (
                  <div key={seg.id} className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 bg-gray-50 border border-gray-100 px-2 py-1 rounded-lg text-[11px] text-gray-600">
                      <span className="text-xs">{TRANSPORT_ICONS[seg.route.type] || '🚍'}</span>
                      <span className="font-medium">{seg.route.type === 'mtr' ? getMTRLineName(seg.route.name) : seg.route.name}</span>
                    </span>
                    {index < route.segments.length - 1 && (
                      <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
