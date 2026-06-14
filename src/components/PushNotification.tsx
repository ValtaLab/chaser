"use client";

import { useState, useEffect, useCallback } from "react";

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
    if (!("Notification" in window)) return;

    if (enabled) {
      setEnabled(false);
      localStorage.setItem(STORAGE_KEY, "false");
    } else {
      if (Notification.permission === "denied") {
        return;
      }
      const result = await Notification.requestPermission();
      if (result === "granted") {
        setEnabled(true);
        localStorage.setItem(STORAGE_KEY, "true");
      }
    }
  }, [enabled]);

  if (!mounted) {
    return <div className="w-12 h-7 rounded-full bg-gray-200 flex-shrink-0" />;
  }

  if (!supported) {
    return (
      <span className="text-xs text-gray-400">
        需加至主屏幕
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
