'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Square } from 'lucide-react';

const WORKER_URL = 'https://chaser-auth.isearover.workers.dev';

export interface SegmentPayload {
  id: string;
  type: string;
  name: string;
  fromStop: { id: string; nameZh: string; location: { lat: number; lng: number } };
  toStop: { id: string; nameZh: string; location: { lat: number; lng: number } };
}

interface Props {
  segments: SegmentPayload[];
  /** Called when user taps monitor toggle — parent can gate on GPS/permissions */
  disabled?: boolean;
}

export default function JourneyMonitor({ segments, disabled }: Props) {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pushSub, setPushSub] = useState<PushSubscriptionJSON | null>(null);
  const mountedRef = useRef(true);

  // Fetch push subscription on mount
  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (mountedRef.current && sub) {
          setPushSub(sub.toJSON());
        }
      } catch {}
    })();
    return () => { mountedRef.current = false; };
  }, []);

  const getToken = useCallback((): string | null => {
    try {
      const stored = localStorage.getItem('chaser_auth');
      if (!stored) return null;
      return JSON.parse(stored).token;
    } catch { return null; }
  }, []);

  const startMonitor = useCallback(async () => {
    if (!segments.length || !pushSub) return;
    const token = getToken();
    if (!token) return;

    setLoading(true);
    try {
      const res = await fetch(`${WORKER_URL}/journey/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ segments, pushSub }),
      });
      if (res.ok) setActive(true);
    } catch (e) {
      console.error('[JourneyMonitor] start error:', e);
    } finally {
      setLoading(false);
    }
  }, [segments, pushSub, getToken]);

  const stopMonitor = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    try {
      await fetch(`${WORKER_URL}/journey/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {}
    setActive(false);
    setLoading(false);
  }, [getToken]);

  if (!pushSub) return null; // No push sub = can't monitor

  return (
    <button
      type="button"
      disabled={loading || disabled}
      onClick={active ? stopMonitor : startMonitor}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
        active
          ? 'bg-green-600 text-white animate-pulse'
          : 'bg-slate-700/60 text-gray-200 hover:bg-slate-600/60'
      } disabled:opacity-50`}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : active ? (
        <Square className="w-4 h-4" />
      ) : (
        <Play className="w-4 h-4" />
      )}
      {active ? '監察中' : '開始行程監察'}
    </button>
  );
}
