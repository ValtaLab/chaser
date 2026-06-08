'use client';

import { useState, useRef, useCallback } from 'react';
import type { CommuteRoute } from '@/types';

interface SwipeableRouteCardProps {
  route: CommuteRoute;
  onStart: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function SwipeableRouteCard({ route, onStart, onEdit, onDelete }: SwipeableRouteCardProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const isDraggingRef = useRef(false);

  const ACTION_WIDTH = 160; // 2 buttons × 80px
  const THRESHOLD = 80;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = e.touches[0].clientX;
    isDraggingRef.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;

    currentXRef.current = e.touches[0].clientX;
    const diff = currentXRef.current - startXRef.current;

    // Only allow swipe left
    if (diff > 0 && !isRevealed) return;

    const newOffset = isRevealed
      ? Math.min(0, Math.max(-ACTION_WIDTH, -ACTION_WIDTH + diff))
      : Math.min(0, Math.max(-ACTION_WIDTH, diff));

    setOffsetX(newOffset);
  }, [isRevealed]);

  const handleTouchEnd = useCallback(() => {
    isDraggingRef.current = false;

    if (offsetX < -THRESHOLD) {
      setOffsetX(-ACTION_WIDTH);
      setIsRevealed(true);
    } else {
      setOffsetX(0);
      setIsRevealed(false);
    }
  }, [offsetX]);

  // Mouse events for desktop testing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    startXRef.current = e.clientX;
    currentXRef.current = e.clientX;
    isDraggingRef.current = true;

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
    <div className="relative" style={{ minHeight: 80 }}>
      {/* Action buttons (behind the card) */}
      <div className="absolute right-0 top-0 bottom-0 flex" style={{ width: ACTION_WIDTH }}>
        <button
          onClick={handleEdit}
          className="w-20 bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors"
        >
          <div className="text-center">
            <span className="text-xl">✏️</span>
            <p className="text-xs mt-1">編輯</p>
          </div>
        </button>
        <button
          onClick={handleDelete}
          className="w-20 bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-colors"
        >
          <div className="text-center">
            <span className="text-xl">🗑️</span>
            <p className="text-xs mt-1">刪除</p>
          </div>
        </button>
      </div>

      {/* Main card (slides left) */}
      <div
        className="absolute inset-0 z-10 bg-slate-800 border border-white/10 rounded-lg p-4 transition-transform"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDraggingRef.current ? 'none' : 'transform 0.2s ease-out',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-white truncate">{route.name}</p>
            <p className="text-sm text-gray-400">
              {route.direction === 'to_work' ? '🏢 返工' : '🏠 放工'} • 
              {route.segments.length} 個路段
            </p>
          </div>
          <button
            onClick={onStart}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors flex-shrink-0 ml-3"
          >
            開始
          </button>
        </div>

        {/* Route segments preview */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {route.segments.map((seg, index) => {
            const icons: Record<string, string> = {
              bus: '🚌', mtr: '🚇', minibus: '🚐', tram: '🚊', ferry: '⛴️'
            };
            return (
              <div key={seg.id} className="flex items-center gap-1">
                <span className="bg-white/10 text-white text-xs px-2 py-1 rounded">
                  {icons[seg.route.type] || '🚍'} {seg.route.name}
                </span>
                {index < route.segments.length - 1 && (
                  <span className="text-gray-500">→</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
