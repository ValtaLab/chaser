"use client";

import { useState, useEffect, useCallback } from "react";
import { subscribePush } from "./ServiceWorker注册";

const STORAGE_KEY = "chaser-notifications-enabled";

export default function PushNotification() {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const hasNotification = "Notification" in window;
    setSupported(hasNotification);
    if (hasNotification) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        setEnabled(saved === "true");
      } else {
        setEnabled(Notification.permission === "granted");
      }
    }
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (!("Notification" in window)) return;
      if (enabled) {
        setEnabled(false);
        localStorage.setItem(STORAGE_KEY, "false");
      } else {
        if (Notification.permission === "denied") {
          alert("通知權限已被封鎖，請到瀏覽器設定中允許通知");
          return;
        }
        const result = await Notification.requestPermission();
        if (result === "granted") {
          setEnabled(true);
          localStorage.setItem(STORAGE_KEY, "true");
          // Critical: permission alone does not create Web Push subscription
          try { await subscribePush(); } catch (e) { console.error('[Push] resubscribe', e); }
        }
      }
    } catch (e) {
      console.error('[PushNotification] toggle error:', e);
    }
  }, [enabled]);

  if (!mounted) {
    return <div className="w-12 h-7 rounded-full bg-gray-200 flex-shrink-0" />;
  }

  // Check if iOS but not installed as PWA
  const isIOS = typeof window !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // iPadOS desktop mode
  );
  const isStandalone = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;
  const iosNotInstalled = isIOS && !isStandalone;

  if (!supported) {
    return (
      <span className="text-xs text-gray-400">
        瀏覽器不支援通知
      </span>
    );
  }

  if (iosNotInstalled) {
    return (
      <span className="text-xs text-gray-400">
        iOS 需加至主屏幕
      </span>
    );
  }


  return (
    <button
      type="button"
      onClick={toggle}
      className="relative w-12 h-7 rounded-full transition-colors flex-shrink-0"
      style={{
        backgroundColor: enabled ? '#3b82f6' : '#d1d5db',
        overflow: 'hidden',
      }}
    >
      <span
        className="absolute w-6 h-6 bg-white rounded-full shadow transition-transform duration-200"
        style={{
          top: '2px',
          left: '2px',
          transform: enabled ? 'translateX(20px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}
